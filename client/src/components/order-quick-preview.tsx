import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { 
  Mail, Phone, Edit, CheckCircle2, Circle, Plus, X, MoreHorizontal, Truck, ExternalLink, Package,
  ChevronLeft, ChevronRight, Clock, XCircle
} from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useEffect, useCallback } from "react";
import type { Order } from "@/components/orders-table";
import type { Order as BackendOrder, OrderItem as BackendOrderItem, OrderStatusHistory } from "@shared/schema";
import { format } from "date-fns";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { CancelOrderModal } from "@/components/cancel-order-modal";
import { FollowupOrderModal } from "@/components/followup-order-modal";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";

interface OrderQuickPreviewProps {
  order: Order | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentIndex: number;
  totalOrders: number;
  onNavigate: (direction: "prev" | "next") => void;
  onEditCustomer?: () => void;
  onInvoice?: () => void;
  onRefund?: () => void;
  onEditOrder?: () => void;
}

export function OrderQuickPreview({
  order,
  open,
  onOpenChange,
  currentIndex,
  totalOrders,
  onNavigate,
  onEditCustomer,
  onInvoice,
  onRefund,
  onEditOrder,
}: OrderQuickPreviewProps) {
  const { toast } = useToast();
  const [showAddTagDialog, setShowAddTagDialog] = useState(false);
  const [newTag, setNewTag] = useState("");
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [followupModalOpen, setFollowupModalOpen] = useState(false);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [confirmNotes, setConfirmNotes] = useState("");
  const [isConfirming, setIsConfirming] = useState(false);

  const { data: orderDetails, isLoading: orderLoading } = useQuery<BackendOrder>({
    queryKey: ["/api/orders", order?.id],
    enabled: open && !!order?.id,
  });

  const { data: orderItems = [], isLoading: itemsLoading } = useQuery<BackendOrderItem[]>({
    queryKey: ["/api/orders", order?.id, "items"],
    enabled: open && !!order?.id,
  });

  const { data: orderHistory = [], isLoading: historyLoading } = useQuery<OrderStatusHistory[]>({
    queryKey: ["/api/orders", order?.id, "history"],
    enabled: open && !!order?.id,
  });

  const { data: shipmentData, isLoading: shipmentLoading } = useQuery<{
    shipment?: any;
    ndrEvents?: any[];
  }>({
    queryKey: ["/api/orders", order?.id, "shipment"],
    enabled: open && !!order?.id,
  });

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

  const currentUserId = localStorage.getItem("userId");

  const confirmOrderMutation = useMutation({
    mutationFn: async ({ orderId, notes }: { orderId: string; notes?: string }) => {
      if (!currentUserId) {
        throw new Error("User not authenticated");
      }
      const res = await apiRequest("POST", `/api/orders/${orderId}/confirm`, { 
        userId: currentUserId, 
        notes 
      });
      return res.json();
    },
    onSuccess: () => {
      if (!order?.id) return;
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders", order.id] });
      toast({
        title: "Order confirmed",
        description: "The order has been successfully confirmed.",
      });
    },
    onError: (error: any) => {
      let errorMessage = "Failed to confirm order. Please try again.";
      if (error?.message) {
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
      }
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    },
  });

  const cancelOrderMutation = useMutation({
    mutationFn: async ({ orderId, reason, notes }: { orderId: string; reason: string; notes?: string }) => {
      if (!currentUserId) {
        throw new Error("User not authenticated");
      }
      const res = await apiRequest("POST", `/api/orders/${orderId}/cancel`, { 
        userId: currentUserId, 
        reason, 
        notes 
      });
      return res.json();
    },
    onSuccess: () => {
      if (!order?.id) return;
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders", order.id] });
      toast({
        title: "Order cancelled",
        description: "The order has been successfully cancelled.",
      });
    },
    onError: (error: any) => {
      let errorMessage = "Failed to cancel order. Please try again.";
      if (error?.message) {
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
      }
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    },
  });

  const followupOrderMutation = useMutation({
    mutationFn: async ({ orderId, followupAt, notes }: { orderId: string; followupAt: Date; notes?: string }) => {
      if (!currentUserId) {
        throw new Error("User not authenticated");
      }
      const res = await apiRequest("POST", `/api/orders/${orderId}/followup`, { 
        userId: currentUserId, 
        followupAt, 
        notes 
      });
      return res.json();
    },
    onSuccess: () => {
      if (!order?.id) return;
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders", order.id] });
      toast({
        title: "Follow-up scheduled",
        description: "The follow-up has been successfully scheduled.",
      });
    },
    onError: (error: any) => {
      let errorMessage = "Failed to schedule follow-up. Please try again.";
      if (error?.message) {
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
      }
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    },
  });

  const canNavigatePrev = currentIndex > 0;
  const canNavigateNext = currentIndex < totalOrders - 1;

  const handleConfirmClick = useCallback(() => {
    if (order?.callStatus === "Confirmed" || order?.callStatus === "Cancelled") return;
    setConfirmDialogOpen(true);
  }, [order?.callStatus]);

  const handleConfirmOrder = async () => {
    if (!order?.id) return;
    try {
      setIsConfirming(true);
      await confirmOrderMutation.mutateAsync({ orderId: order.id, notes: confirmNotes });
      setConfirmDialogOpen(false);
      setConfirmNotes("");
    } catch (error) {
      console.error("Error confirming order:", error);
    } finally {
      setIsConfirming(false);
    }
  };

  const handleCancelClick = useCallback(() => {
    if (order?.callStatus === "Confirmed" || order?.callStatus === "Cancelled") return;
    setCancelModalOpen(true);
  }, [order?.callStatus]);

  const handleCancelOrder = async (reason: string, notes?: string) => {
    if (!order?.id) return;
    await cancelOrderMutation.mutateAsync({ orderId: order.id, reason, notes });
  };

  const handleFollowupClick = useCallback(() => {
    if (order?.callStatus === "Confirmed" || order?.callStatus === "Cancelled") return;
    setFollowupModalOpen(true);
  }, [order?.callStatus]);

  const handleScheduleFollowup = async (followupAt: Date, notes?: string) => {
    if (!order?.id) return;
    await followupOrderMutation.mutateAsync({ orderId: order.id, followupAt, notes });
  };

  const handleNavigateNext = useCallback(() => {
    if (canNavigateNext) {
      onNavigate("next");
    }
  }, [canNavigateNext, onNavigate]);

  const handleNavigatePrev = useCallback(() => {
    if (canNavigatePrev) {
      onNavigate("prev");
    }
  }, [canNavigatePrev, onNavigate]);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
        return;
      }

      if (confirmDialogOpen || cancelModalOpen || followupModalOpen || showAddTagDialog) {
        return;
      }

      const isTerminalStatus = order?.callStatus === "Confirmed" || order?.callStatus === "Cancelled";

      switch (e.key.toLowerCase()) {
        case "f":
          if (!isTerminalStatus) {
            e.preventDefault();
            handleFollowupClick();
          }
          break;
        case "c":
          if (!isTerminalStatus) {
            e.preventDefault();
            handleConfirmClick();
          }
          break;
        case "x":
          if (!isTerminalStatus) {
            e.preventDefault();
            handleCancelClick();
          }
          break;
        case "enter":
          e.preventDefault();
          handleNavigateNext();
          break;
        case "arrowleft":
          e.preventDefault();
          handleNavigatePrev();
          break;
        case "arrowright":
          e.preventDefault();
          handleNavigateNext();
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, order?.callStatus, confirmDialogOpen, cancelModalOpen, followupModalOpen, showAddTagDialog, handleConfirmClick, handleCancelClick, handleFollowupClick, handleNavigateNext, handleNavigatePrev]);

  if (!order) return null;

  const isLoading = orderLoading || itemsLoading || historyLoading;
  const currentTags = orderDetails?.tags || [];
  const VISIBLE_TAG_LIMIT = 3;
  const visibleTags = currentTags.slice(0, VISIBLE_TAG_LIMIT);
  const hiddenTags = currentTags.slice(VISIBLE_TAG_LIMIT);
  const hasMoreTags = hiddenTags.length > 0;

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
      "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400",
      "bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400",
      "bg-pink-50 text-pink-700 dark:bg-pink-900/20 dark:text-pink-400",
      "bg-purple-50 text-purple-700 dark:bg-purple-900/20 dark:text-purple-400",
      "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400",
    ];
    return colors[index % colors.length];
  };

  const colors = ["#fbbf24", "#60a5fa", "#f87171", "#a78bfa", "#34d399"];
  const getItemColor = (index: number) => colors[index % colors.length];

  const subtotal = orderDetails ? parseFloat(orderDetails.subtotal || "0") : 0;
  const discount = orderDetails ? parseFloat(orderDetails.totalDiscount || "0") : 0;
  const shipping = orderDetails ? parseFloat(orderDetails.shippingPrice || "0") : 0;
  const tax = orderDetails ? parseFloat(orderDetails.totalTax || "0") : 0;
  const total = orderDetails ? parseFloat(orderDetails.totalPrice || "0") : 0;

  const getPaymentBadgeStyle = (method: string) => {
    return method === "prepaid" 
      ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
      : "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400";
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

  const getCallStatusColor = (status?: string) => {
    switch (status) {
      case "Confirmed":
        return "text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20";
      case "Cancelled":
        return "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20";
      case "Follow Up":
        return "text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20";
      default:
        return "text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20";
    }
  };

  const timelineEvents = orderHistory.map((history) => ({
    id: history.id,
    description: `Status changed to ${history.status}`,
    detail: history.note || undefined,
    date: new Date(history.createdAt),
    completed: true,
  }));

  const isTerminalStatus = order.callStatus === "Confirmed" || order.callStatus === "Cancelled";
  const isMutating = confirmOrderMutation.isPending || cancelOrderMutation.isPending || followupOrderMutation.isPending;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[500px] sm:w-[600px] p-0 my-4 mr-4 rounded-l-xl shadow-2xl !h-auto max-h-[calc(100vh-2rem)] inset-y-auto top-4 bottom-4 flex flex-col">
        {/* STICKY HEADER */}
        <div className="flex-shrink-0 border-b bg-card px-4 py-3 rounded-tl-xl">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={handleNavigatePrev}
                disabled={!canNavigatePrev}
                className="h-8 w-8"
                data-testid="button-prev-order"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="flex items-center gap-2">
                <span className="text-lg font-semibold" data-testid="text-order-id">#{order.shopifyOrderId}</span>
                <Badge className={`${getPaymentBadgeStyle(order.paymentMethod)} border-0 font-medium`} data-testid="badge-payment-status">
                  {order.paymentMethod === "prepaid" ? "Prepaid" : "COD"}
                </Badge>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleNavigateNext}
                disabled={!canNavigateNext}
                className="h-8 w-8"
                data-testid="button-next-order"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground" data-testid="text-order-position">
                {currentIndex + 1} of {totalOrders}
              </span>
              <Separator orientation="vertical" className="h-5" />
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onOpenChange(false)}
                className="h-8 w-8"
                data-testid="button-close-preview"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* SCROLLABLE BODY */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {/* Order Info */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Created at</p>
              <p className="text-sm font-medium">
                {format(order.createdAt, "MMM dd, yyyy 'at' h:mm a")}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Payment</p>
              <Badge variant={order.paymentMethod === "prepaid" ? "default" : "secondary"}>
                {order.paymentMethod === "prepaid" ? "Paid" : "Pending Payment"}
              </Badge>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Status</p>
              <Badge variant={getStatusColor(order.status) as any}>
                {order.status}
              </Badge>
            </div>
          </div>

          <Separator />

          {/* Tags Section */}
          <div>
            <div className="flex items-center gap-2">
              <p className="text-xs font-semibold text-foreground whitespace-nowrap">Tags:</p>
              <div className="flex items-center gap-2 flex-1 overflow-hidden">
                {isLoading ? (
                  <Skeleton className="h-7 w-24 rounded-full" />
                ) : (
                  <>
                    {visibleTags.map((tag, index) => (
                      <span
                        key={tag}
                        className={`${getTagColor(index)} rounded-full px-3 py-1.5 text-xs font-medium inline-flex items-center gap-1.5 group hover-elevate active-elevate-2 cursor-default flex-shrink-0`}
                        data-testid={`badge-tag-${index}`}
                      >
                        {tag}
                        <button
                          onClick={() => handleRemoveTag(tag)}
                          className="opacity-0 group-hover:opacity-100 transition-opacity hover:scale-110"
                          data-testid={`button-remove-tag-${index}`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                    {hasMoreTags && (
                      <Popover>
                        <PopoverTrigger asChild>
                          <button
                            className="rounded-full px-3 py-1.5 text-xs font-medium bg-gray-50 text-gray-600 border border-gray-200 hover-elevate active-elevate-2 inline-flex items-center gap-1 flex-shrink-0 dark:bg-gray-800/50 dark:text-gray-400 dark:border-gray-700"
                            data-testid="button-more-tags"
                          >
                            <MoreHorizontal className="h-3 w-3" />
                            {hiddenTags.length} more
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-3" align="start">
                          <div className="flex flex-col gap-2">
                            <p className="text-xs font-semibold text-muted-foreground mb-1">All Tags</p>
                            <div className="flex flex-wrap gap-2 max-w-xs">
                              {hiddenTags.map((tag, index) => (
                                <span
                                  key={tag}
                                  className={`${getTagColor(index + VISIBLE_TAG_LIMIT)} rounded-full px-3 py-1.5 text-xs font-medium inline-flex items-center gap-1.5 group hover-elevate active-elevate-2 cursor-default`}
                                  data-testid={`badge-hidden-tag-${index}`}
                                >
                                  {tag}
                                  <button
                                    onClick={() => handleRemoveTag(tag)}
                                    className="opacity-0 group-hover:opacity-100 transition-opacity hover:scale-110"
                                    data-testid={`button-remove-hidden-tag-${index}`}
                                  >
                                    <X className="h-3 w-3" />
                                  </button>
                                </span>
                              ))}
                            </div>
                          </div>
                        </PopoverContent>
                      </Popover>
                    )}
                    <button
                      onClick={() => setShowAddTagDialog(true)}
                      className="rounded-full px-3 py-1.5 text-xs font-medium bg-gray-50 text-gray-600 border border-gray-200 hover-elevate active-elevate-2 inline-flex items-center gap-1 flex-shrink-0 dark:bg-gray-800/50 dark:text-gray-400 dark:border-gray-700"
                      data-testid="button-add-tag"
                    >
                      <Plus className="h-3 w-3" />
                      Add
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>

          <Separator />

          {/* Customer Section */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-muted-foreground">Customer</p>
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
            <div className="space-y-1.5">
              <p className="text-sm font-medium">{order.customerName}</p>
              {isLoading ? (
                <Skeleton className="h-4 w-48" />
              ) : orderDetails?.customerEmail ? (
                <a
                  href={`mailto:${orderDetails.customerEmail}`}
                  className="flex items-center gap-1.5 text-xs text-blue-600 hover:underline"
                  data-testid="link-customer-email"
                >
                  <Mail className="h-3.5 w-3.5" />
                  {orderDetails.customerEmail}
                </a>
              ) : null}
              <a
                href={`tel:${order.customerPhone}`}
                className="flex items-center gap-1.5 text-xs text-blue-600 hover:underline"
                data-testid="link-customer-phone"
              >
                <Phone className="h-3.5 w-3.5" />
                {order.customerPhone}
              </a>
              {order.shippingAddress && (
                <div className="flex items-start gap-1.5 text-xs text-muted-foreground pt-0.5" data-testid="text-shipping-address">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <span className="flex-1">{order.shippingAddress}</span>
                </div>
              )}
            </div>
          </div>

          <Separator />

          {/* Shipment Tracking Section */}
          {(shipmentData?.shipment || orderDetails?.callStatus === "Confirmed") && (
            <>
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Shipment Tracking</p>
                {shipmentLoading ? (
                  <Skeleton className="h-20 w-full rounded-lg" />
                ) : shipmentData?.shipment ? (
                  <div className="rounded-lg border p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Truck className="h-4 w-4 text-blue-600" />
                        <span className="text-sm font-medium">{shipmentData.shipment.courierName || "Courier"}</span>
                      </div>
                      <Badge variant="default" data-testid="badge-shipment-status">
                        {shipmentData.shipment.status || "Created"}
                      </Badge>
                    </div>
                    {shipmentData.shipment.awb && (
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">AWB:</span>
                        <span className="font-mono font-medium" data-testid="text-awb">{shipmentData.shipment.awb}</span>
                      </div>
                    )}
                    {shipmentData.shipment.trackingUrl && (
                      <a
                        href={shipmentData.shipment.trackingUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 text-xs text-blue-600 hover:underline"
                        data-testid="link-track-shipment"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        Track Shipment
                      </a>
                    )}
                    {shipmentData.ndrEvents && shipmentData.ndrEvents.length > 0 && (
                      <div className="mt-2 pt-2 border-t">
                        <p className="text-xs font-medium text-destructive mb-1">NDR Events</p>
                        {shipmentData.ndrEvents.map((ndr: any, idx: number) => (
                          <div key={idx} className="text-xs text-muted-foreground">
                            {ndr.ndrReason} - {format(new Date(ndr.ndrDate), "MMM dd, yyyy")}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : orderDetails?.callStatus === "Confirmed" ? (
                  <div className="rounded-lg border border-dashed p-3 text-center">
                    <Package className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                    <p className="text-xs text-muted-foreground">No shipment created yet</p>
                    <p className="text-xs text-muted-foreground">Go to Fulfil page to create shipment</p>
                  </div>
                ) : null}
              </div>
              <Separator />
            </>
          )}

          {/* Timeline */}
          {timelineEvents.length > 0 && (
            <>
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Timeline</p>
                <div className="space-y-2">
                  {timelineEvents.map((event, index) => (
                    <div key={event.id} className="flex gap-2">
                      <div className="flex flex-col items-center">
                        {event.completed ? (
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                        ) : (
                          <Circle className="h-4 w-4 text-muted-foreground" />
                        )}
                        {index < timelineEvents.length - 1 && (
                          <div className="w-px h-6 bg-border mt-1" />
                        )}
                      </div>
                      <div className="flex-1 pb-2">
                        <p className="text-xs font-medium">{event.description}</p>
                        {event.detail && (
                          <p className="text-xs text-muted-foreground mt-0.5">{event.detail}</p>
                        )}
                        <p className="text-xs text-muted-foreground mt-0.5">
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
            <p className="text-xs font-medium text-muted-foreground mb-2">Items</p>
            {isLoading ? (
              <div className="space-y-2">
                {[1, 2].map((i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Skeleton className="w-10 h-10 rounded-md" />
                    <div className="flex-1">
                      <Skeleton className="h-3 w-32 mb-1" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                    <Skeleton className="h-3 w-20" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                {orderItems.map((item, index) => (
                  <div key={item.id} className="flex items-center gap-2">
                    <div
                      className="w-10 h-10 rounded-md flex items-center justify-center flex-shrink-0"
                      style={{
                        background: `linear-gradient(135deg, ${getItemColor(index)} 0%, ${getItemColor(index)}dd 100%)`,
                      }}
                    >
                      {item.imageUrl ? (
                        <img src={item.imageUrl} alt={item.productName} className="w-full h-full object-cover rounded-md" />
                      ) : null}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium">{item.productName}</p>
                      {item.variantTitle && (
                        <p className="text-xs text-muted-foreground">{item.variantTitle}</p>
                      )}
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-xs font-medium">₹{parseFloat(item.price).toLocaleString()}</p>
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
            <p className="text-xs font-medium text-muted-foreground mb-2">Payment</p>
            {isLoading ? (
              <div className="space-y-1.5">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="flex justify-between">
                    <Skeleton className="h-3 w-20" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>₹{subtotal.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <div className="flex items-center gap-1.5">
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
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Shipping cost</span>
                  <span>₹{shipping.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Tax</span>
                  <span>₹{tax.toLocaleString()}</span>
                </div>
                <Separator className="my-1.5" />
                <div className="flex justify-between text-sm font-semibold">
                  <span>Total</span>
                  <span>₹{total.toLocaleString()}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* STICKY FOOTER - Call Status Controls */}
        <div className="flex-shrink-0 border-t bg-card px-4 py-3 rounded-bl-xl">
          <div className="flex items-center justify-between gap-2">
            {/* Left: Prev Navigation */}
            <Button
              variant="ghost"
              size="icon"
              onClick={handleNavigatePrev}
              disabled={!canNavigatePrev || isMutating}
              className="h-8 w-8 flex-shrink-0"
              data-testid="button-footer-prev"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>

            {/* Center: Status Action Buttons */}
            <div className="flex items-center gap-1.5 flex-1 justify-center">
              {isTerminalStatus ? (
                <div className={`px-4 py-2 rounded-md text-sm font-medium ${getCallStatusColor(order.callStatus)}`} data-testid="text-call-status">
                  {order.callStatus}
                </div>
              ) : (
                <>
                  <Button
                    variant={order.callStatus === "Follow Up" ? "default" : "outline"}
                    size="sm"
                    onClick={handleFollowupClick}
                    disabled={isMutating}
                    className={order.callStatus === "Follow Up" 
                      ? "gap-1.5 bg-yellow-500 hover:bg-yellow-600 text-white border-0" 
                      : "gap-1.5 text-yellow-600 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800 hover:bg-yellow-50 dark:hover:bg-yellow-900/20"
                    }
                    data-testid="button-footer-followup"
                  >
                    <Clock className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Follow Up</span>
                    <kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-black/10 dark:bg-white/10 rounded">F</kbd>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCancelClick}
                    disabled={isMutating}
                    className="gap-1.5 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-900/20"
                    data-testid="button-footer-cancel"
                  >
                    <XCircle className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Cancel</span>
                    <kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-muted rounded border">X</kbd>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleConfirmClick}
                    disabled={isMutating}
                    className="gap-1.5 text-green-600 dark:text-green-400 border-green-200 dark:border-green-800 hover:bg-green-50 dark:hover:bg-green-900/20"
                    data-testid="button-footer-confirm"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Confirm</span>
                    <kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-muted rounded border">C</kbd>
                  </Button>
                </>
              )}
            </div>

            {/* Right: Save & Next */}
            <Button
              variant="default"
              size="sm"
              onClick={handleNavigateNext}
              disabled={!canNavigateNext || isMutating}
              className="gap-1.5 flex-shrink-0"
              data-testid="button-footer-save-next"
            >
              Save & Next
              <kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-black/20 dark:bg-white/20 rounded">↵</kbd>
            </Button>
          </div>
        </div>
      </SheetContent>

      {/* Confirm Dialog */}
      <AlertDialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
        <AlertDialogContent data-testid="dialog-confirm-order">
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Order</AlertDialogTitle>
            <AlertDialogDescription>
              Order #{order.shopifyOrderId} - Mark this order as confirmed and move it to Fulfil section?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-2">
            <Label htmlFor="confirm-notes">Notes (Optional)</Label>
            <Input
              id="confirm-notes"
              value={confirmNotes}
              onChange={(e) => setConfirmNotes(e.target.value)}
              placeholder="Add any notes..."
              className="mt-1.5"
              data-testid="input-confirm-notes"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={isConfirming}
              data-testid="button-cancel-dialog"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmOrder}
              disabled={isConfirming}
              data-testid="button-confirm-order"
            >
              {isConfirming && <Clock className="mr-2 h-4 w-4 animate-spin" />}
              Confirm Order
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cancel Modal */}
      <CancelOrderModal
        open={cancelModalOpen}
        onOpenChange={setCancelModalOpen}
        onConfirm={handleCancelOrder}
        orderNumber={order.shopifyOrderId}
      />

      {/* Follow-up Modal */}
      <FollowupOrderModal
        open={followupModalOpen}
        onOpenChange={setFollowupModalOpen}
        onConfirm={handleScheduleFollowup}
        orderNumber={order.shopifyOrderId}
      />

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
