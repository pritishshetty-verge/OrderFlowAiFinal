import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { X, ExternalLink, Copy, Check } from "lucide-react";
import { format } from "date-fns";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

// ─────────────────────────────────────────────────────────────────────
// Reshipment detail slide-over — mirrors the Orders quick-preview
// pattern (floating rounded panel, sticky header, scrollable body).
// Read-only: everything here is either operator input at creation time
// or courier state that arrives via webhook.
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
    | "out_for_delivery"
    | "ndr"
    | "delivered"
    | "rto";
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
}

const REASON_LABEL: Record<string, string> = {
  courier_error: "Courier error",
  customer_unavailable: "Customer unavailable",
  fake_delivery_attempt: "Fake delivery attempt",
  address_issue: "Address issue",
  product_damaged: "Product damaged",
  other: "Other",
};

const STATUS_META: Record<
  ReshipmentDetail["courierStatus"],
  { label: string; cls: string }
> = {
  pending: { label: "Pending", cls: "bg-muted text-foreground/70" },
  in_transit: {
    label: "In Transit",
    cls: "bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-400",
  },
  out_for_delivery: {
    label: "Out for Delivery",
    cls: "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-400",
  },
  ndr: { label: "NDR", cls: "bg-red-50 text-red-700 dark:bg-red-950/60 dark:text-red-400" },
  delivered: {
    label: "Delivered",
    cls: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400",
  },
  rto: { label: "RTO", cls: "bg-red-50 text-red-700 dark:bg-red-950/60 dark:text-red-400" },
};

// Happy-path progression for the tracker. NDR/RTO are exception states
// and render as a separate banner rather than a step.
const JOURNEY = ["pending", "in_transit", "out_for_delivery", "delivered"] as const;

function StatusTracker({ status }: { status: ReshipmentDetail["courierStatus"] }) {
  const isException = status === "ndr" || status === "rto";
  const activeIdx = isException ? -1 : JOURNEY.indexOf(status as any);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5">
        {JOURNEY.map((step, i) => {
          const done = !isException && i <= activeIdx;
          return (
            <div key={step} className="flex flex-1 items-center gap-1.5">
              <div
                className={`h-1.5 flex-1 rounded-full ${
                  done ? "bg-foreground" : "bg-muted"
                }`}
              />
            </div>
          );
        })}
      </div>
      <div className="flex justify-between text-[10px] uppercase tracking-wider text-muted-foreground">
        <span>Created</span>
        <span>In transit</span>
        <span>Out for delivery</span>
        <span>Delivered</span>
      </div>
      {isException && (
        <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-800 dark:bg-red-950/50 dark:text-red-400">
          {status === "ndr"
            ? "Delivery attempt failed (NDR). The courier could not hand over the parcel — follow up with the customer."
            : "Parcel returned to origin (RTO). This reshipment did not reach the customer."}
        </div>
      )}
    </div>
  );
}

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
}: {
  row: ReshipmentDetail | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  storeUrl?: string | null;
}) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  if (!row) return null;

  const meta = STATUS_META[row.courierStatus];
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
      <SheetContent
        hideCloseButton
        className="inset-y-auto bottom-4 top-4 my-4 mr-4 flex !h-auto max-h-[calc(100vh-2rem)] w-[460px] flex-col rounded-l-xl p-0 shadow-2xl sm:w-[540px]"
      >
        {/* Sticky header */}
        <div className="flex-shrink-0 rounded-tl-xl border-b bg-card">
          <div className="flex items-start justify-between gap-2 px-5 py-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-lg font-semibold">
                  {row.newShopifyOrderName ?? "Reshipment"}
                </span>
                <span
                  className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${meta.cls}`}
                >
                  {meta.label}
                </span>
                <span
                  className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                    row.paymentType === "cod"
                      ? "border-amber-500/40 text-amber-700 dark:text-amber-400"
                      : "border-emerald-500/40 text-emerald-700 dark:text-emerald-400"
                  }`}
                >
                  {row.paymentType}
                </span>
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
        </div>

        {/* Scrollable body */}
        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
          <StatusTracker status={row.courierStatus} />

          <Section title="Shipment">
            <Row label="AWB">
              {row.trackingAwb ? (
                <button
                  onClick={copyAwb}
                  className="inline-flex items-center gap-1.5 font-mono text-xs hover:text-foreground"
                  title="Copy AWB"
                >
                  {row.trackingAwb}
                  {copied ? (
                    <Check className="h-3 w-3 text-emerald-600" />
                  ) : (
                    <Copy className="h-3 w-3 text-muted-foreground" />
                  )}
                </button>
              ) : (
                <span className="text-muted-foreground">
                  Not assigned yet — appears once the order is fulfilled
                </span>
              )}
            </Row>
            <Row label="Courier">{row.courierName ?? "—"}</Row>
            <Row label="Last update">
              {format(new Date(row.updatedAt), "dd MMM yyyy, h:mm a")}
            </Row>
          </Section>

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
          </Section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
