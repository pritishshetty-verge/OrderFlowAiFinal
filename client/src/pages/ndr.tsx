import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Package, AlertTriangle, MapPin, Phone, Calendar } from "lucide-react";
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
      const response = await fetch(`/api/shiprocket/ndr/${data.awb}/reattempt`, {
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
      queryClient.invalidateQueries({ queryKey: ["/api/shiprocket/ndr"] });
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
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data, isLoading } = useQuery<{ events: NdrEvent[]; total: number }>({
    queryKey: ["/api/shiprocket/ndr"],
  });

  const ndrEvents = data?.events || [];

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

  return (
    <div className="container mx-auto p-6 space-y-6" data-testid="page-ndr">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2" data-testid="heading-ndr">
            <AlertTriangle className="h-8 w-8 text-destructive" />
            NDR Management
          </h1>
          <p className="text-muted-foreground mt-1" data-testid="text-description">
            Track and manage failed delivery attempts
          </p>
        </div>
      </div>

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

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle data-testid="heading-ndr-cases">NDR Cases</CardTitle>
              <CardDescription>All failed delivery attempts requiring action</CardDescription>
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[200px]" data-testid="select-status-filter">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" data-testid="option-all">All Statuses</SelectItem>
                <SelectItem value="customer_unavailable" data-testid="option-customer-unavailable">Customer Unavailable</SelectItem>
                <SelectItem value="address_issue" data-testid="option-address-issue">Address Issue</SelectItem>
                <SelectItem value="refused" data-testid="option-refused">Refused</SelectItem>
                <SelectItem value="other" data-testid="option-other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground" data-testid="text-loading">
              Loading NDR cases...
            </div>
          ) : ndrEvents.length === 0 ? (
            <div className="text-center py-8" data-testid="text-no-ndr">
              <Package className="h-12 w-12 mx-auto text-muted-foreground mb-2" />
              <p className="text-muted-foreground">No NDR cases found</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead data-testid="header-awb">AWB</TableHead>
                  <TableHead data-testid="header-ndr-date">NDR Date</TableHead>
                  <TableHead data-testid="header-status">Status</TableHead>
                  <TableHead data-testid="header-reason">Reason</TableHead>
                  <TableHead data-testid="header-action">Action Taken</TableHead>
                  <TableHead data-testid="header-actions">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ndrEvents
                  .filter((event) => statusFilter === "all" || event.ndrStatus === statusFilter)
                  .map((event) => (
                    <TableRow key={event.id} data-testid={`row-ndr-${event.id}`}>
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
                      <TableCell data-testid={`cell-actions-${event.id}`}>
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
          )}
        </CardContent>
      </Card>

      <ReattemptDeliveryModal
        open={reattemptModalOpen}
        onOpenChange={setReattemptModalOpen}
        ndrEvent={selectedNdrEvent}
        onSuccess={() => setSelectedNdrEvent(null)}
      />
    </div>
  );
}
