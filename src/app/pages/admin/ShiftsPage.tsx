import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Loader } from '../../components/ui/loader';
import { Edit, Plus, Trash2, Clock } from 'lucide-react';
import { callEdgeFunction } from '../../lib/supabase';
import { toast } from 'sonner';
import { posthog } from '../../lib/posthog';
import type { Shift } from '../../types/database';

export default function ShiftsPage() {
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingShift, setEditingShift] = useState<Shift | null>(null);
  
  const [formData, setFormData] = useState({
    name: '',
    startTime: '09:00',
    lateGracePeriodMinutes: 15,
  });

  const { data: shifts, isLoading } = useQuery({
    queryKey: ['shifts'],
    queryFn: async () => {
      const { data, error } = await callEdgeFunction('manage-shifts', { action: 'list' });
      if (error) throw error;
      return data.shifts as Shift[];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const action = editingShift ? 'update' : 'create';
      const { data, error } = await callEdgeFunction('manage-shifts', {
        action,
        shiftId: editingShift?.id,
        data: formData,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shifts'] });
      if (!editingShift) {
        posthog.capture('shift_created', {
          start_time: formData.startTime,
          grace_period_minutes: formData.lateGracePeriodMinutes,
        });
      }
      toast.success(`Shift ${editingShift ? 'updated' : 'created'} successfully`);
      setIsDialogOpen(false);
    },
    onError: () => {
      toast.error('Failed to save shift');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await callEdgeFunction('manage-shifts', {
        action: 'delete',
        shiftId: id,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shifts'] });
      posthog.capture('shift_deleted');
      toast.success('Shift deleted successfully');
    },
    onError: () => {
      toast.error('Failed to delete shift');
    },
  });

  const handleOpenDialog = (shift?: Shift) => {
    if (shift) {
      setEditingShift(shift);
      setFormData({
        name: shift.name,
        startTime: shift.start_time.substring(0, 5), // format HH:mm
        lateGracePeriodMinutes: shift.late_grace_period_minutes,
      });
    } else {
      setEditingShift(null);
      setFormData({ name: '', startTime: '09:00', lateGracePeriodMinutes: 15 });
    }
    setIsDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveMutation.mutate();
  };

  return (
    <div className="space-y-6 md:space-y-8">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Shift Management</h1>
          <p className="text-muted-foreground mt-2">
            Define work schedules and late grace periods for employees.
          </p>
        </div>
        <Button onClick={() => handleOpenDialog()}>
          <Plus className="mr-2 h-4 w-4" />
          Add Shift
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Configured Shifts</CardTitle>
          <CardDescription>All available shifts you can assign to employees.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Loader text="Loading shifts..." />
          ) : !shifts || shifts.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No shifts found. Create one to get started.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Shift Name</TableHead>
                  <TableHead>Start Time</TableHead>
                  <TableHead>Grace Period</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shifts.map((shift) => (
                  <TableRow key={shift.id}>
                    <TableCell className="font-medium">{shift.name}</TableCell>
                    <TableCell>
                      <div className="flex items-center">
                        <Clock className="mr-2 h-4 w-4 text-muted-foreground" />
                        {shift.start_time.substring(0, 5)}
                      </div>
                    </TableCell>
                    <TableCell>{shift.late_grace_period_minutes} minutes</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleOpenDialog(shift)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-600 hover:text-red-700"
                        onClick={() => {
                          if (confirm('Are you sure you want to delete this shift? Employees assigned to it will fall back to global settings.')) {
                            deleteMutation.mutate(shift.id);
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingShift ? 'Edit Shift' : 'Create New Shift'}</DialogTitle>
            <DialogDescription>
              Set the expected start time and grace period for this schedule.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Shift Name</Label>
              <Input
                id="name"
                required
                placeholder="e.g. Night Shift"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="startTime">Start Time</Label>
                <Input
                  id="startTime"
                  type="time"
                  required
                  value={formData.startTime}
                  onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="grace">Grace Period (Minutes)</Label>
                <Input
                  id="grace"
                  type="number"
                  required
                  min="0"
                  max="120"
                  value={formData.lateGracePeriodMinutes}
                  onChange={(e) => setFormData({ ...formData, lateGracePeriodMinutes: parseInt(e.target.value) })}
                />
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? 'Saving...' : 'Save Shift'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
