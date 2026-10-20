import { useActiveStore } from "@/hooks/use-store";

// A thin top progress bar shown while a store switch is settling. Store
// switching is otherwise instant, so this gives it a clear visual cue.
export function StoreSwitchProgress() {
  const { isSwitching } = useActiveStore();
  if (!isSwitching) return null;
  return (
    <div
      className="fixed inset-x-0 top-0 z-[200] h-0.5 overflow-hidden bg-primary/10"
      role="status"
      aria-label="Switching store"
    >
      <div className="h-full w-1/3 rounded-full bg-primary animate-[store-switch-bar_1.1s_ease-in-out_infinite]" />
    </div>
  );
}
