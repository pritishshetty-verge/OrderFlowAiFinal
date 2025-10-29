import { cn } from "@/lib/utils";

interface ProgressStep {
  label: string;
  count: number;
  status: "all" | "assigned" | "pending" | "confirmed" | "cancelled" | "followup";
}

interface OrderProgressBarProps {
  steps: ProgressStep[];
  activeStep: string;
  onStepClick: (status: string) => void;
}

export function OrderProgressBar({ steps, activeStep, onStepClick }: OrderProgressBarProps) {
  // Find the baseline (Total or Assigned count)
  const baselineCount = steps.find(s => s.status === "all")?.count || 
                        steps.find(s => s.status === "assigned")?.count || 
                        1;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        {steps.map((step, index) => {
          // All and Assigned are always 100%, others are relative to baseline count
          let fillPercentage: number;
          if (step.status === "all" || step.status === "assigned") {
            fillPercentage = 100;
          } else {
            fillPercentage = baselineCount > 0 ? Math.min((step.count / baselineCount) * 100, 100) : 0;
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
                      backgroundColor: '#e0e0e0',
                      opacity: step.count === 0 ? 0.3 : 1
                    }}
                  >
                    <div
                      className={cn(
                        "h-full rounded-full transition-all duration-200",
                        step.status === "all" && "bg-blue-500",
                        step.status === "assigned" && "bg-blue-500",
                        step.status === "pending" && "bg-purple-500",
                        step.status === "confirmed" && "bg-green-500",
                        step.status === "cancelled" && "bg-red-600",
                        step.status === "followup" && "bg-amber-500"
                      )}
                      style={{ width: `${fillPercentage}%` }}
                    />
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
