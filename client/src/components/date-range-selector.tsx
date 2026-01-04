import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { format, startOfDay, endOfDay, subDays, startOfMonth, isSameDay } from "date-fns";
import type { DateRange as CalendarDateRange } from "react-day-picker";

type DatePreset = "today" | "yesterday" | "last7days" | "last30days" | "thisMonth" | "custom";

interface DateRangeOutput {
  startDate: Date;
  endDate: Date;
}

interface DateRangeSelectorProps {
  onDateChange: (range: DateRangeOutput) => void;
}

const presets: { key: DatePreset; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "last7days", label: "Last 7 Days" },
  { key: "last30days", label: "Last 30 Days" },
  { key: "thisMonth", label: "This Month" },
];

const getPresetRange = (preset: DatePreset): DateRangeOutput => {
  const now = new Date();
  const today = startOfDay(now);
  const endOfToday = endOfDay(now);

  switch (preset) {
    case "today":
      return { startDate: today, endDate: endOfToday };
    case "yesterday":
      const yesterday = subDays(today, 1);
      return { startDate: yesterday, endDate: endOfDay(yesterday) };
    case "last7days":
      return { startDate: subDays(today, 6), endDate: endOfToday };
    case "last30days":
      return { startDate: subDays(today, 29), endDate: endOfToday };
    case "thisMonth":
      return { startDate: startOfMonth(now), endDate: endOfToday };
    default:
      return { startDate: today, endDate: endOfToday };
  }
};

const detectPresetFromRange = (range: DateRangeOutput): DatePreset => {
  const rangeStart = startOfDay(range.startDate);
  const rangeEnd = startOfDay(range.endDate);

  for (const preset of presets) {
    const presetRange = getPresetRange(preset.key);
    const presetStart = startOfDay(presetRange.startDate);
    const presetEnd = startOfDay(presetRange.endDate);

    if (isSameDay(rangeStart, presetStart) && isSameDay(rangeEnd, presetEnd)) {
      return preset.key;
    }
  }
  return "custom";
};

const getPresetLabel = (preset: DatePreset): string | null => {
  const found = presets.find(p => p.key === preset);
  return found ? found.label : null;
};

export function DateRangeSelector({ onDateChange }: DateRangeSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  
  const [committedRange, setCommittedRange] = useState<DateRangeOutput>(() => getPresetRange("today"));
  const [committedPreset, setCommittedPreset] = useState<DatePreset>("today");
  
  const [pendingRange, setPendingRange] = useState<DateRangeOutput>(() => getPresetRange("today"));
  const [pendingPreset, setPendingPreset] = useState<DatePreset>("today");
  const [pendingCalendarRange, setPendingCalendarRange] = useState<CalendarDateRange | undefined>(() => {
    const initial = getPresetRange("today");
    return { from: initial.startDate, to: initial.endDate };
  });

  const handleOpenChange = (open: boolean) => {
    if (open) {
      setPendingRange(committedRange);
      setPendingPreset(committedPreset);
      setPendingCalendarRange({ from: committedRange.startDate, to: committedRange.endDate });
    }
    setIsOpen(open);
  };

  const handlePresetClick = (preset: DatePreset) => {
    const range = getPresetRange(preset);
    setPendingPreset(preset);
    setPendingRange(range);
    setPendingCalendarRange({ from: range.startDate, to: range.endDate });
  };

  const handleCalendarSelect = (range: CalendarDateRange | undefined) => {
    setPendingCalendarRange(range);
    
    if (range?.from && range?.to) {
      const newRange = {
        startDate: startOfDay(range.from),
        endDate: endOfDay(range.to),
      };
      setPendingRange(newRange);
      setPendingPreset(detectPresetFromRange(newRange));
    } else if (range?.from) {
      setPendingPreset("custom");
    }
  };

  const handleApply = () => {
    setCommittedRange(pendingRange);
    setCommittedPreset(pendingPreset);
    onDateChange(pendingRange);
    setIsOpen(false);
  };

  const handleCancel = () => {
    setIsOpen(false);
  };

  const formatDisplayLabel = (): string => {
    const detectedPreset = detectPresetFromRange(committedRange);
    const presetLabel = getPresetLabel(detectedPreset);
    
    if (presetLabel && detectedPreset !== "custom") {
      return presetLabel;
    }
    
    const { startDate, endDate } = committedRange;
    const startYear = startDate.getFullYear();
    const endYear = endDate.getFullYear();
    
    if (startYear === endYear) {
      return `${format(startDate, "MMM d")} - ${format(endDate, "MMM d, yyyy")}`;
    }
    return `${format(startDate, "MMM d, yyyy")} - ${format(endDate, "MMM d, yyyy")}`;
  };

  return (
    <Popover open={isOpen} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="justify-start text-left font-normal"
          data-testid="btn-date-range-trigger"
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          <span>{formatDisplayLabel()}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <div className="flex flex-col">
          <div className="flex">
            <div className="flex flex-col border-r p-2 space-y-1 min-w-[140px]">
              {presets.map((preset) => (
                <Button
                  key={preset.key}
                  variant="ghost"
                  size="sm"
                  className={`justify-start toggle-elevate ${
                    pendingPreset === preset.key ? "toggle-elevated bg-accent text-accent-foreground" : ""
                  }`}
                  onClick={() => handlePresetClick(preset.key)}
                  data-testid={`btn-preset-${preset.key}`}
                >
                  {preset.label}
                </Button>
              ))}
            </div>
            <div className="p-2">
              <Calendar
                mode="range"
                selected={pendingCalendarRange}
                onSelect={handleCalendarSelect}
                numberOfMonths={2}
                defaultMonth={subDays(new Date(), 30)}
                data-testid="calendar-date-range"
              />
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 border-t p-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCancel}
              data-testid="btn-date-cancel"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleApply}
              disabled={!pendingCalendarRange?.from || !pendingCalendarRange?.to}
              data-testid="btn-date-apply"
            >
              Apply
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
