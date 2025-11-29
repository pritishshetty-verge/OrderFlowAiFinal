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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageLayout } from "@/components/page-layout";
import { Download, Play, Pause, Phone, ChevronLeft, ChevronRight } from "lucide-react";
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
  transcript: string | null;
  aiAnalysis: any | null;
  agent: {
    fullName: string;
    email: string;
  } | null;
  order: {
    shopifyOrderNumber: string;
    customerName: string;
  } | null;
}

interface CallsResponse {
  calls: CallWithDetails[];
  total: number;
  page: number;
  totalPages: number;
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

function AudioPlayer({ recordingUrl, callReference, callId }: { recordingUrl: string; callReference: string | null; callId: string }) {
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

  const downloadUrl = `/api/calls/download/${callId}`;

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
        <a href={downloadUrl}>
          <Download className="h-3 w-3" />
        </a>
      </Button>
    </div>
  );
}

export default function CallLogsPage() {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  
  // Get user info from localStorage for role-based filtering
  const userId = localStorage.getItem("userId") || "";
  const userRole = localStorage.getItem("userRole") || "agent";
  const isAdmin = userRole === "admin";

  const { data, isLoading } = useQuery<CallsResponse>({
    queryKey: ['/api/admin/calls', page, limit, userId, userRole],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
        userId,
        userRole,
      });
      const response = await fetch(`/api/admin/calls?${params}`);
      if (!response.ok) throw new Error("Failed to fetch calls");
      return response.json();
    },
  });

  if (isLoading) {
    return (
      <PageLayout title={isAdmin ? "All Call Logs" : "Your Call Logs"}>
        <div className="p-6 space-y-4">
          <Card className="p-6">
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          </Card>
        </div>
      </PageLayout>
    );
  }

  const calls = data?.calls || [];
  const total = data?.total || 0;
  const totalPages = data?.totalPages || 1;

  const pageDescription = isAdmin 
    ? `All IVR call records with recordings and metadata (${total} total)`
    : `Your IVR call records with recordings and metadata (${total} total)`;

  const pageActions = (
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted-foreground">Rows per page:</span>
      <Select
        value={limit.toString()}
        onValueChange={(value) => {
          setLimit(parseInt(value));
          setPage(1);
        }}
      >
        <SelectTrigger className="w-20" data-testid="select-page-size">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="10">10</SelectItem>
          <SelectItem value="25">25</SelectItem>
          <SelectItem value="50">50</SelectItem>
          <SelectItem value="100">100</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <PageLayout 
      title={isAdmin ? "All Call Logs" : "Your Call Logs"} 
      description={pageDescription}
      actions={pageActions}
    >
      <div className="p-6 space-y-4">
        <Card>
        <div className="overflow-x-auto">
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
                <TableHead>Transcript</TableHead>
                <TableHead>AI Analysis</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {calls.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
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
                        <AudioPlayer recordingUrl={call.recordingUrl} callReference={call.callReference} callId={call.id} />
                      ) : (
                        <span className="text-muted-foreground text-sm">No recording</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {call.transcript ? (
                        <div className="max-w-xs">
                          <p className="text-sm truncate">{call.transcript}</p>
                        </div>
                      ) : (
                        <Badge variant="outline">N/A</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {call.aiAnalysis ? (
                        <Badge variant="secondary">Available</Badge>
                      ) : (
                        <Badge variant="outline">N/A</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t">
            <div className="text-sm text-muted-foreground">
              Showing {(page - 1) * limit + 1} to {Math.min(page * limit, total)} of {total} calls
            </div>
            
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                data-testid="button-prev-page"
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </Button>
              
              <div className="flex items-center gap-1">
                <span className="text-sm">
                  Page {page} of {totalPages}
                </span>
              </div>
              
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                data-testid="button-next-page"
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>
      </div>
    </PageLayout>
  );
}
