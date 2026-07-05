import { arrayBufferToBase64, base64ToArrayBuffer, stringToUint8Array } from './utils';
import { callEdgeFunction } from './supabase';
import type { GeolocationPosition } from '../types/api';

// Check if WebAuthn is supported
export function isWebAuthnSupported(): boolean {
  return !!(
    window.PublicKeyCredential &&
    navigator.credentials &&
    navigator.credentials.create
  );
}

// Check if platform authenticator is available (Touch ID, Face ID, Windows Hello, etc.)
export async function isPlatformAuthenticatorAvailable(): Promise<boolean> {
  if (!isWebAuthnSupported()) return false;

  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

// Register a new WebAuthn credential for an employee
export async function registerWebAuthnCredential(
  employeeId: string,
  employeeName: string,
  employeeEmail: string
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!isWebAuthnSupported()) {
      return { success: false, error: 'WebAuthn is not supported on this device' };
    }

    const available = await isPlatformAuthenticatorAvailable();
    if (!available) {
      return {
        success: false,
        error: 'No biometric authenticator available on this device',
      };
    }

    // Get challenge from server
    const { data: challengeData, error: challengeError } = await callEdgeFunction(
      'create-webauthn-challenge',
      { employeeId }
    );

    if (challengeError || !challengeData?.challenge) {
      return { success: false, error: 'Failed to get authentication challenge' };
    }

    // Create credential options
    const publicKeyCredentialCreationOptions: PublicKeyCredentialCreationOptions = {
      challenge: stringToUint8Array(challengeData.challenge),
      rp: {
        name: 'Attendance Tracker',
        id: window.location.hostname,
      },
      user: {
        id: stringToUint8Array(employeeId),
        name: employeeEmail,
        displayName: employeeName,
      },
      pubKeyCredParams: [
        { alg: -7, type: 'public-key' }, // ES256
        { alg: -257, type: 'public-key' }, // RS256
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        requireResidentKey: false,
        userVerification: 'required',
      },
      timeout: 60000,
      attestation: 'none',
    };

    // Create credential
    const credential = (await navigator.credentials.create({
      publicKey: publicKeyCredentialCreationOptions,
    })) as PublicKeyCredential;

    if (!credential) {
      return { success: false, error: 'Failed to create credential' };
    }

    const response = credential.response as AuthenticatorAttestationResponse;

    // Get public key from response
    const publicKey = response.getPublicKey();
    if (!publicKey) {
      return { success: false, error: 'Failed to extract public key' };
    }

    // Store credential on server
    const { data: storeData, error: storeError } = await callEdgeFunction(
      'store-webauthn-credential',
      {
        employeeId,
        credentialId: arrayBufferToBase64(credential.rawId),
        publicKey: arrayBufferToBase64(publicKey),
        transports: response.getTransports?.() || [],
      }
    );

    if (storeError || !storeData?.success) {
      return { success: false, error: 'Failed to store credential' };
    }

    return { success: true };
  } catch (error: any) {
    console.error('WebAuthn registration error:', error);
    return {
      success: false,
      error: error.message || 'Biometric registration failed',
    };
  }
}

// Authenticate using WebAuthn for check-in
export async function authenticateWebAuthn(
  employeeId: string,
  position: GeolocationPosition
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    if (!isWebAuthnSupported()) {
      return { success: false, error: 'WebAuthn is not supported on this device' };
    }

    // Get challenge from server
    const { data: challengeData, error: challengeError } = await callEdgeFunction(
      'create-webauthn-challenge',
      { employeeId }
    );

    if (challengeError || !challengeData?.challenge) {
      return { success: false, error: 'Failed to get authentication challenge' };
    }

    // Get employee's credentials (we'll use all registered credentials)
    // In a real app, you might want to fetch this from the server
    const publicKeyCredentialRequestOptions: PublicKeyCredentialRequestOptions = {
      challenge: stringToUint8Array(challengeData.challenge),
      userVerification: 'required',
      timeout: 60000,
    };

    // Request authentication
    const assertion = (await navigator.credentials.get({
      publicKey: publicKeyCredentialRequestOptions,
    })) as PublicKeyCredential;

    if (!assertion) {
      return { success: false, error: 'Authentication cancelled' };
    }

    const response = assertion.response as AuthenticatorAssertionResponse;

    // Send assertion to server for verification and attendance logging
    const { data: logData, error: logError } = await callEdgeFunction(
      'log-attendance',
      {
        employeeId,
        credentialId: arrayBufferToBase64(assertion.rawId),
        signature: arrayBufferToBase64(response.signature),
        authenticatorData: arrayBufferToBase64(response.authenticatorData),
        clientDataJSON: arrayBufferToBase64(response.clientDataJSON),
        latitude: position.latitude,
        longitude: position.longitude,
        userAgent: navigator.userAgent,
      }
    );

    if (logError || !logData?.success) {
      return {
        success: false,
        error: logData?.error || 'Failed to log attendance',
      };
    }

    return { success: true, data: logData };
  } catch (error: any) {
    console.error('WebAuthn authentication error:', error);

    // Handle specific error cases
    if (error.name === 'NotAllowedError') {
      return { success: false, error: 'Authentication was cancelled or timed out' };
    }

    return {
      success: false,
      error: error.message || 'Biometric authentication failed',
    };
  }
}

// Get user-friendly error message
export function getWebAuthnErrorMessage(error: any): string {
  if (error.name === 'NotAllowedError') {
    return 'Authentication was cancelled or timed out. Please try again.';
  }
  if (error.name === 'SecurityError') {
    return 'Security error. Please ensure you are on a secure (HTTPS) connection.';
  }
  if (error.name === 'NotSupportedError') {
    return 'Your device does not support biometric authentication.';
  }
  return error.message || 'An unknown error occurred during authentication.';
}
