import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Loader2, UserCheck, AlertCircle } from "lucide-react";
import type { User } from "@shared/schema";

// ─────────────────────────────────────────────────────────────────────
// BulkAssignDialog — assign N selected orders to one agent in a
// single API call. Backed by POST /api/orders/bulk-assign which has
// existed in the backend for a while; this is the missing frontend
// surface flagged by the audit (Feature #3).
//
// Why a separate component from AssignOrderDialog (single-order):
//   • Single-order shows per-order detail (order number, customer,
//     total). That context doesn't apply to a list of N orders.
//   • Bulk dialog needs a per-result toast — "Assigned 18 of 20;
//     2 failed" — so the response shape it consumes differs from
//     the single-order success/failure binary.
//   • The optional note field is more useful in bulk (the admin
//     stamps the same handoff context onto every assignment in
//     one keystroke).
//
// Backend contract (server/routes.ts:1677):
//   POST /api/orders/bulk-assign
//   body: { orderIds: string[], agentId, assignedBy, note? }
//   returns: { results: Array<{ orderId, success, error? }> }
// ─────────────────────────────────────────────────────────────────────

interface BulkAssignDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Order IDs to assign — captured from the table's selection set. */
  orderIds: string[];
  /** Called after a successful bulk-assign so the parent can clear
   *  the selection set. The mutation also invalidates /api/orders
   *  internally so the table refetches. */
  onSuccess?: () => void;
}

export function BulkAssignDialog({
  open,
  onOpenChange,
  orderIds,
  onSuccess,
}: BulkAssignDialogProps) {
  const { toast } = useToast();
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [note, setNote] = useState<string>("");

  // Reset transient state whenever the dialog opens for a new
  // selection set. Without this, a previous Save would leave the
  // agent + note pre-filled the next time the dialog opens.
  useEffect(() => {
    if (!open) {
      setSelectedUserId("");
      setNote("");
    }
  }, [open]);

  // Available agents/managers. Filtered to "present" status so the
  // admin can't assign to someone who's signed out. Same query
  // shape AssignOrderDialog uses — cache shared.
  const { data: users, isLoading: usersLoading } = useQuery<User[]>({
    queryKey: ["/api/users"],
    enabled: open,
  });

  const availableUsers =
    users?.filter(
      (u) =>
        (u.role === "agent" || u.role === "manager") &&
        u.presenceStatus === "present",
    ) ?? [];

  const bulkAssignMutation = useMutation({
    mutationFn: async () => {
      const assignedBy = localStorage.getItem("userId");
      if (!assignedBy) throw new Error("User not authenticated");
      const res = await apiRequest("POST", "/api/orders/bulk-assign", {
        orderIds,
        agentId: selectedUserId,
        assignedBy,
        note: note.trim() || undefined,
      });
      return res.json() as Promise<{
        results: Array<{ orderId: string; success: boolean; error?: string }>;
      }>;
    },
    onSuccess: (data) => {
      // The backend iterates over the order id array; each row
      // can succeed or fail independently. We surface both counts
      // so partial failures (e.g. an order another admin just
      // re-assigned in a different tab) don't masquerade as a
      // total success.
      const succeeded = data.results.filter((r) => r.success).length;
      const failed = data.results.length - succeeded;
      const agentName =
        availableUsers.find((u) => u.id === selectedUserId)?.fullName ?? "agent";

      // Refresh the table so the new assignments appear without
      // a manual page reload. The bulk-assign endpoint touches
      // both `orders.assigned_to` and `order_assignments`, so we
      // invalidate the order list — `/api/users` workload counts
      // refresh on their own next refetch tick.
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });

      if (failed === 0) {
        toast({
          title: "Orders assigned",
          description: `${succeeded} order${succeeded === 1 ? "" : "s"} assigned to ${agentName}.`,
        });
      } else {
        toast({
          title: `${succeeded} assigned, ${failed} failed`,
          description: `${succeeded} succeeded, ${failed} couldn't be assigned. Open the failing orders individually to retry.`,
          variant: failed === data.results.length ? "destructive" : "default",
        });
      }
      onSuccess?.();
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Bulk assignment failed",
        description: error.message || "Network error. Try again.",
        variant: "destructive",
      });
    },
  });

  const handleAssign = () => {
    if (!selectedUserId || orderIds.length === 0) return;
    bulkAssignMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="dialog-bulk-assign">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserCheck className="h-5 w-5 text-primary" />
            Assign {orderIds.length} order{orderIds.length === 1 ? "" : "s"}
          </DialogTitle>
          <DialogDescription>
            All selected orders will be assigned to the same agent in a single
            transaction. The agent will see them in their queue immediately.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="bulk-agent-select">Assign to</Label>
            <Select
              value={selectedUserId}
              onValueChange={setSelectedUserId}
              disabled={usersLoading || bulkAssignMutation.isPending}
            >
              <SelectTrigger id="bulk-agent-select" data-testid="select-bulk-agent">
                <SelectValue
                  placeholder={usersLoading ? "Loading agents…" : "Choose an agent"}
                />
              </SelectTrigger>
              <SelectContent>
                {availableUsers.length === 0 && !usersLoading ? (
                  <div className="px-2 py-3 text-sm text-muted-foreground">
                    No agents are currently online.
                  </div>
                ) : (
                  availableUsers.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      <div className="flex items-center gap-2">
                        <Avatar className="h-5 w-5">
                          <AvatarFallback className="text-[10px]">
                            {(user.fullName || user.username || "?")
                              .split(" ")
                              .map((n) => n[0])
                              .join("")
                              .slice(0, 2)
                              .toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <span>{user.fullName ?? user.username}</span>
                      </div>
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="bulk-assign-note">Note (optional)</Label>
            <Textarea
              id="bulk-assign-note"
              placeholder="e.g. priority batch — please confirm by EOD"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              disabled={bulkAssignMutation.isPending}
              rows={2}
              data-testid="input-bulk-assign-note"
            />
            <p className="text-xs text-muted-foreground">
              The same note is recorded against every order's assignment
              history for audit.
            </p>
          </div>

          {orderIds.length > 25 && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-xs">
                You're assigning {orderIds.length} orders. The backend
                processes them sequentially — expect this to take a few
                seconds for very large batches.
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={bulkAssignMutation.isPending}
            data-testid="button-bulk-assign-cancel"
          >
            Cancel
          </Button>
          <Button
            onClick={handleAssign}
            disabled={
              !selectedUserId ||
              orderIds.length === 0 ||
              bulkAssignMutation.isPending
            }
            data-testid="button-bulk-assign-confirm"
          >
            {bulkAssignMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Assigning {orderIds.length}…
              </>
            ) : (
              `Assign ${orderIds.length} order${orderIds.length === 1 ? "" : "s"}`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
