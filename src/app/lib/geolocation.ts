import type { GeolocationPosition } from '../types/api';

// Fallback to IP-based geolocation if browser APIs are completely blocked/unavailable
async function getIPPosition(): Promise<GeolocationPosition> {
  try {
    const response = await fetch('https://ipapi.co/json/');
    if (!response.ok) {
      throw new Error('IP API response error');
    }
    const data = await response.json();
    if (typeof data.latitude === 'number' && typeof data.longitude === 'number') {
      return {
        latitude: data.latitude,
        longitude: data.longitude,
        accuracy: 10000, // IP geolocation is approximate (10km accuracy)
      };
    }
    throw new Error('Invalid IP location data structure');
  } catch (error) {
    // Secondary IP location service fallback
    const fallbackResponse = await fetch('https://ip-api.com/json/');
    const fallbackData = await fallbackResponse.json();
    if (fallbackData && fallbackData.status === 'success') {
      return {
        latitude: fallbackData.lat,
        longitude: fallbackData.lon,
        accuracy: 10000,
      };
    }
    throw error;
  }
}

// Get current geolocation position with high accuracy (and fallback to low accuracy + IP geolocation)
export async function getCurrentPosition(): Promise<GeolocationPosition> {
  if (!navigator.geolocation) {
    try {
      return await getIPPosition();
    } catch {
      throw new Error('Geolocation is not supported and IP fallback failed');
    }
  }

  const getPosition = (highAccuracy: boolean): Promise<GeolocationPosition> => {
    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
          });
        },
        (error) => reject(error),
        {
          enableHighAccuracy: highAccuracy,
          timeout: highAccuracy ? 5000 : 10000,
          maximumAge: 0,
        }
      );
    });
  };

  try {
    // Attempt with high accuracy first
    return await getPosition(true);
  } catch (error: any) {
    // If high accuracy fails, retry with standard accuracy
    if (error.code === error.POSITION_UNAVAILABLE || error.code === error.TIMEOUT) {
      try {
        return await getPosition(false);
      } catch (fallbackError: any) {
        // If browser API completely fails, attempt IP geolocation
        try {
          return await getIPPosition();
        } catch {
          let message = 'Failed to get your location';
          if (fallbackError.code === fallbackError.PERMISSION_DENIED) {
            message = 'Location permission denied. Please enable location access in your browser settings.';
          } else if (fallbackError.code === fallbackError.POSITION_UNAVAILABLE) {
            message = 'Location information is unavailable. Please try again.';
          } else if (fallbackError.code === fallbackError.TIMEOUT) {
            message = 'Location request timed out. Please try again.';
          }
          throw new Error(message);
        }
      }
    }
    
    // If permission was denied directly, attempt IP fallback before giving up
    if (error.code === error.PERMISSION_DENIED) {
      try {
        return await getIPPosition();
      } catch {
        throw new Error('Location permission denied. Please enable location access in your browser settings.');
      }
    }
    throw new Error('Failed to retrieve location');
  }
}

// Calculate distance between two coordinates using Haversine formula
export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000; // Earth radius in meters
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // Distance in meters
}

// Helper function to convert degrees to radians
function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

// Check if geolocation is supported
export function isGeolocationSupported(): boolean {
  return 'geolocation' in navigator;
}

// Format distance for display
export function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${Math.round(meters)}m`;
  }
  return `${(meters / 1000).toFixed(1)}km`;
}
