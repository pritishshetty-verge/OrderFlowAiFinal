import { useState, useMemo, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import { PageLayout } from "@/components/page-layout";
import { OrdersFilter } from "@/components/orders-filter";
import { OrdersTable, type Order } from "@/components/orders-table";
import { OrderQuickPreview } from "@/components/order-quick-preview";
import { AssignOrderDialog } from "@/components/assign-order-dialog";
import { OrderProgressBar } from "@/components/order-progress-bar";
import { Card, CardContent } from "@/components/ui/card";
import { Package } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useScope } from "@/contexts/scope-context";
import type { Order as BackendOrder, User } from "@shared/schema";

// Extended backend order type with joined user data from API
interface BackendOrderWithUser extends BackendOrder {
  assignedToUser?: {
    id: string;
    username: string;
    fullName?: string | null;
  } | null;
}

// Transform backend order to frontend order format
function transformOrder(order: BackendOrderWithUser): Order {
  // Format shipping address
  const addressParts = [
    order.shippingAddressLine1,
    order.shippingAddressLine2,
    order.shippingCity,
    order.shippingState,
    order.shippingPincode,
  ].filter(Boolean);
  const shippingAddress = addressParts.length > 0 ? addressParts.join(", ") : undefined;

  return {
    id: order.id,
    shopifyOrderId: order.shopifyOrderNumber,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    shippingAddress,
    shippingCity: order.shippingCity || undefined,
    shippingState: order.shippingState || undefined,
    shippingPincode: order.shippingPincode || undefined,
    items: order.itemsSummary || "",
    total: parseFloat(order.totalPrice),
    paymentMethod: order.paymentMethod === "cod" ? "cod" : "prepaid",
    financialStatus: order.financialStatus,
    status: order.status as Order["status"],
    callStatus: order.callStatus as Order["callStatus"],
    assignedTo: order.assignedTo || undefined,
    assignedToUser: order.assignedToUser || null,
    discountCode: order.discountCode || undefined,
    tags: order.tags || undefined,
    createdAt: new Date(order.shopifyCreatedAt),
  };
}

interface OrdersPageProps {
  userRole?: "admin" | "manager" | "agent";
}

export default function OrdersPage({ userRole = "admin" }: OrdersPageProps) {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [selectedOrderIndex, setSelectedOrderIndex] = useState<number>(-1);
  const [isQuickPreviewOpen, setIsQuickPreviewOpen] = useState(false);
  const [isAssignDialogOpen, setIsAssignDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [activeTab, setActiveTab] = useState("all");
  
  // Admin-only filter state
  const [callStatusFilter, setCallStatusFilter] = useState("all");
  const [agentFilter, setAgentFilter] = useState("all");
  
  // Pagination state - lifted from OrdersTable for server-side pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  
  // Agent scope toggle from global context (controlled by header toggle)
  const { isGlobalView } = useScope();
  
  // Debounce search query (500ms delay)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchQuery]);
  
  // Reset pagination when search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch]);
  
  // Reset pagination when scope changes
  useEffect(() => {
    setCurrentPage(1);
  }, [isGlobalView]);
  
  const isAdmin = userRole === "admin";

  // Type for API response with stats (orders include joined user data)
  interface OrdersApiResponse {
    orders: BackendOrderWithUser[];
    total: number;
    stats: {
      total: number;
      pending: number;
      confirmed: number;
      followUp: number;
      cancelled: number;
    };
  }

  // Type for agent dropdown
  interface Agent {
    id: string;
    fullName: string;
    email: string;
  }

  // Fetch agents list for admin filter dropdown
  const { data: agentsData } = useQuery<Agent[]>({
    queryKey: ["/api/users/agents"],
    enabled: isAdmin, // Only fetch for admins
  });

  // Get current user's ID from localStorage for agent filtering
  const localStorageUserId = localStorage.getItem("userId");
  
  // Map activeTab to API callStatus parameter for server-side filtering
  const tabToCallStatus: Record<string, string | undefined> = {
    all: undefined,
    pending: "Pending",
    confirmed: "Confirmed",
    followup: "Follow Up",
    cancelled: "Cancelled",
  };
  
  // Reset pagination when tab changes
  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab]);
  
  // Fetch orders from backend with server-side pagination and role-based filters
  // For agents: Personal view filters by assignedTo, Global view shows all orders
  const { data: ordersResponse, isLoading: ordersLoading } = useQuery<OrdersApiResponse>({
    queryKey: ["/api/orders", currentPage, pageSize, activeTab, callStatusFilter, agentFilter, isAdmin, localStorageUserId, isGlobalView, debouncedSearch],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: pageSize.toString(),
      });
      
      // For agents: filter by their assigned orders ONLY if in Personal view (not Global view)
      if (!isAdmin && localStorageUserId && !isGlobalView) {
        params.append("assignedTo", localStorageUserId);
      }
      
      // Server-side tab filtering - pass callStatus based on active tab
      // For admins, callStatusFilter dropdown takes precedence if set
      let effectiveCallStatus: string | undefined;
      if (isAdmin && callStatusFilter !== "all") {
        // Admin dropdown filter overrides tab
        effectiveCallStatus = callStatusFilter;
      } else {
        // Use tab-based filtering
        effectiveCallStatus = tabToCallStatus[activeTab];
      }
      
      if (effectiveCallStatus) {
        params.append("callStatus", effectiveCallStatus);
      }
      
      // Admin agent filter
      if (isAdmin && agentFilter !== "all") {
        params.append("agentId", agentFilter);
      }
      
      // Server-side search
      if (debouncedSearch.trim()) {
        params.append("search", debouncedSearch.trim());
      }
      
      const res = await fetch(`/api/orders?${params.toString()}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch orders");
      return res.json();
    },
    refetchInterval: 30000, // Auto-refresh every 30 seconds for real-time webhook updates
  });
  
  // Separate stats query for progress bar - ALWAYS filters by agent's userId regardless of table scope
  // This ensures agents always see their personal workload metrics
  interface AgentStats {
    total: number;
    pending: number;
    confirmed: number;
    followUp: number;
    cancelled: number;
  }
  
  const { data: agentStats } = useQuery<AgentStats>({
    queryKey: ["/api/orders/agent-stats", localStorageUserId],
    queryFn: async () => {
      // Fetch orders with agent's userId to get their personal stats
      const params = new URLSearchParams({
        page: "1",
        limit: "1", // We only need stats, not actual orders
        assignedTo: localStorageUserId || "",
      });
      
      const res = await fetch(`/api/orders?${params.toString()}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch agent stats");
      const data = await res.json();
      return data.stats;
    },
    enabled: !isAdmin && !!localStorageUserId, // Only for agents
    refetchInterval: 30000,
  });

  // Mutation for updating call status
  const updateCallStatusMutation = useMutation({
    mutationFn: async ({ orderId, callStatus }: { orderId: string; callStatus: string }) => {
      const res = await apiRequest("PATCH", `/api/orders/${orderId}`, { callStatus });
      return res.json();
    },
    onSuccess: () => {
      // Invalidate all order queries regardless of pagination params
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      toast({
        title: "Call Status Updated",
        description: "Order call status has been updated successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update call status. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Fetch users for assignment display
  const { data: usersData, isLoading: usersLoading } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });

  // Get current user's real ID from database for agent filtering
  const userEmail = localStorage.getItem("userEmail");
  const currentUser = usersData?.find(u => u.email === userEmail);
  const currentUserId = currentUser?.id;

  // BASE FILTER: Transform backend orders to frontend format
  // Server-side filtering is already applied for agents via assignedTo param
  const baseFilteredOrders = useMemo(() => {
    if (!ordersResponse?.orders || !usersData) return [];
    
    // Transform backend orders to frontend format
    // Server already filters by assignedTo for agents, so no client-side filtering needed
    return ordersResponse.orders.map((order) => transformOrder(order));
  }, [ordersResponse, usersData]);

  // Apply payment filter on top of server-filtered orders
  // Tab filtering and search are now handled server-side
  const filteredOrders = useMemo(() => {
    let filtered = [...baseFilteredOrders];

    // Payment method filter (client-side for current page)
    // TODO: Consider moving this to server-side as well
    if (paymentFilter !== "all") {
      filtered = filtered.filter((order) => order.paymentMethod === paymentFilter);
    }

    return filtered;
  }, [baseFilteredOrders, paymentFilter]);

  const isLoading = ordersLoading || usersLoading;

  // Handle URL query param for opening sidebar from notifications
  // This fetches the order directly if not in the current page (due to server-side pagination)
  const [urlOrderId, setUrlOrderId] = useState<string | null>(null);
  
  // Parse URL param on change
  useEffect(() => {
    const params = new URLSearchParams(searchString);
    const selectedOrderId = params.get("selected_order");
    setUrlOrderId(selectedOrderId);
  }, [searchString]);

  // Fetch the specific order when needed (handles pagination case)
  const { data: fetchedOrder } = useQuery<BackendOrderWithUser>({
    queryKey: ["/api/orders", urlOrderId],
    queryFn: async () => {
      const res = await fetch(`/api/orders/${urlOrderId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch order");
      return res.json();
    },
    enabled: !!urlOrderId && !baseFilteredOrders.find((o: Order) => o.id === urlOrderId),
  });

  // Open sidebar when we have the order (either from current page or fetched)
  useEffect(() => {
    if (!urlOrderId) return;
    
    // First check if order is in current page
    const localOrder = baseFilteredOrders.find((o: Order) => o.id === urlOrderId);
    if (localOrder) {
      const index = filteredOrders.findIndex((o) => o.id === urlOrderId);
      setSelectedOrder(localOrder);
      setSelectedOrderIndex(index >= 0 ? index : -1);
      setIsQuickPreviewOpen(true);
      return;
    }
    
    // If we fetched the order, use it
    if (fetchedOrder) {
      const transformedOrder = transformOrder(fetchedOrder);
      setSelectedOrder(transformedOrder);
      setSelectedOrderIndex(-1); // Not in current page, so no index
      setIsQuickPreviewOpen(true);
    }
  }, [urlOrderId, baseFilteredOrders, filteredOrders, fetchedOrder]);

  // Handler for sidebar close - clears only selected_order param, preserves others
  const handleQuickPreviewClose = useCallback((open: boolean) => {
    setIsQuickPreviewOpen(open);
    if (!open) {
      // Clear only the selected_order param from URL, preserve other params
      const params = new URLSearchParams(searchString);
      params.delete("selected_order");
      const newSearch = params.toString();
      setLocation(newSearch ? `/orders?${newSearch}` : "/orders", { replace: true });
      setUrlOrderId(null);
    }
  }, [setLocation, searchString]);

  const handleViewDetails = (order: Order) => {
    const index = filteredOrders.findIndex((o) => o.id === order.id);
    setSelectedOrder(order);
    setSelectedOrderIndex(index);
    setIsQuickPreviewOpen(true);
  };

  const handleNavigateOrder = (direction: "prev" | "next") => {
    const newIndex = direction === "prev" ? selectedOrderIndex - 1 : selectedOrderIndex + 1;
    if (newIndex >= 0 && newIndex < filteredOrders.length) {
      setSelectedOrder(filteredOrders[newIndex]);
      setSelectedOrderIndex(newIndex);
    }
  };

  const handleCallCustomer = (order: Order) => {
    alert(`Calling ${order.customerName} at ${order.customerPhone}`);
  };

  const handleAssignOrder = (order: Order) => {
    setSelectedOrder(order);
    setIsAssignDialogOpen(true);
  };

  const handleSearch = (value: string) => {
    setSearchQuery(value);
    setCurrentPage(1); // Reset to first page when searching
  };

  const handlePaymentChange = (value: string) => {
    setPaymentFilter(value);
    setCurrentPage(1); // Reset to first page when filtering
  };

  const handleClearFilters = () => {
    setSearchQuery("");
    setPaymentFilter("all");
    // Reset admin filters too
    if (isAdmin) {
      setCallStatusFilter("all");
      setAgentFilter("all");
    }
    setCurrentPage(1); // Reset to first page when clearing filters
  };

  // Admin filter handlers
  const handleCallStatusFilterChange = (value: string) => {
    setCallStatusFilter(value);
    setCurrentPage(1);
  };

  const handleAgentFilterChange = (value: string) => {
    setAgentFilter(value);
    setCurrentPage(1);
  };

  const handleStepClick = (status: string) => {
    setActiveTab(status);
    setCurrentPage(1); // Reset to first page when changing tabs
  };

  const handleCallStatusChange = (orderId: string, callStatus: string) => {
    updateCallStatusMutation.mutate({ orderId, callStatus });
  };

  // Pagination handlers
  const handlePageChange = (newPage: number) => {
    setCurrentPage(newPage);
  };

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize);
    setCurrentPage(1); // Reset to first page when changing page size
  };

  // Use separate agentStats for progress bar (always shows agent's personal metrics)
  // This ensures the progress bar is NOT affected by the global/personal view toggle
  // Order: Total Orders -> Pending -> Follow-Up -> Cancelled -> Confirmed
  const progressSteps = useMemo(
    () => {
      // For agents: use dedicated agentStats that always filters by their userId
      // For admins: use ordersResponse stats (though progress bar is hidden for admins)
      const stats = isAdmin 
        ? (ordersResponse?.stats || { total: 0, pending: 0, confirmed: 0, followUp: 0, cancelled: 0 })
        : (agentStats || { total: 0, pending: 0, confirmed: 0, followUp: 0, cancelled: 0 });
      
      return [
        {
          label: "Total Orders",
          count: stats.total,
          status: "all" as const,
        },
        {
          label: "Pending",
          count: stats.pending,
          status: "pending" as const,
        },
        {
          label: "Follow-Up",
          count: stats.followUp,
          status: "followup" as const,
        },
        {
          label: "Cancelled",
          count: stats.cancelled,
          status: "cancelled" as const,
        },
        {
          label: "Confirmed",
          count: stats.confirmed,
          status: "confirmed" as const,
        },
      ];
    },
    [isAdmin, ordersResponse?.stats, agentStats]
  );

  return (
    <PageLayout
      title="Orders"
      description={userRole === "agent" ? "Manage your assigned orders" : "Manage all Shopify orders"}
    >
      <div className="p-6 space-y-6">
        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-24 w-full" data-testid="skeleton-progress-bar" />
            <Skeleton className="h-16 w-full" data-testid="skeleton-filter" />
            <Skeleton className="h-96 w-full" data-testid="skeleton-table" />
          </div>
        ) : (
          <>
            {/* Hide progress bar for admins - they use filters to oversee, not track targets */}
            {userRole === "agent" && (
              <OrderProgressBar
                steps={progressSteps}
                activeStep={activeTab}
                onStepClick={handleStepClick}
              />
            )}

            <div className="space-y-4">
              <OrdersFilter
                onSearch={handleSearch}
                onPaymentChange={handlePaymentChange}
                onClearFilters={handleClearFilters}
                isAdmin={isAdmin}
                agents={agentsData || []}
                onCallStatusChange={handleCallStatusFilterChange}
                onAgentChange={handleAgentFilterChange}
                callStatusValue={callStatusFilter}
                agentValue={agentFilter}
              />

              {filteredOrders.length === 0 ? (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-12">
                    <Package className="h-12 w-12 text-muted-foreground mb-4" />
                    <p className="text-lg font-medium">No orders found</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      {baseFilteredOrders.length === 0
                        ? userRole === "agent" 
                          ? "No orders have been assigned to you yet"
                          : "No orders have been synced from Shopify yet"
                        : "Try adjusting your filters or search query"}
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <OrdersTable
                  orders={filteredOrders}
                  totalCount={ordersResponse?.total}
                  userRole={userRole}
                  onCallCustomer={handleCallCustomer}
                  onViewDetails={handleViewDetails}
                  onAssignOrder={handleAssignOrder}
                  onCallStatusChange={handleCallStatusChange}
                  showAgentColumn={isAdmin}
                  currentPage={currentPage}
                  pageSize={pageSize}
                  onPageChange={handlePageChange}
                  onPageSizeChange={handlePageSizeChange}
                />
              )}
            </div>
          </>
        )}
      </div>

      <OrderQuickPreview
        order={selectedOrder}
        open={isQuickPreviewOpen}
        onOpenChange={handleQuickPreviewClose}
        currentIndex={selectedOrderIndex}
        totalOrders={filteredOrders.length}
        onNavigate={handleNavigateOrder}
        onStatusUpdate={() => {
          // Refresh the orders list when status is updated in the modal
          queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
        }}
        onEditCustomer={() => {
          // TODO: Implement edit customer dialog
        }}
        onInvoice={() => {
          // TODO: Implement invoice generation
        }}
        onRefund={() => {
          // TODO: Implement refund dialog
        }}
        onEditOrder={() => {
          // TODO: Implement edit order dialog
        }}
      />

      <AssignOrderDialog
        order={selectedOrder}
        open={isAssignDialogOpen}
        onOpenChange={setIsAssignDialogOpen}
      />
    </PageLayout>
  );
}
