import { OrdersTable } from "../orders-table";

const mockOrders = [
  {
    id: "1",
    shopifyOrderId: "1001",
    customerName: "Rajesh Kumar",
    customerPhone: "+91 98765 43210",
    items: "iPhone 15 Pro, AirPods Pro",
    total: 145000,
    paymentMethod: "cod" as const,
    status: "assigned" as const,
    assignedTo: "Priya Sharma",
    createdAt: new Date(Date.now() - 1000 * 60 * 30),
  },
  {
    id: "2",
    shopifyOrderId: "1002",
    customerName: "Priya Patel",
    customerPhone: "+91 98765 43211",
    items: "Samsung Galaxy S24",
    total: 79999,
    paymentMethod: "prepaid" as const,
    status: "confirmed" as const,
    assignedTo: "Amit Singh",
    createdAt: new Date(Date.now() - 1000 * 60 * 120),
  },
  {
    id: "3",
    shopifyOrderId: "1003",
    customerName: "Amit Verma",
    customerPhone: "+91 98765 43212",
    items: "OnePlus 12, Smart Watch",
    total: 95000,
    paymentMethod: "cod" as const,
    status: "pending" as const,
    createdAt: new Date(Date.now() - 1000 * 60 * 15),
  },
];

export default function OrdersTableExample() {
  return (
    <div className="p-8">
      <OrdersTable
        orders={mockOrders}
        userRole="admin"
        onCallCustomer={(order) => console.log("Call customer:", order.customerName)}
        onViewDetails={(order) => console.log("View details:", order.id)}
        onAssignOrder={(order) => console.log("Assign order:", order.id)}
      />
    </div>
  );
}
