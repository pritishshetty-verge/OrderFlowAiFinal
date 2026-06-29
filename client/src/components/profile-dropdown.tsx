import { useState } from "react";
import { useLocation } from "wouter";
import { ChevronUp, User, Settings, Moon, Sun, LogOut, Check, Palette } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Switch } from "@/components/ui/switch";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { useTheme, ACCENTS } from "@/components/theme-provider";
import { cn } from "@/lib/utils";

interface ProfileDropdownProps {
  userRole: string;
  userName?: string;
  userEmail?: string;
  avatarImage?: string;
}

export function ProfileDropdown({ userRole, userName, userEmail, avatarImage }: ProfileDropdownProps) {
  const [, setLocation] = useLocation();
  const [open, setOpen] = useState(false);
  const { theme, setTheme, accent, setAccent } = useTheme();

  const handleLogout = async () => {
    // Server-side: destroy the session row + clear the orderflow.sid
    // cookie. Wrapped so a network blip doesn't strand the user in
    // a half-logged-in state.
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });
    } catch (err) {
      console.warn("[logout] /api/auth/logout failed:", err);
    }
    // Client-side: clear the transitional localStorage shim so the
    // ~30 components that still read role/id from localStorage don't
    // think the user is still signed in. Also clear the Phase-3
    // active store id so a different user logging in next doesn't
    // inherit this user's store selection.
    localStorage.removeItem("userRole");
    localStorage.removeItem("userId");
    localStorage.removeItem("userEmail");
    localStorage.removeItem("userFullName");
    localStorage.removeItem("activeStoreId");
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
          className="flex items-center gap-3 w-full rounded-lg p-2 hover-elevate transition-colors cursor-pointer overflow-hidden group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-0 group-data-[collapsible=icon]:p-1"
          data-testid="button-profile-dropdown"
        >
          <Avatar className="h-9 w-9 shrink-0">
            {avatarSrc && <AvatarImage src={avatarSrc} alt={displayName} className="object-cover" />}
            <AvatarFallback className="text-xs font-semibold bg-brand/10 text-brand">
              {initials}
            </AvatarFallback>
          </Avatar>
          {/* Hide name/role + chevron in icon-collapsed mode so the
              footer cleanly fits inside the narrow rail. */}
          <div className="flex flex-col flex-1 min-w-0 text-left group-data-[collapsible=icon]:hidden">
            <span className="text-sm font-medium truncate">{displayName}</span>
            <span className="text-xs text-muted-foreground capitalize truncate">{userRole}</span>
          </div>
          <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0 group-data-[collapsible=icon]:hidden" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        className="w-64 p-1"
        sideOffset={8}
      >
        <div className="py-1">
          {menuItems.map((item) => (
            <button
              key={item.label}
              onClick={item.onClick}
              className="flex items-center gap-3 w-full rounded-md px-3 py-2 text-sm hover:bg-muted transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
              data-testid={`button-menu-${item.label.toLowerCase()}`}
            >
              <item.icon className="h-4 w-4 text-muted-foreground" />
              <span>{item.label}</span>
            </button>
          ))}
        </div>

        <Separator />

        <div className="p-1">
          <div className="flex items-center justify-between w-full rounded-md px-3 py-2 text-sm">
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
          {/* Accent picker — same control as Settings → Appearance, but
              one-click reachable from anywhere. Six swatches, persisted.
              Stacked layout: label on top, swatches in a row underneath so
              the ring + offset on the selected swatch never clips the
              popover edge. */}
          <div className="rounded-md px-3 py-2 text-sm">
            <div className="flex items-center gap-3 mb-2">
              <Palette className="h-4 w-4 text-muted-foreground" />
              <span>Accent</span>
            </div>
            <div className="flex items-center justify-between pl-7 pr-1">
              {ACCENTS.map((a) => (
                <button
                  key={a.value}
                  type="button"
                  onClick={() => setAccent(a.value)}
                  aria-label={a.label}
                  aria-pressed={accent === a.value}
                  title={a.label}
                  className={cn(
                    "h-5 w-5 rounded-full flex items-center justify-center border border-black/10 dark:border-white/15 transition-transform hover:scale-110 outline-none focus-visible:ring-2 focus-visible:ring-foreground/40",
                    accent === a.value && "ring-2 ring-offset-2 ring-offset-card ring-foreground/60",
                  )}
                  style={{ backgroundImage: a.gradient }}
                  data-testid={`accent-pick-${a.value}`}
                >
                  {accent === a.value && <Check className="h-2.5 w-2.5 text-white" />}
                </button>
              ))}
            </div>
          </div>
        </div>

        <Separator />

        <div className="p-1">
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 w-full rounded-md px-3 py-2 text-sm text-destructive hover:bg-destructive/10 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-destructive/40"
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
