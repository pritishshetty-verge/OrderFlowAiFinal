import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Mail, Phone, Edit, CheckCircle2, Circle, Plus, X, MoreHorizontal, Truck, ExternalLink, Package,
  ChevronLeft, ChevronRight, Clock, XCircle, MapPin, User, History, FileText
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
import { PaymentBadge } from "@/components/payment-badge";
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
import { EditAddressDialog } from "@/components/edit-address-dialog";

// Helper to parse history notes and extract user comments
// Example input: "Follow-up scheduled for 1/3/2026, 2:00:24 PM: SWITCH OFF"
// Returns: { systemText: "Follow-up scheduled for 1/3/2026, 2:00:24 PM", userNote: "SWITCH OFF" }
function parseHistoryNote(note: string | null | undefined): { systemText: string | null; userNote: string | null } {
  if (!note) return { systemText: null, userNote: null };
  
  // Pattern: Look for timestamp pattern followed by colon and user note
  // Matches formats like "MM/DD/YYYY, H:MM:SS AM/PM:" or "MMM DD, YYYY at H:MM AM:"
  const timestampColonPattern = /^(.+?\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM)?)\s*:\s*(.+)$/i;
  const match = note.match(timestampColonPattern);
  
  if (match) {
    return {
      systemText: match[1].trim(),
      userNote: match[2].trim()
    };
  }
  
  // No timestamp pattern found - treat entire string as system text
  return { systemText: note, userNote: null };
}

// Fieldset-style note component with bordered box and "Notes" legend
function FieldsetNote({ note }: { note: string }) {
  return (
    <div className="relative mt-3 rounded-md border border-zinc-800 dark:border-zinc-400 px-3 py-2">
      <span className="absolute -top-2 left-2 bg-white dark:bg-zinc-900 px-1 text-[10px] font-medium text-muted-foreground">
        Notes
      </span>
      <p className="text-xs text-foreground">{note}</p>
    </div>
  );
}

interface OrderQuickPreviewProps {
  order: Order | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentIndex: number;
  totalOrders: number;
  onNavigate: (direction: "prev" | "next") => void;
  onStatusUpdate?: () => void;
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
  onStatusUpdate,
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
  const [selectedAction, setSelectedAction] = useState<string>("");
  const [pendingAutoAdvance, setPendingAutoAdvance] = useState(false);
  const [editAddressOpen, setEditAddressOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<string>("overview");

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

  // Unified tracking abstraction: prioritize Shiprocket data, fallback to order tracking fields
  const activeTracking = {
    awb: shipmentData?.shipment?.awb || orderDetails?.trackingNumber,
    url: shipmentData?.shipment?.trackingUrl || orderDetails?.trackingUrl,
    courier: shipmentData?.shipment?.courierName || orderDetails?.courierName,
  };

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

  // Global Ctrl+Enter listener for Confirm Order dialog
  useEffect(() => {
    if (!confirmDialogOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        // Directly trigger submit - notes can be empty
        if (!isConfirming && order?.id) {
          handleConfirmOrderSubmit();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [confirmDialogOpen, isConfirming, order?.id]);

  const handleConfirmOrderSubmit = async () => {
    if (!order?.id || isConfirming) return;
    try {
      setIsConfirming(true);
      await confirmOrderMutation.mutateAsync({ orderId: order.id, notes: confirmNotes || undefined });
      setConfirmDialogOpen(false);
      setConfirmNotes("");
      setSelectedAction("");
      
      // Notify parent to refresh data
      onStatusUpdate?.();
      
      // Auto-advance if triggered via Save & Next
      if (pendingAutoAdvance && canNavigateNext) {
        setPendingAutoAdvance(false);
        setTimeout(() => onNavigate("next"), 100);
      } else {
        setPendingAutoAdvance(false);
      }
    } catch (error) {
      console.error("Error confirming order:", error);
      setPendingAutoAdvance(false);
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
    try {
      await cancelOrderMutation.mutateAsync({ orderId: order.id, reason, notes });
      setCancelModalOpen(false);
      setSelectedAction("");
      
      // Notify parent to refresh data
      onStatusUpdate?.();
      
      // Auto-advance if triggered via Save & Next
      if (pendingAutoAdvance && canNavigateNext) {
        setPendingAutoAdvance(false);
        setTimeout(() => onNavigate("next"), 100);
      } else {
        setPendingAutoAdvance(false);
      }
    } catch (error) {
      console.error("Error cancelling order:", error);
      setPendingAutoAdvance(false);
      throw error;
    }
  };

  const handleFollowupClick = useCallback(() => {
    if (order?.callStatus === "Confirmed" || order?.callStatus === "Cancelled") return;
    setFollowupModalOpen(true);
  }, [order?.callStatus]);

  const handleScheduleFollowup = async (followupAt: Date, notes?: string) => {
    if (!order?.id) return;
    try {
      await followupOrderMutation.mutateAsync({ orderId: order.id, followupAt, notes });
      setFollowupModalOpen(false);
      setSelectedAction("");
      
      // Notify parent to refresh data
      onStatusUpdate?.();
      
      // Auto-advance if triggered via Save & Next
      if (pendingAutoAdvance && canNavigateNext) {
        setPendingAutoAdvance(false);
        setTimeout(() => onNavigate("next"), 100);
      } else {
        setPendingAutoAdvance(false);
      }
    } catch (error) {
      console.error("Error scheduling followup:", error);
      setPendingAutoAdvance(false);
      throw error;
    }
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

  const handleSaveAndNext = useCallback(() => {
    const isTerminal = order?.callStatus === "Confirmed" || order?.callStatus === "Cancelled";
    
    if (!selectedAction || isTerminal) {
      if (canNavigateNext) {
        onNavigate("next");
      }
      return;
    }

    // Set flag to auto-advance after successful status update
    setPendingAutoAdvance(true);

    switch (selectedAction) {
      case "confirm":
        setConfirmDialogOpen(true);
        break;
      case "cancel":
        setCancelModalOpen(true);
        break;
      case "followup":
        setFollowupModalOpen(true);
        break;
      default:
        setPendingAutoAdvance(false);
        if (canNavigateNext) {
          onNavigate("next");
        }
    }
  }, [selectedAction, order?.callStatus, canNavigateNext, onNavigate]);

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

      const isTerminal = order?.callStatus === "Confirmed" || order?.callStatus === "Cancelled";

      switch (e.key.toLowerCase()) {
        case "f":
          if (!isTerminal) {
            e.preventDefault();
            setSelectedAction("followup");
          }
          break;
        case "c":
          if (!isTerminal) {
            e.preventDefault();
            setSelectedAction("confirm");
          }
          break;
        case "x":
          if (!isTerminal) {
            e.preventDefault();
            setSelectedAction("cancel");
          }
          break;
        case "enter":
          e.preventDefault();
          handleSaveAndNext();
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
  }, [open, order?.callStatus, confirmDialogOpen, cancelModalOpen, followupModalOpen, showAddTagDialog, handleSaveAndNext, handleNavigateNext, handleNavigatePrev]);

  if (!order) return null;

  const isLoading = orderLoading || itemsLoading || historyLoading;
  const currentTags = orderDetails?.tags || [];
  const VISIBLE_TAG_LIMIT = 2;
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

  const timelineEvents = orderHistory.map((history) => {
    const parsed = parseHistoryNote(history.note);
    return {
      id: history.id,
      description: `Status changed to ${history.status}`,
      systemText: parsed.systemText,
      userNote: parsed.userNote,
      date: new Date(history.createdAt),
      completed: true,
    };
  });

  const isTerminalStatus = order.callStatus === "Confirmed" || order.callStatus === "Cancelled";
  const isMutating = confirmOrderMutation.isPending || cancelOrderMutation.isPending || followupOrderMutation.isPending;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[500px] sm:w-[600px] p-0 my-4 mr-4 rounded-l-xl shadow-2xl !h-auto max-h-[calc(100vh-2rem)] inset-y-auto top-4 bottom-4 flex flex-col">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full">
          {/* STICKY HEADER */}
          <div className="flex-shrink-0 border-b bg-card rounded-tl-xl">
            {/* Row 1: Order ID, Payment Badge, Navigation, Close */}
            <div className="flex items-center justify-between gap-2 px-4 py-3">
              {/* Left: Order ID + Payment Badge */}
              <div className="flex items-center gap-2">
                <span className="text-lg font-semibold" data-testid="text-order-id">#{order.shopifyOrderId}</span>
                <PaymentBadge 
                  method={order.paymentMethod} 
                  financialStatus={order.financialStatus}
                />
              </div>
              {/* Right: Navigation + Close */}
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleNavigatePrev}
                  disabled={!canNavigatePrev}
                  className="h-7 w-7"
                  data-testid="button-prev-order"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-xs text-muted-foreground min-w-[60px] text-center" data-testid="text-order-position">
                  {currentIndex + 1} of {totalOrders}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleNavigateNext}
                  disabled={!canNavigateNext}
                  className="h-7 w-7"
                  data-testid="button-next-order"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <Separator orientation="vertical" className="h-5 mx-1" />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onOpenChange(false)}
                  className="h-7 w-7"
                  data-testid="button-close-preview"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
            {/* Row 2: Tabs Navigation */}
            <TabsList className="w-full justify-start h-auto p-0 bg-transparent border-t">
              <TabsTrigger 
                value="overview" 
                className="flex-1 data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none py-2 text-sm"
                data-testid="tab-overview"
              >
                <FileText className="h-4 w-4 mr-1.5" />
                Overview
              </TabsTrigger>
              <TabsTrigger 
                value="shipment" 
                className="flex-1 data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none py-2 text-sm"
                data-testid="tab-shipment"
              >
                <Truck className="h-4 w-4 mr-1.5" />
                Shipment
              </TabsTrigger>
              <TabsTrigger 
                value="history" 
                className="flex-1 data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none py-2 text-sm"
                data-testid="tab-history"
              >
                <History className="h-4 w-4 mr-1.5" />
                History
              </TabsTrigger>
            </TabsList>
          </div>

          {/* SCROLLABLE BODY - Overview Tab */}
          <TabsContent value="overview" className="flex-1 overflow-y-auto px-4 py-3 space-y-3 mt-0">
          {/* Order Info: Created at | Status | Tags */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Created at</p>
              <p className="text-sm font-medium">
                {format(order.createdAt, "MMM dd, yyyy")}
              </p>
              <p className="text-xs text-muted-foreground">
                {format(order.createdAt, "h:mm a")}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Status</p>
              <Badge variant={getStatusColor(order.status) as any}>
                {order.status}
              </Badge>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Tags</p>
              <div className="flex flex-row items-center gap-1 overflow-hidden h-6">
                {isLoading ? (
                  <Skeleton className="h-5 w-16 rounded-full flex-shrink-0" />
                ) : currentTags.length === 0 ? (
                  <span className="text-xs text-muted-foreground">—</span>
                ) : (
                  <>
                    {visibleTags.map((tag, index) => (
                      <Tooltip key={tag}>
                        <TooltipTrigger asChild>
                          <span
                            className={`${getTagColor(index)} rounded-full px-2 py-0.5 text-xs font-medium inline-flex items-center gap-1 group cursor-default flex-shrink-0 max-w-[80px] truncate`}
                            data-testid={`badge-tag-${index}`}
                          >
                            <span className="truncate">{tag}</span>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleRemoveTag(tag); }}
                              className="opacity-0 group-hover:opacity-100 transition-opacity hover:scale-110 flex-shrink-0"
                              data-testid={`button-remove-tag-${index}`}
                            >
                              <X className="h-2.5 w-2.5" />
                            </button>
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="text-xs">
                          {tag}
                        </TooltipContent>
                      </Tooltip>
                    ))}
                    {hasMoreTags && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span
                            className="rounded-full px-2 py-0.5 text-xs font-medium bg-muted text-muted-foreground inline-flex items-center cursor-default flex-shrink-0"
                            data-testid="button-more-tags"
                          >
                            +{hiddenTags.length} more
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="max-w-xs">
                          <div className="flex flex-wrap gap-1.5 py-1">
                            {currentTags.map((tag, index) => (
                              <span
                                key={tag}
                                className={`${getTagColor(index)} rounded-full px-2 py-0.5 text-xs font-medium`}
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    )}
                    <button
                      onClick={() => setShowAddTagDialog(true)}
                      className="rounded-full p-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors flex-shrink-0"
                      data-testid="button-add-tag"
                    >
                      <Plus className="h-3 w-3" />
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
                onClick={() => setEditAddressOpen(true)}
                data-testid="button-edit-customer"
              >
                <Edit className="h-4 w-4" />
              </Button>
            </div>
            <div className="space-y-1.5">
              <p className="text-sm font-medium">{orderDetails?.customerName || order.customerName}</p>
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
                href={`tel:${orderDetails?.customerPhone || order.customerPhone}`}
                className="flex items-center gap-1.5 text-xs text-blue-600 hover:underline"
                data-testid="link-customer-phone"
              >
                <Phone className="h-3.5 w-3.5" />
                {orderDetails?.customerPhone || order.customerPhone}
              </a>
              {(() => {
                const displayAddress = orderDetails 
                  ? [
                      orderDetails.shippingAddressLine1,
                      orderDetails.shippingAddressLine2,
                      orderDetails.shippingCity,
                      orderDetails.shippingState,
                      orderDetails.shippingPincode,
                      orderDetails.shippingCountry
                    ].filter(Boolean).join(", ")
                  : order.shippingAddress;
                return displayAddress ? (
                  <div className="flex items-start gap-1.5 text-xs text-muted-foreground pt-0.5" data-testid="text-shipping-address">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <span className="flex-1">{displayAddress}</span>
                  </div>
                ) : null;
              })()}
            </div>
          </div>

          <Separator />

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
                    {item.imageUrl ? (
                      <img 
                        src={item.imageUrl} 
                        alt={item.productName} 
                        className="w-12 h-12 object-cover rounded-md flex-shrink-0 bg-muted"
                      />
                    ) : (
                      <div
                        className="w-12 h-12 rounded-md flex items-center justify-center flex-shrink-0"
                        style={{
                          background: `linear-gradient(135deg, ${getItemColor(index)} 0%, ${getItemColor(index)}dd 100%)`,
                        }}
                      >
                        <Package className="w-5 h-5 text-white/80" />
                      </div>
                    )}
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
          </TabsContent>

          {/* SCROLLABLE BODY - Shipment Tab */}
          <TabsContent value="shipment" className="flex-1 overflow-y-auto px-4 py-3 space-y-4 mt-0">
            {/* Tracking Details */}
            {activeTracking.awb && (
              <div className="rounded-lg border p-3">
                <p className="text-xs font-medium text-muted-foreground mb-1.5">Tracking Number</p>
                {activeTracking.url ? (
                  <a
                    href={activeTracking.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 font-medium hover:underline flex items-center gap-2"
                    data-testid="link-tracking-number"
                  >
                    <span className="font-mono">{activeTracking.awb}</span>
                    <ExternalLink className="h-4 w-4" />
                  </a>
                ) : (
                  <span className="font-mono font-medium" data-testid="text-tracking-number">
                    {activeTracking.awb}
                  </span>
                )}
                {activeTracking.courier && (
                  <p className="text-xs text-muted-foreground mt-1">
                    via {activeTracking.courier}
                  </p>
                )}
              </div>
            )}

            {/* Shipping Address */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-muted-foreground">Shipping Address</p>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setEditAddressOpen(true)}
                  data-testid="button-edit-address-shipment"
                >
                  <Edit className="h-3.5 w-3.5" />
                </Button>
              </div>
              <div className="rounded-lg border p-3 space-y-1.5">
                <p className="text-sm font-medium">{orderDetails?.customerName || order.customerName}</p>
                <p className="text-xs text-muted-foreground">{orderDetails?.customerPhone || order.customerPhone}</p>
                {(() => {
                  const displayAddress = orderDetails 
                    ? [
                        orderDetails.shippingAddressLine1,
                        orderDetails.shippingAddressLine2,
                        orderDetails.shippingCity,
                        orderDetails.shippingState,
                        orderDetails.shippingPincode,
                        orderDetails.shippingCountry
                      ].filter(Boolean).join(", ")
                    : order.shippingAddress;
                  return displayAddress ? (
                    <p className="text-xs text-muted-foreground" data-testid="text-shipment-address">{displayAddress}</p>
                  ) : null;
                })()}
              </div>
            </div>

            <Separator />

            {/* Shipment Status Timeline */}
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-3">Shipment Status</p>
              {shipmentLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="flex items-start gap-3">
                      <Skeleton className="h-6 w-6 rounded-full" />
                      <div className="flex-1">
                        <Skeleton className="h-4 w-24 mb-1" />
                        <Skeleton className="h-3 w-32" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="relative">
                  {/* Vertical Timeline */}
                  {(() => {
                    const shipmentStatus = shipmentData?.shipment?.status || order.status;
                    const steps = [
                      { key: "created", label: "Order Created", icon: FileText },
                      { key: "unfulfilled", label: "Processing", icon: Package },
                      { key: "shipped", label: "Shipped", icon: Truck },
                      { key: "delivered", label: "Delivered", icon: CheckCircle2 },
                    ];
                    
                    const getStepStatus = (stepKey: string) => {
                      const statusOrder = ["pending", "assigned", "confirmed", "shipped", "delivered"];
                      const currentIdx = statusOrder.indexOf(shipmentStatus?.toLowerCase() || "pending");
                      const stepMap: Record<string, number> = {
                        created: 0,
                        unfulfilled: 1,
                        shipped: 3,
                        delivered: 4,
                      };
                      return currentIdx >= stepMap[stepKey] ? "completed" : "pending";
                    };

                    return (
                      <div className="space-y-0">
                        {steps.map((step, index) => {
                          const status = getStepStatus(step.key);
                          const isCompleted = status === "completed";
                          const Icon = step.icon;
                          const isLast = index === steps.length - 1;
                          
                          return (
                            <div key={step.key} className="flex items-start gap-3 relative">
                              {/* Vertical line */}
                              {!isLast && (
                                <div 
                                  className={`absolute left-3 top-6 w-0.5 h-8 ${isCompleted ? 'bg-green-500' : 'bg-muted'}`}
                                  style={{ transform: 'translateX(-50%)' }}
                                />
                              )}
                              {/* Icon */}
                              <div className={`relative z-10 flex items-center justify-center w-6 h-6 rounded-full flex-shrink-0 ${
                                isCompleted 
                                  ? 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400' 
                                  : 'bg-muted text-muted-foreground'
                              }`}>
                                <Icon className="h-3.5 w-3.5" />
                              </div>
                              {/* Content */}
                              <div className="flex-1 pb-6">
                                <p className={`text-sm font-medium ${isCompleted ? 'text-foreground' : 'text-muted-foreground'}`}>
                                  {step.label}
                                </p>
                                {isCompleted && step.key === "shipped" && activeTracking.awb && (
                                  <p className="text-xs text-muted-foreground mt-0.5">
                                    AWB: <span className="font-mono">{activeTracking.awb}</span>
                                  </p>
                                )}
                                {isCompleted && step.key === "shipped" && activeTracking.courier && (
                                  <p className="text-xs text-muted-foreground">
                                    Courier: {activeTracking.courier}
                                  </p>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>

            {/* Track Shipment Link */}
            {activeTracking.url && (
              <>
                <Separator />
                <a
                  href={activeTracking.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 py-2 px-4 rounded-lg border text-sm text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                  data-testid="link-track-shipment-tab"
                >
                  <ExternalLink className="h-4 w-4" />
                  Track Shipment
                </a>
              </>
            )}

            {/* NDR Events if any */}
            {shipmentData?.ndrEvents && shipmentData.ndrEvents.length > 0 && (
              <>
                <Separator />
                <div>
                  <p className="text-xs font-medium text-destructive mb-2">NDR Events</p>
                  <div className="space-y-2">
                    {shipmentData.ndrEvents.map((ndr: any, idx: number) => (
                      <div key={idx} className="rounded-lg border border-destructive/20 bg-destructive/5 p-2">
                        <p className="text-xs font-medium text-destructive">{ndr.ndrReason}</p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(ndr.ndrDate), "MMM dd, yyyy 'at' h:mm a")}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </TabsContent>

          {/* SCROLLABLE BODY - History Tab */}
          <TabsContent value="history" className="flex-1 overflow-y-auto px-4 py-3 space-y-4 mt-0">
            {/* Order Status History */}
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-3">Status History</p>
              {historyLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="flex items-start gap-3">
                      <Skeleton className="h-8 w-8 rounded-full" />
                      <div className="flex-1">
                        <Skeleton className="h-4 w-32 mb-1" />
                        <Skeleton className="h-3 w-48" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : timelineEvents.length > 0 ? (
                <div className="space-y-3">
                  {timelineEvents.map((event, index) => (
                    <div key={event.id} className="flex gap-3 items-start">
                      <div className="flex flex-col items-center">
                        <div className={`flex items-center justify-center w-8 h-8 rounded-full flex-shrink-0 ${
                          event.completed 
                            ? 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400'
                            : 'bg-muted text-muted-foreground'
                        }`}>
                          <CheckCircle2 className="h-4 w-4" />
                        </div>
                        {index < timelineEvents.length - 1 && (
                          <div className="w-0.5 h-full min-h-[24px] bg-muted mt-1" />
                        )}
                      </div>
                      <div className="flex-1 pb-2">
                        <p className="text-sm font-medium">{event.description}</p>
                        {event.systemText && (
                          <p className="text-xs text-muted-foreground mt-0.5">{event.systemText}</p>
                        )}
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {format(event.date, "MMM dd, yyyy 'at' h:mm a")}
                        </p>
                        {event.userNote && (
                          <FieldsetNote note={event.userNote} />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <History className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">No history yet</p>
                </div>
              )}
            </div>

            <Separator />

            {/* Call Logs Placeholder */}
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-3">Call Logs</p>
              <div className="text-center py-6 rounded-lg border border-dashed">
                <Phone className="h-6 w-6 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">No call recordings available</p>
                <p className="text-xs text-muted-foreground mt-1">Call logs will appear here after customer verification calls</p>
              </div>
            </div>
          </TabsContent>

          {/* STICKY FOOTER - Call Status Controls */}
        <div className="flex-shrink-0 border-t bg-card px-3 py-2 rounded-bl-xl">
          <div className="flex items-center justify-between gap-4">
            {/* Left: Prev Navigation */}
            <Button
              variant="outline"
              size="icon"
              onClick={handleNavigatePrev}
              disabled={!canNavigatePrev || isMutating}
              className="h-8 w-8 flex-shrink-0 rounded-full"
              data-testid="button-footer-prev"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>

            {/* Center: Action Dropdown */}
            <div className="flex-1 flex justify-center">
              {isTerminalStatus ? (
                <div className={`px-3 py-1.5 rounded-md text-sm font-medium ${getCallStatusColor(order.callStatus)}`} data-testid="text-call-status">
                  {order.callStatus}
                </div>
              ) : (
                <Select
                  value={selectedAction}
                  onValueChange={setSelectedAction}
                  disabled={isMutating}
                >
                  <SelectTrigger className="w-[160px] h-8" data-testid="select-action">
                    <SelectValue placeholder="Select Action..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="confirm" data-testid="select-item-confirm">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                        <span>Confirm</span>
                        <kbd className="ml-auto px-1.5 py-0.5 text-[10px] font-mono bg-muted rounded border">C</kbd>
                      </div>
                    </SelectItem>
                    <SelectItem value="cancel" data-testid="select-item-cancel">
                      <div className="flex items-center gap-2">
                        <XCircle className="h-4 w-4 text-red-600" />
                        <span>Cancel</span>
                        <kbd className="ml-auto px-1.5 py-0.5 text-[10px] font-mono bg-muted rounded border">X</kbd>
                      </div>
                    </SelectItem>
                    <SelectItem value="followup" data-testid="select-item-followup">
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-yellow-600" />
                        <span>Follow Up</span>
                        <kbd className="ml-auto px-1.5 py-0.5 text-[10px] font-mono bg-muted rounded border">F</kbd>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Right: Save & Next - Primary action */}
            <Button
              variant="default"
              size="sm"
              onClick={handleSaveAndNext}
              disabled={isMutating}
              className="gap-1.5 flex-shrink-0 h-8"
              data-testid="button-footer-save-next"
            >
              Save & Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
        </Tabs>
      </SheetContent>

      {/* Confirm Dialog */}
      <AlertDialog open={confirmDialogOpen} onOpenChange={(open) => {
        setConfirmDialogOpen(open);
        if (!open) setPendingAutoAdvance(false);
      }}>
        <AlertDialogContent data-testid="dialog-confirm-order">
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Order</AlertDialogTitle>
            <AlertDialogDescription>
              Order #{order.shopifyOrderId} - Mark this order as confirmed and move it to Fulfil section?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-2">
            <Label htmlFor="confirm-notes">Notes (Optional)</Label>
            <Textarea
              id="confirm-notes"
              value={confirmNotes}
              onChange={(e) => setConfirmNotes(e.target.value)}
              placeholder="Type notes... (Press Ctrl + Enter to save)"
              className="mt-1.5"
              rows={2}
              data-testid="input-confirm-notes"
              autoFocus
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={isConfirming}
              data-testid="button-cancel-dialog"
            >
              Cancel
            </AlertDialogCancel>
            <Button
              onClick={(e) => {
                e.preventDefault();
                handleConfirmOrderSubmit();
              }}
              disabled={isConfirming}
              data-testid="button-confirm-order"
            >
              {isConfirming && <Clock className="mr-2 h-4 w-4 animate-spin" />}
              Confirm Order
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cancel Modal */}
      <CancelOrderModal
        open={cancelModalOpen}
        onOpenChange={(open) => {
          setCancelModalOpen(open);
          if (!open) setPendingAutoAdvance(false);
        }}
        onConfirm={handleCancelOrder}
        orderNumber={order.shopifyOrderId}
      />

      {/* Follow-up Modal */}
      <FollowupOrderModal
        open={followupModalOpen}
        onOpenChange={(open) => {
          setFollowupModalOpen(open);
          if (!open) setPendingAutoAdvance(false);
        }}
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

      {/* Edit Address Dialog */}
      <EditAddressDialog
        open={editAddressOpen}
        onOpenChange={setEditAddressOpen}
        orderId={order.id}
        initialData={{
          customerName: order.customerName,
          customerPhone: order.customerPhone,
          customerEmail: orderDetails?.customerEmail,
          shippingAddress: orderDetails?.shippingAddress,
          shippingAddressLine1: orderDetails?.shippingAddressLine1,
          shippingAddressLine2: orderDetails?.shippingAddressLine2,
          shippingCity: orderDetails?.shippingCity,
          shippingState: orderDetails?.shippingState,
          shippingPincode: orderDetails?.shippingPincode,
          shippingCountry: orderDetails?.shippingCountry,
        }}
      />
    </Sheet>
  );
}
