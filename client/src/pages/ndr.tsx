import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { AlertTriangle, Calendar, ChevronLeft, ChevronRight, Package } from "lucide-react";
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
  const [address1, setAddress1] = useState("");
  const [address2, setAddress2] = useState("");
  const [phone, setPhone] = useState("");
  const [deferredDate, setDeferredDate] = useState("");
  const [notes, setNotes] = useState("");

  const reattemptMutation = useMutation({
    mutationFn: async (data: {
      awb: string;
      address1: string;
      address2?: string;
      phone: string;
      deferredDate?: string;
      actionBy: string;
      notes?: string;
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
    if (!address1 || !phone) {
      toast({
        variant: "destructive",
        title: "Missing Information",
        description: "Please provide address and phone number.",
      });
      return;
    }

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

    reattemptMutation.mutate({
      awb: ndrEvent.awb,
      address1,
      address2,
      phone,
      deferredDate,
      actionBy: userId,
      notes,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl" data-testid="dialog-reattempt-delivery">
        <DialogHeader>
          <DialogTitle>Schedule Delivery Reattempt</DialogTitle>
          <DialogDescription>
            Update delivery details and schedule a reattempt for AWB: {ndrEvent?.awb}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="address1">Address Line 1 *</Label>
            <Input
              id="address1"
              data-testid="input-address1"
              placeholder="Enter updated address"
              value={address1}
              onChange={(e) => setAddress1(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="address2">Address Line 2</Label>
            <Input
              id="address2"
              data-testid="input-address2"
              placeholder="Apartment, suite, etc. (optional)"
              value={address2}
              onChange={(e) => setAddress2(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">Phone Number *</Label>
            <Input
              id="phone"
              data-testid="input-phone"
              placeholder="Enter updated phone number"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="deferredDate">Reattempt Date (Optional)</Label>
            <Input
              id="deferredDate"
              data-testid="input-deferred-date"
              type="date"
              value={deferredDate}
              onChange={(e) => setDeferredDate(e.target.value)}
              min={new Date().toISOString().split("T")[0]}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              data-testid="textarea-notes"
              placeholder="Add any additional notes..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            data-testid="button-cancel"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={reattemptMutation.isPending}
            data-testid="button-schedule-reattempt"
          >
            {reattemptMutation.isPending ? "Scheduling..." : "Schedule Reattempt"}
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

  const { data, isLoading } = useQuery<{ events: NdrEvent[]; total: number }>({
    queryKey: ["/api/ndr"],
  });

  const ndrEvents = data?.events || [];

  // Apply filters
  const filteredEvents = useMemo(() => {
    return ndrEvents.filter((event) => {
      // Search filter (AWB)
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        if (!event.awb.toLowerCase().includes(query)) {
          return false;
        }
      }

      // Status filter
      if (statusFilter !== "all" && event.ndrStatus !== statusFilter) {
        return false;
      }

      // Action filter
      if (actionFilter === "pending" && event.actionTaken) {
        return false;
      }
      if (actionFilter === "resolved" && !event.resolved) {
        return false;
      }
      if (actionFilter === "reattempt" && !event.reattemptScheduled) {
        return false;
      }

      // Date range filter
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
  }, [ndrEvents, searchQuery, statusFilter, actionFilter, dateRange]);

  // Pagination
  const totalEvents = filteredEvents.length;
  const totalPages = Math.ceil(totalEvents / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalEvents);
  const paginatedEvents = filteredEvents.slice(startIndex, endIndex);

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

  const getActionBadge = (actionTaken?: string) => {
    if (!actionTaken) return <Badge variant="outline" data-testid="badge-action-pending">Pending</Badge>;

    const actionMap: Record<string, { label: string; variant: any }> = {
      reattempt_scheduled: { label: "Reattempt Scheduled", variant: "default" },
      customer_contacted: { label: "Customer Contacted", variant: "secondary" },
      rto_initiated: { label: "RTO Initiated", variant: "destructive" },
      resolved: { label: "Resolved", variant: "default" },
    };

    const config = actionMap[actionTaken] || { label: actionTaken, variant: "outline" };
    return <Badge variant={config.variant} data-testid={`badge-action-${actionTaken}`}>{config.label}</Badge>;
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

  return (
    <PageLayout
      title="NDR Management"
      description="Track and manage failed delivery attempts"
    >
      <div className="p-6 space-y-6" data-testid="page-ndr">
        {isLoading ? (
          <div className="space-y-4">
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
            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">Total NDR Cases</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold" data-testid="text-total-ndr">{data?.total || 0}</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">Pending Action</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold" data-testid="text-pending-action">
                    {ndrEvents.filter((e) => !e.actionTaken).length}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">Reattempt Scheduled</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold" data-testid="text-reattempt-scheduled">
                    {ndrEvents.filter((e) => e.reattemptScheduled).length}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">Resolved</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold" data-testid="text-resolved">
                    {ndrEvents.filter((e) => e.resolved).length}
                  </div>
                </CardContent>
              </Card>
            </div>

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
                {/* Summary Info */}
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    Showing {startIndex + 1}-{endIndex} of {totalEvents} case{totalEvents !== 1 ? "s" : ""}
                  </p>
                </div>

                {/* Table with Sticky Header and Footer */}
                <div className="rounded-lg border bg-card">
                  <div className="relative">
                    <Table>
                      <TableHeader className="sticky top-0 z-10 bg-card shadow-sm">
                        <TableRow>
                          <TableHead className="bg-card" data-testid="header-awb">AWB</TableHead>
                          <TableHead className="bg-card" data-testid="header-ndr-date">NDR Date</TableHead>
                          <TableHead className="bg-card" data-testid="header-status">Status</TableHead>
                          <TableHead className="bg-card" data-testid="header-reason">Reason</TableHead>
                          <TableHead className="bg-card" data-testid="header-action">Action Taken</TableHead>
                          <TableHead className="text-right bg-card" data-testid="header-actions">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {paginatedEvents.map((event) => (
                          <TableRow key={event.id} className="hover-elevate" data-testid={`row-ndr-${event.id}`}>
                            <TableCell className="font-mono text-sm" data-testid={`cell-awb-${event.id}`}>
                              {event.awb}
                            </TableCell>
                            <TableCell data-testid={`cell-date-${event.id}`}>
                              {format(new Date(event.ndrDate), "MMM dd, yyyy")}
                            </TableCell>
                            <TableCell data-testid={`cell-status-${event.id}`}>{getStatusBadge(event.ndrStatus)}</TableCell>
                            <TableCell className="max-w-xs truncate" data-testid={`cell-reason-${event.id}`}>
                              {event.ndrReason}
                            </TableCell>
                            <TableCell data-testid={`cell-action-taken-${event.id}`}>{getActionBadge(event.actionTaken)}</TableCell>
                            <TableCell className="text-right" data-testid={`cell-actions-${event.id}`}>
                              {!event.resolved && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleReattempt(event)}
                                  data-testid={`button-reattempt-${event.id}`}
                                >
                                  <Calendar className="h-4 w-4 mr-1" />
                                  Reattempt
                                </Button>
                              )}
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
                          Showing {totalEvents === 0 ? 0 : startIndex + 1}-{endIndex} of {totalEvents} cases
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
          </>
        )}
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
