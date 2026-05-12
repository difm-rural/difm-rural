import React, { useRef, useState } from 'react'
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { supabase } from '../lib/supabase'
import { colors } from '../theme/tokens'

export default function RegisterScreen({ navigation }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [primaryRole, setPrimaryRole] = useState('requester')
  const [loading, setLoading] = useState(false)

  const emailRef    = useRef(null)
  const phoneRef    = useRef(null)
  const passwordRef = useRef(null)

  async function handleRegister() {
    setLoading(true)
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName, phone, role: primaryRole, primary_role: primaryRole } },
    })
    if (error) {
      Alert.alert('Registration Failed', error.message)
    } else {
      Alert.alert('Success!', 'Check your email to confirm your account, then log in.')
      navigation.navigate('Login')
    }
    setLoading(false)
  }

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.title} accessibilityRole="header">Create Account</Text>

      <TextInput
        style={styles.input}
        placeholder="Full Name"
        value={fullName}
        onChangeText={setFullName}
        autoCapitalize="words"
        autoCorrect={false}
        returnKeyType="next"
        blurOnSubmit={false}
        onSubmitEditing={() => emailRef.current?.focus()}
        accessibilityLabel="Full name"
      />
      <TextInput
        ref={emailRef}
        style={styles.input}
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        returnKeyType="next"
        blurOnSubmit={false}
        onSubmitEditing={() => phoneRef.current?.focus()}
        accessibilityLabel="Email address"
      />
      <TextInput
        ref={phoneRef}
        style={styles.input}
        placeholder="Phone Number"
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="next"
        blurOnSubmit={false}
        onSubmitEditing={() => passwordRef.current?.focus()}
        accessibilityLabel="Phone number"
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
        onSubmitEditing={handleRegister}
        accessibilityLabel="Password"
      />

      <Text style={styles.label}>I want to:</Text>
      <View style={styles.roleContainer}>
        <TouchableOpacity
          style={[styles.roleButton, primaryRole === 'requester' && styles.roleActive]}
          onPress={() => setPrimaryRole('requester')}
          accessibilityRole="button"
          accessibilityLabel="Post tasks — Requester"
          accessibilityState={{ selected: primaryRole === 'requester' }}>
          <Text style={styles.roleEmoji}>🏡</Text>
          <Text style={[styles.roleText, primaryRole === 'requester' && styles.roleTextActive]}>Post tasks</Text>
          <Text style={[styles.roleSubtext, primaryRole === 'requester' && styles.roleTextActive]}>Requester</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.roleButton, primaryRole === 'provider' && styles.roleActive]}
          onPress={() => setPrimaryRole('provider')}
          accessibilityRole="button"
          accessibilityLabel="Do jobs — Provider"
          accessibilityState={{ selected: primaryRole === 'provider' }}>
          <Text style={styles.roleEmoji}>🔧</Text>
          <Text style={[styles.roleText, primaryRole === 'provider' && styles.roleTextActive]}>Do jobs</Text>
          <Text style={[styles.roleSubtext, primaryRole === 'provider' && styles.roleTextActive]}>Provider</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.roleButton, primaryRole === 'both' && styles.roleActive]}
          onPress={() => setPrimaryRole('both')}
          accessibilityRole="button"
          accessibilityLabel="Both post and do jobs"
          accessibilityState={{ selected: primaryRole === 'both' }}>
          <Text style={styles.roleEmoji}>🔄</Text>
          <Text style={[styles.roleText, primaryRole === 'both' && styles.roleTextActive]}>Both</Text>
          <Text style={[styles.roleSubtext, primaryRole === 'both' && styles.roleTextActive]}>Flexible</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={styles.button}
        onPress={handleRegister}
        disabled={loading}
        accessibilityRole="button"
        accessibilityLabel="Create account"
        accessibilityHint="Double tap to create your new account">
        <Text style={styles.buttonText}>{loading ? 'Creating Account...' : 'Create Account'}</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.linkBtn}
        onPress={() => navigation.navigate('Login')}
        accessibilityRole="button"
        accessibilityLabel="Sign in to existing account">
        <Text style={styles.link}>Already have an account? Log In</Text>
      </TouchableOpacity>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, justifyContent: 'center', padding: 24, backgroundColor: colors.background },
  title: { fontSize: 28, fontWeight: 'bold', color: colors.primary, textAlign: 'center', marginBottom: 24 },
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
  label: { fontSize: 16, fontWeight: '600', color: colors.textPrimary, marginBottom: 10, marginTop: 4 },
  roleContainer: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  roleButton: {
    flex: 1,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 6,
    alignItems: 'center',
    backgroundColor: colors.white,
    borderWidth: 2,
    borderColor: colors.border,
    minHeight: 80,
    justifyContent: 'center',
  },
  roleEmoji: { fontSize: 20, marginBottom: 4 },
  roleActive: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  roleText: { fontSize: 16, fontWeight: 'bold', color: colors.textSecondary },
  roleSubtext: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  roleTextActive: { color: colors.primary },
  button: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingVertical: 16,
    paddingHorizontal: 24,
    alignItems: 'center',
    marginTop: 8,
    minHeight: 52,
    justifyContent: 'center',
  },
  buttonText: { color: colors.white, fontSize: 16, fontWeight: '700' },
  linkBtn: {
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 4,
  },
  link: { color: colors.primary, textAlign: 'center', fontSize: 15 },
})
