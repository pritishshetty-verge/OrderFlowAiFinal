import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { CalendarIcon, Plus, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { LeaveRequest as BackendLeaveRequest, User } from "@shared/schema";

interface DisplayLeaveRequest {
  id: string;
  employeeName: string;
  type: string;
  startDate: Date;
  endDate: Date;
  reason: string;
  status: "pending" | "approved" | "rejected";
  requestedAt: Date;
  reviewedBy?: string;
}

const leaveFormSchema = z.object({
  leaveType: z.enum(["sick", "vacation", "personal", "emergency"]),
  startDate: z.date(),
  endDate: z.date(),
  reason: z.string().min(10, "Reason must be at least 10 characters"),
});

type LeaveFormValues = z.infer<typeof leaveFormSchema>;

interface LeaveRequestsProps {
  userRole: "admin" | "manager" | "agent";
}

export function LeaveRequests({ userRole }: LeaveRequestsProps) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const currentUserId = localStorage.getItem("userId");

  // Fetch leave requests and users
  const { data: backendRequests, isLoading: requestsLoading } = useQuery<BackendLeaveRequest[]>({
    queryKey: ["/api/leave-requests"],
  });

  const { data: users, isLoading: usersLoading } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });

  const isLoading = requestsLoading || usersLoading;

  // Transform backend requests to display format
  const requests = useMemo<DisplayLeaveRequest[]>(() => {
    if (!backendRequests || !users) return [];

    return backendRequests.map((req) => {
      const employee = users.find((u) => u.id === req.userId);
      const reviewer = req.reviewedBy ? users.find((u) => u.id === req.reviewedBy) : undefined;

      return {
        id: req.id,
        employeeName: employee?.fullName || "Unknown User",
        type: req.leaveType,
        startDate: new Date(req.startDate),
        endDate: new Date(req.endDate),
        reason: req.reason,
        status: req.status as "pending" | "approved" | "rejected",
        requestedAt: new Date(req.createdAt),
        reviewedBy: reviewer?.fullName,
      };
    });
  }, [backendRequests, users]);

  const form = useForm<LeaveFormValues>({
    resolver: zodResolver(leaveFormSchema),
    defaultValues: {
      leaveType: "vacation",
      reason: "",
    },
  });

  // Create leave request mutation
  const createMutation = useMutation({
    mutationFn: async (data: LeaveFormValues) => {
      return apiRequest("POST", "/api/leave-requests", {
        userId: currentUserId,
        leaveType: data.leaveType,
        startDate: data.startDate.toISOString(),
        endDate: data.endDate.toISOString(),
        reason: data.reason,
        status: "pending",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leave-requests"] });
      toast({
        title: "Leave Request Submitted",
        description: "Your request has been sent for approval.",
      });
      setOpen(false);
      form.reset();
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to submit leave request. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Approve leave request mutation
  const approveMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("PATCH", `/api/leave-requests/${id}`, {
        status: "approved",
        reviewedBy: currentUserId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leave-requests"] });
      toast({
        title: "Request Approved",
        description: "Leave request has been approved.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to approve request. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Reject leave request mutation
  const rejectMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("PATCH", `/api/leave-requests/${id}`, {
        status: "rejected",
        reviewedBy: currentUserId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leave-requests"] });
      toast({
        title: "Request Rejected",
        description: "Leave request has been rejected.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to reject request. Please try again.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: LeaveFormValues) => {
    createMutation.mutate(data);
  };

  const handleApprove = (id: string) => {
    approveMutation.mutate(id);
  };

  const handleReject = (id: string) => {
    rejectMutation.mutate(id);
  };

  const getStatusVariant = (status: DisplayLeaveRequest["status"]) => {
    switch (status) {
      case "approved":
        return "default";
      case "rejected":
        return "destructive";
      case "pending":
        return "secondary";
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case "sick":
        return "text-red-600";
      case "vacation":
        return "text-blue-600";
      case "personal":
        return "text-purple-600";
      case "emergency":
        return "text-orange-600";
      default:
        return "text-gray-600";
    }
  };

  const canManageRequests = userRole === "admin" || userRole === "manager";

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-10 w-64" data-testid="skeleton-title" />
          <Skeleton className="h-10 w-32" data-testid="skeleton-button" />
        </div>
        <div className="grid gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-40" data-testid={`skeleton-request-${i}`} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Leave Requests</h2>
          <p className="text-muted-foreground">
            {requests.filter((r) => r.status === "pending").length} pending requests
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-new-leave-request">
              <Plus className="h-4 w-4 mr-2" />
              New Request
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Submit Leave Request</DialogTitle>
              <DialogDescription>
                Fill out the form below to request time off
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="leaveType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Leave Type</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-leave-type">
                            <SelectValue placeholder="Select leave type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="sick">Sick Leave</SelectItem>
                          <SelectItem value="vacation">Vacation</SelectItem>
                          <SelectItem value="personal">Personal Leave</SelectItem>
                          <SelectItem value="emergency">Emergency</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="startDate"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel>Start Date</FormLabel>
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant="outline"
                                className={cn(
                                  "pl-3 text-left font-normal",
                                  !field.value && "text-muted-foreground"
                                )}
                                data-testid="button-start-date"
                              >
                                {field.value ? (
                                  format(field.value, "PPP")
                                ) : (
                                  <span>Pick a date</span>
                                )}
                                <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={field.value}
                              onSelect={field.onChange}
                              disabled={(date) =>
                                date < new Date(new Date().setHours(0, 0, 0, 0))
                              }
                              initialFocus
                            />
                          </PopoverContent>
                        </Popover>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="endDate"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel>End Date</FormLabel>
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant="outline"
                                className={cn(
                                  "pl-3 text-left font-normal",
                                  !field.value && "text-muted-foreground"
                                )}
                                data-testid="button-end-date"
                              >
                                {field.value ? (
                                  format(field.value, "PPP")
                                ) : (
                                  <span>Pick a date</span>
                                )}
                                <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={field.value}
                              onSelect={field.onChange}
                              disabled={(date) =>
                                date < new Date(new Date().setHours(0, 0, 0, 0))
                              }
                              initialFocus
                            />
                          </PopoverContent>
                        </Popover>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="reason"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Reason</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Please provide a brief reason for your leave request..."
                          {...field}
                          data-testid="textarea-reason"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setOpen(false)}
                    data-testid="button-cancel-request"
                  >
                    Cancel
                  </Button>
                  <Button 
                    type="submit" 
                    disabled={createMutation.isPending}
                    data-testid="button-submit-request"
                  >
                    {createMutation.isPending ? "Submitting..." : "Submit Request"}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4">
        {requests.map((request) => (
          <Card key={request.id} data-testid={`card-leave-${request.id}`}>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-base">{request.employeeName}</CardTitle>
                    <Badge variant={getStatusVariant(request.status)} className="capitalize">
                      {request.status}
                    </Badge>
                  </div>
                  <CardDescription className={cn("capitalize", getTypeColor(request.type))}>
                    {request.type} Leave
                  </CardDescription>
                </div>
                {canManageRequests && request.status === "pending" && (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleApprove(request.id)}
                      disabled={approveMutation.isPending}
                      data-testid={`button-approve-${request.id}`}
                    >
                      <Check className="h-4 w-4 mr-1" />
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleReject(request.id)}
                      disabled={rejectMutation.isPending}
                      data-testid={`button-reject-${request.id}`}
                    >
                      <X className="h-4 w-4 mr-1" />
                      Reject
                    </Button>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-6 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs mb-1">Duration</p>
                  <p className="font-medium">
                    {format(request.startDate, "MMM dd")} - {format(request.endDate, "MMM dd, yyyy")}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs mb-1">Requested</p>
                  <p className="font-medium">{format(request.requestedAt, "MMM dd, yyyy")}</p>
                </div>
                {request.reviewedBy && (
                  <div>
                    <p className="text-muted-foreground text-xs mb-1">Reviewed By</p>
                    <p className="font-medium">{request.reviewedBy}</p>
                  </div>
                )}
              </div>
              <div>
                <p className="text-muted-foreground text-xs mb-1">Reason</p>
                <p className="text-sm">{request.reason}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
