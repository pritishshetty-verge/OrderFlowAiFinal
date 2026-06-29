import { cn } from "@/lib/utils";

interface EmptyStateProps {
  /** Lucide (or any) icon component. Renders inside a soft tinted circle. */
  icon?: React.ComponentType<{ className?: string }>;
  /** One-line headline. */
  title: string;
  /** Optional sub-line. Two lines max — keep it scannable. */
  description?: string;
  /** Optional action slot — usually a Button. */
  action?: React.ReactNode;
  className?: string;
}

/**
 * Shared empty-state for tables, lists, and panels. Replaces bare
 * "No X" text with: tinted icon disc + headline + sub + optional CTA.
 * Use anywhere a list/table can be empty for a more polished surface.
 */
export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center text-center px-6 py-10", className)}>
      {Icon && (
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-brand/10 text-brand mb-4">
          <Icon className="h-6 w-6" />
        </span>
      )}
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description && (
        <p className="mt-1 text-xs text-muted-foreground max-w-sm leading-relaxed">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
