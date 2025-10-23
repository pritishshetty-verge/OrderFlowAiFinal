import { useState } from "react";
import { DashboardStats } from "@/components/dashboard-stats";
import { OrdersFilter } from "@/components/orders-filter";
import { OrdersTable, type Order } from "@/components/orders-table";
import { OrderDetailsDialog } from "@/components/order-details-dialog";
import { ConnectionStatus } from "@/components/connection-status";
import { ThemeToggle } from "@/components/theme-toggle";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { LogOut } from "lucide-react";

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
];

export default function DashboardPage() {
  const [, setLocation] = useLocation();
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [filteredOrders, setFilteredOrders] = useState(mockOrders);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [isConnected] = useState(true); //todo: remove mock functionality

  const userRole = (localStorage.getItem("userRole") as "admin" | "manager" | "agent") || "admin";

  const handleLogout = () => {
    localStorage.removeItem("userRole");
    setLocation("/login");
  };

  const handleViewDetails = (order: Order) => {
    setSelectedOrder(order);
    setIsDialogOpen(true);
  };

  const handleCallCustomer = (order: Order) => {
    console.log("Calling customer:", order.customerName, order.customerPhone);
    alert(`Calling ${order.customerName} at ${order.customerPhone}`);
  };

  const handleAssignOrder = (order: Order) => {
    console.log("Assigning order:", order.id);
    alert(`Assign order #${order.shopifyOrderId} to agent`);
  };

  const handleSearch = (value: string) => {
    setSearchQuery(value);
    applyFilters(value, statusFilter, paymentFilter);
  };

  const handleStatusChange = (value: string) => {
    setStatusFilter(value);
    applyFilters(searchQuery, value, paymentFilter);
  };

  const handlePaymentChange = (value: string) => {
    setPaymentFilter(value);
    applyFilters(searchQuery, statusFilter, value);
  };

  const handleClearFilters = () => {
    setSearchQuery("");
    setStatusFilter("all");
    setPaymentFilter("all");
    setFilteredOrders(mockOrders);
  };

  const applyFilters = (search: string, status: string, payment: string) => {
    let filtered = [...mockOrders];

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

  //todo: remove mock functionality - calculate from real data
  const stats = {
    totalOrders: mockOrders.length,
    confirmedOrders: mockOrders.filter((o) => o.status === "confirmed").length,
    cancelledOrders: mockOrders.filter((o) => o.status === "cancelled").length,
    totalRevenue: mockOrders
      .filter((o) => o.status === "confirmed")
      .reduce((sum, o) => sum + o.total, 0),
  };

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
          <ThemeToggle />
          <Button
            variant="ghost"
            size="icon"
            onClick={handleLogout}
            data-testid="button-logout"
          >
            <LogOut className="h-5 w-5" />
          </Button>
        </div>
      </header>

      <main className="flex-1 overflow-auto p-6">
        <div className="space-y-6">
          <DashboardStats {...stats} />
          
          <div className="space-y-4">
            <OrdersFilter
              onSearch={handleSearch}
              onStatusChange={handleStatusChange}
              onPaymentChange={handlePaymentChange}
              onClearFilters={handleClearFilters}
            />
            
            <OrdersTable
              orders={filteredOrders}
              userRole={userRole}
              onCallCustomer={handleCallCustomer}
              onViewDetails={handleViewDetails}
              onAssignOrder={handleAssignOrder}
            />
          </div>
        </div>
      </main>

      <OrderDetailsDialog
        order={selectedOrder}
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
      />
    </div>
  );
}
