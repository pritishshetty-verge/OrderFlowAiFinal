import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { AlertTriangle, Calendar, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Package, Phone, RotateCcw, Truck } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { PageLayout } from "@/components/page-layout";
import { NdrFilter } from "@/components/ndr-filter";
import { Skeleton } from "@/components/ui/skeleton";

interface NdrEvent {
  id: string;
  shipmentId: string;
  orderId: string;
  awb: string;
  ndrStatus: string;
  ndrReason: string;
  ndrDate: string;
  actionTaken?: string;
  actionBy?: string;
  actionNotes?: string;
  actionAt?: string;
  reattemptScheduled: boolean;
  reattemptDate?: string;
  updatedPhone?: string;
  updatedAddress?: {
    address1: string;
    address2?: string;
  };
  resolved: boolean;
  resolvedAt?: string;
  resolution?: string;
  createdAt: string;
  // Enhanced fields from order-level NDR data
  nslCode?: string | null;
  failureReason?: string | null;
  lastFailedAt?: string | null;
  shopifyOrderNumber?: string;
  customerName?: string;
  customerPhone?: string;
}

// Delhivery NSL codes that are ACTIONABLE (customer can fix the issue)
// These codes indicate issues that can be resolved with customer contact/info update
const ACTIONABLE_CODES: string[] = [
  'EOD-74',  // Customer unavailable - can reschedule
  'EOD-3',   // Customer unavailable - can reschedule  
  'EOD-15',  // Address issue - can update address
  'EOD-16',  // Address issue - can update address
  'EOD-104', // Address incomplete - can provide correct address
  'EOD-11',  // Refused delivery - can re-confirm with customer
  'EOD-43',  // Refused - can clarify with customer
];

// Non-actionable codes (informational only, cannot fix via customer contact)
const NON_ACTIONABLE_CODES: string[] = [
  'EOD-6',   // Out of delivery area - courier limitation
  'ST-108',  // System/internal issue
  'EOD-86',  // Weather/external factor
  'EOD-69',  // Holiday/closure
];

// Helper to check if an NSL code is actionable
// Missing or unknown codes default to NON-ACTIONABLE for safety
// Only explicitly listed ACTIONABLE_CODES can trigger reattempt actions
function isActionableCode(nslCode: string | null | undefined): boolean {
  if (!nslCode) return false; // Default to non-actionable if no code (safer)
  return ACTIONABLE_CODES.includes(nslCode);
}

// Get friendly label for NSL code
function getNslCodeLabel(nslCode: string | null | undefined): string {
  if (!nslCode) return 'Unknown';
  const labels: Record<string, string> = {
    'EOD-74': 'Customer Unavailable',
    'EOD-3': 'Customer Not Reachable',
    'EOD-15': 'Wrong Address',
    'EOD-16': 'Incomplete Address',
    'EOD-104': 'Address Not Found',
    'EOD-11': 'Delivery Refused',
    'EOD-43': 'Customer Refused',
    'EOD-6': 'Out of Delivery Area',
    'ST-108': 'System Issue',
    'EOD-86': 'Weather Delay',
    'EOD-69': 'Holiday/Closure',
  };
  return labels[nslCode] || nslCode;
}

interface OfdOrder {
  id: string;
  shopifyOrderNumber: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  shippingAddress: any;
  trackingNumber: string;
  trackingUrl: string;
  courierName: string;
  shipmentStatus: string;
  status: string;
  assignedTo: string;
  createdAt: string;
}

function ReattemptDeliveryModal({
  open,
  onOpenChange,
  ndrEvent,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ndrEvent: NdrEvent | null;
  onSuccess: () => void;
}) {
  const { toast } = useToast();
  const [showEditDetails, setShowEditDetails] = useState(false);
  const [address1, setAddress1] = useState("");
  const [address2, setAddress2] = useState("");
  const [phone, setPhone] = useState("");
  const [deferredDate, setDeferredDate] = useState("");

  const reattemptMutation = useMutation({
    mutationFn: async (data: {
      awb: string;
      address1?: string;
      address2?: string;
      phone?: string;
      deferredDate?: string;
      actionBy: string;
    }) => {
      const response = await fetch(`/api/ndr/${data.awb}/reattempt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to schedule reattempt");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ndr"] });
      toast({
        title: "Reattempt Scheduled",
        description: "Delivery reattempt has been scheduled successfully.",
      });
      onSuccess();
      onOpenChange(false);
      setShowEditDetails(false);
      setAddress1("");
      setAddress2("");
      setPhone("");
      setDeferredDate("");
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
    if (!ndrEvent) return;

    const userId = localStorage.getItem("userId");
    if (!userId) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "User not authenticated",
      });
      return;
    }

    const payload: any = {
      awb: ndrEvent.awb,
      actionBy: userId,
    };

    if (deferredDate) payload.deferredDate = deferredDate;
    if (showEditDetails) {
      if (address1) payload.address1 = address1;
      if (address2) payload.address2 = address2;
      if (phone) payload.phone = phone;
    }

    reattemptMutation.mutate(payload);
  };

  const handleClose = () => {
    onOpenChange(false);
    setShowEditDetails(false);
    setAddress1("");
    setAddress2("");
    setPhone("");
    setDeferredDate("");
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md" data-testid="dialog-reattempt-delivery">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RotateCcw className="h-5 w-5" />
            Reattempt Delivery
          </DialogTitle>
          <DialogDescription>
            AWB: <span className="font-mono">{ndrEvent?.awb}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="p-4 rounded-lg bg-muted/50">
            <p className="text-sm text-muted-foreground mb-1">NDR Reason:</p>
            <p className="font-medium">{ndrEvent?.ndrReason}</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="deferredDate">Schedule Date (Optional)</Label>
            <Input
              id="deferredDate"
              data-testid="input-deferred-date"
              type="date"
              value={deferredDate}
              onChange={(e) => setDeferredDate(e.target.value)}
              min={new Date().toISOString().split("T")[0]}
            />
            <p className="text-xs text-muted-foreground">Leave empty for next available slot</p>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowEditDetails(!showEditDetails)}
            className="w-full justify-between"
            data-testid="button-toggle-edit-details"
          >
            <span>Edit Address/Phone</span>
            {showEditDetails ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>

          {showEditDetails && (
            <div className="space-y-3 pt-2 border-t">
              <div className="space-y-2">
                <Label htmlFor="address1">Address Line 1</Label>
                <Input
                  id="address1"
                  data-testid="input-address1"
                  placeholder="Updated address (optional)"
                  value={address1}
                  onChange={(e) => setAddress1(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="address2">Address Line 2</Label>
                <Input
                  id="address2"
                  data-testid="input-address2"
                  placeholder="Apartment, suite, etc."
                  value={address2}
                  onChange={(e) => setAddress2(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">Phone Number</Label>
                <Input
                  id="phone"
                  data-testid="input-phone"
                  placeholder="Updated phone (optional)"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={handleClose}
            data-testid="button-cancel"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={reattemptMutation.isPending}
            data-testid="button-confirm-reattempt"
          >
            {reattemptMutation.isPending ? "Scheduling..." : "Confirm Reattempt"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function NDRPage() {
  const [selectedNdrEvent, setSelectedNdrEvent] = useState<NdrEvent | null>(null);
  const [reattemptModalOpen, setReattemptModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [dateRange, setDateRange] = useState<{ from?: Date; to?: Date }>({});
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [activeTab, setActiveTab] = useState<string>("ndr");
  const { toast } = useToast();
  
  // SECURITY: Get current user ID from localStorage for authorization
  const localStorageUserId = localStorage.getItem("userId");

  // Fetch NDR events - pass currentUserId for authorization
  const { data: ndrData, isLoading: ndrLoading } = useQuery<{ events: NdrEvent[]; total: number }>({
    queryKey: ["/api/ndr", { currentUserId: localStorageUserId }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (localStorageUserId) params.set("currentUserId", localStorageUserId);
      const response = await fetch(`/api/ndr?${params}`);
      if (!response.ok) throw new Error("Failed to fetch NDR events");
      return response.json();
    },
    enabled: !!localStorageUserId,
  });

  // Fetch OFD orders - pass currentUserId for authorization
  const { data: ofdData, isLoading: ofdLoading } = useQuery<{ orders: OfdOrder[]; total: number }>({
    queryKey: ["/api/orders/ofd", { currentUserId: localStorageUserId }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (localStorageUserId) params.set("currentUserId", localStorageUserId);
      const response = await fetch(`/api/orders/ofd?${params}`);
      if (!response.ok) throw new Error("Failed to fetch OFD orders");
      return response.json();
    },
    enabled: !!localStorageUserId,
  });

  const ndrEvents = ndrData?.events || [];
  const ofdOrders = ofdData?.orders || [];

  // Calculate attempt counts per AWB
  const attemptCountByAwb = useMemo(() => {
    const counts: Record<string, number> = {};
    ndrEvents.forEach(event => {
      counts[event.awb] = (counts[event.awb] || 0) + 1;
    });
    return counts;
  }, [ndrEvents]);

  // Deduplicate NDR events by AWB - show only latest event per AWB
  const deduplicatedEvents = useMemo(() => {
    const latestByAwb = new Map<string, NdrEvent>();
    
    // Sort by date descending so we keep the most recent
    const sortedEvents = [...ndrEvents].sort((a, b) => 
      new Date(b.ndrDate).getTime() - new Date(a.ndrDate).getTime()
    );
    
    sortedEvents.forEach(event => {
      if (!latestByAwb.has(event.awb)) {
        latestByAwb.set(event.awb, event);
      }
    });
    
    return Array.from(latestByAwb.values());
  }, [ndrEvents]);

  // Apply filters for NDR (on deduplicated events)
  const filteredEvents = useMemo(() => {
    return deduplicatedEvents.filter((event) => {
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        if (!event.awb.toLowerCase().includes(query)) {
          return false;
        }
      }

      if (statusFilter !== "all" && event.ndrStatus !== statusFilter) {
        return false;
      }

      if (actionFilter === "pending" && event.actionTaken) {
        return false;
      }
      if (actionFilter === "resolved" && !event.resolved) {
        return false;
      }
      if (actionFilter === "reattempt" && !event.reattemptScheduled) {
        return false;
      }

      if (dateRange.from && event.ndrDate) {
        const ndrDate = new Date(event.ndrDate);
        if (ndrDate < dateRange.from) return false;
      }
      if (dateRange.to && event.ndrDate) {
        const ndrDate = new Date(event.ndrDate);
        const toDate = new Date(dateRange.to);
        toDate.setHours(23, 59, 59, 999);
        if (ndrDate > toDate) return false;
      }

      return true;
    });
  }, [deduplicatedEvents, searchQuery, statusFilter, actionFilter, dateRange]);

  // Apply filters for OFD
  const filteredOfdOrders = useMemo(() => {
    return ofdOrders.filter((order) => {
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesName = order.customerName?.toLowerCase().includes(query);
        const matchesPhone = order.customerPhone?.toLowerCase().includes(query);
        const matchesAwb = order.trackingNumber?.toLowerCase().includes(query);
        const matchesOrder = order.shopifyOrderNumber?.toLowerCase().includes(query);
        if (!matchesName && !matchesPhone && !matchesAwb && !matchesOrder) {
          return false;
        }
      }
      return true;
    });
  }, [ofdOrders, searchQuery]);

  // Pagination for active tab
  const activeData = activeTab === "ndr" ? filteredEvents : filteredOfdOrders;
  const totalItems = activeData.length;
  const totalPages = Math.ceil(totalItems / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalItems);
  const paginatedNdrEvents = filteredEvents.slice(startIndex, endIndex);
  const paginatedOfdOrders = filteredOfdOrders.slice(startIndex, endIndex);

  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, { label: string; variant: any }> = {
      customer_unavailable: { label: "Customer Unavailable", variant: "secondary" },
      address_issue: { label: "Address Issue", variant: "destructive" },
      refused: { label: "Refused", variant: "destructive" },
      other: { label: "Other", variant: "secondary" },
    };

    const config = statusMap[status] || statusMap.other;
    return <Badge variant={config.variant} data-testid={`badge-status-${status}`}>{config.label}</Badge>;
  };

  const handleReattempt = (event: NdrEvent) => {
    setSelectedNdrEvent(event);
    setReattemptModalOpen(true);
  };

  const handleClearFilters = () => {
    setSearchQuery("");
    setDateRange({});
    setStatusFilter("all");
    setActionFilter("all");
  };

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    setCurrentPage(1);
    setSearchQuery("");
  };

  const handleCallNow = (order: OfdOrder) => {
    if (!order.customerPhone) {
      toast({
        variant: "destructive",
        title: "No Phone Number",
        description: "Customer phone number is not available.",
      });
      return;
    }
    
    // Trigger click-to-call or open phone dialer
    window.location.href = `tel:${order.customerPhone}`;
    toast({
      title: "Initiating Call",
      description: `Calling ${order.customerName} at ${order.customerPhone}`,
    });
  };

  const isLoading = activeTab === "ndr" ? ndrLoading : ofdLoading;

  // Dynamic KPI stats based on active tab
  const getKpiStats = () => {
    if (activeTab === "ndr") {
      return {
        totalLabel: "Total NDR Cases",
        totalValue: ndrData?.total || 0,
        pendingLabel: "Pending Action",
        pendingValue: ndrEvents.filter((e) => !e.actionTaken).length,
        scheduledLabel: "Reattempt Scheduled",
        scheduledValue: ndrEvents.filter((e) => e.reattemptScheduled).length,
        resolvedLabel: "Resolved",
        resolvedValue: ndrEvents.filter((e) => e.resolved).length,
      };
    } else {
      return {
        totalLabel: "Out for Delivery",
        totalValue: ofdData?.total || 0,
        pendingLabel: "Awaiting Confirmation",
        pendingValue: ofdOrders.length,
        scheduledLabel: "With Phone",
        scheduledValue: ofdOrders.filter((o) => o.customerPhone).length,
        resolvedLabel: "COD Orders",
        resolvedValue: 0, // We don't have payment method in OFD data
      };
    }
  };

  const kpiStats = getKpiStats();

  return (
    <PageLayout
      title="NDR Management"
      description="Track and manage deliveries"
    >
      <div className="p-6 space-y-6" data-testid="page-ndr">
        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
          <TabsList className="grid w-full max-w-md grid-cols-2" data-testid="tabs-ndr-ofd">
            <TabsTrigger value="ndr" data-testid="tab-ndr-cases">
              <AlertTriangle className="h-4 w-4 mr-2" />
              NDR Cases
            </TabsTrigger>
            <TabsTrigger value="ofd" data-testid="tab-ofd">
              <Truck className="h-4 w-4 mr-2" />
              Out for Delivery
            </TabsTrigger>
          </TabsList>

          {isLoading ? (
            <div className="space-y-4 mt-6">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {[...Array(4)].map((_, i) => (
                  <Skeleton key={i} className="h-24 w-full" />
                ))}
              </div>
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-96 w-full" />
            </div>
          ) : (
            <>
              {/* Stats Cards - Dynamic based on tab */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-6">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium">{kpiStats.totalLabel}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold" data-testid="text-total-kpi">{kpiStats.totalValue}</div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium">{kpiStats.pendingLabel}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold" data-testid="text-pending-kpi">
                      {kpiStats.pendingValue}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium">{kpiStats.scheduledLabel}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold" data-testid="text-scheduled-kpi">
                      {kpiStats.scheduledValue}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium">{kpiStats.resolvedLabel}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold" data-testid="text-resolved-kpi">
                      {kpiStats.resolvedValue}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* NDR Tab Content */}
              <TabsContent value="ndr" className="mt-0">
                {/* Filters */}
                <NdrFilter
                  searchQuery={searchQuery}
                  onSearchChange={setSearchQuery}
                  dateRange={dateRange}
                  onDateRangeChange={setDateRange}
                  statusFilter={statusFilter}
                  onStatusFilterChange={setStatusFilter}
                  actionFilter={actionFilter}
                  onActionFilterChange={setActionFilter}
                  onClearFilters={handleClearFilters}
                />

                {/* NDR Table */}
                {filteredEvents.length === 0 ? (
                  <Card>
                    <CardContent className="flex flex-col items-center justify-center py-12">
                      <Package className="h-12 w-12 text-muted-foreground mb-4" />
                      <p className="text-lg font-medium">No NDR cases found</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        {ndrEvents.length === 0
                          ? "NDR cases will appear here"
                          : "No cases match your filters"}
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-muted-foreground">
                        Showing {startIndex + 1}-{endIndex} of {totalItems} case{totalItems !== 1 ? "s" : ""}
                      </p>
                    </div>

                    <div className="rounded-lg border bg-card">
                      <div className="relative">
                        <Table>
                          <TableHeader className="sticky top-0 z-10 bg-card shadow-sm">
                            <TableRow>
                              <TableHead className="bg-card" data-testid="header-awb">AWB</TableHead>
                              <TableHead className="bg-card" data-testid="header-ndr-date">Last Update</TableHead>
                              <TableHead className="bg-card" data-testid="header-reason">NDR Reason</TableHead>
                              <TableHead className="bg-card text-center" data-testid="header-attempts">Attempts</TableHead>
                              <TableHead className="text-right bg-card" data-testid="header-actions">Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {paginatedNdrEvents.map((event) => (
                              <TableRow key={event.id} className="hover-elevate" data-testid={`row-ndr-${event.id}`}>
                                <TableCell className="font-mono text-sm" data-testid={`cell-awb-${event.id}`}>
                                  {event.awb}
                                </TableCell>
                                <TableCell data-testid={`cell-date-${event.id}`}>
                                  <div className="flex flex-col">
                                    <span>{format(new Date(event.ndrDate), "MMM dd, yyyy")}</span>
                                    <span className="text-xs text-muted-foreground">{format(new Date(event.ndrDate), "h:mm a")}</span>
                                  </div>
                                </TableCell>
                                <TableCell className="max-w-md" data-testid={`cell-reason-${event.id}`}>
                                  <div className="flex flex-col gap-1">
                                    {event.nslCode && (
                                      <Badge 
                                        variant={isActionableCode(event.nslCode) ? "default" : "secondary"}
                                        className="w-fit text-xs"
                                        data-testid={`badge-nsl-${event.id}`}
                                      >
                                        {getNslCodeLabel(event.nslCode)}
                                      </Badge>
                                    )}
                                    <span className="line-clamp-2 text-sm text-muted-foreground">
                                      {event.failureReason || event.ndrReason}
                                    </span>
                                  </div>
                                </TableCell>
                                <TableCell className="text-center" data-testid={`cell-attempts-${event.id}`}>
                                  <Badge variant="secondary">{attemptCountByAwb[event.awb] || 1}</Badge>
                                </TableCell>
                                <TableCell className="text-right" data-testid={`cell-actions-${event.id}`}>
                                  <div className="flex items-center justify-end gap-2">
                                    {!event.resolved && (
                                      isActionableCode(event.nslCode) ? (
                                        <Button
                                          size="sm"
                                          onClick={() => handleReattempt(event)}
                                          data-testid={`button-reattempt-${event.id}`}
                                        >
                                          <RotateCcw className="h-4 w-4 mr-1" />
                                          Reattempt
                                        </Button>
                                      ) : (
                                        <Badge 
                                          variant="outline" 
                                          className="text-muted-foreground"
                                          data-testid={`badge-non-actionable-${event.id}`}
                                        >
                                          Non-Actionable
                                        </Badge>
                                      )
                                    )}
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>

                      {/* Pagination Footer */}
                      <div className="sticky bottom-0 bg-card border-t p-4 z-10">
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-muted-foreground">
                              Showing {totalItems === 0 ? 0 : startIndex + 1}-{endIndex} of {totalItems} cases
                            </span>
                          </div>

                          <div className="flex items-center gap-4">
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-muted-foreground">Rows per page:</span>
                              <Select value={String(pageSize)} onValueChange={(value) => {
                                setPageSize(Number(value));
                                setCurrentPage(1);
                              }}>
                                <SelectTrigger className="w-[80px]" data-testid="select-page-size">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="10">10</SelectItem>
                                  <SelectItem value="25">25</SelectItem>
                                  <SelectItem value="50">50</SelectItem>
                                  <SelectItem value="100">100</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>

                            <div className="flex items-center gap-1">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                                disabled={currentPage === 1}
                                data-testid="button-prev-page"
                              >
                                <ChevronLeft className="h-4 w-4" />
                                Previous
                              </Button>
                              <span className="text-sm text-muted-foreground px-4">
                                Page {currentPage} of {totalPages || 1}
                              </span>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                                disabled={currentPage >= totalPages}
                                data-testid="button-next-page"
                              >
                                Next
                                <ChevronRight className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </TabsContent>

              {/* OFD Tab Content */}
              <TabsContent value="ofd" className="mt-0">
                {/* Search for OFD */}
                <div className="flex items-center gap-4 mb-4">
                  <Input
                    placeholder="Search by name, phone, AWB, or order..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="max-w-sm"
                    data-testid="input-ofd-search"
                  />
                </div>

                {/* OFD Table */}
                {filteredOfdOrders.length === 0 ? (
                  <Card>
                    <CardContent className="flex flex-col items-center justify-center py-12">
                      <Truck className="h-12 w-12 text-muted-foreground mb-4" />
                      <p className="text-lg font-medium">No deliveries out for delivery</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        Orders with OFD status will appear here
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-muted-foreground">
                        Showing {startIndex + 1}-{Math.min(endIndex, filteredOfdOrders.length)} of {filteredOfdOrders.length} order{filteredOfdOrders.length !== 1 ? "s" : ""}
                      </p>
                    </div>

                    <div className="rounded-lg border bg-card">
                      <div className="relative">
                        <Table>
                          <TableHeader className="sticky top-0 z-10 bg-card shadow-sm">
                            <TableRow>
                              <TableHead className="bg-card" data-testid="header-ofd-customer">Customer</TableHead>
                              <TableHead className="bg-card" data-testid="header-ofd-phone">Phone</TableHead>
                              <TableHead className="bg-card" data-testid="header-ofd-awb">AWB</TableHead>
                              <TableHead className="bg-card" data-testid="header-ofd-status">Status</TableHead>
                              <TableHead className="text-right bg-card" data-testid="header-ofd-actions">Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {paginatedOfdOrders.map((order) => (
                              <TableRow key={order.id} className="hover-elevate" data-testid={`row-ofd-${order.id}`}>
                                <TableCell data-testid={`cell-ofd-customer-${order.id}`}>
                                  <div className="flex flex-col">
                                    <span className="font-medium">{order.customerName}</span>
                                    <span className="text-xs text-muted-foreground">#{order.shopifyOrderNumber}</span>
                                  </div>
                                </TableCell>
                                <TableCell className="font-mono text-sm" data-testid={`cell-ofd-phone-${order.id}`}>
                                  {order.customerPhone || "-"}
                                </TableCell>
                                <TableCell className="font-mono text-sm" data-testid={`cell-ofd-awb-${order.id}`}>
                                  {order.trackingNumber || "-"}
                                </TableCell>
                                <TableCell data-testid={`cell-ofd-status-${order.id}`}>
                                  <Badge variant="default">
                                    {order.shipmentStatus || "Out for Delivery"}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-right" data-testid={`cell-ofd-actions-${order.id}`}>
                                  <Button
                                    size="sm"
                                    onClick={() => handleCallNow(order)}
                                    disabled={!order.customerPhone}
                                    data-testid={`button-call-now-${order.id}`}
                                  >
                                    <Phone className="h-4 w-4 mr-1" />
                                    Call Now
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>

                      {/* Pagination Footer */}
                      <div className="sticky bottom-0 bg-card border-t p-4 z-10">
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-muted-foreground">
                              Showing {filteredOfdOrders.length === 0 ? 0 : startIndex + 1}-{Math.min(endIndex, filteredOfdOrders.length)} of {filteredOfdOrders.length} orders
                            </span>
                          </div>

                          <div className="flex items-center gap-4">
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-muted-foreground">Rows per page:</span>
                              <Select value={String(pageSize)} onValueChange={(value) => {
                                setPageSize(Number(value));
                                setCurrentPage(1);
                              }}>
                                <SelectTrigger className="w-[80px]" data-testid="select-ofd-page-size">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="10">10</SelectItem>
                                  <SelectItem value="25">25</SelectItem>
                                  <SelectItem value="50">50</SelectItem>
                                  <SelectItem value="100">100</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>

                            <div className="flex items-center gap-1">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                                disabled={currentPage === 1}
                                data-testid="button-ofd-prev-page"
                              >
                                <ChevronLeft className="h-4 w-4" />
                                Previous
                              </Button>
                              <span className="text-sm text-muted-foreground px-4">
                                Page {currentPage} of {Math.ceil(filteredOfdOrders.length / pageSize) || 1}
                              </span>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setCurrentPage((p) => Math.min(Math.ceil(filteredOfdOrders.length / pageSize), p + 1))}
                                disabled={currentPage >= Math.ceil(filteredOfdOrders.length / pageSize)}
                                data-testid="button-ofd-next-page"
                              >
                                Next
                                <ChevronRight className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </TabsContent>
            </>
          )}
        </Tabs>
      </div>

      <ReattemptDeliveryModal
        open={reattemptModalOpen}
        onOpenChange={setReattemptModalOpen}
        ndrEvent={selectedNdrEvent}
        onSuccess={() => setSelectedNdrEvent(null)}
      />
    </PageLayout>
  );
}
