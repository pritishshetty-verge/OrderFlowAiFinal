import { useQuery } from "@tanstack/react-query";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Download, Play, Pause, Phone } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { useState, useRef } from "react";

interface CallWithDetails {
  id: string;
  orderId: string;
  agentId: string;
  customerPhone: string;
  callStatus: string;
  calledAt: string;
  callDuration: number | null;
  recordingUrl: string | null;
  callReference: string | null;
  ivrStatus: string | null;
  completedAt: string | null;
  webhookData: any;
  agent: {
    fullName: string;
    email: string;
  } | null;
  order: {
    shopifyOrderNumber: string;
    customerName: string;
  } | null;
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

function formatDuration(seconds: number | null): string {
  if (!seconds) return "—";
  
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  
  if (minutes > 0) {
    return `${minutes}m ${remainingSeconds}s`;
  }
  return `${remainingSeconds}s`;
}

function AudioPlayer({ recordingUrl }: { recordingUrl: string }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  const togglePlay = () => {
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleEnded = () => {
    setIsPlaying(false);
  };

  return (
    <div className="flex items-center gap-2">
      <audio
        ref={audioRef}
        src={recordingUrl}
        onEnded={handleEnded}
        onPause={() => setIsPlaying(false)}
        onPlay={() => setIsPlaying(true)}
      />
      <Button
        size="sm"
        variant="outline"
        onClick={togglePlay}
        data-testid={`button-play-recording-${recordingUrl}`}
      >
        {isPlaying ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        asChild
        data-testid={`button-download-recording-${recordingUrl}`}
      >
        <a href={recordingUrl} download target="_blank" rel="noopener noreferrer">
          <Download className="h-3 w-3" />
        </a>
      </Button>
    </div>
  );
}

export default function CallLogsPage() {
  const { data: calls, isLoading } = useQuery<CallWithDetails[]>({
    queryKey: ["/api/admin/calls"],
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <div className="space-y-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-96" />
        </div>
        <Card className="p-6">
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Phone className="h-6 w-6" />
          Call Logs
        </h1>
        <p className="text-muted-foreground mt-1">
          All IVR call records with recordings and metadata
        </p>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Call Reference</TableHead>
              <TableHead>Order</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Agent</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>Called At</TableHead>
              <TableHead>Recording</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!calls || calls.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                  No call records found
                </TableCell>
              </TableRow>
            ) : (
              calls.map((call) => (
                <TableRow key={call.id} data-testid={`row-call-${call.id}`}>
                  <TableCell className="font-mono text-sm">
                    {call.callReference || "—"}
                  </TableCell>
                  <TableCell>
                    {call.order ? (
                      <div>
                        <div className="font-medium">#{call.order.shopifyOrderNumber}</div>
                        <div className="text-xs text-muted-foreground">{call.order.customerName}</div>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    {call.customerPhone}
                  </TableCell>
                  <TableCell>
                    {call.agent ? (
                      <div>
                        <div className="font-medium">{call.agent.fullName}</div>
                        <div className="text-xs text-muted-foreground">{call.agent.email}</div>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">Unknown Agent</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      <Badge variant={getCallStatusVariant(call.callStatus)}>
                        {call.callStatus}
                      </Badge>
                      {call.ivrStatus && (
                        <Badge variant="outline" className="ml-1">
                          {call.ivrStatus}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>{formatDuration(call.callDuration)}</TableCell>
                  <TableCell>
                    <div>
                      <div className="text-sm">{format(new Date(call.calledAt), "PPp")}</div>
                      <div className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(call.calledAt), { addSuffix: true })}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    {call.recordingUrl ? (
                      <AudioPlayer recordingUrl={call.recordingUrl} />
                    ) : (
                      <span className="text-muted-foreground text-sm">No recording</span>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
