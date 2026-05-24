import { UserPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────────
// BulkActionsBar — floating contextual action surface that appears
// when the user has selected one or more rows in the orders table.
//
// Pattern: Linear / Stripe-style sticky bar that slides up from the
// bottom of the viewport. Renders ONLY when count > 0 so the table
// stays uncluttered in steady state; appears in front of pagination
// because it's higher-priority context (user has a pending action).
//
// Today this carries a single primary action (Assign to agent) plus
// a Clear button. Future bulk actions (e.g. bulk tag, bulk cancel)
// would slot in as additional buttons on the right side; the bar's
// presence is gated solely by `count > 0`.
//
// Accessibility:
//   • role="region" + aria-label so screen readers announce
//     "N selected, action region" when it appears.
//   • The Clear button is keyboard-reachable; pressing Esc on any
//     row in the table also clears the selection (handled by the
//     parent).
// ─────────────────────────────────────────────────────────────────────

interface BulkActionsBarProps {
  /** Number of currently-selected rows. The bar renders iff count > 0. */
  count: number;
  /** Fires when the user clicks "Assign to agent". The parent opens
   *  the BulkAssignDialog with the current selection set. */
  onAssign: () => void;
  /** Fires when the user clicks "Clear" or the X. Should empty the
   *  selection Set in the parent. */
  onClear: () => void;
  /** Extra spacing when the table sits inside a tight container.
   *  Default sticks the bar 1rem above the viewport bottom. */
  className?: string;
}

export function BulkActionsBar({
  count,
  onAssign,
  onClear,
  className,
}: BulkActionsBarProps) {
  if (count <= 0) return null;

  return (
    <div
      // sticky+bottom positions it relative to the scrollable
      // container (the orders page). `pointer-events-none` on the
      // wrapper + `pointer-events-auto` on the bar itself means
      // clicks elsewhere on the page still work — the bar isn't a
      // modal overlay.
      className={cn(
        "sticky bottom-4 z-40 flex justify-center pointer-events-none",
        className,
      )}
      role="region"
      aria-label={`${count} order${count === 1 ? "" : "s"} selected`}
      data-testid="bulk-actions-bar"
    >
      <div
        className={cn(
          "pointer-events-auto",
          "inline-flex items-center gap-3 rounded-lg",
          "bg-foreground text-background",
          "shadow-lg ring-1 ring-foreground/10",
          "px-3 py-2",
        )}
      >
        {/* Selection count + label. tabular-nums on the count so
            "1 selected" → "12 selected" → "121 selected" line up
            without jumping pixels. */}
        <span
          className="text-sm font-medium tabular-nums"
          data-testid="bulk-actions-count"
        >
          {count} selected
        </span>
        <span className="h-4 w-px bg-background/30" aria-hidden />
        {/* Primary action. variant="secondary" reads well against
            the dark bar — primary would be too loud (it's already
            sitting on the highest-contrast surface in the app). */}
        <Button
          variant="secondary"
          size="sm"
          onClick={onAssign}
          className="gap-1.5 h-8"
          data-testid="button-bulk-assign-open"
        >
          <UserPlus className="h-4 w-4" />
          Assign to agent
        </Button>
        {/* Clear: ghost button on dark surface needs an explicit
            hover/focus state since the default uses muted tokens
            that disappear here. */}
        <Button
          variant="ghost"
          size="sm"
          onClick={onClear}
          className="h-8 text-background/80 hover:text-background hover:bg-background/10"
          data-testid="button-bulk-clear"
        >
          <X className="h-4 w-4 mr-1" />
          Clear
        </Button>
      </div>
    </div>
  );
}
