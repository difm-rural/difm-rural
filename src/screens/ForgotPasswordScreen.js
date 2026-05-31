import React, { useState } from 'react'
import {
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
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '../lib/supabase'
import { colors } from '../theme/tokens'

export default function ForgotPasswordScreen({ navigation }) {
  const insets = useSafeAreaInsets()
  const [email,       setEmail]       = useState('')
  const [submitting,  setSubmitting]  = useState(false)

  async function handleSend() {
    const trimmed = email.trim().toLowerCase()
    if (!trimmed) {
      Alert.alert('Email required', 'Please enter your email address.')
      return
    }

    setSubmitting(true)
    const { error } = await supabase.auth.resetPasswordForEmail(trimmed)
    setSubmitting(false)

    if (error) {
      Alert.alert('Error', error.message)
      return
    }

    Alert.alert(
      'Check your inbox',
      `We've sent a password reset link to ${trimmed}. Check your email and follow the link to reset your password.`,
      [{ text: 'OK', onPress: () => navigation.goBack() }]
    )
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>

      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Back to login">
          <Text style={styles.backBtnText}>← Back to login</Text>
        </TouchableOpacity>
        <Text style={styles.kicker}>Account</Text>
        <Text style={styles.headerTitle} accessibilityRole="header">Reset password</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 40 }]}
        keyboardShouldPersistTaps="handled">

        <Text style={styles.explanation}>
          Enter your email address and we'll send you a link to reset your password.
        </Text>

        <View style={styles.card}>
          <Text style={styles.inputLabel}>Email address</Text>
          <TextInput
            style={styles.input}
            placeholder="you@example.com"
            placeholderTextColor={colors.textMuted}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoCorrect={false}
            returnKeyType="send"
            onSubmitEditing={handleSend}
            accessibilityLabel="Email address"
          />
        </View>

        <TouchableOpacity
          style={[styles.sendBtn, submitting && styles.sendBtnDisabled]}
          onPress={handleSend}
          disabled={submitting}
          accessibilityRole="button"
          accessibilityLabel="Send reset link">
          <Text style={styles.sendBtnText}>{submitting ? 'Sending...' : 'Send reset link'}</Text>
        </TouchableOpacity>

      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },

  header: {
    backgroundColor: colors.background,
    paddingHorizontal: 20,
    paddingBottom: 14,
  },
  backBtn:      { marginBottom: 12, minHeight: 36, justifyContent: 'center', alignSelf: 'flex-start' },
  backBtnText:  { color: colors.primary, fontSize: 15, fontWeight: '600' },
  kicker:       { fontSize: 13, fontWeight: '700', color: colors.primary, marginBottom: 8 },
  headerTitle:  { fontSize: 34, lineHeight: 38, fontWeight: '700', color: colors.textPrimary },

  scroll:        { flex: 1 },
  scrollContent: { padding: 20 },

  explanation: {
    fontSize: 15,
    color: colors.textSecondary,
    lineHeight: 24,
    marginBottom: 24,
  },

  card: {
    backgroundColor: colors.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginBottom: 20,
  },
  inputLabel: { fontSize: 13, fontWeight: '700', color: colors.textMuted, marginBottom: 8 },
  input: {
    backgroundColor: colors.background,
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.textPrimary,
  },

  sendBtn: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    minHeight: 52,
    justifyContent: 'center',
  },
  sendBtnDisabled: { backgroundColor: '#a8cfc0' },
  sendBtnText:     { color: colors.white, fontSize: 16, fontWeight: 'bold' },
})
