import { useMemo, useState } from "react";
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
import { PageLayout } from "@/components/page-layout";
import { StatusBadge } from "@/components/status-badge";
import { PaymentBadge } from "@/components/payment-badge";
import { EmptyState } from "@/components/empty-state";
import { OrderQuickPreview } from "@/components/order-quick-preview";
import type { Order as UIOrder } from "@/components/orders-table";
import { cn } from "@/lib/utils";
import { Info, Package, PackageCheck, Percent, TrendingUp, Wallet } from "lucide-react";
import type { Order as BackendOrder } from "@shared/schema";

// ─────────────────────────────────────────────────────────────────────────────
// My Converted Orders — per-agent view of the orders recovered by an agent,
// attributed via their personal Shopify coupon code. Metrics header +
// clickable orders table that opens the same Quick-Preview drawer as the
// main Orders page so the interaction model matches everywhere else.
//
// Backend contract:
//   GET /api/agents/me/converted-orders  → { couponCode, orders[] }
//   GET /api/agents/me/performance       → { convertedCount, gmv, deliveredCount,
//                                             deliveredGmv, deliveryRatePct,
//                                             commission, codCount, prepaidCount }
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
// it's stuck in NDR — quiet visual signal, no explanatory copy needed.
const AT_RISK_SHIPPING = new Set(["ndr", "rto_initiated", "rto_ofd", "lost"]);

// Backend Order → the UI Order shape the shared components (OrdersTable /
// OrderQuickPreview) expect. Mirrors the transformOrder in orders.tsx —
// kept local (rather than shared) because that one pulls in the joined
// assignedToUser which we don't fetch on this endpoint.
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

  // Quick-preview state — same interaction model as the main Orders page.
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const selectedOrder = selectedIndex >= 0 ? uiOrders[selectedIndex] ?? null : null;

  const openPreviewAt = (index: number) => {
    setSelectedIndex(index);
    setIsPreviewOpen(true);
  };
  const navigatePreview = (direction: "prev" | "next") => {
    if (uiOrders.length === 0) return;
    const next = direction === "prev" ? selectedIndex - 1 : selectedIndex + 1;
    if (next < 0 || next >= uiOrders.length) return;
    setSelectedIndex(next);
  };

  return (
    <PageLayout
      title="My Converted Orders"
      description="Orders attributed to your coupon code — with live shipping status and commission earned."
    >
      <div className="p-6 space-y-6">
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
                  {uiOrders.map((row, index) => {
                    const highlight = AT_RISK_SHIPPING.has((row.status || "").toLowerCase());
                    return (
                      <TableRow
                        key={row.id}
                        className={cn(
                          "group hover-elevate cursor-pointer",
                          highlight &&
                            "bg-amber-50/40 dark:bg-amber-500/5",
                        )}
                        onClick={() => openPreviewAt(index)}
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

      <OrderQuickPreview
        order={selectedOrder}
        open={isPreviewOpen}
        onOpenChange={(open) => {
          setIsPreviewOpen(open);
          if (!open) setSelectedIndex(-1);
        }}
        currentIndex={selectedIndex}
        totalOrders={uiOrders.length}
        onNavigate={navigatePreview}
        onStatusUpdate={() => {
          // A status change from the drawer may flip an order into/out of
          // delivered — refresh both the list and the metrics.
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
