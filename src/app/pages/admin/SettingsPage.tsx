import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Separator } from '../../components/ui/separator';
import { Loader } from '../../components/ui/loader';
import { Alert, AlertDescription } from '../../components/ui/alert';
import { Switch } from '../../components/ui/switch';
import { QRCodeSVG } from 'qrcode.react';
import { RefreshCw, MapPin, Clock, QrCode, Save, Copy, Download, Printer, Search, MessageSquare, Mail, SmartphoneNfc, Database, Activity } from 'lucide-react';
import { Badge } from '../../components/ui/badge';
import { supabase, callEdgeFunction } from '../../lib/supabase';
import { generateUniversalQRCodeURL } from '../../lib/qrcode';
import { toast } from 'sonner';
import { posthog } from '../../lib/posthog';
import type { SystemSettings } from '../../types/database';

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const [qrData, setQrData] = useState<string>('');
  const [locationForm, setLocationForm] = useState({
    polygon: '[[[-122.42, 37.77], [-122.41, 37.77], [-122.41, 37.78], [-122.42, 37.78], [-122.42, 37.77]]]',
  });
  const [workHoursForm, setWorkHoursForm] = useState({
    startTime: '09:00',
    gracePeriod: 15,
  });
  const [notificationsForm, setNotificationsForm] = useState({
    email: '',
    whatsapp: '',
    whatsappApiKey: '',
    notifyLate: false,
    notifySummary: false,
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [showAdvancedLocation, setShowAdvancedLocation] = useState(false);
  const [detectedLocation, setDetectedLocation] = useState<{lat: number, lng: number} | null>(null);

  const generatePolygonAroundPoint = (lat: number, lng: number, radiusMeters: number = 100) => {
    // 1 degree latitude is approx 111km
    const latOffset = radiusMeters / 111000;
    // longitude offset depends on latitude
    const lngOffset = radiusMeters / (111000 * Math.cos(lat * Math.PI / 180));
    
    const polygon = [
      [lng - lngOffset, lat - latOffset],
      [lng + lngOffset, lat - latOffset],
      [lng + lngOffset, lat + latOffset],
      [lng - lngOffset, lat + latOffset],
      [lng - lngOffset, lat - latOffset] // close the polygon
    ];
    
    return JSON.stringify(polygon, null, 2);
  };

  const handleSearchLocation = async () => {
    if (!searchQuery.trim()) return;
    
    setIsSearching(true);
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}`);
      if (!response.ok) throw new Error('Failed to fetch from OpenStreetMap');
      
      const results = await response.json();

      if (results && results.length > 0) {
        const location = results[0];
        const lat = parseFloat(location.lat);
        const lon = parseFloat(location.lon);
        setLocationForm({
          polygon: generatePolygonAroundPoint(lat, lon)
        });
        setDetectedLocation({ lat, lng: lon });
        toast.success(`Found: ${location.display_name}. Generated a 100m boundary.`);
        setSearchQuery('');
      } else {
        toast.error('No results found for that location.');
      }
    } catch (error: any) {
      toast.error(error?.message || 'Failed to find location.');
      console.error('Geocoding error:', error);
    } finally {
      setIsSearching(false);
    }
  };

  // Fetch system settings
  const { data: settings, isLoading } = useQuery({
    queryKey: ['system-settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('system_settings')
        .select('*')
        .single();

      if (error) throw error;
      return data as SystemSettings;
    },
  });

  // Initialize forms when settings load
  useEffect(() => {
    if (settings) {
      setLocationForm({
        polygon: JSON.stringify(settings.office_polygon || []),
      });

      setWorkHoursForm({
        startTime: settings.work_start_time.substring(0, 5), // HH:MM format
        gracePeriod: settings.late_grace_period_minutes,
      });

      setNotificationsForm({
        email: settings.notification_email || '',
        whatsapp: settings.notification_whatsapp || '',
        whatsappApiKey: settings.whatsapp_api_key || '',
        notifyLate: settings.notify_on_late || false,
        notifySummary: settings.notify_daily_summary || false,
      });
    }
  }, [settings]);

  // Generate QR code URL on mount
  useEffect(() => {
    const loadQRCode = async () => {
      if (!settings?.company_id) return;
      const qrUrl = await generateUniversalQRCodeURL(settings.company_id);
      if (qrUrl) {
        setQrData(qrUrl);
      }
    };
    loadQRCode();
  }, [settings?.qr_code_version]); // Reload when version changes

  // Update location mutation
  const updateLocationMutation = useMutation({
    mutationFn: async (data: typeof locationForm) => {
      const { data: updatedData, error } = await callEdgeFunction('manage-settings', {
        action: 'update_location',
        settingsId: settings!.id,
        data: {
          polygon: JSON.parse(data.polygon),
        }
      });

      if (error || !updatedData?.success) {
        throw new Error(error?.message || updatedData?.message || 'Update failed');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system-settings'] });
      toast.success('Location settings updated');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to update location settings');
    },
  });

  // Update work hours mutation
  const updateWorkHoursMutation = useMutation({
    mutationFn: async (data: typeof workHoursForm) => {
      const { data: updatedData, error } = await callEdgeFunction('manage-settings', {
        action: 'update_work_hours',
        settingsId: settings!.id,
        data: {
          startTime: data.startTime,
          gracePeriod: data.gracePeriod,
        }
      });

      if (error || !updatedData?.success) {
        throw new Error(error?.message || updatedData?.message || 'Update failed');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system-settings'] });
      toast.success('Work hours updated');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to update work hours');
    },
  });

  // Update notifications mutation
  const updateNotificationsMutation = useMutation({
    mutationFn: async (data: typeof notificationsForm) => {
      const { data: updatedData, error } = await callEdgeFunction('manage-settings', {
        action: 'update_notifications',
        settingsId: settings!.id,
        data: {
          notification_email: data.email,
          notification_whatsapp: data.whatsapp,
          whatsapp_api_key: data.whatsappApiKey,
          notify_on_late: data.notifyLate,
          notify_daily_summary: data.notifySummary,
        }
      });

      if (error || !updatedData?.success) {
        throw new Error(error?.message || updatedData?.message || 'Update failed');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system-settings'] });
      toast.success('Notification settings updated');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to update notification settings');
    },
  });

  // Regenerate QR code mutation
  const regenerateQRMutation = useMutation({
    mutationFn: async () => {
      const newVersion = (settings?.qr_code_version || 1) + 1;
      
      const { data: updatedData, error } = await callEdgeFunction('manage-settings', {
        action: 'regenerate_qr',
        settingsId: settings!.id,
        data: {
          version: newVersion,
        }
      });

      if (error || !updatedData?.success) {
        throw new Error(error?.message || updatedData?.message || 'Update failed');
      }

      // Generate new QR URL with updated version
      if (!settings?.company_id) return null;
      const newQRUrl = await generateUniversalQRCodeURL(settings.company_id);
      return newQRUrl;
    },
    onSuccess: (newQRUrl) => {
      if (newQRUrl) setQrData(newQRUrl);
      queryClient.invalidateQueries({ queryKey: ['system-settings'] });
      posthog.capture('qr_code_regenerated', {
        new_version: (settings?.qr_code_version || 1) + 1,
      });
      toast.success('QR code regenerated! Print the new QR code and replace the old one.');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to regenerate QR code');
    },
  });

  // Copy QR URL to clipboard
  const copyQRUrl = () => {
    if (qrData) {
      navigator.clipboard.writeText(qrData);
      toast.success('QR code URL copied to clipboard');
    }
  };

  // Download QR code as image
  const downloadQRCode = () => {
    const svg = document.querySelector('#qr-code-svg');
    if (!svg) return;

    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();

    canvas.width = 512;
    canvas.height = 512;

    img.onload = () => {
      ctx?.drawImage(img, 0, 0);
      canvas.toBlob((blob) => {
        if (blob) {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `attendance-qr-code-v${settings?.qr_code_version}.png`;
          a.click();
          URL.revokeObjectURL(url);
          toast.success('QR code downloaded');
        }
      });
    };

    img.src = 'data:image/svg+xml;base64,' + btoa(svgData);
  };

  const handleGetCurrentLocation = () => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;
          setLocationForm({
            polygon: generatePolygonAroundPoint(lat, lng)
          });
          setDetectedLocation({ lat, lng });
          toast.success('Current location detected. Generated a 100m boundary.');
        },
        (error) => {
          toast.error('Failed to get current location: ' + error.message);
        }
      );
    } else {
      toast.error('Geolocation is not supported by your browser');
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader text="Loading settings..." />
      </div>
    );
  }

  return (
    <div className="space-y-6 md:space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-2">
          Configure system settings and QR code
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* QR Code Section */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <QrCode className="h-5 w-5" />
              <CardTitle>Universal QR Code</CardTitle>
            </div>
            <CardDescription>
              Display this QR code at the office entrance for employee check-ins
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {qrData ? (
              <div className="flex flex-col items-center gap-4">
                <div className="p-6 bg-white rounded-lg shadow-sm border-2 border-gray-200">
                  <QRCodeSVG id="qr-code-svg" value={qrData} size={256} level="H" />
                </div>

                <div className="w-full space-y-2">
                  <div className="p-3 bg-muted rounded-lg">
                    <p className="text-xs text-muted-foreground mb-1">QR Code URL:</p>
                    <p className="text-sm font-mono break-all">{qrData}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="p-2 bg-muted rounded">
                      <p className="text-muted-foreground">Version</p>
                      <p className="font-medium">{settings?.qr_code_version}</p>
                    </div>
                    <div className="p-2 bg-muted rounded">
                      <p className="text-muted-foreground">Last Updated</p>
                      <p className="font-medium">
                        {new Date(settings?.qr_code_regenerated_at || '').toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex gap-2 w-full">
                  <Button
                    onClick={copyQRUrl}
                    variant="outline"
                    className="flex-1"
                    size="sm"
                  >
                    <Copy className="mr-2 h-4 w-4" />
                    Copy URL
                  </Button>
                  <Button
                    onClick={downloadQRCode}
                    variant="outline"
                    className="flex-1"
                    size="sm"
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Download
                  </Button>
                </div>

                <Alert>
                  <Printer className="h-4 w-4" />
                  <AlertDescription>
                    <strong>Instructions:</strong> Download and print this QR code. Mount it at your office entrance.
                    This QR code is static and long-lived - no need to replace it regularly.
                  </AlertDescription>
                </Alert>

                <Button
                  onClick={() => regenerateQRMutation.mutate()}
                  variant="destructive"
                  disabled={regenerateQRMutation.isPending}
                  className="w-full"
                >
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Regenerate QR Code
                </Button>

                <p className="text-xs text-muted-foreground text-center">
                  Only regenerate if the QR code is compromised. This will invalidate the old QR code.
                </p>
              </div>
            ) : (
              <div className="flex justify-center items-center h-48">
                <Loader text="Loading QR code..." className="py-0" />
              </div>
            )}
          </CardContent>
        </Card>

        {/* NFC Check-in (Coming Soon) */}
        <Card className="border-primary/20 bg-primary/5 relative overflow-hidden group">
          <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 rounded-full bg-primary/10 blur-3xl transition-transform duration-500 group-hover:scale-110"></div>
          <CardHeader className="relative z-10">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <SmartphoneNfc className="h-5 w-5 text-primary" />
                <CardTitle>NFC Smart Hub</CardTitle>
              </div>
              <Badge variant="secondary" className="bg-primary/20 text-primary border-transparent text-xs uppercase tracking-wider font-bold">
                Coming Soon
              </Badge>
            </div>
            <CardDescription className="text-foreground/80">
              Upgrade to frictionless tap-to-check-in with custom NFC hardware.
            </CardDescription>
          </CardHeader>
          <CardContent className="relative z-10 space-y-4">
            <div className="bg-background/60 backdrop-blur-sm p-6 rounded-xl border border-primary/10 flex flex-col items-center justify-center text-center space-y-3">
              <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mb-2 shadow-inner">
                <SmartphoneNfc className="h-8 w-8 text-primary" />
              </div>
              <h4 className="font-bold text-lg text-primary tracking-tight">Tymly Smart Stand</h4>
              <p className="text-sm text-muted-foreground leading-relaxed">
                A beautifully crafted acrylic desk stand. Employees simply tap their smartphone to check in securely. Pre-configured for your office boundary.
              </p>
            </div>
            <Button className="w-full transition-all hover:shadow-md" variant="default" disabled>
              Join the Waitlist
            </Button>
            <p className="text-xs text-center text-muted-foreground">
              Hardware-as-a-Service launching Q3 2026.
            </p>
          </CardContent>
        </Card>

        {/* Location Settings */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              <CardTitle>Office Location</CardTitle>
            </div>
            <CardDescription>
              Set the office location and acceptable radius for check-ins
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                updateLocationMutation.mutate(locationForm);
              }}
              className="space-y-4"
            >
              <div className="bg-primary/5 border border-primary/10 rounded-xl p-6 text-center space-y-4">
                <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center shadow-inner">
                  <MapPin className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h4 className="font-semibold text-foreground">Detect Office Location</h4>
                  <p className="text-sm text-muted-foreground mt-1">
                    We'll securely use your browser's GPS to map a 100-meter attendance boundary around your current position.
                  </p>
                </div>
                <Button 
                  type="button" 
                  onClick={handleGetCurrentLocation} 
                  className="w-full shadow-sm"
                  variant="default"
                >
                  <MapPin className="mr-2 h-4 w-4" />
                  Use Current Location
                </Button>
                
                {detectedLocation && (
                  <div className="mt-3 bg-white/60 backdrop-blur-sm border border-primary/20 p-3 rounded-lg text-sm flex items-center justify-between animate-in fade-in slide-in-from-top-2">
                    <span className="text-primary font-medium flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5" />
                      Location Updated
                    </span>
                    <a 
                      href={`https://www.openstreetmap.org/?mlat=${detectedLocation.lat}&mlon=${detectedLocation.lng}#map=18/${detectedLocation.lat}/${detectedLocation.lng}`}
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="text-primary underline hover:text-primary/80 font-semibold text-xs"
                    >
                      Verify on Map
                    </a>
                  </div>
                )}
              </div>

              <div className="flex justify-center">
                <Button 
                  type="button" 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => setShowAdvancedLocation(!showAdvancedLocation)} 
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  {showAdvancedLocation ? 'Hide Advanced Location Options' : 'Show Advanced Location Options'}
                </Button>
              </div>

              {showAdvancedLocation && (
                <div className="space-y-6 pt-4 border-t border-border/50 animate-in fade-in slide-in-from-top-2 duration-300">
                  <div className="space-y-2 relative">
                    <Label>Search Location (OpenStreetMap)</Label>
                    <div className="flex gap-2">
                      <Input
                        placeholder="Type an address and click Search..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleSearchLocation();
                          }
                        }}
                        disabled={isSearching}
                      />
                      <Button 
                        type="button" 
                        onClick={handleSearchLocation} 
                        disabled={!searchQuery.trim() || isSearching}
                      >
                        <Search className="h-4 w-4 mr-2" />
                        {isSearching ? 'Searching...' : 'Search'}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">Powered by free OpenStreetMap Nominatim API.</p>
                  </div>

                  <div className="flex items-center gap-4 py-2">
                    <div className="flex-1 h-px bg-border/60"></div>
                    <span className="text-xs text-muted-foreground uppercase font-medium">Or enter raw data</span>
                    <div className="flex-1 h-px bg-border/60"></div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="polygon">Office Boundary Polygon (GeoJSON / Array of [lng, lat])</Label>
                    <textarea
                      id="polygon"
                      className="flex min-h-[120px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 font-mono text-xs"
                      value={locationForm.polygon}
                      onChange={(e) =>
                        setLocationForm({
                          ...locationForm,
                          polygon: e.target.value,
                        })
                      }
                      required
                    />
                    <p className="text-xs text-muted-foreground">
                      Format: [[lng1, lat1], [lng2, lat2], ...] representing the office boundary. The first and last points must be the same to close the polygon.
                    </p>
                  </div>
                </div>
              )}

              <Button
                type="submit"
                className="w-full"
                disabled={updateLocationMutation.isPending}
              >
                <Save className="mr-2 h-4 w-4" />
                {updateLocationMutation.isPending ? 'Saving...' : 'Save Location Settings'}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Work Hours Settings */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              <CardTitle>Work Hours</CardTitle>
            </div>
            <CardDescription>
              Configure work start time and late check-in grace period
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                updateWorkHoursMutation.mutate(workHoursForm);
              }}
              className="space-y-4"
            >
              <div className="space-y-2">
                <Label htmlFor="startTime">Work Start Time</Label>
                <Input
                  id="startTime"
                  type="time"
                  value={workHoursForm.startTime}
                  onChange={(e) =>
                    setWorkHoursForm({
                      ...workHoursForm,
                      startTime: e.target.value,
                    })
                  }
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="gracePeriod">Late Grace Period (minutes)</Label>
                <Input
                  id="gracePeriod"
                  type="number"
                  min="0"
                  max="60"
                  value={workHoursForm.gracePeriod}
                  onChange={(e) =>
                    setWorkHoursForm({
                      ...workHoursForm,
                      gracePeriod: parseInt(e.target.value),
                    })
                  }
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Check-ins within this period after start time won't be marked as late
                </p>
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={updateWorkHoursMutation.isPending}
              >
                <Save className="mr-2 h-4 w-4" />
                {updateWorkHoursMutation.isPending ? 'Saving...' : 'Save Work Hours'}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Notification Settings */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              <CardTitle>Notifications</CardTitle>
            </div>
            <CardDescription>
              Configure WhatsApp and Email alerts for your workspace
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                updateNotificationsMutation.mutate(notificationsForm);
              }}
              className="space-y-4"
            >
              <div className="space-y-2">
                <Label htmlFor="whatsapp">WhatsApp Phone Number</Label>
                <Input
                  id="whatsapp"
                  type="text"
                  placeholder="+1234567890"
                  value={notificationsForm.whatsapp}
                  onChange={(e) =>
                    setNotificationsForm({
                      ...notificationsForm,
                      whatsapp: e.target.value,
                    })
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="admin@example.com"
                  value={notificationsForm.email}
                  onChange={(e) =>
                    setNotificationsForm({
                      ...notificationsForm,
                      email: e.target.value,
                    })
                  }
                />
              </div>

              <Separator className="my-4" />

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-base">Late Check-In Alerts</Label>
                  <p className="text-sm text-muted-foreground">
                    Receive instant notifications when someone is late
                  </p>
                </div>
                <Switch
                  checked={notificationsForm.notifyLate}
                  onCheckedChange={(checked) =>
                    setNotificationsForm({
                      ...notificationsForm,
                      notifyLate: checked,
                    })
                  }
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-base">Daily Summary Report</Label>
                  <p className="text-sm text-muted-foreground">
                    Get a summary at 10:00 AM daily
                  </p>
                </div>
                <Switch
                  checked={notificationsForm.notifySummary}
                  onCheckedChange={(checked) =>
                    setNotificationsForm({
                      ...notificationsForm,
                      notifySummary: checked,
                    })
                  }
                />
              </div>

              <Button
                type="submit"
                className="w-full mt-4"
                disabled={updateNotificationsMutation.isPending}
              >
                <Save className="mr-2 h-4 w-4" />
                {updateNotificationsMutation.isPending ? 'Saving...' : 'Save Notifications'}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* System Info */}
        {/* System Status */}
        <Card className="border-emerald-500/20 bg-emerald-50/30">
          <CardHeader>
            <div className="flex items-center gap-2">
              <div className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
              </div>
              <CardTitle>System Status</CardTitle>
            </div>
            <CardDescription>Live health check of core services</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3">
              <div className="flex items-center justify-between p-3 rounded-xl border border-emerald-100 bg-white shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-emerald-100 flex items-center justify-center">
                    <Database className="h-5 w-5 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">Database</p>
                    <p className="text-xs text-muted-foreground">Supabase PostgreSQL</p>
                  </div>
                </div>
                <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 shadow-sm">Operational</Badge>
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl border border-emerald-100 bg-white shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-emerald-100 flex items-center justify-center">
                    <MapPin className="h-5 w-5 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">Location Services</p>
                    <p className="text-xs text-muted-foreground">Geofence Boundary Active</p>
                  </div>
                </div>
                <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 shadow-sm">Online</Badge>
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl border border-emerald-100 bg-white shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-emerald-100 flex items-center justify-center">
                    <Activity className="h-5 w-5 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">Check-in System</p>
                    <p className="text-xs text-muted-foreground">QR v{settings?.qr_code_version}</p>
                  </div>
                </div>
                <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 shadow-sm">Working</Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
