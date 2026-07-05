import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Loader } from '../../components/ui/loader';
import { Alert, AlertDescription } from '../../components/ui/alert';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { QrCode, MapPin, Fingerprint, CheckCircle2, AlertCircle, ScanLine, CalendarCheck, Camera } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../lib/supabase';
import { getCurrentPosition, calculateDistance, formatDistance } from '../../lib/geolocation';
import { authenticateWebAuthn, isWebAuthnSupported } from '../../lib/webauthn';
import { extractQRToken, verifyQRToken } from '../../lib/qrcode';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { point, polygon } from '@turf/helpers';
import { ThemeToggle } from '../../components/ThemeToggle';
import QRScanner from '../../components/QRScanner';
import lightLogo from '../../../Light-logo.png';
import darkLogo from '../../../Dark-logo.png';
import type { Employee } from '../../types/database';
import type { GeolocationPosition } from '../../types/api';
import { posthog } from '../../lib/posthog';

type Step = 'start' | 'no-token' | 'verifying-token' | 'location' | 'employee-select' | 'webauthn' | 'success';

export default function CheckInPage() {
  const [step, setStep] = useState<Step>('start');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [qrVerified, setQrVerified] = useState(false);
  const [position, setPosition] = useState<GeolocationPosition | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [checkInData, setCheckInData] = useState<any>(null);
  const [showScanner, setShowScanner] = useState(false);
  const [companyId, setCompanyId] = useState<string | null>(null);

  // Leave Request State
  const [isLeaveDialogOpen, setIsLeaveDialogOpen] = useState(false);
  const [leaveForm, setLeaveForm] = useState({
    employeeId: '',
    leaveType: 'vacation',
    startDate: '',
    endDate: '',
    reason: '',
  });

  // Handle Leave Request Submission
  const handleLeaveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      // First verify the employee exists by employee_id
      const { data: emp, error: empError } = await supabase
        .from('employees')
        .select('id')
        .eq('employee_id', leaveForm.employeeId)
        .single();

      if (empError || !emp) throw new Error('Invalid Employee ID');

      // Submit via Edge Function
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-leave-requests`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          action: 'create',
          employeeId: emp.id,
          data: leaveForm,
        }),
      });

      const result = await res.json();
      if (!result.success) throw new Error(result.message);

      posthog.capture('leave_request_submitted', {
        leave_type: leaveForm.leaveType,
      });
      toast.success('Leave request submitted successfully!');
      setIsLeaveDialogOpen(false);
      setLeaveForm({ employeeId: '', leaveType: 'vacation', startDate: '', endDate: '', reason: '' });
    } catch (err: any) {
      toast.error(err.message || 'Failed to submit leave request');
    } finally {
      setLoading(false);
    }
  };

  // Check for QR token on page load
  useEffect(() => {
    const checkQRToken = async () => {
      const { token, version, companyId: cId, hasToken } = extractQRToken();

      if (!hasToken) {
        // No QR token in URL - user visited directly
        setStep('no-token');
        return;
      }

      if (!token || !version || !cId) {
        setError('Invalid QR code parameters');
        setStep('no-token');
        return;
      }

      setCompanyId(cId);

      // Verify the token
      setStep('verifying-token');
      const result = await verifyQRToken(token, version, cId);

      if (result.valid) {
        setQrVerified(true);
        setStep('location');
        toast.success('QR code verified! Please allow location access.');
      } else {
        setError(result.message || 'Invalid QR code');
        setStep('no-token');
        toast.error(result.message || 'Invalid QR code');
      }
    };

    checkQRToken();
  }, []);

  const handleScan = async (resultUrl: string) => {
    try {
      const url = new URL(resultUrl);
      const token = url.searchParams.get('qr_token');
      const version = url.searchParams.get('v');
      const cId = url.searchParams.get('c');

      if (!token || !version || !cId) {
        toast.error('Invalid QR code format. Not an office QR code.');
        return;
      }

      setCompanyId(cId);
      setShowScanner(false);
      setStep('verifying-token');

      const result = await verifyQRToken(token, version, cId);
      if (result.valid) {
        setQrVerified(true);
        setStep('location');
        toast.success('QR code verified! Please allow location access.');
      } else {
        setError(result.message || 'Invalid or expired QR code');
        setStep('no-token');
        toast.error(result.message || 'Invalid or expired QR code');
      }
    } catch (err) {
      toast.error('Could not parse scanned QR code');
    }
  };

  // Check geolocation
  const handleLocationCheck = async () => {
    setLoading(true);
    setError('');

    try {
      // Get current position
      const pos = await getCurrentPosition();
      setPosition(pos);

      // Fetch office settings
      const { data: settings, error: settingsError } = await supabase
        .from('system_settings')
        .select('office_polygon')
        .eq('company_id', companyId)
        .single();

      if (settingsError || !settings) {
        throw new Error('Failed to fetch office settings');
      }

      // Check if inside polygon
      let isInside = false;
      try {
        if (settings.office_polygon && Array.isArray(settings.office_polygon)) {
          const pt = point([pos.longitude, pos.latitude]);
          const poly = polygon([settings.office_polygon]);
          isInside = booleanPointInPolygon(pt, poly);
        }
      } catch (e) {
        console.error('Turf validation error:', e);
      }

      if (!isInside) {
        throw new Error(
          `You are not within the acceptable office boundaries. Please move closer and try again.`
        );
      }

      toast.success(`Location verified! You are inside the office boundary.`);

      // Fetch active employees
      const { data: emps, error: empsError } = await supabase
        .from('employees')
        .select('*')
        .eq('company_id', companyId)
        .eq('status', 'active')
        .order('full_name');

      if (empsError) {
        throw new Error('Failed to fetch employees');
      }

      setEmployees(emps || []);

      // Check for saved employee (Remember Me)
      const savedStr = localStorage.getItem('tymly_saved_employee');
      if (savedStr) {
        try {
          const savedEmp = JSON.parse(savedStr);
          const found = (emps || []).find(e => e.id === savedEmp.id);
          if (found) {
            setSelectedEmployee(found);
            setStep('webauthn');
            return;
          }
        } catch (e) {
          // Ignore invalid JSON
        }
      }

      setStep('employee-select');
    } catch (err: any) {
      setError(err.message || 'Location check failed');
      toast.error(err.message || 'Location check failed');
    } finally {
      setLoading(false);
    }
  };

  // Select employee and proceed to WebAuthn
  const handleEmployeeSelect = (employee: Employee) => {
    setSelectedEmployee(employee);
    setStep('webauthn');
  };

  // WebAuthn authentication
  const handleWebAuthn = async () => {
    if (!selectedEmployee || !position) return;

    setLoading(true);
    setError('');

    try {
      if (!isWebAuthnSupported()) {
        throw new Error('Biometric authentication is not supported on this device');
      }

      toast.info('Please authenticate with your biometric (fingerprint/Face ID)...');

      const result = await authenticateWebAuthn(selectedEmployee.id, position);

      if (!result.success) {
        throw new Error(result.error || 'Authentication failed');
      }

      setCheckInData(result.data);

      const isCheckOut = result.data?.action === 'check-out';
      posthog.capture(isCheckOut ? 'employee_checked_out' : 'employee_checked_in', {
        department: selectedEmployee.department,
        is_late: isCheckOut ? undefined : result.data?.isLate,
        hours_worked: isCheckOut ? result.data?.hoursWorked : undefined,
      });

      // Save to localStorage for Remember Me
      localStorage.setItem('tymly_saved_employee', JSON.stringify({
        id: selectedEmployee.id,
        full_name: selectedEmployee.full_name,
        employee_id: selectedEmployee.employee_id
      }));

      setStep('success');
      toast.success('Check-in successful!');
    } catch (err: any) {
      setError(err.message || 'Biometric authentication failed');
      toast.error(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  // Reset to start
  const handleReset = () => {
    setStep('start');
    setError('');
    setQrVerified(false);
    setPosition(null);
    setSelectedEmployee(null);
    setCheckInData(null);
    // Do not reset companyId, keep it so user can retry
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted dark:from-background dark:to-muted flex items-center justify-center p-4 relative">
      <div className="absolute top-4 left-4">
        <img src={lightLogo} alt="tymly" className="h-8 dark:hidden" />
        <img src={darkLogo} alt="tymly" className="h-8 hidden dark:block" />
      </div>
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-md z-10">
        
        {showScanner && (
          <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="w-full max-w-md relative animate-in fade-in zoom-in duration-200">
              <QRScanner 
                onScan={handleScan} 
                onClose={() => setShowScanner(false)} 
              />
            </div>
          </div>
        )}

        {/* No QR token - need to scan */}
        {step === 'no-token' && (
          <Card>
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 h-16 w-16 bg-orange-500 rounded-full flex items-center justify-center">
                <ScanLine className="h-8 w-8 text-white" />
              </div>
              <CardTitle className="text-2xl">QR Code Required</CardTitle>
              <CardDescription>
                Please scan the office QR code to check in
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <Button 
                onClick={() => setShowScanner(true)} 
                className="w-full h-12 text-lg font-medium"
              >
                <Camera className="mr-2 h-5 w-5" />
                Scan QR Code with Camera
              </Button>

              <Alert>
                <QrCode className="h-4 w-4" />
                <AlertDescription>
                  You must scan the mounted QR code at the office entrance to check in.
                  Direct URL access is not allowed for security.
                </AlertDescription>
              </Alert>

              <div className="text-center text-sm text-muted-foreground p-4 bg-muted rounded-lg">
                <p className="font-medium mb-2">Where to find the QR code:</p>
                <p>Look for the printed QR code at the office entrance or main check-in area.</p>
              </div>
            </CardContent>
            <CardFooter>
              <Button 
                variant="outline" 
                className="w-full" 
                onClick={() => setIsLeaveDialogOpen(true)}
              >
                <CalendarCheck className="mr-2 h-4 w-4" />
                Request Time Off
              </Button>
            </CardFooter>
          </Card>
        )}

        {/* Verifying token */}
        {step === 'verifying-token' && (
          <Card>
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 h-16 w-16 bg-primary rounded-full flex items-center justify-center">
                <QrCode className="h-8 w-8 text-primary-foreground animate-pulse" />
              </div>
              <CardTitle className="text-2xl">Verifying QR Code</CardTitle>
              <CardDescription>
                Please wait while we verify your QR code
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Location check */}
        {step === 'location' && (
          <Card>
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 h-16 w-16 bg-green-500 rounded-full flex items-center justify-center">
                <MapPin className="h-8 w-8 text-white" />
              </div>
              <CardTitle className="text-2xl">Location Check</CardTitle>
              <CardDescription>
                We need to verify you're at the office location
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <Button onClick={handleLocationCheck} className="w-full" size="lg" disabled={loading}>
                {loading ? <Loader inline text="Checking location..." videoClassName="w-6 h-6" /> : 'Verify Location'}
              </Button>

              <Button onClick={handleReset} variant="outline" className="w-full">
                Cancel
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Employee selection */}
        {step === 'employee-select' && (
          <Card>
            <CardHeader className="text-center">
              <CardTitle className="text-2xl">Select Your Profile</CardTitle>
              <CardDescription>Choose your name from the list below</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="max-h-96 overflow-y-auto space-y-2">
                {employees.map((employee) => (
                  <Button
                    key={employee.id}
                    variant="outline"
                    className="w-full justify-start text-left h-auto py-3"
                    onClick={() => handleEmployeeSelect(employee)}
                  >
                    <div>
                      <p className="font-medium">{employee.full_name}</p>
                      <p className="text-sm text-muted-foreground">
                        {employee.employee_id} • {employee.department}
                      </p>
                    </div>
                  </Button>
                ))}
              </div>

              <Button onClick={handleReset} variant="outline" className="w-full mt-4">
                Cancel
              </Button>
            </CardContent>
          </Card>
        )}

        {/* WebAuthn authentication */}
        {step === 'webauthn' && (
          <Card>
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 h-16 w-16 bg-purple-500 rounded-full flex items-center justify-center">
                <Fingerprint className="h-8 w-8 text-white" />
              </div>
              <CardTitle className="text-2xl">Biometric Authentication</CardTitle>
              <CardDescription>
                Verify your identity with fingerprint or Face ID
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {selectedEmployee && (
                <div className="text-center p-4 bg-muted rounded-lg">
                  <p className="font-medium">{selectedEmployee.full_name}</p>
                  <p className="text-sm text-muted-foreground">{selectedEmployee.employee_id}</p>
                </div>
              )}

              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <Button onClick={handleWebAuthn} className="w-full" size="lg" disabled={loading}>
                {loading ? <Loader inline text="Authenticating..." videoClassName="w-6 h-6" /> : 'Authenticate'}
              </Button>

              <Button 
                onClick={() => {
                  localStorage.removeItem('tymly_saved_employee');
                  setSelectedEmployee(null);
                  setStep('employee-select');
                }} 
                variant="outline" 
                className="w-full"
              >
                Not {selectedEmployee?.full_name?.split(' ')[0]}? Switch Profile
              </Button>

              <Button onClick={handleReset} variant="ghost" className="w-full">
                Cancel
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Success screen */}
        {step === 'success' && (
          <Card>
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 h-16 w-16 bg-green-500 rounded-full flex items-center justify-center">
                <CheckCircle2 className="h-8 w-8 text-white" />
              </div>
              <CardTitle className="text-2xl text-green-600 dark:text-green-400">
                {checkInData?.action === 'check-out' ? 'Check-Out Successful!' : 'Check-In Successful!'}
              </CardTitle>
              <CardDescription>
                {checkInData?.action === 'check-out' ? 'You have been successfully checked out' : "You've been successfully checked in"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {selectedEmployee && (
                <div className="space-y-3">
                  <div className="text-center p-4 bg-muted rounded-lg">
                    <p className="font-semibold text-lg">{selectedEmployee.full_name}</p>
                    <p className="text-sm text-muted-foreground">{selectedEmployee.employee_id}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="p-3 bg-muted rounded-lg">
                      <p className="text-muted-foreground">Time</p>
                      <p className="font-medium">
                        {checkInData?.action === 'check-out' && checkInData?.checkOutTime
                          ? new Date(checkInData.checkOutTime).toLocaleTimeString()
                          : checkInData?.checkInTime
                          ? new Date(checkInData.checkInTime).toLocaleTimeString()
                          : 'Now'}
                      </p>
                    </div>

                    <div className="p-3 bg-muted rounded-lg">
                      <p className="text-muted-foreground">
                        {checkInData?.action === 'check-out' ? 'Hours Worked' : 'Status'}
                      </p>
                      <p className="font-medium">
                        {checkInData?.action === 'check-out' ? (
                          <span>{checkInData?.hoursWorked} hrs</span>
                        ) : checkInData?.isLate ? (
                          <span className="text-orange-600">Late</span>
                        ) : (
                          <span className="text-green-600">On Time</span>
                        )}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <Button onClick={handleReset} className="w-full" size="lg">
                Done
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Leave Request Dialog */}
        <Dialog open={isLeaveDialogOpen} onOpenChange={setIsLeaveDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Request Time Off</DialogTitle>
              <DialogDescription>
                Submit a leave request. Your manager will review and approve it.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleLeaveSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="empId">Your Employee ID *</Label>
                <Input
                  id="empId"
                  required
                  placeholder="e.g. EMP001"
                  value={leaveForm.employeeId}
                  onChange={(e) => setLeaveForm({ ...leaveForm, employeeId: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="leaveType">Leave Type</Label>
                <Select
                  value={leaveForm.leaveType}
                  onValueChange={(val) => setLeaveForm({ ...leaveForm, leaveType: val })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="vacation">Vacation / Paid Time Off</SelectItem>
                    <SelectItem value="sick">Sick Leave</SelectItem>
                    <SelectItem value="personal">Personal Leave</SelectItem>
                    <SelectItem value="unpaid">Unpaid Leave</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="start_date">Start Date *</Label>
                  <Input
                    id="start_date"
                    type="date"
                    required
                    value={leaveForm.startDate}
                    onChange={(e) => setLeaveForm({ ...leaveForm, startDate: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="end_date">End Date *</Label>
                  <Input
                    id="end_date"
                    type="date"
                    required
                    value={leaveForm.endDate}
                    onChange={(e) => setLeaveForm({ ...leaveForm, endDate: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="reason">Reason (Optional)</Label>
                <Input
                  id="reason"
                  placeholder="Briefly describe the reason..."
                  value={leaveForm.reason}
                  onChange={(e) => setLeaveForm({ ...leaveForm, reason: e.target.value })}
                />
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsLeaveDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={loading}>
                  {loading ? <Loader inline text="Submitting..." videoClassName="w-5 h-5" /> : 'Submit Request'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
