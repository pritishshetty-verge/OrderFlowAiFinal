import { PageLayout } from "@/components/page-layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Eye, RefreshCw, FileJson } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useState } from "react";
import type { InboundWebhookLog } from "@shared/schema";

function formatTime(dateStr: string | Date) {
  const d = new Date(dateStr);
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
}

function timeAgo(dateStr: string | Date) {
  const now = Date.now();
  const d = new Date(dateStr).getTime();
  const diffSec = Math.floor((now - d) / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
}

export default function WebhookLogsPage() {
  const [selectedLog, setSelectedLog] = useState<InboundWebhookLog | null>(null);

  const { data: logs, isLoading } = useQuery<InboundWebhookLog[]>({
    queryKey: ["/api/webhook-logs"],
    refetchInterval: 10000,
  });

  return (
    <PageLayout title="API Logs">
      <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Badge variant="outline" data-testid="badge-log-count">
            {logs?.length ?? 0} logs
          </Badge>
        </div>
        <Button
          variant="outline"
          size="sm"
          data-testid="button-refresh-logs"
          onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/webhook-logs"] })}
        >
          <RefreshCw className="w-4 h-4 mr-1" />
          Refresh
        </Button>
      </div>

      <Card>
        {isLoading ? (
          <div className="p-4 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : !logs || logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <FileJson className="w-12 h-12 mb-3 opacity-40" />
            <p className="text-sm font-medium">No webhook logs yet</p>
            <p className="text-xs mt-1">Incoming payloads from TeleCRM will appear here</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Event Type</TableHead>
                <TableHead className="text-right">Payload</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((log) => (
                <TableRow key={log.id} data-testid={`row-webhook-log-${log.id}`}>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="text-sm" data-testid={`text-log-time-${log.id}`}>
                        {formatTime(log.createdAt)}
                      </span>
                      <span className="text-xs text-muted-foreground">{timeAgo(log.createdAt)}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" data-testid={`badge-source-${log.id}`}>
                      {log.source}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <span
                      className="text-sm text-muted-foreground"
                      data-testid={`text-event-type-${log.id}`}
                    >
                      {log.eventType || "—"}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      data-testid={`button-view-payload-${log.id}`}
                      onClick={() => setSelectedLog(log)}
                    >
                      <Eye className="w-4 h-4 mr-1" />
                      View Payload
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <Dialog open={!!selectedLog} onOpenChange={(open) => !open && setSelectedLog(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileJson className="w-5 h-5" />
              Webhook Payload
              {selectedLog && (
                <Badge variant="secondary" className="ml-2">
                  {selectedLog.source}
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>
          {selectedLog && (
            <div className="space-y-3">
              <div className="flex items-center gap-4 flex-wrap text-sm text-muted-foreground">
                <span>ID: {selectedLog.id}</span>
                <span>Event: {selectedLog.eventType || "—"}</span>
                <span>{formatTime(selectedLog.createdAt)}</span>
              </div>
              <ScrollArea className="h-[50vh]">
                <pre
                  className="text-xs p-4 rounded-md bg-muted font-mono whitespace-pre-wrap break-all"
                  data-testid="text-payload-json"
                >
                  {JSON.stringify(selectedLog.payload, null, 2)}
                </pre>
              </ScrollArea>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </PageLayout>
  );
}
