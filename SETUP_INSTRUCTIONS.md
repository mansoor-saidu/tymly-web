# SaaS Employee Attendance Tracking System - Setup Instructions

## Overview

This is a complete employee attendance tracking system with:
- Universal QR code scanning
- Geolocation validation (ensures employees are at the office)
- WebAuthn biometric authentication (fingerprint/Face ID)
- Admin dashboard with analytics
- Employee management
- Advanced reporting capabilities

---

## Quick Start

### Step 1: Set Up Database Schema

The database schema SQL file has been created at:
```
/workspaces/default/code/supabase/migrations/001_initial_schema.sql
```

**To run the migration:**

1. Go to your Supabase SQL Editor:
   https://supabase.com/dashboard/project/echrtzjueziyzlnsnogn/sql/new

2. Copy the entire contents of `001_initial_schema.sql`

3. Paste it into the SQL Editor and click "Run"

4. Verify the tables were created by running:
   ```sql
   SELECT tablename FROM pg_tables 
   WHERE schemaname = 'public'
   AND tablename IN ('employees', 'webauthn_credentials', 'attendance_logs', 
                      'system_settings', 'admin_users', 'audit_logs');
   ```

### Step 2: Deploy Edge Functions

The Edge Functions code has been updated in:
```
/workspaces/default/code/supabase/functions/server/index.tsx
```

**To deploy:**

1. Go to the **Make settings page** in your Figma Make interface
2. Click **"Deploy Supabase Edge Function"**
3. Wait for deployment to complete

This will deploy all backend endpoints including:
- QR code generation and verification
- Attendance logging
- Employee management
- WebAuthn credential management

### Step 3: Create Admin User

You need to create an admin account to access the admin panel.

**Option A: Using Supabase Dashboard**

1. Go to Supabase Authentication:
   https://supabase.com/dashboard/project/echrtzjueziyzlnsnogn/auth/users

2. Click "Add User" → "Create new user"

3. Set email and password (e.g., `mansursaidu007@gmail.com` / admin001)

4. After creating the auth user, go to SQL Editor and run:
   ```sql
   INSERT INTO admin_users (email, full_name, role)
   VALUES ('mansursaidu007@gmail.com', 'Admin User', 'super_admin');
   ```

**Option B: Using Demo Data**

The migration already created a demo admin (`admin@example.com`), but you need to:

1. Create the auth user in Supabase Auth with email `admin@example.com`
2. Set a password for this user

### Step 4: Configure Office Location

After logging into the admin panel:

1. Go to **Settings** page
2. Click **"Use My Current Location"** to auto-fill your coordinates
3. Or manually enter office latitude and longitude
4. Set acceptable radius (default: 100 meters)
5. Click **"Save Location Settings"**

### Step 5: Add Employees

1. Go to **Employees** page
2. Click **"Add Employee"**
3. Fill in employee details
4. Click **"Create"**

### Step 6: Register Biometric Credentials

For each employee to use biometric authentication:

1. In the Employees table, click the **Fingerprint icon** next to the employee
2. The employee must use their own device to register their biometric
3. Follow the browser prompts to register fingerprint/Face ID
4. Credential is now stored and ready for check-ins

---

## How to Use

### For Employees (Check-In Flow)

1. **Scan the QR code** mounted at the office entrance using your phone's camera
2. The QR code will open a URL in your browser with a secure token
3. Allow location permissions when prompted
4. System validates you're within the office radius
5. Select your name from the employee list
6. Authenticate with your biometric (fingerprint/Face ID)
7. Success! Your check-in is logged

**Important Notes:**
- You MUST scan the physical QR code - direct URL access will be rejected
- The QR code is static and doesn't need to be refreshed
- Each scan opens a secure URL that verifies you scanned the official QR code

**Check-in Status:**
- **On Time**: Check-in before work start time + grace period
- **Late**: Check-in after grace period expires

### For Admins

**Login:**
```
URL: https://your-app-url.com/admin/login
Email: admin@example.com
Password: (the password you set in Supabase Auth)
```

**Dashboard:**
- View total employees
- See today's check-ins (on-time vs late)
- Monitor this week's attendance
- Track attendance rate
- View recent check-ins in real-time

**Employees Page:**
- Add/Edit/Delete employees
- Register biometric credentials
- View employee status

**Settings Page:**
- Manage universal QR code
- Configure office location
- Set work hours and grace period
- View system information

---

## Technical Architecture

### Database Tables

1. **employees** - Employee profiles
2. **webauthn_credentials** - Biometric credentials (fingerprint/Face ID)
3. **attendance_logs** - All check-in records
4. **system_settings** - Global configuration
5. **admin_users** - Admin access control
6. **audit_logs** - System change tracking

### Edge Functions (Backend API)

All endpoints are prefixed with `/make-server-7456b3bc/`:

- `generate-qr-url` - Generate static QR code URL with secure token
- `verify-qr-token` - Validate QR token from URL parameters
- `create-webauthn-challenge` - Create authentication challenge
- `store-webauthn-credential` - Store biometric credential
- `log-attendance` - Log employee check-in (with validation)
- `get-attendance-logs` - Retrieve attendance records
- `manage-employees` - CRUD operations for employees

### QR Code System

The QR code is a URL that contains:
- `qr_token`: HMAC-SHA256 signature of "qr_check_in:version" using secret key
- `v`: Version number (allows invalidation by incrementing)

Example: `https://app.usetymly.com/?qr_token=abc123...&v=1`

When scanned:
1. Employee's phone camera opens the URL
2. Browser navigates to check-in page with token in URL
3. Frontend extracts token and version from URL parameters
4. Backend verifies HMAC signature matches current version
5. If valid, allows check-in flow to proceed
6. If invalid or missing token, shows "QR Code Required" message

This prevents direct URL access while allowing a static, printable QR code.

### Security Features

- **Row Level Security (RLS)**: Database-level access control
- **WebAuthn**: Industry-standard biometric authentication
- **HMAC Signatures**: QR code tampering prevention
- **Geolocation Validation**: Server-side distance calculation
- **HTTPS Required**: For WebAuthn and Geolocation APIs

---

## Features

### Employee Check-In
- QR code URL-based access (scan physical QR code to get secure token)
- Direct URL access prevention (must scan QR code)
- Geolocation validation (Haversine distance calculation)
- WebAuthn biometric authentication
- Late check-in detection
- Duplicate check-in prevention (one per day)
- Success confirmation screen

### Admin Dashboard
- Real-time statistics
- Recent check-ins table
- Employee management (CRUD)
- Biometric credential registration
- Office location configuration
- QR code management
- Work hours settings

### Planned Features (Not Yet Implemented)
- Advanced reporting (CSV/PDF/Excel exports)
- Analytics charts (Recharts visualizations)
- Reports page with date range filters
- Employee attendance history
- Email notifications for late check-ins
- Multi-location support

---

## Configuration

### System Settings

**Office Location:**
- Default: San Francisco (37.7749, -122.4194)
- Configurable via Settings page

**Work Hours:**
- Default start time: 9:00 AM
- Default grace period: 15 minutes
- Employees checking in within 9:15 AM = On Time
- Employees checking in after 9:15 AM = Late

**QR Code:**
- Static URL that can be printed and mounted permanently
- Contains secure HMAC token to verify legitimate scans
- Version-based invalidation (increment version to invalidate old QR codes)
- Download as PNG from Settings page
- Only regenerate if QR code is compromised

---

## Security Notes

**IMPORTANT:**
- Make is not intended for collecting PII or securing highly sensitive data
- For production use with real employee data, deploy to a dedicated environment
- This is a prototype/demo system

**Security Best Practices:**
- Always use HTTPS in production (required for WebAuthn and Geolocation)
- Regularly rotate QR codes if compromised
- Review audit logs for suspicious activity
- Keep Supabase service role key secret (never expose to frontend)
- Enable database backups in Supabase

---

## Troubleshooting

### "Failed to verify QR code"
- Edge Function may not be deployed yet
- Run deployment from Make settings page

### "Location permission denied"
- User must enable location in browser settings
- Chrome: Settings → Privacy → Location
- Safari: Settings → Privacy → Location Services

### "Biometric authentication not supported"
- Requires HTTPS connection
- Requires compatible device (iPhone with Face ID/Touch ID, Android with fingerprint, etc.)
- Check browser support: Chrome 67+, Safari 13+, Edge 18+

### "Failed to log attendance"
- Employee may have already checked in today
- Location may be out of range
- Check browser console for detailed errors

### Admin can't login
- Ensure admin user exists in both:
  1. Supabase Auth (email + password)
  2. admin_users table (email + role)

---

## Next Steps

To extend this system, consider adding:

1. **Camera QR Scanning**: Integrate `@zxing/browser` camera scanning
2. **Advanced Reports**: Implement CSV/PDF/Excel export functions
3. **Analytics Dashboard**: Add Recharts visualizations
4. **Email Notifications**: Notify admins of late check-ins
5. **Mobile App**: Build native iOS/Android apps
6. **Multiple Locations**: Support multi-office deployments
7. **Shift Management**: Handle different work schedules
8. **Time-Off Integration**: Track PTO and absences

---

## Support

For issues or questions:
- Review the plan file: `/workspaces/default/code/plans/you-are-tasked-with-mellow-quokka.md`
- Check Supabase logs for backend errors
- Review browser console for frontend errors

---

## License

This project is created for demonstration purposes as part of Figma Make.
