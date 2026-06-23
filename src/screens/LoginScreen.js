import React, { useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '../lib/supabase'
import { colors } from '../theme/tokens'
import {
  authenticate,
  clearSessionTokens,
  enableBiometric,
  getBiometricType,
  getSavedSession,
  isBiometricAvailable,
  isBiometricEnabled,
  saveSession,
  saveSessionTokens,
} from '../lib/biometrics'

function getBiometricLabel(type) {
  if (type === 'face') return 'Face ID'
  return 'Fingerprint or PIN'
}

export default function LoginScreen({ navigation }) {
  const insets = useSafeAreaInsets()
  const [stage, setStage] = useState('email') // 'email' | 'verify'
  const [email, setEmail] = useState('')
  const [code, setCode] = useState(['', '', '', '', '', ''])
  const [loading, setLoading] = useState(false)
  const [focused, setFocused] = useState(null)
  const [biometricReady, setBiometricReady] = useState(false)
  const [biometricType,  setBiometricType]  = useState('fingerprint')

  const inputRefs = useRef([...Array(6)].map(() => React.createRef()))

  // Re-check on every focus so the button appears immediately after enabling
  // and disappears after sign-out clears the stored tokens.
  useFocusEffect(
    React.useCallback(() => {
      async function checkBiometric() {
        const available = await isBiometricAvailable()
        const session   = await getSavedSession() // null if tokens cleared by sign-out
        if (available && session) {
          setBiometricReady(true)
          const type = await getBiometricType()
          setBiometricType(type)
        } else {
          setBiometricReady(false)
        }
      }
      checkBiometric()
    }, [])
  )

  // ─── Biometric login ──────────────────────────────────────────────────────────

  async function handleBiometricLogin() {
    try {
      const success = await authenticate()
      if (!success) return

      const session = await getSavedSession()
      if (!session) {
        // Tokens were cleared (e.g. sign-out) but enabled flag persists.
        // Next OTP login will silently restore them.
        setBiometricReady(false)
        Alert.alert('Please sign in with your email', 'Your session has expired.')
        return
      }

      const { error } = await supabase.auth.setSession({
        access_token:  session.accessToken,
        refresh_token: session.refreshToken,
      })

      if (error) {
        // Tokens invalid — clear them but keep enabled flag so next OTP login
        // silently refreshes and biometric works again on the login after that.
        await clearSessionTokens()
        setBiometricReady(false)
        Alert.alert('Session expired', 'Please sign in with your email code.')
      }
      // On success AppNavigator handles redirect via onAuthStateChange
    } catch (e) {
      Alert.alert('Error', e.message)
    }
  }

  // ─── OTP flow ─────────────────────────────────────────────────────────────────

  async function handleSendCode() {
    const trimmed = email.trim().toLowerCase()
    if (!trimmed) {
      Alert.alert('Email required', 'Please enter your email address.')
      return
    }
    setLoading(true)
    const { error } = await supabase.auth.signInWithOtp({
      email:   trimmed,
      options: { shouldCreateUser: true },
    })
    if (error) {
      Alert.alert('Error', error.message)
    } else {
      setStage('verify')
    }
    setLoading(false)
  }

  function handleDigitChange(index, value) {
    const newCode = [...code]
    if (value.length > 1) {
      const digits = value.replace(/\D/g, '').split('')
      digits.forEach((d, i) => {
        if (index + i < 6) newCode[index + i] = d
      })
      setCode(newCode)
      const lastFilled = Math.min(index + digits.length - 1, 5)
      inputRefs.current[lastFilled]?.current?.focus()
      if (index + digits.length >= 6) verifyCode(newCode.join(''))
      return
    }
    newCode[index] = value
    setCode(newCode)
    if (value && index < 5) inputRefs.current[index + 1]?.current?.focus()
    if (newCode.every(d => d !== '')) verifyCode(newCode.join(''))
  }

  function handleDigitKeyPress(index, key) {
    if (key === 'Backspace' && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.current?.focus()
    }
  }

  async function verifyCode(codeString) {
    setLoading(true)
    const { data, error } = await supabase.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token: codeString,
      type:  'email',
    })

    if (error) {
      Alert.alert('Invalid code', 'The code is incorrect or has expired. Please try again.')
      setCode(['', '', '', '', '', ''])
      inputRefs.current[0]?.current?.focus()
      setLoading(false)
      return
    }

    // Handle biometric token storage after successful OTP
    if (data?.session) {
      const available = await isBiometricAvailable()
      if (available) {
        const alreadyEnabled = await isBiometricEnabled()

        if (alreadyEnabled) {
          // Silently refresh stored tokens — biometric button will work on next cold start
          await saveSession(data.session.access_token, data.session.refresh_token)
        } else {
          // Store tokens but DON'T enable yet (before the Alert, to avoid a race
          // with navigation). Biometric only turns on if the user taps "Enable",
          // so killing the app at the prompt leaves it off.
          await saveSessionTokens(data.session.access_token, data.session.refresh_token)
          setTimeout(() => {
            Alert.alert(
              'Sign in faster next time',
              'Use fingerprint, Face ID or your device PIN instead of an email code next time?',
              [
                {
                  text: 'Enable',
                  onPress: async () => {
                    await enableBiometric()
                    const type = await getBiometricType()
                    setBiometricReady(true)
                    setBiometricType(type)
                  },
                },
                {
                  text: 'Not now',
                  style: 'cancel',
                  onPress: async () => {
                    await clearSessionTokens() // declined — remove the stored tokens
                  },
                },
              ]
            )
          }, 500)
        }
      }
    }

    // AppNavigator handles redirect via onAuthStateChange
    setLoading(false)
  }

  async function resendCode() {
    await supabase.auth.signInWithOtp({
      email:   email.trim().toLowerCase(),
      options: { shouldCreateUser: true },
    })
    Alert.alert('Code sent', 'A new code has been sent to your email.')
    setCode(['', '', '', '', '', ''])
    inputRefs.current[0]?.current?.focus()
  }

  // ─── Verify stage ─────────────────────────────────────────────────────────────

  if (stage === 'verify') {
    return (
      <KeyboardAvoidingView
        style={styles.screen}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={[styles.topBar, { paddingTop: insets.top }]}>
          <View style={styles.topBarInner}>
            <TouchableOpacity
              onPress={() => { setStage('email'); setCode(['', '', '', '', '', '']) }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel="Back to email entry">
              <Text style={styles.backArrow}>←</Text>
            </TouchableOpacity>
            <Text style={styles.wordmark}>RURAL CONNECTIONS</Text>
            <View style={{ width: 32 }} />
          </View>
        </View>

        <ScrollView
          contentContainerStyle={[styles.formArea, { paddingBottom: insets.bottom + 24 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>

          <Text style={styles.title} accessibilityRole="header">Check your email</Text>
          <Text style={styles.subtitle}>
            We sent a 6-digit code to{'\n'}
            <Text style={styles.emailHighlight}>{email.trim().toLowerCase()}</Text>
          </Text>

          <View style={styles.digitContainer}>
            {code.map((digit, index) => (
              <TextInput
                key={index}
                ref={inputRefs.current[index]}
                style={[
                  styles.digitBox,
                  digit && styles.digitBoxFilled,
                  focused === index && styles.digitBoxFocused,
                ]}
                value={digit}
                onChangeText={value => handleDigitChange(index, value)}
                onKeyPress={({ nativeEvent }) => handleDigitKeyPress(index, nativeEvent.key)}
                onFocus={() => setFocused(index)}
                onBlur={() => setFocused(null)}
                keyboardType="number-pad"
                maxLength={6}
                textAlign="center"
                accessibilityLabel={`Digit ${index + 1}`}
                editable={!loading}
              />
            ))}
          </View>

          {loading && (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={styles.loadingText}>Verifying...</Text>
            </View>
          )}

          <TouchableOpacity
            style={styles.resendBtn}
            onPress={resendCode}
            disabled={loading}
            accessibilityRole="button"
            accessibilityLabel="Resend sign in code">
            <Text style={styles.resendText}>Didn't get it? Resend code</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    )
  }

  // ─── Email stage ──────────────────────────────────────────────────────────────

  const biometricLabel = getBiometricLabel(biometricType)
  const biometricIcon  = biometricType === 'face' ? '👤' : '👆'

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={[styles.topBar, { paddingTop: insets.top }]}>
        <View style={styles.topBarInner}>
          <Text style={styles.wordmark}>RURAL CONNECTIONS</Text>
          <Text style={styles.tagline}>GET JOBS DONE</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[styles.formArea, { paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>

        <Text style={styles.title} accessibilityRole="header">Sign in</Text>
        <Text style={styles.subtitle}>
          Enter your email to receive a sign in code
        </Text>

        <TextInput
          style={styles.input}
          placeholder="you@example.com"
          placeholderTextColor={colors.textMuted}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          returnKeyType="done"
          onSubmitEditing={handleSendCode}
          editable={!loading}
          accessibilityLabel="Email address"
        />

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleSendCode}
          disabled={loading}
          accessibilityRole="button"
          accessibilityLabel="Send sign in code">
          {loading ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <Text style={styles.buttonText}>Send code →</Text>
          )}
        </TouchableOpacity>

        {biometricReady && (
          <TouchableOpacity
            style={styles.biometricButton}
            onPress={handleBiometricLogin}
            disabled={loading}
            accessibilityRole="button"
            accessibilityLabel={`Sign in with ${biometricLabel}`}>
            <Text style={styles.biometricIcon}>{biometricIcon}</Text>
            <Text style={styles.biometricText}>Sign in with {biometricLabel}</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={styles.googleBtn}
          disabled
          accessibilityRole="button"
          accessibilityLabel="Continue with Google (coming soon)">
          <Text style={styles.googleBtnText}>Continue with Google</Text>
        </TouchableOpacity>

        <Text style={styles.footerText}>
          New to Rural Connections? Just enter your email —{'\n'}
          we'll create your account automatically.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },

  topBar: { backgroundColor: '#2d6a4f' },
  topBarInner: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
  },
  backArrow: { fontSize: 22, color: '#ffffff', fontWeight: '500', width: 32 },
  wordmark:  { color: '#ffffff', fontSize: 16, fontWeight: '500', letterSpacing: 1 },
  tagline:   { color: '#95d5b2', fontSize: 9, letterSpacing: 3, textTransform: 'uppercase' },

  formArea: { flexGrow: 1, justifyContent: 'center', padding: 24 },

  title: {
    fontSize: 34,
    lineHeight: 38,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 24,
  },
  emailHighlight: {
    fontWeight: '700',
    color: colors.textPrimary,
  },

  input: {
    backgroundColor: colors.white,
    borderRadius: 8,
    padding: 14,
    marginBottom: 16,
    fontSize: 16,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 52,
    color: colors.textPrimary,
  },

  button: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    marginBottom: 12,
  },
  buttonDisabled: { opacity: 0.7 },
  buttonText: { color: colors.white, fontSize: 16, fontWeight: '700' },

  biometricButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: 8,
    paddingVertical: 14,
    marginBottom: 12,
    backgroundColor: colors.white,
    minHeight: 52,
  },
  biometricIcon: { fontSize: 22 },
  biometricText: { fontSize: 15, fontWeight: '500', color: colors.primary },

  googleBtn: {
    borderRadius: 8,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.white,
    marginBottom: 24,
    opacity: 0.5,
  },
  googleBtnText: { fontSize: 15, fontWeight: '600', color: colors.textSecondary },

  footerText: {
    fontSize: 13,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },

  digitContainer: {
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'center',
    marginVertical: 24,
  },
  digitBox: {
    width: 48,
    height: 56,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#e0e0e0',
    backgroundColor: '#fff',
    fontSize: 24,
    fontWeight: '500',
    textAlign: 'center',
    color: '#222',
  },
  digitBoxFilled:  { borderColor: colors.primary, backgroundColor: '#f0faf4' },
  digitBoxFocused: { borderColor: colors.primary, borderWidth: 2 },

  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 16,
  },
  loadingText: { fontSize: 14, color: colors.textMuted },

  resendBtn: {
    alignItems: 'center',
    paddingVertical: 12,
    minHeight: 44,
    justifyContent: 'center',
  },
  resendText: { fontSize: 15, color: colors.primary, fontWeight: '600' },
})
