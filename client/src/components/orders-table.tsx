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
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/status-badge";
import { PaymentBadge } from "@/components/payment-badge";
import { CallStatusActions } from "@/components/call-status-actions";
import { OrderItemsSummary } from "@/components/order-items-summary";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Phone, UserPlus, UserMinus, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useState, useMemo, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { BulkActionsBar } from "@/components/bulk-actions-bar";
import { BulkAssignDialog } from "@/components/bulk-assign-dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * Defensive parser for PostgreSQL text arrays.
 * Handles: null, undefined, already-parsed arrays, PostgreSQL string format {tag1,"tag with spaces"}
 * This ensures tags display correctly regardless of backend data format.
 */
function parsePostgresArray(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return [];
  
  const str = value.trim();
  if (!str.startsWith('{') || !str.endsWith('}')) return [];
  
  const inner = str.slice(1, -1);
  if (inner === '') return [];
  
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  let i = 0;
  
  while (i < inner.length) {
    const char = inner[i];
    
    if (inQuotes) {
      if (char === '"') {
        if (inner[i + 1] === '"') {
          current += '"';
          i += 2;
          continue;
        } else {
          inQuotes = false;
          i++;
          continue;
        }
      } else if (char === '\\' && i + 1 < inner.length) {
        current += inner[i + 1];
        i += 2;
        continue;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
        i++;
        continue;
      } else if (char === ',') {
        result.push(current);
        current = '';
        i++;
        continue;
      }
    }
    
    current += char;
    i++;
  }
  
  result.push(current);
  return result;
}

/** Two-letter initials for the small avatar chips in the customer / agent
 *  cells. Falls back to "?" so we never render an empty circle. */
function initialsOf(name?: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

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
  financialStatus?: string | null; // Shopify financial status: paid, pending, voided, refunded
  status: "pending" | "assigned" | "confirmed" | "cancelled" | "shipped" | "delivered" | "ndr" | "Unfulfilled" | "unfulfilled";
  shipmentStatus?: string | null; // Carrier status: In Transit, Out for Delivery, Delivered, etc.
  callStatus?: "Pending" | "Confirmed" | "Cancelled" | "Follow Up";
  assignedTo?: string;
  assignedToUser?: {
    id: string;
    username: string;
    fullName?: string | null;
  } | null;
  discountCode?: string;
  tags?: string[];
  createdAt: Date;
}

interface OrdersTableProps {
  orders: Order[];
  totalCount?: number; // Real total from API for pagination display
  userRole?: "admin" | "manager" | "agent";
  onCallCustomer?: (order: Order) => void;
  onViewDetails?: (order: Order) => void;
  onAssignOrder?: (order: Order) => void;
  onCallStatusChange?: (orderId: string, newStatus: string) => void;
  showAgentColumn?: boolean;
  // Controlled pagination props
  currentPage?: number;
  pageSize?: number;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
}

export function OrdersTable({
  orders,
  totalCount,
  userRole = "admin",
  onCallCustomer,
  onViewDetails,
  onAssignOrder,
  onCallStatusChange,
  showAgentColumn = true,
  // Controlled pagination - use props if provided, otherwise use internal state
  currentPage: controlledPage,
  pageSize: controlledPageSize,
  onPageChange,
  onPageSizeChange,
}: OrdersTableProps) {
  const { toast } = useToast();
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());
  // Bulk assignment surface — opens the dialog with whichever rows
  // are currently in the selection set. The dialog itself drives
  // the mutation; this state just gates its visibility.
  const [bulkAssignOpen, setBulkAssignOpen] = useState(false);
  const [callingOrderId, setCallingOrderId] = useState<string | null>(null);
  const [cooldownOrders, setCooldownOrders] = useState<Set<string>>(new Set());
  
  // Support both controlled and uncontrolled pagination
  const [internalPage, setInternalPage] = useState(1);
  const [internalPageSize, setInternalPageSize] = useState(50);
  
  const isControlled = controlledPage !== undefined && onPageChange !== undefined;
  const currentPage = isControlled ? controlledPage : internalPage;
  const pageSize = isControlled ? (controlledPageSize ?? 50) : internalPageSize;

  // Calculate pagination - use totalCount from API if provided, otherwise fall back to orders.length
  const totalOrders = totalCount ?? orders.length;
  const totalPages = Math.ceil(totalOrders / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalOrders);
  
  // When controlled (server-side pagination), show all orders since they're already paginated
  // When uncontrolled (client-side), slice the orders array
  const paginatedOrders = useMemo(() => {
    if (isControlled) {
      return orders; // Server already returned paginated data
    }
    return orders.slice(startIndex, endIndex);
  }, [orders, startIndex, endIndex, isControlled]);

  // Subset of the current page that can actually be bulk-assigned.
  // Already-assigned orders are excluded so the Select-All checkbox
  // doesn't silently sweep up rows whose ownership the admin
  // probably doesn't intend to overwrite. The header checkbox,
  // `someSelected` indeterminate state, and handleSelectAll all
  // derive from this filtered list. If the admin DOES want to
  // re-assign a specific assigned row, they can still tick it
  // individually via the per-row checkbox (handleSelectOrder
  // doesn't gate on assignedTo).
  const unassignedPaginatedOrders = useMemo(
    () => paginatedOrders.filter((o) => !o.assignedTo),
    [paginatedOrders],
  );
  
  // Selection state based on current page only
  // "All selected" and the indeterminate "some selected" now key
  // off the unassigned subset, not the full page. If there are
  // no unassigned rows on this page (everything already has an
  // agent), the header checkbox is effectively disabled — clicking
  // it does nothing because handleSelectAll iterates over an
  // empty list.
  const allSelected =
    unassignedPaginatedOrders.length > 0 &&
    unassignedPaginatedOrders.every((order) => selectedOrders.has(order.id));
  const someSelected =
    unassignedPaginatedOrders.some((order) => selectedOrders.has(order.id)) &&
    !allSelected;

  // Reset to first page when orders change (only for uncontrolled mode)
  useEffect(() => {
    if (!isControlled) {
      setInternalPage(1);
    }
  }, [orders, isControlled]);

  // Get current user ID from localStorage (set during login)
  const currentUserId = localStorage.getItem("userId");

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

  // Mutation to confirm order
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
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
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

  // Mutation to cancel order
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
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
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

  // Mutation to unassign an order (admin/manager only)
  const unassignOrderMutation = useMutation({
    mutationFn: async ({ orderId }: { orderId: string }) => {
      if (!currentUserId) {
        throw new Error("User not authenticated");
      }
      const res = await apiRequest("POST", `/api/orders/${orderId}/assign`, {
        userId: null,
        assignedBy: currentUserId,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      toast({
        title: "Order unassigned",
        description: "The order is now available for reassignment.",
      });
    },
    onError: (error: any) => {
      let errorMessage = "Failed to unassign order. Please try again.";
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

  // Mutation to schedule followup
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
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
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
    const newSelected = new Set(selectedOrders);
    // Operate ONLY on the unassigned subset of this page. The
    // previous implementation iterated `paginatedOrders` and
    // unwittingly added already-assigned rows to the selection,
    // which then got re-assigned to whichever agent the admin
    // picked from the bulk dialog — surprising UX (audit Bug #3a).
    if (allSelected) {
      // Toggle off: drop the unassigned rows from the selection
      // set. Any individually-ticked assigned rows the admin had
      // selected via per-row checkboxes stay intact.
      unassignedPaginatedOrders.forEach((order) => newSelected.delete(order.id));
    } else {
      unassignedPaginatedOrders.forEach((order) => newSelected.add(order.id));
    }
    setSelectedOrders(newSelected);
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

  // Handler functions for CallStatusActions
  const handleConfirmOrder = async (orderId: string, notes?: string) => {
    await confirmOrderMutation.mutateAsync({ orderId, notes });
  };

  const handleCancelOrder = async (orderId: string, reason: string, notes?: string) => {
    await cancelOrderMutation.mutateAsync({ orderId, reason, notes });
  };

  const handleFollowupOrder = async (orderId: string, followupAt: Date, notes?: string) => {
    await followupOrderMutation.mutateAsync({ orderId, followupAt, notes });
  };

  const handlePageChange = (newPage: number) => {
    if (isControlled && onPageChange) {
      onPageChange(newPage);
    } else {
      setInternalPage(newPage);
    }
    setSelectedOrders(new Set()); // Clear selection when changing pages
  };

  const handlePageSizeChange = (newSize: string) => {
    const size = Number(newSize);
    if (isControlled && onPageSizeChange) {
      onPageSizeChange(size);
    } else {
      setInternalPageSize(size);
      setInternalPage(1);
    }
    setSelectedOrders(new Set());
  };

  // Outer container: kept the border to anchor the data region
  // (one cage at the page level is correct — it's the nested
  // boxes we removed elsewhere). Header surface is now bg-muted
  // instead of bg-card so the header→body distinction comes
  // from background contrast, not the prior `shadow-sm` hack.
  return (
    <div className="rounded-2xl border bg-card shadow-sm overflow-hidden">
      <div className="relative">
        <Table>
          {/* Tighter header height + uppercase tracking-wide labels.
              Matches the Linear/Stripe density target — column
              headers read as "what column" not "more content." */}
          <TableHeader className="sticky top-0 z-10 bg-muted/40 backdrop-blur-sm">
            <TableRow className="[&_th]:h-9 [&_th]:px-3 [&_th]:text-[11px] [&_th]:font-medium [&_th]:uppercase [&_th]:tracking-wider [&_th]:text-muted-foreground">
              {/* Checkbox column: minimum width so the cell doesn't
                  collapse when its content is hidden. Real visibility
                  is controlled by `.group-hover` on each row below. */}
              <TableHead className="w-[44px]">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={handleSelectAll}
                  aria-label="Select all orders"
                  data-testid="checkbox-select-all"
                  className="opacity-100"
                />
              </TableHead>
              <TableHead className="w-[110px]">Order ID</TableHead>
              <TableHead>Customer</TableHead>
              {showAgentColumn && <TableHead>Agent</TableHead>}
              <TableHead>Tags</TableHead>
              <TableHead>Items</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Payment</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Call Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="[&_td]:py-2.5 [&_td]:px-3 [&_td]:text-[13px]">
            {paginatedOrders.map((order) => {
              // Per-row "selected" state powers two visual hints:
              //   • The checkbox stays visible (not just hover-only)
              //     so the user can see what they've already picked.
              //   • The row stays in the highlighted state via the
              //     hover-elevate utility (it's a CSS-only pattern
              //     so we set a data attribute the hover-elevate
              //     watches).
              const isSelected = selectedOrders.has(order.id);
              return (
                <TableRow
                  key={order.id}
                  // `group` enables the checkbox to react to
                  // group-hover on the row (Tailwind v3 pattern).
                  // Density target: 36px row height (h-9 implied
                  // by td padding above). Was ~52px in v1.
                  className="group hover-elevate cursor-pointer"
                  onClick={() => onViewDetails?.(order)}
                  data-testid={`row-order-${order.id}`}
                  data-selected={isSelected}
                >
              {/* Checkbox cell: hidden until row hover OR when the
                  row is already selected. Matches Linear/Stripe
                  pattern — checkboxes are a power-user affordance,
                  not always-on chrome. */}
              <TableCell onClick={(e) => e.stopPropagation()}>
                <Checkbox
                  checked={isSelected}
                  onCheckedChange={() => handleSelectOrder(order.id)}
                  aria-label={`Select order ${order.shopifyOrderId}`}
                  data-testid={`checkbox-order-${order.id}`}
                  className={cn(
                    "transition-opacity",
                    isSelected
                      ? "opacity-100"
                      : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
                  )}
                />
              </TableCell>
              {/* Order ID: mono + tabular-nums for stable column
                  alignment regardless of digit count. The leading
                  `#` is muted so the numeric portion reads first. */}
              <TableCell className="font-mono tabular-nums text-xs font-medium text-muted-foreground">
                <span className="text-muted-foreground/70">#</span>
                <span className="text-foreground">{order.shopifyOrderId}</span>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2.5">
                  <span
                    className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand/10 text-[10px] font-semibold text-brand"
                    aria-hidden
                  >
                    {initialsOf(order.customerName)}
                  </span>
                  <div className="flex flex-col leading-tight min-w-0">
                    <span className="font-medium text-foreground truncate">{order.customerName}</span>
                    <span className="text-[11px] text-muted-foreground tabular-nums mt-0.5">
                      {order.customerPhone}
                    </span>
                  </div>
                </div>
              </TableCell>
              {showAgentColumn && (
                <TableCell className="text-sm" data-testid={`agent-${order.id}`} onClick={(e) => e.stopPropagation()}>
                  {order.assignedToUser ? (
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-500/10 text-[10px] font-semibold text-violet-600 dark:text-violet-400"
                        aria-hidden
                      >
                        {initialsOf(order.assignedToUser.fullName || order.assignedToUser.username)}
                      </span>
                      <span className="font-medium truncate">{order.assignedToUser.fullName || order.assignedToUser.username}</span>
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground italic">Unassigned</span>
                  )}
                </TableCell>
              )}
              <TableCell onClick={(e) => e.stopPropagation()}>
                {(() => {
                  const tags = parsePostgresArray(order.tags);
                  if (tags.length === 0) {
                    return <span className="text-xs text-muted-foreground">—</span>;
                  }
                  return (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                          <Badge
                            variant="outline"
                            className="rounded-full px-3 py-1 text-xs font-medium border gap-1.5 bg-transparent max-w-[80px]"
                            data-testid={`badge-tag-${order.id}`}
                          >
                            <span className="truncate">{tags[0]}</span>
                          </Badge>
                          {tags.length > 1 && (
                            <Badge
                              variant="outline"
                              className="rounded-full px-3 py-1 text-xs font-medium border gap-1.5 bg-transparent flex-shrink-0"
                              data-testid={`badge-tag-count-${order.id}`}
                            >
                              +{tags.length - 1}
                            </Badge>
                          )}
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="max-w-xs">
                        <div className="flex flex-wrap gap-1">
                          {tags.map((tag, index) => (
                            <span key={index} className="text-xs">{tag}</span>
                          ))}
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  );
                })()}
              </TableCell>
              <TableCell onClick={(e) => e.stopPropagation()}>
                <OrderItemsSummary orderId={order.id} fallbackSummary={order.items} />
              </TableCell>
              {/* Total: tabular-nums forces every digit to occupy
                  the same width so a column of varied amounts
                  (₹890 / ₹1,250 / ₹12,400) aligns on the rupee
                  symbol. The single biggest "looks pro" signal on a
                  data table. */}
              <TableCell className="text-right tabular-nums">
                <span className="text-muted-foreground text-[11px] mr-0.5">₹</span>
                <span className="font-semibold text-foreground">{order.total.toLocaleString("en-IN")}</span>
              </TableCell>
              <TableCell>
                <PaymentBadge method={order.paymentMethod} financialStatus={order.financialStatus} />
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {formatDistanceToNow(order.createdAt, { addSuffix: true })}
              </TableCell>
              <TableCell onClick={(e) => e.stopPropagation()}>
                <CallStatusActions
                  orderId={order.id}
                  orderNumber={order.shopifyOrderId}
                  currentStatus={order.callStatus}
                  onConfirm={handleConfirmOrder}
                  onCancel={handleCancelOrder}
                  onFollowup={handleFollowupOrder}
                  disabled={confirmOrderMutation.isPending || cancelOrderMutation.isPending || followupOrderMutation.isPending}
                />
              </TableCell>
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-1">
                  {order.paymentMethod === "cod" && (order.status === "assigned" || order.status === "pending" || order.status === "Unfulfilled" || order.status === "unfulfilled") && (
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
                    <Tooltip>
                      <TooltipTrigger asChild>
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
                      </TooltipTrigger>
                      <TooltipContent>Assign order</TooltipContent>
                    </Tooltip>
                  )}
                  {userRole !== "agent" && order.assignedTo && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            unassignOrderMutation.mutate({ orderId: order.id });
                          }}
                          disabled={unassignOrderMutation.isPending}
                          data-testid={`button-unassign-${order.id}`}
                        >
                          {unassignOrderMutation.isPending && unassignOrderMutation.variables?.orderId === order.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <UserMinus className="h-4 w-4" />
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Unassign order</TooltipContent>
                    </Tooltip>
                  )}
                </div>
              </TableCell>
            </TableRow>
              );
            })}
        </TableBody>
        </Table>
      </div>
      
      {/* Pagination Footer */}
      <div className="sticky bottom-0 bg-card border-t p-4 z-10">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              Showing {totalOrders === 0 ? 0 : startIndex + 1}-{endIndex} of {totalOrders} orders
            </span>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Rows per page:</span>
              <Select value={String(pageSize)} onValueChange={handlePageSizeChange}>
                <SelectTrigger className="w-[80px]" data-testid="select-page-size">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="25">25</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
                data-testid="button-prev-page"
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </Button>
              <span className="text-sm text-muted-foreground px-4">
                Page {currentPage} of {totalPages || 1}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage >= totalPages}
                data-testid="button-next-page"
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Bulk actions bar — Linear/Stripe-style floating contextual
          surface. Visible only when selectedOrders.size > 0. Admin
          and manager roles get bulk-assign; plain agents don't see
          the bar at all because the per-row checkboxes are
          themselves admin/manager affordances (an agent shouldn't
          be re-assigning to themselves). */}
      {userRole !== "agent" && (
        <BulkActionsBar
          count={selectedOrders.size}
          onAssign={() => setBulkAssignOpen(true)}
          onClear={() => setSelectedOrders(new Set())}
        />
      )}

      {/* Dialog hosts the agent picker + note + the actual mutation.
          On success it invalidates ["/api/orders"] internally — we
          just clear the selection Set on the parent side so the
          bar disappears and the checked rows un-tick. */}
      <BulkAssignDialog
        open={bulkAssignOpen}
        onOpenChange={setBulkAssignOpen}
        orderIds={Array.from(selectedOrders)}
        onSuccess={() => setSelectedOrders(new Set())}
      />
    </div>
  );
}
