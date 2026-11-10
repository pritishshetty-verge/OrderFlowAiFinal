// Confirm card for a Flo action proposal.
import { AlertTriangle, Check, Loader2, X } from "lucide-react";
import { type ActionCardData, isExpired } from "./actions";

const RISK_STYLE: Record<string, string> = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  high: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-200",
};

export function ActionCard({
  card,
  busy,
  onConfirm,
  onDismiss,
}: {
  card: ActionCardData;
  busy: boolean;
  onConfirm: () => void;
  onDismiss: () => void;
}) {
  const expired = card.state === "pending" && isExpired(card);
  const settled = card.state !== "pending" && card.state !== "running";
  return (
    <div
      data-flo-action={card.action}
      className="mt-2 w-full rounded-xl border border-border bg-background p-3 text-sm shadow-sm"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="font-medium text-foreground">{card.title}</div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${RISK_STYLE[card.risk]}`}>
          {card.risk === "high" ? "High impact" : card.risk === "medium" ? "Check" : "Low risk"}
        </span>
      </div>
      <dl className="mt-2 space-y-1">
        {card.details.map((d, i) => (
          <div key={i} className="grid grid-cols-[88px_1fr] gap-2 text-xs">
            <dt className="text-muted-foreground">{d.label}</dt>
            <dd className="break-words text-foreground">{d.value}</dd>
          </div>
        ))}
        {card.requests.length > 1 && (
          <div className="grid grid-cols-[88px_1fr] gap-2 text-xs">
            <dt className="text-muted-foreground">Steps</dt>
            <dd className="text-foreground">{card.requests.length} requests, run one after another</dd>
          </div>
        )}
      </dl>
      {card.warning && (
        <div className="mt-2 flex items-start gap-1.5 rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{card.warning}</span>
        </div>
      )}

      {card.state === "pending" && !expired && (
        <div className="mt-3 flex gap-2">
          <button
            onClick={onConfirm}
            disabled={busy}
            className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-medium text-white transition disabled:opacity-50 ${
              card.risk === "high" ? "bg-red-600 hover:bg-red-700" : "bg-primary hover:opacity-90"
            }`}
          >
            Confirm
          </button>
          <button
            onClick={onDismiss}
            disabled={busy}
            className="rounded-lg border border-border px-3 py-1.5 text-xs text-foreground transition hover:bg-muted disabled:opacity-50"
          >
            Dismiss
          </button>
        </div>
      )}
      {expired && <div className="mt-2 text-xs text-muted-foreground">Expired — ask Flo again if you still want this.</div>}
      {card.state === "running" && (
        <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Running…
        </div>
      )}
      {settled && (
        <div
          className={`mt-2 flex items-start gap-1.5 text-xs ${
            card.state === "done" ? "text-emerald-700 dark:text-emerald-400" : card.state === "dismissed" ? "text-muted-foreground" : "text-destructive"
          }`}
        >
          {card.state === "done" ? <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <X className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
          <span>
            {card.state === "done" ? "Done" : card.state === "partial" ? "Partly done" : card.state === "dismissed" ? "Dismissed" : "Failed"}
            {card.outcome ? ` — ${card.outcome}` : ""}
          </span>
        </div>
      )}
    </div>
  );
}
