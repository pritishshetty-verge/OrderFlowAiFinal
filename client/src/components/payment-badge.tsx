import { Badge } from "@/components/ui/badge";
import { Banknote, CreditCard, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type PaymentMethod = "cod" | "prepaid";
type DisplayStatus = "prepaid" | "cod" | "voided";

interface PaymentBadgeProps {
  method: PaymentMethod;
  financialStatus?: string | null;
  className?: string;
}

/**
 * Determines the display status based on financial status and payment method
 * Rules:
 * - 'Prepaid': If financial_status is 'paid'
 * - 'COD': If financial_status is 'pending' OR payment_method includes 'cod'
 * - 'Voided': If financial_status is 'voided' or 'refunded'
 */
function getDisplayStatus(method: PaymentMethod, financialStatus?: string | null): DisplayStatus {
  const status = financialStatus?.toLowerCase();
  
  // Check for voided/refunded first
  if (status === "voided" || status === "refunded") {
    return "voided";
  }
  
  // Check for paid status
  if (status === "paid") {
    return "prepaid";
  }
  
  // Check for pending status or COD payment method
  if (status === "pending" || method === "cod") {
    return "cod";
  }
  
  // Default: assume prepaid if no other conditions match
  return "prepaid";
}

export function PaymentBadge({ method, financialStatus, className }: PaymentBadgeProps) {
  const displayStatus = getDisplayStatus(method, financialStatus);
  
  const styles = {
    prepaid: "text-green-600 dark:text-green-400 border-green-600 dark:border-green-400",
    cod: "text-yellow-600 dark:text-yellow-400 border-yellow-600 dark:border-yellow-400",
    voided: "text-gray-500 dark:text-gray-400 border-gray-500 dark:border-gray-400",
  };

  const icons = {
    prepaid: <CreditCard className="h-3 w-3" />,
    cod: <Banknote className="h-3 w-3" />,
    voided: <XCircle className="h-3 w-3" />,
  };

  const labels = {
    prepaid: "Prepaid",
    cod: "COD",
    voided: "Voided",
  };
  
  return (
    <Badge
      variant="outline"
      className={cn(
        "rounded-full px-3 py-1 text-xs font-medium border gap-1.5 bg-transparent",
        styles[displayStatus],
        className
      )}
      data-testid={`badge-payment-${displayStatus}`}
    >
      {icons[displayStatus]}
      {labels[displayStatus]}
    </Badge>
  );
}
