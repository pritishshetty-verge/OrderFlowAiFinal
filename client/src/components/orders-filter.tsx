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

interface OrdersFilterProps {
  onSearch?: (value: string) => void;
  onStatusChange?: (value: string) => void;
  onPaymentChange?: (value: string) => void;
  onClearFilters?: () => void;
}

export function OrdersFilter({
  onSearch,
  onStatusChange,
  onPaymentChange,
  onClearFilters,
}: OrdersFilterProps) {
  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
      <div className="relative flex-1 max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          placeholder="Search by order ID, customer name, phone..."
          className="pl-9"
          onChange={(e) => onSearch?.(e.target.value)}
          data-testid="input-search-orders"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Select onValueChange={onStatusChange} defaultValue="all">
          <SelectTrigger className="w-[140px]" data-testid="select-status-filter">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="assigned">Assigned</SelectItem>
            <SelectItem value="confirmed">Confirmed</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
            <SelectItem value="shipped">Shipped</SelectItem>
            <SelectItem value="delivered">Delivered</SelectItem>
            <SelectItem value="ndr">NDR</SelectItem>
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
