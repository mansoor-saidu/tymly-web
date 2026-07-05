// Database type definitions for Supabase tables

export interface Company {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface Employee {
  id: string;
  company_id: string;
  email: string;
  full_name: string;
  employee_id: string;
  department: string | null;
  position: string | null;
  status: 'active' | 'inactive' | 'suspended';
  shift_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Shift {
  id: string;
  company_id: string;
  name: string;
  start_time: string;
  late_grace_period_minutes: number;
  created_at: string;
  updated_at: string;
}

export interface WebAuthnCredential {
  id: string;
  company_id: string;
  employee_id: string;
  credential_id: string;
  public_key: string;
  counter: number;
  transports: string[] | null;
  device_name: string | null;
  created_at: string;
  last_used_at: string | null;
}

export interface AttendanceLog {
  id: string;
  company_id: string;
  employee_id: string;
  check_in_time: string;
  latitude: number;
  longitude: number;
  distance_from_office: number | null;
  is_late: boolean;
  status: 'present' | 'late' | 'absent';
  credential_id: string;
  user_agent: string | null;
  created_at: string;
}

export interface SystemSettings {
  id: string;
  company_id: string;
  office_polygon: [number, number][];
  work_start_time: string;
  late_grace_period_minutes: number;
  qr_code_secret: string;
  qr_code_version: number;
  qr_code_regenerated_at: string;
  notification_email: string | null;
  notification_whatsapp: string | null;
  whatsapp_api_key: string | null;
  notify_on_late: boolean;
  notify_daily_summary: boolean;
  created_at: string;
  updated_at: string;
}

export interface AdminUser {
  id: string;
  company_id: string;
  email: string;
  full_name: string;
  business_name?: string | null;
  phone_number?: string | null;
  employee_size?: string | null;
  how_did_you_hear?: string | null;
  profile_picture_url?: string | null;
  role: 'admin' | 'super_admin';
  is_master_admin: boolean;
  created_at: string;
  updated_at: string;
}

export interface AuditLog {
  id: string;
  admin_user_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  details: Record<string, any> | null;
  created_at: string;
}

export interface LeaveRequest {
  id: string;
  company_id: string;
  employee_id: string;
  leave_type: 'vacation' | 'sick' | 'personal' | 'unpaid';
  start_date: string;
  end_date: string;
  reason: string | null;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  updated_at: string;
}

// Extended types with relations
export interface AttendanceLogWithEmployee extends AttendanceLog {
  employee: Employee;
}

export interface EmployeeWithCredentials extends Employee {
  credentials: WebAuthnCredential[];
}

export interface LeaveRequestWithEmployee extends LeaveRequest {
  employee: Employee;
}

