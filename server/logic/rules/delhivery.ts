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

export interface NormalizedStatus {
  status: 'unfulfilled' | 'cancelled' | 'ready_to_ship' | 'in_transit' | 'out_for_delivery' | 'ndr' | 'delivered' | 'rto_initiated' | 'rto_delivered';
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
  const instr = (payload.Shipment?.Status?.Instructions || '').toLowerCase();
  const nsl = payload.Shipment?.Status?.NSLCode || payload.Shipment?.NSLCode || '';

  // 1. Handle RTO Delivered (The "DL" Trap)
  if (type === 'DL') {
    if (statusText.toLowerCase().includes('rto') || instr.includes('return')) {
      return { status: 'rto_delivered', isActionable: false };
    }
    return { status: 'delivered', isActionable: false };
  }

  // 2. Handle RTO Initiated
  if (type === 'RT') {
    return { status: 'rto_initiated', isActionable: false };
  }

  // 3. Handle UD (The "Catch-All" Status)
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

  // 4. Default Fallback for other status types (IT, PU, etc.)
  return { status: 'in_transit', isActionable: false };
}

export { ACTIONABLE_CODES };
