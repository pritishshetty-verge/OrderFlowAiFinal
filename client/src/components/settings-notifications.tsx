import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Save, Bell, Mail, MessageSquare } from "lucide-react";

export function NotificationsSettings() {
  const { toast } = useToast();
  const [notifications, setNotifications] = useState({
    emailNotifications: true,
    newOrders: true,
    orderUpdates: true,
    orderCancellations: true,
    teamMessages: true,
    leaveRequests: false,
    systemUpdates: true,
    pushNotifications: false,
    desktopNotifications: true,
    soundEnabled: true,
  });

  const handleSave = () => {
    toast({
      title: "Notification Settings Updated",
      description: "Your notification preferences have been saved.",
    });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            <CardTitle>Email Notifications</CardTitle>
          </div>
          <CardDescription>
            Manage which emails you receive from OrderSync
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="email-notifications">Email Notifications</Label>
              <p className="text-sm text-muted-foreground">
                Receive notifications via email
              </p>
            </div>
            <Switch
              id="email-notifications"
              checked={notifications.emailNotifications}
              onCheckedChange={(checked) =>
                setNotifications({ ...notifications, emailNotifications: checked })
              }
              data-testid="switch-email-notifications"
            />
          </div>

          {notifications.emailNotifications && (
            <div className="ml-4 space-y-4 border-l-2 pl-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="new-orders">New Orders</Label>
                  <p className="text-sm text-muted-foreground">
                    Get notified about new order assignments
                  </p>
                </div>
                <Switch
                  id="new-orders"
                  checked={notifications.newOrders}
                  onCheckedChange={(checked) =>
                    setNotifications({ ...notifications, newOrders: checked })
                  }
                  data-testid="switch-new-orders"
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="order-updates">Order Updates</Label>
                  <p className="text-sm text-muted-foreground">
                    Status changes and updates on your orders
                  </p>
                </div>
                <Switch
                  id="order-updates"
                  checked={notifications.orderUpdates}
                  onCheckedChange={(checked) =>
                    setNotifications({ ...notifications, orderUpdates: checked })
                  }
                  data-testid="switch-order-updates"
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="order-cancellations">Order Cancellations</Label>
                  <p className="text-sm text-muted-foreground">
                    Alerts when orders are cancelled
                  </p>
                </div>
                <Switch
                  id="order-cancellations"
                  checked={notifications.orderCancellations}
                  onCheckedChange={(checked) =>
                    setNotifications({ ...notifications, orderCancellations: checked })
                  }
                  data-testid="switch-order-cancellations"
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            <CardTitle>Team & Collaboration</CardTitle>
          </div>
          <CardDescription>Notifications for team activities</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="team-messages">Team Messages</Label>
              <p className="text-sm text-muted-foreground">
                New messages from team members
              </p>
            </div>
            <Switch
              id="team-messages"
              checked={notifications.teamMessages}
              onCheckedChange={(checked) =>
                setNotifications({ ...notifications, teamMessages: checked })
              }
              data-testid="switch-team-messages"
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="leave-requests">Leave Requests</Label>
              <p className="text-sm text-muted-foreground">
                Leave request approvals and updates
              </p>
            </div>
            <Switch
              id="leave-requests"
              checked={notifications.leaveRequests}
              onCheckedChange={(checked) =>
                setNotifications({ ...notifications, leaveRequests: checked })
              }
              data-testid="switch-leave-requests"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            <CardTitle>Browser Notifications</CardTitle>
          </div>
          <CardDescription>
            Configure in-app and desktop notifications
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="desktop-notifications">Desktop Notifications</Label>
              <p className="text-sm text-muted-foreground">
                Show notifications on your desktop
              </p>
            </div>
            <Switch
              id="desktop-notifications"
              checked={notifications.desktopNotifications}
              onCheckedChange={(checked) =>
                setNotifications({ ...notifications, desktopNotifications: checked })
              }
              data-testid="switch-desktop-notifications"
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="sound-enabled">Sound</Label>
              <p className="text-sm text-muted-foreground">
                Play sound for notifications
              </p>
            </div>
            <Switch
              id="sound-enabled"
              checked={notifications.soundEnabled}
              onCheckedChange={(checked) =>
                setNotifications({ ...notifications, soundEnabled: checked })
              }
              data-testid="switch-sound-enabled"
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="system-updates">System Updates</Label>
              <p className="text-sm text-muted-foreground">
                Updates about system maintenance and features
              </p>
            </div>
            <Switch
              id="system-updates"
              checked={notifications.systemUpdates}
              onCheckedChange={(checked) =>
                setNotifications({ ...notifications, systemUpdates: checked })
              }
              data-testid="switch-system-updates"
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} data-testid="button-save-notifications">
          <Save className="h-4 w-4 mr-2" />
          Save Notification Settings
        </Button>
      </div>
    </div>
  );
}
