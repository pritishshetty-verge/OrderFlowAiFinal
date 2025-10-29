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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Package, PackageCheck, ChevronLeft, ChevronRight } from "lucide-react";
import { OrderQuickPreview } from "@/components/order-quick-preview";
import { CourierSelectionModal } from "@/components/courier-selection-modal";
import { PageLayout } from "@/components/page-layout";
import { FulfilFilter } from "@/components/fulfil-filter";
import { PaymentBadge } from "@/components/payment-badge";
import type { Order as BackendOrder } from "@shared/schema";
import type { Order } from "@/components/orders-table";

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
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

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
        order.shopifyOrderNumber.toLowerCase().includes(query) ||
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
      const toDate = new Date(dateRange.to);
      toDate.setHours(23, 59, 59, 999);
      if (confirmedDate > toDate) return false;
    }

    return true;
  });

  // Pagination
  const totalOrders = filteredOrders.length;
  const totalPages = Math.ceil(totalOrders / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalOrders);
  const paginatedOrders = filteredOrders.slice(startIndex, endIndex);

  const agents = users?.filter((u) => u.role === "agent") || [];
  const allSelected = paginatedOrders.length > 0 && selectedOrders.size === paginatedOrders.length;

  const handleSelectAll = () => {
    if (allSelected) {
      setSelectedOrders(new Set());
    } else {
      setSelectedOrders(new Set(paginatedOrders.map((order) => order.id)));
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
      shopifyOrderId: order.shopifyOrderNumber,
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

  const handleClearFilters = () => {
    setSearchQuery("");
    setDateRange({});
    setPaymentFilter("all");
    setAgentFilter("all");
  };

  return (
    <PageLayout
      title="Fulfil"
      description="Confirmed orders ready for fulfillment and shipment"
    >
      <div className="p-6 space-y-6">
        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-16 w-full" data-testid="skeleton-filter" />
            <Skeleton className="h-96 w-full" data-testid="skeleton-table" />
          </div>
        ) : (
          <>
            <FulfilFilter
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              dateRange={dateRange}
              onDateRangeChange={setDateRange}
              agentFilter={agentFilter}
              onAgentFilterChange={setAgentFilter}
              paymentFilter={paymentFilter}
              onPaymentFilterChange={setPaymentFilter}
              agents={agents}
              onClearFilters={handleClearFilters}
            />

            {filteredOrders.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <PackageCheck className="h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-lg font-medium">No confirmed orders</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {confirmedOrders.length === 0
                      ? "Confirmed orders will appear here"
                      : "No orders match your filters"}
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="flex flex-col gap-4">
                {/* Summary Info */}
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    Showing {startIndex + 1}-{endIndex} of {totalOrders} order{totalOrders !== 1 ? "s" : ""}
                  </p>
                  {selectedOrders.size > 0 && (
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">
                        {selectedOrders.size} selected
                      </span>
                    </div>
                  )}
                </div>

                {/* Table Container with Sticky Header and Footer */}
                <div className="rounded-lg border bg-card">
                  <div className="relative">
                    <Table>
                      <TableHeader className="sticky top-0 z-10 bg-card shadow-sm">
                        <TableRow>
                          <TableHead className="w-[50px] bg-card">
                            <Checkbox
                              checked={allSelected}
                              onCheckedChange={handleSelectAll}
                              aria-label="Select all"
                              data-testid="checkbox-select-all"
                            />
                          </TableHead>
                          <TableHead className="w-[120px] bg-card">Order ID</TableHead>
                          <TableHead className="bg-card">Customer</TableHead>
                          <TableHead className="bg-card">Phone</TableHead>
                          <TableHead className="text-right bg-card">Value</TableHead>
                          <TableHead className="bg-card">Payment</TableHead>
                          <TableHead className="bg-card">Confirmed At</TableHead>
                          <TableHead className="bg-card">Agent</TableHead>
                          <TableHead className="text-right bg-card">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {paginatedOrders.map((order) => (
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
                                aria-label={`Select order ${order.shopifyOrderNumber}`}
                                data-testid={`checkbox-order-${order.id}`}
                              />
                            </TableCell>
                            <TableCell className="font-mono text-xs font-medium">
                              #{order.shopifyOrderNumber}
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
                              <PaymentBadge method={order.paymentMethod as "cod" | "prepaid"} />
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

                  {/* Pagination Footer */}
                  <div className="sticky bottom-0 bg-card border-t p-4 z-10">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">
                          Showing {totalOrders === 0 ? 0 : startIndex + 1}-{endIndex} of {totalOrders} orders
                        </span>
                      </div>

                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-muted-foreground">Rows per page:</span>
                          <Select value={String(pageSize)} onValueChange={(value) => {
                            setPageSize(Number(value));
                            setCurrentPage(1);
                          }}>
                            <SelectTrigger className="w-[80px]" data-testid="select-page-size">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="10">10</SelectItem>
                              <SelectItem value="25">25</SelectItem>
                              <SelectItem value="50">50</SelectItem>
                              <SelectItem value="100">100</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="flex items-center gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                            disabled={currentPage === 1}
                            data-testid="button-prev-page"
                          >
                            <ChevronLeft className="h-4 w-4" />
                            Previous
                          </Button>
                          <span className="text-sm text-muted-foreground px-4">
                            Page {currentPage} of {totalPages || 1}
                          </span>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                            disabled={currentPage >= totalPages}
                            data-testid="button-next-page"
                          >
                            Next
                            <ChevronRight className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

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
            shopifyOrderNumber: selectedOrderForCourier.shopifyOrderNumber,
            customerName: selectedOrderForCourier.customerName,
            total: Number(selectedOrderForCourier.totalPrice),
            paymentMethod: selectedOrderForCourier.paymentMethod,
          }}
        />
      )}
    </PageLayout>
  );
}
