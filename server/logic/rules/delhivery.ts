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

// Maps Delhivery's official Scan-Push (StatusType, Status) combinations to our
// canonical statuses. From the Delhivery webhook docs:
//
//   FORWARD                 RETURN (RTO)            REVERSE (RVP / customer return)
//   UD / Manifested          RT / In Transit         PP / Open|Scheduled|Dispatched
//   UD / Not Picked          RT / Pending            PU / In Transit|Pending|Dispatched
//   UD / In Transit          RT / Dispatched         DL / DTO (Delivered To Origin)
//   UD / Pending             DL / RTO                 CN / Canceled|Closed
//   UD / Dispatched
//   DL / Delivered
//
// The StatusType macro (UD/DL/RT/PP/PU/CN) decides the leg; the Status sub-word
// decides the stage. Critically, DL covers THREE different outcomes — Delivered
// (real), RTO (returned to seller), DTO (reverse pickup received at origin) —
// so the Status word MUST be inspected, never assumed "delivered".
export function normalizeDelhivery(payload: DelhiveryPayload): NormalizedStatus {
  const rawType = (payload.Shipment?.Status?.StatusType || '').toUpperCase().trim();
  const statusText = payload.Shipment?.Status?.Status || '';
  const s = statusText.toLowerCase().trim();
  const instr = (payload.Shipment?.Status?.Instructions || '').toLowerCase();
  const nsl = payload.Shipment?.Status?.NSLCode || payload.Shipment?.NSLCode || '';

  // Accept both the 2-letter codes Delhivery sends and their expanded forms.
  // Order matters: "UNDELIVERED" contains "DELIVER", so resolve UD before DL.
  const isUD = rawType === 'UD' || rawType.includes('UNDELIVER');
  const isRT = rawType === 'RT' || rawType.includes('RETURN');
  const isPP = rawType === 'PP' || rawType.includes('MANIFEST') || rawType.includes('PENDING PICKUP');
  const isPU = rawType === 'PU' || (rawType.includes('PICK') && rawType.includes('UP'));
  const isCN = rawType === 'CN' || rawType.includes('CANCEL');
  const isDL = rawType === 'DL' || (rawType.includes('DELIVER') && !isUD);

  // Lost / damaged / untraceable can surface under any StatusType.
  const looksLost = (x: string) => x.includes('lost') || x.includes('untraceable') || x.includes('damaged');
  if (looksLost(s) || looksLost(instr)) {
    return { status: 'lost', isActionable: false };
  }

  // DL — disambiguate the three delivery outcomes by the Status word.
  if (isDL) {
    // DTO = Delivered To Origin (reverse pickup received) and RTO = Returned
    // To Origin both mean "back at the warehouse" → rto_delivered (NOT delivered).
    if (s.includes('dto') || s.includes('rto') || s.includes('return') || instr.includes('return')) {
      return { status: 'rto_delivered', isActionable: false };
    }
    return { status: 'delivered', isActionable: false };
  }

  // RT — RTO leg moving back to the seller.
  if (isRT) {
    if (s.includes('dispatch') || s.includes('out for delivery') || instr.includes('out for delivery')) {
      return { status: 'rto_ofd', isActionable: false }; // RT / Dispatched
    }
    return { status: 'rto_initiated', isActionable: false }; // RT / In Transit | Pending
  }

  // PP — reverse pickup pending/scheduled (Open / Scheduled / Dispatched).
  if (isPP) {
    return { status: 'ready_for_pickup', isActionable: false };
  }

  // PU — reverse parcel picked up from the customer (In Transit / Pending / Dispatched).
  if (isPU) {
    return { status: 'picked_up', isActionable: false };
  }

  // CN — cancelled / closed.
  if (isCN) {
    return { status: 'cancelled', isActionable: false };
  }

  // UD — forward leg.
  if (isUD) {
    if (s.includes('manifest')) {
      return { status: 'awb_assigned', isActionable: false }; // UD / Manifested
    }
    if (s.includes('not picked')) {
      return { status: 'ready_for_pickup', isActionable: false }; // UD / Not Picked
    }
    if (s.includes('dispatch') || instr.includes('out for delivery')) {
      return { status: 'out_for_delivery', isActionable: false }; // UD / Dispatched
    }
    if (s.includes('pending')) {
      // UD / Pending = a failed/undelivered attempt (NDR). Actionable when the
      // NSL code matches a known customer-action reason.
      return { status: 'ndr', isActionable: ACTIONABLE_CODES.includes(nsl) };
    }
    if (s.includes('in transit') || s.includes('in-transit')) {
      return { status: 'in_transit', isActionable: false }; // UD / In Transit
    }
    // Fallback: an actionable NSL still means NDR; otherwise treat as transit.
    if (ACTIONABLE_CODES.includes(nsl)) {
      return { status: 'ndr', isActionable: true };
    }
    return { status: 'in_transit', isActionable: false };
  }

  // Unknown type — safe default (never 'delivered').
  return { status: 'in_transit', isActionable: false };
}

export { ACTIONABLE_CODES };
