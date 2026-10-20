import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTheme } from "@/components/theme-provider";

// Preferences is intentionally minimal: it holds only settings that are
// actually wired to real behavior. Today that's the theme (applied live by
// ThemeProvider, persisted on change — no Save button needed). The former
// Language / Timezone / Date-format / Currency / Auto-refresh / Compact-view
// / Show-order-id controls were removed because none of them persisted or
// affected anything.
export function PreferencesSettings() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>Customize how OrderFlow looks</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-0.5">
              <Label>Theme</Label>
              <p className="text-sm text-muted-foreground">
                Light, dark, or match your system setting
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
        </CardContent>
      </Card>
    </div>
  );
}
