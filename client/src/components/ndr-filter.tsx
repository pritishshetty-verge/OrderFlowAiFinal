import { Search, CalendarIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface NdrFilterProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  dateRange: { from?: Date; to?: Date };
  onDateRangeChange: (range: { from?: Date; to?: Date }) => void;
  statusFilter: string;
  onStatusFilterChange: (value: string) => void;
  actionFilter: string;
  onActionFilterChange: (value: string) => void;
  onClearFilters: () => void;
}

export function NdrFilter({
  searchQuery,
  onSearchChange,
  dateRange,
  onDateRangeChange,
  statusFilter,
  onStatusFilterChange,
  actionFilter,
  onActionFilterChange,
  onClearFilters,
}: NdrFilterProps) {
  const hasActiveFilters = 
    searchQuery || 
    dateRange.from || 
    statusFilter !== "all" || 
    actionFilter !== "all";

  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
      <div className="relative flex-1 max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          placeholder="Search by AWB number..."
          className="pl-9"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          data-testid="input-search-awb"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                "justify-start text-left font-normal w-[200px]",
                !dateRange.from && "text-muted-foreground"
              )}
              data-testid="button-date-range"
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {dateRange.from ? (
                dateRange.to ? (
                  <>
                    {format(dateRange.from, "MMM dd")} - {format(dateRange.to, "MMM dd")}
                  </>
                ) : (
                  format(dateRange.from, "MMM dd, yyyy")
                )
              ) : (
                <span>Date range</span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="range"
              selected={{ from: dateRange.from, to: dateRange.to }}
              onSelect={(range) => onDateRangeChange({ from: range?.from, to: range?.to })}
              numberOfMonths={2}
              initialFocus
            />
          </PopoverContent>
        </Popover>

        <Select value={statusFilter} onValueChange={onStatusFilterChange}>
          <SelectTrigger className="w-[180px]" data-testid="select-status-filter">
            <SelectValue placeholder="NDR Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="customer_unavailable">Customer Unavailable</SelectItem>
            <SelectItem value="address_issue">Address Issue</SelectItem>
            <SelectItem value="refused">Refused</SelectItem>
            <SelectItem value="other">Other</SelectItem>
          </SelectContent>
        </Select>

        <Select value={actionFilter} onValueChange={onActionFilterChange}>
          <SelectTrigger className="w-[160px]" data-testid="select-action-filter">
            <SelectValue placeholder="Action Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Actions</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
            <SelectItem value="reattempt">Reattempt Scheduled</SelectItem>
          </SelectContent>
        </Select>

        {hasActiveFilters && (
          <Button
            variant="outline"
            onClick={onClearFilters}
            data-testid="button-clear-filters"
          >
            Clear Filters
          </Button>
        )}
      </div>
    </div>
  );
}
