import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { DashboardStats } from "@/components/dashboard-stats";
import { OrdersFilter } from "@/components/orders-filter";
import { OrdersTable, type Order } from "@/components/orders-table";
import { OrderQuickPreview } from "@/components/order-quick-preview";
import { AssignOrderDialog } from "@/components/assign-order-dialog";
import { ConnectionStatus } from "@/components/connection-status";
import { NotificationsBell } from "@/components/notifications-bell";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
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
    assignedTo: assignedUser?.fullName,
    discountCode: order.discountCode || undefined,
    createdAt: new Date(order.shopifyCreatedAt),
  };
}

export default function DashboardPage() {
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [selectedOrderIndex, setSelectedOrderIndex] = useState<number>(-1);
  const [isQuickPreviewOpen, setIsQuickPreviewOpen] = useState(false);
  const [isAssignDialogOpen, setIsAssignDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [paymentFilter, setPaymentFilter] = useState("all");

  const userRole = (localStorage.getItem("userRole") as "admin" | "manager" | "agent") || "admin";
  const userId = localStorage.getItem("userId");

  // Fetch orders from backend with auto-refresh every 30 seconds
  // For agents: fetch only their assigned orders
  const { data: ordersResponse, isLoading: ordersLoading } = useQuery<{ orders: BackendOrder[]; total: number }>({
    queryKey: userRole === "agent" ? ["/api/orders", { assignedTo: userId }] : ["/api/orders"],
    refetchInterval: 30000, // Auto-refresh every 30 seconds for real-time webhook updates
  });

  // Fetch users for assignment display
  const { data: usersData, isLoading: usersLoading } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });

  // Transform backend orders to frontend format
  const allOrders = useMemo(() => {
    if (!ordersResponse?.orders || !usersData) return [];
    return ordersResponse.orders.map((order) => transformOrder(order, usersData));
  }, [ordersResponse, usersData]);

  // Check Shopify connection status (connected if we have orders synced)
  const isConnected = (ordersResponse?.orders?.length ?? 0) > 0;

  // Apply filters to orders
  const filteredOrders = useMemo(() => {
    let filtered = [...allOrders];

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
  }, [allOrders, searchQuery, statusFilter, paymentFilter]);

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

  // Calculate stats from real data
  const stats = useMemo(
    () => ({
      totalOrders: allOrders.length,
      confirmedOrders: allOrders.filter((o) => o.status === "confirmed").length,
      cancelledOrders: allOrders.filter((o) => o.status === "cancelled").length,
      totalRevenue: allOrders
        .filter((o) => o.status === "confirmed" || o.status === "delivered")
        .reduce((sum, o) => sum + o.total, 0),
    }),
    [allOrders]
  );

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      <header className="flex items-center justify-between gap-4 border-b border-border p-4">
        <div className="flex items-center gap-3">
          <SidebarTrigger data-testid="button-sidebar-toggle" />
          <div>
            <h1 className="text-xl font-semibold">Orders Dashboard</h1>
            <p className="text-sm text-muted-foreground">
              Manage and track all Shopify orders
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <ConnectionStatus connected={isConnected} />
          <NotificationsBell />
        </div>
      </header>
      <main className="flex-1 overflow-auto p-6">
        {isLoading ? (
          <div className="space-y-6">
            <div className="space-y-2">
              <Skeleton className="h-10 w-64" data-testid="skeleton-title" />
              <Skeleton className="h-4 w-96" data-testid="skeleton-description" />
            </div>
            <div className="grid gap-4 md:grid-cols-4">
              <Skeleton className="h-32" data-testid="skeleton-stat-1" />
              <Skeleton className="h-32" data-testid="skeleton-stat-2" />
              <Skeleton className="h-32" data-testid="skeleton-stat-3" />
              <Skeleton className="h-32" data-testid="skeleton-stat-4" />
            </div>
            <Skeleton className="h-96 w-full" data-testid="skeleton-table" />
          </div>
        ) : (
          <div className="space-y-6">
            <div>
              <h1 className="font-bold text-[20px]">Dashboard</h1>
            </div>

            <DashboardStats {...stats} />

            <div className="space-y-4">
              <OrdersFilter
                onSearch={handleSearch}
                onPaymentChange={handlePaymentChange}
                onClearFilters={handleClearFilters}
              />

              <OrdersTable
                orders={filteredOrders}
                totalCount={ordersResponse?.total}
                userRole={userRole}
                onCallCustomer={handleCallCustomer}
                onViewDetails={handleViewDetails}
                onAssignOrder={handleAssignOrder}
              />
            </div>
          </div>
        )}
      </main>
      <OrderQuickPreview
        order={selectedOrder}
        open={isQuickPreviewOpen}
        onOpenChange={setIsQuickPreviewOpen}
        currentIndex={selectedOrderIndex}
        totalOrders={filteredOrders.length}
        onNavigate={handleNavigateOrder}
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
    </div>
  );
}
