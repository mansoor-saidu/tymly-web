import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import * as kv from "./kv_store.ts";
import { createClient } from "jsr:@supabase/supabase-js@2.49.8";
import { createHmac } from "node:crypto";
import booleanPointInPolygon from "npm:@turf/boolean-point-in-polygon";
import { point, polygon } from "npm:@turf/helpers";

const app = new Hono();

// Supabase client helper
const getSupabaseClient = () => createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

// Enable logger
app.use('*', logger(console.log));

// Enable CORS for all routes and methods
app.use(
  "/*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
  }),
);

// Health check endpoint
app.get("/make-server-7456b3bc/health", (c) => {
  return c.json({ status: "ok" });
});

// Generate QR URL for printing (long-lived, static)
app.post("/make-server-7456b3bc/generate-qr-url", async (c) => {
  try {
    const supabase = getSupabaseClient();
    const { companyId } = await c.req.json().catch(() => ({ companyId: null }));

    if (!companyId) {
      return c.json({ error: 'Missing company ID' }, 400);
    }

    // Get QR code secret and version from settings
    const { data: settings, error } = await supabase
      .from('system_settings')
      .select('qr_code_secret, qr_code_version')
      .eq('company_id', companyId)
      .single();

    if (error || !settings) {
      console.error('Failed to fetch settings:', error);
      return c.json({ error: 'Failed to generate QR URL' }, 500);
    }

    // Create a long-lived token using HMAC
    // Format: HMAC(secret, "qr_check_in:version")
    const payload = `qr_check_in:${settings.qr_code_version}`;
    const hmac = createHmac('sha256', settings.qr_code_secret);
    hmac.update(payload);
    const token = hmac.digest('hex');

    // Get base URL from request headers (for proper domain in different environments)
    const origin = c.req.header('origin') || c.req.header('referer') || 'https://app.usetymly.com';
    const baseUrl = new URL(origin).origin;

    // Generate URL with token, version, and companyId
    const url = `${baseUrl}/check-in?qr_token=${token}&v=${settings.qr_code_version}&c=${companyId}`;

    return c.json({
      url,
      version: settings.qr_code_version,
      token,
    });
  } catch (error) {
    console.error('QR URL generation error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Verify QR token from URL
app.post("/make-server-7456b3bc/verify-qr-token", async (c) => {
  try {
    const supabase = getSupabaseClient();
    const { token, version, companyId } = await c.req.json();

    if (!token || !version || !companyId) {
      return c.json({ valid: false, message: 'Missing token, version, or company ID' });
    }

    // Get current QR code secret and version
    const { data: settings, error } = await supabase
      .from('system_settings')
      .select('qr_code_secret, qr_code_version')
      .eq('company_id', companyId)
      .single();

    if (error || !settings) {
      return c.json({ valid: false, message: 'Failed to verify QR token' });
    }

    // Check version matches
    const versionNum = parseInt(version, 10);
    if (versionNum !== settings.qr_code_version) {
      return c.json({ valid: false, message: 'QR code version is outdated. Please scan the new QR code.' });
    }

    // Verify HMAC signature
    const payload = `qr_check_in:${versionNum}`;
    const hmac = createHmac('sha256', settings.qr_code_secret);
    hmac.update(payload);
    const expectedToken = hmac.digest('hex');

    if (token !== expectedToken) {
      return c.json({ valid: false, message: 'Invalid QR token' });
    }

    return c.json({
      valid: true,
      message: 'QR token verified successfully',
    });
  } catch (error) {
    console.error('QR token verification error:', error);
    return c.json({ valid: false, message: 'Verification failed' }, 500);
  }
});

// Create WebAuthn challenge
app.post("/make-server-7456b3bc/create-webauthn-challenge", async (c) => {
  try {
    const { employeeId } = await c.req.json();

    // Generate random challenge
    const challenge = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));

    // Store challenge temporarily (in production, use Redis or similar)
    await kv.set(`webauthn_challenge_${employeeId}`, {
      challenge,
      timestamp: Date.now(),
    });

    return c.json({ challenge, employeeId });
  } catch (error) {
    console.error('Challenge creation error:', error);
    return c.json({ error: 'Failed to create challenge' }, 500);
  }
});

// Store WebAuthn credential
app.post("/make-server-7456b3bc/store-webauthn-credential", async (c) => {
  try {
    const supabase = getSupabaseClient();
    const { employeeId, credentialId, publicKey, transports } = await c.req.json();

    // Check if employee exists
    const { data: employee, error: empError } = await supabase
      .from('employees')
      .select('id')
      .eq('id', employeeId)
      .single();

    if (empError || !employee) {
      return c.json({ success: false, message: 'Employee not found' }, 404);
    }

    // Insert credential
    const { error: insertError } = await supabase
      .from('webauthn_credentials')
      .insert({
        employee_id: employeeId,
        credential_id: credentialId,
        public_key: publicKey,
        transports,
        counter: 0,
      });

    if (insertError) {
      console.error('Credential storage error:', insertError);
      return c.json({ success: false, message: 'Failed to store credential' }, 500);
    }

    return c.json({ success: true, message: 'Credential registered successfully' });
  } catch (error) {
    console.error('Store credential error:', error);
    return c.json({ success: false, message: 'Internal server error' }, 500);
  }
});

// Log attendance (with WebAuthn verification and geolocation)
app.post("/make-server-7456b3bc/log-attendance", async (c) => {
  try {
    const supabase = getSupabaseClient();
    const {
      employeeId,
      latitude,
      longitude,
      credentialId,
      userAgent,
    } = await c.req.json();

    // Fetch employee to get company_id
    const { data: employee, error: empError } = await supabase
      .from('employees')
      .select('company_id, full_name')
      .eq('id', employeeId)
      .single();

    if (empError || !employee) {
      return c.json({ success: false, error: 'Employee not found' }, 404);
    }

    const companyId = employee.company_id;

    // Fetch system settings
    const { data: settings, error: settingsError } = await supabase
      .from('system_settings')
      .select('office_polygon, notify_on_late, notification_whatsapp, whatsapp_api_key')
      .eq('company_id', companyId)
      .single();

    if (settingsError || !settings) {
      return c.json({ success: false, error: 'Failed to fetch settings' }, 500);
    }

    // Verify location using Turf.js
    let isInside = false;
    try {
      if (settings.office_polygon && Array.isArray(settings.office_polygon) && settings.office_polygon.length > 2) {
        const pt = point([longitude, latitude]); // Turf uses [longitude, latitude]
        const poly = polygon([settings.office_polygon]);
        isInside = booleanPointInPolygon(pt, poly);
      }
    } catch (e) {
      console.error('Turf validation error:', e);
      // Fallback or fail
    }

    // Validate location
    if (!isInside) {
      return c.json({
        success: false,
        error: `You are not inside the office boundary. Please move closer.`,
      }, 400);
    }

    // Check if employee already checked in today
    const today = new Date().toISOString().split('T')[0];
    const { data: existingLog } = await supabase
      .from('attendance_logs')
      .select('id, check_in_time, check_out_time')
      .eq('employee_id', employeeId)
      .gte('check_in_time', `${today}T00:00:00`)
      .lt('check_in_time', `${today}T23:59:59`)
      .order('check_in_time', { ascending: false })
      .limit(1)
      .maybeSingle();

    const now = new Date().toISOString();

    if (existingLog) {
      if (existingLog.check_out_time === null) {
        // Handle Check-Out
        const checkInDate = new Date(existingLog.check_in_time);
        const checkOutDate = new Date(now);
        const hoursWorked = (checkOutDate.getTime() - checkInDate.getTime()) / (1000 * 60 * 60);

        const { error: updateError } = await supabase
          .from('attendance_logs')
          .update({
            check_out_time: now,
            hours_worked: parseFloat(hoursWorked.toFixed(2))
          })
          .eq('id', existingLog.id);

        if (updateError) {
          console.error('Check-out error:', updateError);
          return c.json({ success: false, error: 'Failed to log check-out' }, 500);
        }

        return c.json({
          success: true,
          action: 'check-out',
          attendanceId: existingLog.id,
          checkOutTime: now,
          hoursWorked: parseFloat(hoursWorked.toFixed(2))
        });
      } else {
        // They already checked in and out today.
        return c.json({
          success: false,
          error: 'You have already checked in and out today. Have a great day!',
        }, 400);
      }
    }

    // Determine if check-in is late using database function (now taking employeeId for shifts)
    const { data: isLateData } = await supabase
      .rpc('is_check_in_late', { p_check_in_time: now, p_employee_id: employeeId });

    const isLate = isLateData || false;

    // Insert attendance log
    const { data: attendance, error: insertError } = await supabase
      .from('attendance_logs')
      .insert({
        company_id: companyId,
        employee_id: employeeId,
        check_in_time: now,
        latitude,
        longitude,
        distance_from_office: 0, // No longer used, but keeping column for backward compatibility or future use
        is_late: isLate,
        status: isLate ? 'late' : 'present',
        credential_id: credentialId,
        user_agent: userAgent,
      })
      .select()
      .single();

    if (insertError) {
      console.error('Attendance log insertion error:', insertError);
      return c.json({ success: false, error: 'Failed to log attendance' }, 500);
    }

    // Send WhatsApp notification if late
    if (isLate && settings.notify_on_late && settings.notification_whatsapp && settings.whatsapp_api_key) {
      const checkInTimeFormatted = new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const message = `⚠️ *Late Check-In Alert*\nEmployee: ${employee.full_name}\nTime: ${checkInTimeFormatted}`;
      const phone = settings.notification_whatsapp.replace(/\D/g, ''); // strip non-numeric characters like + or -
      
      /* 
      const waUrl = `https://api.callmebot.com/whatsapp.php?phone=${phone}&text=${encodeURIComponent(message)}&apikey=${settings.whatsapp_api_key}`;
      
      // Fire and forget so we don't block the response
      fetch(waUrl)
        .then(res => {
          if (!res.ok) console.error('CallMeBot responded with status:', res.status);
        })
        .catch(e => console.error('CallMeBot fetch error:', e));
      */
    }

    return c.json({
      success: true,
      action: 'check-in',
      attendanceId: attendance.id,
      checkInTime: attendance.check_in_time,
      isLate,
    });
  } catch (error) {
    console.error('Log attendance error:', error);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// Get attendance logs (with filters and pagination)
app.post("/make-server-7456b3bc/get-attendance-logs", async (c) => {
  try {
    const supabase = getSupabaseClient();
    const { startDate, endDate, employeeId, status, limit = 100, offset = 0 } = await c.req.json();

    let query = supabase
      .from('attendance_logs')
      .select(`
        id,
        check_in_time,
        distance_from_office,
        is_late,
        status,
        employee:employees(id, full_name, employee_id, department)
      `, { count: 'exact' })
      .order('check_in_time', { ascending: false })
      .range(offset, offset + limit - 1);

    if (startDate) {
      query = query.gte('check_in_time', startDate);
    }
    if (endDate) {
      query = query.lte('check_in_time', endDate);
    }
    if (employeeId) {
      query = query.eq('employee_id', employeeId);
    }
    if (status) {
      query = query.eq('status', status);
    }

    const { data, error, count } = await query;

    if (error) {
      console.error('Fetch logs error:', error);
      return c.json({ error: 'Failed to fetch logs' }, 500);
    }

    return c.json({
      logs: data || [],
      total: count || 0,
      hasMore: (count || 0) > offset + limit,
    });
  } catch (error) {
    console.error('Get attendance logs error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Manage employees
app.post("/make-server-7456b3bc/manage-employees", async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    if (!authHeader) return c.json({ success: false, message: 'Unauthorized' }, 401);

    const authClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return c.json({ success: false, message: 'Unauthorized' }, 401);

    const { data: adminUser } = await authClient
      .from('admin_users')
      .select('company_id')
      .eq('id', user.id)
      .single();

    if (!adminUser?.company_id) return c.json({ success: false, message: 'Admin profile not found' }, 403);

    const companyId = adminUser.company_id;
    const supabase = getSupabaseClient();
    const { action, employeeId, data } = await c.req.json();

    if (action === 'list') {
      const { data: employees, error } = await supabase
        .from('employees')
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false });

      if (error) {
        return c.json({ success: false, message: 'Failed to fetch employees' }, 500);
      }

      return c.json({ success: true, employees });
    }

    if (action === 'create') {
      // Enforce 10-user limit
      const { count } = await supabase
        .from('employees')
        .select('*', { count: 'exact', head: true })
        .eq('company_id', companyId);

      if (count !== null && count >= 10) {
        return c.json({ success: false, message: 'Registration limit reached. You can only register up to 10 employees.' }, 403);
      }

      const { data: employee, error } = await supabase
        .from('employees')
        .insert({
          company_id: companyId,
          email: data.email,
          full_name: data.fullName,
          employee_id: data.employeeId,
          department: data.department,
          position: data.position,
          status: data.status || 'active',
        })
        .select()
        .single();

      if (error) {
        console.error('Create employee error:', error);
        return c.json({ success: false, message: 'Failed to create employee' }, 500);
      }

      return c.json({ success: true, employee });
    }

    if (action === 'update' && employeeId) {
      const { error } = await supabase
        .from('employees')
        .update({
          email: data.email,
          full_name: data.fullName,
          department: data.department,
          position: data.position,
          status: data.status,
        })
        .eq('id', employeeId);

      if (error) {
        return c.json({ success: false, message: 'Failed to update employee' }, 500);
      }

      return c.json({ success: true });
    }

    if (action === 'delete' && employeeId) {
      const { error } = await supabase
        .from('employees')
        .delete()
        .eq('id', employeeId);

      if (error) {
        return c.json({ success: false, message: 'Failed to delete employee' }, 500);
      }

      return c.json({ success: true });
    }

    return c.json({ success: false, message: 'Invalid action' }, 400);
  } catch (error) {
    console.error('Manage employees error:', error);
    return c.json({ success: false, message: 'Internal server error' }, 500);
  }
});

// Manage leave requests (create for unauthenticated employees, update/list for admins)
app.post("/make-server-7456b3bc/manage-leave-requests", async (c) => {
  try {
    const supabase = getSupabaseClient();
    const { action, employeeId, leaveRequestId, data } = await c.req.json();

    if (action === 'create') {
      if (!employeeId) return c.json({ success: false, message: 'Missing employee ID' }, 400);
      
      const { data: request, error } = await supabase
        .from('leave_requests')
        .insert({
          employee_id: employeeId,
          leave_type: data.leaveType,
          start_date: data.startDate,
          end_date: data.endDate,
          reason: data.reason,
          status: 'pending',
        })
        .select()
        .single();

      if (error) {
        console.error('Create leave request error:', error);
        return c.json({ success: false, message: 'Failed to submit leave request' }, 500);
      }

      return c.json({ success: true, request });
    }

    if (action === 'update_status') {
      if (!leaveRequestId || !data.status) return c.json({ success: false, message: 'Missing required parameters' }, 400);

      const { error } = await supabase
        .from('leave_requests')
        .update({
          status: data.status,
          updated_at: new Date().toISOString()
        })
        .eq('id', leaveRequestId);

      if (error) {
        return c.json({ success: false, message: 'Failed to update leave request status' }, 500);
      }

      return c.json({ success: true });
    }

    if (action === 'list') {
      const query = supabase
        .from('leave_requests')
        .select(`
          *,
          employee:employees (
            id,
            full_name,
            employee_id,
            department
          )
        `)
        .order('created_at', { ascending: false });
        
      if (employeeId) {
        query.eq('employee_id', employeeId);
      }

      const { data: requests, error } = await query;

      if (error) {
        return c.json({ success: false, message: 'Failed to fetch leave requests' }, 500);
      }

      return c.json({ success: true, requests });
    }

    return c.json({ success: false, message: 'Invalid action' }, 400);
  } catch (error) {
    console.error('Manage leave requests error:', error);
    return c.json({ success: false, message: 'Internal server error' }, 500);
  }
});

// Manage shifts (create, read, update, delete)
app.post("/make-server-7456b3bc/manage-shifts", async (c) => {
  try {
    const supabase = getSupabaseClient();
    const { action, shiftId, data } = await c.req.json();

    if (action === 'create') {
      const { data: shift, error } = await supabase
        .from('shifts')
        .insert({
          name: data.name,
          start_time: data.startTime,
          late_grace_period_minutes: data.lateGracePeriodMinutes,
        })
        .select()
        .single();

      if (error) return c.json({ success: false, message: 'Failed to create shift' }, 500);
      return c.json({ success: true, shift });
    }

    if (action === 'update' && shiftId) {
      const { error } = await supabase
        .from('shifts')
        .update({
          name: data.name,
          start_time: data.startTime,
          late_grace_period_minutes: data.lateGracePeriodMinutes,
          updated_at: new Date().toISOString()
        })
        .eq('id', shiftId);

      if (error) return c.json({ success: false, message: 'Failed to update shift' }, 500);
      return c.json({ success: true });
    }

    if (action === 'delete' && shiftId) {
      const { error } = await supabase
        .from('shifts')
        .delete()
        .eq('id', shiftId);

      if (error) return c.json({ success: false, message: 'Failed to delete shift' }, 500);
      return c.json({ success: true });
    }

    if (action === 'list') {
      const { data: shifts, error } = await supabase
        .from('shifts')
        .select('*')
        .order('name');

      if (error) return c.json({ success: false, message: 'Failed to fetch shifts' }, 500);
      return c.json({ success: true, shifts });
    }

    return c.json({ success: false, message: 'Invalid action' }, 400);
  } catch (error) {
    console.error('Manage shifts error:', error);
    return c.json({ success: false, message: 'Internal server error' }, 500);
  }
});

// Manage settings (update location, work hours, regenerate QR)
app.post("/make-server-7456b3bc/manage-settings", async (c) => {
  try {
    const supabase = getSupabaseClient();
    const { action, settingsId, data } = await c.req.json();

    if (!settingsId) {
      return c.json({ success: false, message: 'Missing settings ID' }, 400);
    }

    if (action === 'update_location') {
      const { error } = await supabase
        .from('system_settings')
        .update({
          office_polygon: data.polygon,
        })
        .eq('id', settingsId);

      if (error) return c.json({ success: false, message: 'Failed to update location' }, 500);
      return c.json({ success: true });
    }

    if (action === 'update_work_hours') {
      const { error } = await supabase
        .from('system_settings')
        .update({
          work_start_time: `${data.startTime}:00`,
          late_grace_period_minutes: data.gracePeriod,
        })
        .eq('id', settingsId);

      if (error) return c.json({ success: false, message: 'Failed to update work hours' }, 500);
      return c.json({ success: true });
    }

    if (action === 'regenerate_qr') {
      const { error } = await supabase
        .from('system_settings')
        .update({
          qr_code_version: data.version,
          qr_code_regenerated_at: new Date().toISOString(),
        })
        .eq('id', settingsId);

      if (error) return c.json({ success: false, message: 'Failed to regenerate QR' }, 500);
      return c.json({ success: true });
    }

    if (action === 'update_notifications') {
      const { error } = await supabase
        .from('system_settings')
        .update({
          notification_email: data.notification_email,
          notification_whatsapp: data.notification_whatsapp,
          whatsapp_api_key: data.whatsapp_api_key,
          notify_on_late: data.notify_on_late,
          notify_daily_summary: data.notify_daily_summary,
        })
        .eq('id', settingsId);

      if (error) return c.json({ success: false, message: 'Failed to update notifications' }, 500);
      return c.json({ success: true });
    }

    return c.json({ success: false, message: 'Invalid action' }, 400);
  } catch (error) {
    console.error('Manage settings error:', error);
    return c.json({ success: false, message: 'Internal server error' }, 500);
  }
});

// Send Daily Summary
app.post("/make-server-7456b3bc/send-daily-summary", async (c) => {
  try {
    const supabase = getSupabaseClient();
    
    // Auth bypass for internal cron job could be implemented here via a secret key header.
    // For now, we will execute it safely.
    
    // Fetch all settings with daily summary enabled
    const { data: allSettings, error: settingsError } = await supabase
      .from('system_settings')
      .select('company_id, notify_daily_summary, notification_whatsapp, whatsapp_api_key')
      .eq('notify_daily_summary', true);

    if (settingsError || !allSettings) {
      return c.json({ success: false, error: 'Failed to fetch settings' }, 500);
    }

    const today = new Date().toISOString().split('T')[0];
    let messagesSent = 0;

    for (const settings of allSettings) {
      if (!settings.notification_whatsapp || !settings.whatsapp_api_key) continue;

      // Fetch active employees
      const { data: employees } = await supabase
        .from('employees')
        .select('id')
        .eq('company_id', settings.company_id)
        .eq('status', 'active');

      const totalEmployees = employees ? employees.length : 0;

      // Fetch today's logs
      const { data: logs } = await supabase
        .from('attendance_logs')
        .select('employee_id, is_late')
        .eq('company_id', settings.company_id)
        .gte('check_in_time', `${today}T00:00:00`)
        .lt('check_in_time', `${today}T23:59:59`);

      const totalCheckedIn = logs ? logs.length : 0;
      const lateCount = logs ? logs.filter(l => l.is_late).length : 0;
      const onTimeCount = totalCheckedIn - lateCount;
      const absentCount = totalEmployees - totalCheckedIn;

      const message = `📊 *Daily Attendance Summary*\nDate: ${today}\n\n👥 Total Staff: ${totalEmployees}\n✅ On Time: ${onTimeCount}\n⚠️ Late: ${lateCount}\n❌ Absent: ${absentCount}\n\nHave a great day!`;
      const phone = settings.notification_whatsapp.replace(/\D/g, '');

      /*
      const waUrl = `https://api.callmebot.com/whatsapp.php?phone=${phone}&text=${encodeURIComponent(message)}&apikey=${settings.whatsapp_api_key}`;
      
      try {
        const res = await fetch(waUrl);
        if (res.ok) messagesSent++;
      } catch (e) {
        console.error('Failed to send summary for company:', settings.company_id, e);
      }
      */
    }

    return c.json({ success: true, messagesSent });
  } catch (error) {
    console.error('Send summary error:', error);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

Deno.serve(app.fetch);