import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RefreshCcw, Search } from "lucide-react";
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
      label: "Pending Fee",
      className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-500/15 dark:text-yellow-400",
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

export default function ReturnsPage() {
  const [tab, setTab] = useState<string>("all");
  const [search, setSearch] = useState("");

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

  const fmtAmount = (amt: string | null) => {
    if (!amt) return "—";
    const n = parseFloat(amt);
    return isNaN(n) ? "—" : `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

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
                    className="border-b last:border-0 hover:bg-muted/30 transition-colors"
                    data-testid={`row-return-${r.id}`}
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
              Showing {filtered.length} of {returns.length} returns
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
