import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageLayout } from "@/components/page-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, ExternalLink, Banknote, CreditCard } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useActiveStore } from "@/hooks/use-store";
import { NewReshipmentDialog } from "@/components/reshipments/new-reshipment-dialog";
import {
  ReshipmentDetailDrawer,
  type ReshipmentDetail,
} from "@/components/reshipments/reshipment-detail-drawer";
import { EditReshipmentDialog } from "@/components/reshipments/edit-reshipment-dialog";
import { format } from "date-fns";

// ─────────────────────────────────────────────────────────────────────
// Reshipments — dashboard for the NDR team's re-dispatch log. Replaces
// the manual spreadsheet: one click creates a duplicate order in
// Shopify with the correct financial framing, then the AWB + courier
// status flow in automatically via webhooks.
// ─────────────────────────────────────────────────────────────────────

type Row = ReshipmentDetail;

interface Stats {
  scope: "mine" | "store";
  total: number;
  delivered: number;
  inTransit: number;
  ndr: number;
  rto: number;
  pending: number;
  cancelled: number;
}

const REASON_LABEL: Record<string, string> = {
  courier_error: "Courier error",
  customer_unavailable: "Customer unavailable",
  fake_delivery_attempt: "Fake delivery attempt",
  address_issue: "Address issue",
  product_damaged: "Product damaged",
  other: "Other",
};

// Chips mirror the Orders page conventions: purple "active" pill for
// Pending, colored family fills for the rest (blue in-transit, yellow
// NDR, green delivered, red RTO, slate cancelled).
const STATUS_PILL: Record<Row["courierStatus"], { label: string; cls: string }> = {
  pending: {
    label: "Pending",
    cls: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300 border border-violet-200 dark:border-violet-700",
  },
  in_transit: {
    label: "In Transit",
    cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 border border-blue-200 dark:border-blue-700",
  },
  ndr: {
    label: "NDR",
    cls: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300 border border-yellow-200 dark:border-yellow-700",
  },
  delivered: {
    label: "Delivered",
    cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-700",
  },
  rto: {
    label: "RTO",
    cls: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 border border-red-200 dark:border-red-700",
  },
  cancelled: {
    label: "Cancelled",
    cls: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-600",
  },
};

// Matches the Orders PaymentBadge: icon + colored/grey outline pill.
function PaymentPill({ type }: { type: "cod" | "prepaid" }) {
  const isCod = type === "cod";
  const cls = isCod
    ? "text-slate-600 dark:text-slate-300 border-slate-400 dark:border-slate-500"
    : "text-green-600 dark:text-green-400 border-green-600 dark:border-green-400";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border bg-transparent px-2.5 py-0.5 text-xs font-medium ${cls}`}
    >
      {isCod ? <Banknote className="h-3 w-3" /> : <CreditCard className="h-3 w-3" />}
      {isCod ? "COD" : "Prepaid"}
    </span>
  );
}

function shopifyOrderUrl(storeUrl: string | null | undefined, shopifyId: string): string {
  return `https://${storeUrl ?? "admin.shopify.com"}/admin/orders/${shopifyId}`;
}

export default function ReshipmentsPage() {
  const [tab, setTab] = useState<"all" | "attention">("all");
  const [openNew, setOpenNew] = useState(false);
  const [selected, setSelected] = useState<Row | null>(null);
  const [editing, setEditing] = useState<Row | null>(null);
  const { activeStoreId, activeStore } = useActiveStore();
  const userId = typeof window !== "undefined" ? localStorage.getItem("userId") : null;
  const userRole = typeof window !== "undefined" ? localStorage.getItem("userRole") : null;
  const isAdmin = userRole === "admin";

  const { data, isLoading, refetch } = useQuery<Row[]>({
    queryKey: ["/api/reshipments", tab, userId, activeStoreId],
    queryFn: async () =>
      (
        await apiRequest("GET", `/api/reshipments?filter=${tab}&userId=${userId ?? ""}`)
      ).json(),
    enabled: !!userId && !!activeStoreId,
    refetchInterval: 60_000,
  });

  const { data: stats } = useQuery<Stats>({
    queryKey: ["/api/reshipments/stats", userId, activeStoreId],
    queryFn: async () =>
      (
        await apiRequest("GET", `/api/reshipments/stats?userId=${userId ?? ""}`)
      ).json(),
    enabled: !!userId && !!activeStoreId,
    refetchInterval: 60_000,
  });

  const rows = data ?? [];
  const attentionCount = useMemo(
    () =>
      (data ?? []).filter(
        (r) => r.courierStatus === "ndr" || r.courierStatus === "rto",
      ).length,
    [data],
  );

  return (
    <PageLayout
      title="Reshipments"
      description="Duplicate a failed order to Shopify with one click — AWB and courier status update automatically"
    >
      <div className="mx-auto max-w-7xl space-y-6 overflow-y-auto px-6 py-8">
        {/* Stats strip — agents see THEIR numbers (payroll transparency),
            admins see the store total. Scope label makes it explicit. */}
        {stats && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {(
              [
                ["Total", stats.total, ""],
                ["Delivered", stats.delivered, "text-emerald-600 dark:text-emerald-400"],
                ["In Transit", stats.inTransit, "text-blue-600 dark:text-blue-400"],
                ["Pending", stats.pending, "text-muted-foreground"],
                ["NDR", stats.ndr, "text-red-600 dark:text-red-400"],
                ["RTO", stats.rto, "text-red-600 dark:text-red-400"],
              ] as const
            ).map(([label, value, cls]) => (
              <div key={label} className="rounded-xl border bg-card p-3">
                <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                  {label}
                </p>
                <p className={`mt-1 text-xl font-semibold tabular-nums ${cls}`}>
                  {value.toLocaleString("en-IN")}
                </p>
              </div>
            ))}
          </div>
        )}
        {/* Payroll-scope caption is agent-only. Admins see the store total
            without a redundant caption. */}
        {stats?.scope === "mine" && (
          <p className="-mt-2 text-[11px] text-muted-foreground">
            Showing your reshipments only — payroll incentives are calculated from your
            delivered count.
          </p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
            <TabsList
              className="h-auto justify-start gap-1 rounded-none border-0 bg-transparent p-0"
              data-testid="reshipments-tabs"
            >
              <TabsTrigger
                value="all"
                className="rounded-none border-b-2 border-transparent bg-transparent px-3.5 py-2.5 text-sm font-medium text-muted-foreground shadow-none transition-colors data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
              >
                All Reshipments
              </TabsTrigger>
              <TabsTrigger
                value="attention"
                className="rounded-none border-b-2 border-transparent bg-transparent px-3.5 py-2.5 text-sm font-medium text-muted-foreground shadow-none transition-colors data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
              >
                Requires Attention
                {attentionCount > 0 && (
                  <span className="ml-2 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500/10 px-1.5 text-[11px] font-semibold text-red-600 dark:text-red-400">
                    {attentionCount}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <Button onClick={() => setOpenNew(true)} data-testid="btn-new-reshipment">
            <Plus className="mr-1.5 h-4 w-4" />
            New Reshipment
          </Button>
        </div>

        {isLoading ? (
          <Skeleton className="h-96" />
        ) : rows.length === 0 ? (
          <Card>
            <CardContent className="p-10 text-center text-sm text-muted-foreground">
              {tab === "attention"
                ? "Nothing in the Attention queue right now — every live reshipment is on track."
                : "No reshipments yet. Click New Reshipment to log the first one."}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30 text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
                      <th className="px-4 py-3 text-left font-medium">Sr No</th>
                      <th className="px-4 py-3 text-left font-medium">Date</th>
                      <th className="px-4 py-3 text-left font-medium">Order ID</th>
                      <th className="px-4 py-3 text-left font-medium">New Order ID</th>
                      <th className="px-4 py-3 text-left font-medium">Customer</th>
                      <th className="px-4 py-3 text-left font-medium">Reason</th>
                      {isAdmin && (
                        <th className="px-4 py-3 text-left font-medium">Created by</th>
                      )}
                      <th className="px-4 py-3 text-left font-medium">Payment</th>
                      <th className="px-4 py-3 text-left font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="[&>tr]:border-b [&>tr:last-child]:border-0 [&>tr]:transition-colors hover:[&>tr]:bg-muted/40">
                    {rows.map((r, i) => (
                      <tr
                        key={r.id}
                        onClick={() => setSelected(r)}
                        className={`cursor-pointer ${
                          r.courierStatus === "cancelled" ? "text-muted-foreground" : ""
                        }`}
                        data-testid={`reshipment-row-${r.id}`}
                      >
                        <td className="px-4 py-3 tabular-nums text-muted-foreground">
                          {i + 1}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {format(new Date(r.createdAt), "dd MMM yyyy")}
                        </td>
                        <td className="px-4 py-3">
                          <a
                            href={shopifyOrderUrl(
                              activeStore?.storeUrl,
                              r.originalShopifyOrderId,
                            )}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1 font-medium text-brand hover:underline"
                          >
                            {r.originalShopifyOrderName}
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </td>
                        <td className="px-4 py-3">
                          {r.newShopifyOrderId ? (
                            <a
                              href={shopifyOrderUrl(
                                activeStore?.storeUrl,
                                r.newShopifyOrderId,
                              )}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 font-medium text-brand hover:underline"
                            >
                              {r.newShopifyOrderName ?? `#${r.newShopifyOrderId}`}
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={r.courierStatus === "cancelled" ? "line-through" : ""}
                          >
                            {r.customerName}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {REASON_LABEL[r.reason] ?? r.reason}
                        </td>
                        {isAdmin && (
                          <td className="px-4 py-3 text-muted-foreground">
                            {r.createdByName ?? "—"}
                          </td>
                        )}
                        <td className="px-4 py-3">
                          <PaymentPill type={r.paymentType} />
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_PILL[r.courierStatus].cls}`}
                          >
                            {STATUS_PILL[r.courierStatus].label}
                          </span>
                          {r.trackingAwb && (
                            <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                              {r.trackingAwb}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <NewReshipmentDialog
        open={openNew}
        onOpenChange={setOpenNew}
        onCreated={() => {
          setOpenNew(false);
          void refetch();
        }}
      />

      <ReshipmentDetailDrawer
        row={selected}
        open={!!selected}
        onOpenChange={(v) => !v && setSelected(null)}
        storeUrl={activeStore?.storeUrl}
        onEdit={(r) => setEditing(r)}
        onChanged={() => void refetch()}
      />

      <EditReshipmentDialog
        row={editing}
        open={!!editing}
        onOpenChange={(v) => !v && setEditing(null)}
        onSaved={() => {
          setEditing(null);
          void refetch();
        }}
      />
    </PageLayout>
  );
}
