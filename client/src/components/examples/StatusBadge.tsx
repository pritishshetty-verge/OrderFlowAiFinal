import { StatusBadge } from "../status-badge";

export default function StatusBadgeExample() {
  return (
    <div className="p-8 space-y-4">
      <div className="flex flex-wrap gap-3">
        <StatusBadge status="pending" />
        <StatusBadge status="assigned" />
        <StatusBadge status="confirmed" />
        <StatusBadge status="cancelled" />
        <StatusBadge status="shipped" />
        <StatusBadge status="delivered" />
        <StatusBadge status="ndr" />
      </div>
    </div>
  );
}
