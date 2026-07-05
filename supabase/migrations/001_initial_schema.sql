-- ============================================================================
-- SaaS Employee Attendance Tracking System - Database Schema
-- ============================================================================
-- Run this SQL in your Supabase SQL Editor:
-- https://supabase.com/dashboard/project/echrtzjueziyzlnsnogn/sql/new
-- ============================================================================

-- Create employees table
CREATE TABLE IF NOT EXISTS employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  employee_id TEXT UNIQUE NOT NULL,
  department TEXT,
  position TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for employees
CREATE INDEX IF NOT EXISTS idx_employees_email ON employees(email);
CREATE INDEX IF NOT EXISTS idx_employees_employee_id ON employees(employee_id);
CREATE INDEX IF NOT EXISTS idx_employees_status ON employees(status);

-- Create webauthn_credentials table
CREATE TABLE IF NOT EXISTS webauthn_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  credential_id TEXT UNIQUE NOT NULL,
  public_key TEXT NOT NULL,
  counter BIGINT NOT NULL DEFAULT 0,
  transports TEXT[],
  device_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ
);

-- Create indexes for webauthn_credentials
CREATE INDEX IF NOT EXISTS idx_webauthn_employee_id ON webauthn_credentials(employee_id);
CREATE INDEX IF NOT EXISTS idx_webauthn_credential_id ON webauthn_credentials(credential_id);

-- Create attendance_logs table
CREATE TABLE IF NOT EXISTS attendance_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  check_in_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  distance_from_office DOUBLE PRECISION,
  is_late BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'present' CHECK (status IN ('present', 'late', 'absent')),
  credential_id TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for attendance_logs
CREATE INDEX IF NOT EXISTS idx_attendance_employee_id ON attendance_logs(employee_id);
CREATE INDEX IF NOT EXISTS idx_attendance_check_in_time ON attendance_logs(check_in_time DESC);
CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance_logs(((check_in_time AT TIME ZONE 'UTC')::date));
CREATE INDEX IF NOT EXISTS idx_attendance_status ON attendance_logs(status);
CREATE INDEX IF NOT EXISTS idx_attendance_is_late ON attendance_logs(is_late);
CREATE INDEX IF NOT EXISTS idx_attendance_employee_date ON attendance_logs(employee_id, ((check_in_time AT TIME ZONE 'UTC')::date));

-- Create system_settings table (singleton)
CREATE TABLE IF NOT EXISTS system_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  office_latitude DOUBLE PRECISION NOT NULL DEFAULT 37.7749,
  office_longitude DOUBLE PRECISION NOT NULL DEFAULT -122.4194,
  office_radius_meters DOUBLE PRECISION NOT NULL DEFAULT 100,
  work_start_time TIME NOT NULL DEFAULT '09:00:00',
  late_grace_period_minutes INTEGER NOT NULL DEFAULT 15,
  qr_code_secret TEXT NOT NULL DEFAULT encode(gen_random_bytes(32), 'base64'),
  qr_code_version INTEGER NOT NULL DEFAULT 1,
  qr_code_regenerated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ensure only one row in system_settings
CREATE UNIQUE INDEX IF NOT EXISTS idx_system_settings_singleton ON system_settings((TRUE));

-- Create admin_users table
CREATE TABLE IF NOT EXISTS admin_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('admin', 'super_admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create audit_logs table
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID REFERENCES admin_users(id),
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_admin_user ON audit_logs(admin_user_id);

-- ============================================================================
-- Database Functions
-- ============================================================================

-- Haversine formula for distance calculation
CREATE OR REPLACE FUNCTION calculate_distance_meters(
  lat1 DOUBLE PRECISION,
  lon1 DOUBLE PRECISION,
  lat2 DOUBLE PRECISION,
  lon2 DOUBLE PRECISION
) RETURNS DOUBLE PRECISION AS $$
DECLARE
  R CONSTANT DOUBLE PRECISION := 6371000; -- Earth radius in meters
  dLat DOUBLE PRECISION;
  dLon DOUBLE PRECISION;
  a DOUBLE PRECISION;
  c DOUBLE PRECISION;
BEGIN
  dLat := radians(lat2 - lat1);
  dLon := radians(lon2 - lon1);

  a := sin(dLat/2) * sin(dLat/2) +
       cos(radians(lat1)) * cos(radians(lat2)) *
       sin(dLon/2) * sin(dLon/2);

  c := 2 * atan2(sqrt(a), sqrt(1-a));

  RETURN R * c;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Check if check-in is late
CREATE OR REPLACE FUNCTION is_check_in_late(check_in_time TIMESTAMPTZ)
RETURNS BOOLEAN AS $$
DECLARE
  settings RECORD;
  cutoff_time TIME;
BEGIN
  SELECT work_start_time, late_grace_period_minutes
  INTO settings
  FROM system_settings
  LIMIT 1;

  cutoff_time := settings.work_start_time + (settings.late_grace_period_minutes || ' minutes')::INTERVAL;

  RETURN (check_in_time::TIME > cutoff_time);
END;
$$ LANGUAGE plpgsql STABLE;

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at
DROP TRIGGER IF EXISTS update_employees_updated_at ON employees;
CREATE TRIGGER update_employees_updated_at
  BEFORE UPDATE ON employees
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_system_settings_updated_at ON system_settings;
CREATE TRIGGER update_system_settings_updated_at
  BEFORE UPDATE ON system_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Row Level Security (RLS)
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE webauthn_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Public read active employees" ON employees;
DROP POLICY IF EXISTS "Service role full access webauthn" ON webauthn_credentials;
DROP POLICY IF EXISTS "Service role insert attendance" ON attendance_logs;
DROP POLICY IF EXISTS "Public read settings" ON system_settings;
DROP POLICY IF EXISTS "Public read settings for check-in" ON system_settings;

-- Employees: Public can read active employees
CREATE POLICY "Public read active employees" ON employees
  FOR SELECT USING (status = 'active');

-- WebAuthn Credentials: Service role only (accessed via Edge Functions)
CREATE POLICY "Service role full access webauthn" ON webauthn_credentials
  FOR ALL USING (true);

-- Attendance Logs: Service role can insert (via Edge Functions)
CREATE POLICY "Service role insert attendance" ON attendance_logs
  FOR INSERT WITH CHECK (true);

-- System Settings: Public can read (needed for validation in check-in flow)
CREATE POLICY "Public read settings for check-in" ON system_settings
  FOR SELECT USING (true);

-- Admin Users: Authenticated users can read admin profiles to authorize logins
CREATE POLICY "Allow read access to admin_users for authenticated users" ON admin_users
  FOR SELECT TO authenticated USING (true);

-- ============================================================================
-- Initial Data
-- ============================================================================

-- Insert default system settings (if not exists)
INSERT INTO system_settings (
  office_latitude,
  office_longitude,
  office_radius_meters,
  work_start_time,
  late_grace_period_minutes
)
SELECT
  37.7749,  -- San Francisco latitude (change this to your office location)
  -122.4194, -- San Francisco longitude (change this to your office location)
  100,       -- 100 meters radius
  '09:00:00'::TIME,
  15         -- 15 minutes grace period
WHERE NOT EXISTS (SELECT 1 FROM system_settings LIMIT 1);

-- Insert demo employees (optional - remove in production)
INSERT INTO employees (email, full_name, employee_id, department, position, status)
VALUES
  ('john.doe@example.com', 'John Doe', 'EMP001', 'Engineering', 'Software Engineer', 'active'),
  ('jane.smith@example.com', 'Jane Smith', 'EMP002', 'Marketing', 'Marketing Manager', 'active'),
  ('bob.johnson@example.com', 'Bob Johnson', 'EMP003', 'Sales', 'Sales Representative', 'active')
ON CONFLICT (email) DO NOTHING;

-- Insert demo admin user (optional - remove in production)
INSERT INTO admin_users (email, full_name, role)
VALUES ('mansursaidu007@gmail.com', 'Admin User', 'super_admin')
ON CONFLICT (email) DO NOTHING;

-- ============================================================================
-- Verification Queries
-- ============================================================================

-- Run these to verify the schema was created correctly:

-- SELECT tablename FROM pg_tables WHERE schemaname = 'public'
-- AND tablename IN ('employees', 'webauthn_credentials', 'attendance_logs', 'system_settings', 'admin_users', 'audit_logs');

-- SELECT * FROM system_settings;
-- SELECT * FROM employees;
