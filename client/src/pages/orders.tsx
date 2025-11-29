import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
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
import type { Order as BackendOrder, User } from "@shared/schema";

// Transform backend order to frontend order format
function transformOrder(order: BackendOrder, users: User[]): Order {
  const assignedUser = order.assignedTo
    ? users.find((u) => u.id === order.assignedTo)
    : undefined;

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
    financialStatus: order.financialStatus, // Pass through Shopify financial status for accurate badge display
    status: order.status as Order["status"],
    callStatus: order.callStatus as Order["callStatus"],
    assignedTo: assignedUser?.fullName,
    discountCode: order.discountCode || undefined,
    createdAt: new Date(order.shopifyCreatedAt),
  };
}

interface OrdersPageProps {
  userRole?: "admin" | "manager" | "agent";
}

export default function OrdersPage({ userRole = "admin" }: OrdersPageProps) {
  const { toast } = useToast();
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [selectedOrderIndex, setSelectedOrderIndex] = useState<number>(-1);
  const [isQuickPreviewOpen, setIsQuickPreviewOpen] = useState(false);
  const [isAssignDialogOpen, setIsAssignDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [activeTab, setActiveTab] = useState("all");
  
  // Admin-only filter state
  const [callStatusFilter, setCallStatusFilter] = useState("all");
  const [agentFilter, setAgentFilter] = useState("all");
  
  // Pagination state - lifted from OrdersTable for server-side pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  
  const isAdmin = userRole === "admin";

  // Type for API response with stats
  interface OrdersApiResponse {
    orders: BackendOrder[];
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

  // Fetch orders from backend with server-side pagination and admin filters
  const { data: ordersResponse, isLoading: ordersLoading } = useQuery<OrdersApiResponse>({
    queryKey: ["/api/orders", currentPage, pageSize, callStatusFilter, agentFilter],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: pageSize.toString(),
      });
      
      // Add admin filters if set
      if (isAdmin && callStatusFilter !== "all") {
        params.append("callStatus", callStatusFilter);
      }
      if (isAdmin && agentFilter !== "all") {
        params.append("agentId", agentFilter);
      }
      
      const res = await fetch(`/api/orders?${params.toString()}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch orders");
      return res.json();
    },
    refetchInterval: 30000, // Auto-refresh every 30 seconds for real-time webhook updates
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

  // BASE FILTER: Apply role-based filtering first (agents see only their assigned orders)
  const baseFilteredOrders = useMemo(() => {
    if (!ordersResponse?.orders || !usersData) return [];
    
    // Filter backend orders based on role
    let filteredBackendOrders = ordersResponse.orders;
    
    if (userRole === "agent" && currentUserId) {
      // Agents see only orders assigned to them
      filteredBackendOrders = ordersResponse.orders.filter(
        (order) => order.assignedTo === currentUserId
      );
    }
    // Admins see all orders (no filter)
    
    // Transform filtered orders to frontend format
    return filteredBackendOrders.map((order) => transformOrder(order, usersData));
  }, [ordersResponse, usersData, userRole, currentUserId]);

  // Apply tab filters and search/payment filters on top of base filtered orders
  const filteredOrders = useMemo(() => {
    let filtered = [...baseFilteredOrders];

    // Tab-based filtering (call status)
    if (activeTab === "all") {
      // Show all assigned orders, no additional filtering
    } else if (activeTab === "pending") {
      // Pending includes orders with "Pending" status OR null/undefined callStatus
      filtered = filtered.filter((order) => 
        order.callStatus === "Pending" || !order.callStatus
      );
    } else if (activeTab === "confirmed") {
      filtered = filtered.filter((order) => order.callStatus === "Confirmed");
    } else if (activeTab === "cancelled") {
      filtered = filtered.filter((order) => order.callStatus === "Cancelled");
    } else if (activeTab === "followup") {
      filtered = filtered.filter((order) => order.callStatus === "Follow Up");
    }

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (order) =>
          order.shopifyOrderId.toLowerCase().includes(query) ||
          order.customerName.toLowerCase().includes(query) ||
          order.customerPhone.includes(query)
      );
    }

    // Payment method filter
    if (paymentFilter !== "all") {
      filtered = filtered.filter((order) => order.paymentMethod === paymentFilter);
    }

    return filtered;
  }, [baseFilteredOrders, activeTab, searchQuery, paymentFilter]);

  const isLoading = ordersLoading || usersLoading;

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
    console.log("Calling customer:", order.customerName, order.customerPhone);
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

  // Use stats from API response for progress bar (global counts from database)
  // Order: Total Orders -> Pending -> Follow-Up -> Cancelled -> Confirmed
  const progressSteps = useMemo(
    () => {
      const stats = ordersResponse?.stats || { total: 0, pending: 0, confirmed: 0, followUp: 0, cancelled: 0 };
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
    [ordersResponse?.stats]
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
                  showAgentColumn={false}
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
        onOpenChange={setIsQuickPreviewOpen}
        currentIndex={selectedOrderIndex}
        totalOrders={filteredOrders.length}
        onNavigate={handleNavigateOrder}
        onStatusUpdate={() => {
          // Refresh the orders list when status is updated in the modal
          queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
        }}
        onEditCustomer={() => {
          console.log("Edit customer clicked");
          // TODO: Implement edit customer dialog
        }}
        onInvoice={() => {
          console.log("Invoice clicked for order:", selectedOrder?.shopifyOrderId);
          // TODO: Implement invoice generation
        }}
        onRefund={() => {
          console.log("Refund clicked for order:", selectedOrder?.shopifyOrderId);
          // TODO: Implement refund dialog
        }}
        onEditOrder={() => {
          console.log("Edit order clicked for order:", selectedOrder?.shopifyOrderId);
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
