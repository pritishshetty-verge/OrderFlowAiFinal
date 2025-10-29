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

interface FulfilFilterProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  dateRange: { from?: Date; to?: Date };
  onDateRangeChange: (range: { from?: Date; to?: Date }) => void;
  agentFilter: string;
  onAgentFilterChange: (value: string) => void;
  paymentFilter: string;
  onPaymentFilterChange: (value: string) => void;
  agents: Array<{ id: string; username?: string; email: string }>;
  onClearFilters: () => void;
}

export function FulfilFilter({
  searchQuery,
  onSearchChange,
  dateRange,
  onDateRangeChange,
  agentFilter,
  onAgentFilterChange,
  paymentFilter,
  onPaymentFilterChange,
  agents,
  onClearFilters,
}: FulfilFilterProps) {
  const hasActiveFilters = 
    searchQuery || 
    dateRange.from || 
    paymentFilter !== "all" || 
    agentFilter !== "all";

  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
      <div className="relative flex-1 max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          placeholder="Search by order ID, customer name, phone..."
          className="pl-9"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          data-testid="input-search-orders"
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

        <Select value={agentFilter} onValueChange={onAgentFilterChange}>
          <SelectTrigger className="w-[140px]" data-testid="select-agent-filter">
            <SelectValue placeholder="All agents" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All agents</SelectItem>
            {agents.map((agent) => (
              <SelectItem key={agent.id} value={agent.id}>
                {agent.username || agent.email}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={paymentFilter} onValueChange={onPaymentFilterChange}>
          <SelectTrigger className="w-[140px]" data-testid="select-payment-filter">
            <SelectValue placeholder="Payment" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Payment</SelectItem>
            <SelectItem value="cod">COD</SelectItem>
            <SelectItem value="prepaid">Prepaid</SelectItem>
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
