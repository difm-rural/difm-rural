import React, { useEffect, useRef, useState } from 'react'
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  authenticate,
  clearCredentials,
  getBiometricType,
  getCredentials,
  hasDeclined,
  isBiometricAvailable,
  saveCredentials,
  setDeclined,
} from '../lib/biometrics'
import { supabase } from '../lib/supabase'
import { colors } from '../theme/tokens'

const BIOMETRICS_ENABLED = false

export default function LoginScreen({ navigation }) {
  const insets = useSafeAreaInsets()
  const [email, setEmail]         = useState('')
  const [password, setPassword]   = useState('')
  const [loading, setLoading]     = useState(false)
  const [biometricReady, setBiometricReady] = useState(false)
  const [biometricType, setBiometricType]   = useState('fingerprint')

  const passwordRef = useRef(null)

  useEffect(() => {
    if (!BIOMETRICS_ENABLED) return
    async function setup() {
      const available = await isBiometricAvailable()
      console.log('isBiometricAvailable:', available)
      const credentials = await getCredentials()
      console.log('getCredentials:', !!credentials)
      if (available && credentials) {
        setBiometricReady(true)
        const type = await getBiometricType()
        setBiometricType(type)
        console.log('biometricType:', type)
      }
    }
    setup()
  }, [])

  async function handleBiometricLogin() {
    const label = biometricType === 'face' ? 'Face ID' : 'fingerprint'
    const success = await authenticate(`Sign in with ${label}`)
    if (!success) return

    const creds = await getCredentials()
    if (!creds) return

    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({
      email: creds.email,
      password: creds.password,
    })
    if (error) {
      await clearCredentials()
      setBiometricReady(false)
      Alert.alert('Sign in failed', 'Your saved credentials are outdated. Please sign in with your password.')
    }
    setLoading(false)
  }

  async function handleLogin() {
    if (!email || !password) {
      Alert.alert('Missing fields', 'Please enter your email and password.')
      return
    }
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      Alert.alert('Login Failed', error.message)
      setLoading(false)
      return
    }
    if (BIOMETRICS_ENABLED) await maybePromptBiometricSetup(email, password)
    setLoading(false)
  }

  async function maybePromptBiometricSetup(confirmedEmail, confirmedPassword) {
    const available = await isBiometricAvailable()
    if (!available) return

    const existing = await getCredentials()
    if (existing) return

    const declined = await hasDeclined()
    if (declined) return

    const type = await getBiometricType()
    const label = type === 'face' ? 'Face ID' : 'fingerprint'
    Alert.alert(
      'Enable biometric login?',
      `Sign in faster next time using ${label}.`,
      [
        {
          text: 'Not now',
          onPress: () => setDeclined(),
        },
        {
          text: 'Enable',
          onPress: async () => {
            await saveCredentials(confirmedEmail, confirmedPassword)
            setBiometricReady(true)
            setBiometricType(type)
          },
        },
      ]
    )
  }

  const biometricLabel = biometricType === 'face' ? 'Face ID' : 'fingerprint'
  const biometricIcon  = biometricType === 'face' ? '🔐' : '👆'

  return (
    <View style={styles.screen}>
      <View style={[styles.topBar, { paddingTop: insets.top }]}>
        <View style={styles.topBarInner}>
          <Text style={styles.wordmark}>DIFM Rural</Text>
          <Text style={styles.tagline}>GET JOBS DONE</Text>
        </View>
      </View>
      <View style={[styles.formArea, { paddingBottom: insets.bottom + 16 }]}>
      <Text style={styles.title} accessibilityRole="header">Welcome back</Text>
      <Text style={styles.subtitle}>Get rural jobs done</Text>

      <TextInput
        style={styles.input}
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        returnKeyType="next"
        blurOnSubmit={false}
        onSubmitEditing={() => passwordRef.current?.focus()}
        accessibilityLabel="Email address"
      />
      <TextInput
        ref={passwordRef}
        style={styles.input}
        placeholder="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="done"
        onSubmitEditing={handleLogin}
        accessibilityLabel="Password"
      />

      <TouchableOpacity
        style={styles.forgotBtn}
        onPress={() => navigation?.navigate('ForgotPassword')}
        accessibilityRole="button"
        accessibilityLabel="Forgot password">
        <Text style={styles.forgotText}>Forgot password?</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.button}
        onPress={handleLogin}
        disabled={loading}
        accessibilityRole="button"
        accessibilityLabel="Log in"
        accessibilityHint="Double tap to sign in to your account">
        <Text style={styles.buttonText}>{loading ? 'Logging in...' : 'Log In'}</Text>
      </TouchableOpacity>

      {biometricReady && (
        <TouchableOpacity
          style={styles.biometricButton}
          onPress={handleBiometricLogin}
          disabled={loading}
          accessibilityRole="button"
          accessibilityLabel={`Sign in with ${biometricLabel}`}
          accessibilityHint={`Double tap to sign in using ${biometricLabel}`}>
          <Text style={styles.biometricIcon}>{biometricIcon}</Text>
          <Text style={styles.biometricText}>Sign in with {biometricLabel}</Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity
        style={styles.linkBtn}
        onPress={() => navigation?.navigate('Register')}
        accessibilityRole="button"
        accessibilityLabel="Create a new account">
        <Text style={styles.link}>Don't have an account? Register</Text>
      </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  screen:      { flex: 1, backgroundColor: colors.background },
  topBar:      { backgroundColor: '#2d6a4f' },
  topBarInner: { height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20 },
  wordmark:    { color: '#ffffff', fontSize: 16, fontWeight: '500', letterSpacing: 1 },
  tagline:     { color: '#95d5b2', fontSize: 9, letterSpacing: 3, textTransform: 'uppercase' },
  formArea:    { flex: 1, justifyContent: 'center', padding: 24 },
  title:    { fontSize: 34, lineHeight: 38, fontWeight: '700', color: colors.textPrimary, textAlign: 'center', marginBottom: 4 },
  subtitle: { fontSize: 16, color: colors.textSecondary, textAlign: 'center', marginBottom: 32, lineHeight: 24 },

  input: {
    backgroundColor: colors.white,
    borderRadius: 8,
    padding: 14,
    marginBottom: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 52,
  },

  button: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
    minHeight: 52,
    justifyContent: 'center',
  },
  buttonText: { color: colors.white, fontSize: 16, fontWeight: '700' },

  biometricButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    paddingVertical: 16,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
    gap: 10,
    minHeight: 52,
  },
  biometricIcon: { fontSize: 22 },
  biometricText: { fontSize: 15, fontWeight: '700', color: colors.primary },

  forgotBtn:  { alignSelf: 'flex-end', paddingVertical: 6, marginBottom: 4 },
  forgotText: { color: colors.textMuted, fontSize: 14 },

  linkBtn: { minHeight: 44, justifyContent: 'center', alignItems: 'center', marginTop: 12 },
  link:    { color: colors.primary, textAlign: 'center', fontSize: 15 },
})
