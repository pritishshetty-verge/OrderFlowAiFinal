import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StatusBadge } from "@/components/status-badge";
import { PaymentBadge } from "@/components/payment-badge";
import { CallLog } from "@/components/call-log";
import { format } from "date-fns";
import { Phone, User, Package, IndianRupee, UserCheck, History } from "lucide-react";
import type { Order } from "./orders-table";

interface OrderDetailsDialogProps {
  order: Order | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function initialsOf(name?: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Compact row inside an info card: icon + label + value, right-aligned. */
function Row({ icon: Icon, label, children }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
      <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </span>
      <span className="text-sm font-medium text-foreground text-right min-w-0 truncate">
        {children}
      </span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-muted/30 p-4">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium mb-2">
        {title}
      </p>
      <div className="divide-y divide-border/60">{children}</div>
    </div>
  );
}

export function OrderDetailsDialog({
  order,
  open,
  onOpenChange,
}: OrderDetailsDialogProps) {
  if (!order) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl" data-testid="dialog-order-details">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3 flex-wrap">
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand/10 text-sm font-semibold text-brand">
              {initialsOf(order.customerName)}
            </span>
            <div className="min-w-0">
              <div className="text-base font-semibold leading-tight">{order.customerName}</div>
              <div className="text-xs text-muted-foreground font-mono mt-0.5">
                #{order.shopifyOrderId} · {format(order.createdAt, "dd MMM yyyy, h:mm a")}
              </div>
            </div>
            <div className="ml-auto">
              <StatusBadge status={order.status} />
            </div>
          </DialogTitle>
        </DialogHeader>

        {/* Total — hero number with a soft tinted backdrop */}
        <div className="rounded-2xl p-5 shadow-sm"
          style={{ backgroundImage: "var(--brand-gradient)", color: "hsl(var(--brand-gradient-fg))" }}
        >
          <p className="text-xs opacity-80 uppercase tracking-wider font-medium">Order total</p>
          <p className="mt-1 text-3xl font-semibold tabular-nums tracking-tight">
            ₹{order.total.toLocaleString("en-IN")}
          </p>
          <div className="mt-3 flex items-center gap-2">
            <PaymentBadge method={order.paymentMethod} />
          </div>
        </div>

        {/* Two-column grid: customer + order info */}
        <div className="grid gap-3 md:grid-cols-2">
          <Section title="Customer">
            <Row icon={User} label="Name">{order.customerName}</Row>
            <Row icon={Phone} label="Phone">
              <span className="font-mono tabular-nums">{order.customerPhone}</span>
            </Row>
          </Section>

          <Section title="Order">
            <Row icon={Package} label="Items">{order.items}</Row>
            <Row icon={IndianRupee} label="Total">
              <span className="tabular-nums">₹{order.total.toLocaleString("en-IN")}</span>
            </Row>
            {order.assignedTo && (
              <Row icon={UserCheck} label="Assigned">
                <span className="inline-flex items-center rounded-full bg-violet-500/10 px-2 py-0.5 text-xs font-medium text-violet-600 dark:text-violet-400">
                  {order.assignedTo}
                </span>
              </Row>
            )}
          </Section>
        </div>

        {/* Call history */}
        <div className="rounded-xl border bg-muted/30 p-4">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium mb-3 inline-flex items-center gap-1.5">
            <History className="h-3.5 w-3.5" />
            Call history
          </p>
          <CallLog orderId={order.id} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
