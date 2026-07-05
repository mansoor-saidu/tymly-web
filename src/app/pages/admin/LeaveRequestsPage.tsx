import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Badge } from '../../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { CheckCircle2, XCircle, Clock, CalendarIcon, FileText } from 'lucide-react';
import { Loader } from '../../components/ui/loader';
import { callEdgeFunction } from '../../lib/supabase';
import { toast } from 'sonner';
import { posthog } from '../../lib/posthog';

export default function LeaveRequestsPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('pending');

  const { data: requests, isLoading } = useQuery({
    queryKey: ['leave-requests'],
    queryFn: async () => {
      const { data, error } = await callEdgeFunction('manage-leave-requests', {
        action: 'list',
      });
      if (error) throw error;
      return data.requests as any[];
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: 'approved' | 'rejected' }) => {
      const { data, error } = await callEdgeFunction('manage-leave-requests', {
        action: 'update_status',
        leaveRequestId: id,
        data: { status },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['leave-requests'] });
      posthog.capture('leave_request_status_updated', { status: variables.status });
      toast.success(`Leave request ${variables.status}`);
    },
    onError: () => {
      toast.error('Failed to update request');
    },
  });

  const handleUpdateStatus = (id: string, status: 'approved' | 'rejected') => {
    updateStatusMutation.mutate({ id, status });
  };

  const filteredRequests = requests?.filter(req => {
    if (activeTab === 'pending') return req.status === 'pending';
    return req.status !== 'pending';
  });

  return (
    <div className="space-y-6 md:space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Leave Management</h1>
        <p className="text-muted-foreground mt-2">
          Review and manage employee time off requests
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Leave Requests</CardTitle>
          <CardDescription>View pending and historical leave requests</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="mb-4">
              <TabsTrigger value="pending">Pending</TabsTrigger>
              <TabsTrigger value="history">History</TabsTrigger>
            </TabsList>
            
            <TabsContent value={activeTab} className="mt-0">
              {isLoading ? (
                <Loader text="Loading requests..." />
              ) : !filteredRequests || filteredRequests.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No {activeTab} leave requests found.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Dates</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead>Status</TableHead>
                      {activeTab === 'pending' && <TableHead className="text-right">Actions</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRequests.map((req) => {
                      const startDate = new Date(req.start_date).toLocaleDateString();
                      const endDate = new Date(req.end_date).toLocaleDateString();
                      
                      return (
                        <TableRow key={req.id}>
                          <TableCell>
                            <div className="font-medium">{req.employee?.full_name}</div>
                            <div className="text-xs text-muted-foreground">{req.employee?.employee_id}</div>
                          </TableCell>
                          <TableCell>
                            <span className="capitalize">{req.leave_type}</span>
                          </TableCell>
                          <TableCell>
                            {startDate} - {endDate}
                          </TableCell>
                          <TableCell className="max-w-[200px] truncate" title={req.reason}>
                            {req.reason || '-'}
                          </TableCell>
                          <TableCell>
                            {req.status === 'pending' && <Badge variant="secondary"><Clock className="mr-1 h-3 w-3" /> Pending</Badge>}
                            {req.status === 'approved' && <Badge variant="default" className="bg-green-600"><CheckCircle2 className="mr-1 h-3 w-3" /> Approved</Badge>}
                            {req.status === 'rejected' && <Badge variant="destructive"><XCircle className="mr-1 h-3 w-3" /> Rejected</Badge>}
                          </TableCell>
                          {activeTab === 'pending' && (
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-2">
                                <Button 
                                  variant="outline" 
                                  size="sm" 
                                  className="text-green-600 hover:text-green-700 hover:bg-green-50"
                                  onClick={() => handleUpdateStatus(req.id, 'approved')}
                                  disabled={updateStatusMutation.isPending}
                                >
                                  Approve
                                </Button>
                                <Button 
                                  variant="outline" 
                                  size="sm" 
                                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                  onClick={() => handleUpdateStatus(req.id, 'rejected')}
                                  disabled={updateStatusMutation.isPending}
                                >
                                  Reject
                                </Button>
                              </div>
                            </TableCell>
                          )}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
