import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Loader } from '../../components/ui/loader';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '../../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Badge } from '../../components/ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '../../components/ui/alert-dialog';
import { Plus, Fingerprint, Trash2, Edit, CalendarDays } from 'lucide-react';
import { callEdgeFunction, supabase } from '../../lib/supabase';
import { registerWebAuthnCredential, isPlatformAuthenticatorAvailable } from '../../lib/webauthn';
import { toast } from 'sonner';
import type { Employee } from '../../types/database';
import { posthog } from '../../lib/posthog';

export default function EmployeesPage() {
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [formData, setFormData] = useState({
    email: '',
    fullName: '',
    employeeId: '',
    department: '',
    position: '',
    status: 'active' as 'active' | 'inactive' | 'suspended',
    shiftId: 'none',
  });
  
  const [historyEmployee, setHistoryEmployee] = useState<Employee | null>(null);
  const { data: employeeHistory, isLoading: historyLoading } = useQuery({
    queryKey: ['employee-history', historyEmployee?.id],
    queryFn: async () => {
      if (!historyEmployee?.id) return { logs: [] };
      const { data, error } = await supabase
        .from('attendance_logs')
        .select('*')
        .eq('employee_id', historyEmployee.id)
        .order('check_in_time', { ascending: false })
        .limit(50);
      if (error) throw error;
      return { logs: data };
    },
    enabled: !!historyEmployee?.id,
  });

  const { data: employees, isLoading } = useQuery({
    queryKey: ['employees'],
    queryFn: async () => {
      const { data, error } = await callEdgeFunction('manage-employees', {
        action: 'list',
      });

      if (error) throw error;
      return data.employees as Employee[];
    },
  });

  // Fetch shifts for assignment
  const { data: shifts } = useQuery({
    queryKey: ['shifts'],
    queryFn: async () => {
      const { data, error } = await callEdgeFunction('manage-shifts', { action: 'list' });
      if (error) throw error;
      return data.shifts;
    },
  });

  // Create/Update employee mutation
  const saveEmployeeMutation = useMutation({
    mutationFn: async (employee: typeof formData & { id?: string }) => {
      const { data, error } = await callEdgeFunction('manage-employees', {
        action: employee.id ? 'update' : 'create',
        employeeId: employee.id,
        data: {
          email: employee.email,
          fullName: employee.fullName,
          employeeId: employee.employeeId,
          department: employee.department,
          position: employee.position,
          status: employee.status,
          shift_id: employee.shiftId === 'none' ? null : employee.shiftId,
        },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (_, employee) => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      setIsDialogOpen(false);
      if (employee.id) {
        posthog.capture('employee_updated', { department: employee.department });
      } else {
        posthog.capture('employee_created', { department: employee.department, status: employee.status });
      }
      resetForm();
      toast.success(editingEmployee ? 'Employee updated' : 'Employee created');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to save employee');
    },
  });

  // Delete employee mutation
  const deleteEmployeeMutation = useMutation({
    mutationFn: async (employeeId: string) => {
      const { data, error } = await callEdgeFunction('manage-employees', {
        action: 'delete',
        employeeId,
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      posthog.capture('employee_deleted');
      toast.success('Employee deleted');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to delete employee');
    },
  });

  // WebAuthn registration mutation
  const registerWebAuthnMutation = useMutation({
    mutationFn: async (employee: Employee) => {
      const available = await isPlatformAuthenticatorAvailable();
      if (!available) {
        throw new Error('No biometric authenticator available on this device');
      }

      const result = await registerWebAuthnCredential(
        employee.id,
        employee.full_name,
        employee.email
      );

      if (!result.success) {
        throw new Error(result.error || 'Registration failed');
      }

      return result;
    },
    onSuccess: () => {
      toast.success('Biometric credential registered successfully');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to register biometric');
    },
  });

  const resetForm = () => {
    setFormData({
      email: '',
      fullName: '',
      employeeId: '',
      department: '',
      position: '',
      status: 'active',
      shiftId: 'none',
    });
    setEditingEmployee(null);
  };

  const handleEdit = (employee: Employee) => {
    setEditingEmployee(employee);
    setFormData({
      email: employee.email,
      fullName: employee.full_name,
      employeeId: employee.employee_id,
      department: employee.department || '',
      position: employee.position || '',
      status: employee.status,
      shiftId: employee.shift_id || 'none',
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveEmployeeMutation.mutate({
      ...formData,
      id: editingEmployee?.id,
    });
  };

  return (
    <div className="space-y-6 md:space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Employees</h1>
          <p className="text-muted-foreground mt-2">
            Manage employees and their biometric credentials
          </p>
        </div>

        <Dialog open={isDialogOpen} onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) resetForm();
        }}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add Employee
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingEmployee ? 'Edit Employee' : 'Add New Employee'}
              </DialogTitle>
              <DialogDescription>
                {editingEmployee
                  ? 'Update employee information'
                  : 'Enter employee details to create a new profile'}
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="fullName">Full Name *</Label>
                <Input
                  id="fullName"
                  value={formData.fullName}
                  onChange={(e) =>
                    setFormData({ ...formData, fullName: e.target.value })
                  }
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email *</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) =>
                    setFormData({ ...formData, email: e.target.value })
                  }
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="employeeId">Employee ID *</Label>
                <Input
                  id="employeeId"
                  value={formData.employeeId}
                  onChange={(e) =>
                    setFormData({ ...formData, employeeId: e.target.value })
                  }
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="department">Department</Label>
                <Input
                  id="department"
                  value={formData.department}
                  onChange={(e) =>
                    setFormData({ ...formData, department: e.target.value })
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="position">Position</Label>
                <Input
                  id="position"
                  value={formData.position}
                  onChange={(e) =>
                    setFormData({ ...formData, position: e.target.value })
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <Select
                  value={formData.status}
                  onValueChange={(value) =>
                    setFormData({
                      ...formData,
                      status: value as 'active' | 'inactive' | 'suspended',
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                    <SelectItem value="suspended">Suspended</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="shift">Assigned Shift</Label>
                <Select
                  value={formData.shiftId}
                  onValueChange={(value) => setFormData({ ...formData, shiftId: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a shift..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Default (Global Work Hours)</SelectItem>
                    {shifts?.map((shift: any) => (
                      <SelectItem key={shift.id} value={shift.id}>
                        {shift.name} ({shift.start_time.substring(0, 5)})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={saveEmployeeMutation.isPending}>
                  {saveEmployeeMutation.isPending
                    ? 'Saving...'
                    : editingEmployee
                    ? 'Update'
                    : 'Create'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Employees Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Employees ({employees?.length || 0})</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Loader text="Loading employees..." />
          ) : !employees || employees.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No employees found. Add your first employee to get started.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Employee ID</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {employees.map((employee) => (
                  <TableRow key={employee.id}>
                    <TableCell className="font-medium">
                      {employee.full_name}
                    </TableCell>
                    <TableCell>{employee.employee_id}</TableCell>
                    <TableCell>{employee.email}</TableCell>
                    <TableCell>{employee.department || 'N/A'}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          employee.status === 'active'
                            ? 'default'
                            : employee.status === 'inactive'
                            ? 'secondary'
                            : 'destructive'
                        }
                      >
                        {employee.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => registerWebAuthnMutation.mutate(employee)}
                          disabled={registerWebAuthnMutation.isPending}
                        >
                          <Fingerprint className="h-4 w-4" />
                        </Button>

                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setHistoryEmployee(employee)}
                          title="View History"
                        >
                          <CalendarDays className="h-4 w-4" />
                        </Button>

                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(employee)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>

                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="sm">
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete Employee</AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to delete {employee.full_name}?
                                This action cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => deleteEmployeeMutation.mutate(employee.id)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* History Dialog */}
      <Dialog open={!!historyEmployee} onOpenChange={(open) => !open && setHistoryEmployee(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Attendance History: {historyEmployee?.full_name}</DialogTitle>
            <DialogDescription>
              Recent 50 check-in records for this employee.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-auto mt-4">
            {historyLoading ? (
              <Loader text="Loading history..." />
            ) : !employeeHistory?.logs || employeeHistory.logs.length === 0 ? (
              <div className="text-center py-4 text-muted-foreground">No check-in history found.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {employeeHistory.logs.map((log: any) => {
                    const d = new Date(log.check_in_time);
                    return (
                      <TableRow key={log.id}>
                        <TableCell>{d.toLocaleDateString()}</TableCell>
                        <TableCell>{d.toLocaleTimeString()}</TableCell>
                        <TableCell>
                          {log.is_late ? (
                            <Badge variant="destructive">Late</Badge>
                          ) : (
                            <Badge variant="default" className="bg-green-600">On Time</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </div>
          <DialogFooter>
            <Button onClick={() => setHistoryEmployee(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
