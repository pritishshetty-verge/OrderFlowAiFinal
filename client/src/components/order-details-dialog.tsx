import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { StatusBadge } from "@/components/status-badge";
import { PaymentBadge } from "@/components/payment-badge";
import { CallLog } from "@/components/call-log";
import { format } from "date-fns";
import type { Order } from "./orders-table";

interface OrderDetailsDialogProps {
  order: Order | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function OrderDetailsDialog({
  order,
  open,
  onOpenChange,
}: OrderDetailsDialogProps) {
  if (!order) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl" data-testid="dialog-order-details">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            Order #{order.shopifyOrderId}
            <StatusBadge status={order.status} shipmentStatus={order.shipmentStatus} />
          </DialogTitle>
          <DialogDescription>
            Created {format(order.createdAt, "PPpp")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <div>
            <h3 className="text-sm font-semibold mb-3">Customer Information</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Name</span>
                <p className="font-medium mt-1">{order.customerName}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Phone</span>
                <p className="font-medium font-mono mt-1">{order.customerPhone}</p>
              </div>
            </div>
          </div>

          <Separator />

          <div>
            <h3 className="text-sm font-semibold mb-3">Order Details</h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Items</span>
                <span className="font-medium">{order.items}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Payment Method</span>
                <PaymentBadge method={order.paymentMethod} />
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total Amount</span>
                <span className="font-bold text-base">
                  ₹{order.total.toLocaleString("en-IN")}
                </span>
              </div>
            </div>
          </div>

          {order.assignedTo && (
            <>
              <Separator />
              <div>
                <h3 className="text-sm font-semibold mb-3">Assignment</h3>
                <div className="text-sm">
                  <span className="text-muted-foreground">Assigned to: </span>
                  <Badge variant="secondary">{order.assignedTo}</Badge>
                </div>
              </div>
            </>
          )}

          <Separator />
          <div>
            <h3 className="text-sm font-semibold mb-3">Call History</h3>
            <CallLog orderId={order.id} />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
