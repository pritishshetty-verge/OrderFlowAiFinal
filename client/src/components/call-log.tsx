import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Phone, Clock, User, Download, ExternalLink } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import type { Call } from "@shared/schema";

interface CallWithAgent extends Call {
  agent: {
    fullName: string;
    email: string;
  } | null;
}

interface CallLogProps {
  orderId: string;
}

function getCallStatusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "completed":
      return "default";
    case "initiated":
      return "secondary";
    case "failed":
      return "destructive";
    default:
      return "outline";
  }
}

function formatDuration(seconds: number | null | undefined): string {
  if (!seconds) return "—";
  
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  
  if (minutes > 0) {
    return `${minutes}m ${remainingSeconds}s`;
  }
  return `${remainingSeconds}s`;
}

export function CallLog({ orderId }: CallLogProps) {
  const { data: calls, isLoading } = useQuery<CallWithAgent[]>({
    queryKey: ["/api/orders", orderId, "calls"],
    enabled: !!orderId,
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  if (!calls || calls.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Phone className="w-12 h-12 mx-auto mb-3 opacity-50" />
        <p className="text-sm">No call history available</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {calls.map((call) => (
        <Card 
          key={call.id} 
          className="p-4"
          data-testid={`call-record-${call.id}`}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge 
                  variant={getCallStatusVariant(call.callStatus)}
                  data-testid={`badge-call-status-${call.id}`}
                >
                  {call.callStatus}
                </Badge>
                
                {call.ivrStatus && call.ivrStatus !== call.callStatus && (
                  <Badge variant="outline" data-testid={`badge-ivr-status-${call.id}`}>
                    IVR: {call.ivrStatus}
                  </Badge>
                )}

                {call.callDuration && (
                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                    <Clock className="w-3 h-3" />
                    <span data-testid={`text-duration-${call.id}`}>
                      {formatDuration(call.callDuration)}
                    </span>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 text-sm">
                <User className="w-4 h-4 text-muted-foreground" />
                <span data-testid={`text-agent-${call.id}`}>
                  {call.agent?.fullName || "Unknown Agent"}
                </span>
                <span className="text-muted-foreground">•</span>
                <span className="font-mono text-muted-foreground" data-testid={`text-phone-${call.id}`}>
                  {call.customerPhone}
                </span>
              </div>

              <div className="text-xs text-muted-foreground" data-testid={`text-timestamp-${call.id}`}>
                {formatDistanceToNow(new Date(call.calledAt), { addSuffix: true })} • {format(new Date(call.calledAt), "PPp")}
              </div>

              {call.callReference && (
                <div className="text-xs text-muted-foreground">
                  <span>Call ID: </span>
                  <code className="bg-muted px-1 rounded" data-testid={`text-reference-${call.id}`}>
                    {call.callReference}
                  </code>
                </div>
              )}
            </div>

            {call.recordingUrl && (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  asChild
                  data-testid={`button-play-recording-${call.id}`}
                >
                  <a 
                    href={call.recordingUrl} 
                    target="_blank" 
                    rel="noopener noreferrer"
                  >
                    <ExternalLink className="w-4 h-4 mr-1" />
                    Play
                  </a>
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  asChild
                  data-testid={`button-download-recording-${call.id}`}
                >
                  <a 
                    href={call.recordingUrl} 
                    download
                  >
                    <Download className="w-4 h-4" />
                  </a>
                </Button>
              </div>
            )}
          </div>
        </Card>
      ))}
    </div>
  );
}
