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
import { useActiveStore } from "@/hooks/use-store";
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
  // Initialize search from URL param for persistence on refresh
  const initialSearch = useMemo(() => {
    const params = new URLSearchParams(searchString);
    return params.get("search") || "";
  }, []); // Only run once on mount
  
  const [searchQuery, setSearchQuery] = useState(initialSearch);
  const [debouncedSearch, setDebouncedSearch] = useState(initialSearch);
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [activeTab, setActiveTab] = useState("all");
  
  // Admin-only filter state
  const [callStatusFilter, setCallStatusFilter] = useState("all");
  const [agentFilter, setAgentFilter] = useState("all");
  const [tagFilter, setTagFilter] = useState("all");
  
  // Sort order state - 'desc' = Newest First (default), 'asc' = Oldest First
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  
  // Pagination state - lifted from OrdersTable for server-side pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  
  // Agent scope toggle from global context (controlled by header toggle)
  const { isGlobalView } = useScope();
  
  // Debounce search query (500ms delay) - only updates debouncedSearch, never touches searchQuery
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchQuery]);
  
  // Reset pagination when debounced search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch]);
  
  // Sync debouncedSearch to URL for persistence on refresh
  useEffect(() => {
    // Build URL preserving other params but updating search
    const params = new URLSearchParams(window.location.search);
    const currentSearch = params.get("search") || "";
    
    // Only update if the value actually changed to avoid loops
    if (currentSearch !== debouncedSearch) {
      if (debouncedSearch) {
        params.set("search", debouncedSearch);
      } else {
        params.delete("search");
      }
      const newSearch = params.toString();
      const newUrl = newSearch ? `/orders?${newSearch}` : "/orders";
      // Use replace to avoid polluting browser history with every keystroke
      setLocation(newUrl, { replace: true });
    }
  }, [debouncedSearch, setLocation]);
  
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
  
  // Fetch tags list for filter dropdown
  const { data: tagsData } = useQuery<{ tags: string[] }>({
    queryKey: ["/api/tags"],
  });

  // Get current user's ID from localStorage for agent filtering
  const localStorageUserId = localStorage.getItem("userId");
  // Active store from the sidebar switcher. Every order-related
  // query below is keyed by this id and gated by `enabled` so we
  // never fetch with no scope; the helper in lib/queryClient.ts
  // already attaches X-Active-Store-Id when present.
  const { activeStoreId } = useActiveStore();
  
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
  // SAFE GLOBAL VIEW PATTERN:
  // - Personal View (default): No scope param → Backend defaults to assigned orders only
  // - Global View (toggle on): scope=global → Backend allows viewing all orders
  // - Write protection still blocks agents from modifying unassigned orders (403 Forbidden)
  // - Resume action does NOT send scope=global, so it correctly shows only assigned orders
  const { data: ordersResponse, isLoading: ordersLoading } = useQuery<OrdersApiResponse>({
    queryKey: ["/api/orders", activeStoreId, currentPage, pageSize, activeTab, callStatusFilter, agentFilter, tagFilter, isAdmin, localStorageUserId, isGlobalView, debouncedSearch, sortOrder],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: pageSize.toString(),
      });
      
      // SECURITY: Always pass currentUserId for backend role-based enforcement
      if (localStorageUserId) {
        params.append("currentUserId", localStorageUserId);
      }
      
      // SAFE GLOBAL VIEW: Only send scope=global when agent explicitly toggles "All Orders"
      // When scope is not sent (default), backend restricts agent to assigned orders only
      // This fixes the Resume bug while preserving the Global View feature
      if (!isAdmin && isGlobalView) {
        params.append("scope", "global");
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
      
      // Sort order
      params.append("sortOrder", sortOrder);
      
      // Tag filter - use encodeURIComponent for special characters
      if (tagFilter !== "all") {
        params.append("tag", tagFilter);
      }
      
      // apiRequest routes through lib/queryClient's interceptor,
      // which attaches X-Active-Store-Id from localStorage. The
      // server's storeScope middleware reads that header and the
      // /api/orders route filters by it — without this, the
      // backend's fallback ("first user_stores row") served OLB's
      // data regardless of which store the switcher pointed at.
      const res = await apiRequest("GET", `/api/orders?${params.toString()}`);
      return res.json();
    },
    // SECURITY: Don't run query until we have both user context AND
    // an active store resolved. The activeStoreId gate prevents a
    // first-tick fetch with no scope (which would 401-or-fallback
    // depending on the request stage) from racing the StoreProvider's
    // boot. Once both are settled, all reads carry the right header.
    enabled: !!localStorageUserId && !!activeStoreId,
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
    queryKey: ["/api/orders/agent-stats", activeStoreId, localStorageUserId],
    queryFn: async () => {
      // Fetch orders with agent's userId to get their personal stats
      // SECURITY: Include currentUserId for server-side authorization
      const params = new URLSearchParams({
        page: "1",
        limit: "1", // We only need stats, not actual orders
        assignedTo: localStorageUserId || "",
        currentUserId: localStorageUserId || "",
      });

      const res = await apiRequest("GET", `/api/orders?${params.toString()}`);
      const data = await res.json();
      return data.stats;
    },
    enabled: !isAdmin && !!localStorageUserId && !!activeStoreId, // Only for agents, only with store scope
    refetchInterval: 30000,
  });

  // Mutation for updating call status
  const updateCallStatusMutation = useMutation({
    mutationFn: async ({ orderId, callStatus }: { orderId: string; callStatus: string }) => {
      // SECURITY: Include userId for server-side authorization
      const res = await apiRequest("PATCH", `/api/orders/${orderId}`, { callStatus, userId: localStorageUserId });
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
  // SECURITY: Pass currentUserId for server-side authorization
  const { data: fetchedOrder } = useQuery<BackendOrderWithUser>({
    queryKey: ["/api/orders", activeStoreId, urlOrderId, localStorageUserId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (localStorageUserId) params.append("currentUserId", localStorageUserId);
      const res = await apiRequest("GET", `/api/orders/${urlOrderId}?${params.toString()}`);
      return res.json();
    },
    enabled:
      !!urlOrderId &&
      !!localStorageUserId &&
      !!activeStoreId &&
      !baseFilteredOrders.find((o: Order) => o.id === urlOrderId),
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
    // Pagination reset is handled by the debouncedSearch effect
  };

  const handlePaymentChange = (value: string) => {
    setPaymentFilter(value);
    setCurrentPage(1); // Reset to first page when filtering
  };

  const handleClearFilters = () => {
    setSearchQuery("");
    setDebouncedSearch(""); // Clear immediately to avoid stale API call
    setPaymentFilter("all");
    setSortOrder("desc"); // Reset to default Newest First
    setTagFilter("all"); // Reset tag filter
    // Reset admin filters too
    if (isAdmin) {
      setCallStatusFilter("all");
      setAgentFilter("all");
    }
    setCurrentPage(1); // Reset to first page when clearing filters
  };

  // Export state
  const [isExporting, setIsExporting] = useState(false);

  // Export CSV handler - builds URL with current filters and triggers download
  const handleExport = async () => {
    setIsExporting(true);
    try {
      const params = new URLSearchParams();

      // SECURITY: Always pass currentUserId for backend role-based enforcement
      if (localStorageUserId) {
        params.append("currentUserId", localStorageUserId);
      }

      // Apply same filters as the current view
      // For agents: filter by their assigned orders if in Personal view
      if (!isAdmin && localStorageUserId && !isGlobalView) {
        params.append("assignedTo", localStorageUserId);
      }

      // Tab-based or dropdown callStatus filter
      let effectiveCallStatus: string | undefined;
      if (isAdmin && callStatusFilter !== "all") {
        effectiveCallStatus = callStatusFilter;
      } else {
        effectiveCallStatus = tabToCallStatus[activeTab];
      }
      if (effectiveCallStatus) {
        params.append("callStatus", effectiveCallStatus);
      }

      // Admin agent filter
      if (isAdmin && agentFilter !== "all") {
        params.append("agentId", agentFilter);
      }

      // Search filter
      if (debouncedSearch.trim()) {
        params.append("search", debouncedSearch.trim());
      }

      // Tag filter
      if (tagFilter !== "all") {
        params.append("tag", tagFilter);
      }

      // Trigger download. apiRequest returns the raw Response so we
      // can pull the Content-Disposition header and blob() the body
      // directly — same shape as the previous raw fetch, just with
      // the X-Active-Store-Id header attached so the server scopes
      // the CSV to whichever store the switcher is on.
      const response = await apiRequest(
        "GET",
        `/api/orders/export?${params.toString()}`,
      );

      // Get filename from Content-Disposition header or generate one
      const contentDisposition = response.headers.get("Content-Disposition");
      let filename = "orders_export.csv";
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="?([^"]+)"?/);
        if (match) filename = match[1];
      }

      // Download the file
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({
        title: "Export Complete",
        description: `Orders exported to ${filename}`,
      });
    } catch (error) {
      toast({
        title: "Export Failed",
        description: "Failed to export orders. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
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
        {/* Progress bar - always visible for agents (uses separate stats query) */}
        {userRole === "agent" && (
          <OrderProgressBar
            steps={progressSteps}
            activeStep={activeTab}
            onStepClick={handleStepClick}
          />
        )}

        <div className="space-y-4">
          {/* Search/Filter bar - ALWAYS rendered to prevent unmount on loading */}
          <OrdersFilter
            onSearch={handleSearch}
            searchValue={searchQuery}
            onPaymentChange={handlePaymentChange}
            onClearFilters={handleClearFilters}
            isAdmin={isAdmin}
            agents={agentsData || []}
            onCallStatusChange={handleCallStatusFilterChange}
            onAgentChange={handleAgentFilterChange}
            callStatusValue={callStatusFilter}
            agentValue={agentFilter}
            onSortChange={setSortOrder}
            sortValue={sortOrder}
            tags={tagsData?.tags || []}
            onTagChange={setTagFilter}
            tagValue={tagFilter}
            onExport={handleExport}
            isExporting={isExporting}
          />

          {/* Loading state - only affects table content, not filter bar */}
          {/* Show skeleton until data is actually available to prevent empty-state flash */}
          {(isLoading || !ordersResponse) ? (
            <Skeleton className="h-96 w-full" data-testid="skeleton-table" />
          ) : filteredOrders.length === 0 ? (
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
        // SAFE GLOBAL VIEW: Pass scope to allow agents to read any order's details when in global view
        scope={!isAdmin && isGlobalView ? 'global' : undefined}
      />

      <AssignOrderDialog
        order={selectedOrder}
        open={isAssignDialogOpen}
        onOpenChange={setIsAssignDialogOpen}
      />
    </PageLayout>
  );
}
