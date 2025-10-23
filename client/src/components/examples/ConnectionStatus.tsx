import { ConnectionStatus } from "../connection-status";

export default function ConnectionStatusExample() {
  return (
    <div className="p-8 space-y-4">
      <div className="flex gap-3">
        <ConnectionStatus connected={true} />
        <ConnectionStatus connected={false} />
      </div>
    </div>
  );
}
