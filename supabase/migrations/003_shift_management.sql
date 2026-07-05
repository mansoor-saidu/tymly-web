-- Create shifts table
CREATE TABLE IF NOT EXISTS shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  start_time TIME NOT NULL,
  late_grace_period_minutes INTEGER NOT NULL DEFAULT 15,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Update employees table to include shift_id
ALTER TABLE employees ADD COLUMN IF NOT EXISTS shift_id UUID REFERENCES shifts(id) ON DELETE SET NULL;

-- Enable RLS for shifts
ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;

-- Admins can read/manage shifts
CREATE POLICY "Allow admin to read shifts"
  ON shifts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM admin_users WHERE email = auth.jwt()->>'email'
    )
  );

CREATE POLICY "Allow admin to manage shifts"
  ON shifts FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM admin_users WHERE email = auth.jwt()->>'email'
    )
  );

-- Update the is_check_in_late function to accept employee_id and check shifts
DROP FUNCTION IF EXISTS is_check_in_late(TIMESTAMPTZ);

CREATE OR REPLACE FUNCTION is_check_in_late(p_check_in_time TIMESTAMPTZ, p_employee_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  global_settings RECORD;
  employee_shift RECORD;
  cutoff_time TIME;
BEGIN
  -- First check if employee has a specific shift assigned
  SELECT s.start_time, s.late_grace_period_minutes
  INTO employee_shift
  FROM employees e
  JOIN shifts s ON e.shift_id = s.id
  WHERE e.id = p_employee_id;

  -- If employee has a shift, calculate based on shift
  IF FOUND AND employee_shift.start_time IS NOT NULL THEN
    cutoff_time := employee_shift.start_time + (employee_shift.late_grace_period_minutes || ' minutes')::INTERVAL;
    RETURN (p_check_in_time::TIME > cutoff_time);
  END IF;

  -- Otherwise fallback to global settings
  SELECT work_start_time, late_grace_period_minutes
  INTO global_settings
  FROM system_settings
  LIMIT 1;

  cutoff_time := global_settings.work_start_time + (global_settings.late_grace_period_minutes || ' minutes')::INTERVAL;
  RETURN (p_check_in_time::TIME > cutoff_time);
END;
$$ LANGUAGE plpgsql STABLE;
