// API request and response type definitions

import type { AttendanceLog, Employee } from './database';

// QR Code Verification
export interface VerifyQRRequest {
  qrPayload: string;
  timestamp: number;
}

export interface VerifyQRResponse {
  valid: boolean;
  message?: string;
  qrCodeVersion?: number;
}

// Attendance Logging
export interface LogAttendanceRequest {
  employeeId: string;
  latitude: number;
  longitude: number;
  credentialId: string;
  signature: string;
  authenticatorData: string;
  clientDataJSON: string;
  userAgent: string;
}

export interface LogAttendanceResponse {
  success: boolean;
  attendanceId?: string;
  checkInTime?: string;
  isLate?: boolean;
  message?: string;
  error?: string;
}

// Attendance Logs Retrieval
export interface GetAttendanceLogsRequest {
  startDate?: string;
  endDate?: string;
  employeeId?: string;
  status?: 'present' | 'late' | 'absent';
  limit?: number;
  offset?: number;
}

export interface GetAttendanceLogsResponse {
  logs: Array<{
    id: string;
    employee: {
      id: string;
      full_name: string;
      employee_id: string;
      department: string | null;
    };
    check_in_time: string;
    distance_from_office: number | null;
    is_late: boolean;
    status: string;
  }>;
  total: number;
  hasMore: boolean;
}

// Report Generation
export interface GenerateReportRequest {
  reportType: 'daily' | 'weekly' | 'monthly' | 'custom';
  startDate?: string;
  endDate?: string;
  employeeId?: string;
  format?: 'json' | 'csv' | 'pdf' | 'excel';
}

export interface ReportSummary {
  totalEmployees: number;
  totalCheckIns: number;
  attendanceRate: number;
  averageLateCount: number;
  onTimeCount: number;
  lateCount: number;
}

export interface DailyBreakdown {
  date: string;
  total_check_ins: number;
  on_time: number;
  late: number;
  on_time_percentage: number;
}

export interface EmployeeBreakdown {
  employee_id: string;
  full_name: string;
  employee_number: string;
  check_ins: number;
  late_count: number;
  attendance_rate: number;
}

export interface GenerateReportResponse {
  data: {
    summary: ReportSummary;
    dailyBreakdown?: DailyBreakdown[];
    employeeBreakdown?: EmployeeBreakdown[];
  };
  exportUrl?: string;
}

// Settings Management
export interface ManageSettingsRequest {
  action: 'update_location' | 'regenerate_qr' | 'update_policies';
  data?: {
    officeLatitude?: number;
    officeLongitude?: number;
    officeRadiusMeters?: number;
    workStartTime?: string;
    lateGracePeriodMinutes?: number;
  };
}

export interface ManageSettingsResponse {
  success: boolean;
  message?: string;
  qrCodePayload?: string;
}

// Employee Management
export interface ManageEmployeesRequest {
  action: 'create' | 'update' | 'delete' | 'list';
  employeeId?: string;
  data?: {
    email: string;
    fullName: string;
    employeeId: string;
    department?: string;
    position?: string;
    status?: 'active' | 'inactive';
  };
}

export interface ManageEmployeesResponse {
  success: boolean;
  employee?: Employee;
  employees?: Employee[];
  message?: string;
}

// WebAuthn Challenge
export interface CreateWebAuthnChallengeRequest {
  employeeId: string;
}

export interface CreateWebAuthnChallengeResponse {
  challenge: string;
  employeeId: string;
}

// WebAuthn Credential Storage
export interface StoreWebAuthnCredentialRequest {
  employeeId: string;
  credentialId: string;
  publicKey: string;
  transports?: string[];
  deviceName?: string;
}

export interface StoreWebAuthnCredentialResponse {
  success: boolean;
  message?: string;
}

// Geolocation
export interface GeolocationPosition {
  latitude: number;
  longitude: number;
  accuracy?: number;
}

// QR Code
export interface QRCodeData {
  version: number;
  timestamp: number;
  signature: string;
}
