import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Badge } from '../../components/ui/badge';
import { FileDown, FileSpreadsheet, Calendar, BarChart3, Users } from 'lucide-react';
import { callEdgeFunction } from '../../lib/supabase';
import { formatDateTime } from '../../lib/utils';
import { Loader } from '../../components/ui/loader';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import * as XLSX from 'xlsx';

export default function ReportsPage() {
  const [dateRange, setDateRange] = useState({
    startDate: new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
  });

  const { data: logsData, isLoading, refetch } = useQuery({
    queryKey: ['attendance-logs-report', dateRange],
    queryFn: async () => {
      // Append time to cover the full end date
      const endDateTime = `${dateRange.endDate}T23:59:59.999Z`;
      const startDateTime = `${dateRange.startDate}T00:00:00.000Z`;

      const { data, error } = await callEdgeFunction('get-attendance-logs', {
        startDate: startDateTime,
        endDate: endDateTime,
        limit: 1000, // Large limit for reporting
        offset: 0,
      });

      if (error) throw error;
      return data;
    },
  });

  // Calculate statistics for charts
  const stats = useMemo(() => {
    if (!logsData?.logs) return { onTime: 0, late: 0, absent: 0, total: 0, chartData: [] };

    let onTime = 0;
    let late = 0;
    const dateMap = new Map();

    logsData.logs.forEach((log: any) => {
      const dateStr = log.check_in_time.split('T')[0];
      if (!dateMap.has(dateStr)) {
        dateMap.set(dateStr, { date: dateStr, onTime: 0, late: 0 });
      }

      if (log.is_late) {
        late++;
        dateMap.get(dateStr).late++;
      } else {
        onTime++;
        dateMap.get(dateStr).onTime++;
      }
    });

    const chartData = Array.from(dateMap.values()).sort((a, b) => a.date.localeCompare(b.date));

    return {
      onTime,
      late,
      total: onTime + late,
      chartData,
    };
  }, [logsData]);

  const pieData = [
    { name: 'On Time', value: stats.onTime, color: '#16a34a' }, // green-600
    { name: 'Late', value: stats.late, color: '#dc2626' }, // red-600
  ];

  const exportToCSV = () => {
    if (!logsData?.logs || logsData.logs.length === 0) return;

    const data = logsData.logs.map((log: any) => ({
      'Employee ID': log.employee?.employee_id || 'N/A',
      'Full Name': log.employee?.full_name || 'Unknown',
      'Department': log.employee?.department || 'N/A',
      'Check-in Time': formatDateTime(log.check_in_time),
      'Check-out Time': log.check_out_time ? formatDateTime(log.check_out_time) : 'N/A',
      'Hours Worked': log.hours_worked ? `${log.hours_worked} hrs` : 'N/A',
      'Auto-Checked Out': log.auto_checked_out ? 'Yes' : 'No',
      'Status': log.is_late ? 'Late' : 'On Time',
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Attendance');
    XLSX.writeFile(wb, `Attendance_Report_${dateRange.startDate}_to_${dateRange.endDate}.xlsx`);
  };

  return (
    <div className="space-y-6 md:space-y-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Reports & Analytics</h1>
          <p className="text-muted-foreground mt-2">
            View attendance trends and export detailed reports
          </p>
        </div>
        <Button onClick={exportToCSV} variant="default" disabled={isLoading || !logsData?.logs?.length}>
          <FileSpreadsheet className="mr-2 h-4 w-4" />
          Export to Excel
        </Button>
      </div>

      {/* Date Filter Card */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4 items-end">
            <div className="space-y-2 flex-1">
              <Label htmlFor="start-date">Start Date</Label>
              <div className="relative">
                <Input
                  id="start-date"
                  type="date"
                  value={dateRange.startDate}
                  onChange={(e) => setDateRange({ ...dateRange, startDate: e.target.value })}
                  className="pl-10"
                />
                <Calendar className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              </div>
            </div>
            <div className="space-y-2 flex-1">
              <Label htmlFor="end-date">End Date</Label>
              <div className="relative">
                <Input
                  id="end-date"
                  type="date"
                  value={dateRange.endDate}
                  onChange={(e) => setDateRange({ ...dateRange, endDate: e.target.value })}
                  className="pl-10"
                />
                <Calendar className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Analytics Charts */}
      <div className="grid gap-6 md:grid-cols-3">
        <Card className="col-span-1 md:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Attendance Trends
            </CardTitle>
            <CardDescription>Daily check-in distribution over the selected period</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
            {isLoading ? (
              <Loader text="Loading chart data..." />
            ) : stats.chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="onTime" name="On Time" stackId="a" fill="#16a34a" radius={[0, 0, 4, 4]} />
                  <Bar dataKey="late" name="Late" stackId="a" fill="#dc2626" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-muted-foreground">
                No data available for this period
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="col-span-1">
          <CardHeader>
            <CardTitle>Overall Status</CardTitle>
            <CardDescription>Total check-ins summary</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px] flex flex-col">
            {isLoading ? (
              <Loader text="Loading stats..." />
            ) : stats.total > 0 ? (
              <>
                <div className="flex-1 min-h-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {pieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="grid grid-cols-2 gap-4 text-center mt-4">
                  <div>
                    <div className="text-2xl font-bold text-green-600">{stats.onTime}</div>
                    <div className="text-xs text-muted-foreground">On Time</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-red-600">{stats.late}</div>
                    <div className="text-xs text-muted-foreground">Late</div>
                  </div>
                </div>
              </>
            ) : (
              <div className="h-full flex items-center justify-center text-muted-foreground">
                No data available
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Detailed Logs Table */}
      <Card>
        <CardHeader>
          <CardTitle>Detailed Attendance Logs</CardTitle>
          <CardDescription>Showing {logsData?.logs?.length || 0} records for the selected period</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Loader text="Loading detailed logs..." />
          ) : !logsData?.logs || logsData.logs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No check-ins found for this period
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>In</TableHead>
                  <TableHead>Out</TableHead>
                  <TableHead>Hours</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logsData.logs.map((log: any) => {
                  const checkInDate = new Date(log.check_in_time);
                  return (
                    <TableRow key={log.id}>
                      <TableCell className="font-medium">
                        {log.employee?.full_name || 'Unknown'}
                        <div className="text-xs text-muted-foreground">{log.employee?.employee_id}</div>
                      </TableCell>
                      <TableCell>{log.employee?.department || 'N/A'}</TableCell>
                      <TableCell>{checkInDate.toLocaleDateString()}</TableCell>
                      <TableCell>{checkInDate.toLocaleTimeString()}</TableCell>
                      <TableCell>{log.check_out_time ? new Date(log.check_out_time).toLocaleTimeString() : '--'}</TableCell>
                      <TableCell>
                        {log.hours_worked ? (
                          <span>{log.hours_worked}h {log.auto_checked_out && <span className="text-xs text-muted-foreground ml-1">(auto)</span>}</span>
                        ) : '--'}
                      </TableCell>
                      <TableCell>
                        {log.is_late ? (
                          <Badge variant="destructive">Late</Badge>
                        ) : (
                          <Badge variant="default" className="bg-green-600">On Time</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
