import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  RefreshCcw,
  Search,
  Loader2,
  Package as PackageIcon,
  Truck,
  Copy,
} from "lucide-react";
import { format } from "date-fns";

// One return row as returned by GET /api/returns (joined with order details).
interface ReturnRow {
  id: string;
  rmaNumber: string;
  status: string;
  refundType: string | null;
  refundAmount: string | null;
  trackingAwb: string | null;
  createdAt: string;
  orderId: string | null;
  orderNumber: string | null;
  customerName: string | null;
  customerEmail: string | null;
}

// Color-coded status badge. Buckets: yellow (pending), blue (in transit /
// shipping), green (received / refunded / resolved), red (rejected), gray.
function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { label: string; className: string }> = {
    PENDING_FEE: {
      label: "Unpaid",
      className: "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-400",
    },
    PENDING_APPROVAL: {
      label: "Pending Approval",
      className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-500/15 dark:text-yellow-400",
    },
    APPROVED: {
      label: "Approved",
      className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-400",
    },
    PICKUP_SCHEDULED: {
      label: "Pickup Scheduled",
      className: "bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-400",
    },
    IN_TRANSIT: {
      label: "In Transit",
      className: "bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-400",
    },
    RECEIVED: {
      label: "Received",
      className: "bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-400",
    },
    INSPECTED: {
      label: "Inspected",
      className: "bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-400",
    },
    REFUNDED: {
      label: "Refunded",
      className: "bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-400",
    },
    REJECTED: {
      label: "Rejected",
      className: "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-400",
    },
  };
  const c = cfg[status] ?? {
    label: status,
    className: "bg-muted text-muted-foreground",
  };
  return (
    <Badge className={`border-0 text-xs font-medium ${c.className}`}>
      {c.label}
    </Badge>
  );
}

// Maps each tab to the set of statuses it includes.
const TAB_FILTERS: Record<string, string[] | null> = {
  all: null,
  pending: ["PENDING_FEE", "PENDING_APPROVAL"],
  received: ["RECEIVED", "INSPECTED"],
  refunded: ["REFUNDED"],
};

// Indian Rupee formatter — all refund/price values are INR.
const inrFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
});

function fmtAmount(amt: string | null | undefined): string {
  if (!amt) return "—";
  const n = parseFloat(amt);
  return isNaN(n) ? "—" : inrFormatter.format(n);
}

// ── RMA detail slide-over ───────────────────────────────────────────────────

interface OrderDetail {
  shopifyOrderNumber: string | null;
  customerName: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  totalPrice: string | null;
  shopifyCreatedAt: string | null;
  shippingAddressLine1: string | null;
  shippingAddressLine2: string | null;
  shippingCity: string | null;
  shippingState: string | null;
  shippingPincode: string | null;
}

interface OrderItemDetail {
  id: string;
  productName: string;
  variantTitle: string | null;
  quantity: number;
  price: string;
  imageUrl: string | null;
}

interface ReturnDetailResponse {
  return: ReturnRow & {
    returnReason: string | null;
    customerNotes: string | null;
    refundType: string | null;
  };
  order: OrderDetail | null;
  items: OrderItemDetail[];
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right">{value}</span>
    </div>
  );
}

function RmaDetailSheet({
  returnId,
  onClose,
}: {
  returnId: string | null;
  onClose: () => void;
}) {
  const { toast } = useToast();

  const { data, isLoading } = useQuery<ReturnDetailResponse>({
    queryKey: ["/api/returns", returnId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/returns/${returnId}`);
      return (await res.json()) as ReturnDetailResponse;
    },
    enabled: !!returnId,
  });

  const approveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(
        "POST",
        `/api/returns/${returnId}/approve-pickup`,
      );
      return await res.json();
    },
    onSuccess: (resp: { awb?: string }) => {
      toast({
        title: "Pickup scheduled",
        description: resp?.awb
          ? `Reverse pickup booked with Delhivery. AWB ${resp.awb}.`
          : "Reverse pickup scheduled with Delhivery.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/returns"] });
      queryClient.invalidateQueries({ queryKey: ["/api/returns", returnId] });
    },
    onError: (err: Error) => {
      toast({
        title: "Could not schedule pickup",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const ret = data?.return;
  const order = data?.order;
  const items = data?.items ?? [];
  // A return is only approvable once the reverse-pickup fee is paid (the PayU
  // webhook flips it to PENDING_APPROVAL). PENDING_FEE = unpaid, must NOT be
  // actionable from the dashboard.
  const isAwaitingPayment = !!ret && ret.status === "PENDING_FEE";
  const isApprovable = !!ret && ret.status === "PENDING_APPROVAL";

  const copyAwb = (awb: string) => {
    navigator.clipboard?.writeText(awb);
    toast({ title: "AWB copied", description: awb });
  };

  return (
    <Sheet open={!!returnId} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        className="w-full sm:max-w-xl overflow-y-auto p-0 flex flex-col gap-0"
        data-testid="sheet-return-detail"
      >
        {isLoading || !ret ? (
          <div className="p-6 space-y-4">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : (
          <>
            <SheetHeader className="space-y-3 p-6 border-b">
              <div className="flex items-center gap-3 flex-wrap">
                <SheetTitle className="text-lg">{ret.rmaNumber}</SheetTitle>
                <StatusBadge status={ret.status} />
              </div>
              <SheetDescription className="text-xs">
                Requested{" "}
                {ret.createdAt
                  ? format(new Date(ret.createdAt), "dd MMM yyyy")
                  : "—"}
                {order?.shopifyOrderNumber ? ` · Order #${order.shopifyOrderNumber}` : ""}
              </SheetDescription>
            </SheetHeader>

            <div className="flex-1 overflow-y-auto">
              {/* Tracking AWB (once scheduled) */}
              {ret.trackingAwb && (
                <div className="m-6 mb-0 rounded-lg border bg-muted/30 p-3 flex items-center gap-3">
                  <Truck className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-muted-foreground">Reverse pickup AWB</p>
                    <p className="text-sm font-medium font-mono truncate">
                      {ret.trackingAwb}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyAwb(ret.trackingAwb!)}
                    data-testid="button-copy-awb"
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              )}

              {/* Customer */}
              <div className="p-6 pb-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-2">
                  Customer
                </p>
                <InfoRow label="Name" value={order?.customerName || "—"} />
                <InfoRow label="Email" value={order?.customerEmail || "—"} />
                <InfoRow label="Phone" value={order?.customerPhone || "—"} />
                {(order?.shippingCity || order?.shippingState) && (
                  <InfoRow
                    label="Location"
                    value={[order?.shippingCity, order?.shippingState]
                      .filter(Boolean)
                      .join(", ")}
                  />
                )}
              </div>

              <Separator />

              {/* Order items */}
              <div className="p-6 pb-4 space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
                  Order details
                </p>
                {items.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No line items on the linked order.
                  </p>
                ) : (
                  items.map((item) => (
                    <div key={item.id} className="flex items-center gap-3">
                      {item.imageUrl ? (
                        <img
                          src={item.imageUrl}
                          alt={item.productName}
                          className="h-10 w-10 rounded-md object-cover border border-border flex-shrink-0"
                        />
                      ) : (
                        <div className="h-10 w-10 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
                          <PackageIcon className="h-5 w-5 text-muted-foreground" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">
                          {item.productName}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {item.variantTitle ? `${item.variantTitle} · ` : ""}
                          Qty {item.quantity}
                        </p>
                      </div>
                      <span className="text-sm text-muted-foreground">
                        {fmtAmount(item.price)}
                      </span>
                    </div>
                  ))
                )}
              </div>

              <Separator />

              {/* Return reason + notes + refund */}
              <div className="p-6 space-y-4">
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">
                    Return reason
                  </p>
                  <p className="text-sm">
                    {ret.returnReason || (
                      <span className="text-muted-foreground">Not provided</span>
                    )}
                  </p>
                </div>
                {ret.customerNotes && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">
                      Customer notes
                    </p>
                    <p className="text-sm rounded-lg border bg-muted/30 p-3">
                      {ret.customerNotes}
                    </p>
                  </div>
                )}
                <div className="rounded-lg border divide-y">
                  <InfoRow
                    label="Refund type"
                    value={(ret.refundType || "STORE_CREDIT").replace(/_/g, " ")}
                  />
                  <InfoRow
                    label="Expected refund"
                    value={
                      <span className="text-base">{fmtAmount(ret.refundAmount)}</span>
                    }
                  />
                </div>
              </div>
            </div>

            {/* Footer action */}
            {isAwaitingPayment ? (
              // Unpaid: the customer hasn't paid the reverse-pickup fee yet.
              // Ops must NOT be able to process this — show a locked notice
              // instead of the approve button. (The server also rejects it.)
              <div className="border-t p-6">
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-500/30 dark:bg-red-500/10">
                  <p className="text-sm font-medium text-red-800 dark:text-red-400">
                    Awaiting return fee payment
                  </p>
                  <p className="mt-0.5 text-xs text-red-700/80 dark:text-red-400/80">
                    This RMA is locked until the customer pays the reverse-pickup
                    fee. It can't be approved or scheduled until payment is
                    confirmed.
                  </p>
                </div>
                <Button className="mt-3 w-full gap-2" disabled data-testid="button-approve-locked-unpaid">
                  <Truck className="h-4 w-4" />
                  Approve &amp; Schedule Pickup
                </Button>
              </div>
            ) : isApprovable ? (
              <div className="border-t p-6">
                <Button
                  className="w-full gap-2"
                  onClick={() => approveMutation.mutate()}
                  disabled={approveMutation.isPending}
                  data-testid="button-approve-schedule-pickup"
                >
                  {approveMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Truck className="h-4 w-4" />
                  )}
                  {approveMutation.isPending
                    ? "Scheduling pickup…"
                    : "Approve & Schedule Pickup"}
                </Button>
              </div>
            ) : null}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

export default function ReturnsPage() {
  const [tab, setTab] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: returns = [], isLoading } = useQuery<ReturnRow[]>({
    queryKey: ["/api/returns"],
  });

  const filtered = useMemo(() => {
    const statuses = TAB_FILTERS[tab];
    return returns.filter((r) => {
      if (statuses && !statuses.includes(r.status)) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        return (
          r.rmaNumber.toLowerCase().includes(q) ||
          (r.orderNumber ?? "").toLowerCase().includes(q) ||
          (r.customerName ?? "").toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [returns, tab, search]);

  return (
    <main className="flex-1 overflow-auto">
      <div className="p-6 max-w-screen-xl mx-auto space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <RefreshCcw className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Returns</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                {isLoading
                  ? "Loading…"
                  : `${returns.length} return request${returns.length === 1 ? "" : "s"}`}
              </p>
            </div>
          </div>
        </div>

        {/* Tabs + search */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList>
              <TabsTrigger value="all" data-testid="tab-returns-all">
                All Requests
              </TabsTrigger>
              <TabsTrigger value="pending" data-testid="tab-returns-pending">
                Pending Approval
              </TabsTrigger>
              <TabsTrigger value="received" data-testid="tab-returns-received">
                Received
              </TabsTrigger>
              <TabsTrigger value="refunded" data-testid="tab-returns-refunded">
                Refunded
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="relative max-w-xs w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Search RMA, order, customer…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        {/* Table */}
        <div className="rounded-lg border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="text-left font-medium text-muted-foreground px-4 py-3 w-[20%]">
                  RMA Number
                </th>
                <th className="text-left font-medium text-muted-foreground px-4 py-3 w-[18%]">
                  Order ID
                </th>
                <th className="text-left font-medium text-muted-foreground px-4 py-3 w-[18%]">
                  Date
                </th>
                <th className="text-left font-medium text-muted-foreground px-4 py-3 w-[24%]">
                  Status
                </th>
                <th className="text-right font-medium text-muted-foreground px-4 py-3 w-[20%]">
                  Refund Amount
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="border-b last:border-0">
                    {[...Array(5)].map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <Skeleton className="h-4 w-24" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-16 text-center">
                    <RefreshCcw className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
                    <p className="text-muted-foreground font-medium">
                      {search || tab !== "all"
                        ? "No returns match this view"
                        : "No return requests yet"}
                    </p>
                  </td>
                </tr>
              ) : (
                filtered.map((r) => (
                  <tr
                    key={r.id}
                    className="border-b last:border-0 hover:bg-muted/30 transition-colors cursor-pointer"
                    data-testid={`row-return-${r.id}`}
                    onClick={() => setSelectedId(r.id)}
                  >
                    <td className="px-4 py-3">
                      <span className="font-medium">{r.rmaNumber}</span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {r.orderNumber ? `#${r.orderNumber}` : "—"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {r.createdAt
                        ? format(new Date(r.createdAt), "dd MMM yyyy")
                        : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="px-4 py-3 text-right font-medium">
                      {fmtAmount(r.refundAmount)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          {!isLoading && filtered.length > 0 && (
            <div className="px-4 py-2.5 border-t bg-muted/20 text-xs text-muted-foreground">
              Showing {filtered.length} of {returns.length} returns · Click a row
              for details
            </div>
          )}
        </div>
      </div>

      {/* RMA detail slide-over */}
      <RmaDetailSheet
        returnId={selectedId}
        onClose={() => setSelectedId(null)}
      />
    </main>
  );
}
