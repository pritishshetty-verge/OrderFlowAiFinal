import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Mail, Phone, Calendar, UserPlus, Loader2, Trash2, Hash, Pencil, MapPin } from "lucide-react";
import type { User, Order as BackendOrder } from "@shared/schema";
import { format } from "date-fns";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ConfigurePermissionsModal } from "@/components/configure-permissions-modal";

type HolidayState = "MUMBAI" | "DELHI" | "BENGALURU" | "HYDERABAD";
const HOLIDAY_STATE_OPTIONS: HolidayState[] = [
  "MUMBAI",
  "DELHI",
  "BENGALURU",
  "HYDERABAD",
];

type CompensationProfile = "ORDER_CONFIRMATION" | "NDR_RTO" | "CHAT_SUPPORT";
const COMPENSATION_PROFILE_OPTIONS: { value: CompensationProfile | "NONE"; label: string }[] = [
  { value: "NONE", label: "None (no payroll)" },
  { value: "ORDER_CONFIRMATION", label: "Order Confirmation" },
  { value: "NDR_RTO", label: "NDR / RTO" },
  { value: "CHAT_SUPPORT", label: "Chat Support (base only)" },
];

interface TeamMember {
  id: string;
  name: string;
  role: "admin" | "agent" | "recovery_agent";
  adminType?: "full_control" | "partial_control";
  email: string;
  phone: string;
  agentExtension?: string;
  avatarImage?: string;
  status: "active" | "on-leave" | "offline";
  assignedOrders: number;
  completedOrders: number;
  joinedDate: string;
  holidayState?: HolidayState;
  baseSalary?: number;
  compensationProfile?: CompensationProfile;
}

interface TeamDirectoryProps {
  userRole: string;
}

// Invite user form schema - simplified (permissions configured in separate modal)
const inviteUserSchema = z.object({
  email: z.string().email("Invalid email address"),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  role: z.enum(["admin", "agent", "recovery_agent"]).default("agent"),
});

type InviteUserFormData = z.infer<typeof inviteUserSchema>;

// Edit extension form schema
const editExtensionSchema = z.object({
  agentExtension: z.string().min(1, "Extension is required").max(10, "Extension must be 10 characters or less"),
});

type EditExtensionFormData = z.infer<typeof editExtensionSchema>;

// Edit "Compensation & Calendar" form schema. One form drives the three
// payroll-relevant fields on users: holidayState (drives /api/holidays
// scope and purple calendar markers), baseSalary (drives the base-pay
// leg of the payroll engine), and compensationProfile (drives which
// incentive ladder applies).
//
// `baseSalary` is held as a string in the form to keep the input
// controlled cleanly; we coerce on submit. `compensationProfile`
// includes a synthetic "NONE" option that maps to null on the wire so
// admins can clear the profile (e.g. moving an agent off variable comp).
const editCompensationSchema = z.object({
  holidayState: z.enum(["MUMBAI", "DELHI", "BENGALURU", "HYDERABAD"]),
  baseSalary: z
    .string()
    .refine((v) => v === "" || (!Number.isNaN(parseFloat(v)) && parseFloat(v) >= 0), {
      message: "Enter a non-negative number",
    }),
  compensationProfile: z.enum(["NONE", "ORDER_CONFIRMATION", "NDR_RTO", "CHAT_SUPPORT"]),
});

type EditCompensationFormData = z.infer<typeof editCompensationSchema>;

export function TeamDirectory({ userRole }: TeamDirectoryProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editExtensionDialogOpen, setEditExtensionDialogOpen] = useState(false);
  const [editCompensationDialogOpen, setEditCompensationDialogOpen] = useState(false);
  const [permissionsModalOpen, setPermissionsModalOpen] = useState(false);
  const [pendingInviteId, setPendingInviteId] = useState<string | null>(null);
  const [pendingInviteEmail, setPendingInviteEmail] = useState<string | null>(null);
  const [userToDelete, setUserToDelete] = useState<TeamMember | null>(null);
  const [userToEditExtension, setUserToEditExtension] = useState<TeamMember | null>(null);
  const [userToEditCompensation, setUserToEditCompensation] = useState<TeamMember | null>(null);
  const { toast } = useToast();

  // currentUserId hoisted to the top of the component because both the
  // /api/users and /api/orders queries need it.
  const currentUserId = localStorage.getItem("userId") ?? "";

  // Users query: passes currentUserId so the server returns the full
  // payroll fields (baseSalary / compensationProfile / holidayState)
  // when the requester is an admin. Non-admins (or requests without
  // a currentUserId) get those fields stripped server-side — see
  // resolveUserScrub in server/routes.ts. The agent UI doesn't render
  // those fields anyway, so a stripped response is fine for them.
  const usersUrl = currentUserId
    ? `/api/users?currentUserId=${encodeURIComponent(currentUserId)}`
    : "/api/users";
  const { data: users, isLoading: usersLoading } = useQuery<User[]>({
    queryKey: [usersUrl],
  });

  // Orders query: drives the per-member "Active / Completed" counters.
  // The /api/orders endpoint enforces `currentUserId` for authorization
  // (see buildOrderReadScope in server/routes.ts), so we MUST pass it
  // — without it the request 401s, useQuery enters error state, and
  // the team list short-circuits to [] (which is exactly the empty
  // directory bug). We also opt admins into `scope=global` so the
  // counts reflect every order, not just the admin's assigned subset.
  const ordersUrl = currentUserId
    ? `/api/orders?currentUserId=${encodeURIComponent(currentUserId)}&scope=global&limit=1000`
    : null;
  const { data: ordersResponse, isLoading: ordersLoading } = useQuery<{
    orders: BackendOrder[];
    total: number;
  }>({
    queryKey: [ordersUrl],
    enabled: !!ordersUrl,
  });

  // Only block the directory on the users query — the orders query is
  // a nice-to-have for counters. If it errors / hasn't returned yet,
  // we still render the cards (with 0 counts) so admins can manage
  // roles, extensions, and holiday state without a hard dependency.
  const isLoading = usersLoading;

  // Form for inviting users
  const form = useForm<InviteUserFormData>({
    resolver: zodResolver(inviteUserSchema),
    defaultValues: {
      email: "",
      firstName: "",
      lastName: "",
      role: "agent",
    },
  });

  // Form for editing extension
  const extensionForm = useForm<EditExtensionFormData>({
    resolver: zodResolver(editExtensionSchema),
    defaultValues: {
      agentExtension: "",
    },
  });

  // Form for editing compensation & calendar (combined surface).
  const compensationForm = useForm<EditCompensationFormData>({
    resolver: zodResolver(editCompensationSchema),
    defaultValues: {
      holidayState: "MUMBAI",
      baseSalary: "0",
      compensationProfile: "NONE",
    },
  });

  // Mutation for sending invites
  const inviteUserMutation = useMutation({
    mutationFn: async (data: InviteUserFormData) => {
      const userId = localStorage.getItem("userId");
      const res = await apiRequest("POST", "/api/invites", {
        ...data,
        invitedBy: userId,
      });
      return await res.json();
    },
    onSuccess: (responseData, variables) => {
      // Close dialog and reset form
      form.reset();
      setIsDialogOpen(false);
      
      // Invalidate invites cache
      queryClient.invalidateQueries({ queryKey: ["/api/invites"] });
      
      // If role is admin, open permissions configuration modal
      if (variables.role === "admin") {
        // Response structure: { message, invite: { id, email, role, expiresAt } }
        setPendingInviteId(responseData.invite.id);
        setPendingInviteEmail(variables.email);
        setPermissionsModalOpen(true);
      } else {
        // For agents, just show success toast
        toast({
          title: "Success",
          description: `Invite sent to ${variables.email}`,
        });
      }
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to send invite",
        variant: "destructive",
      });
    },
  });

  // Mutation for deleting users
  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await apiRequest("DELETE", `/api/users/${userId}`);
      return await res.json();
    },
    onSuccess: () => {
      // Close dialog and invalidate cache
      setDeleteDialogOpen(false);
      setUserToDelete(null);
      queryClient.invalidateQueries({ predicate: (q) => { const k = q.queryKey?.[0]; return typeof k === "string" && k.startsWith("/api/users"); } });
      toast({
        title: "Success",
        description: "Team member deleted successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete user",
        variant: "destructive",
      });
    },
  });

  // Mutation for updating agent extension
  const updateExtensionMutation = useMutation({
    mutationFn: async ({ userId, agentExtension }: { userId: string; agentExtension: string }) => {
      const res = await apiRequest("PATCH", `/api/users/${userId}`, { agentExtension });
      return await res.json();
    },
    onSuccess: () => {
      // Close dialog and invalidate cache
      setEditExtensionDialogOpen(false);
      setUserToEditExtension(null);
      extensionForm.reset();
      queryClient.invalidateQueries({ predicate: (q) => { const k = q.queryKey?.[0]; return typeof k === "string" && k.startsWith("/api/users"); } });
      toast({
        title: "Success",
        description: "Agent extension updated successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update extension",
        variant: "destructive",
      });
    },
  });

  // Mutation for updating compensation & calendar fields. Drives:
  //   • holidayState  → /api/holidays scope + purple calendar markers
  //   • baseSalary    → base-pay leg of the payroll engine
  //   • compensationProfile → which incentive ladder applies on Run
  //
  // baseSalary "" → null on the wire so an admin can explicitly clear
  // a salary (e.g. moving someone off payroll). compensationProfile
  // "NONE" → null for the same reason.
  const updateCompensationMutation = useMutation({
    mutationFn: async ({
      userId,
      holidayState,
      baseSalary,
      compensationProfile,
    }: {
      userId: string;
      holidayState: HolidayState;
      baseSalary: string;
      compensationProfile: CompensationProfile | "NONE";
    }) => {
      const currentUserId = localStorage.getItem("userId");
      const trimmedSalary = baseSalary.trim();
      const salaryPayload =
        trimmedSalary === "" ? null : Number(trimmedSalary).toFixed(2);
      const profilePayload =
        compensationProfile === "NONE" ? null : compensationProfile;
      const res = await apiRequest("PATCH", `/api/users/${userId}`, {
        holidayState,
        baseSalary: salaryPayload,
        compensationProfile: profilePayload,
        currentUserId,
      });
      return await res.json();
    },
    onSuccess: () => {
      setEditCompensationDialogOpen(false);
      setUserToEditCompensation(null);
      compensationForm.reset();
      queryClient.invalidateQueries({ predicate: (q) => { const k = q.queryKey?.[0]; return typeof k === "string" && k.startsWith("/api/users"); } });
      // Calendar markers + payroll preview both depend on user.holiday_state
      // / user.base_salary — invalidate so an edit reflects without a
      // hard refresh.
      queryClient.invalidateQueries({ queryKey: ["/api/holidays"] });
      // Any ongoing payroll preview for this user is now stale.
      queryClient.invalidateQueries({ predicate: (q) => {
        const k = q.queryKey?.[0];
        return typeof k === "string" && k.startsWith("/api/payroll/");
      }});
      toast({
        title: "Saved",
        description: "Compensation & calendar updated",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update compensation",
        variant: "destructive",
      });
    },
  });

  const handleInviteUser = (data: InviteUserFormData) => {
    inviteUserMutation.mutate(data);
  };

  const handleDeleteUser = (member: TeamMember) => {
    setUserToDelete(member);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (userToDelete) {
      deleteUserMutation.mutate(userToDelete.id);
    }
  };

  const handleEditExtension = (member: TeamMember) => {
    setUserToEditExtension(member);
    extensionForm.setValue("agentExtension", member.agentExtension || "");
    setEditExtensionDialogOpen(true);
  };

  const handleUpdateExtension = (data: EditExtensionFormData) => {
    if (userToEditExtension) {
      updateExtensionMutation.mutate({
        userId: userToEditExtension.id,
        agentExtension: data.agentExtension,
      });
    }
  };

  const handleEditCompensation = (member: TeamMember) => {
    setUserToEditCompensation(member);
    compensationForm.reset({
      holidayState: member.holidayState ?? "MUMBAI",
      baseSalary:
        member.baseSalary != null && Number.isFinite(member.baseSalary)
          ? String(member.baseSalary)
          : "0",
      compensationProfile: member.compensationProfile ?? "NONE",
    });
    setEditCompensationDialogOpen(true);
  };

  const handleUpdateCompensation = (data: EditCompensationFormData) => {
    if (userToEditCompensation) {
      updateCompensationMutation.mutate({
        userId: userToEditCompensation.id,
        holidayState: data.holidayState,
        baseSalary: data.baseSalary,
        compensationProfile: data.compensationProfile,
      });
    }
  };

  // Transform users to team members with order counts. Only `users`
  // is required — orders is optional so a 401 / pending / errored
  // orders query doesn't blank out the entire directory. When orders
  // is unavailable we fall back to 0/0 counters.
  const teamMembers = useMemo<TeamMember[]>(() => {
    if (!users) return [];
    const ordersList = ordersResponse?.orders ?? [];

    return users.map((user) => {
      const userOrders = ordersList.filter((o) => o.assignedTo === user.id);
      const completedOrders = userOrders.filter(
        (o) => o.status === "delivered" || o.status === "confirmed"
      );

      return {
        id: user.id,
        name: user.fullName,
        role: user.role as TeamMember["role"],
        adminType: (user.adminType as "full_control" | "partial_control") || undefined,
        email: user.email,
        phone: user.phone || "N/A",
        agentExtension: user.agentExtension || undefined,
        avatarImage: user.avatarImage || undefined,
        status: user.isActive ? "active" : "offline",
        assignedOrders: userOrders.filter(
          (o) => o.status !== "delivered" && o.status !== "cancelled"
        ).length,
        completedOrders: completedOrders.length,
        joinedDate: format(new Date(user.createdAt), "MMM yyyy"),
        holidayState: (user.holidayState as HolidayState | null) ?? undefined,
        // user.baseSalary comes back as a numeric-string from the
        // pg `decimal` type; coerce defensively. Treat 0 / null
        // identically (both "no salary configured").
        baseSalary:
          user.baseSalary != null && user.baseSalary !== ""
            ? Number(user.baseSalary)
            : undefined,
        compensationProfile:
          (user.compensationProfile as CompensationProfile | null) ?? undefined,
      };
    });
  }, [users, ordersResponse]);

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase();
  };

  const getStatusColor = (status: TeamMember["status"]) => {
    switch (status) {
      case "active":
        return "bg-green-500";
      case "on-leave":
        return "bg-yellow-500";
      case "offline":
        return "bg-gray-400";
    }
  };

  const getRoleBadgeVariant = (role: TeamMember["role"]) => {
    switch (role) {
      case "admin":
        return "default";
      case "recovery_agent":
        return "secondary";
      case "agent":
      default:
        return "outline";
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-10 w-64" data-testid="skeleton-title" />
          <Skeleton className="h-10 w-32" data-testid="skeleton-button" />
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-64" data-testid={`skeleton-member-${i}`} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Team Members</h2>
          <p className="text-muted-foreground">
            {teamMembers.length} total members
          </p>
        </div>
        {userRole === "admin" && (
          <Button onClick={() => setIsDialogOpen(true)} data-testid="button-add-member">
            <UserPlus className="h-4 w-4 mr-2" />
            Invite User
          </Button>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {teamMembers.map((member) => (
          <Card key={member.id} data-testid={`card-member-${member.id}`}>
            <CardHeader className="space-y-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <Avatar className="h-12 w-12">
                      {member.avatarImage && (
                        <AvatarImage 
                          src={`/avatars/${member.avatarImage}`} 
                          alt={member.name}
                          className="object-cover"
                        />
                      )}
                      <AvatarFallback className="text-sm font-semibold">
                        {getInitials(member.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div
                      className={`absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-card ${getStatusColor(
                        member.status
                      )}`}
                    />
                  </div>
                  <div>
                    <CardTitle className="text-base">{member.name}</CardTitle>
                    <CardDescription className="text-xs capitalize">
                      {member.status.replace("-", " ")}
                    </CardDescription>
                  </div>
                </div>
                <Badge variant={getRoleBadgeVariant(member.role)} className="capitalize">
                  {member.role === "admin" && member.adminType
                    ? member.adminType === "full_control"
                      ? "Full Control Admin"
                      : "Partial Control Admin"
                    : member.role === "recovery_agent"
                      ? "Recovery Agent"
                      : member.role}
                </Badge>
              </div>
            </CardHeader>

            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-muted-foreground text-xs truncate">
                    {member.email}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-muted-foreground text-xs">{member.phone}</span>
                </div>
                {member.role === "agent" && (
                  <div className="flex items-center gap-2 text-sm justify-between">
                    <div className="flex items-center gap-2">
                      <Hash className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-muted-foreground text-xs font-mono" data-testid={`text-extension-${member.id}`}>
                        {member.agentExtension ? `Ext ${member.agentExtension}` : "No extension"}
                      </span>
                    </div>
                    {userRole === "admin" && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => handleEditExtension(member)}
                        data-testid={`button-edit-extension-${member.id}`}
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                )}
                <div className="flex items-center gap-2 text-sm">
                  <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-muted-foreground text-xs">
                    Joined {member.joinedDate}
                  </span>
                </div>
                {/* Compensation & Calendar — admin-only. This block
                    leaks salary, compensation profile, and the
                    holiday-calendar city of every team member, so we
                    gate the entire row behind the admin role. The
                    edit pencil was already admin-only, but the summary
                    text was visible to agents prior to this fix —
                    which both leaked compensation info and confused
                    agents who read "Mumbai" as a physical office
                    location rather than a holiday-calendar selection.
                    See server/routes.ts /api/users for the matching
                    server-side scrub if/when you decide to redact the
                    raw fields from the agent-facing API response. */}
                {userRole === "admin" && (
                  <div className="flex items-center gap-2 text-sm justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <MapPin className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                      <span
                        className="text-muted-foreground text-xs truncate"
                        data-testid={`text-compensation-${member.id}`}
                      >
                        {summarizeCompensation(member)}
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => handleEditCompensation(member)}
                      data-testid={`button-edit-compensation-${member.id}`}
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 pt-3 border-t">
                <div className="space-y-1">
                  <p className="text-2xl font-bold">{member.assignedOrders}</p>
                  <p className="text-xs text-muted-foreground">Active Orders</p>
                </div>
                <div className="space-y-1">
                  <p className="text-2xl font-bold">{member.completedOrders}</p>
                  <p className="text-xs text-muted-foreground">Completed</p>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  data-testid={`button-message-${member.id}`}
                >
                  Message
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  data-testid={`button-call-${member.id}`}
                >
                  Call
                </Button>
                {userRole === "admin" && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDeleteUser(member)}
                    data-testid={`button-delete-${member.id}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Invite User Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Invite user</DialogTitle>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleInviteUser)} className="space-y-4">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email *</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="johnsmith@mail.com" {...field} data-testid="input-email" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="firstName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>First name</FormLabel>
                    <FormControl>
                      <Input placeholder="John" {...field} value={field.value || ""} data-testid="input-first-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="lastName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Last name</FormLabel>
                    <FormControl>
                      <Input placeholder="Smith" {...field} value={field.value || ""} data-testid="input-last-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="role"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Role</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-role">
                          <SelectValue placeholder="Select role" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="agent">Agent</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="recovery_agent">Recovery Agent</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsDialogOpen(false)}
                  disabled={inviteUserMutation.isPending}
                  data-testid="button-cancel"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={inviteUserMutation.isPending}
                  data-testid="button-submit"
                >
                  {inviteUserMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    "Send Invite"
                  )}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent data-testid="dialog-delete-user">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Team Member</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {userToDelete?.name}? This action cannot be undone.
              All data associated with this team member will be permanently removed from the database.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={deleteUserMutation.isPending}
              data-testid="button-cancel-delete"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={deleteUserMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              {deleteUserMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit Extension Dialog */}
      <Dialog open={editExtensionDialogOpen} onOpenChange={setEditExtensionDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Set Agent Extension</DialogTitle>
            <DialogDescription>
              Set the phone extension for {userToEditExtension?.name}. This will be used for IVR calling.
            </DialogDescription>
          </DialogHeader>

          <Form {...extensionForm}>
            <form onSubmit={extensionForm.handleSubmit(handleUpdateExtension)} className="space-y-4">
              <FormField
                control={extensionForm.control}
                name="agentExtension"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Extension Number *</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="e.g., 101, 102" 
                        {...field} 
                        data-testid="input-agent-extension"
                        className="font-mono"
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
                  onClick={() => {
                    setEditExtensionDialogOpen(false);
                    setUserToEditExtension(null);
                    extensionForm.reset();
                  }}
                  disabled={updateExtensionMutation.isPending}
                  data-testid="button-cancel-extension"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={updateExtensionMutation.isPending}
                  data-testid="button-submit-extension"
                >
                  {updateExtensionMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    "Save Extension"
                  )}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Edit Compensation & Calendar Dialog */}
      <Dialog
        open={editCompensationDialogOpen}
        onOpenChange={setEditCompensationDialogOpen}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Compensation & Calendar</DialogTitle>
            <DialogDescription>
              Set the holiday city, base salary, and incentive profile for{" "}
              {userToEditCompensation?.name}. These fields drive payroll runs
              and the purple holiday markers on the attendance calendar.
            </DialogDescription>
          </DialogHeader>

          <Form {...compensationForm}>
            <form
              onSubmit={compensationForm.handleSubmit(handleUpdateCompensation)}
              className="space-y-4"
            >
              <FormField
                control={compensationForm.control}
                name="holidayState"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Holiday city *</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                      value={field.value}
                    >
                      <FormControl>
                        <SelectTrigger data-testid="select-holiday-state">
                          <SelectValue placeholder="Select city" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {HOLIDAY_STATE_OPTIONS.map((opt) => (
                          <SelectItem key={opt} value={opt}>
                            {opt.charAt(0) + opt.slice(1).toLowerCase()}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={compensationForm.control}
                name="baseSalary"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Base salary (₹) *</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="50000"
                        {...field}
                        data-testid="input-base-salary"
                        className="font-mono"
                      />
                    </FormControl>
                    <p className="text-xs text-muted-foreground">
                      Monthly gross. Drives the base-pay leg of payroll.
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={compensationForm.control}
                name="compensationProfile"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Compensation profile *</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                      value={field.value}
                    >
                      <FormControl>
                        <SelectTrigger data-testid="select-compensation-profile">
                          <SelectValue placeholder="Select profile" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {COMPENSATION_PROFILE_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Selects the incentive ladder. Chat Support is base-pay only.
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setEditCompensationDialogOpen(false);
                    setUserToEditCompensation(null);
                    compensationForm.reset();
                  }}
                  disabled={updateCompensationMutation.isPending}
                  data-testid="button-cancel-compensation"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={updateCompensationMutation.isPending}
                  data-testid="button-submit-compensation"
                >
                  {updateCompensationMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    "Save"
                  )}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Configure Permissions Modal - shown after inviting an admin */}
      <ConfigurePermissionsModal
        open={permissionsModalOpen}
        onOpenChange={setPermissionsModalOpen}
        inviteId={pendingInviteId}
        inviteEmail={pendingInviteEmail}
      />
    </div>
  );
}

// Compact one-line summary of payroll-relevant fields, shown next to
// the MapPin icon on each member card. Designed for at-a-glance audit
// of who still needs setup ("No payroll setup") vs who's fully wired.
function summarizeCompensation(member: TeamMember): string {
  const parts: string[] = [];
  if (member.holidayState) {
    const c = member.holidayState;
    parts.push(c.charAt(0) + c.slice(1).toLowerCase());
  }
  if (member.baseSalary != null && member.baseSalary > 0) {
    parts.push(`₹${member.baseSalary.toLocaleString("en-IN")}/mo`);
  }
  if (member.compensationProfile) {
    const friendly: Record<string, string> = {
      ORDER_CONFIRMATION: "Confirmation",
      NDR_RTO: "NDR/RTO",
      CHAT_SUPPORT: "Chat",
    };
    parts.push(friendly[member.compensationProfile] ?? member.compensationProfile);
  }
  return parts.length ? parts.join(" · ") : "No payroll setup";
}
