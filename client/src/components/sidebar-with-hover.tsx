import { useCallback, useEffect, useRef, useState } from "react";
import { SidebarProvider } from "@/components/ui/sidebar";

// ─────────────────────────────────────────────────────────────────────
// SidebarWithHover
//
// A thin controlled wrapper around shadcn's SidebarProvider that adds
// hover-to-expand behaviour on top of the standard click-to-toggle:
//
//   • Explicit toggle (SidebarTrigger in the header, ctrl/cmd+B):
//     sets the USER preference — collapsed or expanded — which we
//     honour when the cursor is not near the sidebar.
//
//   • Hover: while the pointer is over the sidebar rail, force the
//     sidebar OPEN regardless of preference. On mouse-leave, snap
//     back to preference after a short delay so quick pointer
//     drift-bys don't cause it to close mid-interaction.
//
// The user preference is stored in the same cookie SidebarProvider
// uses, so a refresh keeps the last explicit choice.
// ─────────────────────────────────────────────────────────────────────

const HOVER_OPEN_DELAY_MS = 120; // wait a hair before opening on hover
const HOVER_CLOSE_DELAY_MS = 380; // grace period before collapsing again
const COOKIE_NAME = "sidebar_state";

function readCookiePref(): boolean {
  if (typeof document === "undefined") return true;
  const match = document.cookie.match(new RegExp(`(^|;\\s*)${COOKIE_NAME}=([^;]+)`));
  return match ? match[2] !== "false" : true;
}

interface Props {
  children: React.ReactNode;
  style?: React.CSSProperties;
}

export function SidebarWithHover({ children, style }: Props) {
  // The user's persisted preference (click-driven).
  const [pref, setPref] = useState<boolean>(true);
  // Effective open state: pref OR temporarily hovered-open.
  const [open, setOpen] = useState<boolean>(true);
  const [hovered, setHovered] = useState(false);
  const openTimer = useRef<number | null>(null);
  const closeTimer = useRef<number | null>(null);

  // Restore the persisted preference once on mount.
  useEffect(() => {
    const p = readCookiePref();
    setPref(p);
    setOpen(p);
  }, []);

  // When neither hovered nor mid-timeout, effective open = preference.
  useEffect(() => {
    if (!hovered) setOpen(pref);
  }, [pref, hovered]);

  const clearTimers = () => {
    if (openTimer.current) window.clearTimeout(openTimer.current);
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    openTimer.current = null;
    closeTimer.current = null;
  };

  const onMouseEnter = useCallback(() => {
    clearTimers();
    // Only expand on hover if the user's preference is collapsed —
    // when the sidebar is already open there's nothing to do.
    if (pref) return;
    openTimer.current = window.setTimeout(() => {
      setHovered(true);
      setOpen(true);
    }, HOVER_OPEN_DELAY_MS);
  }, [pref]);

  const onMouseLeave = useCallback(() => {
    clearTimers();
    closeTimer.current = window.setTimeout(() => {
      setHovered(false);
      setOpen(pref); // snap back to whatever the user last chose
    }, HOVER_CLOSE_DELAY_MS);
  }, [pref]);

  // SidebarProvider's onOpenChange fires from the header trigger / cmd+B.
  // Treat those as an explicit user preference update.
  const onOpenChange = useCallback((next: boolean) => {
    setPref(next);
    setOpen(next);
    setHovered(false);
  }, []);

  return (
    <SidebarProvider open={open} onOpenChange={onOpenChange} style={style}>
      <div
        className="contents"
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      >
        {children}
      </div>
    </SidebarProvider>
  );
}
