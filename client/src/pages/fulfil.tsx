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
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Package, PackageCheck, ChevronLeft, ChevronRight } from "lucide-react";
import { OrderQuickPreview } from "@/components/order-quick-preview";
import { CourierSelectionModal } from "@/components/courier-selection-modal";
import { PageLayout } from "@/components/page-layout";
import { FulfilFilter } from "@/components/fulfil-filter";
import { PaymentBadge } from "@/components/payment-badge";
import type { Order as BackendOrder } from "@shared/schema";
import type { Order } from "@/components/orders-table";
import { apiRequest } from "@/lib/queryClient";
import { useActiveStore } from "@/hooks/use-store";

export default function FulfilPage() {
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [selectedOrderIndex, setSelectedOrderIndex] = useState<number>(-1);
  const [isQuickPreviewOpen, setIsQuickPreviewOpen] = useState(false);
  const [courierSelectionModalOpen, setCourierSelectionModalOpen] = useState(false);
  const [selectedOrderForCourier, setSelectedOrderForCourier] = useState<BackendOrder | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [dateRange, setDateRange] = useState<{ from?: Date; to?: Date }>({});
  const [paymentFilter, setPaymentFilter] = useState<string>("all");
  const [agentFilter, setAgentFilter] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  // Active store scope keys the query so a switch invalidates
  // the Confirmed-orders cache instantly. apiRequest threads
  // X-Active-Store-Id so the backend filters server-side.
  const { activeStoreId } = useActiveStore();

  // Fetch confirmed orders with server-side filtering
  const { data: ordersResponse, isLoading } = useQuery<{ orders: BackendOrder[]; total: number }>({
    queryKey: ["/api/orders", activeStoreId, "Confirmed", currentPage, pageSize, agentFilter],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: pageSize.toString(),
        callStatus: "Confirmed",
      });

      // Add agent filter if set
      if (agentFilter !== "all") {
        params.append("agentId", agentFilter);
      }

      const res = await apiRequest("GET", `/api/orders?${params.toString()}`);
      return res.json();
    },
    enabled: !!activeStoreId,
  });

  // Fetch users for agent filter
  const { data: users } = useQuery<any[]>({
    queryKey: ["/api/users"],
  });

  // Server returns only Confirmed orders, apply remaining client-side filters
  const confirmedOrders = ordersResponse?.orders || [];

  // Apply client-side filters (search, payment, date)
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

  // Server-side pagination - use API's total count for accurate pagination
  const totalOrders = ordersResponse?.total || 0;
  const totalPages = Math.ceil(totalOrders / pageSize);
  // For display, use client-filtered orders from current page
  const paginatedOrders = filteredOrders;
  // Calculate display range for "Showing X-Y of Z orders"
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + paginatedOrders.length, totalOrders);

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
    const index = paginatedOrders.findIndex((o) => o.id === order.id);
    setSelectedOrder(displayOrder);
    setSelectedOrderIndex(index);
    setIsQuickPreviewOpen(true);
  };

  const handleNavigateOrder = (direction: "prev" | "next") => {
    const newIndex = direction === "prev" ? selectedOrderIndex - 1 : selectedOrderIndex + 1;
    if (newIndex >= 0 && newIndex < paginatedOrders.length) {
      const order = paginatedOrders[newIndex];
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
      setSelectedOrderIndex(newIndex);
    }
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
                <CardContent className="p-0">
                  <EmptyState
                    icon={PackageCheck}
                    title="No confirmed orders"
                    description={confirmedOrders.length === 0
                      ? "Confirmed orders will appear here once your team starts fulfilling."
                      : "No orders match your filters — try widening the date range or clearing the search."}
                  />
                </CardContent>
              </Card>
            ) : (
              <div className="flex flex-col gap-4">
                {/* Table Container with Sticky Header and Footer */}
                <div className="rounded-2xl border bg-card shadow-sm overflow-hidden">
                  <div className="relative">
                    <Table>
                      <TableHeader className="sticky top-0 z-10 bg-muted/40 backdrop-blur-sm">
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
                              <div className="flex items-center gap-2.5">
                                <span
                                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand/10 text-[10px] font-semibold text-brand"
                                  aria-hidden
                                >
                                  {(() => {
                                    const parts = order.customerName.trim().split(/\s+/).filter(Boolean);
                                    if (!parts.length) return "?";
                                    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
                                    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
                                  })()}
                                </span>
                                <span className="font-medium text-sm truncate">{order.customerName}</span>
                              </div>
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
        currentIndex={selectedOrderIndex}
        totalOrders={paginatedOrders.length}
        onNavigate={handleNavigateOrder}
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
