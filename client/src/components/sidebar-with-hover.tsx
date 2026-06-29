import { useEffect, useRef, useState } from "react";
import { SidebarProvider } from "@/components/ui/sidebar";

/**
 * SidebarProvider variant that adds **hover-to-expand** on top of the
 * shadcn primitive's icon-collapse mode.
 *
 *   - `pinned`   = user's persisted preference (localStorage). Toggled
 *                  by the rail click / SidebarTrigger / Ctrl+B shortcut.
 *   - `hovering` = transient, lives only while the cursor is over the
 *                  collapsed sidebar.
 *   - effective `open` = pinned || hovering.
 *
 * Net: when pinned-open, the sidebar stays wide (hover has no effect).
 * When pinned-collapsed (icon mode), mousing over expands it; mousing
 * out collapses it back. Identical UX to Linear/Notion.
 */
export function SidebarWithHover({
  children,
  style,
  storageKey = "of-sidebar-pinned",
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
  storageKey?: string;
}) {
  const [pinned, setPinned] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    const raw = localStorage.getItem(storageKey);
    return raw === null ? true : raw === "true";
  });
  const [hovering, setHovering] = useState(false);

  // Persist whenever pinned changes.
  useEffect(() => {
    try { localStorage.setItem(storageKey, String(pinned)); } catch {}
  }, [pinned, storageKey]);

  const open = pinned || hovering;

  // The primitive calls onOpenChange when the rail / trigger / Ctrl+B
  // fires. Treat that as the user explicitly toggling the *pinned* state
  // — flip pinned and clear hover so the next mouse-leave does nothing.
  const handleOpenChange = (next: boolean) => {
    setPinned(next);
    setHovering(false);
  };

  // Attach hover handlers with deliberate delays so the open/close feels
  // intentional and never twitchy:
  //   - 120ms open delay: a quick mouse-by doesn't pop the sidebar
  //   - 380ms close delay: gives the cursor time to travel into a
  //     portaled popover (profile dropdown, store switcher) without the
  //     sidebar yanking shut underneath it
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const enterTimer = useRef<number | null>(null);
  const leaveTimer = useRef<number | null>(null);
  useEffect(() => {
    const root = wrapperRef.current;
    if (!root) return;
    const sidebar = root.querySelector('[data-slot="sidebar-container"], [data-sidebar="sidebar"]');
    if (!sidebar) return;
    const clearTimers = () => {
      if (enterTimer.current) { window.clearTimeout(enterTimer.current); enterTimer.current = null; }
      if (leaveTimer.current) { window.clearTimeout(leaveTimer.current); leaveTimer.current = null; }
    };
    const enter = () => {
      clearTimers();
      enterTimer.current = window.setTimeout(() => {
        setHovering(true);
        enterTimer.current = null;
      }, 120);
    };
    const leave = () => {
      clearTimers();
      leaveTimer.current = window.setTimeout(() => {
        setHovering(false);
        leaveTimer.current = null;
      }, 380);
    };
    sidebar.addEventListener("mouseenter", enter);
    sidebar.addEventListener("mouseleave", leave);
    return () => {
      sidebar.removeEventListener("mouseenter", enter);
      sidebar.removeEventListener("mouseleave", leave);
      clearTimers();
    };
  }, [children]);

  return (
    <div ref={wrapperRef} className="contents">
      <SidebarProvider
        open={open}
        onOpenChange={handleOpenChange}
        style={style}
      >
        {children}
      </SidebarProvider>
    </div>
  );
}
