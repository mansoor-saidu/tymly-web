<wizard-report>
# PostHog post-wizard report

The wizard has completed a deep integration of PostHog analytics into the Tymly employee attendance tracking system. PostHog was already partially initialized — the wizard upgraded the initialization with `defaults: '2026-01-30'`, wrapped the app with `PostHogErrorBoundary` for automatic React error capture, and instrumented 14 business events across 7 files covering the full user lifecycle: admin login, employee check-ins/check-outs, leave management, onboarding, shift management, and QR code operations. User identification (`posthog.identify`) was already in place in `AuthContext.tsx` for both the session-restore and OAuth callback paths; the wizard added `user_logged_in` capture alongside it.

| Event Name | Description | File |
|---|---|---|
| `user_logged_in` | Fired when an admin user successfully signs in via Google OAuth | `src/app/context/AuthContext.tsx` |
| `employee_checked_in` | Fired when an employee completes a successful biometric check-in | `src/app/pages/employee/CheckInPage.tsx` |
| `employee_checked_out` | Fired when an employee completes a successful biometric check-out | `src/app/pages/employee/CheckInPage.tsx` |
| `leave_request_submitted` | Fired when an employee submits a leave request from the check-in portal | `src/app/pages/employee/CheckInPage.tsx` |
| `employee_created` | Fired when an admin creates a new employee profile | `src/app/pages/admin/EmployeesPage.tsx` |
| `employee_updated` | Fired when an admin updates an existing employee's information | `src/app/pages/admin/EmployeesPage.tsx` |
| `employee_deleted` | Fired when an admin deletes an employee from the system | `src/app/pages/admin/EmployeesPage.tsx` |
| `leave_request_status_updated` | Fired when an admin approves or rejects a pending leave request | `src/app/pages/admin/LeaveRequestsPage.tsx` |
| `onboarding_profile_completed` | Fired when a new admin completes the business profile step during onboarding | `src/app/pages/admin/OnboardingPage.tsx` |
| `onboarding_location_set` | Fired when an admin saves their office geofence location during onboarding | `src/app/pages/admin/OnboardingPage.tsx` |
| `onboarding_location_skipped` | Fired when an admin skips the office location setup step during onboarding | `src/app/pages/admin/OnboardingPage.tsx` |
| `qr_code_regenerated` | Fired when an admin regenerates the office check-in QR code | `src/app/pages/admin/SettingsPage.tsx` |
| `shift_created` | Fired when an admin creates a new work shift schedule | `src/app/pages/admin/ShiftsPage.tsx` |
| `shift_deleted` | Fired when an admin deletes a work shift schedule | `src/app/pages/admin/ShiftsPage.tsx` |

## Next steps

We've built some insights and a dashboard for you to keep an eye on user behavior, based on the events we just instrumented:

- [Analytics basics (wizard) Dashboard](https://us.posthog.com/project/498702/dashboard/1801517)
- [Daily Check-ins & Check-outs](https://us.posthog.com/project/498702/insights/JOS4OxFf)
- [Late Check-ins Count](https://us.posthog.com/project/498702/insights/CBey4jM2)
- [Leave Requests by Type](https://us.posthog.com/project/498702/insights/4RSk55eW)
- [Onboarding Completion Rate](https://us.posthog.com/project/498702/insights/ejYwmeEC)
- [Employee Management Activity](https://us.posthog.com/project/498702/insights/cqKpFtk6)

## Verify before merging

- [ ] Run a full production build (the wizard only verified the files it touched) and fix any lint or type errors introduced by the generated code.
- [ ] Run the test suite — call sites that were rewritten or instrumented may need updated mocks or fixtures.
- [ ] Add `VITE_POSTHOG_KEY` and `VITE_POSTHOG_HOST` to `.env.example` and any monorepo/bootstrap scripts so collaborators know what to set.
- [ ] Wire source-map upload (`posthog-cli sourcemap` or your bundler's upload step) into CI so production stack traces de-minify.
- [ ] Confirm the returning-visitor path also calls `identify` — the `checkSession` path in `AuthContext.tsx` already does this on page refresh, but verify it fires correctly after the OAuth redirect completes before marking as done.

### Agent skill

We've left an agent skill folder in your project. You can use this context for further agent development when using Claude Code. This will help ensure the model provides the most up-to-date approaches for integrating PostHog.

</wizard-report>
