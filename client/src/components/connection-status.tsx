import { Badge } from "@/components/ui/badge";
import { Wifi, WifiOff } from "lucide-react";

interface ConnectionStatusProps {
  connected: boolean;
}

export function ConnectionStatus({ connected }: ConnectionStatusProps) {
  return (
    <Badge
      variant="outline"
      className={
        connected
          ? "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20 gap-1.5"
          : "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20 gap-1.5"
      }
      data-testid="badge-connection-status"
    >
      {connected ? (
        <>
          <Wifi className="h-3 w-3" />
          Live
        </>
      ) : (
        <>
          <WifiOff className="h-3 w-3" />
          Offline
        </>
      )}
    </Badge>
  );
}
