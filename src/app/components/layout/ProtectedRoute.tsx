import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Loader } from '../ui/loader';

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader text="Loading..." />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Super admins should never see the regular admin panel
  if (user.role === 'super_admin') {
    return <Navigate to="/super-admin" replace />;
  }

  if (!user.business_name) {
    return <Navigate to="/onboarding" replace />;
  }

  if (user.company_status === 'suspended') {
    return (
      <div className="min-h-screen bg-[#fffaef] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-xl shadow-lg border border-red-100 p-8 text-center space-y-6">
          <div className="w-16 h-16 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto">
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-[#030213]" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
              Account Suspended
            </h1>
            <p className="text-gray-600 text-sm">
              Your business account has been temporarily suspended by an administrator. Please contact support to resolve this issue.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

