import { useMemo, useState } from "react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  X,
  ExternalLink,
  Copy,
  Check,
  Pencil,
  Ban,
  Loader2,
  Banknote,
  CreditCard,
  FileText,
  Package,
  Truck,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

// ─────────────────────────────────────────────────────────────────────
// Reshipment detail slide-over — mirrors the Orders quick-preview:
// two tabs (Overview + Shipment), a proper vertical timeline for
// tracking, and chips styled to match the Orders page conventions.
// ─────────────────────────────────────────────────────────────────────

export interface ReshipmentDetail {
  id: string;
  originalShopifyOrderId: string;
  originalShopifyOrderName: string;
  newShopifyOrderId: string | null;
  newShopifyOrderName: string | null;
  customerName: string;
  customerPhone: string;
  shippingAddress: any;
  reason: string;
  urgencyType: "instant" | "scheduled";
  scheduledDate: string | null;
  internalNotes: string | null;
  paymentType: "cod" | "prepaid";
  trackingAwb: string | null;
  courierName: string | null;
  courierStatus:
    | "pending"
    | "in_transit"
    | "ndr"
    | "delivered"
    | "rto"
    | "cancelled";
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
  cancelledAt?: string | null;
}

const REASON_LABEL: Record<string, string> = {
  courier_error: "Courier error",
  customer_unavailable: "Customer unavailable",
  fake_delivery: "Fake delivery attempt",
  address_issue: "Address issue",
  product_damaged: "Product damaged",
  other: "Other",
};

// ── Chip styles matching the Orders page conventions ────────────────
// Purple-text "active" for pending, colored families for the rest;
// cancelled uses a grey/slate family. Structure mirrors StatusBadge.
const STATUS_STYLES: Record<
  ReshipmentDetail["courierStatus"],
  { label: string; cls: string }
> = {
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

/** COD/Prepaid chip — matches the Orders PaymentBadge: icon + border. */
function PaymentChip({ type }: { type: "cod" | "prepaid" }) {
  const isCod = type === "cod";
  return (
    <Badge
      variant="outline"
      className={cn(
        "rounded-full px-3 py-1 text-xs font-medium border gap-1.5 bg-transparent",
        // Payment palette: COD → yellow (cash to collect), Prepaid → green.
        isCod
          ? "text-yellow-700 dark:text-yellow-500 border-yellow-500 dark:border-yellow-600"
          : "text-green-600 dark:text-green-400 border-green-600 dark:border-green-400",
      )}
      data-testid={`badge-payment-${type}`}
    >
      {isCod ? <Banknote className="h-3 w-3" /> : <CreditCard className="h-3 w-3" />}
      {isCod ? "COD" : "Prepaid"}
    </Badge>
  );
}

function StatusChip({ status }: { status: ReshipmentDetail["courierStatus"] }) {
  const s = STATUS_STYLES[status];
  return (
    <Badge
      variant="outline"
      className={cn("rounded-full px-3 py-1 text-xs font-medium", s.cls)}
      data-testid={`badge-status-${status}`}
    >
      {s.label}
    </Badge>
  );
}

// ── Shipment timeline ───────────────────────────────────────────────
// Vertical steps matching the Orders drawer's shape, but the final step
// branches: the "outcome" node is Delivered (green ✓) OR NDR (amber !)
// OR RTO (red ↩), whichever actually happened. Cancelled short-circuits
// the whole timeline with its own state.

type StepState = "done" | "current" | "todo" | "failed";
interface Step {
  key: string;
  label: string;
  sub?: string;
  icon: React.ComponentType<{ className?: string }>;
  state: StepState;
}

function buildSteps(row: ReshipmentDetail): Step[] {
  const s = row.courierStatus;
  const shipped = s === "in_transit" || s === "delivered" || s === "ndr" || s === "rto";
  const delivered = s === "delivered";
  const ndr = s === "ndr";
  const rto = s === "rto";
  const cancelled = s === "cancelled";

  const created: Step = {
    key: "created",
    label: "Reshipment created",
    sub: format(new Date(row.createdAt), "dd MMM yyyy, h:mm a"),
    icon: FileText,
    state: "done",
  };

  if (cancelled) {
    return [
      created,
      {
        key: "cancelled",
        label: "Cancelled",
        sub: row.cancelledAt
          ? format(new Date(row.cancelledAt), "dd MMM yyyy, h:mm a")
          : "Duplicate order cancelled in Shopify",
        icon: XCircle,
        state: "failed",
      },
    ];
  }

  const shipmentStep: Step = {
    key: "shipment",
    label: shipped ? "In transit" : "Awaiting dispatch",
    sub: row.trackingAwb
      ? `AWB ${row.trackingAwb}${row.courierName ? ` · ${row.courierName}` : ""}`
      : shipped
        ? "With the courier"
        : "The courier picks the parcel up next",
    icon: Truck,
    state: shipped ? "done" : "current",
  };

  // Final step is one of three possible outcomes.
  let outcome: Step;
  if (delivered) {
    outcome = {
      key: "delivered",
      label: "Delivered",
      sub: "Parcel handed over to the customer",
      icon: CheckCircle2,
      state: "done",
    };
  } else if (ndr) {
    outcome = {
      key: "ndr",
      label: "Delivery attempt failed (NDR)",
      sub: "Courier couldn't hand over — follow up with the customer",
      icon: AlertTriangle,
      state: "failed",
    };
  } else if (rto) {
    outcome = {
      key: "rto",
      label: "Returned to origin (RTO)",
      sub: "Parcel came back — reshipment did not reach the customer",
      icon: RotateCcw,
      state: "failed",
    };
  } else {
    outcome = {
      key: "outcome",
      label: "Delivery",
      sub: "Delivered / NDR / RTO will show here once the courier reports",
      icon: CheckCircle2,
      state: shipped ? "current" : "todo",
    };
  }

  return [created, shipmentStep, outcome];
}

function StepDot({ state, icon: Icon }: { state: StepState; icon: Step["icon"] }) {
  const cls =
    state === "done"
      ? "bg-emerald-500 text-white border-emerald-500"
      : state === "current"
        ? "bg-blue-500 text-white border-blue-500"
        : state === "failed"
          ? "bg-red-500 text-white border-red-500"
          : "bg-background text-muted-foreground border-muted";
  return (
    <div
      className={cn(
        "flex h-6 w-6 items-center justify-center rounded-full border-2 z-10",
        cls,
      )}
    >
      <Icon className="h-3 w-3" />
    </div>
  );
}

function ShipmentTimeline({ steps }: { steps: Step[] }) {
  return (
    <div className="relative">
      {steps.map((step, i) => {
        const isLast = i === steps.length - 1;
        const connectorDone = step.state === "done";
        return (
          <div key={step.key} className="relative flex items-start gap-3 pb-4 last:pb-0">
            {!isLast && (
              <div
                className={cn(
                  "absolute left-3 top-6 h-full w-0.5 -translate-x-1/2",
                  connectorDone ? "bg-emerald-500" : "bg-muted",
                )}
              />
            )}
            <StepDot state={step.state} icon={step.icon} />
            <div className="min-w-0 flex-1 pt-0.5">
              <p
                className={cn(
                  "text-sm font-medium",
                  step.state === "failed" && "text-red-700 dark:text-red-400",
                  step.state === "todo" && "text-muted-foreground",
                )}
              >
                {step.label}
              </p>
              {step.sub && (
                <p className="mt-0.5 break-words text-xs text-muted-foreground">
                  {step.sub}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Small layout helpers ────────────────────────────────────────────
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[110px_1fr] gap-3 py-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <div className="min-w-0 break-words">{children}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
        {title}
      </p>
      <div className="divide-y">{children}</div>
    </div>
  );
}

export function ReshipmentDetailDrawer({
  row,
  open,
  onOpenChange,
  storeUrl,
  onEdit,
  onChanged,
}: {
  row: ReshipmentDetail | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  storeUrl?: string | null;
  onEdit?: (row: ReshipmentDetail) => void;
  onChanged?: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [copied, setCopied] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [activeTab, setActiveTab] = useState<string>("overview");
  const userId = typeof window !== "undefined" ? localStorage.getItem("userId") : null;

  const steps = useMemo(() => (row ? buildSteps(row) : []), [row]);

  const cancel = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(
        "POST",
        `/api/reshipments/${row!.id}/cancel?userId=${userId ?? ""}`,
      );
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Reshipment cancelled",
        description: "The duplicate order in Shopify was cancelled too.",
      });
      qc.invalidateQueries({ queryKey: ["/api/reshipments"] });
      setConfirmCancel(false);
      onChanged?.();
      onOpenChange(false);
    },
    onError: (err: any) => {
      const raw = String(err?.message ?? "");
      let description = raw || "Try again";
      const m = raw.match(/^\d+:\s*([\s\S]*)$/);
      if (m) {
        try {
          description = JSON.parse(m[1]).error ?? m[1];
        } catch {
          description = m[1];
        }
      }
      toast({ title: "Couldn't cancel", description, variant: "destructive" });
    },
  });

  if (!row) return null;
  const isMutable = row.courierStatus === "pending";
  const addr = row.shippingAddress ?? {};
  const orderUrl = (id: string) =>
    `https://${storeUrl ?? "admin.shopify.com"}/admin/orders/${id}`;

  const copyAwb = () => {
    if (!row.trackingAwb) return;
    navigator.clipboard.writeText(row.trackingAwb).then(() => {
      setCopied(true);
      toast({ title: "AWB copied", description: row.trackingAwb! });
      window.setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {/* Responsive width strategy:
          - mobile (< sm): full viewport, no margins, flat edges — the
            panel becomes an app-shell sheet.
          - sm+: floating rounded card whose width is min(560px,
            viewport - 2rem) so a narrow browser window still leaves
            breathing room and the panel never overflows.
          Uses !important prefixes because shadcn's SheetContent primitive
          hard-codes `w-3/4 sm:max-w-sm` in its base classes. */}
      <SheetContent
        hideCloseButton
        className="flex !h-full !w-full !max-w-none flex-col rounded-none p-0 shadow-2xl sm:!inset-y-auto sm:!top-4 sm:!bottom-4 sm:my-4 sm:mr-4 sm:!h-auto sm:max-h-[calc(100vh-2rem)] sm:!w-[min(560px,calc(100vw-2rem))] sm:rounded-l-xl"
      >
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="flex h-full flex-col"
        >
          {/* Sticky header */}
          <div className="flex-shrink-0 rounded-tl-xl border-b bg-card">
            <div className="flex items-start justify-between gap-2 px-5 pt-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-lg font-semibold">
                    {row.newShopifyOrderName ?? "Reshipment"}
                  </span>
                  <StatusChip status={row.courierStatus} />
                  <PaymentChip type={row.paymentType} />
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Reshipment of {row.originalShopifyOrderName} ·{" "}
                  {format(new Date(row.createdAt), "dd MMM yyyy, h:mm a")}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onOpenChange(false)}
                data-testid="btn-close-reshipment-drawer"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <TabsList className="mt-3 h-auto w-full justify-start gap-0 rounded-none border-0 border-t bg-transparent px-5 p-0">
              <TabsTrigger
                value="overview"
                className="rounded-none border-b-2 border-transparent bg-transparent px-3 py-2.5 text-sm font-medium text-muted-foreground shadow-none data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
              >
                Overview
              </TabsTrigger>
              <TabsTrigger
                value="shipment"
                className="rounded-none border-b-2 border-transparent bg-transparent px-3 py-2.5 text-sm font-medium text-muted-foreground shadow-none data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
              >
                Shipment
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Overview: everything EXCEPT shipment tracking */}
          <TabsContent
            value="overview"
            className="mt-0 flex-1 space-y-6 overflow-y-auto px-5 py-5"
          >
            <Section title="Orders">
              <Row label="Original">
                <a
                  href={orderUrl(row.originalShopifyOrderId)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 font-medium text-brand hover:underline"
                >
                  {row.originalShopifyOrderName}
                  <ExternalLink className="h-3 w-3" />
                </a>
              </Row>
              <Row label="Reshipment">
                {row.newShopifyOrderId ? (
                  <a
                    href={orderUrl(row.newShopifyOrderId)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 font-medium text-brand hover:underline"
                  >
                    {row.newShopifyOrderName ?? `#${row.newShopifyOrderId}`}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                ) : (
                  "—"
                )}
              </Row>
            </Section>

            <Section title="Customer">
              <Row label="Name">{row.customerName}</Row>
              <Row label="Phone">
                <span className="font-mono text-xs">{row.customerPhone}</span>
              </Row>
              <Row label="Address">
                <span className="text-sm">
                  {[addr.address1, addr.address2].filter(Boolean).join(", ") || "—"}
                  <br />
                  <span className="text-muted-foreground">
                    {[addr.city, addr.province, addr.zip].filter(Boolean).join(" · ")}
                  </span>
                </span>
              </Row>
            </Section>

            <Section title="Request">
              <Row label="Reason">{REASON_LABEL[row.reason] ?? row.reason}</Row>
              <Row label="Urgency">
                {row.urgencyType === "scheduled"
                  ? `Scheduled${row.scheduledDate ? ` for ${format(new Date(row.scheduledDate), "dd MMM yyyy")}` : ""}`
                  : "Ship now"}
              </Row>
              <Row label="Created by">{row.createdByName ?? "—"}</Row>
              {row.internalNotes && <Row label="Notes">{row.internalNotes}</Row>}
              {row.cancelledAt && (
                <Row label="Cancelled">
                  {format(new Date(row.cancelledAt), "dd MMM yyyy, h:mm a")}
                </Row>
              )}
            </Section>
          </TabsContent>

          {/* Shipment: tracking timeline like the Orders drawer */}
          <TabsContent
            value="shipment"
            className="mt-0 flex-1 space-y-5 overflow-y-auto px-5 py-5"
          >
            {row.trackingAwb ? (
              <div className="rounded-lg border p-3">
                <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                  Tracking number
                </p>
                <button
                  onClick={copyAwb}
                  className="inline-flex items-center gap-2 font-mono font-medium hover:underline"
                  title="Copy AWB"
                >
                  <span>{row.trackingAwb}</span>
                  {copied ? (
                    <Check className="h-4 w-4 text-emerald-600" />
                  ) : (
                    <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                </button>
                {row.courierName && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    via {row.courierName}
                  </p>
                )}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed p-4 text-center">
                <Package className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
                <p className="text-sm font-medium">No AWB yet</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Tracking appears here once the courier assigns a waybill.
                </p>
              </div>
            )}

            <div className="rounded-lg border p-3">
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                Delivering to
              </p>
              <p className="text-sm font-medium">{row.customerName}</p>
              <p className="text-xs text-muted-foreground">{row.customerPhone}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {[addr.address1, addr.address2, addr.city, addr.province, addr.zip]
                  .filter(Boolean)
                  .join(", ")}
              </p>
            </div>

            <div>
              <p className="mb-3 text-xs font-medium text-muted-foreground">
                Delivery status
              </p>
              <ShipmentTimeline steps={steps} />
            </div>

            <p className="text-[11px] text-muted-foreground">
              Updates flow in automatically from Delhivery webhooks — no manual
              refresh needed.
            </p>
          </TabsContent>
        </Tabs>

        {/* Pinned action bar. Edit/Cancel are live only while pending. */}
        <div className="flex-shrink-0 border-t bg-card px-5 py-3">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={!isMutable}
              onClick={() => onEdit?.(row)}
              data-testid="btn-edit-reshipment"
            >
              <Pencil className="mr-1.5 h-3.5 w-3.5" />
              Edit
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!isMutable || cancel.isPending}
              onClick={() => setConfirmCancel(true)}
              className="text-red-600 hover:text-red-700 dark:text-red-400"
              data-testid="btn-cancel-reshipment"
            >
              <Ban className="mr-1.5 h-3.5 w-3.5" />
              Cancel reshipment
            </Button>
          </div>
        </div>
      </SheetContent>

      <AlertDialog open={confirmCancel} onOpenChange={setConfirmCancel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Reshipment?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to cancel this reshipment? The corresponding duplicate order
              created in Shopify will also be cancelled.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancel.isPending}>Keep Reshipment</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                cancel.mutate();
              }}
              disabled={cancel.isPending}
              className="bg-red-600 hover:bg-red-700"
            >
              {cancel.isPending ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  Cancelling…
                </>
              ) : (
                "Cancel Reshipment"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sheet>
  );
}
