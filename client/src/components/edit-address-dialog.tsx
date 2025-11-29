import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
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
import { Loader2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface ShippingAddressData {
  firstName: string;
  lastName: string;
  address1: string;
  address2: string;
  city: string;
  province: string;
  zip: string;
  country: string;
  phone: string;
  email: string;
}

interface EditAddressDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  initialData: {
    customerName?: string;
    customerPhone?: string;
    customerEmail?: string;
    shippingAddress?: any;
    shippingAddressLine1?: string;
    shippingAddressLine2?: string;
    shippingCity?: string;
    shippingState?: string;
    shippingPincode?: string;
    shippingCountry?: string;
  };
}

export function EditAddressDialog({
  open,
  onOpenChange,
  orderId,
  initialData,
}: EditAddressDialogProps) {
  const { toast } = useToast();
  
  const parseInitialName = () => {
    const fullName = initialData.customerName || "";
    const parts = fullName.trim().split(" ");
    const firstName = parts[0] || "";
    const lastName = parts.slice(1).join(" ") || "";
    return { firstName, lastName };
  };

  const { firstName: initialFirstName, lastName: initialLastName } = parseInitialName();

  const [formData, setFormData] = useState<ShippingAddressData>({
    firstName: initialFirstName,
    lastName: initialLastName,
    address1: initialData.shippingAddressLine1 || initialData.shippingAddress?.address1 || "",
    address2: initialData.shippingAddressLine2 || initialData.shippingAddress?.address2 || "",
    city: initialData.shippingCity || initialData.shippingAddress?.city || "",
    province: initialData.shippingState || initialData.shippingAddress?.province || "",
    zip: initialData.shippingPincode || initialData.shippingAddress?.zip || "",
    country: initialData.shippingCountry || initialData.shippingAddress?.country || "India",
    phone: initialData.customerPhone || initialData.shippingAddress?.phone || "",
    email: initialData.customerEmail || "",
  });

  useEffect(() => {
    if (open) {
      const { firstName, lastName } = parseInitialName();
      setFormData({
        firstName,
        lastName,
        address1: initialData.shippingAddressLine1 || initialData.shippingAddress?.address1 || "",
        address2: initialData.shippingAddressLine2 || initialData.shippingAddress?.address2 || "",
        city: initialData.shippingCity || initialData.shippingAddress?.city || "",
        province: initialData.shippingState || initialData.shippingAddress?.province || "",
        zip: initialData.shippingPincode || initialData.shippingAddress?.zip || "",
        country: initialData.shippingCountry || initialData.shippingAddress?.country || "India",
        phone: initialData.customerPhone || initialData.shippingAddress?.phone || "",
        email: initialData.customerEmail || "",
      });
    }
  }, [open, initialData]);

  const updateAddressMutation = useMutation({
    mutationFn: async (data: ShippingAddressData) => {
      const res = await apiRequest("PUT", `/api/orders/${orderId}/address`, data);
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.details || errorData.error || "Failed to update address");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Address updated",
        description: "Shipping address has been synced to Shopify.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/orders", orderId] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Update failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateAddressMutation.mutate(formData);
  };

  const handleChange = (field: keyof ShippingAddressData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[540px]">
        <DialogHeader>
          <DialogTitle>Edit Shipping Address</DialogTitle>
          <DialogDescription>
            Updates will be synced to Shopify immediately.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="firstName">First Name</Label>
              <Input
                id="firstName"
                value={formData.firstName}
                onChange={(e) => handleChange("firstName", e.target.value)}
                placeholder="First name"
                data-testid="input-first-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">Last Name</Label>
              <Input
                id="lastName"
                value={formData.lastName}
                onChange={(e) => handleChange("lastName", e.target.value)}
                placeholder="Last name"
                data-testid="input-last-name"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="address1">Address Line 1</Label>
            <Input
              id="address1"
              value={formData.address1}
              onChange={(e) => handleChange("address1", e.target.value)}
              placeholder="Street address, P.O. box, company name"
              data-testid="input-address1"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="address2">Address Line 2</Label>
            <Input
              id="address2"
              value={formData.address2}
              onChange={(e) => handleChange("address2", e.target.value)}
              placeholder="Apartment, suite, unit, building, floor, etc."
              data-testid="input-address2"
            />
          </div>

          <div className="grid grid-cols-12 gap-4">
            <div className="col-span-5 space-y-2">
              <Label htmlFor="city">City</Label>
              <Input
                id="city"
                value={formData.city}
                onChange={(e) => handleChange("city", e.target.value)}
                placeholder="City"
                data-testid="input-city"
              />
            </div>
            <div className="col-span-4 space-y-2">
              <Label htmlFor="province">State / Province</Label>
              <Input
                id="province"
                value={formData.province}
                onChange={(e) => handleChange("province", e.target.value)}
                placeholder="State"
                data-testid="input-province"
              />
            </div>
            <div className="col-span-3 space-y-2">
              <Label htmlFor="zip">PIN Code</Label>
              <Input
                id="zip"
                value={formData.zip}
                onChange={(e) => handleChange("zip", e.target.value)}
                placeholder="PIN"
                data-testid="input-zip"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => handleChange("email", e.target.value)}
              placeholder="customer@example.com"
              data-testid="input-email"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">Phone Number</Label>
            <Input
              id="phone"
              value={formData.phone}
              onChange={(e) => handleChange("phone", e.target.value)}
              placeholder="+91 98765 43210"
              data-testid="input-phone"
            />
          </div>

          <DialogFooter className="pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={updateAddressMutation.isPending}
              data-testid="button-cancel-edit-address"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={updateAddressMutation.isPending}
              data-testid="button-save-address"
            >
              {updateAddressMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Changes"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
