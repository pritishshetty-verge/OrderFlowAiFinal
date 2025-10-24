import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Mail, Phone, Edit, CheckCircle2, Circle, Plus, X } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import type { Order } from "@/components/orders-table";
import type { Order as BackendOrder, OrderItem as BackendOrderItem, OrderStatusHistory } from "@shared/schema";
import { format } from "date-fns";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface OrderQuickPreviewProps {
  order: Order | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEditCustomer?: () => void;
  onInvoice?: () => void;
  onRefund?: () => void;
  onEditOrder?: () => void;
}

export function OrderQuickPreview({
  order,
  open,
  onOpenChange,
  onEditCustomer,
  onInvoice,
  onRefund,
  onEditOrder,
}: OrderQuickPreviewProps) {
  const { toast } = useToast();
  const [showAddTagDialog, setShowAddTagDialog] = useState(false);
  const [newTag, setNewTag] = useState("");

  // Fetch full order details from backend
  const { data: orderDetails, isLoading: orderLoading } = useQuery<BackendOrder>({
    queryKey: ["/api/orders", order?.id],
    enabled: open && !!order?.id,
  });

  // Fetch order items
  const { data: orderItems = [], isLoading: itemsLoading } = useQuery<BackendOrderItem[]>({
    queryKey: ["/api/orders", order?.id, "items"],
    enabled: open && !!order?.id,
  });

  // Fetch order history/timeline
  const { data: orderHistory = [], isLoading: historyLoading } = useQuery<OrderStatusHistory[]>({
    queryKey: ["/api/orders", order?.id, "history"],
    enabled: open && !!order?.id,
  });

  // Tags management mutation - must be before any early returns
  const updateTagsMutation = useMutation({
    mutationFn: async (tags: string[]) => {
      if (!order?.id) return;
      const res = await apiRequest("PATCH", `/api/orders/${order.id}`, { tags });
      return res.json();
    },
    onSuccess: () => {
      if (!order?.id) return;
      queryClient.invalidateQueries({ queryKey: ["/api/orders", order.id] });
      toast({
        title: "Tags Updated",
        description: "Order tags have been updated successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update tags. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Early return after all hooks
  if (!order) return null;

  const isLoading = orderLoading || itemsLoading || historyLoading;

  // Tags data
  const currentTags = orderDetails?.tags || [];

  const handleAddTag = () => {
    if (!newTag.trim()) return;
    const updatedTags = [...currentTags, newTag.trim()];
    updateTagsMutation.mutate(updatedTags);
    setNewTag("");
    setShowAddTagDialog(false);
  };

  const handleRemoveTag = (tagToRemove: string) => {
    const updatedTags = currentTags.filter((tag) => tag !== tagToRemove);
    updateTagsMutation.mutate(updatedTags);
  };

  const getTagColor = (index: number) => {
    const colors = [
      "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
      "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
      "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400",
      "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
      "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
    ];
    return colors[index % colors.length];
  };

  // Generate random colors for items (for visual consistency)
  const colors = ["#fbbf24", "#60a5fa", "#f87171", "#a78bfa", "#34d399"];
  const getItemColor = (index: number) => colors[index % colors.length];

  // Payment breakdown from real order data
  const subtotal = orderDetails ? parseFloat(orderDetails.subtotal || "0") : 0;
  const discount = orderDetails ? parseFloat(orderDetails.totalDiscount || "0") : 0;
  const shipping = orderDetails ? parseFloat(orderDetails.shippingPrice || "0") : 0;
  const tax = orderDetails ? parseFloat(orderDetails.totalTax || "0") : 0;
  const total = orderDetails ? parseFloat(orderDetails.totalPrice || "0") : 0;

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

  // Transform status history into timeline events
  const timelineEvents = orderHistory.map((history) => ({
    id: history.id,
    description: `Status changed to ${history.status}`,
    detail: history.note || undefined,
    date: new Date(history.createdAt),
    completed: true,
  }));

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

          {/* Tags Section */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <p className="text-sm font-medium text-muted-foreground">Tags:</p>
              <div className="flex flex-wrap items-center gap-2">
                {isLoading ? (
                  <Skeleton className="h-6 w-24" />
                ) : (
                  <>
                    {currentTags.map((tag, index) => (
                      <Badge
                        key={tag}
                        className={`${getTagColor(index)} border-0 font-medium text-xs px-3 py-1 no-default-hover-elevate group`}
                        data-testid={`badge-tag-${index}`}
                      >
                        {tag}
                        <button
                          onClick={() => handleRemoveTag(tag)}
                          className="ml-1.5 opacity-0 group-hover:opacity-100 transition-opacity"
                          data-testid={`button-remove-tag-${index}`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => setShowAddTagDialog(true)}
                      data-testid="button-add-tag"
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      Add
                    </Button>
                  </>
                )}
              </div>
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
                className="h-8 w-8 text-[#172033]"
                onClick={onEditCustomer}
                data-testid="button-edit-customer"
              >
                <Edit className="h-4 w-4" />
              </Button>
            </div>
            <div className="space-y-2">
              <p className="font-medium">{order.customerName}</p>
              {isLoading ? (
                <Skeleton className="h-5 w-48" />
              ) : orderDetails?.customerEmail ? (
                <a
                  href={`mailto:${orderDetails.customerEmail}`}
                  className="flex items-center gap-2 text-sm text-blue-600 hover:underline"
                  data-testid="link-customer-email"
                >
                  <Mail className="h-4 w-4" />
                  {orderDetails.customerEmail}
                </a>
              ) : null}
              <a
                href={`tel:${order.customerPhone}`}
                className="flex items-center gap-2 text-sm text-blue-600 hover:underline"
                data-testid="link-customer-phone"
              >
                <Phone className="h-4 w-4" />
                {order.customerPhone}
              </a>
              {order.shippingAddress && (
                <div className="flex items-start gap-2 text-sm text-muted-foreground pt-1" data-testid="text-shipping-address">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <span className="flex-1">{order.shippingAddress}</span>
                </div>
              )}
            </div>
          </div>

          <Separator />

          {/* Timeline */}
          {timelineEvents.length > 0 && (
            <>
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-4">Timeline</p>
                <div className="space-y-4">
                  {timelineEvents.map((event, index) => (
                    <div key={event.id} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        {event.completed ? (
                          <CheckCircle2 className="h-5 w-5 text-green-600" />
                        ) : (
                          <Circle className="h-5 w-5 text-muted-foreground" />
                        )}
                        {index < timelineEvents.length - 1 && (
                          <div className="w-px h-8 bg-border mt-1" />
                        )}
                      </div>
                      <div className="flex-1 pb-4">
                        <p className="text-sm font-medium">{event.description}</p>
                        {event.detail && (
                          <p className="text-xs text-muted-foreground mt-1">{event.detail}</p>
                        )}
                        <p className="text-xs text-muted-foreground mt-1">
                          {format(event.date, "MMM dd, yyyy 'at' h:mm a")}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <Separator />
            </>
          )}

          {/* Items */}
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-4">Items</p>
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2].map((i) => (
                  <div key={i} className="flex items-center gap-3">
                    <Skeleton className="w-12 h-12 rounded-md" />
                    <div className="flex-1">
                      <Skeleton className="h-4 w-32 mb-2" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                    <Skeleton className="h-4 w-20" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {orderItems.map((item, index) => (
                  <div key={item.id} className="flex items-center gap-3">
                    <div
                      className="w-12 h-12 rounded-md flex items-center justify-center"
                      style={{
                        background: `linear-gradient(135deg, ${getItemColor(index)} 0%, ${getItemColor(index)}dd 100%)`,
                      }}
                    >
                      {item.imageUrl ? (
                        <img src={item.imageUrl} alt={item.productName} className="w-full h-full object-cover rounded-md" />
                      ) : null}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{item.productName}</p>
                      {item.variantTitle && (
                        <p className="text-xs text-muted-foreground">{item.variantTitle}</p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium">₹{parseFloat(item.price).toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground">Qty: {item.quantity}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <Separator />

          {/* Payment Summary */}
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-4">Payment</p>
            {isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="flex justify-between">
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-4 w-16" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>₹{subtotal.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Discount</span>
                    {order.discountCode && (
                      <Badge 
                        className="bg-[#4F46E5] hover:bg-[#4338CA] text-white border-0 font-medium text-xs px-2 py-0.5 no-default-hover-elevate"
                        data-testid="badge-discount-code"
                      >
                        {order.discountCode}
                      </Badge>
                    )}
                  </div>
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
            )}
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

      {/* Add Tag Dialog */}
      <Dialog open={showAddTagDialog} onOpenChange={setShowAddTagDialog}>
        <DialogContent data-testid="dialog-add-tag">
          <DialogHeader>
            <DialogTitle>Add Tag</DialogTitle>
            <DialogDescription>
              Add a tag to help organize and categorize this order.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Input
              placeholder="Enter tag name"
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleAddTag();
                }
              }}
              data-testid="input-tag-name"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowAddTagDialog(false)}
              data-testid="button-cancel-tag"
            >
              Cancel
            </Button>
            <Button
              onClick={handleAddTag}
              disabled={!newTag.trim() || updateTagsMutation.isPending}
              data-testid="button-submit-tag"
            >
              {updateTagsMutation.isPending ? "Adding..." : "Add Tag"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Sheet>
  );
}
