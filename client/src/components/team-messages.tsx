import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Send, Search } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { User, TeamMessage as BackendMessage } from "@shared/schema";

interface TeamMessagesProps {
  userRole: "admin" | "manager" | "agent";
}

export function TeamMessages({ userRole }: TeamMessagesProps) {
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [messageText, setMessageText] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const currentUserId = localStorage.getItem("userId") || "";

  // Fetch all users
  const { data: users, isLoading: usersLoading } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });

  // Fetch conversation with selected user
  const { data: messages, isLoading: messagesLoading } = useQuery<BackendMessage[]>({
    queryKey: ["/api/messages", currentUserId, selectedUserId],
    queryFn: async () => {
      if (!selectedUserId) return [];
      const response = await fetch(`/api/messages/${currentUserId}/${selectedUserId}`);
      if (!response.ok) throw new Error("Failed to fetch messages");
      return response.json();
    },
    enabled: !!selectedUserId,
  });

  // Send message mutation
  const sendMutation = useMutation({
    mutationFn: async (message: string) => {
      const res = await apiRequest("POST", "/api/messages", {
        fromUserId: currentUserId,
        toUserId: selectedUserId,
        message,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ 
        queryKey: ["/api/messages", currentUserId, selectedUserId] 
      });
      setMessageText("");
    },
  });

  const handleSendMessage = () => {
    if (!messageText.trim() || !selectedUserId) return;
    sendMutation.mutate(messageText);
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase();
  };

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case "admin":
        return "default";
      case "manager":
        return "secondary";
      case "agent":
        return "outline";
      default:
        return "outline";
    }
  };

  // Filter users based on search and exclude current user
  const filteredUsers = users
    ?.filter((u) => u.id !== currentUserId)
    ?.filter((u) =>
      u.fullName.toLowerCase().includes(searchQuery.toLowerCase())
    ) || [];

  const selectedUser = users?.find((u) => u.id === selectedUserId);

  if (usersLoading) {
    return (
      <div className="flex gap-4 h-[600px]">
        <Skeleton className="w-80 h-full" data-testid="skeleton-users-list" />
        <Skeleton className="flex-1 h-full" data-testid="skeleton-conversation" />
      </div>
    );
  }

  return (
    <div className="flex gap-4 h-[600px]">
      <Card className="w-80">
        <CardContent className="p-4 h-full flex flex-col">
          <div className="mb-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search team members..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
                data-testid="input-search-users"
              />
            </div>
          </div>

          <ScrollArea className="flex-1">
            <div className="space-y-2">
              {filteredUsers.map((user) => (
                <button
                  key={user.id}
                  onClick={() => setSelectedUserId(user.id)}
                  className={cn(
                    "w-full flex items-center gap-3 p-3 rounded-lg hover-elevate active-elevate-2 text-left transition-colors",
                    selectedUserId === user.id && "bg-accent"
                  )}
                  data-testid={`button-user-${user.id}`}
                >
                  <Avatar className="h-10 w-10">
                    <AvatarFallback className="text-sm">
                      {getInitials(user.fullName)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-sm truncate">{user.fullName}</p>
                      <Badge
                        variant={getRoleBadgeVariant(user.role)}
                        className="text-xs capitalize"
                      >
                        {user.role}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {user.email}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      <Card className="flex-1">
        <CardContent className="p-0 h-full flex flex-col">
          {!selectedUser ? (
            <div className="flex-1 flex items-center justify-center text-center p-8">
              <div>
                <h3 className="text-lg font-semibold mb-2">No conversation selected</h3>
                <p className="text-muted-foreground text-sm">
                  Select a team member to start messaging
                </p>
              </div>
            </div>
          ) : (
            <>
              <div className="border-b p-4">
                <div className="flex items-center gap-3">
                  <Avatar className="h-10 w-10">
                    <AvatarFallback className="text-sm">
                      {getInitials(selectedUser.fullName)}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-semibold">{selectedUser.fullName}</p>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={getRoleBadgeVariant(selectedUser.role)}
                        className="text-xs capitalize"
                      >
                        {selectedUser.role}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {selectedUser.email}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <ScrollArea className="flex-1 p-4">
                {messagesLoading ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                      <Skeleton
                        key={i}
                        className="h-16 w-full"
                        data-testid={`skeleton-message-${i}`}
                      />
                    ))}
                  </div>
                ) : !messages || messages.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-center">
                    <p className="text-muted-foreground text-sm">
                      No messages yet. Start the conversation!
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {messages.map((message) => {
                      const isFromCurrentUser = message.fromUserId === currentUserId;
                      return (
                        <div
                          key={message.id}
                          className={cn(
                            "flex gap-3",
                            isFromCurrentUser ? "flex-row-reverse" : "flex-row"
                          )}
                          data-testid={`message-${message.id}`}
                        >
                          <Avatar className="h-8 w-8">
                            <AvatarFallback className="text-xs">
                              {isFromCurrentUser
                                ? "You"
                                : getInitials(selectedUser.fullName)}
                            </AvatarFallback>
                          </Avatar>
                          <div
                            className={cn(
                              "flex flex-col max-w-[70%]",
                              isFromCurrentUser ? "items-end" : "items-start"
                            )}
                          >
                            <div
                              className={cn(
                                "rounded-lg px-4 py-2",
                                isFromCurrentUser
                                  ? "bg-primary text-primary-foreground"
                                  : "bg-muted"
                              )}
                            >
                              <p className="text-sm">{message.message}</p>
                            </div>
                            <span className="text-xs text-muted-foreground mt-1">
                              {format(new Date(message.createdAt), "MMM dd, h:mm a")}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </ScrollArea>

              <div className="border-t p-4">
                <div className="flex gap-2">
                  <Input
                    placeholder="Type a message..."
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage();
                      }
                    }}
                    disabled={sendMutation.isPending}
                    data-testid="input-message"
                  />
                  <Button
                    onClick={handleSendMessage}
                    disabled={!messageText.trim() || sendMutation.isPending}
                    data-testid="button-send-message"
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
