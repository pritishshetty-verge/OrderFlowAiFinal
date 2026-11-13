// What the user is looking at, for Flo's (Ops Copilot) page context.
//
// Pages call setCopilotFocus() when a specific record is open (e.g. an
// order in the preview pane) and clear it on close; the panel reads it at
// send time so "why is this order stuck?" resolves to that order.
//
// The last record stays available as "recent" for a few minutes after it
// closes: clicking into Flo dismisses a modal preview, and "this order"
// should still mean the one the user was just looking at.

const RECENT_MS = 10 * 60 * 1000;

let current: string | null = null;
let recent: { label: string; at: number } | null = null;

export function setCopilotFocus(label: string | null): void {
  if (label) recent = { label, at: Date.now() };
  else if (current && recent?.label === current) recent = { label: current, at: Date.now() };
  current = label;
}

export function getCopilotFocus(): { open: string | null; recent: string | null } {
  const fresh = recent && Date.now() - recent.at < RECENT_MS ? recent.label : null;
  return { open: current, recent: current ? null : fresh };
}
