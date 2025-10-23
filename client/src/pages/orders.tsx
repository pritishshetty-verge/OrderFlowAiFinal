import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageLayout } from "@/components/page-layout";
import { OrdersFilter } from "@/components/orders-filter";
import { OrdersTable, type Order } from "@/components/orders-table";
import { OrderQuickPreview } from "@/components/order-quick-preview";
import { AssignOrderDialog } from "@/components/assign-order-dialog";
import { OrderProgressBar } from "@/components/order-progress-bar";
import { Card, CardContent } from "@/components/ui/card";
import { Package } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import type { Order as BackendOrder, User } from "@shared/schema";

// Transform backend order to frontend order format
function transformOrder(order: BackendOrder, users: User[]): Order {
  const assignedUser = order.assignedTo
    ? users.find((u) => u.id === order.assignedTo)
    : undefined;

  return {
    id: order.id,
    shopifyOrderId: order.shopifyOrderNumber,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    items: order.itemsSummary || "",
    total: parseFloat(order.totalPrice),
    paymentMethod: order.paymentMethod === "cod" ? "cod" : "prepaid",
    status: order.status as Order["status"],
    assignedTo: assignedUser?.fullName,
    createdAt: new Date(order.shopifyCreatedAt),
  };
}

interface OrdersPageProps {
  userRole?: "admin" | "manager" | "agent";
}

export default function OrdersPage({ userRole = "admin" }: OrdersPageProps) {
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [isQuickPreviewOpen, setIsQuickPreviewOpen] = useState(false);
  const [isAssignDialogOpen, setIsAssignDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [activeTab, setActiveTab] = useState("assigned");

  // Fetch orders from backend
  const { data: ordersData, isLoading: ordersLoading } = useQuery<BackendOrder[]>({
    queryKey: ["/api/orders"],
  });

  // Fetch users for assignment display
  const { data: usersData, isLoading: usersLoading } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });

  // Transform backend orders to frontend format
  const allOrders = useMemo(() => {
    if (!ordersData || !usersData) return [];
    return ordersData.map((order) => transformOrder(order, usersData));
  }, [ordersData, usersData]);

  // Get current user ID for agent filtering
  const currentUserId = localStorage.getItem("userId");

  // Apply filters to orders
  const filteredOrders = useMemo(() => {
    let filtered = [...allOrders];

    // Role-based filtering for agents
    if (userRole === "agent" && currentUserId) {
      const backendFiltered = ordersData?.filter(
        (order) => order.assignedTo === currentUserId
      );
      filtered = backendFiltered
        ? backendFiltered.map((order) => transformOrder(order, usersData || []))
        : [];
    }

    // Progress step-based filtering
    if (activeTab === "assigned") {
      filtered = filtered.filter((order) => order.status === "assigned");
    } else if (activeTab === "confirmed") {
      filtered = filtered.filter((order) => order.status === "confirmed");
    } else if (activeTab === "cancelled") {
      filtered = filtered.filter((order) => order.status === "cancelled");
    } else if (activeTab === "followup") {
      filtered = filtered.filter(
        (order) => order.status === "pending" || order.status === "shipped"
      );
    } else if (activeTab === "failed") {
      filtered = filtered.filter((order) => order.status === "ndr");
    }

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (order) =>
          order.shopifyOrderId.toLowerCase().includes(query) ||
          order.customerName.toLowerCase().includes(query) ||
          order.customerPhone.includes(query)
      );
    }

    if (statusFilter !== "all") {
      filtered = filtered.filter((order) => order.status === statusFilter);
    }

    if (paymentFilter !== "all") {
      filtered = filtered.filter((order) => order.paymentMethod === paymentFilter);
    }

    return filtered;
  }, [allOrders, userRole, currentUserId, ordersData, usersData, activeTab, searchQuery, statusFilter, paymentFilter]);

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

  const handleStatusChange = (value: string) => {
    setStatusFilter(value);
  };

  const handlePaymentChange = (value: string) => {
    setPaymentFilter(value);
  };

  const handleClearFilters = () => {
    setSearchQuery("");
    setStatusFilter("all");
    setPaymentFilter("all");
  };

  const handleStepClick = (status: string) => {
    setActiveTab(status);
  };

  // Calculate stats for progress bar
  const progressSteps = useMemo(
    () => [
      {
        label: "Assigned",
        count: allOrders.filter((o) => o.status === "assigned").length,
        status: "assigned" as const,
      },
      {
        label: "Confirmed",
        count: allOrders.filter((o) => o.status === "confirmed").length,
        status: "confirmed" as const,
      },
      {
        label: "Cancelled",
        count: allOrders.filter((o) => o.status === "cancelled").length,
        status: "cancelled" as const,
      },
      {
        label: "Follow-Up",
        count: allOrders.filter((o) => o.status === "pending" || o.status === "shipped")
          .length,
        status: "followup" as const,
      },
      {
        label: "Failed Delivery",
        count: allOrders.filter((o) => o.status === "ndr").length,
        status: "failed" as const,
      },
    ],
    [allOrders]
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
                onStatusChange={handleStatusChange}
                onPaymentChange={handlePaymentChange}
                onClearFilters={handleClearFilters}
              />

              {filteredOrders.length === 0 ? (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-12">
                    <Package className="h-12 w-12 text-muted-foreground mb-4" />
                    <p className="text-lg font-medium">No orders found</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      {allOrders.length === 0
                        ? "No orders have been synced from Shopify yet"
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
