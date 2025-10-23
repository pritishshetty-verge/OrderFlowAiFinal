import { useState } from "react";
import { PageLayout } from "@/components/page-layout";
import { OrdersFilter } from "@/components/orders-filter";
import { OrdersTable, type Order } from "@/components/orders-table";
import { OrderDetailsDialog } from "@/components/order-details-dialog";
import { AssignOrderDialog } from "@/components/assign-order-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Package, Clock, Truck, AlertCircle } from "lucide-react";

//todo: remove mock functionality
const mockOrders: Order[] = [
  {
    id: "1",
    shopifyOrderId: "1001",
    customerName: "Rajesh Kumar",
    customerPhone: "+91 98765 43210",
    items: "iPhone 15 Pro, AirPods Pro",
    total: 145000,
    paymentMethod: "cod",
    status: "assigned",
    assignedTo: "Priya Sharma",
    createdAt: new Date(Date.now() - 1000 * 60 * 30),
  },
  {
    id: "2",
    shopifyOrderId: "1002",
    customerName: "Priya Patel",
    customerPhone: "+91 98765 43211",
    items: "Samsung Galaxy S24",
    total: 79999,
    paymentMethod: "prepaid",
    status: "confirmed",
    assignedTo: "Amit Singh",
    createdAt: new Date(Date.now() - 1000 * 60 * 120),
  },
  {
    id: "3",
    shopifyOrderId: "1003",
    customerName: "Amit Verma",
    customerPhone: "+91 98765 43212",
    items: "OnePlus 12, Smart Watch",
    total: 95000,
    paymentMethod: "cod",
    status: "pending",
    createdAt: new Date(Date.now() - 1000 * 60 * 15),
  },
  {
    id: "4",
    shopifyOrderId: "1004",
    customerName: "Sneha Reddy",
    customerPhone: "+91 98765 43213",
    items: "iPad Air, Apple Pencil",
    total: 68000,
    paymentMethod: "prepaid",
    status: "shipped",
    assignedTo: "Priya Sharma",
    createdAt: new Date(Date.now() - 1000 * 60 * 240),
  },
  {
    id: "5",
    shopifyOrderId: "1005",
    customerName: "Vikram Singh",
    customerPhone: "+91 98765 43214",
    items: "MacBook Pro 14",
    total: 199000,
    paymentMethod: "cod",
    status: "cancelled",
    assignedTo: "Amit Singh",
    createdAt: new Date(Date.now() - 1000 * 60 * 180),
  },
  {
    id: "6",
    shopifyOrderId: "1006",
    customerName: "Anjali Gupta",
    customerPhone: "+91 98765 43215",
    items: "Sony WH-1000XM5",
    total: 29990,
    paymentMethod: "prepaid",
    status: "delivered",
    assignedTo: "Priya Sharma",
    createdAt: new Date(Date.now() - 1000 * 60 * 360),
  },
  {
    id: "7",
    shopifyOrderId: "1007",
    customerName: "Karan Malhotra",
    customerPhone: "+91 98765 43216",
    items: "PS5 Console, Games Bundle",
    total: 54990,
    paymentMethod: "cod",
    status: "ndr",
    assignedTo: "Amit Singh",
    createdAt: new Date(Date.now() - 1000 * 60 * 90),
  },
  {
    id: "8",
    shopifyOrderId: "1008",
    customerName: "Neha Sharma",
    customerPhone: "+91 98765 43217",
    items: "Dell XPS 13",
    total: 125000,
    paymentMethod: "prepaid",
    status: "confirmed",
    assignedTo: "Priya Sharma",
    createdAt: new Date(Date.now() - 1000 * 60 * 45),
  },
  {
    id: "9",
    shopifyOrderId: "1009",
    customerName: "Arjun Mehta",
    customerPhone: "+91 98765 43218",
    items: "Canon EOS R6, Lenses",
    total: 275000,
    paymentMethod: "cod",
    status: "assigned",
    assignedTo: "Priya Sharma",
    createdAt: new Date(Date.now() - 1000 * 60 * 60),
  },
  {
    id: "10",
    shopifyOrderId: "1010",
    customerName: "Divya Kapoor",
    customerPhone: "+91 98765 43219",
    items: "Nike Air Max, Adidas Sneakers",
    total: 18990,
    paymentMethod: "prepaid",
    status: "shipped",
    assignedTo: "Amit Singh",
    createdAt: new Date(Date.now() - 1000 * 60 * 300),
  },
];

interface OrdersPageProps {
  userRole?: "admin" | "manager" | "agent";
}

export default function OrdersPage({ userRole = "admin" }: OrdersPageProps) {
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [isDetailsDialogOpen, setIsDetailsDialogOpen] = useState(false);
  const [isAssignDialogOpen, setIsAssignDialogOpen] = useState(false);
  const [filteredOrders, setFilteredOrders] = useState(mockOrders);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [activeTab, setActiveTab] = useState("all");

  const handleViewDetails = (order: Order) => {
    setSelectedOrder(order);
    setIsDetailsDialogOpen(true);
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
    applyFilters(value, statusFilter, paymentFilter, activeTab);
  };

  const handleStatusChange = (value: string) => {
    setStatusFilter(value);
    applyFilters(searchQuery, value, paymentFilter, activeTab);
  };

  const handlePaymentChange = (value: string) => {
    setPaymentFilter(value);
    applyFilters(searchQuery, statusFilter, value, activeTab);
  };

  const handleClearFilters = () => {
    setSearchQuery("");
    setStatusFilter("all");
    setPaymentFilter("all");
    applyFilters("", "all", "all", activeTab);
  };

  const applyFilters = (search: string, status: string, payment: string, tab: string) => {
    let filtered = [...mockOrders];

    // Role-based filtering for agents
    if (userRole === "agent") {
      filtered = filtered.filter((order) => order.assignedTo === "Priya Sharma"); // Mock current user
    }

    // Tab-based filtering
    if (tab === "pending") {
      filtered = filtered.filter((order) => order.status === "pending");
    } else if (tab === "assigned") {
      filtered = filtered.filter((order) => order.status === "assigned");
    } else if (tab === "cod") {
      filtered = filtered.filter((order) => order.paymentMethod === "cod");
    } else if (tab === "ndr") {
      filtered = filtered.filter((order) => order.status === "ndr");
    }

    if (search) {
      const query = search.toLowerCase();
      filtered = filtered.filter(
        (order) =>
          order.shopifyOrderId.toLowerCase().includes(query) ||
          order.customerName.toLowerCase().includes(query) ||
          order.customerPhone.includes(query)
      );
    }

    if (status !== "all") {
      filtered = filtered.filter((order) => order.status === status);
    }

    if (payment !== "all") {
      filtered = filtered.filter((order) => order.paymentMethod === payment);
    }

    setFilteredOrders(filtered);
  };

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    applyFilters(searchQuery, statusFilter, paymentFilter, value);
  };

  // Calculate stats for quick view cards
  const stats = {
    pending: mockOrders.filter((o) => o.status === "pending").length,
    assigned: mockOrders.filter((o) => o.status === "assigned").length,
    cod: mockOrders.filter((o) => o.paymentMethod === "cod").length,
    ndr: mockOrders.filter((o) => o.status === "ndr").length,
  };

  return (
    <PageLayout
      title="Orders"
      description={userRole === "agent" ? "Manage your assigned orders" : "Manage all Shopify orders"}
    >
      <div className="p-6 space-y-6">

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card className="hover-elevate cursor-pointer" onClick={() => handleTabChange("pending")}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
              <CardTitle className="text-sm font-medium">Pending Orders</CardTitle>
              <Clock className="h-4 w-4 text-yellow-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.pending}</div>
              <p className="text-xs text-muted-foreground">Awaiting assignment</p>
            </CardContent>
          </Card>

          <Card className="hover-elevate cursor-pointer" onClick={() => handleTabChange("assigned")}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
              <CardTitle className="text-sm font-medium">Assigned Orders</CardTitle>
              <Package className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.assigned}</div>
              <p className="text-xs text-muted-foreground">Ready for verification</p>
            </CardContent>
          </Card>

          <Card className="hover-elevate cursor-pointer" onClick={() => handleTabChange("cod")}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
              <CardTitle className="text-sm font-medium">COD Orders</CardTitle>
              <AlertCircle className="h-4 w-4 text-amber-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.cod}</div>
              <p className="text-xs text-muted-foreground">Requires verification</p>
            </CardContent>
          </Card>

          <Card className="hover-elevate cursor-pointer" onClick={() => handleTabChange("ndr")}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
              <CardTitle className="text-sm font-medium">NDR Orders</CardTitle>
              <Truck className="h-4 w-4 text-orange-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.ndr}</div>
              <p className="text-xs text-muted-foreground">Failed delivery</p>
            </CardContent>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <TabsList>
            <TabsTrigger value="all" data-testid="tab-all-orders">
              All Orders
              <Badge variant="secondary" className="ml-2">
                {mockOrders.length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="pending" data-testid="tab-pending-orders">
              Pending
              <Badge variant="secondary" className="ml-2">
                {stats.pending}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="assigned" data-testid="tab-assigned-orders">
              Assigned
              <Badge variant="secondary" className="ml-2">
                {stats.assigned}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="cod" data-testid="tab-cod-orders">
              COD
              <Badge variant="secondary" className="ml-2">
                {stats.cod}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="ndr" data-testid="tab-ndr-orders">
              NDR
              <Badge variant="secondary" className="ml-2">
                {stats.ndr}
              </Badge>
            </TabsTrigger>
          </TabsList>

          <TabsContent value={activeTab} className="space-y-4 mt-6">
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
                    Try adjusting your filters or search query
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
          </TabsContent>
        </Tabs>
      </div>

      <OrderDetailsDialog
        order={selectedOrder}
        open={isDetailsDialogOpen}
        onOpenChange={setIsDetailsDialogOpen}
      />

      <AssignOrderDialog
        order={selectedOrder}
        open={isAssignDialogOpen}
        onOpenChange={setIsAssignDialogOpen}
      />
    </PageLayout>
  );
}
