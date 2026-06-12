import * as LocalAuthentication from 'expo-local-authentication'
import * as SecureStore from 'expo-secure-store'

const KEYS = {
  enabled:      'difm_biometric_enabled',
  accessToken:  'difm_access_token',
  refreshToken: 'difm_refresh_token',
}

export async function isBiometricAvailable() {
  try {
    const hasHardware = await LocalAuthentication.hasHardwareAsync()
    if (!hasHardware) return false
    return await LocalAuthentication.isEnrolledAsync()
  } catch {
    return false
  }
}

export async function getBiometricType() {
  try {
    const types = await LocalAuthentication.supportedAuthenticationTypesAsync()
    if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) return 'face'
    if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) return 'fingerprint'
    return 'fingerprint'
  } catch {
    return 'fingerprint'
  }
}

export async function authenticate() {
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage:         'Sign in to DIFM Rural',
      fallbackLabel:         'Use email code instead',
      cancelLabel:           'Cancel',
      disableDeviceFallback: false, // allows PIN/pattern as fallback on Android
    })
    return result.success
  } catch {
    return false
  }
}

export async function saveSession(accessToken, refreshToken) {
  try {
    await SecureStore.setItemAsync(KEYS.accessToken,  accessToken)
    await SecureStore.setItemAsync(KEYS.refreshToken, refreshToken)
    await SecureStore.setItemAsync(KEYS.enabled,      'true')
  } catch (e) {
    console.warn('biometrics saveSession error:', e)
  }
}

export async function getSavedSession() {
  try {
    const enabled = await SecureStore.getItemAsync(KEYS.enabled)
    if (enabled !== 'true') return null
    const accessToken  = await SecureStore.getItemAsync(KEYS.accessToken)
    const refreshToken = await SecureStore.getItemAsync(KEYS.refreshToken)
    if (!accessToken || !refreshToken) return null
    return { accessToken, refreshToken }
  } catch {
    return null
  }
}

// Clears only the stored tokens but keeps the enabled flag.
// Use this on sign-out so the preference survives — tokens are refreshed
// silently on the next OTP login.
export async function clearSessionTokens() {
  try {
    await SecureStore.deleteItemAsync(KEYS.accessToken)
    await SecureStore.deleteItemAsync(KEYS.refreshToken)
  } catch (e) {
    console.warn('biometrics clearSessionTokens error:', e)
  }
}

// Clears everything including the enabled flag.
// Use this when the user explicitly disables biometric login in Account settings.
export async function clearSession() {
  try {
    await SecureStore.deleteItemAsync(KEYS.enabled)
    await SecureStore.deleteItemAsync(KEYS.accessToken)
    await SecureStore.deleteItemAsync(KEYS.refreshToken)
  } catch (e) {
    console.warn('biometrics clearSession error:', e)
  }
}

export async function isBiometricEnabled() {
  try {
    const val = await SecureStore.getItemAsync(KEYS.enabled)
    return val === 'true'
  } catch {
    return false
  }
}
