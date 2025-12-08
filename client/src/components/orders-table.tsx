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
import { Phone, UserPlus, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useState, useMemo, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
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
  status: "pending" | "assigned" | "confirmed" | "cancelled" | "shipped" | "delivered" | "ndr";
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
  
  // Selection state based on current page only
  const allSelected = paginatedOrders.length > 0 && paginatedOrders.every(order => selectedOrders.has(order.id));
  const someSelected = paginatedOrders.some(order => selectedOrders.has(order.id)) && !allSelected;

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
    if (allSelected) {
      // Deselect all orders on current page
      paginatedOrders.forEach(order => newSelected.delete(order.id));
    } else {
      // Select all orders on current page
      paginatedOrders.forEach(order => newSelected.add(order.id));
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

  return (
    <div className="rounded-lg border bg-card">
      <div className="relative">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-card shadow-sm">
            <TableRow>
              <TableHead className="w-[50px] bg-card">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={handleSelectAll}
                  aria-label="Select all orders"
                  data-testid="checkbox-select-all"
                />
              </TableHead>
              <TableHead className="w-[120px] bg-card">Order ID</TableHead>
              <TableHead className="bg-card">Customer</TableHead>
              {showAgentColumn && <TableHead className="bg-card">Agent</TableHead>}
              <TableHead className="bg-card">Tags</TableHead>
              <TableHead className="bg-card">Items</TableHead>
              <TableHead className="text-right bg-card">Total</TableHead>
              <TableHead className="bg-card">Payment</TableHead>
              <TableHead className="bg-card">Date</TableHead>
              <TableHead className="bg-card">Call Status</TableHead>
              <TableHead className="text-right bg-card">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedOrders.map((order) => (
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
              {showAgentColumn && (
                <TableCell className="text-sm" data-testid={`agent-${order.id}`} onClick={(e) => e.stopPropagation()}>
                  {order.assignedToUser ? (
                    <span className="font-medium">{order.assignedToUser.fullName || order.assignedToUser.username}</span>
                  ) : (
                    <span className="text-muted-foreground">Unassigned</span>
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
              <TableCell className="text-right font-medium">
                ₹{order.total.toLocaleString("en-IN")}
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
                  {order.paymentMethod === "cod" && (order.status === "assigned" || order.status === "pending") && (
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
    </div>
  );
}
