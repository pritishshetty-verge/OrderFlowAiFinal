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
        "rounded-full px-3 py-1 text-xs font-medium border gap-1.5 bg-transparent",
        isCOD
          ? "text-yellow-600 dark:text-yellow-400 border-yellow-600 dark:border-yellow-400"
          : "text-green-600 dark:text-green-400 border-green-600 dark:border-green-400",
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
