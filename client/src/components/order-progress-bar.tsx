import { cn } from "@/lib/utils";

interface ProgressStep {
  label: string;
  count: number;
  status: "assigned" | "confirmed" | "cancelled" | "followup" | "failed";
}

interface OrderProgressBarProps {
  steps: ProgressStep[];
  activeStep: string;
  onStepClick: (status: string) => void;
}

export function OrderProgressBar({ steps, activeStep, onStepClick }: OrderProgressBarProps) {
  // Find the baseline (Assigned count)
  const assignedCount = steps.find(s => s.status === "assigned")?.count || 1;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        {steps.map((step, index) => {
          // Assigned is always 100%, others are relative to Assigned count
          let fillPercentage: number;
          if (step.status === "assigned") {
            fillPercentage = 100;
          } else {
            fillPercentage = assignedCount > 0 ? Math.min((step.count / assignedCount) * 100, 100) : 0;
          }
          
          const isActive = activeStep === step.status;
          
          return (
            <div key={step.status} className="flex-1">
              <button
                onClick={() => onStepClick(step.status)}
                className={cn(
                  "w-full group",
                  "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-md"
                )}
                data-testid={`progress-step-${step.status}`}
              >
                <div className="space-y-2">
                  {/* Progress bar segment */}
                  <div
                    className={cn(
                      "h-2 rounded-full transition-all duration-200 relative overflow-hidden",
                      isActive ? "ring-2 ring-primary ring-offset-2" : "",
                      "hover-elevate cursor-pointer"
                    )}
                    style={{ 
                      backgroundColor: step.count === 0 ? '#e5e7eb' : undefined,
                      opacity: step.count === 0 ? 0.3 : 1
                    }}
                  >
                    {step.count > 0 && (
                      <div
                        className={cn(
                          "h-full rounded-full transition-all duration-200",
                          step.status === "assigned" && "bg-blue-500",
                          step.status === "confirmed" && "bg-green-500",
                          step.status === "cancelled" && "bg-gray-400",
                          step.status === "followup" && "bg-amber-500",
                          step.status === "failed" && "bg-red-500"
                        )}
                        style={{ width: `${fillPercentage}%` }}
                      />
                    )}
                  </div>
                  
                  {/* Label and count */}
                  <div className="text-center">
                    <div
                      className={cn(
                        "text-sm font-medium transition-colors",
                        isActive ? "text-foreground" : "text-muted-foreground group-hover:text-foreground"
                      )}
                    >
                      {step.label}
                    </div>
                    <div
                      className={cn(
                        "text-xs transition-colors mt-0.5",
                        isActive ? "text-foreground font-semibold" : "text-muted-foreground"
                      )}
                    >
                      {step.count} {step.count === 1 ? "order" : "orders"}
                    </div>
                  </div>
                </div>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
