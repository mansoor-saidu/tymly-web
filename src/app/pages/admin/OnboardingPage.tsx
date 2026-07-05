import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { supabase, callEdgeFunction } from '../../lib/supabase';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Alert, AlertDescription } from '../../components/ui/alert';
import { Loader } from '../../components/ui/loader';
import { Building2, Users, Phone, Megaphone, MapPin, ChevronRight, SkipForward } from 'lucide-react';
import { toast } from 'sonner';
import { posthog } from '../../lib/posthog';
import lightLogo from '../../../Light-logo.png';
import darkLogo from '../../../Dark-logo.png';

export default function OnboardingPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const [formData, setFormData] = useState({
    business_name: '',
    phone_number: '',
    employee_size: '',
    how_did_you_hear: '',
  });

  // If they already have a business name and they are on step 1, 
  // they shouldn't be here (unless they are explicitly just finishing step 2).
  // But to be safe, if we mount and they have a business name, send them to dashboard.
  if (user?.business_name && step === 1) {
    navigate('/admin');
    return null;
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({ ...prev, [e.target.id]: e.target.value }));
  };

  const handleSelectChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmitProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (!formData.business_name.trim()) {
      setError('Business name is required.');
      return;
    }

    setLoading(true);

    try {
      // 1. Create Company
      const { data: company, error: companyError } = await supabase
        .from('companies')
        .insert({ name: formData.business_name })
        .select()
        .single();

      if (companyError) {
        console.error('Company creation error:', companyError);
        throw new Error('Failed to create company.');
      }

      // 2. Create System Settings
      const { error: settingsError } = await supabase
        .from('system_settings')
        .insert({
           company_id: company.id,
           office_latitude: 37.7749, // San Francisco default
           office_longitude: -122.4194,
           office_radius_meters: 100,
           work_start_time: '09:00:00',
           late_grace_period_minutes: 15
        });

      if (settingsError) {
        console.error('Settings creation error:', settingsError);
        throw new Error('Failed to initialize settings.');
      }

      // 3. Update Admin User
      const { error: updateError } = await supabase
        .from('admin_users')
        .update({
          business_name: formData.business_name,
          phone_number: formData.phone_number,
          employee_size: formData.employee_size,
          how_did_you_hear: formData.how_did_you_hear,
          company_id: company.id
        })
        .eq('id', user?.id);

      if (updateError) throw updateError;

      posthog.capture('onboarding_profile_completed', {
        employee_size: formData.employee_size,
        how_did_you_hear: formData.how_did_you_hear,
      });

      // Send Welcome Email asynchronously
      const welcomeHtml = `
        <div style="font-family: 'Plus Jakarta Sans', sans-serif; max-width: 600px; margin: 0 auto; color: #030213; line-height: 1.6;">
          <h2 style="color: #030213; font-size: 24px;">Welcome to Tymly! 🎉</h2>
          <p>Hi ${user?.full_name?.split(' ')[0] || 'there'},</p>
          <p>Thank you for joining Tymly. We are on a mission to automate the HR space, and we're thrilled to have <strong>${formData.business_name}</strong> on board!</p>
          
          <h3 style="color: #030213; margin-top: 24px;">What you can do with Tymly:</h3>
          <ul style="padding-left: 20px; color: #4b5563;">
            <li style="margin-bottom: 8px;"><strong>Lightning-Fast Check-ins:</strong> Employees scan their unique QR codes in milliseconds.</li>
            <li style="margin-bottom: 8px;"><strong>Location Verification:</strong> Bulletproof attendance tied to your office coordinates.</li>
            <li style="margin-bottom: 8px;"><strong>Real-Time Analytics:</strong> Monitor lateness, absent employees, and overtime instantly.</li>
            <li style="margin-bottom: 8px;"><strong>Automated Reports:</strong> Export seamless timesheets ready for payroll.</li>
          </ul>

          <div style="background: #fffaef; padding: 20px; border-radius: 8px; border: 1px solid #ececf0; margin-top: 32px; text-align: center;">
            <h3 style="margin-top: 0; color: #030213;">Let's chat!</h3>
            <p style="color: #4b5563; font-size: 14px; margin-bottom: 16px;">I'd love to learn more about your business and ensure you get the most out of Tymly.</p>
            <a href="https://calendly.com/mansaidus/30min" target="_blank" style="background: #030213; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; display: inline-block;">
              Schedule a 30-min call with me
            </a>
          </div>

          <p style="margin-top: 32px; color: #6b7280; font-size: 14px;">
            Best,<br/>
            <strong>Mansoor Saidu</strong><br/>
            Founder, Tymly
          </p>
        </div>
      `;

      supabase.functions.invoke('send-email', {
        body: {
          to: user?.email,
          subject: 'Welcome to Tymly! Let\'s automate your HR',
          html: welcomeHtml,
          from: 'Mansoor at Tymly <hello@usetymly.com>'
        }
      }).catch(err => console.error('Failed to send welcome email:', err));

      // Temporarily store company_id so Step 2 can use it
      sessionStorage.setItem('temp_company_id', company.id);

      // Move to step 2 instead of redirecting immediately
      setStep(2);
      setLoading(false);
    } catch (err: any) {
      console.error('Onboarding error:', err);
      setError(err.message || 'Failed to complete profile step');
      setLoading(false);
    }
  };

  const generatePolygonAroundPoint = (lat: number, lng: number, radiusMeters: number = 100) => {
    const latOffset = radiusMeters / 111000;
    const lngOffset = radiusMeters / (111000 * Math.cos(lat * Math.PI / 180));
    
    const polygon = [
      [lng - lngOffset, lat - latOffset],
      [lng + lngOffset, lat - latOffset],
      [lng + lngOffset, lat + latOffset],
      [lng - lngOffset, lat + latOffset],
      [lng - lngOffset, lat - latOffset]
    ];
    
    return JSON.stringify(polygon, null, 2);
  };

  const handleUseLocation = () => {
    if (!navigator.geolocation) {
      toast.error('Geolocation is not supported by your browser');
      return;
    }
    
    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const { latitude, longitude } = position.coords;
          const polygon = generatePolygonAroundPoint(latitude, longitude);
          
          // Get the settings ID for this company
          const currentCompanyId = user?.company_id || sessionStorage.getItem('temp_company_id');
          if (!currentCompanyId) throw new Error("Company ID missing. Please reload the page.");

          const { data: settings, error: settingsError } = await supabase
            .from('system_settings')
            .select('id')
            .eq('company_id', currentCompanyId)
            .single();
            
          if (settingsError) throw settingsError;
          
          // Use edge function to securely update
          const { error: fnError } = await callEdgeFunction('manage-settings', {
             action: 'update_location',
             settingsId: settings.id,
             data: {
               polygon: JSON.parse(polygon),
             }
          });
          
          if (fnError) throw fnError;
          
          posthog.capture('onboarding_location_set');
          toast.success('Location saved successfully!');
          window.location.href = '/admin';
        } catch (err: any) {
          console.error(err);
          toast.error(err.message || 'Failed to save location');
          setLoading(false);
        }
      },
      (error) => {
        console.error('Geolocation error:', error);
        toast.error('Location permission denied or unavailable. Please skip for now.');
        setLoading(false);
      },
      { enableHighAccuracy: true }
    );
  };

  const handleSkip = () => {
    posthog.capture('onboarding_location_skipped');
    toast.success('Welcome to Tymly!');
    window.location.href = '/admin';
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-lg shadow-xl border-transparent bg-background overflow-hidden">
        {/* Progress Bar */}
        <div className="w-full bg-muted/30 h-1.5 flex">
          <div className={`h-full bg-primary transition-all duration-500 ${step === 1 ? 'w-1/2' : 'w-full'}`} />
        </div>

        <CardHeader className="space-y-3 pb-6 border-b border-muted/40 mt-2">
          <div className="flex items-center justify-center mb-2">
            <img src={lightLogo} alt="tymly" className="h-8 dark:hidden opacity-80" />
            <img src={darkLogo} alt="tymly" className="h-8 hidden dark:block opacity-80" />
          </div>
          
          <CardTitle className="text-3xl font-extrabold text-center tracking-tight">
            {step === 1 ? 'Complete your profile' : 'Set Office Location'}
          </CardTitle>
          
          <CardDescription className="text-center text-base">
            {step === 1 
              ? 'Tell us a bit about your organization so we can tailor your workspace.'
              : 'We use location boundaries to verify employee check-ins. You must be at the office to set this up accurately.'}
          </CardDescription>
        </CardHeader>
        
        {step === 1 && (
          <form onSubmit={handleSubmitProfile} className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <CardContent className="space-y-6 pt-6">
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-4">
                <div className="space-y-2 group">
                  <Label htmlFor="business_name" className="text-foreground/80 group-focus-within:text-primary transition-colors flex items-center gap-2">
                    <Building2 className="w-4 h-4" />
                    Business Name <span className="text-destructive">*</span>
                  </Label>
                  <Input 
                    id="business_name" 
                    placeholder="e.g. Acme Corp" 
                    value={formData.business_name}
                    onChange={handleChange}
                    className="transition-shadow focus-visible:ring-primary/20 focus-visible:border-primary"
                    required
                  />
                </div>

                <div className="space-y-2 group">
                  <Label htmlFor="phone_number" className="text-foreground/80 group-focus-within:text-primary transition-colors flex items-center gap-2">
                    <Phone className="w-4 h-4" />
                    Phone Number
                  </Label>
                  <Input 
                    id="phone_number" 
                    type="tel"
                    placeholder="e.g. +1 (555) 000-0000" 
                    value={formData.phone_number}
                    onChange={handleChange}
                    className="transition-shadow focus-visible:ring-primary/20 focus-visible:border-primary"
                  />
                </div>

                <div className="space-y-2 group">
                  <Label htmlFor="employee_size" className="text-foreground/80 flex items-center gap-2">
                    <Users className="w-4 h-4" />
                    Company Size
                  </Label>
                  <Select onValueChange={(val) => handleSelectChange('employee_size', val)} value={formData.employee_size}>
                    <SelectTrigger className="w-full transition-shadow focus:ring-primary/20 focus:border-primary">
                      <SelectValue placeholder="Select team size" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1-10">1-10 employees</SelectItem>
                      <SelectItem value="11-50">11-50 employees</SelectItem>
                      <SelectItem value="51-200">51-200 employees</SelectItem>
                      <SelectItem value="201-500">201-500 employees</SelectItem>
                      <SelectItem value="500+">500+ employees</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2 group">
                  <Label htmlFor="how_did_you_hear" className="text-foreground/80 flex items-center gap-2">
                    <Megaphone className="w-4 h-4" />
                    How did you hear about us?
                  </Label>
                  <Select onValueChange={(val) => handleSelectChange('how_did_you_hear', val)} value={formData.how_did_you_hear}>
                    <SelectTrigger className="w-full transition-shadow focus:ring-primary/20 focus:border-primary">
                      <SelectValue placeholder="Select an option" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="search">Search Engine (Google, Bing)</SelectItem>
                      <SelectItem value="social">Social Media (LinkedIn, Twitter)</SelectItem>
                      <SelectItem value="friend">Friend or Colleague</SelectItem>
                      <SelectItem value="blog">Blog or Article</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
            
            <CardFooter className="bg-muted/10 border-t border-muted/20 px-6 py-4 mt-2">
              <Button 
                type="submit" 
                className="w-full h-11 text-base font-semibold transition-all hover:shadow-md group"
                disabled={loading}
              >
                {loading ? <Loader inline text="Saving..." videoClassName="w-5 h-5" /> : (
                  <>
                    Continue
                    <ChevronRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </Button>
            </CardFooter>
          </form>
        )}

        {step === 2 && (
          <div className="animate-in fade-in slide-in-from-right-8 duration-500">
            <CardContent className="space-y-6 pt-10 pb-8 flex flex-col items-center">
              <div className="w-24 h-24 bg-primary/10 rounded-full flex items-center justify-center mb-2">
                <MapPin className="w-10 h-10 text-primary" />
              </div>
              <p className="text-center text-muted-foreground">
                We'll ask your browser for permission to securely capture your current GPS coordinates. We'll instantly map a 100-meter attendance boundary around this point.
              </p>
            </CardContent>

            <CardFooter className="bg-muted/10 border-t border-muted/20 px-6 py-4 flex flex-col gap-3">
              <Button 
                onClick={handleUseLocation}
                className="w-full h-11 text-base font-semibold shadow-md"
                disabled={loading}
              >
                {loading ? <Loader inline text="Getting location..." videoClassName="w-5 h-5" /> : 'Use Current Location'}
              </Button>
              <Button 
                variant="ghost" 
                onClick={handleSkip}
                className="w-full text-muted-foreground hover:text-foreground"
                disabled={loading}
              >
                <SkipForward className="w-4 h-4 mr-2" />
                Skip for later (not at office)
              </Button>
            </CardFooter>
          </div>
        )}
      </Card>
    </div>
  );
}
