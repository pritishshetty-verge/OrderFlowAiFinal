import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

interface LeaveRequest {
  id: string;
  employeeName: string;
  type: "sick" | "vacation" | "personal" | "emergency";
  startDate: Date;
  endDate: Date;
  reason: string;
  status: "pending" | "approved" | "rejected";
  requestedAt: Date;
  reviewedBy?: string;
}

//todo: remove mock functionality
const mockLeaveRequests: LeaveRequest[] = [
  {
    id: "1",
    employeeName: "Priya Sharma",
    type: "vacation",
    startDate: new Date(2025, 9, 25),
    endDate: new Date(2025, 9, 27),
    reason: "Family wedding in Delhi",
    status: "pending",
    requestedAt: new Date(2025, 9, 20),
  },
  {
    id: "2",
    employeeName: "Amit Singh",
    type: "sick",
    startDate: new Date(2025, 9, 22),
    endDate: new Date(2025, 9, 22),
    reason: "Fever and cold",
    status: "approved",
    requestedAt: new Date(2025, 9, 21),
    reviewedBy: "Rahul Verma",
  },
  {
    id: "3",
    employeeName: "Sneha Patel",
    type: "personal",
    startDate: new Date(2025, 9, 28),
    endDate: new Date(2025, 9, 30),
    reason: "Personal work",
    status: "rejected",
    requestedAt: new Date(2025, 9, 19),
    reviewedBy: "Rahul Verma",
  },
];

const leaveFormSchema = z.object({
  type: z.enum(["sick", "vacation", "personal", "emergency"]),
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
  const [requests, setRequests] = useState(mockLeaveRequests);
  const { toast } = useToast();

  const form = useForm<LeaveFormValues>({
    resolver: zodResolver(leaveFormSchema),
    defaultValues: {
      type: "vacation",
      reason: "",
    },
  });

  const onSubmit = (data: LeaveFormValues) => {
    console.log("Leave request submitted:", data);
    toast({
      title: "Leave Request Submitted",
      description: "Your request has been sent for approval.",
    });
    setOpen(false);
    form.reset();
  };

  const handleApprove = (id: string) => {
    setRequests((prev) =>
      prev.map((req) =>
        req.id === id ? { ...req, status: "approved" as const, reviewedBy: "Current User" } : req
      )
    );
    toast({
      title: "Request Approved",
      description: "Leave request has been approved.",
    });
  };

  const handleReject = (id: string) => {
    setRequests((prev) =>
      prev.map((req) =>
        req.id === id ? { ...req, status: "rejected" as const, reviewedBy: "Current User" } : req
      )
    );
    toast({
      title: "Request Rejected",
      description: "Leave request has been rejected.",
    });
  };

  const getStatusVariant = (status: LeaveRequest["status"]) => {
    switch (status) {
      case "approved":
        return "default";
      case "rejected":
        return "destructive";
      case "pending":
        return "secondary";
    }
  };

  const getTypeColor = (type: LeaveRequest["type"]) => {
    switch (type) {
      case "sick":
        return "text-red-600";
      case "vacation":
        return "text-blue-600";
      case "personal":
        return "text-purple-600";
      case "emergency":
        return "text-orange-600";
    }
  };

  const canManageRequests = userRole === "admin" || userRole === "manager";

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
                  name="type"
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
                  <Button type="submit" data-testid="button-submit-request">
                    Submit Request
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
                      data-testid={`button-approve-${request.id}`}
                    >
                      <Check className="h-4 w-4 mr-1" />
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleReject(request.id)}
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
