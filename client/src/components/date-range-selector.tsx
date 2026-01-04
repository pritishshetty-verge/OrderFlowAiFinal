import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { format, startOfDay, endOfDay, subDays } from "date-fns";
import type { DateRange as CalendarDateRange } from "react-day-picker";

type DatePreset = "today" | "yesterday" | "last7days" | "last30days" | "custom";

interface DateRangeOutput {
  startDate: Date;
  endDate: Date;
}

interface DateRangeSelectorProps {
  onDateChange: (range: DateRangeOutput) => void;
}

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
    default:
      return { startDate: today, endDate: endOfToday };
  }
};

export function DateRangeSelector({ onDateChange }: DateRangeSelectorProps) {
  const [selectedPreset, setSelectedPreset] = useState<DatePreset>("today");
  const [customRange, setCustomRange] = useState<CalendarDateRange | undefined>(undefined);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);

  const handlePresetClick = (preset: DatePreset) => {
    if (preset === "custom") {
      setSelectedPreset("custom");
      setIsCalendarOpen(true);
    } else {
      setSelectedPreset(preset);
      const range = getPresetRange(preset);
      onDateChange(range);
    }
  };

  const handleCustomRangeSelect = (range: CalendarDateRange | undefined) => {
    setCustomRange(range);
    
    if (range?.from && range?.to) {
      onDateChange({
        startDate: startOfDay(range.from),
        endDate: endOfDay(range.to),
      });
      setIsCalendarOpen(false);
    }
  };

  const getDisplayText = (): string => {
    if (selectedPreset === "custom" && customRange?.from && customRange?.to) {
      return `${format(customRange.from, "MMM d")} - ${format(customRange.to, "MMM d, yyyy")}`;
    }
    return "";
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Button
        variant={selectedPreset === "today" ? "default" : "outline"}
        size="sm"
        onClick={() => handlePresetClick("today")}
        data-testid="btn-date-today"
      >
        Today
      </Button>
      <Button
        variant={selectedPreset === "yesterday" ? "default" : "outline"}
        size="sm"
        onClick={() => handlePresetClick("yesterday")}
        data-testid="btn-date-yesterday"
      >
        Yesterday
      </Button>
      <Button
        variant={selectedPreset === "last7days" ? "default" : "outline"}
        size="sm"
        onClick={() => handlePresetClick("last7days")}
        data-testid="btn-date-last7"
      >
        Last 7 Days
      </Button>
      <Button
        variant={selectedPreset === "last30days" ? "default" : "outline"}
        size="sm"
        onClick={() => handlePresetClick("last30days")}
        data-testid="btn-date-last30"
      >
        Last 30 Days
      </Button>
      <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
        <PopoverTrigger asChild>
          <Button
            variant={selectedPreset === "custom" ? "default" : "outline"}
            size="sm"
            onClick={() => handlePresetClick("custom")}
            data-testid="btn-date-custom"
          >
            <CalendarIcon className="h-4 w-4 mr-2" />
            {selectedPreset === "custom" && customRange?.from && customRange?.to
              ? getDisplayText()
              : "Custom Range"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="range"
            selected={customRange}
            onSelect={handleCustomRangeSelect}
            numberOfMonths={2}
            defaultMonth={subDays(new Date(), 30)}
            data-testid="calendar-custom-range"
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
