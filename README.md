# tymly — Employee Attendance Tracking System

> ⚠️ **This is a demo project.** It is intended for demonstration and evaluation purposes only. Do not use in production without thorough security review and testing.

---

## Overview

**tymly** is a modern, full-stack HR attendance tracking system built with React, Supabase, and Deno Edge Functions. It allows organisations to manage employee check-ins via QR codes, biometric authentication (WebAuthn), and GPS location verification.

## Features

- 📱 **QR Code Check-in** — Employees scan a rotating QR code at the office entrance
- 🔐 **Biometric Authentication** — WebAuthn (fingerprint/Face ID) for secure identity verification
- 📍 **GPS Location Validation** — Check-ins only accepted within a configurable office radius
- 🕐 **Shift Management** — Define multiple work shifts with custom start times and grace periods
- 🌿 **Leave Management** — Employee leave request submission and admin approval workflow
- 📊 **Reports & Analytics** — Attendance trends, late arrivals, and CSV/Excel exports
- 🌙 **Dark Mode** — Full light/dark theme toggle with persistent preference

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS |
| UI Components | shadcn/ui, Recharts |
| Backend | Supabase (Postgres + Auth + RLS) |
| Edge Functions | Deno / Hono |
| Maps | Google Maps API |
| Auth | Supabase Auth + WebAuthn |

## Getting Started

```

### 2. Set up environment variables
```bash
cp .env.example .env
```
Fill in your Supabase project URL, anon key, and Google Maps API key.

**Domain Configuration:** Ensure that your production domain (e.g., `https://app.usetymly.com`) is added to your Supabase project's **Authentication -> URL Configuration** as the Site URL and within the Redirect URLs. This is required for OAuth logins and WebAuthn to function correctly.

### 3. Run database migrations
In your Supabase SQL Editor, run these files **in order**:
1. `supabase/migrations/001_initial_schema.sql`
2. `supabase/migrations/002_leave_management.sql`
3. `supabase/migrations/003_shift_management.sql`

### 4. Deploy Edge Functions
```bash
supabase functions deploy server
```

### 5. Start the dev server
```bash
npm run dev
```

## Demo Notes

- The app ships with **placeholder/mock data** in several UI components.
- Biometric registration requires a device with a platform authenticator (Touch ID, Windows Hello, etc.)
- The Google Maps API key bundled in this repo is a **demo key** with usage limits.
- All Supabase Row Level Security (RLS) policies are configured for admin-only access patterns.

## Project Structure

```
src/
  app/
    components/   # Shared UI components
    pages/
      admin/      # Admin dashboard pages (Dashboard, Employees, Shifts, Leave, Reports, Settings)
      employee/   # Employee-facing check-in kiosk
    context/      # Auth context
    lib/          # Supabase client, geolocation, WebAuthn helpers
    types/        # TypeScript interfaces
supabase/
  functions/server/   # Hono-based Edge Function
  migrations/         # SQL migration files
```

## License

MIT — For demo purposes only.