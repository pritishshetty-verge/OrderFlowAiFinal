import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
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
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Phone, Calendar, UserPlus, Loader2, Trash2, Hash, Pencil, MapPin, Store, RotateCcw, KeyRound, ShieldAlert, MoreHorizontal, PhoneCall, Search } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { User, Order as BackendOrder, Attendance } from "@shared/schema";
import { format } from "date-fns";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ConfigurePermissionsModal } from "@/components/configure-permissions-modal";
import { ManageStoreAccessDialog } from "@/components/manage-store-access-dialog";
import { ManageModuleAccessDialog } from "@/components/manage-module-access-dialog";

type HolidayState = "MUMBAI" | "DELHI" | "BENGALURU" | "HYDERABAD";
const HOLIDAY_STATE_OPTIONS: HolidayState[] = [
  "MUMBAI",
  "DELHI",
  "BENGALURU",
  "HYDERABAD",
];

type CompensationProfile = "ORDER_CONFIRMATION" | "NDR_RTO" | "CHAT_SUPPORT" | "DEVELOPER" | "MANAGER";
const COMPENSATION_PROFILE_OPTIONS: { value: CompensationProfile | "NONE"; label: string }[] = [
  { value: "NONE", label: "None (no payroll)" },
  { value: "ORDER_CONFIRMATION", label: "Order Confirmation" },
  { value: "NDR_RTO", label: "NDR / RTO" },
  { value: "MANAGER", label: "Manager (store performance bonus)" },
  { value: "CHAT_SUPPORT", label: "Chat Support (base only)" },
  { value: "DEVELOPER", label: "Developer (base + line items)" },
];

type LiveStatus = "active" | "idle" | "auto-closed" | "on-leave" | "offline";

interface TeamMember {
  id: string;
  name: string;
  role: "admin" | "agent" | "recovery_agent" | "chat_support" | "ndr_rto" | "developer";
  adminType?: "full_control" | "partial_control";
  moduleAccess?: string[];
  email: string;
  phone: string;
  agentExtension?: string;
  avatarImage?: string;
  // Account-level status (active / on-leave / offline). Kept around for
  // the existing "Active" label fallback. Live working status lives on
  // `liveStatus` below.
  status: "active" | "on-leave" | "offline";
  // Smart-presence derived working status. Recomputed every 30s from
  // attendance + users.lastActiveAt + the policy threshold. Drives the
  // colored avatar dot and the status sub-label.
  liveStatus: LiveStatus;
  // Minutes since the user last sent a heartbeat — only meaningful for
  // `idle` so the card can show "Idle 12 min".
  minutesSinceActive?: number;
  assignedOrders: number;
  completedOrders: number;
  joinedDate: string;
  holidayState?: HolidayState;
  baseSalary?: number;
  compensationProfile?: CompensationProfile;
  // Agent's personal Shopify coupon code — attributes recovered orders to them
  // for the "My Converted Orders" page and commission dashboard.
  couponCode?: string;
  // Set only when today's attendance was auto-closed by the smart-presence
  // worker AND the admin hasn't reactivated yet. Drives the auto-closed
  // badge + Reactivate button on the card.
  autoClosedAttendanceId?: string;
  autoClosedAt?: Date;
  // When true, this user is exempt from auto clock-out monitoring.
  monitoringExempt?: boolean;
}

interface TeamDirectoryProps {
  userRole: string;
}

// Invite user form schema - simplified (permissions configured in separate modal)
const inviteUserSchema = z.object({
  email: z.string().email("Invalid email address"),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  // Mirror of shared/schema.ts insertInviteSchema. Both must be kept
  // in sync — drift here means the form rejects roles the server
  // accepts, or vice-versa.
  role: z
    .enum(["admin", "agent", "recovery_agent", "chat_support", "ndr_rto"])
    .default("agent"),
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
  compensationProfile: z.enum(["NONE", "ORDER_CONFIRMATION", "NDR_RTO", "CHAT_SUPPORT", "DEVELOPER", "MANAGER"]),
  couponCode: z.string().max(60, "Coupon code too long"),
});

type EditCompensationFormData = z.infer<typeof editCompensationSchema>;

// Edit-role form. Two fields: role (always required) and adminType (only
// meaningful when role === "admin"). Kept as a plain enum "NONE" for the
// non-admin cases so we don't have to make the form field conditionally
// required — we coerce on submit.
const editRoleSchema = z.object({
  role: z.enum(["admin", "agent", "recovery_agent", "chat_support", "ndr_rto", "developer"]),
  adminType: z.enum(["full_control", "partial_control", "NONE"]),
});
type EditRoleFormData = z.infer<typeof editRoleSchema>;

export function TeamDirectory({ userRole }: TeamDirectoryProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editExtensionDialogOpen, setEditExtensionDialogOpen] = useState(false);
  const [editCompensationDialogOpen, setEditCompensationDialogOpen] = useState(false);
  const [editRoleDialogOpen, setEditRoleDialogOpen] = useState(false);
  const [userToEditRole, setUserToEditRole] = useState<TeamMember | null>(null);
  const [memberSearch, setMemberSearch] = useState("");
  const [permissionsModalOpen, setPermissionsModalOpen] = useState(false);
  const [pendingInviteId, setPendingInviteId] = useState<string | null>(null);
  const [pendingInviteEmail, setPendingInviteEmail] = useState<string | null>(null);
  const [userToDelete, setUserToDelete] = useState<TeamMember | null>(null);
  const [userToEditExtension, setUserToEditExtension] = useState<TeamMember | null>(null);
  const [userToEditCompensation, setUserToEditCompensation] = useState<TeamMember | null>(null);
  // Phase 4 RBAC: which user's store memberships are being edited
  // right now. Null when the modal is closed.
  const [userForStoreAccess, setUserForStoreAccess] =
    useState<TeamMember | null>(null);
  // Which user's per-page module access is being edited (null = closed).
  const [userForModuleAccess, setUserForModuleAccess] =
    useState<TeamMember | null>(null);
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
    // Refetch every 30s so lastActiveAt stays fresh — the smart-presence
    // dot/sub-label derivation reads this directly.
    refetchInterval: 30_000,
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

  // Smart-presence attendance for today, used to surface "auto clocked-out"
  // status and the Reactivate button on each member card. The presence
  // banner invalidates this key when it detects an auto-close, so admins
  // see the change within ~30s of the worker firing.
  const { data: teamAttendance } = useQuery<Attendance[]>({
    queryKey: ["/api/attendance/team-today"],
    refetchInterval: 30_000,
  });
  const attendanceByUser = useMemo(() => {
    const m = new Map<string, Attendance>();
    teamAttendance?.forEach((a) => m.set(a.userId, a));
    return m;
  }, [teamAttendance]);

  // Admin toggle — exempt / re-include a user in auto clock-out monitoring.
  const monitoringExemptMutation = useMutation({
    mutationFn: async ({ userId, exempt }: { userId: string; exempt: boolean }) => {
      return await apiRequest("POST", `/api/users/${userId}/monitoring-exempt`, { exempt });
    },
    onSuccess: (_res, { exempt }) => {
      queryClient.invalidateQueries({ queryKey: [usersUrl] });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({
        title: exempt ? "Monitoring turned off" : "Monitoring turned on",
        description: exempt
          ? "This member won't be auto-clocked-out for inactivity."
          : "This member is back under the auto clock-out policy.",
      });
    },
    onError: (error: Error) => {
      toast({ title: "Couldn't update monitoring", description: error.message, variant: "destructive" });
    },
  });

  // Idle threshold (e.g. 10 minutes) — fetched once at mount. Falls back
  // to 10 so we never block the directory render if the request fails.
  const { data: policy } = useQuery<{
    idleThresholdMin: number;
    graceMin: number;
    autoLogoutTotalMin: number;
  }>({
    queryKey: ["/api/presence/policy"],
    staleTime: 5 * 60_000,
  });
  const idleThresholdMin = policy?.idleThresholdMin ?? 10;

  // Tick every 30s so the live-status derivation (which depends on
  // "minutes since lastActiveAt") re-renders without waiting for the
  // attendance refetch. The teamAttendance query also refetches every
  // 30s, but lastActiveAt sits on the `users` row — so without a
  // ticker, the dot stays "Active" forever even as the timestamp ages.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);

  // Reactivate mutation — admin-only flow. Server enforces the role
  // check; we still hide the button for non-admins below.
  const reactivateMutation = useMutation({
    mutationFn: async (attendanceId: string) => {
      return await apiRequest("POST", `/api/attendance/${attendanceId}/reactivate`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/attendance/team-today"] });
      queryClient.invalidateQueries({ queryKey: ["/api/attendance/today"] });
      queryClient.invalidateQueries({ queryKey: ["/api/presence/me"] });
      toast({
        title: "Shift reactivated",
        description: "The agent is back on shift — no need for them to clock in again.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Couldn't reactivate",
        description: error.message,
        variant: "destructive",
      });
    },
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
      couponCode: "",
    },
  });

  // Form for changing an existing member's role. Ships behind the admin-only
  // pencil next to the role badge on each card.
  const roleForm = useForm<EditRoleFormData>({
    resolver: zodResolver(editRoleSchema),
    defaultValues: {
      role: "agent",
      adminType: "NONE",
    },
  });
  const roleWatch = roleForm.watch("role");

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
      couponCode,
    }: {
      userId: string;
      holidayState: HolidayState;
      baseSalary: string;
      compensationProfile: CompensationProfile | "NONE";
      couponCode: string;
    }) => {
      const currentUserId = localStorage.getItem("userId");
      const trimmedSalary = baseSalary.trim();
      const salaryPayload =
        trimmedSalary === "" ? null : Number(trimmedSalary).toFixed(2);
      const profilePayload =
        compensationProfile === "NONE" ? null : compensationProfile;
      const trimmedCoupon = couponCode.trim();
      const couponPayload = trimmedCoupon === "" ? null : trimmedCoupon;
      const res = await apiRequest("PATCH", `/api/users/${userId}`, {
        holidayState,
        baseSalary: salaryPayload,
        compensationProfile: profilePayload,
        couponCode: couponPayload,
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

  // Mutation for changing an existing member's role (and, when the new role
  // is admin, their admin type). Server-side guards: promoting to admin
  // requires full-control admin, and you can't change your own role.
  const updateRoleMutation = useMutation({
    mutationFn: async ({
      userId,
      role,
      adminType,
    }: {
      userId: string;
      role: EditRoleFormData["role"];
      adminType: EditRoleFormData["adminType"];
    }) => {
      const currentUserId = localStorage.getItem("userId");
      // Only send adminType when the new role is admin — for any other role,
      // the field is meaningless and we want the DB column cleared.
      const adminTypePayload =
        role === "admin" ? (adminType === "NONE" ? "full_control" : adminType) : null;
      const res = await apiRequest("PATCH", `/api/users/${userId}`, {
        role,
        adminType: adminTypePayload,
        currentUserId,
      });
      return await res.json();
    },
    onSuccess: () => {
      setEditRoleDialogOpen(false);
      setUserToEditRole(null);
      roleForm.reset();
      queryClient.invalidateQueries({ predicate: (q) => {
        const k = q.queryKey?.[0];
        return typeof k === "string" && k.startsWith("/api/users");
      }});
      toast({
        title: "Role updated",
        description:
          "Applies on their next page load. If you changed their own account, they may need to sign out and back in.",
      });
    },
    onError: (error: any) => {
      const raw = error?.message ?? "Failed to update role";
      // Strip the leading "<status>: " prefix apiRequest adds.
      const stripped = String(raw).replace(/^\d+:\s*/, "");
      let msg = stripped;
      try {
        msg = JSON.parse(stripped)?.error ?? stripped;
      } catch {}
      toast({
        title: "Error",
        description: msg,
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
      couponCode: member.couponCode ?? "",
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
        couponCode: data.couponCode,
      });
    }
  };

  const handleEditRole = (member: TeamMember) => {
    setUserToEditRole(member);
    roleForm.reset({
      role: member.role,
      adminType:
        member.role === "admin"
          ? member.adminType === "partial_control"
            ? "partial_control"
            : "full_control"
          : "NONE",
    });
    setEditRoleDialogOpen(true);
  };

  const handleUpdateRole = (data: EditRoleFormData) => {
    if (userToEditRole) {
      updateRoleMutation.mutate({
        userId: userToEditRole.id,
        role: data.role,
        adminType: data.adminType,
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

    const now = Date.now();

    const mapped: TeamMember[] = users.map((user) => {
      const userOrders = ordersList.filter((o) => o.assignedTo === user.id);
      const completedOrders = userOrders.filter(
        (o) => o.status === "delivered" || o.status === "confirmed"
      );

      const att = attendanceByUser.get(user.id);
      // `autoClosedAt` is cleared to null on reactivation, so its presence
      // alone means "currently auto-closed". Don't also gate on
      // `reactivatedAt` — that stays set from an earlier reactivation and
      // would hide a shift that was reactivated and then auto-closed again.
      const isAutoClosed = !!att?.autoClosedAt;
      const isClockedIn = !!att?.clockInTime && !att?.clockOutTime && !isAutoClosed;
      // Full-control admins are exempt from the monitoring system — they
      // can never be auto-clocked-out, so we never show them as "idle"
      // either (it would imply a countdown that doesn't exist). They
      // read as active when clocked in, offline otherwise.
      const isExempt = user.role === "admin" && user.adminType === "full_control";

      // Derive live working status. Auto-closed beats everything else
      // because the agent is no longer accumulating idle time.
      let liveStatus: LiveStatus;
      let minutesSinceActive: number | undefined;
      if (isAutoClosed) {
        liveStatus = "auto-closed";
      } else if (!isClockedIn) {
        // Account "on-leave" surfaces with the yellow dot; everything
        // else (inactive account, never clocked in today, already clocked
        // out) is plain offline.
        if (user.presenceStatus === "onleave") liveStatus = "on-leave";
        else liveStatus = "offline";
      } else if (isExempt) {
        // Clocked in + exempt → always active, never idle.
        liveStatus = "active";
      } else {
        const lastActive = user.lastActiveAt ? new Date(user.lastActiveAt).getTime() : null;
        const mins = lastActive ? (now - lastActive) / 60_000 : Infinity;
        minutesSinceActive = lastActive ? Math.floor(mins) : undefined;
        if (att?.status === "break") {
          // Break pauses the idle clock — treat as still active so the
          // card doesn't go yellow during a legitimate break. The
          // Presence & Workload tab still shows "On Break" explicitly.
          liveStatus = "active";
        } else if (mins >= idleThresholdMin) {
          liveStatus = "idle";
        } else {
          liveStatus = "active";
        }
      }

      return {
        id: user.id,
        name: user.fullName,
        role: user.role as TeamMember["role"],
        adminType: (user.adminType as "full_control" | "partial_control") || undefined,
        moduleAccess: Array.isArray(user.moduleAccess) ? (user.moduleAccess as string[]) : [],
        email: user.email,
        phone: user.phone || "N/A",
        agentExtension: user.agentExtension || undefined,
        avatarImage: user.avatarImage || undefined,
        status: user.isActive ? "active" : "offline",
        liveStatus,
        minutesSinceActive,
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
        couponCode: (user as any).couponCode ?? undefined,
        autoClosedAttendanceId: isAutoClosed ? att!.id : undefined,
        autoClosedAt: isAutoClosed ? new Date(att!.autoClosedAt!) : undefined,
        monitoringExempt: (user as any).monitoringExempt ?? false,
      };
    });

    // Stable alphabetical order. GET /api/users has no ORDER BY, so after a
    // row is UPDATEd (e.g. the auto clock-out toggle) Postgres returns it in
    // a different heap position and the member visually jumps. Sorting by a
    // key that the toggle does NOT change (name, id tiebreak) pins each row
    // in place across refetches.
    return mapped.sort(
      (a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
    );
  }, [users, ordersResponse, attendanceByUser, idleThresholdMin]);

  // Client-side member search — name, email, phone, or role. Team sizes are
  // small, so no debounce needed.
  const visibleMembers = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    if (!q) return teamMembers;
    return teamMembers.filter((m) =>
      [m.name, m.email, m.phone, m.role].some((v) =>
        String(v ?? "").toLowerCase().includes(q),
      ),
    );
  }, [teamMembers, memberSearch]);

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

  const getLiveStatusColor = (status: LiveStatus) => {
    switch (status) {
      case "active":
        return "bg-green-500";
      case "idle":
        return "bg-yellow-500";
      case "auto-closed":
        return "bg-blue-500";
      case "on-leave":
        return "bg-yellow-500";
      case "offline":
        return "bg-gray-400";
    }
  };

  const getLiveStatusLabel = (member: TeamMember): { text: string; color?: string } => {
    switch (member.liveStatus) {
      case "active":
        return { text: "Active" };
      case "idle":
        return {
          text:
            member.minutesSinceActive != null
              ? `Idle ${member.minutesSinceActive} min`
              : "Idle",
          color: "text-yellow-600 dark:text-yellow-400",
        };
      case "auto-closed":
        return {
          text: member.autoClosedAt
            ? `Auto clocked-out at ${member.autoClosedAt.toLocaleTimeString(
                "en-IN",
                { hour: "2-digit", minute: "2-digit", hour12: true },
              )}`
            : "Auto clocked-out",
          color: "text-blue-600 dark:text-blue-400",
        };
      case "on-leave":
        return { text: "On leave" };
      case "offline":
        return { text: "Offline" };
    }
  };

  const getRoleBadgeVariant = (role: TeamMember["role"]) => {
    switch (role) {
      case "admin":
        return "default";
      case "recovery_agent":
      case "chat_support":
      case "ndr_rto":
        return "secondary";
      case "agent":
      default:
        return "outline";
    }
  };

  // Friendly display name for each role. Used by the badge on each
  // member card. Keep in sync with the SelectItem labels in the
  // invite dialog further down so the same role reads the same way
  // throughout the UI.
  const formatRoleLabel = (role: TeamMember["role"]): string => {
    switch (role) {
      case "recovery_agent":
        return "Inside Sales Executive (ISE)";
      case "chat_support":
        return "Chat Support";
      case "ndr_rto":
        return "NDR/RTO Executive";
      case "admin":
        return "Admin";
      case "developer":
        return "Developer";
      case "agent":
      default:
        return "Order Confirmation Executive (OCE)";
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-10 w-64" data-testid="skeleton-title" />
          <Skeleton className="h-10 w-32" data-testid="skeleton-button" />
        </div>
        <div className="rounded-lg border bg-card p-4 space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton
              key={i}
              className="h-11 w-full"
              data-testid={`skeleton-member-${i}`}
            />
          ))}
        </div>
      </div>
    );
  }

  const isAdminViewer = userRole === "admin";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Team Members</h2>
          <p className="text-sm text-muted-foreground">
            {teamMembers.length} {teamMembers.length === 1 ? "member" : "members"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative w-56">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search members…"
              value={memberSearch}
              onChange={(e) => setMemberSearch(e.target.value)}
              className="pl-9 h-9"
              data-testid="input-search-members"
            />
          </div>
          {userRole === "admin" && (
            <Button onClick={() => setIsDialogOpen(true)} data-testid="button-add-member">
              <UserPlus className="h-4 w-4 mr-2" />
              Invite User
            </Button>
          )}
        </div>
      </div>

      {/* Table layout — density-optimised to match the Orders page. Rows are
          pure data; EVERY per-row action (message / call / change role /
          edit extension / edit compensation / store access / page access /
          reactivate shift / delete) lives in the single Actions dropdown at
          the row's end. The one inline control is the Auto clock-out toggle,
          which renders on every row for visual consistency (admins: off +
          disabled with a tooltip, since they're always exempt by policy).
          Non-admin viewers see a shorter table with the Compensation and
          Auto clock-out columns hidden. */}
      <div className="rounded-lg border bg-card">
        <div className="relative overflow-x-auto">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-muted/40 backdrop-blur-sm">
              <TableRow className="[&_th]:h-9 [&_th]:px-3 [&_th]:text-[11px] [&_th]:font-medium [&_th]:uppercase [&_th]:tracking-wider [&_th]:text-muted-foreground">
                <TableHead className="w-[240px]">Member</TableHead>
                <TableHead className="w-[180px]">Role</TableHead>
                <TableHead>Contact</TableHead>
                {isAdminViewer && <TableHead>Compensation</TableHead>}
                <TableHead className="text-right w-[100px]">Orders</TableHead>
                <TableHead className="w-[120px]">Joined</TableHead>
                {isAdminViewer && (
                  <TableHead className="w-[150px]">Auto clock-out</TableHead>
                )}
                <TableHead className="text-right w-[60px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="[&_td]:py-2.5 [&_td]:px-3 [&_td]:text-[13px] [&_td]:align-middle">
              {visibleMembers.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={isAdminViewer ? 8 : 6}
                    className="h-24 text-center text-sm text-muted-foreground"
                  >
                    {memberSearch.trim()
                      ? `No members match "${memberSearch.trim()}".`
                      : "No team members yet."}
                  </TableCell>
                </TableRow>
              ) : (
                visibleMembers.map((member) => {
                  const liveLabel = getLiveStatusLabel(member);
                  const isSelf = member.id === currentUserId;
                  const roleLabel =
                    member.role === "admin" && member.adminType
                      ? member.adminType === "full_control"
                        ? "Full Control Admin"
                        : "Partial Control Admin"
                      : formatRoleLabel(member.role);
                  return (
                    <TableRow
                      key={member.id}
                      className="hover-elevate"
                      data-testid={`row-member-${member.id}`}
                    >
                      {/* Member — avatar + presence dot, name, live status */}
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="relative flex-shrink-0">
                            <Avatar className="h-9 w-9">
                              {member.avatarImage && (
                                <AvatarImage
                                  src={`/avatars/${member.avatarImage}`}
                                  alt={member.name}
                                  className="object-cover"
                                />
                              )}
                              <AvatarFallback className="text-xs font-semibold">
                                {getInitials(member.name)}
                              </AvatarFallback>
                            </Avatar>
                            <span
                              className={cn(
                                "absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-card",
                                getLiveStatusColor(member.liveStatus),
                              )}
                              aria-label={liveLabel.text}
                            />
                          </div>
                          <div className="min-w-0 leading-tight">
                            <div className="font-medium text-foreground truncate">
                              {member.name}
                            </div>
                            <div
                              className={cn(
                                "text-[11px] mt-0.5 truncate",
                                liveLabel.color ?? "text-muted-foreground",
                              )}
                            >
                              {liveLabel.text}
                            </div>
                          </div>
                        </div>
                      </TableCell>

                      {/* Role — badge only. Changing the role lives in the
                          Actions dropdown with every other action. */}
                      <TableCell>
                        <Badge
                          variant={getRoleBadgeVariant(member.role)}
                          className="whitespace-nowrap"
                        >
                          {roleLabel}
                        </Badge>
                      </TableCell>

                      {/* Contact — email + phone stacked; extension chip for agents */}
                      <TableCell>
                        <div className="flex flex-col leading-tight min-w-0">
                          <span className="truncate text-[13px] text-foreground">
                            {member.email}
                          </span>
                          <span className="text-[11px] text-muted-foreground tabular-nums mt-0.5 flex items-center gap-1.5">
                            <span>
                              {member.phone && member.phone.toUpperCase() !== "N/A"
                                ? member.phone
                                : "—"}
                            </span>
                            {member.role === "agent" && member.agentExtension && (
                              <span
                                className="inline-flex items-center gap-0.5 font-mono"
                                data-testid={`text-extension-${member.id}`}
                              >
                                <Hash className="h-2.5 w-2.5" />
                                {member.agentExtension}
                              </span>
                            )}
                          </span>
                        </div>
                      </TableCell>

                      {/* Compensation — admin only. Full string is in the
                          edit dialog; the row shows the summary. Members
                          with no payroll setup get a quiet em dash instead
                          of icon + placeholder copy. */}
                      {isAdminViewer && (
                        <TableCell>
                          {(() => {
                            const summary = summarizeCompensation(member);
                            if (summary === "No payroll setup") {
                              return (
                                <span
                                  className="text-[12px] text-muted-foreground/60"
                                  data-testid={`text-compensation-${member.id}`}
                                  title="No payroll setup"
                                >
                                  —
                                </span>
                              );
                            }
                            return (
                              <div className="flex items-center gap-1.5 text-muted-foreground min-w-0">
                                <MapPin className="h-3 w-3 flex-shrink-0" />
                                <span
                                  className="truncate text-[12px]"
                                  data-testid={`text-compensation-${member.id}`}
                                  title={summary}
                                >
                                  {summary}
                                </span>
                              </div>
                            );
                          })()}
                        </TableCell>
                      )}

                      {/* Orders — active / completed as one dense cell */}
                      <TableCell className="text-right tabular-nums">
                        <div className="leading-tight">
                          <div className="text-[15px] font-semibold text-foreground">
                            {member.assignedOrders}
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            {member.completedOrders} done
                          </div>
                        </div>
                      </TableCell>

                      {/* Joined */}
                      <TableCell className="text-[12px] text-muted-foreground whitespace-nowrap">
                        {member.joinedDate}
                      </TableCell>

                      {/* Auto clock-out — a toggle on EVERY row for visual
                          consistency (on = monitored, off = exempt). Admin
                          members are always exempt by policy, so their
                          toggle renders off + disabled with a tooltip
                          explaining why instead of disappearing. */}
                      {isAdminViewer && (
                        <TableCell>
                          {member.role !== "admin" ? (
                            <div className="flex items-center gap-2">
                              <Switch
                                checked={!member.monitoringExempt}
                                disabled={monitoringExemptMutation.isPending}
                                onCheckedChange={(on) =>
                                  monitoringExemptMutation.mutate({
                                    userId: member.id,
                                    exempt: !on,
                                  })
                                }
                                data-testid={`switch-monitoring-${member.id}`}
                                aria-label="Toggle auto clock-out monitoring"
                              />
                              <span className="text-[11px] text-muted-foreground">
                                {member.monitoringExempt ? "Off" : "On"}
                              </span>
                            </div>
                          ) : (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="flex items-center gap-2">
                                  <Switch
                                    checked={false}
                                    disabled
                                    data-testid={`switch-monitoring-${member.id}`}
                                    aria-label="Admins are always exempt from auto clock-out"
                                  />
                                  <span className="text-[11px] text-muted-foreground">
                                    Off
                                  </span>
                                </div>
                              </TooltipTrigger>
                              <TooltipContent side="left">
                                Admins are always exempt from auto clock-out
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </TableCell>
                      )}

                      {/* Actions — every per-row action lives here, and only
                          here: one kebab per row, no inline buttons anywhere
                          else in the table. */}
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              data-testid={`button-actions-${member.id}`}
                            >
                              <MoreHorizontal className="h-4 w-4" />
                              <span className="sr-only">Open actions</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-56">
                            <DropdownMenuLabel className="truncate">
                              {member.name}
                            </DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              data-testid={`button-call-${member.id}`}
                            >
                              <PhoneCall className="h-4 w-4 mr-2" />
                              Call
                            </DropdownMenuItem>
                            {isAdminViewer && (
                              <>
                                <DropdownMenuSeparator />
                                {member.autoClosedAttendanceId && (
                                  <DropdownMenuItem
                                    disabled={reactivateMutation.isPending}
                                    onSelect={() =>
                                      reactivateMutation.mutate(
                                        member.autoClosedAttendanceId!,
                                      )
                                    }
                                    data-testid={`button-reactivate-${member.id}`}
                                  >
                                    <RotateCcw className="h-4 w-4 mr-2" />
                                    Reactivate shift
                                  </DropdownMenuItem>
                                )}
                                {!isSelf && (
                                  <DropdownMenuItem
                                    onSelect={() => handleEditRole(member)}
                                    data-testid={`button-edit-role-${member.id}`}
                                  >
                                    <Pencil className="h-4 w-4 mr-2" />
                                    Change role
                                  </DropdownMenuItem>
                                )}
                                {member.role === "agent" && (
                                  <DropdownMenuItem
                                    onSelect={() => handleEditExtension(member)}
                                    data-testid={`button-edit-extension-${member.id}`}
                                  >
                                    <Hash className="h-4 w-4 mr-2" />
                                    Edit extension
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem
                                  onSelect={() => handleEditCompensation(member)}
                                  data-testid={`button-edit-compensation-${member.id}`}
                                >
                                  <MapPin className="h-4 w-4 mr-2" />
                                  Edit compensation
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onSelect={() => setUserForStoreAccess(member)}
                                  data-testid={`button-manage-store-access-${member.id}`}
                                >
                                  <Store className="h-4 w-4 mr-2" />
                                  Manage store access
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onSelect={() => setUserForModuleAccess(member)}
                                  data-testid={`button-manage-page-access-${member.id}`}
                                >
                                  <KeyRound className="h-4 w-4 mr-2" />
                                  Manage page access
                                </DropdownMenuItem>
                                {!isSelf && (
                                  <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      onSelect={() => handleDeleteUser(member)}
                                      className="text-destructive focus:text-destructive"
                                      data-testid={`button-delete-${member.id}`}
                                    >
                                      <Trash2 className="h-4 w-4 mr-2" />
                                      Delete member
                                    </DropdownMenuItem>
                                  </>
                                )}
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
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
                        <SelectItem value="agent">Order Confirmation Executive (OCE)</SelectItem>
                        <SelectItem value="ndr_rto">NDR/RTO Executive</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="recovery_agent">Inside Sales Executive (ISE)</SelectItem>
                        <SelectItem value="chat_support">Chat Support</SelectItem>
                        <SelectItem value="developer">Developer</SelectItem>
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
                name="couponCode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Personal coupon code</FormLabel>
                    <FormControl>
                      <Input
                        type="text"
                        placeholder="AGENT10"
                        {...field}
                        value={field.value ?? ""}
                        data-testid="input-coupon-code"
                        className="font-mono uppercase"
                        autoCapitalize="characters"
                        autoCorrect="off"
                        spellCheck={false}
                      />
                    </FormControl>
                    <p className="text-xs text-muted-foreground">
                      The Shopify discount code this agent gives to customers.
                      Orders carrying it are attributed to them on their
                      "My Converted Orders" page and drive their commission.
                      Leave blank if not applicable.
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

      {/* Edit role — per-member. Admin-only, and the pencil that opens this
          is hidden on your own card so an admin can't accidentally demote
          themselves (matching the server-side self-role-change block). */}
      <Dialog
        open={editRoleDialogOpen}
        onOpenChange={(open) => {
          setEditRoleDialogOpen(open);
          if (!open) {
            setUserToEditRole(null);
            roleForm.reset();
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Change role</DialogTitle>
            <DialogDescription>
              Update the role for{" "}
              <span className="font-medium text-foreground">
                {userToEditRole?.name}
              </span>
              . Applies on their next page load.
            </DialogDescription>
          </DialogHeader>

          <Form {...roleForm}>
            <form
              onSubmit={roleForm.handleSubmit(handleUpdateRole)}
              className="space-y-4"
            >
              <FormField
                control={roleForm.control}
                name="role"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Role *</FormLabel>
                    <Select
                      onValueChange={(v) => {
                        field.onChange(v);
                        // Reset adminType when role flips away from admin so we
                        // don't submit a stale value the server will ignore anyway.
                        if (v !== "admin") {
                          roleForm.setValue("adminType", "NONE");
                        } else if (roleForm.getValues("adminType") === "NONE") {
                          roleForm.setValue("adminType", "full_control");
                        }
                      }}
                      value={field.value}
                    >
                      <FormControl>
                        <SelectTrigger data-testid="select-edit-role">
                          <SelectValue placeholder="Select role" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="agent">
                          Order Confirmation Executive (OCE)
                        </SelectItem>
                        <SelectItem value="ndr_rto">NDR/RTO Executive</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="recovery_agent">
                          Inside Sales Executive (ISE)
                        </SelectItem>
                        <SelectItem value="chat_support">Chat Support</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {roleWatch === "admin" && (
                <>
                  <FormField
                    control={roleForm.control}
                    name="adminType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Admin type *</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value === "NONE" ? "full_control" : field.value}
                        >
                          <FormControl>
                            <SelectTrigger data-testid="select-edit-admin-type">
                              <SelectValue placeholder="Select admin type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="full_control">
                              Full control
                            </SelectItem>
                            <SelectItem value="partial_control">
                              Partial control
                            </SelectItem>
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                          Full-control admins have every admin capability
                          (payroll, integrations, invites, role changes).
                          Partial admins are limited to what you grant them.
                        </p>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Alert>
                    <ShieldAlert className="h-4 w-4" />
                    <AlertDescription>
                      Promoting to admin grants elevated access. Only full-control
                      admins can create other admins.
                    </AlertDescription>
                  </Alert>
                </>
              )}

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setEditRoleDialogOpen(false);
                    setUserToEditRole(null);
                    roleForm.reset();
                  }}
                  disabled={updateRoleMutation.isPending}
                  data-testid="button-cancel-role"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={updateRoleMutation.isPending}
                  data-testid="button-submit-role"
                >
                  {updateRoleMutation.isPending ? (
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

      {/* Phase 4: per-user store access modal. Driven by the
          userForStoreAccess state above — set on Manage-Access
          button click, cleared on close. */}
      <ManageStoreAccessDialog
        open={!!userForStoreAccess}
        onOpenChange={(next) => {
          if (!next) setUserForStoreAccess(null);
        }}
        user={
          userForStoreAccess
            ? {
                id: userForStoreAccess.id,
                fullName: userForStoreAccess.name,
                email: userForStoreAccess.email,
                role: userForStoreAccess.role,
              }
            : null
        }
      />

      {/* Per-user page (module) access modal. */}
      <ManageModuleAccessDialog
        open={!!userForModuleAccess}
        onOpenChange={(next) => {
          if (!next) setUserForModuleAccess(null);
        }}
        user={
          userForModuleAccess
            ? {
                id: userForModuleAccess.id,
                fullName: userForModuleAccess.name,
                moduleAccess: userForModuleAccess.moduleAccess,
              }
            : null
        }
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
