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
    startDate: Date;
    endDate: Date;
  };
}

export function HourlyActivityChart({ dateRange }: HourlyActivityChartProps) {
  const userId = localStorage.getItem("userId");
  const userRole = localStorage.getItem("userRole");
  const metricsUserId = userRole === "agent" ? userId : undefined;

  const { data: hourlyData, isLoading } = useQuery<HourlyActivityResponse>({
    queryKey: ["/api/dashboard/hourly-activity", metricsUserId, dateRange.startDate.toISOString(), dateRange.endDate.toISOString()],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (metricsUserId) params.append("userId", metricsUserId);
      params.append("startDate", dateRange.startDate.toISOString());
      params.append("endDate", dateRange.endDate.toISOString());
      
      const res = await fetch(`/api/dashboard/hourly-activity?${params.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch hourly activity");
      return res.json();
    },
    refetchInterval: 60000,
  });

  const chartData = useMemo(() => {
    if (!hourlyData?.data) {
      const formatHour = (h: number): string => {
        if (h === 0) return '12 AM';
        if (h === 12) return '12 PM';
        if (h < 12) return `${h} AM`;
        return `${h - 12} PM`;
      };
      return Array.from({ length: 24 }, (_, i) => ({
        hour: formatHour(i),
        confirmed: 0,
        cancelled: 0,
        followUp: 0,
      }));
    }
    return hourlyData.data;
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
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Activity className="h-4 w-4" />
            Hourly Activity
          </CardTitle>
          <div className="flex items-center gap-3 text-xs">
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-green-500" />
              <span className="text-muted-foreground">{totalActions.confirmed}</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-red-500" />
              <span className="text-muted-foreground">{totalActions.cancelled}</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-blue-500" />
              <span className="text-muted-foreground">{totalActions.followUp}</span>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-2">
        {isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : (
          <ResponsiveContainer width="100%" height={140}>
            <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
              <defs>
                <linearGradient id="colorConfirmed" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0.1} />
                </linearGradient>
                <linearGradient id="colorCancelled" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ef4444" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0.1} />
                </linearGradient>
                <linearGradient id="colorFollowUp" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.1} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
              <XAxis
                dataKey="hour"
                tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
                tickLine={false}
                axisLine={false}
                interval={3}
              />
              <YAxis
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  borderColor: 'hsl(var(--border))',
                  borderRadius: '6px',
                  fontSize: '12px',
                }}
                labelStyle={{ color: 'hsl(var(--foreground))' }}
              />
              <Area
                type="monotone"
                dataKey="confirmed"
                stackId="1"
                stroke="#10b981"
                fill="url(#colorConfirmed)"
                name="Confirmed"
              />
              <Area
                type="monotone"
                dataKey="cancelled"
                stackId="1"
                stroke="#ef4444"
                fill="url(#colorCancelled)"
                name="Cancelled"
              />
              <Area
                type="monotone"
                dataKey="followUp"
                stackId="1"
                stroke="#3b82f6"
                fill="url(#colorFollowUp)"
                name="Follow Up"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
