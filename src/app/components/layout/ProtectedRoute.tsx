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

  return <>{children}</>;
}

