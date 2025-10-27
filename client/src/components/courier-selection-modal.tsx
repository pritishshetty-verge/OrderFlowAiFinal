import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Truck, Star, AlertTriangle, Package } from "lucide-react";
import { format } from "date-fns";

interface CourierPartner {
  courier_company_id: number;
  courier_name: string;
  freight_charge: number;
  cod_charges: number;
  other_charges: number;
  total_charge: number;
  rating: string;
  etd: string;
  estimated_delivery_days: string;
  pickup_availability: string;
  courier_type: string;
  is_surface: boolean;
  is_hyperlocal: boolean;
  is_recommended: boolean;
  is_serviceable: boolean;
  non_serviceable_reason?: string;
  has_warning?: boolean;
  warning_message?: string;
}

interface CourierSelectionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  orderDetails: {
    shopifyOrderNumber: string;
    customerName: string;
    total: number;
    paymentMethod: string;
  };
}

export function CourierSelectionModal({
  open,
  onOpenChange,
  orderId,
  orderDetails,
}: CourierSelectionModalProps) {
  const { toast } = useToast();
  const [selectedTab, setSelectedTab] = useState("all");

  // Calculate price matching Shiprocket UI logic
  const calculatePrice = (courier: CourierPartner) => {
    const isCOD = orderDetails.paymentMethod.toLowerCase() === 'cod';
    // For COD: price = freight + cod_charges
    // For Prepaid: price = freight only
    return isCOD 
      ? (courier.freight_charge || 0) + (courier.cod_charges || 0)
      : (courier.freight_charge || 0);
  };

  // Fetch available couriers
  const { data: couriersData, isLoading, error } = useQuery({
    queryKey: ["/api/orders", orderId, "couriers"],
    queryFn: async () => {
      const response = await fetch(`/api/orders/${orderId}/couriers`);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to fetch couriers");
      }
      return response.json() as Promise<{ couriers: CourierPartner[] }>;
    },
    enabled: open,
  });

  // Assign courier mutation
  const assignCourierMutation = useMutation({
    mutationFn: async (courierId: number) => {
      const response = await fetch(`/api/orders/${orderId}/ship`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courierId }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to assign courier");
      }

      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders", orderId] });
      toast({
        title: "Order Shipped!",
        description: `Successfully shipped with ${data.courierName}. AWB: ${data.awb}`,
      });
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Shipping Failed",
        description: error.message,
      });
    },
  });

  const handleShipNow = (courier: CourierPartner) => {
    assignCourierMutation.mutate(courier.courier_company_id);
  };

  // Filter couriers based on selected tab
  const getFilteredCouriers = () => {
    if (!couriersData?.couriers) return [];

    const couriers = couriersData.couriers;

    switch (selectedTab) {
      case "air":
        // Only serviceable Air couriers
        return couriers.filter(c => c.is_serviceable && !c.is_surface);
      case "surface":
        // Only serviceable Surface couriers
        return couriers.filter(c => c.is_serviceable && c.is_surface);
      case "non-serviceable":
        // Only non-serviceable couriers
        return couriers.filter(c => !c.is_serviceable);
      default:
        // "all" tab - show ALL serviceable couriers (both Air and Surface)
        return couriers.filter(c => c.is_serviceable);
    }
  };

  // Get counts for each tab
  const getTabCounts = () => {
    if (!couriersData?.couriers) {
      return { all: 0, air: 0, surface: 0, nonServiceable: 0 };
    }

    const couriers = couriersData.couriers;
    return {
      all: couriers.filter(c => c.is_serviceable).length,
      air: couriers.filter(c => c.is_serviceable && !c.is_surface).length,
      surface: couriers.filter(c => c.is_serviceable && c.is_surface).length,
      nonServiceable: couriers.filter(c => !c.is_serviceable).length,
    };
  };

  const tabCounts = getTabCounts();

  const filteredCouriers = getFilteredCouriers();
  const sortedCouriers = [...filteredCouriers].sort((a, b) => {
    // Recommended first
    if (a.is_recommended && !b.is_recommended) return -1;
    if (!a.is_recommended && b.is_recommended) return 1;
    // Then by calculated price (matching Shiprocket logic)
    return calculatePrice(a) - calculatePrice(b);
  });

  const getRatingColor = (rating: string) => {
    const ratingNum = parseFloat(rating);
    if (ratingNum >= 4.0) return "text-green-600 dark:text-green-400";
    if (ratingNum >= 3.0) return "text-yellow-600 dark:text-yellow-400";
    return "text-red-600 dark:text-red-400";
  };

  const getRatingBadgeVariant = (rating: string) => {
    const ratingNum = parseFloat(rating);
    if (ratingNum >= 4.0) return "default";
    if (ratingNum >= 3.0) return "secondary";
    return "destructive";
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5" />
            Select Courier Partner
          </DialogTitle>
          <DialogDescription>
            Order #{orderDetails.shopifyOrderNumber} • {orderDetails.customerName} • 
            ₹{orderDetails.total} • {orderDetails.paymentMethod}
          </DialogDescription>
        </DialogHeader>

        <Tabs value={selectedTab} onValueChange={setSelectedTab} className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="w-full justify-start">
            <TabsTrigger value="all" data-testid="tab-all-couriers">
              All {!isLoading && tabCounts.all > 0 && `(${tabCounts.all})`}
            </TabsTrigger>
            <TabsTrigger value="air" data-testid="tab-air-couriers">
              Air {!isLoading && tabCounts.air > 0 && `(${tabCounts.air})`}
            </TabsTrigger>
            <TabsTrigger value="surface" data-testid="tab-surface-couriers">
              Surface {!isLoading && tabCounts.surface > 0 && `(${tabCounts.surface})`}
            </TabsTrigger>
            <TabsTrigger value="non-serviceable" data-testid="tab-non-serviceable">
              Non-Serviceable {!isLoading && tabCounts.nonServiceable > 0 && `(${tabCounts.nonServiceable})`}
              {tabCounts.nonServiceable > 0 && <AlertTriangle className="h-3 w-3 ml-1" />}
            </TabsTrigger>
          </TabsList>

          <TabsContent value={selectedTab} className="flex-1 overflow-y-auto mt-4">
            {isLoading && (
              <div className="flex items-center justify-center py-12" data-testid="loading-couriers">
                <Package className="h-8 w-8 animate-spin text-muted-foreground" />
                <span className="ml-2 text-muted-foreground">Loading courier options...</span>
              </div>
            )}

            {error && (
              <div className="flex flex-col items-center justify-center py-12 text-destructive" data-testid="error-couriers">
                <AlertTriangle className="h-12 w-12 mb-2" />
                <p className="font-medium">Failed to load courier partners</p>
                <p className="text-sm text-muted-foreground">{(error as Error).message}</p>
              </div>
            )}

            {!isLoading && !error && sortedCouriers.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground" data-testid="no-couriers">
                <Package className="h-12 w-12 mb-2" />
                <p className="font-medium">No couriers available</p>
                <p className="text-sm">Try selecting a different tab</p>
              </div>
            )}

            {!isLoading && !error && sortedCouriers.length > 0 && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground" data-testid="couriers-count">
                  {sortedCouriers.length} Courier{sortedCouriers.length !== 1 ? 's' : ''} Found
                </p>

                {selectedTab !== "non-serviceable" && tabCounts.nonServiceable > 0 && (
                  <div className="bg-orange-50 dark:bg-orange-950 border border-orange-200 dark:border-orange-800 rounded-lg p-3 flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-orange-600 dark:text-orange-400 mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-orange-800 dark:text-orange-200">
                      Some of your frequently used courier partners are non-serviceable. Please check the Non-Serviceable tab for more details.
                    </p>
                  </div>
                )}

                {sortedCouriers.map((courier) => (
                  <div
                    key={courier.courier_company_id}
                    className="border rounded-lg p-4 hover-elevate"
                    data-testid={`courier-option-${courier.courier_company_id}`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      {/* Left: Courier Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          <h3 className="font-semibold text-base" data-testid={`courier-name-${courier.courier_company_id}`}>
                            {courier.courier_name}
                          </h3>
                          {courier.is_recommended && (
                            <Badge variant="default" className="text-xs" data-testid={`recommended-badge-${courier.courier_company_id}`}>
                              Recommended
                            </Badge>
                          )}
                          {courier.is_serviceable && (
                            <Badge 
                              variant={getRatingBadgeVariant(courier.rating)}
                              className="text-xs"
                              data-testid={`rating-badge-${courier.courier_company_id}`}
                            >
                              <Star className="h-3 w-3 mr-1 fill-current" />
                              {courier.rating}
                            </Badge>
                          )}
                          <Badge variant="outline" className="text-xs">
                            {courier.is_surface ? "Surface" : "Air"}
                          </Badge>
                        </div>

                        {/* Warning message for serviceable couriers with operational stress */}
                        {courier.is_serviceable && courier.has_warning && courier.warning_message && (
                          <div className="mb-3 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-md p-2 flex items-start gap-2">
                            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                            <p className="text-xs text-amber-800 dark:text-amber-200" data-testid={`warning-${courier.courier_company_id}`}>
                              {courier.warning_message}
                            </p>
                          </div>
                        )}

                        {/* Non-serviceable reason */}
                        {!courier.is_serviceable && courier.non_serviceable_reason && (
                          <div className="mb-3">
                            <p className="text-sm font-medium text-muted-foreground mb-1">Reason for Non-Serviceability:</p>
                            <p className="text-sm text-destructive" data-testid={`non-serviceable-reason-${courier.courier_company_id}`}>
                              {courier.non_serviceable_reason}
                            </p>
                          </div>
                        )}

                        {courier.is_serviceable && (
                          <>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                              <div>
                                <p className="text-muted-foreground text-xs">Expected Pickup</p>
                                <p className="font-medium" data-testid={`pickup-date-${courier.courier_company_id}`}>
                                  {courier.pickup_availability}
                                </p>
                              </div>
                              <div>
                                <p className="text-muted-foreground text-xs">Estimated Delivery</p>
                                <p className="font-medium" data-testid={`delivery-date-${courier.courier_company_id}`}>
                                  {courier.etd}
                                </p>
                              </div>
                              <div>
                                <p className="text-muted-foreground text-xs">Delivery Days</p>
                                <p className="font-medium">{courier.estimated_delivery_days} days</p>
                              </div>
                              <div>
                                <p className="text-muted-foreground text-xs">Charges</p>
                                <p className="font-semibold text-base" data-testid={`charge-${courier.courier_company_id}`}>
                                  ₹{calculatePrice(courier).toFixed(2)}
                                </p>
                              </div>
                            </div>

                            {/* Charge breakdown */}
                            <div className="mt-2 text-xs text-muted-foreground">
                              Freight: ₹{courier.freight_charge || 0} • 
                              COD: ₹{courier.cod_charges || 0} • 
                              Other: ₹{courier.other_charges || 0}
                            </div>
                          </>
                        )}
                      </div>

                      {/* Right: Ship Button */}
                      <div className="flex-shrink-0">
                        {courier.is_serviceable ? (
                          <Button
                            onClick={() => handleShipNow(courier)}
                            disabled={assignCourierMutation.isPending}
                            data-testid={`button-ship-${courier.courier_company_id}`}
                          >
                            {assignCourierMutation.isPending ? "Shipping..." : "Ship Now"}
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            disabled
                            data-testid={`button-unavailable-${courier.courier_company_id}`}
                          >
                            Unavailable
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
