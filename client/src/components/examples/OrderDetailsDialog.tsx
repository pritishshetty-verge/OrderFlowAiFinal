import { useState } from "react";
import { OrderDetailsDialog } from "../order-details-dialog";
import { Button } from "@/components/ui/button";

const mockOrder = {
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
};

export default function OrderDetailsDialogExample() {
  const [open, setOpen] = useState(false);

  return (
    <div className="p-8">
      <Button onClick={() => setOpen(true)}>Open Order Details</Button>
      <OrderDetailsDialog
        order={mockOrder}
        open={open}
        onOpenChange={setOpen}
      />
    </div>
  );
}
