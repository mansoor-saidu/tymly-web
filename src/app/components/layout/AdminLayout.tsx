import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../ui/button';
import { ThemeToggle } from '../ThemeToggle';
import {
  LayoutDashboard,
  Users,
  Settings,
  LogOut,
  QrCode,
  FileSpreadsheet,
  CalendarCheck,
  Clock,
  Menu,
  ShieldAlert,
  LifeBuoy
} from 'lucide-react';
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from '../ui/sheet';
import lightLogo from '../../../Light-logo.png';
import darkLogo from '../../../Dark-logo.png';

export default function AdminLayout() {
  const { user, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const navItems = [
    { path: '/admin', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/admin/employees', label: 'Employees', icon: Users },
    { path: '/admin/shifts', label: 'Shifts', icon: Clock },
    { path: '/admin/leave-requests', label: 'Leave', icon: CalendarCheck },
    { path: '/admin/reports', label: 'Reports', icon: FileSpreadsheet },
    { path: '/admin/settings', label: 'Settings', icon: Settings },
    { path: '/admin/support', label: 'Support', icon: LifeBuoy },
  ];

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Desktop Sidebar */}
      <aside className="w-64 bg-card border-r hidden md:flex flex-col">
        <div className="p-6 border-b">
          <div className="flex items-center gap-2">
            <img src={lightLogo} alt="tymly" className="h-8 dark:hidden" />
            <img src={darkLogo} alt="tymly" className="h-8 hidden dark:block" />
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;

            return (
              <Link key={item.path} to={item.path}>
                <Button
                  variant={isActive ? 'default' : 'ghost'}
                  className="w-full justify-start"
                >
                  <Icon className="mr-2 h-4 w-4" />
                  {item.label}
                </Button>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t space-y-2">
          {user?.role === 'super_admin' && (
            <Button variant="outline" className="w-full justify-start text-red-600 border-red-200 bg-red-50 hover:bg-red-100 hover:text-red-700 mb-2" asChild>
              <Link to="/super-admin">
                <ShieldAlert className="w-4 h-4 mr-2" />
                Super Admin Panel
              </Link>
            </Button>
          )}
          <Link to="/admin/profile" className="block px-3 py-2 flex items-center gap-3 hover:bg-muted/50 rounded-md transition-colors cursor-pointer mb-2">
            {user?.profile_picture_url ? (
              <img src={user.profile_picture_url} alt="Profile" className="w-10 h-10 rounded-full object-cover border border-muted" />
            ) : (
              <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-semibold border border-primary/20 flex-shrink-0">
                {user?.full_name?.charAt(0) || 'A'}
              </div>
            )}
            <div className="overflow-hidden">
              <p className="text-sm font-medium truncate">{user?.full_name}</p>
              <p className="text-xs text-muted-foreground truncate">{user?.business_name || user?.email}</p>
            </div>
          </Link>
          <div className="px-3 py-1 flex justify-end">
            <ThemeToggle />
          </div>
          <Button
            variant="ghost"
            className="w-full justify-start text-destructive hover:text-destructive"
            onClick={handleSignOut}
          >
            <LogOut className="mr-2 h-4 w-4" />
            Sign Out
          </Button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto flex flex-col">
        {/* Mobile Header */}
        <header className="md:hidden border-b p-4 flex items-center justify-between bg-card">
          <div className="flex items-center gap-2">
            <img src={lightLogo} alt="tymly" className="h-6 dark:hidden" />
            <img src={darkLogo} alt="tymly" className="h-6 hidden dark:block" />
          </div>
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon">
                <Menu className="h-6 w-6" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0 flex flex-col">
              <SheetTitle className="sr-only">Navigation Menu</SheetTitle>
              <div className="p-6 border-b">
                <div className="flex items-center gap-2">
                  <img src={lightLogo} alt="tymly" className="h-8 dark:hidden" />
                  <img src={darkLogo} alt="tymly" className="h-8 hidden dark:block" />
                </div>
              </div>
              <nav className="flex-1 p-4 space-y-2">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = location.pathname === item.path;

                  return (
                    <Link key={item.path} to={item.path}>
                      <Button
                        variant={isActive ? 'default' : 'ghost'}
                        className="w-full justify-start mb-2"
                      >
                        <Icon className="mr-2 h-4 w-4" />
                        {item.label}
                      </Button>
                    </Link>
                  );
                })}
              </nav>
              <div className="p-4 border-t space-y-2">
                {user?.role === 'super_admin' && (
                  <Button variant="outline" className="w-full justify-start text-red-600 border-red-200 bg-red-50 hover:bg-red-100 hover:text-red-700 mb-2" asChild>
                    <Link to="/super-admin">
                      <ShieldAlert className="w-4 h-4 mr-2" />
                      Super Admin Panel
                    </Link>
                  </Button>
                )}
                <Link to="/admin/profile" className="block px-3 py-2 flex items-center gap-3 hover:bg-muted/50 rounded-md transition-colors cursor-pointer mb-2">
                  {user?.profile_picture_url ? (
                    <img src={user.profile_picture_url} alt="Profile" className="w-10 h-10 rounded-full object-cover border border-muted" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-semibold border border-primary/20 flex-shrink-0">
                      {user?.full_name?.charAt(0) || 'A'}
                    </div>
                  )}
                  <div className="overflow-hidden">
                    <p className="text-sm font-medium truncate">{user?.full_name}</p>
                    <p className="text-xs text-muted-foreground truncate">{user?.business_name || user?.email}</p>
                  </div>
                </Link>
                <div className="px-3 py-1 flex justify-end">
                  <ThemeToggle />
                </div>
                <Button
                  variant="ghost"
                  className="w-full justify-start text-destructive hover:text-destructive"
                  onClick={handleSignOut}
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign Out
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </header>

        <div className="flex-1 overflow-auto p-4 md:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
