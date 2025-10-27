import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
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
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar as CalendarIcon, Filter, PackageCheck, Search, Package } from "lucide-react";
import { OrderQuickPreview } from "@/components/order-quick-preview";
import { CourierSelectionModal } from "@/components/courier-selection-modal";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { Order as BackendOrder } from "@shared/schema";
import type { Order } from "@/components/orders-table";
import { cn } from "@/lib/utils";

export default function FulfilPage() {
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [isQuickPreviewOpen, setIsQuickPreviewOpen] = useState(false);
  const [courierSelectionModalOpen, setCourierSelectionModalOpen] = useState(false);
  const [selectedOrderForCourier, setSelectedOrderForCourier] = useState<BackendOrder | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [dateRange, setDateRange] = useState<{ from?: Date; to?: Date }>({});
  const [paymentFilter, setPaymentFilter] = useState<string>("all");
  const [agentFilter, setAgentFilter] = useState<string>("all");

  // Fetch confirmed orders
  const { data: ordersResponse, isLoading } = useQuery<{ orders: BackendOrder[]; total: number }>({
    queryKey: ["/api/orders"],
  });

  // Fetch users for agent filter
  const { data: users } = useQuery<any[]>({
    queryKey: ["/api/users"],
  });

  const confirmedOrders = ordersResponse?.orders.filter(
    (order) => order.callStatus === "Confirmed"
  ) || [];

  // Apply filters
  const filteredOrders = confirmedOrders.filter((order) => {
    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const matchesSearch =
        order.shopifyOrderId.toLowerCase().includes(query) ||
        order.customerName.toLowerCase().includes(query) ||
        order.customerPhone.includes(query);
      if (!matchesSearch) return false;
    }

    // Payment method filter
    if (paymentFilter !== "all" && order.paymentMethod !== paymentFilter) {
      return false;
    }

    // Agent filter
    if (agentFilter !== "all" && order.assignedTo !== agentFilter) {
      return false;
    }

    // Date range filter
    if (dateRange.from && order.confirmedAt) {
      const confirmedDate = new Date(order.confirmedAt);
      if (confirmedDate < dateRange.from) return false;
    }
    if (dateRange.to && order.confirmedAt) {
      const confirmedDate = new Date(order.confirmedAt);
      // Set to end of day
      const toDate = new Date(dateRange.to);
      toDate.setHours(23, 59, 59, 999);
      if (confirmedDate > toDate) return false;
    }

    return true;
  });

  const agents = users?.filter((u) => u.role === "agent") || [];
  const allSelected = filteredOrders.length > 0 && selectedOrders.size === filteredOrders.length;
  const someSelected = selectedOrders.size > 0 && !allSelected;

  const handleSelectAll = () => {
    if (allSelected) {
      setSelectedOrders(new Set());
    } else {
      setSelectedOrders(new Set(filteredOrders.map((order) => order.id)));
    }
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

  const handleViewOrder = (order: BackendOrder) => {
    const displayOrder: Order = {
      id: order.id,
      shopifyOrderId: order.shopifyOrderId,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      items: order.itemsSummary || `${order.itemsCount} item(s)`,
      total: Number(order.totalPrice),
      paymentMethod: order.paymentMethod as "cod" | "prepaid",
      status: order.status as "pending" | "assigned" | "confirmed" | "cancelled" | "shipped" | "delivered" | "ndr",
      callStatus: order.callStatus as "Pending" | "Confirmed" | "Cancelled" | "Follow Up" | undefined,
      assignedTo: order.assignedTo || undefined,
      createdAt: new Date(order.createdAt),
    };
    setSelectedOrder(displayOrder);
    setIsQuickPreviewOpen(true);
  };

  const getAgentName = (agentId?: string | null) => {
    if (!agentId) return "Unassigned";
    const agent = users?.find((u) => u.id === agentId);
    return agent?.username || agent?.email || "Unknown";
  };

  const handleShipNow = (order: BackendOrder, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedOrderForCourier(order);
    setCourierSelectionModalOpen(true);
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <PackageCheck className="h-6 w-6 text-green-600 dark:text-green-400" />
          <h1 className="text-3xl font-bold">Fulfil</h1>
        </div>
        <p className="text-muted-foreground mt-1">
          Confirmed orders ready for fulfillment and shipment
        </p>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filters
          </CardTitle>
          <CardDescription>Filter confirmed orders by date, agent, or payment method</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search orders..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
                data-testid="input-search-orders"
              />
            </div>

            {/* Date Range */}
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "justify-start text-left font-normal",
                    !dateRange.from && "text-muted-foreground"
                  )}
                  data-testid="button-date-range"
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dateRange.from ? (
                    dateRange.to ? (
                      <>
                        {format(dateRange.from, "MMM dd")} - {format(dateRange.to, "MMM dd")}
                      </>
                    ) : (
                      format(dateRange.from, "MMM dd, yyyy")
                    )
                  ) : (
                    <span>Date range</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="range"
                  selected={{ from: dateRange.from, to: dateRange.to }}
                  onSelect={(range) => setDateRange({ from: range?.from, to: range?.to })}
                  numberOfMonths={2}
                  initialFocus
                />
              </PopoverContent>
            </Popover>

            {/* Agent Filter */}
            <Select value={agentFilter} onValueChange={setAgentFilter}>
              <SelectTrigger data-testid="select-agent-filter">
                <SelectValue placeholder="All agents" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All agents</SelectItem>
                {agents.map((agent) => (
                  <SelectItem key={agent.id} value={agent.id}>
                    {agent.username || agent.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Payment Method Filter */}
            <Select value={paymentFilter} onValueChange={setPaymentFilter}>
              <SelectTrigger data-testid="select-payment-filter">
                <SelectValue placeholder="All payments" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All payments</SelectItem>
                <SelectItem value="cod">COD</SelectItem>
                <SelectItem value="prepaid">Prepaid</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Clear Filters */}
          {(searchQuery || dateRange.from || paymentFilter !== "all" || agentFilter !== "all") && (
            <div className="mt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSearchQuery("");
                  setDateRange({});
                  setPaymentFilter("all");
                  setAgentFilter("all");
                }}
                data-testid="button-clear-filters"
              >
                Clear filters
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Orders Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Confirmed Orders</CardTitle>
              <CardDescription>
                {filteredOrders.length} order{filteredOrders.length !== 1 ? "s" : ""} ready for fulfillment
              </CardDescription>
            </div>
            {selectedOrders.size > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">
                  {selectedOrders.size} selected
                </span>
                <Button variant="outline" size="sm" data-testid="button-bulk-actions">
                  Bulk Actions (Coming Soon)
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="text-center py-12">
              <PackageCheck className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
              <h3 className="text-lg font-semibold mb-1">No confirmed orders</h3>
              <p className="text-sm text-muted-foreground">
                {confirmedOrders.length === 0
                  ? "Confirmed orders will appear here"
                  : "No orders match your filters"}
              </p>
            </div>
          ) : (
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[50px]">
                      <Checkbox
                        checked={allSelected}
                        onCheckedChange={handleSelectAll}
                        aria-label="Select all"
                        data-testid="checkbox-select-all"
                      />
                    </TableHead>
                    <TableHead className="w-[120px]">Order ID</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead className="text-right">Value</TableHead>
                    <TableHead>Payment</TableHead>
                    <TableHead>Confirmed At</TableHead>
                    <TableHead>Agent</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredOrders.map((order) => (
                    <TableRow
                      key={order.id}
                      className="hover-elevate cursor-pointer"
                      onClick={() => handleViewOrder(order)}
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
                        <span className="font-medium text-sm">{order.customerName}</span>
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {order.customerPhone}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        ₹{Number(order.totalPrice).toLocaleString("en-IN")}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={order.paymentMethod === "prepaid" ? "default" : "secondary"}
                        >
                          {order.paymentMethod === "cod" ? "COD" : "Prepaid"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {order.confirmedAt ? (
                          format(new Date(order.confirmedAt), "MMM dd, h:mm a")
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {getAgentName(order.assignedTo)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="default"
                          onClick={(e) => handleShipNow(order, e)}
                          data-testid={`button-ship-now-${order.id}`}
                        >
                          <Package className="h-4 w-4 mr-1" />
                          Ship Now
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Order Quick Preview */}
      <OrderQuickPreview
        order={selectedOrder}
        open={isQuickPreviewOpen}
        onOpenChange={setIsQuickPreviewOpen}
      />

      {/* Courier Selection Modal */}
      {selectedOrderForCourier && (
        <CourierSelectionModal
          open={courierSelectionModalOpen}
          onOpenChange={setCourierSelectionModalOpen}
          orderId={selectedOrderForCourier.id}
          orderDetails={{
            shopifyOrderNumber: selectedOrderForCourier.shopifyOrderId,
            customerName: selectedOrderForCourier.customerName,
            total: Number(selectedOrderForCourier.totalPrice),
            paymentMethod: selectedOrderForCourier.paymentMethod,
          }}
        />
      )}
    </div>
  );
}
