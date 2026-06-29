import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Save, Check } from "lucide-react";
import { useTheme, ACCENTS } from "@/components/theme-provider";
import { cn } from "@/lib/utils";

export function PreferencesSettings() {
  const { toast } = useToast();
  const { theme, setTheme, accent, setAccent } = useTheme();
  const [preferences, setPreferences] = useState({
    language: "en",
    timezone: "Asia/Kolkata",
    dateFormat: "DD/MM/YYYY",
    currency: "INR",
    autoRefresh: true,
    compactView: false,
    showOrderId: true,
  });

  const handleSave = () => {
    toast({
      title: "Preferences Updated",
      description: "Your preferences have been saved successfully.",
    });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>Customize how the application looks</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Theme</Label>
              <p className="text-sm text-muted-foreground">
                Choose between light and dark mode
              </p>
            </div>
            <Select value={theme} onValueChange={setTheme}>
              <SelectTrigger className="w-[180px]" data-testid="select-theme">
                <SelectValue placeholder="Select theme" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="light">Light</SelectItem>
                <SelectItem value="dark">Dark</SelectItem>
                <SelectItem value="system">System</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Accent color</Label>
              <p className="text-sm text-muted-foreground">
                Pick the brand accent used across the app
              </p>
            </div>
            <div className="flex items-center gap-2">
              {ACCENTS.map((a) => (
                <button
                  key={a.value}
                  type="button"
                  onClick={() => setAccent(a.value)}
                  aria-label={a.label}
                  aria-pressed={accent === a.value}
                  title={a.label}
                  className={cn(
                    "h-7 w-7 rounded-full border border-black/10 dark:border-white/15 flex items-center justify-center transition-transform hover:scale-110 outline-none focus-visible:ring-2 focus-visible:ring-foreground/40",
                    accent === a.value && "ring-2 ring-offset-2 ring-offset-background ring-foreground/60",
                  )}
                  style={{ backgroundImage: a.gradient }}
                  data-testid={`accent-${a.value}`}
                >
                  {accent === a.value && <Check className="h-3.5 w-3.5 text-white" />}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="compact-view">Compact View</Label>
              <p className="text-sm text-muted-foreground">
                Use a more condensed layout
              </p>
            </div>
            <Switch
              id="compact-view"
              checked={preferences.compactView}
              onCheckedChange={(checked) =>
                setPreferences({ ...preferences, compactView: checked })
              }
              data-testid="switch-compact-view"
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="show-order-id">Show Order IDs</Label>
              <p className="text-sm text-muted-foreground">
                Display Shopify order IDs in tables
              </p>
            </div>
            <Switch
              id="show-order-id"
              checked={preferences.showOrderId}
              onCheckedChange={(checked) =>
                setPreferences({ ...preferences, showOrderId: checked })
              }
              data-testid="switch-show-order-id"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Regional Settings</CardTitle>
          <CardDescription>Configure language and regional preferences</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="language">Language</Label>
              <Select
                value={preferences.language}
                onValueChange={(value) =>
                  setPreferences({ ...preferences, language: value })
                }
              >
                <SelectTrigger id="language" data-testid="select-language">
                  <SelectValue placeholder="Select language" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="hi">Hindi</SelectItem>
                  <SelectItem value="mr">Marathi</SelectItem>
                  <SelectItem value="ta">Tamil</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="timezone">Timezone</Label>
              <Select
                value={preferences.timezone}
                onValueChange={(value) =>
                  setPreferences({ ...preferences, timezone: value })
                }
              >
                <SelectTrigger id="timezone" data-testid="select-timezone">
                  <SelectValue placeholder="Select timezone" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Asia/Kolkata">IST (Asia/Kolkata)</SelectItem>
                  <SelectItem value="Asia/Dubai">GST (Asia/Dubai)</SelectItem>
                  <SelectItem value="UTC">UTC</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="date-format">Date Format</Label>
              <Select
                value={preferences.dateFormat}
                onValueChange={(value) =>
                  setPreferences({ ...preferences, dateFormat: value })
                }
              >
                <SelectTrigger id="date-format" data-testid="select-date-format">
                  <SelectValue placeholder="Select date format" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="DD/MM/YYYY">DD/MM/YYYY</SelectItem>
                  <SelectItem value="MM/DD/YYYY">MM/DD/YYYY</SelectItem>
                  <SelectItem value="YYYY-MM-DD">YYYY-MM-DD</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="currency">Currency</Label>
              <Select
                value={preferences.currency}
                onValueChange={(value) =>
                  setPreferences({ ...preferences, currency: value })
                }
              >
                <SelectTrigger id="currency" data-testid="select-currency">
                  <SelectValue placeholder="Select currency" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="INR">₹ INR (Indian Rupee)</SelectItem>
                  <SelectItem value="USD">$ USD (US Dollar)</SelectItem>
                  <SelectItem value="EUR">€ EUR (Euro)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Application Behavior</CardTitle>
          <CardDescription>Configure how the application behaves</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="auto-refresh">Auto Refresh</Label>
              <p className="text-sm text-muted-foreground">
                Automatically refresh orders every minute
              </p>
            </div>
            <Switch
              id="auto-refresh"
              checked={preferences.autoRefresh}
              onCheckedChange={(checked) =>
                setPreferences({ ...preferences, autoRefresh: checked })
              }
              data-testid="switch-auto-refresh"
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} data-testid="button-save-preferences">
          <Save className="h-4 w-4 mr-2" />
          Save Preferences
        </Button>
      </div>
    </div>
  );
}
