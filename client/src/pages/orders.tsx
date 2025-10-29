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
  const [isQuickPreviewOpen, setIsQuickPreviewOpen] = useState(false);
  const [isAssignDialogOpen, setIsAssignDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [activeTab, setActiveTab] = useState("all");

  // Fetch orders from backend with auto-refresh every 30 seconds
  const { data: ordersResponse, isLoading: ordersLoading } = useQuery<{ orders: BackendOrder[]; total: number }>({
    queryKey: ["/api/orders"],
    refetchInterval: 30000, // Auto-refresh every 30 seconds for real-time webhook updates
  });

  // Mutation for updating call status
  const updateCallStatusMutation = useMutation({
    mutationFn: async ({ orderId, callStatus }: { orderId: string; callStatus: string }) => {
      const res = await apiRequest("PATCH", `/api/orders/${orderId}`, { callStatus });
      return res.json();
    },
    onSuccess: () => {
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
    setSelectedOrder(order);
    setIsQuickPreviewOpen(true);
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
  };

  const handlePaymentChange = (value: string) => {
    setPaymentFilter(value);
  };

  const handleClearFilters = () => {
    setSearchQuery("");
    setPaymentFilter("all");
  };

  const handleStepClick = (status: string) => {
    setActiveTab(status);
  };

  const handleCallStatusChange = (orderId: string, callStatus: string) => {
    updateCallStatusMutation.mutate({ orderId, callStatus });
  };

  // Calculate stats for progress bar using base-filtered orders (respects agent/admin role)
  const progressSteps = useMemo(
    () => [
      {
        label: "Total Orders",
        count: baseFilteredOrders.length,
        status: "all" as const,
      },
      {
        label: "Pending",
        count: baseFilteredOrders.filter((o) => o.callStatus === "Pending" || !o.callStatus).length,
        status: "pending" as const,
      },
      {
        label: "Confirmed",
        count: baseFilteredOrders.filter((o) => o.callStatus === "Confirmed").length,
        status: "confirmed" as const,
      },
      {
        label: "Follow-Up",
        count: baseFilteredOrders.filter((o) => o.callStatus === "Follow Up").length,
        status: "followup" as const,
      },
      {
        label: "Cancelled",
        count: baseFilteredOrders.filter((o) => o.callStatus === "Cancelled").length,
        status: "cancelled" as const,
      },
    ],
    [baseFilteredOrders]
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
            <OrderProgressBar
              steps={progressSteps}
              activeStep={activeTab}
              onStepClick={handleStepClick}
            />

            <div className="space-y-4">
              <OrdersFilter
                onSearch={handleSearch}
                onPaymentChange={handlePaymentChange}
                onClearFilters={handleClearFilters}
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
                  userRole={userRole}
                  onCallCustomer={handleCallCustomer}
                  onViewDetails={handleViewDetails}
                  onAssignOrder={handleAssignOrder}
                  onCallStatusChange={handleCallStatusChange}
                  showAgentColumn={false}
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
