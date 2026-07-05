import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { posthog } from '../../lib/posthog';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import {
  Database, Activity, Users, Building2,
  Clock, Shield, RefreshCw, AlertTriangle, CheckCircle2,
  BarChart3, Globe, Zap, ShieldOff, ExternalLink,
  Lock, Search, Crown, UserCircle2, ChevronDown,
} from 'lucide-react';
import { toast } from 'sonner';
import { format, formatDistanceToNow } from 'date-fns';

type AdminUser = {
  id: string;
  email: string;
  full_name: string;
  business_name?: string | null;
  phone_number?: string | null;
  employee_size?: string | null;
  how_did_you_hear?: string | null;
  role: string;
  created_at: string;
};

const PROTECTED_EMAIL = 'mansaidus@gmail.com';

const ROLE_META: Record<string, { label: string; color: string; bg: string; border: string; icon: typeof Shield }> = {
  super_admin: {
    label: 'Super Admin',
    color: 'text-rose-700',
    bg: 'bg-rose-50',
    border: 'border-rose-200',
    icon: Crown,
  },
  admin: {
    label: 'Admin',
    color: 'text-slate-700',
    bg: 'bg-slate-50',
    border: 'border-slate-200',
    icon: Shield,
  },
};

export default function GlobalSettingsPage() {
  const queryClient = useQueryClient();
  const [roleFilter, setRoleFilter] = useState<'all' | 'admin' | 'super_admin'>('all');
  const [search, setSearch] = useState('');
  const [confirmingDemote, setConfirmingDemote] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'tenants' | 'employees'>('tenants');

  useEffect(() => {
    posthog.capture('$pageview', { page: 'super_admin_global_settings', role: 'super_admin' });
  }, []);

  const { data: allUsers, isLoading: usersLoading } = useQuery({
    queryKey: ['super-admin-all-users'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('admin_users')
        .select('*, companies(status)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      posthog.capture('super_admin_users_loaded', { count: data?.length });
      return data as (AdminUser & { companies?: { status: string } })[];
    },
  });

  const { data: allPlatformEmployees, isLoading: employeesLoading } = useQuery({
    queryKey: ['super-admin-all-employees'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employees')
        .select('*, companies(name)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: systemSettings } = useQuery({
    queryKey: ['super-admin-system-settings'],
    queryFn: async () => {
      const { data, error } = await supabase.from('system_settings').select('*').limit(1).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: employeeCount } = useQuery({
    queryKey: ['super-admin-total-employees'],
    queryFn: async () => {
      const { count } = await supabase.from('employees').select('id', { count: 'exact', head: true });
      return count ?? 0;
    },
  });

  const { data: allAttendance } = useQuery({
    queryKey: ['super-admin-all-attendance'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('attendance_logs')
        .select('id, is_late, created_at')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const forceResetQRMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('regenerate_qr_code');
      if (error) throw error;
    },
    onSuccess: () => {
      posthog.capture('super_admin_global_qr_reset');
      toast.success('QR Code regenerated globally.');
      queryClient.invalidateQueries({ queryKey: ['super-admin-system-settings'] });
    },
    onError: (e: any) => {
      posthog.capture('super_admin_global_qr_reset_error', { error: e.message });
      toast.error('Failed: ' + e.message);
    },
  });

  const resetAccountMutation = useMutation({
    mutationFn: async ({ userId, companyId }: { userId: string; companyId?: string | null }) => {
      // Reset admin_user
      const { error } = await supabase.from('admin_users').update({
        business_name: null,
        phone_number: null,
        employee_size: null,
        how_did_you_hear: null,
        company_id: null
      }).eq('id', userId);
      
      if (error) throw error;

      // Delete system settings and company if they exist to start fresh
      if (companyId) {
        await supabase.from('system_settings').delete().eq('company_id', companyId);
        await supabase.from('companies').delete().eq('id', companyId);
      }
    },
    onSuccess: () => {
      posthog.capture('super_admin_account_reset');
      toast.success('Account reset successfully. The user will be prompted to onboard again.');
      setConfirmingDemote(null);
      queryClient.invalidateQueries({ queryKey: ['super-admin-all-users'] });
    },
    onError: (e: any) => toast.error('Failed to reset account: ' + e.message),
  });

  const toggleSuspendCompanyMutation = useMutation({
    mutationFn: async ({ companyId, status }: { companyId: string; status: 'active' | 'suspended' }) => {
      if (!companyId) throw new Error("No company ID found for this user");
      const { error } = await supabase.from('companies').update({ status }).eq('id', companyId);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      posthog.capture('super_admin_company_suspended', { company_id: vars.companyId, status: vars.status });
      toast.success(`Company marked as ${vars.status}.`);
      queryClient.invalidateQueries({ queryKey: ['super-admin-all-users'] });
    },
    onError: (e: any) => toast.error('Failed to update status: ' + e.message),
  });

  // Derived stats
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
  const totalToday = allAttendance?.filter(a => new Date(a.created_at) >= today).length ?? 0;
  const lateToday = allAttendance?.filter(a => a.is_late && new Date(a.created_at) >= today).length ?? 0;
  const thisWeek = allAttendance?.filter(a => new Date(a.created_at) >= weekAgo).length ?? 0;

  // Filtered users
  const filteredUsers = allUsers?.filter(u => {
    const matchesRole = roleFilter === 'all' || u.role === roleFilter;
    const matchesSearch =
      !search ||
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      (u.full_name?.toLowerCase().includes(search.toLowerCase())) ||
      (u.business_name?.toLowerCase().includes(search.toLowerCase()));
    return matchesRole && matchesSearch;
  });

  const superAdmins = allUsers?.filter(u => u.role === 'super_admin').length ?? 0;
  const regularAdmins = allUsers?.filter(u => u.role === 'admin').length ?? 0;

  return (
    <div className="min-h-screen bg-[#fffaef]">
      <div className="max-w-7xl mx-auto px-6 lg:px-8 py-8 space-y-8">

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2.5 mb-1">
              <Globe className="w-5 h-5 text-rose-500" />
              <h1 className="text-2xl font-bold tracking-tight" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif', letterSpacing: '-0.025em' }}>
                Global Settings
              </h1>
            </div>
            <p className="text-sm text-[#6b7280]">Platform-wide configuration and access controls.</p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="bg-white border-[#ececf0] text-[#030213] hover:bg-[#ececf0] transition-colors"
            onClick={() => {
              queryClient.invalidateQueries();
              posthog.capture('super_admin_global_refresh');
            }}
          >
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
            Refresh all
          </Button>
        </div>

        {/* KPI Strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: 'Tenants', value: allUsers?.length ?? '—', sub: 'registered businesses', icon: Building2 },
            { label: 'Employees', value: employeeCount ?? '—', sub: 'active records', icon: Users },
            { label: 'Check-ins today', value: totalToday, sub: `${lateToday} late`, icon: Activity },
            { label: 'This week', value: thisWeek, sub: 'check-ins platform-wide', icon: Clock },
          ].map(({ label, value, sub, icon: Icon }) => (
            <div key={label} className="bg-white border border-[#ececf0] rounded-[10px] p-4">
              <div className="flex items-center gap-1.5 mb-3">
                <Icon className="w-3.5 h-3.5 text-[#6b7280]" />
                <span className="text-xs font-medium text-[#6b7280]">{label}</span>
              </div>
              <div className="text-2xl font-bold text-[#030213]" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>{value}</div>
              <div className="text-xs text-[#9ca3af] mt-0.5">{sub}</div>
            </div>
          ))}
        </div>

        {/* Two-column: System Config + Platform Activity */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white border border-[#ececf0] rounded-[10px] overflow-hidden">
            <div className="px-5 py-4 border-b border-[#ececf0] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-[#6b7280]" />
                <h2 className="text-sm font-semibold text-[#030213]" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>Platform Configuration</h2>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs text-[#6b7280] hover:text-[#030213]"
                onClick={() => forceResetQRMutation.mutate()}
                disabled={forceResetQRMutation.isPending}
              >
                <RefreshCw className={`w-3 h-3 mr-1 ${forceResetQRMutation.isPending ? 'animate-spin' : ''}`} />
                Regen QR
              </Button>
            </div>
            <div className="divide-y divide-[#ececf0]">
              {[
                { label: 'QR Code Version', value: systemSettings?.qr_code_version ?? '—', status: 'ok' },
                { label: 'Database', value: 'Supabase PostgreSQL', status: 'ok' },
                { label: 'PostHog Project', value: '498702', status: 'ok' },
              ].map(({ label, value, status }) => (
                <div key={label} className="px-5 py-3 flex items-center justify-between">
                  <span className="text-sm text-[#6b7280]">{label}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-[#030213]">{value}</span>
                    {status === 'ok'
                      ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                      : <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                    }
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white border border-[#ececf0] rounded-[10px] overflow-hidden">
            <div className="px-5 py-4 border-b border-[#ececf0] flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-[#6b7280]" />
              <h2 className="text-sm font-semibold text-[#030213]" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>Platform Activity</h2>
            </div>
            <div className="grid grid-cols-2 divide-x divide-y divide-[#ececf0]">
              {[
                { label: 'All-time check-ins', value: allAttendance?.length ?? 0 },
                { label: 'Check-ins this week', value: thisWeek },
                { label: 'On time today', value: totalToday - lateToday },
                { label: 'Late today', value: lateToday },
              ].map(({ label, value }) => (
                <div key={label} className="p-5">
                  <div className="text-2xl font-bold text-[#030213]" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>{value}</div>
                  <div className="text-xs text-[#9ca3af] mt-0.5">{label}</div>
                </div>
              ))}
            </div>
            {/* PostHog links */}
            <div className="border-t border-[#ececf0] px-5 py-4">
              <p className="text-xs font-medium text-[#6b7280] mb-3">PostHog analytics</p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: 'Dashboard', url: `https://us.posthog.com/project/498702/dashboard/1801517` },
                  { label: 'Events', url: `https://us.posthog.com/project/498702/events` },
                  { label: 'Users', url: `https://us.posthog.com/project/498702/persons` },
                  { label: 'Recordings', url: `https://us.posthog.com/project/498702/recordings` },
                ].map(({ label, url }) => (
                  <a
                    key={label}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => posthog.capture('super_admin_posthog_link_clicked', { link: label })}
                    className="flex items-center justify-between px-3 py-2 rounded-md bg-[#fffaef] border border-[#ececf0] hover:border-[#030213]/20 hover:bg-white transition-colors group"
                  >
                    <span className="text-xs font-medium text-[#030213]">{label}</span>
                    <ExternalLink className="w-3 h-3 text-[#9ca3af] group-hover:text-[#030213] transition-colors" />
                  </a>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ───────────────────────────────────────────────── */}
        {/* PLATFORM MANAGEMENT (Tabs)                         */}
        {/* ───────────────────────────────────────────────── */}
        <div className="bg-white border border-[#ececf0] rounded-[10px] overflow-hidden">
          
          {/* Section header & Tabs */}
          <div className="px-6 pt-5 border-b border-[#ececf0]">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <Shield className="w-4 h-4 text-[#030213]" />
                  <h2 className="text-base font-bold text-[#030213]" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif', letterSpacing: '-0.025em' }}>
                    Platform Directory
                  </h2>
                </div>
                <p className="text-sm text-[#6b7280]">
                  Manage tenants, businesses, and global employee records.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-6 mt-6">
              <button
                onClick={() => setActiveTab('tenants')}
                className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'tenants' ? 'border-[#030213] text-[#030213]' : 'border-transparent text-[#6b7280] hover:text-[#030213]'
                }`}
              >
                Tenants & Role Management
              </button>
              <button
                onClick={() => setActiveTab('employees')}
                className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'employees' ? 'border-[#030213] text-[#030213]' : 'border-transparent text-[#6b7280] hover:text-[#030213]'
                }`}
              >
                Global Employee Directory
              </button>
            </div>
          </div>

          {activeTab === 'tenants' && (
            <>
              {/* Search & Filters */}
              <div className="px-6 py-4 flex flex-col sm:flex-row gap-4 items-center justify-between bg-[#fffdf5] border-b border-[#ececf0]">
                {/* Search */}
                <div className="relative w-full sm:max-w-md">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#9ca3af]" />
                  <input
                    type="text"
                    placeholder="Search by name, email, or business…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 text-sm bg-white border border-[#ececf0] rounded-md focus:outline-none focus:border-[#030213]/30 focus:ring-1 focus:ring-[#030213]/10 placeholder:text-[#c4c4c4] transition"
                  />
                </div>
                
                {/* Role summary pills */}
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => setRoleFilter('all')}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                      roleFilter === 'all'
                        ? 'bg-[#030213] text-white border-[#030213]'
                        : 'bg-white text-[#6b7280] border-[#ececf0] hover:bg-[#f9f9f9]'
                    }`}
                  >
                    All ({allUsers?.length ?? 0})
                  </button>
                  <button
                    onClick={() => setRoleFilter('super_admin')}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                      roleFilter === 'super_admin'
                        ? 'bg-rose-600 text-white border-rose-600'
                        : 'bg-white text-[#6b7280] border-[#ececf0] hover:bg-[#f9f9f9]'
                    }`}
                  >
                    Super Admins ({superAdmins})
                  </button>
                  <button
                    onClick={() => setRoleFilter('admin')}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                      roleFilter === 'admin'
                        ? 'bg-[#030213] text-white border-[#030213]'
                        : 'bg-white text-[#6b7280] border-[#ececf0] hover:bg-[#f9f9f9]'
                    }`}
                  >
                    Admins ({regularAdmins})
                  </button>
                </div>
              </div>

              {/* Table header */}
              <div className="grid grid-cols-[1fr_1fr_120px_140px_180px] px-6 py-2.5 bg-[#fffaef] border-b border-[#ececf0]">
                {['User', 'Business', 'Team Size', 'Role', 'Actions'].map(h => (
                  <span key={h} className="text-[11px] font-semibold uppercase tracking-wide text-[#9ca3af]">{h}</span>
                ))}
              </div>

          {/* Rows */}
          <div className="divide-y divide-[#ececf0]">
            {usersLoading ? (
              // Skeleton rows
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr_120px_140px_180px] px-6 py-4 gap-4 animate-pulse">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-[#ececf0]" />
                    <div className="space-y-1.5">
                      <div className="h-3 w-24 bg-[#ececf0] rounded" />
                      <div className="h-2.5 w-32 bg-[#ececf0] rounded" />
                    </div>
                  </div>
                  <div className="h-3 w-28 bg-[#ececf0] rounded self-center" />
                  <div className="h-3 w-16 bg-[#ececf0] rounded self-center" />
                  <div className="h-6 w-20 bg-[#ececf0] rounded self-center" />
                  <div className="h-7 w-28 bg-[#ececf0] rounded self-center" />
                </div>
              ))
            ) : filteredUsers?.length === 0 ? (
              <div className="py-16 text-center text-sm text-[#9ca3af]">
                No users match your filter.
              </div>
            ) : (
              filteredUsers?.map(user => {
                const meta = ROLE_META[user.role] ?? ROLE_META.admin;
                const RoleIcon = meta.icon;
                const isProtected = user.email === PROTECTED_EMAIL;
                const isConfirmingThisUser = confirmingDemote === user.id;
                const companyStatus = user.companies?.status || 'active';
                const isSuspended = companyStatus === 'suspended';

                return (
                  <div
                    key={user.id}
                    className="grid grid-cols-[1fr_1fr_120px_140px_180px] px-6 py-4 gap-4 items-center hover:bg-[#fffdf5] transition-colors"
                  >
                    {/* User */}
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-full bg-[#030213]/8 text-[#030213] flex items-center justify-center font-semibold text-sm shrink-0 border border-[#ececf0]">
                        {(user.full_name || user.email).charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-medium text-[#030213] truncate">{user.full_name || '—'}</p>
                          {isProtected && (
                            <Lock className="w-3 h-3 text-amber-500 shrink-0" title="Protected account" />
                          )}
                        </div>
                        <p className="text-xs text-[#9ca3af] truncate">{user.email}</p>
                        <p className="text-[10px] text-[#c4c4c4]">
                          Joined {formatDistanceToNow(new Date(user.created_at), { addSuffix: true })}
                        </p>
                      </div>
                    </div>

                    {/* Business */}
                    <div className="min-w-0 flex items-center gap-2">
                      <div className="min-w-0">
                        <p className="text-sm text-[#030213] truncate">{user.business_name || <span className="text-[#c4c4c4] italic">Not set</span>}</p>
                        {user.phone_number && (
                          <p className="text-xs text-[#9ca3af] truncate">{user.phone_number}</p>
                        )}
                      </div>
                      {isSuspended && (
                        <span className="shrink-0 px-2 py-0.5 rounded text-[10px] font-medium bg-red-100 text-red-700">
                          Suspended
                        </span>
                      )}
                    </div>

                    {/* Team size */}
                    <div>
                      <span className="text-sm text-[#6b7280]">{user.employee_size || '—'}</span>
                    </div>

                    {/* Role badge */}
                    <div>
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border ${meta.bg} ${meta.color} ${meta.border}`}>
                        <RoleIcon className="w-3 h-3" />
                        {meta.label}
                      </span>
                    </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2">
                        {isProtected ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
                            <Lock className="w-3 h-3" />
                            Protected
                          </span>
                        ) : isConfirmingThisUser ? (
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-[#6b7280]">Reset?</span>
                            <button
                              onClick={() => {
                                posthog.capture('super_admin_reset_confirmed', { user_id: user.id, email: user.email });
                                resetAccountMutation.mutate({ userId: user.id, companyId: (user as any).company_id });
                              }}
                              disabled={resetAccountMutation.isPending}
                              className="px-2.5 py-1 rounded-md text-xs font-medium bg-rose-600 text-white hover:bg-rose-700 transition-colors disabled:opacity-50"
                            >
                              Yes
                            </button>
                            <button
                              onClick={() => setConfirmingDemote(null)}
                              className="px-2.5 py-1 rounded-md text-xs font-medium border border-[#ececf0] text-[#6b7280] hover:bg-[#f9f9f9]"
                            >
                              No
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => {
                              posthog.capture('super_admin_reset_clicked', { user_id: user.id, email: user.email });
                              setConfirmingDemote(user.id);
                            }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-white text-rose-600 border border-[#ececf0] hover:bg-rose-50 hover:border-rose-200 transition-colors"
                          >
                            <RefreshCw className="w-3 h-3" />
                            Reset Account
                          </button>
                        )}

                        {/* Suspend Toggle */}
                        {user.company_id && !isProtected && (
                          <button
                            onClick={() => toggleSuspendCompanyMutation.mutate({ 
                              companyId: user.company_id as string, 
                              status: isSuspended ? 'active' : 'suspended' 
                            })}
                            disabled={toggleSuspendCompanyMutation.isPending}
                            title={isSuspended ? "Unsuspend Business" : "Suspend Business"}
                            className={`p-1.5 rounded-md transition-colors ${
                              isSuspended 
                                ? 'text-red-600 bg-red-50 hover:bg-red-100' 
                                : 'text-[#9ca3af] hover:text-red-600 hover:bg-red-50'
                            }`}
                          >
                            <AlertTriangle className="w-3.5 h-3.5" />
                          </button>
                        )}

                      {/* PostHog drill-through */}
                      <a
                        href={`https://us.posthog.com/project/498702/persons#q=${encodeURIComponent(user.email)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => posthog.capture('super_admin_view_in_posthog', { email: user.email })}
                        className="p-1.5 rounded-md text-[#9ca3af] hover:text-[#030213] hover:bg-[#ececf0] transition-colors"
                        title="View in PostHog"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          {!usersLoading && filteredUsers && filteredUsers.length > 0 && activeTab === 'tenants' && (
            <div className="px-6 py-3 border-t border-[#ececf0] bg-[#fffaef] flex items-center justify-between">
              <p className="text-xs text-[#9ca3af]">
                Showing {filteredUsers.length} of {allUsers?.length ?? 0} users
              </p>
              <p className="text-xs text-[#c4c4c4]">
                Role changes take effect on next login
              </p>
            </div>
          )}
          </>
          )}

          {activeTab === 'employees' && (
            <>
              {/* Search & Filters */}
              <div className="px-6 py-4 bg-[#fffdf5] border-b border-[#ececf0]">
                <div className="relative w-full sm:max-w-md">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#9ca3af]" />
                  <input
                    type="text"
                    placeholder="Search by name, email, or department…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 text-sm bg-white border border-[#ececf0] rounded-md focus:outline-none focus:border-[#030213]/30 focus:ring-1 focus:ring-[#030213]/10 placeholder:text-[#c4c4c4] transition"
                  />
                </div>
              </div>

              {/* Table header */}
              <div className="grid grid-cols-[1.5fr_1fr_1fr_100px] px-6 py-2.5 bg-[#fffaef] border-b border-[#ececf0]">
                {['Employee', 'Business', 'Role / Dept', 'Status'].map(h => (
                  <span key={h} className="text-[11px] font-semibold uppercase tracking-wide text-[#9ca3af]">{h}</span>
                ))}
              </div>

              {/* Rows */}
              <div className="divide-y divide-[#ececf0]">
                {employeesLoading ? (
                  <div className="p-8 text-center text-sm text-[#9ca3af]">Loading employees...</div>
                ) : allPlatformEmployees?.length === 0 ? (
                  <div className="p-8 text-center text-sm text-[#9ca3af]">No employees found.</div>
                ) : (
                  allPlatformEmployees
                    ?.filter(emp => !search || 
                      emp.full_name?.toLowerCase().includes(search.toLowerCase()) || 
                      emp.email?.toLowerCase().includes(search.toLowerCase()) ||
                      emp.department?.toLowerCase().includes(search.toLowerCase())
                    )
                    .map(emp => (
                    <div key={emp.id} className="grid grid-cols-[1.5fr_1fr_1fr_100px] px-6 py-4 gap-4 items-center hover:bg-[#fffdf5] transition-colors">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-full bg-[#ececf0] flex items-center justify-center text-[#6b7280] font-semibold text-sm shrink-0">
                          {emp.full_name?.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-[#030213] truncate">{emp.full_name}</p>
                          <p className="text-xs text-[#9ca3af] truncate">{emp.email}</p>
                        </div>
                      </div>
                      
                      <div className="min-w-0">
                        <p className="text-sm text-[#030213] truncate">{emp.companies?.name || '—'}</p>
                      </div>

                      <div className="min-w-0">
                        <p className="text-sm text-[#6b7280] truncate">{emp.position || '—'}</p>
                        {emp.department && <p className="text-xs text-[#9ca3af] truncate">{emp.department}</p>}
                      </div>

                      <div>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium border ${
                          emp.status === 'active' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 
                          emp.status === 'inactive' ? 'bg-gray-100 text-gray-600 border-gray-200' :
                          'bg-amber-50 text-amber-700 border-amber-200'
                        }`}>
                          {emp.status}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </div>

      </div>
    </div>
  );
}
