import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { X, Mail, Phone, Edit, CheckCircle2, Circle } from "lucide-react";
import type { Order } from "@/components/orders-table";
import { format } from "date-fns";

interface TimelineEvent {
  id: string;
  description: string;
  detail?: string;
  date: Date;
  completed: boolean;
}

interface OrderItem {
  id: string;
  name: string;
  variant: string;
  quantity: number;
  price: number;
  color: string;
}

interface OrderQuickPreviewProps {
  order: Order | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEditCustomer?: () => void;
  onInvoice?: () => void;
  onRefund?: () => void;
  onEditOrder?: () => void;
}

//todo: remove mock functionality
const getMockTimelineEvents = (orderId: string): TimelineEvent[] => {
  return [
    {
      id: "1",
      description: "Order placed",
      detail: "Order created by customer",
      date: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2),
      completed: true,
    },
    {
      id: "2",
      description: "Payment confirmed",
      detail: "Payment verified and processed",
      date: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2 + 1000 * 60 * 30),
      completed: true,
    },
    {
      id: "3",
      description: "The packing has been started",
      detail: "Confirmed by Tommy Smith",
      date: new Date(Date.now() - 1000 * 60 * 60 * 24),
      completed: true,
    },
    {
      id: "4",
      description: "The invoice has been sent to the customer",
      detail: "Invoice email was sent to customer",
      date: new Date(Date.now() - 1000 * 60 * 60 * 12),
      completed: true,
    },
    {
      id: "5",
      description: "Order ready for shipment",
      detail: "Awaiting pickup",
      date: new Date(Date.now() - 1000 * 60 * 60 * 2),
      completed: false,
    },
  ];
};

//todo: remove mock functionality
const getMockOrderItems = (items: string): OrderItem[] => {
  const itemNames = items.split(", ");
  const colors = ["#fbbf24", "#60a5fa", "#f87171", "#a78bfa", "#34d399"];
  
  return itemNames.map((name, index) => ({
    id: `item-${index}`,
    name: name,
    variant: "(Standard) (Type A) (Medium)",
    quantity: Math.floor(Math.random() * 5) + 1,
    price: Math.floor(Math.random() * 50000) + 10000,
    color: colors[index % colors.length],
  }));
};

export function OrderQuickPreview({
  order,
  open,
  onOpenChange,
  onEditCustomer,
  onInvoice,
  onRefund,
  onEditOrder,
}: OrderQuickPreviewProps) {
  if (!order) return null;

  const timelineEvents = getMockTimelineEvents(order.id);
  const orderItems = getMockOrderItems(order.items);
  
  const subtotal = orderItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const discount = 0;
  const shipping = 100;
  const tax = Math.floor(subtotal * 0.18);
  const total = subtotal - discount + shipping + tax;

  const getPaymentStatus = (method: string) => {
    return method === "prepaid" ? "Paid" : "Pending Payment";
  };

  const getStatusColor = (status: string) => {
    const statusMap: Record<string, string> = {
      pending: "secondary",
      assigned: "default",
      confirmed: "default",
      shipped: "default",
      delivered: "default",
      cancelled: "destructive",
      ndr: "destructive",
    };
    return statusMap[status] || "secondary";
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[500px] sm:w-[600px] overflow-y-auto p-0">
        <SheetHeader className="p-6 pb-4">
          <div className="flex items-center justify-between">
            <div>
              <SheetTitle className="text-2xl">#{order.shopifyOrderId}</SheetTitle>
              <p className="text-sm text-muted-foreground mt-1">Order details</p>
            </div>
          </div>
        </SheetHeader>

        <div className="px-6 space-y-6 pb-6">
          {/* Order Info */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Created at</p>
              <p className="text-sm font-medium">
                {format(order.createdAt, "MMM dd, yyyy 'at' h:mm a")}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Payment</p>
              <Badge variant={order.paymentMethod === "prepaid" ? "default" : "secondary"}>
                {getPaymentStatus(order.paymentMethod)}
              </Badge>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Status</p>
              <Badge variant={getStatusColor(order.status) as any}>
                {order.status}
              </Badge>
            </div>
          </div>

          <Separator />

          {/* Customer Section */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-medium text-muted-foreground">Customer</p>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={onEditCustomer}
                data-testid="button-edit-customer"
              >
                <Edit className="h-4 w-4" />
              </Button>
            </div>
            <div className="space-y-2">
              <p className="font-medium">{order.customerName}</p>
              <a
                href={`mailto:customer@example.com`}
                className="flex items-center gap-2 text-sm text-blue-600 hover:underline"
                data-testid="link-customer-email"
              >
                <Mail className="h-4 w-4" />
                customer@example.com
              </a>
              <a
                href={`tel:${order.customerPhone}`}
                className="flex items-center gap-2 text-sm text-blue-600 hover:underline"
                data-testid="link-customer-phone"
              >
                <Phone className="h-4 w-4" />
                {order.customerPhone}
              </a>
            </div>
          </div>

          <Separator />

          {/* Items */}
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-4">Items</p>
            <div className="space-y-3">
              {orderItems.map((item) => (
                <div key={item.id} className="flex items-center gap-3">
                  <div
                    className="w-12 h-12 rounded-md"
                    style={{
                      background: `linear-gradient(135deg, ${item.color} 0%, ${item.color}dd 100%)`,
                    }}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{item.name}</p>
                    <p className="text-xs text-muted-foreground">{item.variant}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium">₹{item.price.toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">Qty: {item.quantity}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <Separator />

          {/* Payment Summary */}
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-4">Payment</p>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span>₹{subtotal.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Discount</span>
                <span>₹{discount.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Shipping cost</span>
                <span>₹{shipping.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Tax</span>
                <span>₹{tax.toLocaleString()}</span>
              </div>
              <Separator className="my-2" />
              <div className="flex justify-between text-base font-semibold">
                <span>Total</span>
                <span>₹{total.toLocaleString()}</span>
              </div>
            </div>
          </div>

          <Separator />

          {/* Action Buttons - At the very bottom */}
          <div className="flex gap-3 pt-2">
            <Button
              variant="secondary"
              className="flex-1"
              onClick={onInvoice}
              data-testid="button-invoice"
            >
              Invoice
            </Button>
            <Button
              variant="secondary"
              className="flex-1"
              onClick={onRefund}
              data-testid="button-refund"
            >
              Refund
            </Button>
            <Button
              variant="secondary"
              className="flex-1"
              onClick={onEditOrder}
              data-testid="button-edit-order"
            >
              Edit order
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
