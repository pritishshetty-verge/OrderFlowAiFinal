import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageLayout } from "@/components/page-layout";
import { StatusBadge } from "@/components/status-badge";
import { PaymentBadge } from "@/components/payment-badge";
import { EmptyState } from "@/components/empty-state";
import { OrderQuickPreview } from "@/components/order-quick-preview";
import type { Order as UIOrder } from "@/components/orders-table";
import { cn } from "@/lib/utils";
import {
  ChevronLeft,
  ChevronRight,
  Info,
  Package,
  PackageCheck,
  Percent,
  Search,
  TrendingUp,
  Wallet,
} from "lucide-react";
import type { Order as BackendOrder } from "@shared/schema";
import { SHIPPING_STATUS_LABELS, type ShippingStatus } from "@shared/schema";

// ─────────────────────────────────────────────────────────────────────────────
// My Converted Orders — per-agent view of orders recovered by an agent,
// attributed via their personal Shopify coupon code.
//
// Metric tiles = ALL coupon-matched orders (stable commission math).
// Table       = filtered / paginated / searchable — same interaction model
//                as the main Orders page (click a row → OrderQuickPreview).
// ─────────────────────────────────────────────────────────────────────────────

interface Performance {
  couponCode: string | null;
  convertedCount: number;
  gmv: number;
  deliveredCount: number;
  deliveredGmv: number;
  deliveryRatePct: number;
  commission: number;
  codCount: number;
  prepaidCount: number;
}

interface ConvertedOrdersResponse {
  couponCode: string | null;
  orders: BackendOrder[];
}

const currency = (v: number) =>
  `₹${(Math.round(v * 100) / 100).toLocaleString("en-IN")}`;

// Subtle amber tint on rows where the courier is still moving the parcel or
// it's stuck in NDR — quiet visual signal.
const AT_RISK_SHIPPING = new Set(["ndr", "rto_initiated", "rto_ofd", "lost"]);

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

// Groupings that make the shipping-status filter usable — the raw enum has
// 13 values; agents think in a shorter mental model.
const SHIPPING_FILTER_OPTIONS: { value: string; label: string; matches: ShippingStatus[] }[] = [
  { value: "unfulfilled", label: SHIPPING_STATUS_LABELS.unfulfilled, matches: ["unfulfilled"] },
  { value: "in_transit", label: "In Transit", matches: ["awb_assigned", "ready_for_pickup", "picked_up", "in_transit"] },
  { value: "out_for_delivery", label: SHIPPING_STATUS_LABELS.out_for_delivery, matches: ["out_for_delivery"] },
  { value: "delivered", label: SHIPPING_STATUS_LABELS.delivered, matches: ["delivered"] },
  { value: "ndr", label: "NDR / Undelivered", matches: ["ndr"] },
  { value: "rto", label: "RTO", matches: ["rto_initiated", "rto_ofd", "rto_delivered"] },
  { value: "cancelled", label: SHIPPING_STATUS_LABELS.cancelled, matches: ["cancelled"] },
  { value: "lost", label: SHIPPING_STATUS_LABELS.lost, matches: ["lost"] },
];

// Backend Order → the UI Order shape the shared components expect.
function toUIOrder(o: BackendOrder): UIOrder {
  const addressParts = [
    o.shippingAddressLine1,
    o.shippingAddressLine2,
    o.shippingCity,
    o.shippingState,
    o.shippingPincode,
  ].filter(Boolean);
  return {
    id: o.id,
    shopifyOrderId: o.shopifyOrderNumber,
    customerName: o.customerName,
    customerPhone: o.customerPhone,
    shippingAddress: addressParts.length > 0 ? addressParts.join(", ") : undefined,
    shippingCity: o.shippingCity || undefined,
    shippingState: o.shippingState || undefined,
    shippingPincode: o.shippingPincode || undefined,
    items: o.itemsSummary || "",
    total: parseFloat(o.totalPrice ?? "0") || 0,
    paymentMethod: (o.paymentMethod ?? "").toLowerCase().includes("cod") ? "cod" : "prepaid",
    financialStatus: o.financialStatus,
    status: o.status as UIOrder["status"],
    callStatus: (o.callStatus as UIOrder["callStatus"]) || undefined,
    assignedTo: o.assignedTo || undefined,
    assignedToUser: null,
    discountCode: o.discountCode || undefined,
    tags: o.tags || undefined,
    createdAt: new Date(o.shopifyCreatedAt),
  };
}

// PaymentBadge's own classification (financial_status = pending → COD) —
// the same rule the metric tile uses, kept in sync so the filter and the
// chips never disagree.
function classifyPayment(o: UIOrder): "cod" | "prepaid" | "other" {
  const fs = (o.financialStatus ?? "").toLowerCase();
  if (fs === "voided" || fs === "refunded") return "other";
  if (fs === "paid") return "prepaid";
  if (fs === "pending" || o.paymentMethod === "cod") return "cod";
  return "prepaid";
}

function StatTile({
  title,
  value,
  icon,
  description,
  isLoading,
  tone = "default",
}: {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  description?: string;
  isLoading?: boolean;
  tone?: "default" | "success" | "warning";
}) {
  const toneClass =
    tone === "success"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "warning"
        ? "text-amber-600 dark:text-amber-400"
        : "text-foreground";
  return (
    <div className="rounded-lg border bg-card p-5 shadow-sm transition-shadow hover:shadow">
      <div className="flex items-center justify-between gap-2">
        <span
          className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground"
          data-testid={`stat-title-${title.toLowerCase().replace(/\s+/g, "-")}`}
        >
          {title}
        </span>
        <span className="text-muted-foreground/70" aria-hidden>
          {icon}
        </span>
      </div>
      <div className="mt-2.5 h-9 flex items-end">
        {isLoading ? (
          <Skeleton className="h-7 w-20" />
        ) : (
          <span
            className={cn(
              "text-3xl font-semibold tracking-tight tabular-nums leading-none",
              toneClass,
            )}
            data-testid={`stat-value-${title.toLowerCase().replace(/\s+/g, "-")}`}
          >
            {value}
          </span>
        )}
      </div>
      {description && (
        <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
          {description}
        </p>
      )}
    </div>
  );
}

export default function MyConvertedOrdersPage() {
  const queryClient = useQueryClient();
  const userId = typeof window !== "undefined" ? localStorage.getItem("userId") : null;
  const currentUserParam = userId ? `?currentUserId=${encodeURIComponent(userId)}` : "";

  const perfQuery = useQuery<Performance>({
    queryKey: [`/api/agents/me/performance${currentUserParam}`],
    refetchInterval: 60_000,
  });
  const ordersQuery = useQuery<ConvertedOrdersResponse>({
    queryKey: [`/api/agents/me/converted-orders${currentUserParam}`],
    refetchInterval: 60_000,
  });

  const performance = perfQuery.data;
  const backendOrders = ordersQuery.data?.orders ?? [];
  const couponCode = perfQuery.data?.couponCode ?? ordersQuery.data?.couponCode ?? null;
  const isLoading = perfQuery.isLoading || ordersQuery.isLoading;
  const codPrepaidTotal = (performance?.codCount ?? 0) + (performance?.prepaidCount ?? 0);
  const codShare =
    codPrepaidTotal > 0
      ? Math.round(((performance?.codCount ?? 0) / codPrepaidTotal) * 100)
      : 0;

  const uiOrders = useMemo(() => backendOrders.map(toUIOrder), [backendOrders]);

  // Filters + search — client-side (dataset is bounded by coupon match).
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [paymentFilter, setPaymentFilter] = useState<"all" | "cod" | "prepaid">("all");
  const [shippingFilter, setShippingFilter] = useState<string>("all");
  const [pageSize, setPageSize] = useState(50);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchInput.trim().toLowerCase()), 200);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Reset to page 1 whenever a filter changes so the user doesn't get
  // stranded on an empty page.
  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch, paymentFilter, shippingFilter, pageSize]);

  const filteredOrders = useMemo(() => {
    const shippingMatchSet = (() => {
      if (shippingFilter === "all") return null;
      const found = SHIPPING_FILTER_OPTIONS.find((o) => o.value === shippingFilter);
      return found ? new Set<string>(found.matches) : null;
    })();
    return uiOrders.filter((row) => {
      if (paymentFilter !== "all" && classifyPayment(row) !== paymentFilter) return false;
      if (shippingMatchSet && !shippingMatchSet.has((row.status || "").toLowerCase())) {
        return false;
      }
      if (debouncedSearch) {
        const digits = debouncedSearch.replace(/\D/g, "");
        const hay = [
          row.shopifyOrderId,
          row.customerName,
          row.customerPhone,
        ]
          .filter(Boolean)
          .map((s) => String(s).toLowerCase())
          .join(" ");
        if (!hay.includes(debouncedSearch)) {
          // Fall back to a digits-only compare for phone matches so
          // "9876543210" finds "+91 98765-43210" without the user
          // having to guess formatting.
          if (!digits) return false;
          const phoneDigits = (row.customerPhone || "").replace(/\D/g, "");
          const orderDigits = row.shopifyOrderId.replace(/\D/g, "");
          if (!phoneDigits.includes(digits) && !orderDigits.includes(digits)) {
            return false;
          }
        }
      }
      return true;
    });
  }, [uiOrders, paymentFilter, shippingFilter, debouncedSearch]);

  const totalFiltered = filteredOrders.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalFiltered);
  const paginatedOrders = filteredOrders.slice(startIndex, endIndex);

  const hasActiveFilters =
    debouncedSearch !== "" || paymentFilter !== "all" || shippingFilter !== "all";

  // Quick-preview state.
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const selectedOrder = selectedIndex >= 0 ? filteredOrders[selectedIndex] ?? null : null;

  const openPreviewAt = (indexInPage: number) => {
    // Translate row-index-in-page → row-index-in-filtered-list so drawer
    // navigation (prev/next) walks the whole filtered set, not the page.
    setSelectedIndex(startIndex + indexInPage);
    setIsPreviewOpen(true);
  };
  const navigatePreview = (direction: "prev" | "next") => {
    if (filteredOrders.length === 0) return;
    const next = direction === "prev" ? selectedIndex - 1 : selectedIndex + 1;
    if (next < 0 || next >= filteredOrders.length) return;
    setSelectedIndex(next);
    // Keep the paginated view in sync — jump to whichever page the
    // navigated-to row lives on so the row is highlighted underneath.
    setCurrentPage(Math.floor(next / pageSize) + 1);
  };

  return (
    <PageLayout
      title="My Converted Orders"
      description="Orders attributed to your coupon code — with live shipping status and commission earned."
    >
      <div className="flex flex-col h-full">
        <div className="flex-1 overflow-auto p-6 space-y-6">
          {couponCode ? (
            <div
              className="flex items-center gap-2 text-sm text-muted-foreground"
              data-testid="coupon-code-label"
            >
              <Percent className="h-4 w-4" />
              Coupon code:{" "}
              <span className="font-mono font-semibold text-foreground">{couponCode}</span>
            </div>
          ) : (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertTitle>No coupon code set</AlertTitle>
              <AlertDescription>
                An admin needs to add your personal Shopify coupon code on the Team
                page. Once set, orders using it will appear here automatically.
              </AlertDescription>
            </Alert>
          )}

          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile
              title="Converted Orders"
              value={performance?.convertedCount ?? 0}
              description={performance ? `${currency(performance.gmv)} total GMV` : undefined}
              icon={<Package className="h-4 w-4" />}
              isLoading={isLoading}
            />
            <StatTile
              title="Delivery Rate"
              value={`${performance?.deliveryRatePct ?? 0}%`}
              description={
                performance
                  ? `${performance.deliveredCount}/${performance.convertedCount} delivered`
                  : undefined
              }
              icon={<PackageCheck className="h-4 w-4" />}
              isLoading={isLoading}
              tone={
                performance && performance.deliveryRatePct >= 70
                  ? "success"
                  : performance && performance.convertedCount > 0
                    ? "warning"
                    : "default"
              }
            />
            <StatTile
              title="Earned Commission"
              value={currency(performance?.commission ?? 0)}
              description={
                performance
                  ? `10% × ${currency(performance.deliveredGmv)} delivered GMV`
                  : undefined
              }
              icon={<Wallet className="h-4 w-4" />}
              isLoading={isLoading}
              tone="success"
            />
            <StatTile
              title="COD vs Prepaid"
              value={codPrepaidTotal > 0 ? `${codShare}% / ${100 - codShare}%` : "—"}
              description={
                performance
                  ? `${performance.codCount} COD · ${performance.prepaidCount} Prepaid`
                  : undefined
              }
              icon={<TrendingUp className="h-4 w-4" />}
              isLoading={isLoading}
            />
          </div>

          {/* Search + filter bar — mirrors the Orders page toolbar shape:
              a search input on the left, filter selects on the right,
              a "Clear" button when anything is active. */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full sm:max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search order #, name, or phone…"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="pl-9"
                data-testid="input-search-converted"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={paymentFilter} onValueChange={(v) => setPaymentFilter(v as any)}>
                <SelectTrigger className="w-[140px]" data-testid="select-payment-filter">
                  <SelectValue placeholder="Payment" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All payments</SelectItem>
                  <SelectItem value="cod">COD</SelectItem>
                  <SelectItem value="prepaid">Prepaid</SelectItem>
                </SelectContent>
              </Select>
              <Select value={shippingFilter} onValueChange={setShippingFilter}>
                <SelectTrigger className="w-[180px]" data-testid="select-shipping-filter">
                  <SelectValue placeholder="Shipping status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  {SHIPPING_FILTER_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {hasActiveFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSearchInput("");
                    setPaymentFilter("all");
                    setShippingFilter("all");
                  }}
                  data-testid="button-clear-filters"
                >
                  Clear
                </Button>
              )}
            </div>
          </div>

          <div className="rounded-lg border bg-card">
            {isLoading ? (
              <div className="p-4 space-y-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-9 w-full" />
                ))}
              </div>
            ) : uiOrders.length === 0 ? (
              <EmptyState
                icon={Package}
                title="No converted orders yet"
                description={
                  couponCode
                    ? "Once a customer places an order using your coupon code, it will appear here."
                    : "Ask an admin to add your Shopify coupon code from the Team page to start tracking."
                }
              />
            ) : paginatedOrders.length === 0 ? (
              <EmptyState
                icon={Search}
                title="No matches"
                description="No orders match your current filters. Try clearing them."
              />
            ) : (
              <div className="relative overflow-x-auto">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-muted/40 backdrop-blur-sm">
                    <TableRow className="[&_th]:h-9 [&_th]:px-3 [&_th]:text-[11px] [&_th]:font-medium [&_th]:uppercase [&_th]:tracking-wider [&_th]:text-muted-foreground">
                      <TableHead className="w-[110px]">Order ID</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Payment</TableHead>
                      <TableHead>Shipping Status</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead>Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="[&_td]:py-2.5 [&_td]:px-3 [&_td]:text-[13px]">
                    {paginatedOrders.map((row, indexInPage) => {
                      const highlight = AT_RISK_SHIPPING.has((row.status || "").toLowerCase());
                      return (
                        <TableRow
                          key={row.id}
                          className={cn(
                            "group hover-elevate cursor-pointer",
                            highlight && "bg-amber-50/40 dark:bg-amber-500/5",
                          )}
                          onClick={() => openPreviewAt(indexInPage)}
                          data-testid={`converted-order-row-${row.id}`}
                        >
                          <TableCell className="font-mono tabular-nums text-xs font-medium text-muted-foreground">
                            <span className="text-muted-foreground/70">#</span>
                            <span className="text-foreground">{row.shopifyOrderId}</span>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col leading-tight">
                              <span className="font-medium text-foreground">
                                {row.customerName}
                              </span>
                              <span className="text-[11px] text-muted-foreground tabular-nums mt-0.5">
                                {row.customerPhone}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <PaymentBadge
                              method={row.paymentMethod}
                              financialStatus={row.financialStatus}
                            />
                          </TableCell>
                          <TableCell>
                            <StatusBadge status={row.status} />
                          </TableCell>
                          <TableCell className="text-right font-medium tabular-nums">
                            {currency(row.total)}
                          </TableCell>
                          <TableCell className="text-[11px] text-muted-foreground whitespace-nowrap tabular-nums">
                            {row.createdAt.toLocaleDateString("en-IN", {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            })}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </div>

        {/* Sticky footer pagination — mirrors OrdersTable's shape. */}
        {!isLoading && uiOrders.length > 0 && (
          <div className="sticky bottom-0 bg-card border-t p-4 z-10">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-sm text-muted-foreground" data-testid="pagination-summary">
                Showing {totalFiltered === 0 ? 0 : startIndex + 1}-{endIndex} of{" "}
                {totalFiltered} orders
              </span>
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Rows per page:</span>
                  <Select
                    value={String(pageSize)}
                    onValueChange={(v) => setPageSize(Number(v))}
                  >
                    <SelectTrigger className="w-[80px]" data-testid="select-page-size">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PAGE_SIZE_OPTIONS.map((n) => (
                        <SelectItem key={n} value={String(n)}>
                          {n}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={safePage <= 1}
                    data-testid="button-prev-page"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Previous
                  </Button>
                  <span className="text-sm text-muted-foreground px-4 tabular-nums">
                    Page {safePage} of {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={safePage >= totalPages}
                    data-testid="button-next-page"
                  >
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <OrderQuickPreview
        order={selectedOrder}
        open={isPreviewOpen}
        onOpenChange={(open) => {
          setIsPreviewOpen(open);
          if (!open) setSelectedIndex(-1);
        }}
        currentIndex={selectedIndex}
        totalOrders={filteredOrders.length}
        onNavigate={navigatePreview}
        onStatusUpdate={() => {
          queryClient.invalidateQueries({
            predicate: (q) => {
              const k = q.queryKey?.[0];
              return typeof k === "string" && k.startsWith("/api/agents/me/");
            },
          });
        }}
      />
    </PageLayout>
  );
}
