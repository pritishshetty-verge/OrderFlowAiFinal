import { PaymentBadge } from "../payment-badge";

export default function PaymentBadgeExample() {
  return (
    <div className="p-8 space-y-4">
      <div className="flex gap-3">
        <PaymentBadge method="cod" />
        <PaymentBadge method="prepaid" />
      </div>
    </div>
  );
}
