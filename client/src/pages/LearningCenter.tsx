import { PageLayout } from "@/components/page-layout";
import { Card, CardContent } from "@/components/ui/card";
import { GraduationCap } from "lucide-react";

export default function LearningCenterPlaceholder() {
  return (
    <PageLayout title="Learning Center">
      <div className="p-4 flex-1 overflow-auto">
        <Card data-testid="card-learning-center">
          <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <GraduationCap className="h-12 w-12 mb-3 opacity-40" />
            <p className="text-sm font-medium" data-testid="text-learning-center-message">Training materials coming soon.</p>
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  );
}
