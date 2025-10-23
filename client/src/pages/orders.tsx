import { useState } from "react";
import { PageLayout } from "@/components/page-layout";
import { OrdersFilter } from "@/components/orders-filter";
import { OrdersTable, type Order } from "@/components/orders-table";
import { OrderQuickPreview } from "@/components/order-quick-preview";
import { AssignOrderDialog } from "@/components/assign-order-dialog";
import { OrderProgressBar } from "@/components/order-progress-bar";
import { Card, CardContent } from "@/components/ui/card";
import { Package } from "lucide-react";

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
  const [isQuickPreviewOpen, setIsQuickPreviewOpen] = useState(false);
  const [isAssignDialogOpen, setIsAssignDialogOpen] = useState(false);
  const [filteredOrders, setFilteredOrders] = useState(
    mockOrders.filter((o) => o.status === "assigned")
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [activeTab, setActiveTab] = useState("assigned");

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

  const applyFilters = (search: string, status: string, payment: string, step: string) => {
    let filtered = [...mockOrders];

    // Role-based filtering for agents
    if (userRole === "agent") {
      filtered = filtered.filter((order) => order.assignedTo === "Priya Sharma"); // Mock current user
    }

    // Progress step-based filtering
    if (step === "assigned") {
      filtered = filtered.filter((order) => order.status === "assigned");
    } else if (step === "confirmed") {
      filtered = filtered.filter((order) => order.status === "confirmed");
    } else if (step === "cancelled") {
      filtered = filtered.filter((order) => order.status === "cancelled");
    } else if (step === "followup") {
      filtered = filtered.filter((order) => order.status === "pending" || order.status === "shipped");
    } else if (step === "failed") {
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

  const handleStepClick = (status: string) => {
    setActiveTab(status);
    applyFilters(searchQuery, statusFilter, paymentFilter, status);
  };

  // Calculate stats for progress bar
  const progressSteps = [
    {
      label: "Assigned",
      count: mockOrders.filter((o) => o.status === "assigned").length,
      status: "assigned" as const,
    },
    {
      label: "Confirmed",
      count: mockOrders.filter((o) => o.status === "confirmed").length,
      status: "confirmed" as const,
    },
    {
      label: "Cancelled",
      count: mockOrders.filter((o) => o.status === "cancelled").length,
      status: "cancelled" as const,
    },
    {
      label: "Follow-Up",
      count: mockOrders.filter((o) => o.status === "pending" || o.status === "shipped").length,
      status: "followup" as const,
    },
    {
      label: "Failed Delivery",
      count: mockOrders.filter((o) => o.status === "ndr").length,
      status: "failed" as const,
    },
  ];

  return (
    <PageLayout
      title="Orders"
      description={userRole === "agent" ? "Manage your assigned orders" : "Manage all Shopify orders"}
    >
      <div className="p-6 space-y-6">
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
        </div>
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
