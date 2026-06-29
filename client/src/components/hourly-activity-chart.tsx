import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Activity } from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { startOfDay, endOfDay, format, setHours, setMinutes, setSeconds } from "date-fns";
import { apiRequest } from "@/lib/queryClient";
import { useActiveStore } from "@/hooks/use-store";

interface HourlyData {
  hour: string;
  confirmed: number;
  cancelled: number;
  followUp: number;
}

interface HourlyActivityResponse {
  data: HourlyData[];
}

interface HourlyActivityChartProps {
  dateRange: {
    startDate: Date | null;
    endDate: Date | null;
  };
}

// The three series this chart plots — un-stacked, each drawn from the
// baseline so they read as a true 3-way comparison.
const SERIES: { key: "confirmed" | "cancelled" | "followUp"; label: string; color: string }[] = [
  { key: "confirmed", label: "Confirmed", color: "#10b981" },
  { key: "cancelled", label: "Cancelled", color: "#f43f5e" },
  { key: "followUp", label: "Follow-up", color: "#3b82f6" },
];

export function HourlyActivityChart({ dateRange }: HourlyActivityChartProps) {
  const userId = localStorage.getItem("userId");
  const userRole = localStorage.getItem("userRole");
  const metricsUserId = userRole === "agent" ? userId : undefined;

  // Detect user's browser timezone for accurate hourly grouping
  const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  // Default to today if dates are null (All Time selected)
  const effectiveStartDate = dateRange.startDate ?? startOfDay(new Date());
  const effectiveEndDate = dateRange.endDate ?? endOfDay(new Date());

  // Active store key + apiRequest interceptor combine to scope the
  // chart to the current tenant. Switching stores forces a refetch
  // through the queryKey dependency.
  const { activeStoreId } = useActiveStore();

  const { data: hourlyData, isLoading } = useQuery<HourlyActivityResponse>({
    queryKey: [
      "/api/dashboard/hourly-activity",
      activeStoreId,
      metricsUserId,
      effectiveStartDate.toISOString(),
      effectiveEndDate.toISOString(),
      userTimezone,
    ],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (metricsUserId) params.append("userId", metricsUserId);
      params.append("startDate", effectiveStartDate.toISOString());
      params.append("endDate", effectiveEndDate.toISOString());
      params.append("timezone", userTimezone);

      const res = await apiRequest(
        "GET",
        `/api/dashboard/hourly-activity?${params.toString()}`,
      );
      return res.json();
    },
    enabled: !!activeStoreId,
    refetchInterval: 60000,
  });

  const { chartData, hasActivity } = useMemo(() => {
    const real = hourlyData?.data ?? [];
    return {
      chartData: real,
      hasActivity: real.some((d) => d.confirmed + d.cancelled + d.followUp > 0),
    };
  }, [hourlyData]);

  const totalActions = useMemo(() => {
    return chartData.reduce(
      (acc, d) => ({
        confirmed: acc.confirmed + d.confirmed,
        cancelled: acc.cancelled + d.cancelled,
        followUp: acc.followUp + d.followUp,
      }),
      { confirmed: 0, cancelled: 0, followUp: 0 }
    );
  }, [chartData]);

  return (
    <Card data-testid="card-hourly-activity">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Activity className="h-4 w-4 text-brand" />
            Hourly Activity
          </CardTitle>
          <div className="flex items-center gap-4 text-xs">
            {SERIES.map((s) => (
              <div key={s.key} className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
                <span className="text-muted-foreground">{s.label}</span>
                <span className="font-medium tabular-nums text-foreground">{totalActions[s.key]}</span>
              </div>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-2">
        {isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : !hasActivity ? (
          <div className="flex h-[170px] items-center justify-center text-sm text-muted-foreground">
            No call activity in this range yet.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={170}>
            <AreaChart data={chartData} margin={{ top: 8, right: 6, left: -18, bottom: 0 }}>
              <defs>
                {SERIES.map((s) => (
                  <linearGradient key={s.key} id={`grad-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={s.color} stopOpacity={0.28} />
                    <stop offset="100%" stopColor={s.color} stopOpacity={0} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
              <XAxis
                dataKey="hour"
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                tickLine={false}
                axisLine={false}
                interval={3}
              />
              <YAxis
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
                width={40}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  borderColor: 'hsl(var(--border))',
                  borderRadius: '10px',
                  fontSize: '12px',
                  boxShadow: 'var(--shadow-md)',
                }}
                labelStyle={{ color: 'hsl(var(--foreground))', fontWeight: 500, marginBottom: 4 }}
              />
              {SERIES.map((s) => (
                <Area
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  name={s.label}
                  stroke={s.color}
                  strokeWidth={2.5}
                  fill={`url(#grad-${s.key})`}
                  fillOpacity={1}
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 2, stroke: 'hsl(var(--card))' }}
                  animationDuration={900}
                  animationEasing="ease-out"
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
