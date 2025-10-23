import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useState } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import type { Order } from "./orders-table";

interface AssignOrderDialogProps {
  order: Order | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

//todo: remove mock functionality
const mockAgents = [
  { id: "1", name: "Priya Sharma", activeOrders: 5, status: "online" as const },
  { id: "2", name: "Amit Singh", activeOrders: 3, status: "online" as const },
  { id: "3", name: "Rahul Verma", activeOrders: 7, status: "away" as const },
  { id: "4", name: "Sneha Patel", activeOrders: 4, status: "online" as const },
];

export function AssignOrderDialog({
  order,
  open,
  onOpenChange,
}: AssignOrderDialogProps) {
  const [selectedAgent, setSelectedAgent] = useState<string>("");

  if (!order) return null;

  const handleAssign = () => {
    const agent = mockAgents.find((a) => a.id === selectedAgent);
    if (agent) {
      console.log(`Assigning order #${order.shopifyOrderId} to ${agent.name}`);
      alert(`Order #${order.shopifyOrderId} assigned to ${agent.name}`);
      onOpenChange(false);
      setSelectedAgent("");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-testid="dialog-assign-order">
        <DialogHeader>
          <DialogTitle>Assign Order</DialogTitle>
          <DialogDescription>
            Assign order #{order.shopifyOrderId} to an available agent
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="agent-select">Select Agent</Label>
            <Select value={selectedAgent} onValueChange={setSelectedAgent}>
              <SelectTrigger id="agent-select" data-testid="select-agent">
                <SelectValue placeholder="Choose an agent" />
              </SelectTrigger>
              <SelectContent>
                {mockAgents.map((agent) => (
                  <SelectItem key={agent.id} value={agent.id}>
                    <div className="flex items-center gap-3 py-1">
                      <Avatar className="h-6 w-6">
                        <AvatarFallback className="text-xs">
                          {agent.name
                            .split(" ")
                            .map((n) => n[0])
                            .join("")}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex flex-col">
                        <span className="font-medium">{agent.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {agent.activeOrders} active orders
                        </span>
                      </div>
                      {agent.status === "online" && (
                        <Badge
                          variant="outline"
                          className="ml-auto bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20"
                        >
                          Online
                        </Badge>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedAgent && (
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
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            data-testid="button-cancel-assign"
          >
            Cancel
          </Button>
          <Button
            onClick={handleAssign}
            disabled={!selectedAgent}
            data-testid="button-confirm-assign"
          >
            Assign Order
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
