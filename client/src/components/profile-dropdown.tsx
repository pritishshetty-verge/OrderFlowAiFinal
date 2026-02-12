import { useState } from "react";
import { useLocation } from "wouter";
import { ChevronUp, User, Settings, Moon, Sun, LogOut } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Switch } from "@/components/ui/switch";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { useTheme } from "@/components/theme-provider";

interface ProfileDropdownProps {
  userRole: string;
  userName?: string;
  userEmail?: string;
  avatarImage?: string;
}

export function ProfileDropdown({ userRole, userName, userEmail, avatarImage }: ProfileDropdownProps) {
  const [, setLocation] = useLocation();
  const [open, setOpen] = useState(false);
  const { theme, setTheme } = useTheme();

  const handleLogout = () => {
    localStorage.removeItem("userRole");
    localStorage.removeItem("userId");
    localStorage.removeItem("userEmail");
    setLocation("/login");
  };

  const handleNavigation = (path: string) => {
    setOpen(false);
    setLocation(path);
  };

  const displayName = userName || (userRole === "admin" ? "Admin User" : userRole === "manager" ? "Manager" : "Agent");
  const initials = userName 
    ? userName.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : userRole === "admin" ? "AD" : userRole === "manager" ? "MG" : "AG";
  const avatarSrc = avatarImage ? `/avatars/${avatarImage}` : undefined;

  const menuItems = [
    {
      icon: User,
      label: "Profile",
      onClick: () => handleNavigation("/profile"),
    },
    {
      icon: Settings,
      label: "Settings",
      onClick: () => handleNavigation("/settings"),
    },
  ];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="flex items-center gap-3 w-full rounded-lg p-2 hover-elevate transition-colors cursor-pointer"
          data-testid="button-profile-dropdown"
        >
          <Avatar className="h-9 w-9">
            {avatarSrc && <AvatarImage src={avatarSrc} alt={displayName} className="object-cover" />}
            <AvatarFallback className="text-xs bg-primary/10 text-primary">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col flex-1 min-w-0 text-left">
            <span className="text-sm font-medium truncate">{displayName}</span>
            <span className="text-xs text-muted-foreground capitalize">{userRole}</span>
          </div>
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        className="w-56 p-1"
        sideOffset={8}
      >
        <div className="py-1">
          {menuItems.map((item) => (
            <button
              key={item.label}
              onClick={item.onClick}
              className="flex items-center gap-3 w-full rounded-md px-3 py-2 text-sm hover-elevate transition-colors"
              data-testid={`button-menu-${item.label.toLowerCase()}`}
            >
              <item.icon className="h-4 w-4 text-muted-foreground" />
              <span>{item.label}</span>
            </button>
          ))}
        </div>

        <Separator />

        <div className="p-1">
          <div
            className="flex items-center justify-between w-full rounded-md px-3 py-2 text-sm"
          >
            <div className="flex items-center gap-3">
              {theme === "dark" ? (
                <Moon className="h-4 w-4 text-muted-foreground" />
              ) : (
                <Sun className="h-4 w-4 text-muted-foreground" />
              )}
              <span>Dark mode</span>
            </div>
            <Switch
              checked={theme === "dark"}
              onCheckedChange={(checked) => setTheme(checked ? "dark" : "light")}
              data-testid="switch-dark-mode"
            />
          </div>
        </div>

        <Separator />

        <div className="p-1">
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 w-full rounded-md px-3 py-2 text-sm text-destructive hover:bg-destructive/10 transition-colors"
            data-testid="button-menu-logout"
          >
            <LogOut className="h-4 w-4" />
            <span>Log out</span>
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
