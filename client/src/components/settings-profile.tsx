import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Check, Save, Loader2, Camera } from "lucide-react";
import type { User } from "@shared/schema";

const AVATAR_OPTIONS = ["avatar_1.png", "avatar_2.png", "avatar_3.png", "avatar_4.png", "avatar_5.png", "avatar_6.png"];

const profileSchema = z.object({
  username: z.string().min(2, "Username must be at least 2 characters"),
  fullName: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
  phone: z.string().optional(),
});

type ProfileFormValues = z.infer<typeof profileSchema>;

interface ProfileSettingsProps {
  userRole: "admin" | "manager" | "agent";
}

export function ProfileSettings({ userRole }: ProfileSettingsProps) {
  const { toast } = useToast();
  const userEmail = localStorage.getItem("userEmail");
  const [avatarDialogOpen, setAvatarDialogOpen] = useState(false);
  const [selectedAvatar, setSelectedAvatar] = useState<string | null>(null);

  const { data: user, isLoading } = useQuery<User>({
    queryKey: [`/api/users/by-email/${userEmail}`],
    enabled: !!userEmail,
  });

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      username: "",
      fullName: "",
      email: "",
      phone: "",
    },
  });

  useEffect(() => {
    if (user) {
      form.reset({
        username: user.username || "",
        fullName: user.fullName || "",
        email: user.email || "",
        phone: user.phone || "",
      });
    }
  }, [user, form]);

  const updateProfileMutation = useMutation({
    mutationFn: async (data: ProfileFormValues) => {
      if (!user?.id) throw new Error("User not found");
      return apiRequest("PATCH", `/api/users/${user.id}`, data);
    },
    onSuccess: () => {
      toast({
        title: "Profile Updated",
        description: "Your profile has been updated successfully.",
      });
      queryClient.invalidateQueries({ queryKey: [`/api/users/by-email/${userEmail}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Update Failed",
        description: error.message || "Failed to update profile. Please try again.",
        variant: "destructive",
      });
    },
  });

  const updateAvatarMutation = useMutation({
    mutationFn: async (avatarImage: string) => {
      if (!user?.id) throw new Error("User not found");
      return apiRequest("PATCH", `/api/users/${user.id}`, { avatarImage });
    },
    onSuccess: () => {
      toast({
        title: "Avatar Updated",
        description: "Your avatar has been changed successfully.",
      });
      setAvatarDialogOpen(false);
      setSelectedAvatar(null);
      queryClient.invalidateQueries({ queryKey: [`/api/users/by-email/${userEmail}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Update Failed",
        description: error.message || "Failed to update avatar. Please try again.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: ProfileFormValues) => {
    updateProfileMutation.mutate(data);
  };

  const getInitials = (name: string) => {
    if (!name) return "??";
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
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

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-64" />
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center gap-6">
              <Skeleton className="h-24 w-24 rounded-full" />
              <div className="space-y-2">
                <Skeleton className="h-6 w-32" />
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-3 w-24" />
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-10 w-full" />
              </div>
              <div className="space-y-2">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-10 w-full" />
              </div>
              <div className="space-y-2">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-10 w-full" />
              </div>
              <div className="space-y-2">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-10 w-full" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Profile Information</CardTitle>
          <CardDescription>
            Update your personal information and profile details
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center gap-6">
            <button
              type="button"
              onClick={() => {
                setSelectedAvatar(user?.avatarImage || null);
                setAvatarDialogOpen(true);
              }}
              className="relative group cursor-pointer"
              data-testid="button-edit-avatar"
            >
              <Avatar className="h-24 w-24">
                {user?.avatarImage && (
                  <AvatarImage 
                    src={`/avatars/${user.avatarImage}`} 
                    alt={form.watch("fullName")} 
                    className="object-cover"
                  />
                )}
                <AvatarFallback className="text-2xl">
                  {getInitials(form.watch("fullName"))}
                </AvatarFallback>
              </Avatar>
              <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                <Camera className="h-6 w-6 text-white" />
              </div>
            </button>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-semibold" data-testid="text-profile-name">
                  {form.watch("fullName") || "Your Name"}
                </h3>
                <Badge variant={getRoleBadgeVariant(user?.role || userRole)} className="capitalize" data-testid="badge-role">
                  {user?.role || userRole}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground" data-testid="text-profile-email">
                {form.watch("email")}
              </p>
              {user?.employeeId && (
                <p className="text-xs text-muted-foreground" data-testid="text-employee-id">
                  Employee ID: {user.employeeId}
                </p>
              )}
            </div>
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="username"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Username</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-username" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="fullName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Full Name</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input type="email" {...field} data-testid="input-email" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone Number</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-phone" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormItem>
                  <FormLabel>Role</FormLabel>
                  <FormControl>
                    <Input 
                      value={user?.role || userRole} 
                      disabled 
                      className="capitalize bg-muted" 
                      data-testid="input-role" 
                    />
                  </FormControl>
                </FormItem>
                <FormItem>
                  <FormLabel>Department</FormLabel>
                  <FormControl>
                    <Input 
                      value={user?.department || "Operations"} 
                      disabled 
                      className="bg-muted" 
                      data-testid="input-department" 
                    />
                  </FormControl>
                </FormItem>
              </div>

              <div className="flex justify-end pt-4">
                <Button 
                  type="submit" 
                  disabled={updateProfileMutation.isPending}
                  data-testid="button-save-profile"
                >
                  {updateProfileMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4 mr-2" />
                  )}
                  Save Changes
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>

      <Dialog open={avatarDialogOpen} onOpenChange={setAvatarDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Choose Avatar</DialogTitle>
            <DialogDescription>
              Select an avatar to personalize your profile
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-3 gap-4 py-4">
            {AVATAR_OPTIONS.map((avatar) => {
              const isSelected = selectedAvatar === avatar;
              return (
                <button
                  key={avatar}
                  type="button"
                  onClick={() => setSelectedAvatar(avatar)}
                  className={`relative rounded-full overflow-hidden aspect-square transition-all ${
                    isSelected 
                      ? "ring-2 ring-primary ring-offset-2 ring-offset-background" 
                      : "hover:ring-2 hover:ring-muted-foreground/50 hover:ring-offset-2 hover:ring-offset-background"
                  }`}
                  data-testid={`button-avatar-${avatar.replace('.png', '')}`}
                >
                  <img 
                    src={`/avatars/${avatar}`} 
                    alt={`Avatar option ${avatar}`}
                    className="w-full h-full object-cover"
                  />
                  {isSelected && (
                    <div className="absolute inset-0 flex items-center justify-center bg-primary/20">
                      <div className="bg-primary rounded-full p-1">
                        <Check className="h-4 w-4 text-primary-foreground" />
                      </div>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setAvatarDialogOpen(false);
                setSelectedAvatar(null);
              }}
              data-testid="button-cancel-avatar"
            >
              Cancel
            </Button>
            <Button
              onClick={() => selectedAvatar && updateAvatarMutation.mutate(selectedAvatar)}
              disabled={!selectedAvatar || selectedAvatar === user?.avatarImage || updateAvatarMutation.isPending}
              data-testid="button-save-avatar"
            >
              {updateAvatarMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader>
          <CardTitle>Account Statistics</CardTitle>
          <CardDescription>Your activity overview</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Orders Handled</p>
              <p className="text-2xl font-bold" data-testid="text-orders-handled">--</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Success Rate</p>
              <p className="text-2xl font-bold" data-testid="text-success-rate">--</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Account Age</p>
              <p className="text-2xl font-bold" data-testid="text-account-age">
                {user?.createdAt ? `${Math.floor((Date.now() - new Date(user.createdAt).getTime()) / (1000 * 60 * 60 * 24))} days` : "--"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
