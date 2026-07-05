import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PostHogProvider, PostHogErrorBoundary } from 'posthog-js/react';
import { posthog } from './lib/posthog';
import { AuthProvider } from './context/AuthContext';
import { Toaster } from './components/ui/sonner';

// Pages
import CheckInPage from './pages/employee/CheckInPage';
import DashboardPage from './pages/admin/DashboardPage';
import EmployeesPage from './pages/admin/EmployeesPage';
import SettingsPage from './pages/admin/SettingsPage';
import ReportsPage from './pages/admin/ReportsPage';
import LeaveRequestsPage from './pages/admin/LeaveRequestsPage';
import ShiftsPage from './pages/admin/ShiftsPage';
import LoginPage from './pages/admin/LoginPage';
import OnboardingPage from './pages/admin/OnboardingPage';
import ProfilePage from './pages/admin/ProfilePage';
import SupportPage from './pages/admin/SupportPage';

// Layout
import AdminLayout from './components/layout/AdminLayout';
import ProtectedRoute from './components/layout/ProtectedRoute';
import SuperAdminLayout from './components/layout/SuperAdminLayout';
import SuperAdminRoute from './components/layout/SuperAdminRoute';

// Super Admin Pages
import TenantsDashboardPage from './pages/super-admin/TenantsDashboardPage';
import GlobalSettingsPage from './pages/super-admin/GlobalSettingsPage';
import MarketingPage from './pages/super-admin/MarketingPage';

// Create React Query client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: true,
    },
  },
});

export default function App() {
  return (
    <PostHogProvider client={posthog}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <BrowserRouter>
            <PostHogErrorBoundary>
            <div className="min-h-screen bg-background">
              <Routes>
                {/* Employee check-in route */}
                <Route path="/check-in" element={<CheckInPage />} />

                {/* Redirect root to admin */}
                <Route path="/" element={<Navigate to="/admin" replace />} />

                {/* Login */}
                <Route path="/login" element={<LoginPage />} />

                {/* Onboarding */}
                <Route path="/onboarding" element={<OnboardingPage />} />

                {/* Protected admin routes */}
                <Route
                  path="/admin"
                  element={
                    <ProtectedRoute>
                      <AdminLayout />
                    </ProtectedRoute>
                  }
                >
                  <Route index element={<DashboardPage />} />
                  <Route path="employees" element={<EmployeesPage />} />
                  <Route path="leave-requests" element={<LeaveRequestsPage />} />
                  <Route path="shifts" element={<ShiftsPage />} />
                  <Route path="reports" element={<ReportsPage />} />
                  <Route path="settings" element={<SettingsPage />} />
                  <Route path="support" element={<SupportPage />} />
                  <Route path="profile" element={<ProfilePage />} />
                </Route>

                {/* Super Admin routes */}
                <Route path="/super-admin" element={<SuperAdminRoute><SuperAdminLayout /></SuperAdminRoute>}>
                  <Route index element={<TenantsDashboardPage />} />
                  <Route path="marketing" element={<MarketingPage />} />
                  <Route path="settings" element={<GlobalSettingsPage />} />
                </Route>

                {/* Catch all redirect */}
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </div>
            <Toaster />
            </PostHogErrorBoundary>
          </BrowserRouter>
        </AuthProvider>
      </QueryClientProvider>
    </PostHogProvider>
  );
}