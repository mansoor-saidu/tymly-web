import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { Button } from '../../components/ui/button';
import { toast } from 'sonner';
import { Megaphone, Send, Users, Activity, BarChart3 } from 'lucide-react';
import { posthog } from '../../lib/posthog';

export default function MarketingPage() {
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [recipientFilter, setRecipientFilter] = useState<'all' | 'admins' | 'test'>('test');
  const [testEmail, setTestEmail] = useState('');

  const { data: allUsers, isLoading } = useQuery({
    queryKey: ['super-admin-marketing-users'],
    queryFn: async () => {
      const { data, error } = await supabase.from('admin_users').select('email, role, full_name, business_name');
      if (error) throw error;
      return data;
    },
  });

  const getRecipients = () => {
    if (recipientFilter === 'test') {
      return testEmail ? [{ email: testEmail, full_name: 'Test User' }] : [];
    }
    if (recipientFilter === 'admins') {
      return allUsers?.filter(u => u.role === 'admin') || [];
    }
    return allUsers || [];
  };

  const recipients = getRecipients();

  const sendBroadcastMutation = useMutation({
    mutationFn: async () => {
      if (!subject.trim() || !message.trim()) throw new Error('Subject and message are required');
      if (recipients.length === 0) throw new Error('No recipients selected');

      // Send to each recipient individually via our edge function
      // In a real mass-marketing tool you'd use a bulk endpoint, but since we are automating HR space for a modest number of tenants, a loop works for now.
      const promises = recipients.map(async (recipient) => {
        const htmlBody = `
          <div style="font-family: 'Plus Jakarta Sans', sans-serif; max-width: 600px; margin: 0 auto; color: #030213; line-height: 1.6;">
            <p>Hi ${recipient.full_name?.split(' ')[0] || 'there'},</p>
            <div style="white-space: pre-wrap;">
              ${message}
            </div>
            <p style="margin-top: 32px; color: #6b7280; font-size: 14px;">
              Best,<br/>
              <strong>Mansoor Saidu</strong><br/>
              Founder, Tymly
            </p>
          </div>
        `;

        const { data, error } = await supabase.functions.invoke('send-email', {
          body: {
            to: recipient.email,
            subject: subject,
            html: htmlBody,
            from: 'Mansoor at Tymly <mansoor@usetymly.com>'
          }
        });

        if (error || data?.error) {
          const errMsg = error?.message || data?.error || 'Unknown error';
          console.error(`Failed to send to ${recipient.email}:`, errMsg);
          throw new Error(`Failed sending to ${recipient.email}: ${errMsg}`);
        }
      });

      await Promise.all(promises);
    },
    onSuccess: () => {
      posthog.capture('super_admin_broadcast_sent', {
        recipient_count: recipients.length,
        filter: recipientFilter,
      });
      toast.success(`Broadcast sent to ${recipients.length} recipients!`);
      setSubject('');
      setMessage('');
    },
    onError: (e: any) => {
      toast.error(e.message || 'Failed to send broadcast');
    }
  });

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto space-y-8 animate-in fade-in duration-500">
      <div>
        <div className="flex items-center gap-2.5 mb-1">
          <Megaphone className="w-6 h-6 text-indigo-500" />
          <h1 className="text-2xl font-bold tracking-tight text-[#030213]" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif', letterSpacing: '-0.025em' }}>
            Marketing & Broadcasts
          </h1>
        </div>
        <p className="text-sm text-[#6b7280]">
          Communicate directly with your tenants. Announce new features, gather feedback, or drive adoption.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Left Column: Composer */}
        <div className="md:col-span-2 space-y-6">
          <div className="bg-white border border-[#ececf0] rounded-[10px] overflow-hidden">
            <div className="px-6 py-5 border-b border-[#ececf0] bg-[#fffaef]">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Send className="w-4 h-4 text-[#030213]" />
                  <h2 className="text-sm font-bold text-[#030213]" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>New Broadcast</h2>
                </div>
              </div>
            </div>

            <div className="p-6 space-y-5">
              
              {/* Audience Selection */}
              <div className="space-y-3">
                <label className="text-sm font-medium text-[#030213]">Audience</label>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setRecipientFilter('test')}
                    className={`px-4 py-2 rounded-md text-xs font-medium border transition-colors ${
                      recipientFilter === 'test'
                        ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                        : 'bg-white text-[#6b7280] border-[#ececf0] hover:bg-[#f9f9f9]'
                    }`}
                  >
                    Test Send
                  </button>
                  <button
                    onClick={() => setRecipientFilter('admins')}
                    className={`px-4 py-2 rounded-md text-xs font-medium border transition-colors ${
                      recipientFilter === 'admins'
                        ? 'bg-[#030213] text-white border-[#030213]'
                        : 'bg-white text-[#6b7280] border-[#ececf0] hover:bg-[#f9f9f9]'
                    }`}
                  >
                    Tenant Admins Only
                  </button>
                  <button
                    onClick={() => setRecipientFilter('all')}
                    className={`px-4 py-2 rounded-md text-xs font-medium border transition-colors ${
                      recipientFilter === 'all'
                        ? 'bg-[#030213] text-white border-[#030213]'
                        : 'bg-white text-[#6b7280] border-[#ececf0] hover:bg-[#f9f9f9]'
                    }`}
                  >
                    All Users
                  </button>
                </div>

                {recipientFilter === 'test' && (
                  <input
                    type="email"
                    placeholder="Enter test email address..."
                    value={testEmail}
                    onChange={(e) => setTestEmail(e.target.value)}
                    className="w-full max-w-sm px-3 py-2 mt-2 text-sm bg-white border border-[#ececf0] rounded-md focus:outline-none focus:border-indigo-300 focus:ring-1 focus:ring-indigo-100 transition-shadow"
                  />
                )}
                
                <p className="text-xs text-[#6b7280]">
                  This broadcast will be sent to <strong>{recipients.length}</strong> recipient{recipients.length !== 1 ? 's' : ''}.
                </p>
              </div>

              {/* Subject */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-[#030213]">Subject Line</label>
                <input
                  type="text"
                  required
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="e.g. New Feature: Export to Payroll!"
                  className="w-full px-3 py-2 text-sm bg-white border border-[#ececf0] rounded-md focus:outline-none focus:border-indigo-300 focus:ring-1 focus:ring-indigo-100 transition-shadow"
                />
              </div>

              {/* Message */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-[#030213]">Message Body</label>
                <textarea
                  required
                  rows={8}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Type your message here. The greeting (Hi Name,) and signature (Best, Mansoor) will be added automatically."
                  className="w-full px-3 py-2 text-sm bg-white border border-[#ececf0] rounded-md focus:outline-none focus:border-indigo-300 focus:ring-1 focus:ring-indigo-100 transition-shadow resize-y"
                />
                <p className="text-[11px] text-[#9ca3af]">Basic HTML tags like &lt;b&gt;, &lt;i&gt;, and &lt;a&gt; are supported.</p>
              </div>

            </div>

            <div className="px-6 py-4 border-t border-[#ececf0] bg-[#fdfdfd] flex justify-between items-center">
              <span className="text-xs text-[#9ca3af]">Sender: Mansoor at Tymly</span>
              <Button
                onClick={() => sendBroadcastMutation.mutate()}
                disabled={sendBroadcastMutation.isPending || recipients.length === 0 || !subject || !message}
                className="bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
              >
                {sendBroadcastMutation.isPending ? 'Sending...' : `Send to ${recipients.length} Users`}
              </Button>
            </div>
          </div>
        </div>

        {/* Right Column: Stats & Tips */}
        <div className="space-y-6">
          <div className="bg-white border border-[#ececf0] rounded-[10px] overflow-hidden">
            <div className="px-5 py-4 border-b border-[#ececf0] flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-[#6b7280]" />
              <h2 className="text-sm font-semibold text-[#030213]" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>Reach</h2>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <div className="text-3xl font-bold text-[#030213]" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
                  {isLoading ? '...' : allUsers?.length || 0}
                </div>
                <div className="text-xs text-[#9ca3af] mt-0.5 flex items-center gap-1">
                  <Users className="w-3 h-3" /> Total platform users
                </div>
              </div>
              <hr className="border-[#ececf0]" />
              <div>
                <div className="text-3xl font-bold text-[#030213]" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
                  {isLoading ? '...' : allUsers?.filter(u => !!u.business_name).length || 0}
                </div>
                <div className="text-xs text-[#9ca3af] mt-0.5 flex items-center gap-1">
                  <Activity className="w-3 h-3" /> Active businesses
                </div>
              </div>
            </div>
          </div>

          <div className="bg-indigo-50/50 border border-indigo-100 rounded-[10px] p-5">
            <h3 className="text-sm font-bold text-indigo-900 mb-2">Broadcast Tips</h3>
            <ul className="space-y-2 text-xs text-indigo-800/80 list-disc pl-4">
              <li>Always send a <strong>Test Send</strong> to yourself before broadcasting to all users.</li>
              <li>Keep subject lines under 50 characters for better open rates.</li>
              <li>Include a clear Call-To-Action (e.g. a link to Calendly or a new feature).</li>
              <li>Don't spam. Limit mass broadcasts to once a week max.</li>
            </ul>
          </div>
        </div>

      </div>
    </div>
  );
}
