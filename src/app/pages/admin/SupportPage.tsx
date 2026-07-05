import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { Button } from '../../components/ui/button';
import { toast } from 'sonner';
import { LifeBuoy, Send, MessageSquare } from 'lucide-react';
import { posthog } from '../../lib/posthog';

export default function SupportPage() {
  const { user } = useAuth();
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !message.trim()) return;

    setIsSending(true);
    posthog.capture('support_ticket_submitted', { subject_length: subject.length });

    try {
      const htmlBody = `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #030213;">
          <h2 style="color: #030213;">New Support Request</h2>
          <p><strong>From:</strong> ${user?.full_name || 'Admin'} (${user?.email})</p>
          <p><strong>Business:</strong> ${user?.business_name || 'N/A'}</p>
          <hr style="border: none; border-top: 1px solid #ececf0; margin: 20px 0;" />
          <p><strong>Subject:</strong> ${subject}</p>
          <div style="background: #fffaef; padding: 16px; border-radius: 8px; border: 1px solid #ececf0; white-space: pre-wrap;">
            ${message}
          </div>
        </div>
      `;

      const { data, error } = await supabase.functions.invoke('send-email', {
        body: {
          to: 'mansaidus@gmail.com', // Will be enforced by the edge function anyway
          subject: `Support: ${subject} (${user?.business_name || user?.full_name})`,
          html: htmlBody,
          from: 'Tymly Support <support@usetymly.com>'
        }
      });

      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);

      toast.success('Support request sent! We will get back to you shortly.');
      setSubject('');
      setMessage('');
    } catch (err: any) {
      toast.error('Failed to send message: ' + (err.message || 'Unknown error'));
      posthog.capture('support_ticket_failed', { error: err.message });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-8 animate-in fade-in duration-500">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <LifeBuoy className="w-6 h-6 text-[#030213]" />
          <h1 className="text-2xl font-bold tracking-tight text-[#030213]" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif', letterSpacing: '-0.025em' }}>
            Platform Support
          </h1>
        </div>
        <p className="text-sm text-[#6b7280]">
          Need help with your Tymly tenant? Send a message directly to the super admin and we'll resolve it quickly.
        </p>
      </div>

      <div className="bg-white border border-[#ececf0] rounded-[10px] overflow-hidden">
        <div className="px-6 py-5 border-b border-[#ececf0] bg-[#fffaef]">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-[#6b7280]" />
            <h2 className="text-sm font-semibold text-[#030213]" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>New Message</h2>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div className="space-y-2">
            <label className="text-sm font-medium text-[#030213]">Subject</label>
            <input
              type="text"
              required
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g. Need help resetting employee QR codes"
              className="w-full px-3 py-2 text-sm bg-white border border-[#ececf0] rounded-md focus:outline-none focus:border-[#030213]/30 focus:ring-1 focus:ring-[#030213]/10 transition-shadow"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-[#030213]">Message</label>
            <textarea
              required
              rows={6}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Describe the issue you're facing..."
              className="w-full px-3 py-2 text-sm bg-white border border-[#ececf0] rounded-md focus:outline-none focus:border-[#030213]/30 focus:ring-1 focus:ring-[#030213]/10 transition-shadow resize-y"
            />
          </div>

          <div className="flex justify-end pt-2">
            <Button
              type="submit"
              disabled={isSending || !subject.trim() || !message.trim()}
              className="bg-[#030213] text-white hover:bg-[#030213]/90 transition-colors"
            >
              {isSending ? (
                <>Sending...</>
              ) : (
                <>
                  <Send className="w-4 h-4 mr-2" /> Send Request
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
