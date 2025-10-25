import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusBadge } from "@/components/status-badge";
import { PaymentBadge } from "@/components/payment-badge";
import { Phone, UserPlus, Loader2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export interface Order {
  id: string;
  shopifyOrderId: string;
  customerName: string;
  customerPhone: string;
  shippingAddress?: string; // Full formatted address
  shippingCity?: string;
  shippingState?: string;
  shippingPincode?: string;
  items: string;
  total: number;
  paymentMethod: "cod" | "prepaid";
  status: "pending" | "assigned" | "confirmed" | "cancelled" | "shipped" | "delivered" | "ndr";
  callStatus?: "Pending" | "Confirmed" | "Cancelled" | "Follow Up";
  assignedTo?: string;
  discountCode?: string;
  createdAt: Date;
}

interface OrdersTableProps {
  orders: Order[];
  userRole?: "admin" | "manager" | "agent";
  onCallCustomer?: (order: Order) => void;
  onViewDetails?: (order: Order) => void;
  onAssignOrder?: (order: Order) => void;
  onCallStatusChange?: (orderId: string, newStatus: string) => void;
}

export function OrdersTable({
  orders,
  userRole = "admin",
  onCallCustomer,
  onViewDetails,
  onAssignOrder,
  onCallStatusChange,
}: OrdersTableProps) {
  const { toast } = useToast();
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());
  const [callingOrderId, setCallingOrderId] = useState<string | null>(null);
  const [cooldownOrders, setCooldownOrders] = useState<Set<string>>(new Set());
  const allSelected = orders.length > 0 && selectedOrders.size === orders.length;
  const someSelected = selectedOrders.size > 0 && !allSelected;

  // Fetch current user's real ID from database
  const userEmail = localStorage.getItem("userEmail");
  const { data: users } = useQuery<any[]>({
    queryKey: ["/api/users"],
    enabled: !!userEmail,
  });

  const currentUser = users?.find(u => u.email === userEmail);
  const currentUserId = currentUser?.id;

  // Mutation to initiate call
  const initiateCallMutation = useMutation({
    mutationFn: async ({ userId, orderId, customerPhone }: { userId: string; orderId: string; customerPhone: string }) => {
      const res = await apiRequest("POST", "/api/calls/initiate", { userId, orderId, customerPhone });
      const data = await res.json();
      return data;
    },
    onSuccess: (data, variables) => {
      toast({
        title: "Call initiated!",
        description: "Your phone will ring shortly.",
      });
      setCallingOrderId(null);
      
      // Add to cooldown set
      setCooldownOrders(prev => new Set(prev).add(variables.orderId));
      
      // Remove from cooldown after 5 seconds
      setTimeout(() => {
        setCooldownOrders(prev => {
          const next = new Set(prev);
          next.delete(variables.orderId);
          return next;
        });
      }, 5000);
    },
    onError: (error: any, variables) => {
      let errorMessage = "Failed to initiate call. Please try again.";
      
      // Extract error message from various error formats
      if (typeof error === 'string') {
        errorMessage = error;
      } else if (error?.message) {
        // Error thrown by apiRequest contains full response text
        try {
          const match = error.message.match(/\d+: ({.*})/);
          if (match) {
            const parsed = JSON.parse(match[1]);
            errorMessage = parsed.error || parsed.message || errorMessage;
          } else {
            errorMessage = error.message;
          }
        } catch {
          errorMessage = error.message;
        }
      } else if (error?.error) {
        errorMessage = error.error;
      }
      
      toast({
        title: "Call failed",
        description: errorMessage,
        variant: "destructive",
      });
      setCallingOrderId(null);
    },
  });

  const handleCallCustomer = (order: Order) => {
    if (!currentUserId) {
      toast({
        title: "Authentication required",
        description: "Please log in to make calls.",
        variant: "destructive",
      });
      return;
    }

    if (callingOrderId || cooldownOrders.has(order.id)) {
      return;
    }

    setCallingOrderId(order.id);
    initiateCallMutation.mutate({
      userId: currentUserId,
      orderId: order.id,
      customerPhone: order.customerPhone,
    });
  };

  const handleSelectAll = () => {
    if (allSelected) {
      setSelectedOrders(new Set());
    } else {
      setSelectedOrders(new Set(orders.map(order => order.id)));
    }
  };

  const handleSelectOrder = (orderId: string) => {
    const newSelected = new Set(selectedOrders);
    if (newSelected.has(orderId)) {
      newSelected.delete(orderId);
    } else {
      newSelected.add(orderId);
    }
    setSelectedOrders(newSelected);
  };

  const getCallStatusColor = (status: string) => {
    switch (status) {
      case "Confirmed":
        return "bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800";
      case "Pending":
        return "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-900/20 dark:text-purple-400 dark:border-purple-800";
      case "Follow Up":
        return "bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-400 dark:border-yellow-800";
      case "Cancelled":
        return "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800";
      default:
        return "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-900/20 dark:text-purple-400 dark:border-purple-800";
    }
  };

  return (
    <div className="rounded-lg border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[50px]">
              <Checkbox
                checked={allSelected}
                onCheckedChange={handleSelectAll}
                aria-label="Select all orders"
                data-testid="checkbox-select-all"
              />
            </TableHead>
            <TableHead className="w-[120px]">Order ID</TableHead>
            <TableHead>Customer</TableHead>
            <TableHead>Agent</TableHead>
            <TableHead>Items</TableHead>
            <TableHead className="text-right">Total</TableHead>
            <TableHead>Payment</TableHead>
            <TableHead>Call Status</TableHead>
            <TableHead>Date</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {orders.map((order) => (
            <TableRow
              key={order.id}
              className="hover-elevate cursor-pointer"
              onClick={() => onViewDetails?.(order)}
              data-testid={`row-order-${order.id}`}
            >
              <TableCell onClick={(e) => e.stopPropagation()}>
                <Checkbox
                  checked={selectedOrders.has(order.id)}
                  onCheckedChange={() => handleSelectOrder(order.id)}
                  aria-label={`Select order ${order.shopifyOrderId}`}
                  data-testid={`checkbox-order-${order.id}`}
                />
              </TableCell>
              <TableCell className="font-mono text-xs font-medium">
                #{order.shopifyOrderId}
              </TableCell>
              <TableCell>
                <div className="flex flex-col">
                  <span className="font-medium text-sm">{order.customerName}</span>
                  <span className="text-xs text-muted-foreground font-mono">
                    {order.customerPhone}
                  </span>
                </div>
              </TableCell>
              <TableCell className="text-sm" data-testid={`agent-${order.id}`} onClick={(e) => e.stopPropagation()}>
                {order.assignedTo || <span className="text-muted-foreground">Unassigned</span>}
              </TableCell>
              <TableCell className="text-sm">{order.items}</TableCell>
              <TableCell className="text-right font-medium">
                ₹{order.total.toLocaleString("en-IN")}
              </TableCell>
              <TableCell>
                <PaymentBadge method={order.paymentMethod} />
              </TableCell>
              <TableCell onClick={(e) => e.stopPropagation()}>
                <Select
                  value={order.callStatus || "Pending"}
                  onValueChange={(value) => onCallStatusChange?.(order.id, value)}
                >
                  <SelectTrigger 
                    className={`h-8 w-[140px] rounded-full border text-xs font-medium ${getCallStatusColor(order.callStatus || "Pending")}`}
                    data-testid={`select-call-status-${order.id}`}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Pending">Pending</SelectItem>
                    <SelectItem value="Confirmed">Confirmed</SelectItem>
                    <SelectItem value="Cancelled">Cancelled</SelectItem>
                    <SelectItem value="Follow Up">Follow Up</SelectItem>
                  </SelectContent>
                </Select>
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {formatDistanceToNow(order.createdAt, { addSuffix: true })}
              </TableCell>
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-1">
                  {order.paymentMethod === "cod" && order.status === "assigned" && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCallCustomer(order);
                      }}
                      disabled={callingOrderId === order.id || cooldownOrders.has(order.id)}
                      data-testid={`button-call-${order.id}`}
                    >
                      {callingOrderId === order.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Phone className="h-4 w-4" />
                      )}
                    </Button>
                  )}
                  {userRole !== "agent" && !order.assignedTo && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        onAssignOrder?.(order);
                      }}
                      data-testid={`button-assign-${order.id}`}
                    >
                      <UserPlus className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
