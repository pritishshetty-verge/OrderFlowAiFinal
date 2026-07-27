import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
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
import { Badge } from "@/components/ui/badge";
import { PageLayout } from "@/components/page-layout";
import { StatusBadge } from "@/components/status-badge";
import { PaymentBadge } from "@/components/payment-badge";
import { EmptyState } from "@/components/empty-state";
import { cn } from "@/lib/utils";
import {
  Info,
  Package,
  PackageCheck,
  Percent,
  TrendingUp,
  Wallet,
} from "lucide-react";
import type { Order } from "@shared/schema";

// ─────────────────────────────────────────────────────────────────────────────
// My Converted Orders — per-agent view of the orders they recovered, attributed
// by their personal Shopify coupon code. Combines Feature 2 ("live shipping
// status so agents can call about transit delays") and Feature 3 ("self-serve
// commission dashboard") behind a single sidebar entry.
//
// Backend contract:
//   GET /api/agents/me/converted-orders  → { couponCode, orders[] }
//   GET /api/agents/me/performance       → { convertedCount, gmv, deliveredCount,
//                                             deliveredGmv, deliveryRatePct,
//                                             commission, codCount, prepaidCount }
// Both self-scope to the signed-in user; admins may pass ?userId= to inspect.
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
  orders: Order[];
}

const currency = (v: number) =>
  `₹${(Math.round(v * 100) / 100).toLocaleString("en-IN")}`;

// Statuses that mean "still moving through the network" — agents may want to
// proactively call the customer on these, esp. for COD.
const AT_RISK_SHIPPING = new Set(["ndr", "rto_initiated", "rto_ofd", "lost"]);

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
  const userId = typeof window !== "undefined" ? localStorage.getItem("userId") : null;
  const currentUserParam = userId ? `?currentUserId=${encodeURIComponent(userId)}` : "";

  const perfQuery = useQuery<Performance>({
    queryKey: [`/api/agents/me/performance${currentUserParam}`],
    // Poll — commission ticks up when the courier flips a status to delivered.
    refetchInterval: 60_000,
  });
  const ordersQuery = useQuery<ConvertedOrdersResponse>({
    queryKey: [`/api/agents/me/converted-orders${currentUserParam}`],
    refetchInterval: 60_000,
  });

  const performance = perfQuery.data;
  const orders = ordersQuery.data?.orders ?? [];
  const couponCode = perfQuery.data?.couponCode ?? ordersQuery.data?.couponCode ?? null;
  const isLoading = perfQuery.isLoading || ordersQuery.isLoading;
  const codPrepaidTotal = (performance?.codCount ?? 0) + (performance?.prepaidCount ?? 0);
  const codShare =
    codPrepaidTotal > 0
      ? Math.round(((performance?.codCount ?? 0) / codPrepaidTotal) * 100)
      : 0;

  const orderedRows = useMemo(() => {
    return orders.map((o) => ({
      ...o,
      isAtRisk: AT_RISK_SHIPPING.has((o.status || "").toLowerCase()),
    }));
  }, [orders]);

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
            description={
              performance ? `${currency(performance.gmv)} total GMV` : undefined
            }
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
            value={
              codPrepaidTotal > 0 ? `${codShare}% / ${100 - codShare}%` : "—"
            }
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
          <div className="border-b px-4 py-3">
            <h2 className="text-sm font-semibold">Orders</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Rows highlighted in amber are still in-network or in NDR — good
              candidates for a proactive call, especially for COD.
            </p>
          </div>
          {isLoading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))}
            </div>
          ) : orderedRows.length === 0 ? (
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
                  {orderedRows.map((row) => {
                    const highlight = row.isAtRisk;
                    return (
                      <TableRow
                        key={row.id}
                        className={cn(
                          "group hover-elevate",
                          highlight &&
                            "bg-amber-50/60 hover:bg-amber-50 dark:bg-amber-500/5 dark:hover:bg-amber-500/10",
                        )}
                        data-testid={`converted-order-row-${row.id}`}
                      >
                        <TableCell className="font-mono tabular-nums text-xs font-medium text-muted-foreground">
                          <span className="text-muted-foreground/70">#</span>
                          <span className="text-foreground">{row.shopifyOrderNumber}</span>
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
                            method={
                              (row.paymentMethod || "").toLowerCase() === "cod"
                                ? "cod"
                                : "prepaid"
                            }
                            financialStatus={row.financialStatus}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <StatusBadge status={row.status} />
                            {highlight && (
                              <Badge
                                variant="outline"
                                className="rounded-full border-amber-500/50 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-400 no-default-hover-elevate"
                                data-testid={`badge-at-risk-${row.id}`}
                              >
                                Call customer
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums">
                          {currency(parseFloat(row.totalPrice ?? "0") || 0)}
                        </TableCell>
                        <TableCell className="text-[11px] text-muted-foreground whitespace-nowrap tabular-nums">
                          {row.createdAt
                            ? new Date(row.createdAt).toLocaleDateString("en-IN", {
                                day: "numeric",
                                month: "short",
                                year: "numeric",
                              })
                            : "—"}
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
    </PageLayout>
  );
}
