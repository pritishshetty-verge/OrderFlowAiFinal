import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { PageLayout } from "@/components/page-layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Phone, ShoppingCart, Package, Copy, ExternalLink, Mail, X } from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { AbandonedCheckout } from "@shared/schema";

interface AbandonedCheckoutRow extends AbandonedCheckout {
  assignedAgentName: string | null;
}

interface CartItem {
  name?: string;
  price?: number | string;
  quantity?: number | string;
  img_url?: string;
  image?: string;
}

const WHATSAPP_ICON_LIGHT =
  "https://cdn.shopify.com/s/files/1/0763/9089/1698/files/icons8-whatsapp-48.png?v=1781842548";
const WHATSAPP_ICON_DARK =
  "https://cdn.shopify.com/s/files/1/0763/9089/1698/files/whatsapp-16.png?v=1781842662";

const RECOVERY_STATUSES = ["PENDING", "CONTACTED", "RECOVERED", "LOST"] as const;

// Same color families + pill shape as the order-status Badges (status-badge.tsx).
const BADGE_FAMILY = {
  slate: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-600",
  blue: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 border border-blue-200 dark:border-blue-700",
  amber: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 border border-amber-200 dark:border-amber-700",
  yellow: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300 border border-yellow-200 dark:border-yellow-700",
  green: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-700",
  red: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 border border-red-200 dark:border-red-700",
} as const;

function Pill({ label, family }: { label: string; family: keyof typeof BADGE_FAMILY }) {
  return (
    <Badge variant="outline" className={cn("rounded-full px-3 py-1 text-xs font-medium", BADGE_FAMILY[family])}>
      {label}
    </Badge>
  );
}

function humanize(value: string | null): string {
  if (!value) return "Cart Created";
  return value
    .replace(/[_\s]+/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function StageBadge({ stage }: { stage: string | null }) {
  const n = (stage || "").toLowerCase();
  const family: keyof typeof BADGE_FAMILY = n.includes("payment")
    ? "amber"
    : n.includes("detail") || n.includes("address")
      ? "blue"
      : "slate";
  return <Pill label={humanize(stage)} family={family} />;
}

function RecoveryBadge({ status }: { status: string | null | undefined }) {
  switch (status) {
    case "RECOVERED":
      return <Pill label="Recovered" family="green" />;
    case "CONTACTED":
      return <Pill label="Contacted" family="blue" />;
    case "LOST":
      return <Pill label="Lost" family="red" />;
    default:
      return <Pill label="Pending" family="yellow" />;
  }
}

function formatINR(value: string | number | null | undefined) {
  const num = typeof value === "number" ? value : parseFloat(value ?? "0");
  if (isNaN(num)) return "₹0";
  return `₹${num.toLocaleString("en-IN")}`;
}

function asItems(items: unknown): CartItem[] {
  return Array.isArray(items) ? (items as CartItem[]) : [];
}

function whatsappLink(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (!digits) return null;
  return `https://wa.me/${digits.length === 10 ? `91${digits}` : digits}`;
}

function RowActions({ phone, id }: { phone: string | null; id: number }) {
  const wa = whatsappLink(phone);
  return (
    <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
      <Button variant="ghost" size="icon" disabled={!phone} asChild={!!phone} title={phone ? `Call ${phone}` : "No phone"} data-testid={`button-call-${id}`}>
        {phone ? <a href={`tel:${phone}`}><Phone className="h-4 w-4" /></a> : <Phone className="h-4 w-4" />}
      </Button>
      <Button variant="ghost" size="icon" disabled={!wa} asChild={!!wa} title={wa ? "WhatsApp" : "No phone"} data-testid={`button-whatsapp-${id}`}>
        {wa ? (
          <a href={wa} target="_blank" rel="noopener noreferrer">
            <img src={WHATSAPP_ICON_LIGHT} alt="WhatsApp" className="h-4 w-4 block dark:hidden" />
            <img src={WHATSAPP_ICON_DARK} alt="WhatsApp" className="h-4 w-4 hidden dark:block" />
          </a>
        ) : (
          <img src={WHATSAPP_ICON_LIGHT} alt="WhatsApp" className="h-4 w-4 opacity-50" />
        )}
      </Button>
    </div>
  );
}

export default function AbandonedCartsPage() {
  const { toast } = useToast();
  const [selected, setSelected] = useState<AbandonedCheckoutRow | null>(null);

  const { data: checkouts, isLoading } = useQuery<AbandonedCheckoutRow[]>({
    queryKey: ["/api/abandoned-checkouts"],
  });

  // Fastrr visibility pattern: only carts where the shopper provided a real
  // NAME and a SHIPPING ADDRESS. Phone-only "Guest" drop-offs are hidden.
  const visible = useMemo(() => {
    return (checkouts ?? []).filter((c) => {
      const name = (c.customerName ?? "").trim();
      const hasName = name.length > 0 && name.toLowerCase() !== "guest";
      const hasAddress = (c.address ?? "").trim().length > 0;
      return hasName && hasAddress;
    });
  }, [checkouts]);

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      await apiRequest("PATCH", `/api/abandoned-checkouts/${id}/status`, { status });
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/abandoned-checkouts"] });
      setSelected((prev) => (prev ? { ...prev, recoveryStatus: vars.status } : prev));
      toast({ title: "Recovery status updated" });
    },
    onError: () => {
      toast({ title: "Could not update status", description: "Please try again.", variant: "destructive" });
    },
  });

  const copyLink = (url: string) => {
    navigator.clipboard?.writeText(url);
    toast({ title: "Checkout link copied" });
  };

  const selectedItems = asItems(selected?.items);

  return (
    <PageLayout title="Abandoned Checkouts" description="Track and recover abandoned carts from Fastrr">
      <div className="p-4 space-y-4 overflow-auto flex-1">
        {isLoading ? (
          <div className="rounded-lg border bg-card p-6 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <div className="rounded-lg border bg-card">
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <ShoppingCart className="h-12 w-12 mb-3 opacity-40" />
              <p className="text-sm font-medium">No abandoned checkouts yet</p>
              <p className="text-xs mt-1">Carts with a name &amp; address will appear here when received from Fastrr</p>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border bg-card">
            <div className="relative">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-muted/40 backdrop-blur-sm">
                  <TableRow className="[&_th]:h-9 [&_th]:px-3 [&_th]:text-[11px] [&_th]:font-medium [&_th]:uppercase [&_th]:tracking-wider [&_th]:text-muted-foreground">
                    <TableHead>Date</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Items</TableHead>
                    <TableHead className="text-right">Cart Value</TableHead>
                    <TableHead>Stage</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="[&_td]:py-2.5 [&_td]:px-3 [&_td]:text-[13px]">
                  {visible.map((checkout) => {
                    const count = asItems(checkout.items).length;
                    return (
                      <TableRow
                        key={checkout.id}
                        className="group hover-elevate cursor-pointer"
                        onClick={() => setSelected(checkout)}
                        data-testid={`row-checkout-${checkout.id}`}
                      >
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {formatDistanceToNow(new Date(checkout.createdAt), { addSuffix: true })}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col leading-tight">
                            <span className="font-medium text-foreground">{checkout.customerName}</span>
                            <span className="text-[11px] text-muted-foreground tabular-nums mt-0.5">
                              {checkout.customerPhone}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="whitespace-nowrap" data-testid={`text-items-${checkout.id}`}>
                          {count} {count === 1 ? "item" : "items"}
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums">
                          {formatINR(checkout.cartValue)}
                        </TableCell>
                        <TableCell>
                          <StageBadge stage={checkout.checkoutStage} />
                        </TableCell>
                        <TableCell>
                          <RecoveryBadge status={checkout.recoveryStatus} />
                        </TableCell>
                        <TableCell className="text-right">
                          <RowActions phone={checkout.customerPhone} id={checkout.id} />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </div>

      {/* Details drawer — cloned from the Orders quick-preview Sheet. */}
      <Sheet open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent
          hideCloseButton
          className="w-[500px] sm:w-[600px] p-0 my-4 mr-4 rounded-l-xl shadow-2xl !h-auto max-h-[calc(100vh-2rem)] inset-y-auto top-4 bottom-4 flex flex-col"
        >
          {selected && (
            <div className="flex flex-col h-full">
              {/* Sticky header: Customer Name + Cart Value */}
              <div className="flex-shrink-0 border-b bg-card rounded-tl-xl">
                <div className="flex items-center justify-between gap-2 px-4 py-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-lg font-semibold truncate" data-testid="text-drawer-customer">{selected.customerName}</span>
                    <StageBadge stage={selected.checkoutStage} />
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-base font-semibold tabular-nums">{formatINR(selected.cartValue)}</span>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setSelected(null)} data-testid="button-close-drawer">
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>

              {/* Scrollable body */}
              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
                {/* Customer / contact / address */}
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">Customer</p>
                  <div className="space-y-1.5">
                    <p className="text-sm font-medium">{selected.customerName}</p>
                    {selected.customerEmail && (
                      <a href={`mailto:${selected.customerEmail}`} className="flex items-center gap-1.5 text-xs text-blue-600 hover:underline" data-testid="link-customer-email">
                        <Mail className="h-3.5 w-3.5" />
                        {selected.customerEmail}
                      </a>
                    )}
                    {selected.customerPhone && (
                      <a href={`tel:${selected.customerPhone}`} className="flex items-center gap-1.5 text-xs text-blue-600 hover:underline" data-testid="link-customer-phone">
                        <Phone className="h-3.5 w-3.5" />
                        {selected.customerPhone}
                      </a>
                    )}
                    {selected.address && (
                      <div className="flex items-start gap-1.5 text-xs text-muted-foreground pt-0.5" data-testid="text-shipping-address">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        <span className="flex-1">{selected.address}</span>
                      </div>
                    )}
                  </div>
                </div>

                <Separator />

                {/* Items — same Item Card layout as Orders preview */}
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">Items</p>
                  {selectedItems.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No item details in this cart.</p>
                  ) : (
                    <div className="space-y-2">
                      {selectedItems.map((item, index) => {
                        const img = item.img_url || item.image;
                        return (
                          <div key={index} className="flex items-center gap-2" data-testid={`drawer-item-${index}`}>
                            {img ? (
                              <img src={img} alt={item.name || "Item"} className="w-12 h-12 object-cover rounded-md flex-shrink-0 bg-muted" />
                            ) : (
                              <div className="w-12 h-12 rounded-md flex items-center justify-center flex-shrink-0 bg-muted">
                                <Package className="w-5 h-5 text-muted-foreground" />
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium truncate">{item.name || "Unnamed item"}</p>
                            </div>
                            <div className="text-right flex-shrink-0">
                              <p className="text-xs font-medium">{formatINR(item.price as any)}</p>
                              <p className="text-xs text-muted-foreground">Qty: {Number(item.quantity) || 1}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <Separator />

                {/* Recovery actions — checkout link + status */}
                {selected.checkoutUrl && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-2">Checkout link</p>
                    <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-2.5 py-1.5">
                      <a
                        href={selected.checkoutUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 text-xs text-blue-600 hover:underline truncate flex-1"
                        data-testid="link-checkout-url"
                      >
                        <ExternalLink className="h-3.5 w-3.5 flex-shrink-0" />
                        <span className="truncate">{selected.checkoutUrl}</span>
                      </a>
                      <Button variant="ghost" size="icon" className="h-7 w-7 flex-shrink-0" onClick={() => copyLink(selected.checkoutUrl!)} data-testid="button-copy-link">
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                )}

                <Separator />

                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">Recovery status</p>
                  <Select
                    value={selected.recoveryStatus ?? "PENDING"}
                    onValueChange={(status) => statusMutation.mutate({ id: selected.id, status })}
                    disabled={statusMutation.isPending}
                  >
                    <SelectTrigger data-testid="select-recovery-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {RECOVERY_STATUSES.map((s) => (
                        <SelectItem key={s} value={s} data-testid={`status-option-${s}`}>
                          {humanize(s)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="flex items-center gap-1 pt-2">
                    <RowActions phone={selected.customerPhone} id={selected.id} />
                    <span className="text-xs text-muted-foreground">Call or message the customer</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </PageLayout>
  );
}
