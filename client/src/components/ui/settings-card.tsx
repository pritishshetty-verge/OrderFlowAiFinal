import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LucideIcon } from "lucide-react";

interface SettingsCardProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
  testId?: string;
}

export function SettingsCard({ icon: Icon, title, description, children, action, testId }: SettingsCardProps) {
  return (
    <Card data-testid={testId}>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              {Icon && <Icon className="h-5 w-5 text-muted-foreground" />}
              <CardTitle>{title}</CardTitle>
            </div>
            {description && <CardDescription className="mt-1.5">{description}</CardDescription>}
          </div>
          {action && <div className="flex-shrink-0">{action}</div>}
        </div>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
