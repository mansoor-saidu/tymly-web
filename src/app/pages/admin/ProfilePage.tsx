import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Alert, AlertDescription } from '../../components/ui/alert';
import { Loader } from '../../components/ui/loader';
import { User, Building2, Lock, Camera, Upload } from 'lucide-react';
import { toast } from 'sonner';

export default function ProfilePage() {
  const { user } = useAuth();
  
  // Profile & Business State
  const [loading, setLoading] = useState(false);
  const [profilePictureUrl, setProfilePictureUrl] = useState<string>('');
  const [formData, setFormData] = useState({
    full_name: '',
    business_name: '',
    phone_number: '',
    employee_size: '',
  });

  // Password State
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    new_password: '',
    confirm_password: '',
  });

  // Auth Provider State
  const [authProvider, setAuthProvider] = useState<string>('email');

  useEffect(() => {
    if (user) {
      setFormData({
        full_name: user.full_name || '',
        business_name: user.business_name || '',
        phone_number: user.phone_number || '',
        employee_size: user.employee_size || '',
      });
      setProfilePictureUrl(user.profile_picture_url || '');
    }

    // Determine auth provider
    const checkProvider = async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session?.user?.app_metadata?.provider) {
        setAuthProvider(data.session.user.app_metadata.provider);
      }
    };
    checkProvider();
  }, [user]);

  const handleProfileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({ ...prev, [e.target.id]: e.target.value }));
  };

  const handleSelectChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPasswordForm(prev => ({ ...prev, [e.target.id]: e.target.value }));
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    try {
      const file = event.target.files?.[0];
      if (!file) return;

      const fileExt = file.name.split('.').pop();
      const fileName = `${user?.id}-${Math.random().toString(36).substring(2)}.${fileExt}`;
      
      setLoading(true);

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from('avatars').getPublicUrl(fileName);
      
      // Update local state and DB immediately
      setProfilePictureUrl(data.publicUrl);
      
      const { error: updateError } = await supabase
        .from('admin_users')
        .update({ profile_picture_url: data.publicUrl })
        .eq('id', user?.id);
        
      if (updateError) throw updateError;
      
      toast.success('Profile picture updated successfully!');
    } catch (error: any) {
      toast.error(error.message || 'Failed to upload image');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const saveProfile = async () => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from('admin_users')
        .update({
          full_name: formData.full_name,
          business_name: formData.business_name,
          phone_number: formData.phone_number,
          employee_size: formData.employee_size,
        })
        .eq('id', user?.id);

      if (error) throw error;
      
      toast.success('Profile updated successfully!');
      // A full reload will ensure the context is updated, but for a smoother UX, 
      // the AuthContext subscription will pick this up on next session check. 
      // For immediate feedback, toast is enough.
    } catch (error: any) {
      toast.error(error.message || 'Failed to update profile');
    } finally {
      setLoading(false);
    }
  };

  const updatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (passwordForm.new_password !== passwordForm.confirm_password) {
      toast.error('Passwords do not match');
      return;
    }
    
    if (passwordForm.new_password.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }

    setPasswordLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: passwordForm.new_password
      });

      if (error) throw error;
      
      toast.success('Password updated successfully!');
      setPasswordForm({ new_password: '', confirm_password: '' });
    } catch (error: any) {
      toast.error(error.message || 'Failed to update password');
    } finally {
      setPasswordLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl pb-10">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Your Profile</h1>
        <p className="text-muted-foreground mt-2">
          Manage your personal information, business details, and security settings.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {/* Profile Picture Card */}
        <Card className="lg:col-span-1 border-muted/60 shadow-sm h-fit">
          <CardHeader>
            <CardTitle className="text-lg">Profile Picture</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center justify-center space-y-4">
            <div className="relative group rounded-full overflow-hidden w-32 h-32 border-4 border-muted/30 bg-muted/20 flex items-center justify-center">
              {profilePictureUrl ? (
                <img 
                  src={profilePictureUrl} 
                  alt={user?.full_name || 'Profile'} 
                  className="w-full h-full object-cover"
                />
              ) : (
                <User className="w-12 h-12 text-muted-foreground/50" />
              )}
              
              {/* Hover Overlay */}
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                <Camera className="w-8 h-8 text-white" />
              </div>
              
              {/* Hidden file input stretching over the container */}
              <input 
                type="file" 
                accept="image/*"
                onChange={handleFileUpload}
                disabled={loading}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
              />
            </div>
            
            <div className="text-center">
              <Button variant="outline" size="sm" className="relative cursor-pointer">
                <Upload className="w-4 h-4 mr-2" />
                Upload New Image
                <input 
                  type="file" 
                  accept="image/*"
                  onChange={handleFileUpload}
                  disabled={loading}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
                />
              </Button>
              <p className="text-xs text-muted-foreground mt-2">
                Recommended size: 256x256px.
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="lg:col-span-2 space-y-6">
          {/* Personal & Business Info */}
          <Card className="border-muted/60 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Building2 className="w-5 h-5 text-primary" />
                Personal & Business Details
              </CardTitle>
              <CardDescription>Update your contact information and company context.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="full_name">Full Name</Label>
                  <Input 
                    id="full_name" 
                    value={formData.full_name} 
                    onChange={handleProfileChange}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="email">Email Address</Label>
                  <Input 
                    id="email" 
                    value={user?.email || ''} 
                    disabled 
                    className="bg-muted/50 cursor-not-allowed"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="business_name">Business Name</Label>
                  <Input 
                    id="business_name" 
                    value={formData.business_name} 
                    onChange={handleProfileChange}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phone_number">Phone Number</Label>
                  <Input 
                    id="phone_number" 
                    type="tel"
                    value={formData.phone_number} 
                    onChange={handleProfileChange}
                    placeholder="+1 (555) 000-0000"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="employee_size">Company Size</Label>
                  <Select onValueChange={(val) => handleSelectChange('employee_size', val)} value={formData.employee_size}>
                    <SelectTrigger>
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
              </div>
            </CardContent>
            <CardFooter className="bg-muted/20 border-t border-muted/40 px-6 py-4">
              <Button onClick={saveProfile} disabled={loading} className="w-full md:w-auto ml-auto">
                {loading ? <Loader inline text="Saving..." /> : 'Save Changes'}
              </Button>
            </CardFooter>
          </Card>

          {/* Security */}
          <Card className="border-muted/60 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Lock className="w-5 h-5 text-primary" />
                Security
              </CardTitle>
              <CardDescription>
                {authProvider === 'google' 
                  ? "You signed in with Google. You can set a password here to also allow email sign-in."
                  : "Update your password to keep your account secure."}
              </CardDescription>
            </CardHeader>
            <form onSubmit={updatePassword}>
              <CardContent className="space-y-4">
                <div className="space-y-2 max-w-md">
                  <Label htmlFor="new_password">New Password</Label>
                  <Input 
                    id="new_password" 
                    type="password" 
                    value={passwordForm.new_password} 
                    onChange={handlePasswordChange}
                    placeholder="Minimum 6 characters"
                  />
                </div>
                
                <div className="space-y-2 max-w-md">
                  <Label htmlFor="confirm_password">Confirm New Password</Label>
                  <Input 
                    id="confirm_password" 
                    type="password" 
                    value={passwordForm.confirm_password} 
                    onChange={handlePasswordChange}
                  />
                </div>
              </CardContent>
              <CardFooter className="bg-muted/20 border-t border-muted/40 px-6 py-4">
                <Button 
                  type="submit" 
                  disabled={passwordLoading || !passwordForm.new_password || !passwordForm.confirm_password} 
                  variant="secondary"
                >
                  {passwordLoading ? <Loader inline text="Updating..." /> : 'Update Password'}
                </Button>
              </CardFooter>
            </form>
          </Card>
        </div>
      </div>
    </div>
  );
}
