import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { PaymentBadge } from "@/components/payment-badge";
import { Phone, UserPlus } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

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
}

export function OrdersTable({
  orders,
  userRole = "admin",
  onCallCustomer,
  onViewDetails,
  onAssignOrder,
}: OrdersTableProps) {
  return (
    <div className="rounded-lg border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[120px]">Order ID</TableHead>
            <TableHead>Customer</TableHead>
            <TableHead>Items</TableHead>
            <TableHead className="text-right">Total</TableHead>
            <TableHead>Payment</TableHead>
            <TableHead>Status</TableHead>
            {userRole !== "agent" && <TableHead>Assigned To</TableHead>}
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
              <TableCell className="text-sm">{order.items}</TableCell>
              <TableCell className="text-right font-medium">
                ₹{order.total.toLocaleString("en-IN")}
              </TableCell>
              <TableCell>
                <PaymentBadge method={order.paymentMethod} />
              </TableCell>
              <TableCell>
                <StatusBadge status={order.status} />
              </TableCell>
              {userRole !== "agent" && (
                <TableCell className="text-sm text-muted-foreground">
                  {order.assignedTo || "—"}
                </TableCell>
              )}
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
                        onCallCustomer?.(order);
                      }}
                      data-testid={`button-call-${order.id}`}
                    >
                      <Phone className="h-4 w-4" />
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
