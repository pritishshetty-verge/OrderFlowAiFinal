import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Package } from "lucide-react";

interface CreateShipmentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  orderDetails: {
    shopifyOrderId: string;
    customerName: string;
    customerPhone: string;
    total: number;
  };
}

export function CreateShipmentModal({
  open,
  onOpenChange,
  orderId,
  orderDetails,
}: CreateShipmentModalProps) {
  const { toast } = useToast();
  const [weight, setWeight] = useState("0.5"); // Default 0.5 kg
  const [length, setLength] = useState("10"); // Default 10 cm
  const [breadth, setBreadth] = useState("10");
  const [height, setHeight] = useState("10");

  const createShipmentMutation = useMutation({
    mutationFn: async (data: {
      orderId: string;
      weight: number;
      length: number;
      breadth: number;
      height: number;
    }) => {
      const response = await fetch(`/api/shiprocket/orders/${data.orderId}/create-shipment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          weight: data.weight,
          length: data.length,
          breadth: data.breadth,
          height: data.height,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to create shipment");
      }

      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      toast({
        title: "Shipment Created",
        description: `Shipment created successfully with AWB: ${data.shipment.awb}`,
      });
      onOpenChange(false);
      // Reset form
      setWeight("0.5");
      setLength("10");
      setBreadth("10");
      setHeight("10");
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    },
  });

  const handleSubmit = () => {
    const weightNum = parseFloat(weight);
    const lengthNum = parseFloat(length);
    const breadthNum = parseFloat(breadth);
    const heightNum = parseFloat(height);

    if (isNaN(weightNum) || weightNum <= 0) {
      toast({
        variant: "destructive",
        title: "Invalid Weight",
        description: "Please enter a valid weight greater than 0",
      });
      return;
    }

    if (isNaN(lengthNum) || isNaN(breadthNum) || isNaN(heightNum) || 
        lengthNum <= 0 || breadthNum <= 0 || heightNum <= 0) {
      toast({
        variant: "destructive",
        title: "Invalid Dimensions",
        description: "Please enter valid dimensions greater than 0",
      });
      return;
    }

    createShipmentMutation.mutate({
      orderId,
      weight: weightNum,
      length: lengthNum,
      breadth: breadthNum,
      height: heightNum,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-testid="dialog-create-shipment">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Create Shipment
          </DialogTitle>
          <DialogDescription>
            Create a Shiprocket shipment for order #{orderDetails.shopifyOrderId}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Order Summary */}
          <div className="rounded-lg border p-3 bg-muted/30">
            <div className="text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Customer:</span>
                <span className="font-medium">{orderDetails.customerName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Phone:</span>
                <span className="font-mono text-xs">{orderDetails.customerPhone}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Order Value:</span>
                <span className="font-medium">₹{orderDetails.total.toLocaleString("en-IN")}</span>
              </div>
            </div>
          </div>

          {/* Package Weight */}
          <div className="space-y-2">
            <Label htmlFor="weight">Weight (kg) *</Label>
            <Input
              id="weight"
              data-testid="input-weight"
              type="number"
              step="0.1"
              min="0.1"
              placeholder="0.5"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
            />
          </div>

          {/* Package Dimensions */}
          <div className="space-y-2">
            <Label>Dimensions (cm) *</Label>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Input
                  data-testid="input-length"
                  type="number"
                  step="0.1"
                  min="0.1"
                  placeholder="Length"
                  value={length}
                  onChange={(e) => setLength(e.target.value)}
                />
              </div>
              <div>
                <Input
                  data-testid="input-breadth"
                  type="number"
                  step="0.1"
                  min="0.1"
                  placeholder="Breadth"
                  value={breadth}
                  onChange={(e) => setBreadth(e.target.value)}
                />
              </div>
              <div>
                <Input
                  data-testid="input-height"
                  type="number"
                  step="0.1"
                  min="0.1"
                  placeholder="Height"
                  value={height}
                  onChange={(e) => setHeight(e.target.value)}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">L × B × H in centimeters</p>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={createShipmentMutation.isPending}
            data-testid="button-cancel"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={createShipmentMutation.isPending}
            data-testid="button-create-shipment"
          >
            {createShipmentMutation.isPending ? "Creating..." : "Create Shipment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
