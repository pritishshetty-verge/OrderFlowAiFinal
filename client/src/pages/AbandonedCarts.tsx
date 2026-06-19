import { useEffect, useMemo, useState } from "react";
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
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Phone, ShoppingCart, Package, Copy, ExternalLink, Mail, X, Link as LinkIcon,
  Clock, CheckCircle2, XCircle, MessageCircle, ChevronDown, ChevronLeft, ChevronRight,
} from "lucide-react";
import { format } from "date-fns";
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

// Action icons (provided assets). Phone-call images map to the CALL action;
// WhatsApp glyph for the WhatsApp action; copy uses a link/chain icon.
const PHONE_ICON_LIGHT = "https://cdn.shopify.com/s/files/1/0763/9089/1698/files/phone-call.png?v=1781846985";
const PHONE_ICON_DARK = "https://cdn.shopify.com/s/files/1/0763/9089/1698/files/phone-call-white-icon.webp?v=1781846981";
const WHATSAPP_ICON_LIGHT = "https://cdn.shopify.com/s/files/1/0763/9089/1698/files/whatsapp-glyph-black-logo.svg?v=1781846840";
const WHATSAPP_ICON_DARK = "https://cdn.shopify.com/s/files/1/0763/9089/1698/files/whatsapp-16.png?v=1781842662";

const RECOVERY_STATUSES = ["PENDING", "CONTACTED", "RECOVERED", "LOST"] as const;

function humanize(value: string | null): string {
  if (!value) return "Cart Created";
  return value.replace(/[_\s]+/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

function asItems(items: unknown): CartItem[] {
  return Array.isArray(items) ? (items as CartItem[]) : [];
}

function formatINR(value: string | number | null | undefined, decimals = 2) {
  const num = typeof value === "number" ? value : parseFloat(value ?? "0");
  if (isNaN(num)) return "₹0";
  return `₹${num.toLocaleString("en-IN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}

function whatsappLink(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (!digits) return null;
  return `https://wa.me/${digits.length === 10 ? `91${digits}` : digits}`;
}

// Checkout Stage — exact PaymentBadge pill (rounded-full, transparent, colored
// border/text) used on the Orders page Payment column.
function StageBadge({ stage }: { stage: string | null }) {
  const n = (stage || "").toLowerCase();
  const style = n.includes("payment")
    ? "text-yellow-600 dark:text-yellow-400 border-yellow-600 dark:border-yellow-400"
    : n.includes("detail") || n.includes("address")
      ? "text-blue-600 dark:text-blue-400 border-blue-600 dark:border-blue-400"
      : "text-gray-500 dark:text-gray-400 border-gray-500 dark:border-gray-400";
  return (
    <Badge
      variant="outline"
      className={cn("rounded-full px-3 py-1 text-xs font-medium border gap-1.5 bg-transparent", style)}
    >
      {humanize(stage)}
    </Badge>
  );
}

const RECOVERY_META: Record<string, { color: string; icon: JSX.Element; label: string }> = {
  PENDING: { color: "text-purple-600 dark:text-purple-400", icon: <Clock className="h-4 w-4 mr-1" />, label: "Pending" },
  CONTACTED: { color: "text-blue-600 dark:text-blue-400", icon: <Phone className="h-4 w-4 mr-1" />, label: "Contacted" },
  RECOVERED: { color: "text-green-600 dark:text-green-400", icon: <CheckCircle2 className="h-4 w-4 mr-1" />, label: "Recovered" },
  LOST: { color: "text-red-600 dark:text-red-400", icon: <XCircle className="h-4 w-4 mr-1" />, label: "Lost" },
};

// Recovery Status — exact CallStatusActions dropdown pill from the Orders page.
function RecoveryStatusDropdown({
  status,
  onChange,
  disabled,
}: {
  status: string;
  onChange: (status: string) => void;
  disabled?: boolean;
}) {
  const meta = RECOVERY_META[status] ?? RECOVERY_META.PENDING;
  return (
    <div onClick={(e) => e.stopPropagation()}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" disabled={disabled} className={cn("gap-1", meta.color)} data-testid="dropdown-recovery-status">
            {meta.icon}
            {meta.label}
            <ChevronDown className="h-3 w-3 ml-1" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          {RECOVERY_STATUSES.map((s) => (
            <DropdownMenuItem
              key={s}
              onClick={() => onChange(s)}
              className={cn("gap-2", RECOVERY_META[s].color, "focus:" + RECOVERY_META[s].color)}
              data-testid={`menuitem-${s}`}
            >
              {RECOVERY_META[s].icon}
              {RECOVERY_META[s].label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

// Cart Details — exact OrderItemsSummary smart-summary + hover card.
function CartDetails({ items }: { items: CartItem[] }) {
  if (items.length === 0) return <span className="text-sm text-muted-foreground">—</span>;
  const first = items[0].name || "Item";
  const remaining = items.length - 1;
  const summary = remaining > 0 ? `${first} + ${remaining} more ${remaining === 1 ? "item" : "items"}` : first;
  return (
    <HoverCard openDelay={200}>
      <HoverCardTrigger asChild>
        <button className="text-sm text-left hover:underline cursor-help focus:outline-none">{summary}</button>
      </HoverCardTrigger>
      <HoverCardContent className="w-80 border shadow-lg z-50">
        <div className="space-y-3">
          <div className="flex items-center gap-2 border-b pb-2">
            <Package className="h-4 w-4 text-muted-foreground" />
            <h4 className="font-semibold text-sm">Cart Items ({items.length})</h4>
          </div>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {items.map((item, index) => (
              <div key={index} className="flex justify-between gap-2 text-sm pb-2 border-b last:border-0">
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{item.name || "Unnamed item"}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="font-medium">×{Number(item.quantity) || 1}</p>
                  <p className="text-xs text-muted-foreground">{formatINR(item.price as any, 0)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

// Three inline, aligned action icons: Copy link · Call · WhatsApp.
function ActionIcons({
  phone,
  checkoutUrl,
  onCopy,
}: {
  phone: string | null;
  checkoutUrl: string | null;
  onCopy: (url: string) => void;
}) {
  const wa = whatsappLink(phone);
  const iconBtn = "inline-flex items-center justify-center h-8 w-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-40 disabled:pointer-events-none";
  return (
    <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        className={iconBtn}
        disabled={!checkoutUrl}
        onClick={() => checkoutUrl && onCopy(checkoutUrl)}
        title="Copy checkout link"
        data-testid="action-copy"
      >
        <LinkIcon className="h-4 w-4" />
      </button>
      <a
        href={phone ? `tel:${phone}` : undefined}
        className={cn(iconBtn, !phone && "opacity-40 pointer-events-none")}
        title={phone ? `Call ${phone}` : "No phone"}
        data-testid="action-call"
      >
        <img src={PHONE_ICON_LIGHT} alt="Call" className="h-[18px] w-[18px] block dark:hidden" />
        <img src={PHONE_ICON_DARK} alt="Call" className="h-[18px] w-[18px] hidden dark:block" />
      </a>
      <a
        href={wa ?? undefined}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(iconBtn, !wa && "opacity-40 pointer-events-none")}
        title={wa ? "WhatsApp" : "No phone"}
        data-testid="action-whatsapp"
      >
        <img src={WHATSAPP_ICON_LIGHT} alt="WhatsApp" className="h-[18px] w-[18px] block dark:hidden" />
        <img src={WHATSAPP_ICON_DARK} alt="WhatsApp" className="h-[18px] w-[18px] hidden dark:block" />
      </a>
    </div>
  );
}

export default function AbandonedCartsPage() {
  const { toast } = useToast();
  const [selected, setSelected] = useState<AbandonedCheckoutRow | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const { data: checkouts, isLoading } = useQuery<AbandonedCheckoutRow[]>({
    queryKey: ["/api/abandoned-checkouts"],
  });

  // Fastrr visibility pattern: only carts with a real NAME and a SHIPPING
  // ADDRESS. Phone-only "Guest" drop-offs are hidden.
  const visible = useMemo(() => {
    return (checkouts ?? []).filter((c) => {
      const name = (c.customerName ?? "").trim();
      const hasName = name.length > 0 && name.toLowerCase() !== "guest";
      const hasAddress = (c.address ?? "").trim().length > 0;
      return hasName && hasAddress;
    });
  }, [checkouts]);

  const total = visible.length;
  const totalPages = Math.ceil(total / pageSize) || 1;
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * pageSize;
  const end = Math.min(start + pageSize, total);
  const pageRows = visible.slice(start, end);

  useEffect(() => {
    setPage(1);
  }, [pageSize, total]);

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
    toast({ title: "Link Copied" });
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
        ) : total === 0 ? (
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
                    <TableHead className="w-[160px]">Date &amp; Time</TableHead>
                    <TableHead>Customer Name</TableHead>
                    <TableHead>Cart Details</TableHead>
                    <TableHead className="w-[120px]">Cart Value</TableHead>
                    <TableHead className="w-[150px]">Checkout Stage</TableHead>
                    <TableHead className="w-[140px]">Status</TableHead>
                    <TableHead className="w-[130px] text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="[&_td]:py-2.5 [&_td]:px-3 [&_td]:text-[13px]">
                  {pageRows.map((checkout) => {
                    const items = asItems(checkout.items);
                    return (
                      <TableRow
                        key={checkout.id}
                        className="group hover-elevate cursor-pointer"
                        onClick={() => setSelected(checkout)}
                        data-testid={`row-checkout-${checkout.id}`}
                      >
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {format(new Date(checkout.createdAt), "do MMMM , h:mm aaa")}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col leading-tight">
                            <span className="font-medium text-foreground">{checkout.customerName}</span>
                            <span className="text-[11px] text-muted-foreground tabular-nums mt-0.5">
                              {checkout.customerPhone}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <CartDetails items={items} />
                        </TableCell>
                        <TableCell className="font-medium tabular-nums whitespace-nowrap">
                          {formatINR(checkout.cartValue)}
                        </TableCell>
                        <TableCell>
                          <StageBadge stage={checkout.checkoutStage} />
                        </TableCell>
                        <TableCell>
                          <RecoveryStatusDropdown
                            status={checkout.recoveryStatus ?? "PENDING"}
                            onChange={(status) => statusMutation.mutate({ id: checkout.id, status })}
                            disabled={statusMutation.isPending}
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <ActionIcons phone={checkout.customerPhone} checkoutUrl={checkout.checkoutUrl} onCopy={copyLink} />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            {/* Pagination footer — cloned from the Orders table. */}
            <div className="sticky bottom-0 bg-card border-t p-4 z-10">
              <div className="flex items-center justify-between gap-4">
                <span className="text-sm text-muted-foreground">
                  Showing {total === 0 ? 0 : start + 1}-{end} of {total} carts
                </span>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Rows per page:</span>
                    <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
                      <SelectTrigger className="w-[80px]" data-testid="select-page-size">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="10">10</SelectItem>
                        <SelectItem value="25">25</SelectItem>
                        <SelectItem value="50">50</SelectItem>
                        <SelectItem value="100">100</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="outline" size="sm" onClick={() => setPage(safePage - 1)} disabled={safePage === 1} data-testid="button-prev-page">
                      <ChevronLeft className="h-4 w-4" />
                      Previous
                    </Button>
                    <span className="text-sm text-muted-foreground px-4">Page {safePage} of {totalPages}</span>
                    <Button variant="outline" size="sm" onClick={() => setPage(safePage + 1)} disabled={safePage >= totalPages} data-testid="button-next-page">
                      Next
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
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

              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
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
                              <p className="text-xs font-medium">{formatINR(item.price as any, 0)}</p>
                              <p className="text-xs text-muted-foreground">Qty: {Number(item.quantity) || 1}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <Separator />

                {selected.checkoutUrl && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-2">Checkout link</p>
                    <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-2.5 py-1.5">
                      <a href={selected.checkoutUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs text-blue-600 hover:underline truncate flex-1" data-testid="link-checkout-url">
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
                  <div className="pt-2">
                    <ActionIcons phone={selected.customerPhone} checkoutUrl={selected.checkoutUrl} onCopy={copyLink} />
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
