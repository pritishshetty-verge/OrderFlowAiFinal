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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { Truck, AlertTriangle, Package, XCircle, AlertCircle } from "lucide-react";
import amazonShippingLogo from "@assets/amazon-shipping_1761582270710.png";
import blueDartLogo from "@assets/blue-dart_1761582270715.png";
import delhiveryLogo from "@assets/delhivery_1761582270716.png";
import dtdcLogo from "@assets/dtdc_1761582270716.png";
import ekartLogo from "@assets/ekart_1761582270717.png";
import shadowfaxLogo from "@assets/shadowfax_1761582270718.png";

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
  min_weight?: number;
  rto_charges?: number;
  non_serviceable_reason?: string;
  has_warning?: boolean;
  warning_message?: string;
  category?: 'serviceable' | 'low_rated' | 'non_serviceable';
  pickup_performance?: number;
  delivery_performance?: number;
  rto_performance?: number;
  tracking_performance?: number;
  courier_logo_url?: string;
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

// Rating breakdown circular progress component
function RatingCircle({ value, label, size = 60 }: { value: number; label: string; size?: number }) {
  const percentage = (value / 5) * 100;
  const circumference = 2 * Math.PI * 18;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;
  
  // Color based on rating
  const getColor = () => {
    if (value >= 4.0) return "#22c55e"; // green
    if (value >= 3.0) return "#f59e0b"; // amber
    return "#ef4444"; // red
  };

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: size, height: size }}>
        <svg className="transform -rotate-90" width={size} height={size}>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={18}
            stroke="#e5e7eb"
            strokeWidth="4"
            fill="none"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={18}
            stroke={getColor()}
            strokeWidth="4"
            fill="none"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-sm font-semibold" style={{ color: getColor() }}>
            {value.toFixed(1)}
          </span>
        </div>
      </div>
      <span className="text-xs text-center text-muted-foreground leading-tight max-w-[70px]">
        {label}
      </span>
    </div>
  );
}

// Rating badge with popover
function RatingBadge({ courier }: { courier: CourierPartner }) {
  const rating = parseFloat(courier.rating) || 0;
  const [open, setOpen] = useState(false);
  
  const getColor = () => {
    if (rating >= 4.0) return "#22c55e";
    if (rating >= 3.0) return "#f59e0b";
    return "#ef4444";
  };

  const hasBreakdown = courier.pickup_performance !== undefined;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="relative cursor-pointer transition-transform hover:scale-110 active:scale-95"
          style={{ width: 48, height: 48 }}
          onClick={() => setOpen(!open)}
          data-testid={`rating-badge-${courier.courier_company_id}`}
        >
          <svg className="transform -rotate-90" width={48} height={48}>
            <circle
              cx={24}
              cy={24}
              r={20}
              stroke="#e5e7eb"
              strokeWidth="4"
              fill="white"
            />
            <circle
              cx={24}
              cy={24}
              r={20}
              stroke={getColor()}
              strokeWidth="4"
              fill="none"
              strokeDasharray={2 * Math.PI * 20}
              strokeDashoffset={2 * Math.PI * 20 * (1 - (rating / 5))}
              strokeLinecap="round"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-sm font-bold" style={{ color: getColor() }}>
              {rating.toFixed(1)}
            </span>
          </div>
        </button>
      </PopoverTrigger>
      {hasBreakdown && (
        <PopoverContent 
          className="w-auto p-4 animate-in fade-in-0 zoom-in-95 slide-in-from-top-2" 
          align="center"
          data-testid={`rating-breakdown-${courier.courier_company_id}`}
        >
          <div className="grid grid-cols-4 gap-4">
            <RatingCircle 
              value={courier.pickup_performance || 0} 
              label="Pickup Performance" 
            />
            <RatingCircle 
              value={courier.delivery_performance || 0} 
              label="Delivery Performance" 
            />
            <RatingCircle 
              value={courier.rto_performance || 0} 
              label="NDR Performance" 
            />
            <RatingCircle 
              value={courier.tracking_performance || 0} 
              label="SLA" 
            />
          </div>
        </PopoverContent>
      )}
    </Popover>
  );
}

// Courier logo mapping for local fallbacks
const COURIER_LOGO_MAP: Record<string, string> = {
  "amazon shipping": amazonShippingLogo,
  "blue dart": blueDartLogo,
  "delhivery": delhiveryLogo,
  "dtdc": dtdcLogo,
  "ekart": ekartLogo,
  "shadowfax": shadowfaxLogo,
};

// Theme-based fallback colors for initials
const FALLBACK_COLORS = [
  "from-blue-500 to-blue-600",
  "from-indigo-500 to-indigo-600",
  "from-purple-500 to-purple-600",
  "from-pink-500 to-pink-600",
  "from-green-500 to-green-600",
  "from-teal-500 to-teal-600",
  "from-cyan-500 to-cyan-600",
  "from-violet-500 to-violet-600",
];

// Courier logo component with 3-tier fallback system
// Tier 1: Shiprocket API logo_url
// Tier 2: Local courier logos based on name matching
// Tier 3: Themed colored circles with initials
function CourierLogo({ name, logoUrl }: { name: string; logoUrl?: string }) {
  const [apiLogoError, setApiLogoError] = useState(false);
  const [localLogoError, setLocalLogoError] = useState(false);
  
  const initials = name
    .split(' ')
    .slice(0, 2)
    .map(word => word[0])
    .join('')
    .toUpperCase();

  // Generate consistent color based on courier name
  const colorIndex = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % FALLBACK_COLORS.length;
  const fallbackColor = FALLBACK_COLORS[colorIndex];

  // Tier 1: Try Shiprocket API logo
  if (logoUrl && !apiLogoError) {
    return (
      <div className="w-16 h-16 rounded-full overflow-hidden flex items-center justify-center bg-white dark:bg-gray-800 flex-shrink-0 border border-gray-200 dark:border-gray-700 p-2">
        <img 
          src={logoUrl} 
          alt={`${name} logo`}
          className="w-full h-full object-contain"
          onError={() => setApiLogoError(true)}
        />
      </div>
    );
  }

  // Tier 2: Try local courier logo with partial matching
  const nameLower = name.toLowerCase();
  let localLogo: string | undefined;
  
  // Find matching logo by checking if courier name contains any of the mapped names
  for (const [key, logoPath] of Object.entries(COURIER_LOGO_MAP)) {
    if (nameLower.includes(key)) {
      localLogo = logoPath;
      break;
    }
  }
  
  if (localLogo && !localLogoError) {
    return (
      <div className="w-16 h-16 rounded-full overflow-hidden flex items-center justify-center bg-white dark:bg-gray-800 flex-shrink-0 border border-gray-200 dark:border-gray-700 p-2">
        <img 
          src={localLogo} 
          alt={`${name} logo`}
          className="w-full h-full object-contain"
          onError={() => setLocalLogoError(true)}
        />
      </div>
    );
  }

  // Tier 3: Fallback to themed colored initials
  return (
    <div className={`w-16 h-16 rounded-full bg-gradient-to-br ${fallbackColor} flex items-center justify-center flex-shrink-0 shadow-sm`}>
      <span className="text-white font-bold text-base">{initials}</span>
    </div>
  );
}

export function CourierSelectionModal({
  open,
  onOpenChange,
  orderId,
  orderDetails,
}: CourierSelectionModalProps) {
  const { toast } = useToast();
  const [selectedTab, setSelectedTab] = useState("serviceable");
  const [shippingCourierId, setShippingCourierId] = useState<number | null>(null);

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
      setShippingCourierId(courierId);
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
      setShippingCourierId(null);
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders", orderId] });
      toast({
        title: "Order Shipped!",
        description: `Successfully shipped with ${data.courierName}. AWB: ${data.awb}`,
      });
      onOpenChange(false);
    },
    onError: (error: Error) => {
      setShippingCourierId(null);
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
    return (a.total_charge || 0) - (b.total_charge || 0);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
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
                  <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg p-4 flex items-start gap-3 animate-in fade-in-50 slide-in-from-top-1" data-testid="low-rated-warning">
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
                  <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg p-4 flex items-start gap-3 animate-in fade-in-50 slide-in-from-top-1" data-testid="non-serviceable-info">
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

                {sortedCouriers.map((courier, index) => (
                  <div 
                    key={courier.courier_company_id}
                    className="animate-in fade-in-50 slide-in-from-bottom-2 overflow-visible"
                    style={{ animationDelay: `${index * 50}ms`, animationFillMode: 'backwards' }}
                  >
                    {/* Courier Card - Shiprocket Style */}
                    <div
                      className={`relative border rounded-lg bg-white dark:bg-gray-900 transition-all overflow-visible ${
                        selectedTab === 'non-serviceable' ? 'opacity-60' : 'hover:shadow-md'
                      } ${courier.is_recommended ? 'border-l-4 border-l-indigo-600 pt-6' : ''}`}
                      data-testid={`courier-option-${courier.courier_company_id}`}
                    >
                      {/* Recommended Badge */}
                      {courier.is_recommended && selectedTab !== 'non-serviceable' && (
                        <div className="absolute -top-2 left-4 z-50">
                          <Badge 
                            className="bg-indigo-600 text-white hover:bg-indigo-700 text-xs px-3 py-1 shadow-sm"
                            data-testid={`recommended-badge-${courier.courier_company_id}`}
                          >
                            ✓ Recommended
                          </Badge>
                        </div>
                      )}

                      <div className="flex items-center gap-4 p-4">
                        {/* Logo */}
                        <CourierLogo name={courier.courier_name} logoUrl={courier.courier_logo_url} />

                        {/* Courier Details */}
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-base mb-1" data-testid={`courier-name-${courier.courier_company_id}`}>
                            {courier.courier_name}
                          </h3>
                          <div className="text-sm text-muted-foreground">
                            {courier.is_surface ? "Surface" : "Air"} | Min-weight: {courier.min_weight || 0.5} Kg
                            {courier.rto_charges !== undefined && (
                              <> | RTO Charges: ₹{courier.rto_charges}</>
                            )}
                          </div>
                        </div>

                        {/* Rating Badge */}
                        {selectedTab !== 'non-serviceable' && (
                          <div className="flex-shrink-0">
                            <RatingBadge courier={courier} />
                          </div>
                        )}

                        {/* Delivery Info */}
                        {selectedTab !== 'non-serviceable' ? (
                          <>
                            <div className="flex-shrink-0 text-center min-w-[80px]">
                              <p className="text-xs text-muted-foreground mb-1">Pickup</p>
                              <p className="text-sm font-medium" data-testid={`pickup-date-${courier.courier_company_id}`}>
                                {courier.pickup_availability}
                              </p>
                            </div>

                            <div className="flex-shrink-0 text-center min-w-[100px]">
                              <p className="text-xs text-muted-foreground mb-1">ETA</p>
                              <p className="text-sm font-medium" data-testid={`delivery-date-${courier.courier_company_id}`}>
                                {courier.etd}
                              </p>
                            </div>

                            <div className="flex-shrink-0 text-center min-w-[80px]">
                              <p className="text-xs text-muted-foreground mb-1">Weight</p>
                              <p className="text-sm font-medium">
                                {orderDetails.total > 0 ? '1.414' : '0.5'} Kg
                              </p>
                            </div>

                            <div className="flex-shrink-0 text-center min-w-[100px]">
                              <p className="text-xs text-muted-foreground mb-1">Price</p>
                              <p className="text-lg font-bold" data-testid={`charge-${courier.courier_company_id}`}>
                                ₹{(courier.total_charge || 0).toFixed(2)}
                              </p>
                            </div>

                            {/* Ship Now Button - Default Theme */}
                            <div className="flex-shrink-0 ml-2">
                              <Button
                                onClick={() => handleShipNow(courier)}
                                disabled={shippingCourierId !== null}
                                className="min-w-[110px]"
                                data-testid={`button-ship-${courier.courier_company_id}`}
                              >
                                {shippingCourierId === courier.courier_company_id ? "Shipping..." : "Ship Now"}
                              </Button>
                            </div>
                          </>
                        ) : (
                          <>
                            {/* Non-serviceable display */}
                            <div className="flex-1 text-sm text-muted-foreground">
                              Rating: {courier.rating}
                            </div>
                            <Button
                              variant="outline"
                              disabled
                              className="flex-shrink-0"
                              data-testid={`button-unavailable-${courier.courier_company_id}`}
                            >
                              Unavailable
                            </Button>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Warning Banner (if applicable) */}
                    {selectedTab !== 'non-serviceable' && courier.has_warning && courier.warning_message && (
                      <div className="mt-2 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg p-3 flex items-start gap-2 animate-in fade-in-50">
                        <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                        <p className="text-sm text-amber-800 dark:text-amber-200" data-testid={`warning-${courier.courier_company_id}`}>
                          {courier.warning_message}
                        </p>
                      </div>
                    )}

                    {/* Non-serviceable reason */}
                    {selectedTab === 'non-serviceable' && courier.non_serviceable_reason && (
                      <div className="mt-2 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg p-3 animate-in fade-in-50">
                        <p className="text-xs font-medium text-red-900 dark:text-red-100 mb-1">
                          Reason for Non-Serviceability:
                        </p>
                        <p className="text-sm text-red-700 dark:text-red-300" data-testid={`non-serviceable-reason-${courier.courier_company_id}`}>
                          {courier.non_serviceable_reason}
                        </p>
                      </div>
                    )}
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
