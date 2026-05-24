import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { LucideIcon } from "lucide-react";

// ─────────────────────────────────────────────────────────────────────
// EmptyState — single source of truth for "there's nothing to show here yet"
// surfaces across the app.
//
// Replaces every bare `<p>No X yet</p>` with a properly-spaced layout
// that reads as deliberate-empty, not broken. Pattern mirrors
// Linear / Stripe / Vercel empty states:
//
//   • Muted icon at 40px — present but quiet
//   • Title at text-base font-semibold (the section's own copy)
//   • Description in muted-foreground, max width capped so long
//     prose doesn't sprawl across wide containers
//   • Optional outline-variant CTA — never the page's primary
//     style, so it doesn't compete with header buttons
//
// Variants:
//   size="sm" — for in-dialog or in-card empties (smaller padding)
//   size="md" — default; for page sections
//
// Why outline variant on the action: when an empty state lives inside
// a panel that already has a primary CTA in its header (e.g. "Sync
// orders now" on the Shopify card), making the empty-state action
// also primary creates two competing CTAs at the same scan position.
// Outline keeps the visual hierarchy clean.
// ─────────────────────────────────────────────────────────────────────

interface EmptyStateAction {
  label: string;
  onClick: () => void;
  loading?: boolean;
}

interface EmptyStateProps {
  /** Lucide icon component — rendered at 40px with muted opacity. */
  icon?: LucideIcon;
  /** Section's own copy. Keep under ~6 words. */
  title: string;
  /** One-line explanation, optional second clause. Max ~18 words. */
  description?: string;
  /** Optional primary action that resolves the empty state. */
  action?: EmptyStateAction;
  /** Optional secondary action — rare, but useful for "Learn more". */
  secondaryAction?: EmptyStateAction;
  /** Vertical padding scale. `sm` for in-dialog usage. */
  size?: "sm" | "md";
  /** Extra classes (e.g. min-height to anchor a full-page empty). */
  className?: string;
  /** Test id for snapshot tests. */
  testId?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  secondaryAction,
  size = "md",
  className,
  testId,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        size === "sm" ? "py-8 px-4" : "py-12 px-6",
        className,
      )}
      data-testid={testId}
    >
      {Icon && (
        <div
          className={cn(
            "rounded-full bg-muted/60 flex items-center justify-center",
            size === "sm" ? "h-12 w-12 mb-3" : "h-14 w-14 mb-4",
          )}
          aria-hidden
        >
          <Icon
            className={cn(
              "text-muted-foreground/70",
              size === "sm" ? "h-5 w-5" : "h-6 w-6",
            )}
          />
        </div>
      )}
      <h3
        className={cn(
          "font-semibold text-foreground",
          size === "sm" ? "text-sm" : "text-base",
        )}
      >
        {title}
      </h3>
      {description && (
        <p
          className={cn(
            "mt-1 text-muted-foreground max-w-sm",
            size === "sm" ? "text-xs leading-relaxed" : "text-sm leading-relaxed",
          )}
        >
          {description}
        </p>
      )}
      {(action || secondaryAction) && (
        <div className="flex items-center gap-2 mt-5">
          {action && (
            <Button
              variant="outline"
              size={size === "sm" ? "sm" : "default"}
              onClick={action.onClick}
              disabled={action.loading}
              data-testid={testId ? `${testId}-action` : undefined}
            >
              {action.loading ? "Working…" : action.label}
            </Button>
          )}
          {secondaryAction && (
            <Button
              variant="ghost"
              size={size === "sm" ? "sm" : "default"}
              onClick={secondaryAction.onClick}
              disabled={secondaryAction.loading}
              data-testid={testId ? `${testId}-secondary` : undefined}
            >
              {secondaryAction.label}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
