import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Bell, BellOff } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatDistanceToNow } from "date-fns";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  orderId: string | null;
  isRead: boolean;
  readAt: Date | null;
  actionUrl: string | null;
  createdAt: Date;
}

export function NotificationsBell() {
  const { toast } = useToast();
  const [location, setLocation] = useLocation();
  const [open, setOpen] = useState(false);
  const userId = localStorage.getItem("userId");

  // Fetch unread count. apiRequest routes through the
  // X-Active-Store-Id interceptor (was raw fetch pre-Phase-5; the
  // sweep missed this file).
  const { data: unreadCountData } = useQuery<{ count: number }>({
    queryKey: ["/api/notifications/unread-count", userId],
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/notifications/unread-count?userId=${userId}`,
      );
      return res.json();
    },
    enabled: !!userId,
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  // Fetch notifications when popover is open.
  const { data: notifications = [], isLoading } = useQuery<Notification[]>({
    queryKey: ["/api/notifications", userId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/notifications?userId=${userId}`);
      return res.json();
    },
    enabled: open && !!userId,
  });

  // Mark as read mutation
  const markAsReadMutation = useMutation({
    mutationFn: async (notificationId: string) => {
      const res = await apiRequest("PATCH", `/api/notifications/${notificationId}/read`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to mark notification as read",
        variant: "destructive",
      });
    },
  });

  // Mark all as read mutation
  const markAllAsReadMutation = useMutation({
    mutationFn: async () => {
      if (!userId) throw new Error("User ID not available");
      const res = await apiRequest("PATCH", "/api/notifications/read-all", { userId });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
      toast({
        title: "Success",
        description: "All notifications marked as read",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to mark all notifications as read",
        variant: "destructive",
      });
    },
  });

  const unreadCount = unreadCountData?.count || 0;

  const handleNotificationClick = (notification: Notification) => {
    if (!notification.isRead) {
      markAsReadMutation.mutate(notification.id);
    }

    // Close the popover first. With modal={false} on the Popover
    // root (see render below), Radix doesn't apply the body-level
    // `pointer-events: none` trick, so the cleanup-vs-navigation
    // race that caused the "screen freezes" bug is structurally
    // gone. The requestAnimationFrame defer below is belt-and-
    // braces: it gives Radix one frame to finish its dismiss
    // animation before the route swap mounts a new page on top of
    // the popover's transition.
    setOpen(false);

    requestAnimationFrame(() => {
      if (notification.orderId) {
        // Both branches did the same thing previously; collapsed.
        setLocation(`/orders?selected_order=${notification.orderId}`);
      } else if (notification.actionUrl) {
        setLocation(notification.actionUrl);
      }
    });
  };

  const handleMarkAllAsRead = () => {
    markAllAsReadMutation.mutate();
  };

  return (
    // modal={false} — notification popovers are informational
    // dropdowns, not focus-trapping modals. The Radix default
    // (modal behaviour) applies `pointer-events: none` to siblings
    // outside the popover layer; that style sometimes lingers when
    // a click handler navigates immediately after closing the
    // popover, freezing the new page. Non-modal is the correct
    // contract for this surface and eliminates the entire class of
    // pointer-events-leftover bugs.
    <Popover open={open} onOpenChange={setOpen} modal={false}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          data-testid="button-notifications"
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span
              className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-brand text-brand-foreground text-[10px] font-semibold flex items-center justify-center ring-2 ring-background shadow-sm"
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[360px] p-0" align="end" data-testid="popover-notifications">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-sm">Notifications</h3>
            {unreadCount > 0 && (
              <span className="inline-flex items-center justify-center rounded-full bg-brand/10 text-brand text-[11px] font-semibold min-w-[20px] h-5 px-1.5">
                {unreadCount}
              </span>
            )}
          </div>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleMarkAllAsRead}
              disabled={markAllAsReadMutation.isPending}
              data-testid="button-mark-all-read"
              className="text-xs text-brand hover:text-brand h-7"
            >
              Mark all as read
            </Button>
          )}
        </div>

        <ScrollArea className="h-[400px]">
          {isLoading ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              Loading notifications…
            </div>
          ) : notifications.length === 0 ? (
            <EmptyState
              icon={BellOff}
              title="No notifications"
              description="You're all caught up. New activity will show up here."
            />
          ) : (
            <div className="divide-y divide-border/60">
              {notifications.map((notification) => (
                <button
                  key={notification.id}
                  onClick={() => handleNotificationClick(notification)}
                  className={cn(
                    "w-full text-left transition-colors relative pl-4 pr-3 py-3",
                    "hover:bg-muted/50",
                    !notification.isRead && "bg-brand/5",
                  )}
                  data-testid={`notification-${notification.id}`}
                >
                  {!notification.isRead && (
                    <span className="absolute left-0 top-0 bottom-0 w-0.5 bg-brand" aria-hidden />
                  )}
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <p className={cn(
                          "text-sm truncate",
                          !notification.isRead ? "font-semibold text-foreground" : "font-medium text-foreground",
                        )}>
                          {notification.title}
                        </p>
                        {!notification.isRead && (
                          <span className="h-1.5 w-1.5 rounded-full bg-brand shrink-0" />
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                        {notification.message}
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-1.5">
                        {formatDistanceToNow(new Date(notification.createdAt), {
                          addSuffix: true,
                        })}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>

        {notifications.length > 0 && (
          <div className="border-t p-1.5 bg-muted/30">
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-xs h-8"
              onClick={() => setOpen(false)}
              data-testid="button-view-all"
            >
              View all notifications
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
