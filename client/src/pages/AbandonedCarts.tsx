import { useQuery } from "@tanstack/react-query";
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
import { Phone, MessageCircle, ShoppingCart } from "lucide-react";
import { format } from "date-fns";
import type { AbandonedCheckout } from "@shared/schema";

interface AbandonedCheckoutRow extends AbandonedCheckout {
  assignedAgentName: string | null;
}

function getStageBadge(stage: string | null) {
  const normalized = (stage || "").toLowerCase().replace(/[_\s]+/g, "");
  if (normalized.includes("payment") || normalized === "paymentfailed" || normalized === "paymentinitiated") {
    return <Badge variant="destructive" data-testid="badge-stage-payment-failed">Payment Failed</Badge>;
  }
  if (normalized.includes("details") || normalized === "detailssubmitted" || normalized === "detailsadded") {
    return <Badge className="bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-500/30" data-testid="badge-stage-details-added">Details Added</Badge>;
  }
  return <Badge variant="secondary" data-testid="badge-stage-cart-created">Cart Created</Badge>;
}

function formatCurrency(value: string | null) {
  if (!value) return "₹0";
  const num = parseFloat(value);
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(num);
}

export default function AbandonedCartsPage() {
  const { data: checkouts, isLoading } = useQuery<AbandonedCheckoutRow[]>({
    queryKey: ["/api/abandoned-checkouts"],
  });

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
            ) : !checkouts || checkouts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <ShoppingCart className="h-12 w-12 mb-3 opacity-40" />
                <p className="text-sm font-medium">No abandoned checkouts yet</p>
                <p className="text-xs mt-1">They will appear here when received from Fastrr</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead data-testid="header-date">Date</TableHead>
                    <TableHead data-testid="header-customer">Customer</TableHead>
                    <TableHead data-testid="header-address">Address</TableHead>
                    <TableHead data-testid="header-stage">Stage</TableHead>
                    <TableHead data-testid="header-value">Value</TableHead>
                    <TableHead data-testid="header-agent">Agent</TableHead>
                    <TableHead data-testid="header-status">Status</TableHead>
                    <TableHead data-testid="header-actions">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {checkouts.map((checkout) => (
                    <TableRow key={checkout.id} data-testid={`row-checkout-${checkout.id}`}>
                      <TableCell className="text-sm whitespace-nowrap" data-testid={`text-date-${checkout.id}`}>
                        {format(new Date(checkout.createdAt), "MMM d, h:mm a")}
                      </TableCell>
                      <TableCell data-testid={`text-customer-${checkout.id}`}>
                        <div>
                          {checkout.customerName ? (
                            <span className="font-medium text-sm">{checkout.customerName}</span>
                          ) : (
                            <span className="text-sm italic text-muted-foreground">Guest</span>
                          )}
                          {checkout.customerPhone && (
                            <p className="text-xs text-muted-foreground">{checkout.customerPhone}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell data-testid={`text-address-${checkout.id}`}>
                        {checkout.address ? (
                          <span
                            className="text-xs text-muted-foreground max-w-[200px] truncate block"
                            title={checkout.address}
                          >
                            {checkout.address}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell data-testid={`text-stage-${checkout.id}`}>
                        {getStageBadge(checkout.checkoutStage)}
                      </TableCell>
                      <TableCell className="font-medium text-sm" data-testid={`text-value-${checkout.id}`}>
                        {formatCurrency(checkout.cartValue)}
                      </TableCell>
                      <TableCell data-testid={`text-agent-${checkout.id}`}>
                        {checkout.assignedAgentName ? (
                          <span className="text-sm">{checkout.assignedAgentName}</span>
                        ) : (
                          <span className="text-sm text-muted-foreground">Unassigned</span>
                        )}
                      </TableCell>
                      <TableCell data-testid={`text-status-${checkout.id}`}>
                        {checkout.isRecovered ? (
                          <Badge className="bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/30">Recovered</Badge>
                        ) : (
                          <Badge variant="secondary">Pending</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            disabled
                            className="text-blue-500"
                            data-testid={`button-call-${checkout.id}`}
                          >
                            <Phone className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            disabled
                            className="text-green-500"
                            data-testid={`button-whatsapp-${checkout.id}`}
                          >
                            <MessageCircle className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  );
}
