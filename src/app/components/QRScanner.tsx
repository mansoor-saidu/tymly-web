import { useEffect, useRef, useState } from 'react';
import { BrowserQRCodeReader, IScannerControls } from '@zxing/browser';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Camera, X, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

interface QRScannerProps {
  onScan: (result: string) => void;
  onClose: () => void;
}

export default function QRScanner({ onScan, onClose }: QRScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [controls, setControls] = useState<IScannerControls | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');

  useEffect(() => {
    let codeReader: BrowserQRCodeReader;
    
    const initScanner = async () => {
      try {
        // Request camera permission
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        setHasPermission(true);
        
        // We stop the initial stream immediately, we just needed it to trigger permissions
        stream.getTracks().forEach(track => track.stop());

        codeReader = new BrowserQRCodeReader();
        const videoInputDevices = await BrowserQRCodeReader.listVideoInputDevices();
        setDevices(videoInputDevices);
        
        // Find back camera if available, otherwise use default
        const backCamera = videoInputDevices.find(device => 
          device.label.toLowerCase().includes('back') || 
          device.label.toLowerCase().includes('environment')
        );
        
        const deviceId = backCamera?.deviceId || videoInputDevices[0]?.deviceId;
        setSelectedDeviceId(deviceId);

      } catch (err) {
        console.error('Camera permission denied or not available:', err);
        setHasPermission(false);
      }
    };

    initScanner();

    return () => {
      if (controls) {
        controls.stop();
      }
    };
  }, []);

  useEffect(() => {
    let currentControls: IScannerControls;

    const startScanning = async () => {
      if (!selectedDeviceId || !videoRef.current) return;
      
      try {
        const codeReader = new BrowserQRCodeReader();
        currentControls = await codeReader.decodeFromVideoDevice(
          selectedDeviceId,
          videoRef.current,
          (result, error, controls) => {
            if (result) {
              onScan(result.getText());
            }
          }
        );
        setControls(currentControls);
      } catch (err) {
        console.error('Error starting scanner:', err);
        toast.error('Could not start the camera scanner.');
      }
    };

    if (hasPermission && selectedDeviceId) {
      startScanning();
    }

    return () => {
      if (currentControls) {
        currentControls.stop();
      }
    };
  }, [selectedDeviceId, hasPermission, onScan]);

  const toggleCamera = () => {
    if (devices.length < 2) return;
    const currentIndex = devices.findIndex(d => d.deviceId === selectedDeviceId);
    const nextIndex = (currentIndex + 1) % devices.length;
    
    if (controls) {
      controls.stop();
    }
    setSelectedDeviceId(devices[nextIndex].deviceId);
  };

  return (
    <Card className="w-full max-w-md mx-auto shadow-xl overflow-hidden border-2 border-primary/20">
      <CardHeader className="bg-card border-b pb-4 relative">
        <div className="absolute top-2 right-2">
          <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8 rounded-full">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Camera className="h-5 w-5 text-primary" />
          Scan QR Code
        </CardTitle>
        <CardDescription>
          Point your camera at the office QR code
        </CardDescription>
      </CardHeader>
      
      <CardContent className="p-0 bg-black relative aspect-[4/3] flex items-center justify-center">
        {hasPermission === false && (
          <div className="text-center p-6 text-white space-y-3">
            <Camera className="h-10 w-10 mx-auto text-destructive" />
            <p>Camera access denied or not available.</p>
            <p className="text-sm text-gray-400">Please grant camera permissions in your browser settings to use this feature.</p>
          </div>
        )}
        
        {hasPermission === null && (
          <div className="text-center p-6 text-white">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
            <p>Requesting camera access...</p>
          </div>
        )}
        
        {hasPermission === true && (
          <>
            <video 
              ref={videoRef} 
              className="w-full h-full object-cover" 
              style={{ minHeight: '300px' }}
            />
            {/* Scanner target overlay */}
            <div className="absolute inset-0 pointer-events-none border-[40px] border-black/40">
              <div className="w-full h-full border-2 border-primary/70 relative">
                <div className="absolute top-0 left-0 w-4 h-4 border-t-4 border-l-4 border-primary -mt-1 -ml-1"></div>
                <div className="absolute top-0 right-0 w-4 h-4 border-t-4 border-r-4 border-primary -mt-1 -mr-1"></div>
                <div className="absolute bottom-0 left-0 w-4 h-4 border-b-4 border-l-4 border-primary -mb-1 -ml-1"></div>
                <div className="absolute bottom-0 right-0 w-4 h-4 border-b-4 border-r-4 border-primary -mb-1 -mr-1"></div>
              </div>
            </div>
            
            {devices.length > 1 && (
              <Button 
                variant="secondary" 
                size="icon" 
                className="absolute bottom-4 right-4 rounded-full shadow-lg bg-black/60 hover:bg-black/80 text-white border-none"
                onClick={toggleCamera}
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
