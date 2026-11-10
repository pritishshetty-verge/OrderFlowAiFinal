// Flo action proposals on the client: allowlist + executor.
//
// The server builds each proposal; the user confirms it here; the browser
// then calls the same endpoints the app's own buttons call, with the user's
// session. The allowlist is belt-and-braces: a proposal can only ever hit
// these exact endpoint shapes.

export type Risk = "low" | "medium" | "high";
export interface ActionRequest {
  method: "POST" | "PATCH" | "PUT";
  path: string;
  body?: Record<string, any>;
  label?: string;
}
export interface ActionProposal {
  id: string;
  action: string;
  title: string;
  risk: Risk;
  details: { label: string; value: string }[];
  warning?: string;
  requests: ActionRequest[];
  expiresAt: string;
}
export type ActionState = "pending" | "running" | "done" | "partial" | "failed" | "dismissed";
export interface ActionCardData extends ActionProposal {
  state: ActionState;
  outcome?: string;
}

const ALLOWED: [ActionRequest["method"], RegExp][] = [
  ["POST", /^\/api\/orders\/[\w-]+\/(confirm|cancel|followup|assign)$/],
  ["POST", /^\/api\/orders\/bulk-assign$/],
  ["PATCH", /^\/api\/orders\/[\w-]+$/],
  ["POST", /^\/api\/ndr\/[^/?#]+\/reattempt$/],
  ["POST", /^\/api\/admin\/orders\/[\w-]+\/resync-tracking\?currentUserId=[\w-]+$/],
  ["POST", /^\/api\/admin\/reconcile-shipment-status\?currentUserId=[\w-]+$/],
  ["POST", /^\/api\/calls\/initiate$/],
  ["POST", /^\/api\/reshipments\?userId=[\w-]+$/],
  ["PATCH", /^\/api\/abandoned-checkouts\/\d+\/status$/],
  ["POST", /^\/api\/returns\/[\w-]+\/approve-pickup$/],
  ["PATCH", /^\/api\/returns\/[\w-]+\/status$/],
  ["PATCH", /^\/api\/leave-requests\/[\w-]+$/],
  ["POST", /^\/api\/payroll\/cycles\/[\w-]+\/approve$/],
  ["POST", /^\/api\/shopify\/sync$/],
  ["POST", /^\/api\/recon\/send-digest$/],
];

export const isAllowed = (r: ActionRequest) =>
  ALLOWED.some(([m, re]) => m === r.method && re.test(r.path));

export const isExpired = (p: ActionProposal) => Date.now() > new Date(p.expiresAt).getTime();

/** Validate a proposal received over SSE / from storage. */
export function isProposal(x: any): x is ActionProposal {
  return (
    x && typeof x.id === "string" && typeof x.title === "string" && typeof x.action === "string" &&
    ["low", "medium", "high"].includes(x.risk) && Array.isArray(x.details) &&
    Array.isArray(x.requests) && x.requests.length > 0 && x.requests.length <= 50 &&
    x.requests.every((r: any) => r && typeof r.path === "string" && ["POST", "PATCH", "PUT"].includes(r.method))
  );
}

interface StepResult {
  path: string;
  label?: string;
  status: number;
  ok: boolean;
  error?: string;
  json?: any;
}

function describe(action: string, steps: StepResult[]): string {
  const j = steps[0]?.json ?? {};
  switch (action) {
    case "assign_orders": {
      const rs: any[] = Array.isArray(j.results) ? j.results : [];
      const ok = rs.filter((r) => r.success).length;
      return rs.length ? `${ok} of ${rs.length} assigned` : "";
    }
    case "shopify_sync":
      return j.syncedCount != null ? `${j.syncedCount} new, ${j.skippedCount ?? 0} already there${j.hasMore ? " (more available — run again)" : ""}` : "";
    case "resync_tracking":
      return j.newStatus ? `${j.previousStatus ?? "?"} → ${j.newStatus}` : "";
    case "reconcile_statuses":
      return j.scanned != null ? `${j.updated ?? 0} updated of ${j.scanned} checked` : "";
    case "create_reshipment":
      return j.newShopifyOrderName ? `new order ${j.newShopifyOrderName}` : "";
    case "approve_return_pickup":
      return j.awb ? `pickup AWB ${j.awb}` : "";
    case "send_recon_digest":
      return j.recipientCount != null ? `sent to ${j.recipientCount} recipient(s)` : "";
    default:
      return steps.length > 1 ? `${steps.filter((s) => s.ok).length} of ${steps.length} succeeded` : "";
  }
}

/** Run a confirmed proposal step by step. Never throws. */
export async function executeProposal(
  p: ActionProposal,
  storeId: string | null,
): Promise<{ state: ActionState; outcome: string; steps: StepResult[]; ms: number }> {
  const t0 = Date.now();
  const steps: StepResult[] = [];
  if (!p.requests.every(isAllowed)) {
    return { state: "failed", outcome: "Blocked: this action isn't on Flo's allow-list.", steps, ms: 0 };
  }
  for (const r of p.requests) {
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (storeId) headers["X-Active-Store-Id"] = storeId;
      const res = await fetch(r.path, {
        method: r.method,
        headers,
        credentials: "include",
        body: JSON.stringify(r.body ?? {}),
      });
      const text = await res.text();
      let json: any = null;
      try { json = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
      const softFail = json && (json.success === false || json.ok === false);
      const ok = res.ok && !softFail;
      steps.push({
        path: r.path, label: r.label, status: res.status, ok, json,
        error: ok ? undefined : String(json?.error ?? json?.message ?? json?.details ?? text ?? `HTTP ${res.status}`).slice(0, 300),
      });
    } catch (e: any) {
      steps.push({ path: r.path, label: r.label, status: 0, ok: false, error: e?.message ?? "Network error" });
    }
  }
  const okCount = steps.filter((s) => s.ok).length;
  let state: ActionState = okCount === steps.length ? "done" : okCount === 0 ? "failed" : "partial";
  // Bulk assign reports per-order failures inside a 200.
  if (p.action === "assign_orders" && state === "done") {
    const rs: any[] = steps[0]?.json?.results ?? [];
    const bad = rs.filter((x) => !x.success).length;
    if (bad) state = bad === rs.length ? "failed" : "partial";
  }
  const failures = steps.filter((s) => !s.ok).map((s) => `${s.label ? `${s.label}: ` : ""}${s.error}`);
  const outcome = [describe(p.action, steps), failures.slice(0, 3).join("; ")].filter(Boolean).join(" · ");
  return { state, outcome, steps, ms: Date.now() - t0 };
}

/** One-line chat note so the next turn of the conversation knows what happened. */
export function outcomeLine(p: ActionProposal, state: ActionState, outcome: string): string {
  const head =
    state === "done" ? "✅ Done" : state === "partial" ? "⚠️ Partly done" : state === "dismissed" ? "✖️ Dismissed" : "❌ Failed";
  return `${head}: ${p.title}${outcome ? ` — ${outcome}` : ""}`;
}
