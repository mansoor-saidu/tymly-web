import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { posthog } from '../../lib/posthog';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Separator } from '../../components/ui/separator';
import {
  RefreshCw, MapPinOff, Building2, Users, MousePointerClick,
  QrCode, TrendingUp, TrendingDown, Eye, AlertTriangle,
  Calendar, Activity, Database, Clock, ArrowUpRight,
  CheckCircle2, XCircle, Copy, ShieldAlert
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

type Tenant = {
  id: string;
  email: string;
  full_name: string;
  business_name?: string | null;
  phone_number?: string | null;
  employee_size?: string | null;
  how_did_you_hear?: string | null;
  profile_picture_url?: string | null;
  role: string;
  created_at: string;
};

export default function TenantsDashboardPage() {
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null);

  // Track page view
  useEffect(() => {
    posthog.capture('$pageview', {
      page: 'super_admin_tenants_dashboard',
      role: 'super_admin'
    });
  }, []);

  const { data: tenants, isLoading, refetch } = useQuery({
    queryKey: ['super-admin-tenants'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('admin_users')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      posthog.capture('super_admin_tenants_loaded', {
        tenant_count: data?.length ?? 0
      });
      return data as Tenant[];
    },
  });

  const { data: attendanceStats } = useQuery({
    queryKey: ['super-admin-attendance-global'],
    queryFn: async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const { data, error } = await supabase
        .from('attendance_logs')
        .select('id, is_late, check_in_time')
        .gte('check_in_time', today.toISOString());
      if (error) throw error;
      return {
        total: data?.length ?? 0,
        late: data?.filter(r => r.is_late).length ?? 0,
        onTime: data?.filter(r => !r.is_late).length ?? 0,
      };
    },
  });

  const { data: systemSettings } = useQuery({
    queryKey: ['super-admin-system-settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('system_settings')
        .select('*')
        .limit(1)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: totalEmployees } = useQuery({
    queryKey: ['super-admin-total-employees'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('employees')
        .select('id', { count: 'exact', head: true });
      if (error) throw error;
      return count ?? 0;
    },
  });

  const { data: recentCheckins } = useQuery({
    queryKey: ['super-admin-recent-checkins'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('attendance_logs')
        .select('id, check_in_time, is_late, employee_id')
        .order('check_in_time', { ascending: false })
        .limit(10);
      if (error) throw error;
      return data;
    },
  });

  const handleResetQR = async (tenantId: string, businessName: string) => {
    posthog.capture('super_admin_reset_qr', { tenant_id: tenantId, business_name: businessName });
    try {
      const { error } = await supabase.rpc('regenerate_qr_code');
      if (error) throw error;
      posthog.capture('super_admin_reset_qr_success', { tenant_id: tenantId });
      toast.success(`QR Code regenerated for ${businessName}!`);
      refetch();
    } catch (err: any) {
      posthog.capture('super_admin_reset_qr_error', { tenant_id: tenantId, error: err.message });
      toast.error('Failed to regenerate QR: ' + err.message);
    }
  };

  const handleClearLocation = async (tenantId: string, businessName: string) => {
    posthog.capture('super_admin_clear_location', { tenant_id: tenantId, business_name: businessName });
    try {
      const { error } = await supabase
        .from('system_settings')
        .update({ office_latitude: null, office_longitude: null, office_radius_meters: null, location_polygon: null })
        .neq('office_latitude', -999);
      if (error) throw error;
      posthog.capture('super_admin_clear_location_success', { tenant_id: tenantId });
      toast.success(`Location cleared for ${businessName}!`);
    } catch (err: any) {
      posthog.capture('super_admin_clear_location_error', { tenant_id: tenantId, error: err.message });
      toast.error('Failed to clear location: ' + err.message);
    }
  };

  const handleViewTenant = (tenant: Tenant) => {
    posthog.capture('super_admin_view_tenant', {
      tenant_id: tenant.id,
      business_name: tenant.business_name,
      employee_size: tenant.employee_size,
    });
    setSelectedTenant(prev => prev?.id === tenant.id ? null : tenant);
  };

  const handleCopyId = (id: string) => {
    navigator.clipboard.writeText(id);
    posthog.capture('super_admin_copy_tenant_id', { tenant_id: id });
    toast.success('ID copied to clipboard');
  };

  // Acquisition breakdown from survey
  const acquisitionMap: Record<string, number> = {};
  tenants?.forEach(t => {
    const k = t.how_did_you_hear || 'Unknown';
    acquisitionMap[k] = (acquisitionMap[k] || 0) + 1;
  });
  const topAcquisition = Object.entries(acquisitionMap).sort((a, b) => b[1] - a[1])[0];

  // Size breakdown
  const withOnboarding = tenants?.filter(t => t.business_name)?.length ?? 0;
  const pendingOnboarding = (tenants?.length ?? 0) - withOnboarding;

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <ShieldAlert className="w-5 h-5 text-red-500" />
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Platform Overview</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Live data across all tenants · {format(new Date(), 'EEEE, MMMM d, yyyy')}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => {
          posthog.capture('super_admin_refresh_clicked');
          refetch();
        }} disabled={isLoading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* KPI Row 1 — Tenants & Employees */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-indigo-50 to-white border-indigo-100">
          <CardHeader className="pb-1 pt-4 px-4">
            <p className="text-xs text-indigo-500 font-semibold uppercase tracking-wider">Registered Tenants</p>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="text-3xl font-bold text-indigo-700">{tenants?.length ?? '—'}</div>
            <div className="flex items-center gap-1 mt-1 text-xs text-indigo-400">
              <Building2 className="w-3 h-3" /> businesses using the platform
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-emerald-50 to-white border-emerald-100">
          <CardHeader className="pb-1 pt-4 px-4">
            <p className="text-xs text-emerald-500 font-semibold uppercase tracking-wider">Total Employees</p>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="text-3xl font-bold text-emerald-700">{totalEmployees ?? '—'}</div>
            <div className="flex items-center gap-1 mt-1 text-xs text-emerald-400">
              <Users className="w-3 h-3" /> active employee records
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-amber-50 to-white border-amber-100">
          <CardHeader className="pb-1 pt-4 px-4">
            <p className="text-xs text-amber-500 font-semibold uppercase tracking-wider">Today's Check-ins</p>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="text-3xl font-bold text-amber-700">{attendanceStats?.total ?? '—'}</div>
            <div className="flex items-center gap-1 mt-1 text-xs text-amber-400">
              <Activity className="w-3 h-3" /> check-ins across all tenants
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-rose-50 to-white border-rose-100">
          <CardHeader className="pb-1 pt-4 px-4">
            <p className="text-xs text-rose-500 font-semibold uppercase tracking-wider">Late Today</p>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="text-3xl font-bold text-rose-700">{attendanceStats?.late ?? '—'}</div>
            <div className="flex items-center gap-1 mt-1 text-xs text-rose-400">
              <Clock className="w-3 h-3" /> late arrivals recorded
            </div>
          </CardContent>
        </Card>
      </div>

      {/* KPI Row 2 — Health & Onboarding */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
              <MousePointerClick className="w-4 h-4" /> Top Acquisition Channel
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold text-foreground">{topAcquisition?.[0] ?? '—'}</div>
            <p className="text-xs text-muted-foreground mt-1">{topAcquisition?.[1] ?? 0} tenant(s) from this source</p>
            <Separator className="my-3" />
            <div className="space-y-1.5 text-xs">
              {Object.entries(acquisitionMap).map(([k, v]) => (
                <div key={k} className="flex items-center justify-between">
                  <span className="text-muted-foreground">{k}</span>
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 rounded-full bg-indigo-200" style={{ width: `${Math.round((v / (tenants?.length || 1)) * 60)}px` }} />
                    <span className="font-medium">{v}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" /> Onboarding Completion
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <div className="text-xl font-bold text-foreground">{withOnboarding}</div>
              <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-xs">Completed</Badge>
            </div>
            {pendingOnboarding > 0 && (
              <div className="flex items-center gap-3 mt-2">
                <div className="text-xl font-bold text-foreground">{pendingOnboarding}</div>
                <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-xs">Pending</Badge>
              </div>
            )}
            <Separator className="my-3" />
            <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all duration-700"
                style={{ width: `${tenants?.length ? Math.round((withOnboarding / tenants.length) * 100) : 0}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {tenants?.length ? Math.round((withOnboarding / tenants.length) * 100) : 0}% onboarding rate
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
              <Database className="w-4 h-4" /> System Health
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Database</span>
              <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-xs">Operational</Badge>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Check-in QR (v{systemSettings?.qr_code_version ?? '?'})</span>
              <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-xs">Active</Badge>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Location Boundary</span>
              <Badge variant="outline" className={systemSettings?.location_polygon ? 'bg-emerald-50 text-emerald-700 border-emerald-200 text-xs' : 'bg-amber-50 text-amber-700 border-amber-200 text-xs'}>
                {systemSettings?.location_polygon ? 'Set' : 'Not Configured'}
              </Badge>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Work Start</span>
              <span className="font-medium text-xs">{systemSettings?.work_start_time?.substring(0, 5) ?? '—'}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Grace Period</span>
              <span className="font-medium text-xs">{systemSettings?.late_grace_period_minutes ?? '—'} min</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Check-ins Live Feed */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <div className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
            </div>
            <CardTitle className="text-base">Live Check-in Feed</CardTitle>
          </div>
          <CardDescription>Most recent 10 attendance events across the platform</CardDescription>
        </CardHeader>
        <CardContent>
          {recentCheckins?.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">No check-ins recorded yet today.</div>
          ) : (
            <div className="space-y-2">
              {recentCheckins?.map((log) => (
                <div key={log.id} className="flex items-center justify-between p-2.5 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className={`h-8 w-8 rounded-full flex items-center justify-center ${log.is_late ? 'bg-rose-100 text-rose-600' : 'bg-emerald-100 text-emerald-600'}`}>
                      {log.is_late ? <TrendingDown className="w-4 h-4" /> : <TrendingUp className="w-4 h-4" />}
                    </div>
                    <div>
                      <p className="text-xs font-medium text-foreground">Employee ID: {log.employee_id?.slice(0, 8)}…</p>
                      <p className="text-xs text-muted-foreground">{format(new Date(log.check_in_time), 'MMM d, yyyy · h:mm a')}</p>
                    </div>
                  </div>
                  <Badge variant="outline" className={log.is_late ? 'bg-rose-50 text-rose-700 border-rose-200 text-[10px]' : 'bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]'}>
                    {log.is_late ? 'Late' : 'On Time'}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tenants Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>All Registered Businesses</CardTitle>
              <CardDescription>Click a row to expand details and run bug fixes.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border overflow-hidden">
            <Table>
              <TableHeader className="bg-muted/40">
                <TableRow>
                  <TableHead>Business</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Team Size</TableHead>
                  <TableHead>Acquisition</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center h-24">
                      <div className="flex items-center justify-center gap-2 text-muted-foreground">
                        <RefreshCw className="w-4 h-4 animate-spin" /> Loading tenants…
                      </div>
                    </TableCell>
                  </TableRow>
                ) : tenants?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center h-24 text-muted-foreground">No tenants found.</TableCell>
                  </TableRow>
                ) : (
                  tenants?.map((tenant) => (
                    <>
                      <TableRow
                        key={tenant.id}
                        className="cursor-pointer hover:bg-muted/30 transition-colors"
                        onClick={() => handleViewTenant(tenant)}
                      >
                        <TableCell>
                          <div className="flex items-center gap-2.5">
                            <div className="h-8 w-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-semibold text-sm flex-shrink-0">
                              {(tenant.business_name || tenant.full_name)?.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <div className="font-medium text-sm text-foreground">{tenant.business_name || <span className="text-muted-foreground italic">No name yet</span>}</div>
                              <Badge variant={tenant.role === 'super_admin' ? 'default' : 'secondary'} className="text-[9px] h-3.5 px-1 mt-0.5">
                                {tenant.role}
                              </Badge>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm text-foreground">{tenant.full_name}</div>
                          <div className="text-xs text-muted-foreground">{tenant.email}</div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-xs">
                            {tenant.employee_size || 'Unknown'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <span className="text-xs text-muted-foreground">{tenant.how_did_you_hear || '—'}</span>
                        </TableCell>
                        <TableCell>
                          <span className="text-xs text-muted-foreground">{format(new Date(tenant.created_at), 'MMM d, yyyy')}</span>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); handleCopyId(tenant.id); }}>
                              <Copy className="w-3 h-3" />
                            </Button>
                            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={(e) => { e.stopPropagation(); handleResetQR(tenant.id, tenant.business_name || tenant.email); }}>
                              <QrCode className="w-3 h-3 mr-1" /> Reset QR
                            </Button>
                            <Button variant="outline" size="sm" className="h-7 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50 border-rose-200" onClick={(e) => { e.stopPropagation(); handleClearLocation(tenant.id, tenant.business_name || tenant.email); }}>
                              <MapPinOff className="w-3 h-3 mr-1" /> Clear Loc
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>

                      {/* Expanded Detail Panel */}
                      {selectedTenant?.id === tenant.id && (
                        <TableRow key={`${tenant.id}-detail`} className="bg-indigo-50/40 hover:bg-indigo-50/40">
                          <TableCell colSpan={6} className="py-4 px-6">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                              <div>
                                <p className="text-[10px] uppercase tracking-wider text-indigo-400 font-semibold mb-1">User ID</p>
                                <code className="text-xs bg-white border rounded px-2 py-1 text-foreground font-mono select-all">{tenant.id}</code>
                              </div>
                              <div>
                                <p className="text-[10px] uppercase tracking-wider text-indigo-400 font-semibold mb-1">Phone</p>
                                <p className="text-xs text-foreground">{tenant.phone_number || '—'}</p>
                              </div>
                              <div>
                                <p className="text-[10px] uppercase tracking-wider text-indigo-400 font-semibold mb-1">Avatar</p>
                                {tenant.profile_picture_url ? (
                                  <img src={tenant.profile_picture_url} alt="Avatar" className="w-8 h-8 rounded-full object-cover border" />
                                ) : (
                                  <p className="text-xs text-muted-foreground">Not set</p>
                                )}
                              </div>
                              <div>
                                <p className="text-[10px] uppercase tracking-wider text-indigo-400 font-semibold mb-1">PostHog</p>
                                <a
                                  href={`https://us.posthog.com/persons#q=${encodeURIComponent(tenant.email)}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs text-indigo-600 hover:underline flex items-center gap-1"
                                  onClick={() => posthog.capture('super_admin_view_in_posthog', { tenant_email: tenant.email })}
                                >
                                  View in PostHog <ArrowUpRight className="w-3 h-3" />
                                </a>
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
