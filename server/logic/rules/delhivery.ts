export interface DelhiveryPayload {
  Shipment: {
    Status: {
      StatusType?: string;
      Status?: string;
      Instructions?: string;
      NSLCode?: string;
    };
    NSLCode?: string;
  };
}

// Output keys are a subset of SHIPPING_STATUSES (shared/schema.ts). The
// downstream unified mapper validates and falls back, so this stays in lock-step
// with the canonical list without importing it here.
export interface NormalizedStatus {
  status:
    | 'unfulfilled'
    | 'cancelled'
    | 'awb_assigned'
    | 'ready_for_pickup'
    | 'picked_up'
    | 'in_transit'
    | 'out_for_delivery'
    | 'ndr'
    | 'delivered'
    | 'rto_initiated'
    | 'rto_ofd'
    | 'rto_delivered'
    | 'lost';
  isActionable: boolean;
}

const ACTIONABLE_CODES = [
  "EOD-74",  // Customer Unavailable
  "EOD-15",  // Address Issue
  "EOD-104", // Customer Requested Reschedule
  "EOD-43",  // Customer Not Reachable
  "EOD-86",  // Incomplete Address
  "EOD-11",  // Customer Refused
  "EOD-69",  // COD Amount Not Ready
  "EOD-6",   // Out of Delivery Area
];

export function normalizeDelhivery(payload: DelhiveryPayload): NormalizedStatus {
  // Normalize StatusType to uppercase for consistent matching
  const type = (payload.Shipment?.Status?.StatusType || '').toUpperCase();
  const statusText = payload.Shipment?.Status?.Status || '';
  const statusLower = statusText.toLowerCase();
  const instr = (payload.Shipment?.Status?.Instructions || '').toLowerCase();
  const nsl = payload.Shipment?.Status?.NSLCode || payload.Shipment?.NSLCode || '';

  // "Lost"/"Damaged"/"Untraceable" can surface under several StatusTypes, so
  // check it before the per-type branches.
  const looksLost = (s: string) =>
    s.includes('lost') || s.includes('untraceable') || s.includes('damaged');
  if (looksLost(statusLower) || looksLost(instr)) {
    return { status: 'lost', isActionable: false };
  }

  // 1. Handle RTO Delivered (The "DL" Trap)
  if (type === 'DL') {
    if (statusLower.includes('rto') || instr.includes('return')) {
      return { status: 'rto_delivered', isActionable: false };
    }
    return { status: 'delivered', isActionable: false };
  }

  // 2. Handle RTO lifecycle — split out RTO Out-for-Delivery from RTO transit.
  if (type === 'RT') {
    if (instr.includes('out for delivery') || statusLower.includes('out for delivery')) {
      return { status: 'rto_ofd', isActionable: false };
    }
    return { status: 'rto_initiated', isActionable: false };
  }

  // 3. Pickup lifecycle
  if (type === 'PU') {
    return { status: 'picked_up', isActionable: false };
  }
  // Manifested / pending-pickup — AWB created, parcel not yet collected.
  if (type === 'PP' || type === 'MN' || statusLower.includes('manifest')) {
    if (statusLower.includes('pickup') || instr.includes('pickup')) {
      return { status: 'ready_for_pickup', isActionable: false };
    }
    return { status: 'awb_assigned', isActionable: false };
  }

  // 4. Explicit cancellation
  if (type === 'CN' || statusLower.includes('cancel')) {
    return { status: 'cancelled', isActionable: false };
  }

  // 5. Handle UD (The "Catch-All" Status)
  if (type === 'UD') {
    // A. Check for Out for Delivery (Priority)
    if (instr.includes('out for delivery')) {
      return { status: 'out_for_delivery', isActionable: false };
    }

    // B. Check for Actionable NDR (Strict Whitelist)
    if (ACTIONABLE_CODES.includes(nsl)) {
      return { status: 'ndr', isActionable: true };
    }

    // C. Non-Actionable Failure / Transit Scan
    return { status: 'in_transit', isActionable: false };
  }

  // 6. Default Fallback for other status types (IT, etc.)
  return { status: 'in_transit', isActionable: false };
}

export { ACTIONABLE_CODES };
