import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";

interface Agent {
  id: string;
  fullName: string;
  email: string;
}

interface OrdersFilterProps {
  onSearch?: (value: string) => void;
  searchValue?: string;
  onPaymentChange?: (value: string) => void;
  onClearFilters?: () => void;
  // Admin-only filters
  isAdmin?: boolean;
  agents?: Agent[];
  onCallStatusChange?: (value: string) => void;
  onAgentChange?: (value: string) => void;
  callStatusValue?: string;
  agentValue?: string;
  // Sort order
  onSortChange?: (value: 'asc' | 'desc') => void;
  sortValue?: 'asc' | 'desc';
}

export function OrdersFilter({
  onSearch,
  searchValue = "",
  onPaymentChange,
  onClearFilters,
  isAdmin = false,
  agents = [],
  onCallStatusChange,
  onAgentChange,
  callStatusValue = "all",
  agentValue = "all",
  onSortChange,
  sortValue = "desc",
}: OrdersFilterProps) {
  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
      <div className="relative flex-1 max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          placeholder="Search by order ID, customer name, phone..."
          className="pl-9"
          value={searchValue}
          onChange={(e) => onSearch?.(e.target.value)}
          data-testid="input-search-orders"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {/* Sort By dropdown */}
        <Select value={sortValue} onValueChange={(v) => onSortChange?.(v as 'asc' | 'desc')}>
          <SelectTrigger className="w-[140px]" data-testid="select-sort-order">
            <SelectValue placeholder="Sort By" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="desc">Newest First</SelectItem>
            <SelectItem value="asc">Oldest First</SelectItem>
          </SelectContent>
        </Select>

        <Select onValueChange={onPaymentChange} defaultValue="all">
          <SelectTrigger className="w-[140px]" data-testid="select-payment-filter">
            <SelectValue placeholder="Payment" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Payment</SelectItem>
            <SelectItem value="cod">COD</SelectItem>
            <SelectItem value="prepaid">Prepaid</SelectItem>
          </SelectContent>
        </Select>

        {/* Admin-only: Call Status Filter */}
        {isAdmin && (
          <Select value={callStatusValue} onValueChange={onCallStatusChange}>
            <SelectTrigger className="w-[140px]" data-testid="select-call-status-filter">
              <SelectValue placeholder="Call Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="Pending">Pending</SelectItem>
              <SelectItem value="Confirmed">Confirmed</SelectItem>
              <SelectItem value="Follow Up">Follow-up</SelectItem>
              <SelectItem value="Cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        )}

        {/* Admin-only: Agent Filter */}
        {isAdmin && (
          <Select value={agentValue} onValueChange={onAgentChange}>
            <SelectTrigger className="w-[160px]" data-testid="select-agent-filter">
              <SelectValue placeholder="Agent" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Agents</SelectItem>
              <SelectItem value="unassigned">Unassigned</SelectItem>
              {agents.map((agent) => (
                <SelectItem key={agent.id} value={agent.id}>
                  {agent.fullName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Button
          variant="outline"
          onClick={onClearFilters}
          data-testid="button-clear-filters"
        >
          Clear Filters
        </Button>
      </div>
    </div>
  );
}
