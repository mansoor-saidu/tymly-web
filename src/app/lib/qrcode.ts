import { callEdgeFunction } from './supabase';

// Generate a universal QR code URL for printing
// This generates a static URL with a long-lived token
export async function generateUniversalQRCodeURL(companyId: string): Promise<string | null> {
  try {
    const { data, error } = await callEdgeFunction('generate-qr-url', { companyId });

    if (error || !data?.url) {
      console.error('Failed to generate QR code URL:', error);
      return null;
    }

    return data.url;
  } catch (error) {
    console.error('QR code URL generation error:', error);
    return null;
  }
}

// Extract and verify QR token from URL parameters
export function extractQRToken(): {
  token: string | null;
  version: string | null;
  hasToken: boolean;
} {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('qr_token');
  const version = params.get('v');
  const companyId = params.get('c');

  return {
    token,
    version,
    companyId,
    hasToken: token !== null,
  };
}

// Verify a QR token from URL
export async function verifyQRToken(token: string, version: string, companyId: string): Promise<{
  valid: boolean;
  message?: string;
}> {
  try {
    const { data, error } = await callEdgeFunction('verify-qr-token', {
      token,
      version,
      companyId,
    });

    if (error) {
      return { valid: false, message: 'Failed to verify QR token' };
    }

    return {
      valid: data.valid,
      message: data.message,
    };
  } catch (error) {
    console.error('QR token verification error:', error);
    return { valid: false, message: 'An error occurred during verification' };
  }
}

// Get the base URL for the application
export function getBaseURL(): string {
  // In production, this will be the actual domain
  // In development, it will be localhost
  return window.location.origin;
}
