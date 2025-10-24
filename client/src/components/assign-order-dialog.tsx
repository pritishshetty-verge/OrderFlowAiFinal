import { useState } from "react";
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
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Package, UserCheck } from "lucide-react";
import type { User, Order as BackendOrder } from "@shared/schema";
import type { Order } from "./orders-table";

interface AssignOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: Order | null;
}

export function AssignOrderDialog({
  open,
  onOpenChange,
  order,
}: AssignOrderDialogProps) {
  const { toast } = useToast();
  const [selectedUserId, setSelectedUserId] = useState<string>("");

  // Fetch available users (agents and managers who are present)
  const { data: users, isLoading: usersLoading } = useQuery<User[]>({
    queryKey: ["/api/users"],
    enabled: open,
  });

  // Fetch orders to calculate workload
  const { data: ordersResponse, isLoading: ordersLoading } = useQuery<{ orders: BackendOrder[]; total: number }>({
    queryKey: ["/api/orders"],
    enabled: open,
  });

  // Calculate workload for each user
  const workloadMap = new Map<string, number>();
  ordersResponse?.orders?.forEach((o) => {
    if (o.assignedTo && o.status !== "delivered" && o.status !== "cancelled") {
      const current = workloadMap.get(o.assignedTo) || 0;
      workloadMap.set(o.assignedTo, current + 1);
    }
  });

  // Manual assignment mutation
  const assignMutation = useMutation({
    mutationFn: async ({ orderId, userId }: { orderId: string; userId: string }) => {
      return await apiRequest("POST", "/api/orders/assign", { orderId, userId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      toast({
        title: "Order Assigned",
        description: "The order has been successfully assigned.",
      });
      onOpenChange(false);
      setSelectedUserId("");
    },
    onError: (error: Error) => {
      toast({
        title: "Assignment Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleAssign = () => {
    if (!order || !selectedUserId) return;
    assignMutation.mutate({ orderId: order.id, userId: selectedUserId });
  };

  // Filter available users (agents and managers, present status)
  const availableUsers = users?.filter(
    (u) => (u.role === "agent" || u.role === "manager") && u.presenceStatus === "present"
  ) || [];

  const isLoading = usersLoading || ordersLoading;

  if (!order) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-testid="dialog-assign-order">
        <DialogHeader>
          <DialogTitle>Assign Order</DialogTitle>
          <DialogDescription>
            Assign order #{order.shopifyOrderId} to an available team member
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="agent-select">Select Team Member</Label>
            <Select
              value={selectedUserId}
              onValueChange={setSelectedUserId}
              disabled={isLoading || assignMutation.isPending}
            >
              <SelectTrigger id="agent-select" data-testid="select-agent">
                <SelectValue placeholder="Choose a team member..." />
              </SelectTrigger>
              <SelectContent>
                {isLoading ? (
                  <SelectItem value="loading" disabled>
                    Loading...
                  </SelectItem>
                ) : availableUsers.length === 0 ? (
                  <SelectItem value="none" disabled>
                    No available team members
                  </SelectItem>
                ) : (
                  availableUsers.map((user) => {
                    const workload = workloadMap.get(user.id) || 0;
                    return (
                      <SelectItem key={user.id} value={user.id} data-testid={`option-user-${user.id}`}>
                        <div className="flex items-center gap-3 py-1">
                          <Avatar className="h-6 w-6">
                            <AvatarFallback className="text-xs">
                              {user.fullName
                                .split(" ")
                                .map((n) => n[0])
                                .join("")}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex flex-col">
                            <span className="font-medium">{user.fullName}</span>
                            <span className="text-xs text-muted-foreground">
                              {workload} active orders
                            </span>
                          </div>
                          <Badge
                            variant="outline"
                            className="ml-auto bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20"
                          >
                            Present
                          </Badge>
                        </div>
                      </SelectItem>
                    );
                  })
                )}
              </SelectContent>
            </Select>
          </div>

          {selectedUserId && (
            <div className="rounded-lg bg-muted p-4 space-y-2">
              <p className="text-sm font-medium">Order Summary</p>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Customer:</span>
                  <span className="font-medium">{order.customerName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total:</span>
                  <span className="font-medium">₹{order.total.toLocaleString("en-IN")}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Payment:</span>
                  <span className="font-medium capitalize">{order.paymentMethod}</span>
                </div>
              </div>
            </div>
          )}

          {!isLoading && availableUsers.length > 0 && (
            <div className="rounded-lg bg-muted/50 p-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <UserCheck className="h-3 w-3" />
                <span>{availableUsers.length} team members available for assignment</span>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={assignMutation.isPending}
            data-testid="button-cancel-assign"
          >
            Cancel
          </Button>
          <Button
            onClick={handleAssign}
            disabled={!selectedUserId || assignMutation.isPending}
            data-testid="button-confirm-assign"
          >
            {assignMutation.isPending ? "Assigning..." : "Assign Order"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
