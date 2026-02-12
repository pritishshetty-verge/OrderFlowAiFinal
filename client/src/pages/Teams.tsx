import { PageLayout } from "@/components/page-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Users } from "lucide-react";

export default function TeamsPlaceholder() {
  return (
    <PageLayout title="Teams">
      <div className="p-4 flex-1 overflow-auto">
        <Card data-testid="card-teams">
          <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <Users className="h-12 w-12 mb-3 opacity-40" />
            <p className="text-sm font-medium" data-testid="text-teams-message">Team management coming soon.</p>
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  );
}
