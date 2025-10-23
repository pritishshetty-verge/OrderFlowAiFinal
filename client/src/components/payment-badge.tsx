import { Badge } from "@/components/ui/badge";
import { Banknote, CreditCard } from "lucide-react";
import { cn } from "@/lib/utils";

type PaymentMethod = "cod" | "prepaid";

interface PaymentBadgeProps {
  method: PaymentMethod;
  className?: string;
}

export function PaymentBadge({ method, className }: PaymentBadgeProps) {
  const isCOD = method === "cod";
  
  return (
    <Badge
      variant="outline"
      className={cn(
        "rounded-full px-3 py-1 text-xs font-medium border gap-1.5",
        isCOD
          ? "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20"
          : "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20",
        className
      )}
      data-testid={`badge-payment-${method}`}
    >
      {isCOD ? (
        <Banknote className="h-3 w-3" />
      ) : (
        <CreditCard className="h-3 w-3" />
      )}
      {isCOD ? "COD" : "Prepaid"}
    </Badge>
  );
}
