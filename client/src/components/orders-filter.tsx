import { useMemo } from "react";
import { Search, Download, Filter as FilterIcon, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

// ─────────────────────────────────────────────────────────────────────
// OrdersFilter — primary inline + secondary popover.
//
// Design intent (from the UX audit, "Filter declutter" item):
//
//   Primary toolbar (always inline):
//     • Search (left, flex-1)
//     • Sort By (frequently changed)
//     • Filters popover button — opens a panel with payment / call
//       status / agent / tag. Shows a count chip when any filter
//       is active.
//     • Clear filters (only when something is filterable)
//     • Export CSV
//
//   Below the toolbar:
//     • Active-filter chips, one per non-default filter, with a
//       click-to-remove X. Closer to the data than the toolbar so
//       the user sees what's actually filtered.
//
// Backend filtering shape is unchanged — the parent still gets the
// same `onPaymentChange` / `onAgentChange` / etc. callbacks; only
// the UI surface where the user picks them moved.
// ─────────────────────────────────────────────────────────────────────

interface Agent {
  id: string;
  fullName: string;
  email: string;
}

interface OrdersFilterProps {
  onSearch?: (value: string) => void;
  searchValue?: string;
  onPaymentChange?: (value: string) => void;
  paymentValue?: string;
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
  // Tags filter
  tags?: string[];
  onTagChange?: (value: string) => void;
  tagValue?: string;
  // Export
  onExport?: () => void;
  isExporting?: boolean;
}

// Default values used to decide which filters are "active." A filter
// is active iff its current value is not the default. Kept as a const
// so the chip-strip + the count badge agree on the same definition.
const DEFAULT_PAYMENT = "all";
const DEFAULT_CALL_STATUS = "all";
const DEFAULT_AGENT = "all";
const DEFAULT_TAG = "all";

export function OrdersFilter({
  onSearch,
  searchValue = "",
  onPaymentChange,
  paymentValue = DEFAULT_PAYMENT,
  onClearFilters,
  isAdmin = false,
  agents = [],
  onCallStatusChange,
  onAgentChange,
  callStatusValue = DEFAULT_CALL_STATUS,
  agentValue = DEFAULT_AGENT,
  onSortChange,
  sortValue = "desc",
  tags = [],
  onTagChange,
  tagValue = DEFAULT_TAG,
  onExport,
  isExporting = false,
}: OrdersFilterProps) {
  // Inventory of currently-active filters. The chip strip below
  // renders one entry per truthy item; the Filters button shows
  // the count alongside the icon.
  const activeFilters = useMemo(() => {
    type ActiveFilter = {
      key: "payment" | "callStatus" | "agent" | "tag";
      label: string;
      onClear: () => void;
    };
    const out: ActiveFilter[] = [];
    if (paymentValue !== DEFAULT_PAYMENT) {
      out.push({
        key: "payment",
        label: `Payment: ${paymentValue === "cod" ? "COD" : "Prepaid"}`,
        onClear: () => onPaymentChange?.(DEFAULT_PAYMENT),
      });
    }
    if (isAdmin && callStatusValue !== DEFAULT_CALL_STATUS) {
      out.push({
        key: "callStatus",
        label: `Status: ${callStatusValue}`,
        onClear: () => onCallStatusChange?.(DEFAULT_CALL_STATUS),
      });
    }
    if (isAdmin && agentValue !== DEFAULT_AGENT) {
      const agent = agents.find((a) => a.id === agentValue);
      out.push({
        key: "agent",
        label: `Agent: ${agentValue === "unassigned" ? "Unassigned" : agent?.fullName ?? agentValue}`,
        onClear: () => onAgentChange?.(DEFAULT_AGENT),
      });
    }
    if (tagValue !== DEFAULT_TAG) {
      out.push({
        key: "tag",
        label: `Tag: ${tagValue}`,
        onClear: () => onTagChange?.(DEFAULT_TAG),
      });
    }
    return out;
  }, [
    paymentValue,
    callStatusValue,
    agentValue,
    tagValue,
    isAdmin,
    agents,
    onPaymentChange,
    onCallStatusChange,
    onAgentChange,
    onTagChange,
  ]);

  const activeCount = activeFilters.length;

  return (
    <div className="space-y-3">
      {/* ── Primary toolbar ──────────────────────────────────────── */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search by order ID, customer name, phone…"
            className="pl-9"
            value={searchValue}
            onChange={(e) => onSearch?.(e.target.value)}
            data-testid="input-search-orders"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Sort By stays inline — high-frequency control. */}
          <Select value={sortValue} onValueChange={(v) => onSortChange?.(v as 'asc' | 'desc')}>
            <SelectTrigger className="w-[140px]" data-testid="select-sort-order">
              <SelectValue placeholder="Sort By" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="desc">Newest First</SelectItem>
              <SelectItem value="asc">Oldest First</SelectItem>
            </SelectContent>
          </Select>

          {/* ── Filters popover ───────────────────────────────────
              Houses payment, call status, agent, and tag filters.
              Each filter is a vertical row: label on top, Select
              below. The popover is non-modal so the user can click
              outside to dismiss without focus-trap shenanigans —
              same pattern we use for the notifications popover. */}
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="default"
                className="gap-2"
                data-testid="button-open-filters"
              >
                <FilterIcon className="h-4 w-4" />
                Filters
                {activeCount > 0 && (
                  <Badge
                    variant="secondary"
                    className="ml-0.5 h-5 min-w-[1.25rem] rounded-full px-1.5 text-[10px] font-semibold"
                    data-testid="badge-filters-count"
                  >
                    {activeCount}
                  </Badge>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              className="w-72 p-4"
              data-testid="popover-filters"
            >
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Payment
                  </Label>
                  <Select value={paymentValue} onValueChange={onPaymentChange}>
                    <SelectTrigger data-testid="select-payment-filter">
                      <SelectValue placeholder="All Payment" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Payment</SelectItem>
                      <SelectItem value="cod">COD</SelectItem>
                      <SelectItem value="prepaid">Prepaid</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {isAdmin && (
                  <div className="space-y-2">
                    <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Call Status
                    </Label>
                    <Select value={callStatusValue} onValueChange={onCallStatusChange}>
                      <SelectTrigger data-testid="select-call-status-filter">
                        <SelectValue placeholder="All Status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Status</SelectItem>
                        <SelectItem value="Pending">Pending</SelectItem>
                        <SelectItem value="Confirmed">Confirmed</SelectItem>
                        <SelectItem value="Follow Up">Follow-up</SelectItem>
                        <SelectItem value="Cancelled">Cancelled</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {isAdmin && (
                  <div className="space-y-2">
                    <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Agent
                    </Label>
                    <Select value={agentValue} onValueChange={onAgentChange}>
                      <SelectTrigger data-testid="select-agent-filter">
                        <SelectValue placeholder="All Agents" />
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
                  </div>
                )}

                {tags.length > 0 && (
                  <div className="space-y-2">
                    <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Tag
                    </Label>
                    <Select value={tagValue} onValueChange={onTagChange}>
                      <SelectTrigger data-testid="select-tag-filter">
                        <SelectValue placeholder="All Tags" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Tags</SelectItem>
                        {tags.map((tag) => (
                          <SelectItem key={tag} value={tag}>
                            {tag}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {activeCount > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onClearFilters}
                    className="w-full"
                    data-testid="button-clear-filters-popover"
                  >
                    Clear all filters
                  </Button>
                )}
              </div>
            </PopoverContent>
          </Popover>

          <Button
            variant="outline"
            onClick={onExport}
            disabled={isExporting}
            data-testid="button-export-csv"
          >
            <Download className="h-4 w-4 mr-2" />
            {isExporting ? "Exporting…" : "Export CSV"}
          </Button>
        </div>
      </div>

      {/* ── Active filter chips ─────────────────────────────────────
          Renders one removable chip per non-default filter. Sits
          immediately below the toolbar so the user sees what's
          active in the same scan as the table itself. Collapses to
          nothing when zero filters are active. */}
      {activeCount > 0 && (
        <div
          className="flex flex-wrap items-center gap-2"
          data-testid="active-filter-chips"
        >
          <span className="text-xs text-muted-foreground">Active filters:</span>
          {activeFilters.map((f) => (
            <Badge
              key={f.key}
              variant="secondary"
              className="gap-1 pl-2.5 pr-1 py-0.5 text-xs font-medium"
              data-testid={`chip-filter-${f.key}`}
            >
              {f.label}
              <button
                type="button"
                onClick={f.onClear}
                className="ml-0.5 inline-flex items-center justify-center rounded-sm hover:bg-foreground/10 p-0.5"
                aria-label={`Remove ${f.key} filter`}
                data-testid={`chip-remove-${f.key}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
          {activeCount > 1 && (
            <button
              type="button"
              onClick={onClearFilters}
              className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
              data-testid="link-clear-all-filters"
            >
              Clear all
            </button>
          )}
        </div>
      )}
    </div>
  );
}
