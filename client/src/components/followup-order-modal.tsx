import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { Calendar as CalendarIcon, Clock, Loader2 } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const QUICK_PRESETS = [
  { label: "10 minutes", value: "10", minutes: 10 },
  { label: "30 minutes", value: "30", minutes: 30 },
  { label: "45 minutes", value: "45", minutes: 45 },
  { label: "Custom", value: "custom", minutes: 0 },
] as const;

const followupOrderSchema = z.object({
  preset: z.enum(["10", "30", "45", "custom"]),
  customDate: z.date().optional(),
  customTime: z.string().optional(),
  notes: z.string().optional(),
}).refine(
  (data) => {
    if (data.preset === "custom") {
      return data.customDate !== undefined && data.customTime !== undefined;
    }
    return true;
  },
  {
    message: "Date and time are required for custom follow-up",
    path: ["customDate"],
  }
);

type FollowupOrderFormData = z.infer<typeof followupOrderSchema>;

interface FollowupOrderModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (followupAt: Date, notes?: string) => Promise<void>;
  orderNumber?: string;
}

export function FollowupOrderModal({
  open,
  onOpenChange,
  onConfirm,
  orderNumber,
}: FollowupOrderModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<FollowupOrderFormData>({
    resolver: zodResolver(followupOrderSchema),
    defaultValues: {
      preset: "30",
      notes: "",
    },
  });

  const preset = form.watch("preset");

  // Keyboard shortcuts: 1=10min, 2=30min, 3=45min, Ctrl+Enter=submit
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      
      // Ctrl/Cmd + Enter = submit from anywhere
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        form.handleSubmit(handleSubmit)();
        return;
      }

      // Don't capture number shortcuts if user is typing in a text field
      if (target.tagName === "TEXTAREA" || target.tagName === "INPUT") {
        return;
      }

      // Number shortcuts for quick presets (only when not in text field)
      if (e.key === "1") {
        e.preventDefault();
        form.setValue("preset", "10");
      } else if (e.key === "2") {
        e.preventDefault();
        form.setValue("preset", "30");
      } else if (e.key === "3") {
        e.preventDefault();
        form.setValue("preset", "45");
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, form]);

  const handleSubmit = async (data: FollowupOrderFormData) => {
    try {
      setIsSubmitting(true);

      let followupDate: Date;
      if (data.preset === "custom" && data.customDate && data.customTime) {
        // Parse custom date and time
        const [hours, minutes] = data.customTime.split(":").map(Number);
        followupDate = new Date(data.customDate);
        followupDate.setHours(hours, minutes, 0, 0);
      } else {
        // Use quick preset
        const selectedPreset = QUICK_PRESETS.find((p) => p.value === data.preset);
        followupDate = new Date();
        followupDate.setMinutes(followupDate.getMinutes() + (selectedPreset?.minutes || 30));
      }

      await onConfirm(followupDate, data.notes);
      form.reset();
      onOpenChange(false);
    } catch (error) {
      console.error("Error scheduling follow-up:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    form.reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="dialog-followup-order" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Schedule Follow Up</DialogTitle>
          <DialogDescription>
            {orderNumber ? `Order ${orderNumber} - ` : ""}Set a reminder to follow up with this customer
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="preset"
              render={({ field }) => (
                <FormItem className="space-y-3">
                  <FormLabel>Quick Presets</FormLabel>
                  <FormControl>
                    <RadioGroup
                      onValueChange={field.onChange}
                      value={field.value}
                      className="grid grid-cols-2 gap-3"
                      data-testid="radio-group-preset"
                    >
                      {QUICK_PRESETS.map((preset) => (
                        <div
                          key={preset.value}
                          className={cn(
                            "flex items-center space-x-2 rounded-md border p-3 hover-elevate",
                            field.value === preset.value && "bg-accent"
                          )}
                        >
                          <RadioGroupItem
                            value={preset.value}
                            id={preset.value}
                            data-testid={`radio-preset-${preset.value}`}
                          />
                          <Label htmlFor={preset.value} className="cursor-pointer flex-1">
                            {preset.label}
                          </Label>
                        </div>
                      ))}
                    </RadioGroup>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {preset === "custom" && (
              <>
                <FormField
                  control={form.control}
                  name="customDate"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>Date</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant="outline"
                              className={cn(
                                "justify-start text-left font-normal",
                                !field.value && "text-muted-foreground"
                              )}
                              data-testid="button-select-date"
                            >
                              <CalendarIcon className="mr-2 h-4 w-4" />
                              {field.value ? (
                                format(field.value, "PPP")
                              ) : (
                                <span>Pick a date</span>
                              )}
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={field.value}
                            onSelect={field.onChange}
                            disabled={(date) => date < new Date()}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="customTime"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Time</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Clock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                          <Input
                            type="time"
                            {...field}
                            className="pl-10"
                            data-testid="input-time"
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </>
            )}

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes (Optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      placeholder="Type notes... (Press Ctrl + Enter to save)"
                      rows={3}
                      data-testid="textarea-followup-notes"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                disabled={isSubmitting}
                data-testid="button-cancel-dialog"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting}
                data-testid="button-schedule-followup"
              >
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Schedule
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
