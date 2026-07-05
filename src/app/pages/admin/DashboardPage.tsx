import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card';
import { Loader } from '../../components/ui/loader';
import { Badge } from '../../components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Users, CheckCircle2, Clock, TrendingUp, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { callEdgeFunction, supabase } from '../../lib/supabase';
import { formatDateTime } from '../../lib/utils';
import { Skeleton } from '../../components/ui/skeleton';

export default function DashboardPage() {
  // Fetch recent attendance logs
  const { data: logsData, isLoading: logsLoading } = useQuery({
    queryKey: ['attendance-logs-recent'],
    queryFn: async () => {
      const { data, error } = await callEdgeFunction('get-attendance-logs', {
        limit: 10,
        offset: 0,
      });

      if (error) throw error;
      return data;
    },
  });

  // Fetch total employees
  const { data: employeesData, isLoading: employeesLoading } = useQuery({
    queryKey: ['employees-count'],
    queryFn: async () => {
      const { count } = await supabase
        .from('employees')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'active');

      return count || 0;
    },
  });

  // Calculate today's stats
  const today = new Date().toISOString().split('T')[0];
  const { data: todayStats, isLoading: todayLoading } = useQuery({
    queryKey: ['today-stats', today],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('attendance_logs')
        .select('is_late')
        .gte('check_in_time', `${today}T00:00:00`)
        .lt('check_in_time', `${today}T23:59:59`);

      if (error) throw error;

      const total = data.length;
      const onTime = data.filter((log) => !log.is_late).length;
      const late = data.filter((log) => log.is_late).length;

      return { total, onTime, late };
    },
  });

  // Calculate this week's stats
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const { data: weekStats, isLoading: weekLoading } = useQuery({
    queryKey: ['week-stats'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('attendance_logs')
        .select('id')
        .gte('check_in_time', weekAgo.toISOString());

      if (error) throw error;
      return data.length;
    },
  });

  const stats = [
    {
      title: 'Total Employees',
      value: employeesData?.toString() || '0',
      isLoading: employeesLoading,
      icon: Users,
      description: 'Active employees',
      color: 'text-blue-600',
      bgColor: 'bg-blue-100 dark:bg-blue-900',
      trend: '+2',
      trendUp: true,
      trendLabel: 'vs last month',
    },
    {
      title: "Today's Check-ins",
      value: todayStats?.total.toString() || '0',
      isLoading: todayLoading,
      icon: CheckCircle2,
      description: `${todayStats?.onTime || 0} on time, ${todayStats?.late || 0} late`,
      color: 'text-green-600',
      bgColor: 'bg-green-100 dark:bg-green-900',
      trend: '+12%',
      trendUp: true,
      trendLabel: 'vs average',
    },
    {
      title: 'This Week',
      value: weekStats?.toString() || '0',
      isLoading: weekLoading,
      icon: TrendingUp,
      description: 'Total check-ins',
      color: 'text-purple-600',
      bgColor: 'bg-purple-100 dark:bg-purple-900',
      trend: '-3%',
      trendUp: false,
      trendLabel: 'vs last week',
    },
    {
      title: 'Attendance Rate',
      value: employeesData && todayStats
        ? `${Math.round((todayStats.total / employeesData) * 100)}%`
        : '0%',
      isLoading: employeesLoading || todayLoading,
      icon: Clock,
      description: 'Today',
      color: 'text-orange-600',
      bgColor: 'bg-orange-100 dark:bg-orange-900',
      trend: '+2.1%',
      trendUp: true,
      trendLabel: 'vs yesterday',
    },
  ];

  return (
    <div className="space-y-6 md:space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-2 pb-2">
        <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent w-fit">
          Workspace Overview
        </h1>
        <p className="text-muted-foreground text-lg">
          Here's what's happening with your team today.
        </p>
      </div>

      {/* Stats Cards - Bento Layout */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {/* Main Featured: Attendance Rate */}
        {(() => {
          const stat = stats[3]; // Attendance Rate
          const Icon = stat.icon;
          return (
            <Card className="group relative overflow-hidden md:col-span-2 lg:col-span-2 bg-primary text-primary-foreground border-transparent shadow-xl flex flex-col justify-center transition-all hover:shadow-2xl hover:-translate-y-1 duration-300">
              {/* Subtle background glow effect */}
              <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 rounded-full bg-white opacity-5 blur-3xl transition-transform duration-500 group-hover:scale-150"></div>
              
              <CardHeader className="relative z-10 flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-lg font-medium">{stat.title}</CardTitle>
                <div className="bg-white/10 p-3 rounded-xl transition-colors group-hover:bg-white/20">
                  <Icon className="h-6 w-6 text-white" />
                </div>
              </CardHeader>
              <CardContent className="relative z-10">
                {stat.isLoading ? (
                  <Skeleton className="h-12 w-24 mt-2 bg-primary-foreground/20" />
                ) : (
                  <div className="text-5xl font-bold tracking-tight mt-2">{stat.value}</div>
                )}
                {stat.value !== '0' && stat.value !== '0%' && stat.trend && (
                  <div className="flex items-center gap-2 mt-4">
                    <div className={`flex items-center text-sm font-medium ${stat.trendUp ? 'text-green-400' : 'text-red-400'}`}>
                      {stat.trendUp ? <ArrowUpRight className="h-4 w-4 mr-1" /> : <ArrowDownRight className="h-4 w-4 mr-1" />}
                      {stat.trend}
                    </div>
                    <span className="text-sm text-primary-foreground/60">{stat.trendLabel}</span>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })()}

        {/* Stacked Secondary */}
        <div className="grid gap-4 grid-rows-2">
          {[stats[0], stats[2]].map((stat) => {
            const Icon = stat.icon;
            return (
              <Card key={stat.title}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
                  <div className={`${stat.bgColor} p-2 rounded-lg`}>
                    <Icon className={`h-4 w-4 ${stat.color}`} />
                  </div>
                </CardHeader>
                <CardContent>
                  {stat.isLoading ? (
                    <Skeleton className="h-8 w-16 mb-1" />
                  ) : (
                    <div className="text-2xl font-bold">{stat.value}</div>
                  )}
                  {stat.value !== '0' && stat.value !== '0%' && stat.trend && (
                    <div className="flex items-center gap-2 mt-1">
                      <div className={`flex items-center text-xs font-medium ${stat.trendUp ? 'text-green-600 dark:text-green-500' : 'text-red-600 dark:text-red-500'}`}>
                        {stat.trendUp ? <ArrowUpRight className="h-3 w-3 mr-0.5" /> : <ArrowDownRight className="h-3 w-3 mr-0.5" />}
                        {stat.trend}
                      </div>
                      <span className="text-xs text-muted-foreground">{stat.trendLabel}</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Secondary Featured: Today's Check-ins */}
        {(() => {
          const stat = stats[1]; // Today's Check-ins
          const Icon = stat.icon;
          return (
            <Card className="md:col-span-2 lg:col-span-3 transition-colors hover:bg-muted/30 border-muted/60 hover:border-muted">
              <CardContent className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-6">
                <div className="flex items-center gap-4">
                  <div className={`${stat.bgColor} p-4 rounded-xl`}>
                    <Icon className={`h-8 w-8 ${stat.color}`} />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold">{stat.title}</h3>
                    <p className="text-muted-foreground text-sm mt-1">{stat.description}</p>
                  </div>
                </div>
                <div className="flex flex-col items-start sm:items-end mt-4 sm:mt-0">
                  {stat.isLoading ? (
                    <Skeleton className="h-10 w-24 mb-1" />
                  ) : (
                    <div className="text-4xl font-bold tracking-tight">{stat.value}</div>
                  )}
                  {stat.value !== '0' && stat.value !== '0%' && stat.trend && (
                    <div className="flex items-center gap-2 mt-2">
                      <div className={`flex items-center text-sm font-medium ${stat.trendUp ? 'text-green-600 dark:text-green-500' : 'text-red-600 dark:text-red-500'}`}>
                        {stat.trendUp ? <ArrowUpRight className="h-4 w-4 mr-1" /> : <ArrowDownRight className="h-4 w-4 mr-1" />}
                        {stat.trend}
                      </div>
                      <span className="text-sm text-muted-foreground">{stat.trendLabel}</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })()}
      </div>

      {/* Recent Check-ins */}
      <Card className="border-muted/60 shadow-sm overflow-hidden mt-8">
        <CardHeader className="bg-muted/20 border-b border-muted/40 pb-4">
          <CardTitle className="text-xl font-bold">Recent Activity</CardTitle>
          <CardDescription>Live feed of team movements</CardDescription>
        </CardHeader>
        <CardContent>
          {logsLoading ? (
            <Loader text="Loading recent activity..." />
          ) : !logsData?.logs || logsData.logs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No check-ins yet today
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Employee ID</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Check-in Time</TableHead>
                  <TableHead>Check-out Time</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logsData.logs.map((log: any) => (
                  <TableRow key={log.id}>
                    <TableCell className="font-medium">
                      {log.employee?.full_name || 'Unknown'}
                    </TableCell>
                    <TableCell>{log.employee?.employee_id || 'N/A'}</TableCell>
                    <TableCell>{log.employee?.department || 'N/A'}</TableCell>
                    <TableCell>{formatDateTime(log.check_in_time)}</TableCell>
                    <TableCell>
                      {log.check_out_time ? (
                        <span>
                          {formatDateTime(log.check_out_time)}
                          {log.hours_worked && <span className="text-muted-foreground text-xs ml-2">({log.hours_worked}h)</span>}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">--</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {log.is_late ? (
                        <Badge variant="destructive">Late</Badge>
                      ) : (
                        <Badge variant="default" className="bg-green-600">
                          On Time
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
