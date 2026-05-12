import * as LocalAuthentication from 'expo-local-authentication'
import * as SecureStore from 'expo-secure-store'

const KEYS = {
  enabled:  'difm_biometric_enabled',
  email:    'difm_biometric_email',
  password: 'difm_biometric_password',
  declined: 'difm_biometric_declined',
}

export async function isBiometricAvailable() {
  try {
    const hasHardware = await LocalAuthentication.hasHardwareAsync()
    if (!hasHardware) return false
    const isEnrolled = await LocalAuthentication.isEnrolledAsync()
    return isEnrolled
  } catch (e) {
    console.log('isBiometricAvailable error:', e)
    return false
  }
}

export async function getBiometricType() {
  try {
    const types = await LocalAuthentication.supportedAuthenticationTypesAsync()
    if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) return 'face'
    if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) return 'fingerprint'
    return 'biometric'
  } catch (e) {
    console.log('getBiometricType error:', e)
    return 'fingerprint'
  }
}

export async function saveCredentials(email, password) {
  try {
    await SecureStore.setItemAsync(KEYS.email, email)
    await SecureStore.setItemAsync(KEYS.password, password)
    await SecureStore.setItemAsync(KEYS.enabled, 'true')
    await SecureStore.deleteItemAsync(KEYS.declined)
    console.log('Biometric credentials saved for:', email)
  } catch (e) {
    console.log('saveCredentials error:', e)
  }
}

export async function getCredentials() {
  try {
    const enabled = await SecureStore.getItemAsync(KEYS.enabled)
    if (enabled !== 'true') return null
    const email    = await SecureStore.getItemAsync(KEYS.email)
    const password = await SecureStore.getItemAsync(KEYS.password)
    if (!email || !password) return null
    return { email, password }
  } catch (e) {
    console.log('getCredentials error:', e)
    return null
  }
}

export async function clearCredentials() {
  try {
    await SecureStore.deleteItemAsync(KEYS.email)
    await SecureStore.deleteItemAsync(KEYS.password)
    await SecureStore.deleteItemAsync(KEYS.enabled)
    console.log('Biometric credentials cleared')
  } catch (e) {
    console.log('clearCredentials error:', e)
  }
}

export async function authenticate(promptMessage) {
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: promptMessage || 'Authenticate to sign in',
      fallbackLabel: 'Use password',
      disableDeviceFallback: false,
    })
    return result.success
  } catch (e) {
    console.log('authenticate error:', e)
    return false
  }
}

export async function hasDeclined() {
  try {
    const val = await SecureStore.getItemAsync(KEYS.declined)
    return val === 'true'
  } catch {
    return false
  }
}

export async function setDeclined() {
  try {
    await SecureStore.setItemAsync(KEYS.declined, 'true')
  } catch (e) {
    console.log('setDeclined error:', e)
  }
}
