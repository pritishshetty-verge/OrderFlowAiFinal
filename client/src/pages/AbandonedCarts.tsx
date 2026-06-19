import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { PageLayout } from "@/components/page-layout";
import { Card, CardContent } from "@/components/ui/card";
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Phone, ShoppingCart, Package as PackageIcon, Copy, ExternalLink } from "lucide-react";
import { format } from "date-fns";
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

function getStageBadge(stage: string | null) {
  const normalized = (stage || "").toLowerCase().replace(/[_\s]+/g, "");
  if (normalized.includes("payment")) {
    return <Badge variant="destructive" data-testid="badge-stage-payment-failed">Payment Failed</Badge>;
  }
  if (normalized.includes("details")) {
    return <Badge className="bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-500/30" data-testid="badge-stage-details-added">Details Added</Badge>;
  }
  return <Badge variant="secondary" data-testid="badge-stage-cart-created">Cart Created</Badge>;
}

function getRecoveryBadge(status: string | null | undefined) {
  switch (status) {
    case "RECOVERED":
      return <Badge className="bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/30">Recovered</Badge>;
    case "CONTACTED":
      return <Badge className="bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30">Contacted</Badge>;
    case "LOST":
      return <Badge variant="destructive">Lost</Badge>;
    default:
      return <Badge variant="secondary">Pending</Badge>;
  }
}

function formatCurrency(value: string | number | null | undefined) {
  const num = typeof value === "number" ? value : parseFloat(value ?? "0");
  if (isNaN(num)) return "₹0";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(num);
}

function asItems(items: unknown): CartItem[] {
  return Array.isArray(items) ? (items as CartItem[]) : [];
}

function whatsappLink(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (!digits) return null;
  const intl = digits.length === 10 ? `91${digits}` : digits;
  return `https://wa.me/${intl}`;
}

function WhatsAppIcon() {
  return (
    <>
      <img src={WHATSAPP_ICON_LIGHT} alt="WhatsApp" className="h-[18px] w-[18px] block dark:hidden" />
      <img src={WHATSAPP_ICON_DARK} alt="WhatsApp" className="h-[18px] w-[18px] hidden dark:block" />
    </>
  );
}

// Call / WhatsApp action buttons. stopPropagation so they don't open the row drawer.
function RowActions({ phone, id }: { phone: string | null; id: number }) {
  const wa = whatsappLink(phone);
  return (
    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
      <Button
        size="icon"
        variant="ghost"
        className="text-blue-500"
        disabled={!phone}
        asChild={!!phone}
        data-testid={`button-call-${id}`}
        title={phone ? `Call ${phone}` : "No phone number"}
      >
        {phone ? <a href={`tel:${phone}`}><Phone className="h-4 w-4" /></a> : <Phone className="h-4 w-4" />}
      </Button>
      <Button
        size="icon"
        variant="ghost"
        disabled={!wa}
        asChild={!!wa}
        data-testid={`button-whatsapp-${id}`}
        title={wa ? "Message on WhatsApp" : "No phone number"}
      >
        {wa ? (
          <a href={wa} target="_blank" rel="noopener noreferrer"><WhatsAppIcon /></a>
        ) : (
          <WhatsAppIcon />
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

  // Fastrr visibility pattern: only show carts where the shopper progressed far
  // enough to provide a real NAME and a SHIPPING ADDRESS. Phone-only "Guest"
  // drop-offs are filtered out to match Fastrr's dashboard.
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
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-6 space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : visible.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <ShoppingCart className="h-12 w-12 mb-3 opacity-40" />
                <p className="text-sm font-medium">No abandoned checkouts yet</p>
                <p className="text-xs mt-1">Carts with a name &amp; address will appear here when received from Fastrr</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead data-testid="header-date">Date</TableHead>
                    <TableHead data-testid="header-customer">Customer</TableHead>
                    <TableHead data-testid="header-items">Items</TableHead>
                    <TableHead data-testid="header-stage">Stage</TableHead>
                    <TableHead data-testid="header-value">Cart Value</TableHead>
                    <TableHead data-testid="header-status">Status</TableHead>
                    <TableHead data-testid="header-actions">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.map((checkout) => {
                    const count = asItems(checkout.items).length;
                    return (
                      <TableRow
                        key={checkout.id}
                        className="cursor-pointer"
                        onClick={() => setSelected(checkout)}
                        data-testid={`row-checkout-${checkout.id}`}
                      >
                        <TableCell className="text-sm whitespace-nowrap" data-testid={`text-date-${checkout.id}`}>
                          {format(new Date(checkout.createdAt), "MMM d, h:mm a")}
                        </TableCell>
                        <TableCell data-testid={`text-customer-${checkout.id}`}>
                          <div>
                            <span className="font-medium text-sm">{checkout.customerName}</span>
                            {checkout.customerPhone && (
                              <p className="text-xs text-muted-foreground">{checkout.customerPhone}</p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm whitespace-nowrap" data-testid={`text-items-${checkout.id}`}>
                          {count} {count === 1 ? "item" : "items"}
                        </TableCell>
                        <TableCell data-testid={`text-stage-${checkout.id}`}>
                          {getStageBadge(checkout.checkoutStage)}
                        </TableCell>
                        <TableCell className="font-medium text-sm" data-testid={`text-value-${checkout.id}`}>
                          {formatCurrency(checkout.cartValue)}
                        </TableCell>
                        <TableCell data-testid={`text-status-${checkout.id}`}>
                          {getRecoveryBadge(checkout.recoveryStatus)}
                        </TableCell>
                        <TableCell>
                          <RowActions phone={checkout.customerPhone} id={checkout.id} />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Details drawer */}
      <Sheet open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto" data-testid="sheet-checkout-detail">
          {selected && (
            <>
              <SheetHeader className="space-y-1">
                <SheetTitle>{selected.customerName}</SheetTitle>
                <SheetDescription>
                  Abandoned {format(new Date(selected.createdAt), "dd MMM yyyy, h:mm a")}
                </SheetDescription>
              </SheetHeader>

              <div className="mt-4 flex items-center gap-2">
                {getStageBadge(selected.checkoutStage)}
                <span className="text-sm font-semibold ml-auto">{formatCurrency(selected.cartValue)}</span>
              </div>

              <Separator className="my-4" />

              {/* Customer + address */}
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Customer</p>
                {selected.customerPhone && (
                  <p className="text-sm"><span className="text-muted-foreground">Phone: </span>{selected.customerPhone}</p>
                )}
                {selected.customerEmail && (
                  <p className="text-sm break-all"><span className="text-muted-foreground">Email: </span>{selected.customerEmail}</p>
                )}
                <p className="text-sm">
                  <span className="text-muted-foreground">Address: </span>
                  {selected.address || "—"}
                </p>
              </div>

              <Separator className="my-4" />

              {/* Cart items */}
              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  Cart items ({selectedItems.length})
                </p>
                {selectedItems.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No item details in this cart.</p>
                ) : (
                  selectedItems.map((item, idx) => {
                    const img = item.img_url || item.image;
                    const qty = Number(item.quantity) || 1;
                    return (
                      <div key={idx} className="flex items-center gap-3" data-testid={`drawer-item-${idx}`}>
                        {img ? (
                          <img src={img} alt={item.name || "Item"} className="h-12 w-12 rounded-md object-cover border border-border flex-shrink-0" />
                        ) : (
                          <div className="h-12 w-12 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
                            <PackageIcon className="h-5 w-5 text-muted-foreground" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{item.name || "Unnamed item"}</p>
                          <p className="text-xs text-muted-foreground">Qty {qty}</p>
                        </div>
                        <span className="text-sm font-medium">{formatCurrency(item.price as any)}</span>
                      </div>
                    );
                  })
                )}
              </div>

              <Separator className="my-4" />

              {/* Checkout link */}
              {selected.checkoutUrl && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Checkout link</p>
                  <div className="flex items-center gap-2">
                    <a
                      href={selected.checkoutUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-blue-600 dark:text-blue-400 hover:underline truncate flex-1 inline-flex items-center gap-1"
                      data-testid="link-checkout-url"
                    >
                      <ExternalLink className="h-3.5 w-3.5 flex-shrink-0" />
                      <span className="truncate">{selected.checkoutUrl}</span>
                    </a>
                    <Button size="sm" variant="outline" onClick={() => copyLink(selected.checkoutUrl!)} data-testid="button-copy-link">
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              )}

              <Separator className="my-4" />

              {/* Recovery status + actions */}
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Recovery status</p>
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
                        {s.charAt(0) + s.slice(1).toLowerCase()}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <div className="flex items-center gap-2 pt-2">
                  <RowActions phone={selected.customerPhone} id={selected.id} />
                  <span className="text-xs text-muted-foreground">Call or message the customer</span>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </PageLayout>
  );
}
