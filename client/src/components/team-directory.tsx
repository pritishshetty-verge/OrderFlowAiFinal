import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Mail, Phone, Calendar, CheckCircle2, XCircle } from "lucide-react";
import type { User, Order as BackendOrder } from "@shared/schema";
import { format } from "date-fns";

interface TeamMember {
  id: string;
  name: string;
  role: "admin" | "manager" | "agent";
  email: string;
  phone: string;
  status: "active" | "on-leave" | "offline";
  assignedOrders: number;
  completedOrders: number;
  joinedDate: string;
}

interface TeamDirectoryProps {
  userRole: "admin" | "manager" | "agent";
}

export function TeamDirectory({ userRole }: TeamDirectoryProps) {
  // Fetch users and orders from backend
  const { data: users, isLoading: usersLoading } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });

  const { data: orders, isLoading: ordersLoading } = useQuery<BackendOrder[]>({
    queryKey: ["/api/orders"],
  });

  const isLoading = usersLoading || ordersLoading;

  // Transform users to team members with order counts
  const teamMembers = useMemo<TeamMember[]>(() => {
    if (!users || !orders) return [];

    return users.map((user) => {
      const userOrders = orders.filter((o) => o.assignedTo === user.id);
      const completedOrders = userOrders.filter(
        (o) => o.status === "delivered" || o.status === "confirmed"
      );

      return {
        id: user.id,
        name: user.fullName,
        role: user.role as TeamMember["role"],
        email: user.email,
        phone: user.phone || "N/A",
        status: user.isActive ? "active" : "offline",
        assignedOrders: userOrders.filter(
          (o) => o.status !== "delivered" && o.status !== "cancelled"
        ).length,
        completedOrders: completedOrders.length,
        joinedDate: format(new Date(user.createdAt), "MMM yyyy"),
      };
    });
  }, [users, orders]);

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
      case "manager":
        return "secondary";
      case "agent":
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
        {(userRole === "admin" || userRole === "manager") && (
          <Button data-testid="button-add-member">Add Member</Button>
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
                  {member.role}
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
                <div className="flex items-center gap-2 text-sm">
                  <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-muted-foreground text-xs">
                    Joined {member.joinedDate}
                  </span>
                </div>
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
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
