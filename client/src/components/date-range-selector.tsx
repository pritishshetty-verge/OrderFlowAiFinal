import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { format, startOfDay, endOfDay, subDays, startOfMonth } from "date-fns";
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

export function DateRangeSelector({ onDateChange }: DateRangeSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<DatePreset>("today");
  const [dateRange, setDateRange] = useState<DateRangeOutput>(() => getPresetRange("today"));
  const [calendarRange, setCalendarRange] = useState<CalendarDateRange | undefined>(() => {
    const initial = getPresetRange("today");
    return { from: initial.startDate, to: initial.endDate };
  });

  const handlePresetClick = (preset: DatePreset) => {
    setSelectedPreset(preset);
    const range = getPresetRange(preset);
    setDateRange(range);
    setCalendarRange({ from: range.startDate, to: range.endDate });
    onDateChange(range);
    setIsOpen(false);
  };

  const handleCalendarSelect = (range: CalendarDateRange | undefined) => {
    setCalendarRange(range);
    
    if (range?.from && range?.to) {
      setSelectedPreset("custom");
      const newRange = {
        startDate: startOfDay(range.from),
        endDate: endOfDay(range.to),
      };
      setDateRange(newRange);
      onDateChange(newRange);
      setIsOpen(false);
    }
  };

  const formatDisplayRange = (): string => {
    const { startDate, endDate } = dateRange;
    const startYear = startDate.getFullYear();
    const endYear = endDate.getFullYear();
    
    if (startYear === endYear) {
      return `${format(startDate, "MMM d")} - ${format(endDate, "MMM d, yyyy")}`;
    }
    return `${format(startDate, "MMM d, yyyy")} - ${format(endDate, "MMM d, yyyy")}`;
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="justify-start text-left font-normal"
          data-testid="btn-date-range-trigger"
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          <span>{formatDisplayRange()}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <div className="flex">
          <div className="flex flex-col border-r p-2 space-y-1 min-w-[140px]">
            {presets.map((preset) => (
              <Button
                key={preset.key}
                variant="ghost"
                size="sm"
                className={`justify-start toggle-elevate ${
                  selectedPreset === preset.key ? "toggle-elevated bg-accent text-accent-foreground" : ""
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
              selected={calendarRange}
              onSelect={handleCalendarSelect}
              numberOfMonths={2}
              defaultMonth={subDays(new Date(), 30)}
              data-testid="calendar-date-range"
            />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
