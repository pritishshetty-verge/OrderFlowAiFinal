import { useQuery } from "@tanstack/react-query";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { Package } from "lucide-react";
import type { OrderItem } from "@shared/schema";

interface OrderItemsSummaryProps {
  orderId: string;
  fallbackSummary: string;
}

export function OrderItemsSummary({ orderId, fallbackSummary }: OrderItemsSummaryProps) {
  const { data: orderItems = [], isLoading } = useQuery<OrderItem[]>({
    queryKey: ["/api/orders", orderId, "items"],
  });

  if (isLoading || orderItems.length === 0) {
    return <span className="text-sm">{fallbackSummary}</span>;
  }

  // Smart Summary Logic
  const getSmartSummary = () => {
    if (orderItems.length === 1) {
      const item = orderItems[0];
      return item.variantTitle && item.variantTitle !== "Default Title"
        ? `${item.productName} (${item.variantTitle})`
        : item.productName;
    }

    const firstItem = orderItems[0];
    const firstName = firstItem.variantTitle && firstItem.variantTitle !== "Default Title"
      ? `${firstItem.productName} (${firstItem.variantTitle})`
      : firstItem.productName;
    
    const remaining = orderItems.length - 1;
    return `${firstName} + ${remaining} more ${remaining === 1 ? 'item' : 'items'}`;
  };

  const smartSummary = getSmartSummary();

  return (
    <HoverCard openDelay={200}>
      <HoverCardTrigger asChild>
        <button 
          className="text-sm text-left hover:underline cursor-help focus:outline-none"
          data-testid={`items-summary-${orderId}`}
        >
          {smartSummary}
        </button>
      </HoverCardTrigger>
      <HoverCardContent className="w-80 border shadow-lg z-50" data-testid={`items-details-${orderId}`}>
        <div className="space-y-3">
          <div className="flex items-center gap-2 border-b pb-2">
            <Package className="h-4 w-4 text-muted-foreground" />
            <h4 className="font-semibold text-sm">Order Items ({orderItems.length})</h4>
          </div>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {orderItems.map((item, index) => (
              <div 
                key={item.id || index} 
                className="flex justify-between gap-2 text-sm pb-2 border-b last:border-0"
                data-testid={`item-${index}`}
              >
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate text-[#2d080a]">{item.productName}</p>
                  {item.variantTitle && item.variantTitle !== "Default Title" && (
                    <p className="text-xs text-muted-foreground">{item.variantTitle}</p>
                  )}
                  {item.sku && (
                    <p className="text-xs text-muted-foreground font-mono">SKU: {item.sku}</p>
                  )}
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="font-medium">×{item.quantity}</p>
                  <p className="text-xs text-muted-foreground">
                    ₹{parseFloat(item.totalPrice).toLocaleString("en-IN")}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
