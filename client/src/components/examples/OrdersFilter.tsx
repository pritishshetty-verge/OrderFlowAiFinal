import { OrdersFilter } from "../orders-filter";

export default function OrdersFilterExample() {
  return (
    <div className="p-8">
      <OrdersFilter
        onSearch={(value) => console.log("Search:", value)}
        onStatusChange={(value) => console.log("Status:", value)}
        onPaymentChange={(value) => console.log("Payment:", value)}
        onClearFilters={() => console.log("Clear filters")}
      />
    </div>
  );
}
