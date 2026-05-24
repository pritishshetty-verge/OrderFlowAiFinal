import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────────
// SettingsCard — section container for the Settings pages.
//
// Design intent (post UI debt report): drop the nested <Card>
// border. The Settings tabs already provide page-level container
// chrome via the Tabs/TabsContent shell; wrapping every section in
// its own bordered Card created the "Russian doll" look — too many
// concentric edges.
//
// New presentation:
//   • A single hairline divider above the section title (except the
//     first section, which sits flush with the tab header).
//   • Bold section title + muted description, both in the type
//     scale from the design system.
//   • Generous top padding so adjacent sections breathe; whitespace
//     is the grouping mechanism rather than borders.
//
// Optional `bordered` prop lets a caller opt back in to the v1
// boxed look (e.g. Workspace branding, where the live-preview tile
// benefits from a contained box). Default is the no-border look.
// ─────────────────────────────────────────────────────────────────────

interface SettingsCardProps {
  icon?: LucideIcon;
  iconImg?: string;
  title: string;
  description?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
  testId?: string;
  /** Opt-in to the legacy bordered-card presentation. Used when the
   *  section's contents would otherwise feel ungrouped. */
  bordered?: boolean;
}

export function SettingsCard({
  icon: Icon,
  iconImg,
  title,
  description,
  children,
  action,
  testId,
  bordered = false,
}: SettingsCardProps) {
  return (
    <section
      data-testid={testId}
      className={cn(
        // Stack rhythm: sections separate via whitespace + an
        // optional hairline above. The first-of-type modifier hides
        // the divider on the topmost section so it doesn't add
        // unnecessary visual noise at the top of the tab pane.
        "pt-6 first:pt-0 border-t border-border first:border-t-0",
        bordered &&
          // Bordered mode brings back the v1 Card look but keeps the
          // new design tokens (8px radius, soft shadow, no double
          // border thanks to the `first:border-t-0` rule above being
          // overridden by the explicit `border` here).
          "rounded-lg border bg-card shadow-sm p-5 pt-5",
      )}
    >
      <header className={cn(bordered ? "mb-4" : "mb-4")}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              {iconImg ? (
                <img
                  src={iconImg}
                  alt={title}
                  className="h-5 w-5 object-contain"
                />
              ) : Icon ? (
                <Icon className="h-4 w-4 text-muted-foreground" aria-hidden />
              ) : null}
              <h2 className="text-base font-semibold tracking-tight text-foreground">
                {title}
              </h2>
            </div>
            {description && (
              <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
                {description}
              </p>
            )}
          </div>
          {action && <div className="flex-shrink-0">{action}</div>}
        </div>
      </header>
      <div>{children}</div>
    </section>
  );
}
