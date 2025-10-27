import { useState } from "react";
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
import { Truck, Star, AlertTriangle, Package, XCircle } from "lucide-react";

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
  non_serviceable_reason?: string;
  has_warning?: boolean;
  warning_message?: string;
  category?: 'serviceable' | 'low_rated' | 'non_serviceable';
}

interface CategorizedCouriersResponse {
  serviceable: CourierPartner[];
  lowRated: CourierPartner[];
  nonServiceable: CourierPartner[];
  qualityRatingThreshold: number;
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
  const [selectedTab, setSelectedTab] = useState("serviceable");

  // Price display: Shiprocket uses total_charge field directly
  const calculatePrice = (courier: CourierPartner) => {
    return courier.total_charge || 0;
  };

  // Fetch available couriers (categorized response)
  const { data: couriersData, isLoading, error } = useQuery({
    queryKey: ["/api/orders", orderId, "couriers"],
    queryFn: async () => {
      const response = await fetch(`/api/orders/${orderId}/couriers`);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to fetch couriers");
      }
      return response.json() as Promise<{ couriers: CategorizedCouriersResponse }>;
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

  // Get couriers for selected tab
  const getTabCouriers = () => {
    if (!couriersData?.couriers) return [];

    switch (selectedTab) {
      case "serviceable":
        return couriersData.couriers.serviceable;
      case "low-rated":
        return couriersData.couriers.lowRated;
      case "non-serviceable":
        return couriersData.couriers.nonServiceable;
      default:
        return [];
    }
  };

  const tabCouriers = getTabCouriers();
  
  // Sort couriers: recommended first, then by price
  const sortedCouriers = [...tabCouriers].sort((a, b) => {
    if (a.is_recommended && !b.is_recommended) return -1;
    if (!a.is_recommended && b.is_recommended) return 1;
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
            <TabsTrigger value="serviceable" data-testid="tab-serviceable">
              Serviceable {!isLoading && couriersData?.couriers.serviceable && `(${couriersData.couriers.serviceable.length})`}
            </TabsTrigger>
            <TabsTrigger value="low-rated" data-testid="tab-low-rated">
              Low Rated {!isLoading && couriersData?.couriers.lowRated && `(${couriersData.couriers.lowRated.length})`}
              {couriersData?.couriers.lowRated && couriersData.couriers.lowRated.length > 0 && (
                <AlertTriangle className="h-3 w-3 ml-1 text-amber-500" />
              )}
            </TabsTrigger>
            <TabsTrigger value="non-serviceable" data-testid="tab-non-serviceable">
              Non-Serviceable {!isLoading && couriersData?.couriers.nonServiceable && `(${couriersData.couriers.nonServiceable.length})`}
              {couriersData?.couriers.nonServiceable && couriersData.couriers.nonServiceable.length > 0 && (
                <XCircle className="h-3 w-3 ml-1 text-destructive" />
              )}
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
                <p className="font-medium">No couriers in this category</p>
                <p className="text-sm">Try selecting a different tab</p>
              </div>
            )}

            {!isLoading && !error && sortedCouriers.length > 0 && (
              <div className="space-y-3">
                {/* Warning banner for Low Rated tab */}
                {selectedTab === "low-rated" && (
                  <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg p-4 flex items-start gap-3" data-testid="low-rated-warning">
                    <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="font-medium text-amber-900 dark:text-amber-100 mb-1">
                        Below-Average Couriers
                      </p>
                      <p className="text-sm text-amber-800 dark:text-amber-200">
                        Couriers here have ratings below {couriersData?.couriers.qualityRatingThreshold || 3.8}. 
                        Select only for special cases or cost constraints. These couriers may have slower delivery times or higher RTO rates.
                      </p>
                    </div>
                  </div>
                )}

                {/* Info banner for Non-Serviceable tab */}
                {selectedTab === "non-serviceable" && (
                  <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg p-4 flex items-start gap-3" data-testid="non-serviceable-info">
                    <XCircle className="h-5 w-5 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="font-medium text-red-900 dark:text-red-100 mb-1">
                        Unavailable Couriers
                      </p>
                      <p className="text-sm text-red-800 dark:text-red-200">
                        These couriers cannot deliver to this destination currently due to operational restrictions or service suspensions.
                      </p>
                    </div>
                  </div>
                )}

                <p className="text-sm text-muted-foreground" data-testid="couriers-count">
                  {sortedCouriers.length} Courier{sortedCouriers.length !== 1 ? 's' : ''} Found
                </p>

                {sortedCouriers.map((courier) => (
                  <div
                    key={courier.courier_company_id}
                    className={`border rounded-lg p-4 ${selectedTab === 'non-serviceable' ? 'opacity-60' : 'hover-elevate'}`}
                    data-testid={`courier-option-${courier.courier_company_id}`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      {/* Left: Courier Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          <h3 className="font-semibold text-base" data-testid={`courier-name-${courier.courier_company_id}`}>
                            {courier.courier_name}
                          </h3>
                          {courier.is_recommended && selectedTab !== 'non-serviceable' && (
                            <Badge variant="default" className="text-xs" data-testid={`recommended-badge-${courier.courier_company_id}`}>
                              Recommended
                            </Badge>
                          )}
                          {courier.rating && (
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

                        {/* Warning message for serviceable/low-rated couriers with operational stress */}
                        {selectedTab !== 'non-serviceable' && courier.has_warning && courier.warning_message && (
                          <div className="mb-3 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-md p-2 flex items-start gap-2">
                            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                            <p className="text-xs text-amber-800 dark:text-amber-200" data-testid={`warning-${courier.courier_company_id}`}>
                              {courier.warning_message}
                            </p>
                          </div>
                        )}

                        {/* Non-serviceable reason */}
                        {selectedTab === 'non-serviceable' && courier.non_serviceable_reason && (
                          <div className="mb-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-md p-3">
                            <p className="text-xs font-medium text-red-900 dark:text-red-100 mb-1">
                              Reason for Non-Serviceability:
                            </p>
                            <p className="text-sm text-red-700 dark:text-red-300" data-testid={`non-serviceable-reason-${courier.courier_company_id}`}>
                              {courier.non_serviceable_reason}
                            </p>
                          </div>
                        )}

                        {selectedTab !== 'non-serviceable' ? (
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
                        ) : (
                          <div className="text-sm text-muted-foreground">
                            <p className="mb-1">
                              <span className="font-medium">Rating:</span> {courier.rating} • 
                              <span className="font-medium ml-2">Type:</span> {courier.is_surface ? "Surface" : "Air"}
                            </p>
                            <p>
                              <span className="font-medium">Last Known Price:</span> ₹{calculatePrice(courier).toFixed(2)}
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Right: Ship Button */}
                      <div className="flex-shrink-0">
                        {selectedTab !== 'non-serviceable' ? (
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
