import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Mail, Phone, Calendar, CheckCircle2, XCircle } from "lucide-react";

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

//todo: remove mock functionality
const mockTeamMembers: TeamMember[] = [
  {
    id: "1",
    name: "Priya Sharma",
    role: "agent",
    email: "priya.sharma@orderflowai.com",
    phone: "+91 98765 12345",
    status: "active",
    assignedOrders: 12,
    completedOrders: 156,
    joinedDate: "Jan 2024",
  },
  {
    id: "2",
    name: "Amit Singh",
    role: "agent",
    email: "amit.singh@orderflowai.com",
    phone: "+91 98765 12346",
    status: "active",
    assignedOrders: 8,
    completedOrders: 142,
    joinedDate: "Feb 2024",
  },
  {
    id: "3",
    name: "Rahul Verma",
    role: "manager",
    email: "rahul.verma@orderflowai.com",
    phone: "+91 98765 12347",
    status: "active",
    assignedOrders: 5,
    completedOrders: 89,
    joinedDate: "Dec 2023",
  },
  {
    id: "4",
    name: "Sneha Patel",
    role: "agent",
    email: "sneha.patel@orderflowai.com",
    phone: "+91 98765 12348",
    status: "on-leave",
    assignedOrders: 0,
    completedOrders: 98,
    joinedDate: "Mar 2024",
  },
];

interface TeamDirectoryProps {
  userRole: "admin" | "manager" | "agent";
}

export function TeamDirectory({ userRole }: TeamDirectoryProps) {
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Team Members</h2>
          <p className="text-muted-foreground">
            {mockTeamMembers.length} total members
          </p>
        </div>
        {(userRole === "admin" || userRole === "manager") && (
          <Button data-testid="button-add-member">Add Member</Button>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {mockTeamMembers.map((member) => (
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
