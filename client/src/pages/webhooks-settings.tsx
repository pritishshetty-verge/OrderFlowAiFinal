import { PageLayout } from "@/components/page-layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Trash2, Plus, Webhook, Globe } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import type { Webhook as WebhookType } from "@shared/schema";

const EVENT_TYPES = [
  { value: "order.created", label: "Order Created" },
];

export default function WebhooksSettingsPage() {
  const { toast } = useToast();
  const [eventType, setEventType] = useState("");
  const [url, setUrl] = useState("");

  const { data: webhooksData, isLoading } = useQuery<WebhookType[]>({
    queryKey: ["/api/webhooks-config"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: { eventType: string; url: string }) => {
      await apiRequest("POST", "/api/webhooks-config", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/webhooks-config"] });
      setEventType("");
      setUrl("");
      toast({ title: "Webhook added", description: "Your webhook endpoint has been registered." });
    },
    onError: (error: any) => {
      toast({ title: "Failed to add webhook", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/webhooks-config/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/webhooks-config"] });
      toast({ title: "Webhook deleted", description: "The webhook endpoint has been removed." });
    },
    onError: (error: any) => {
      toast({ title: "Failed to delete webhook", description: error.message, variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!eventType || !url) {
      toast({ title: "Missing fields", description: "Please select an event type and enter a URL.", variant: "destructive" });
      return;
    }
    try {
      new URL(url);
    } catch {
      toast({ title: "Invalid URL", description: "Please enter a valid URL starting with http:// or https://.", variant: "destructive" });
      return;
    }
    createMutation.mutate({ eventType, url });
  };

  const webhooks = webhooksData || [];

  return (
    <PageLayout
      title="Webhooks"
      description="Register external URLs to receive real-time event notifications"
    >
      <div className="p-6 space-y-6">
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <Plus className="h-5 w-5 text-muted-foreground" />
            <h3 className="text-base font-medium">Add Webhook</h3>
          </div>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-2">
              <Label htmlFor="event-type">Event Type</Label>
              <Select value={eventType} onValueChange={setEventType}>
                <SelectTrigger id="event-type" data-testid="select-event-type">
                  <SelectValue placeholder="Select event" />
                </SelectTrigger>
                <SelectContent>
                  {EVENT_TYPES.map((et) => (
                    <SelectItem key={et.value} value={et.value} data-testid={`option-${et.value}`}>
                      {et.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-[2] space-y-2">
              <Label htmlFor="webhook-url">Destination URL</Label>
              <Input
                id="webhook-url"
                type="url"
                placeholder="https://example.com/webhook"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                data-testid="input-webhook-url"
              />
            </div>
            <Button type="submit" disabled={createMutation.isPending} data-testid="button-add-webhook">
              <Plus className="h-4 w-4 mr-1" />
              {createMutation.isPending ? "Adding..." : "Add"}
            </Button>
          </form>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <Webhook className="h-5 w-5 text-muted-foreground" />
            <h3 className="text-base font-medium">Active Webhooks</h3>
            {webhooks.length > 0 && (
              <Badge variant="secondary" className="ml-auto">{webhooks.length}</Badge>
            )}
          </div>

          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : webhooks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
              <Globe className="h-10 w-10 mb-3 opacity-40" />
              <p className="text-sm">No webhooks registered yet.</p>
              <p className="text-xs mt-1">Add one above to start receiving event notifications.</p>
            </div>
          ) : (
            <Table data-testid="table-webhooks">
              <TableHeader>
                <TableRow>
                  <TableHead>Event Type</TableHead>
                  <TableHead>Destination URL</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {webhooks.map((webhook) => (
                  <TableRow key={webhook.id} data-testid={`row-webhook-${webhook.id}`}>
                    <TableCell>
                      <Badge variant="outline">{webhook.eventType}</Badge>
                    </TableCell>
                    <TableCell className="max-w-xs truncate font-mono text-sm">
                      {webhook.url}
                    </TableCell>
                    <TableCell>
                      <Badge variant={webhook.isActive ? "default" : "secondary"}>
                        {webhook.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => deleteMutation.mutate(webhook.id)}
                        disabled={deleteMutation.isPending}
                        data-testid={`button-delete-webhook-${webhook.id}`}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      </div>
    </PageLayout>
  );
}
