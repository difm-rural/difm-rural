import React, { useEffect, useState } from 'react'
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { supabase } from '../lib/supabase'
import { colors } from '../theme/tokens'

export default function HomeScreen({ navigation }) {
  const [profile, setProfile] = useState(null)
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadProfile() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }
      setEmail(user.email || '')
      const { data } = await supabase
        .from('profiles')
        .select('full_name, role, phone')
        .eq('id', user.id)
        .single()
      setProfile(data)
      setLoading(false)
    }
    loadProfile()
  }, [])

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    )
  }

  const roleLabel = profile?.role === 'requester' ? 'Task Poster' : 'Service Provider'
  const roleIcon  = profile?.role === 'requester' ? '📋' : '🔧'
  const initials  = (profile?.full_name || 'U')
    .split(' ')
    .map(w => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  return (
    <View style={styles.container}>
      {navigation?.canGoBack() && (
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Go back">
          <Text style={styles.backBtnText}>← Back</Text>
        </TouchableOpacity>
      )}
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <Text style={styles.name} accessibilityRole="header">{profile?.full_name || 'User'}</Text>
        <View style={styles.rolePill}>
          <Text style={styles.rolePillText}>{roleIcon}  {roleLabel}</Text>
        </View>
      </View>

      <View style={styles.card}>
        <Row label="Email" value={email} />
        {profile?.phone ? <Row label="Phone" value={profile.phone} last /> : <Row label="Phone" value="Not set" muted last />}
      </View>

      <TouchableOpacity
        style={styles.signOut}
        onPress={() => supabase.auth.signOut()}
        accessibilityRole="button"
        accessibilityLabel="Sign out"
        accessibilityHint="Double tap to sign out of your account">
        <Text style={styles.signOutText}>Sign Out</Text>
      </TouchableOpacity>
    </View>
  )
}

function Row({ label, value, muted, last }) {
  return (
    <View style={[styles.row, !last && styles.rowBorder]}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, muted && styles.rowValueMuted]}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, paddingTop: 56 },
  backBtn: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 4, minHeight: 44, justifyContent: 'center' },
  backBtnText: { color: colors.primary, fontSize: 16, fontWeight: '600' },
  center:    { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background },

  header: { alignItems: 'center', paddingVertical: 32, paddingHorizontal: 24 },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  avatarText: { fontSize: 26, fontWeight: 'bold', color: colors.white },
  name:       { fontSize: 22, fontWeight: 'bold', color: colors.textPrimary, marginBottom: 8 },
  rolePill: {
    backgroundColor: colors.primaryLight,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  rolePillText: { fontSize: 13, fontWeight: '600', color: colors.primary },

  card: {
    backgroundColor: colors.white,
    marginHorizontal: 20,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    marginBottom: 24,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    minHeight: 44,
  },
  rowBorder:      { borderBottomWidth: 1, borderBottomColor: '#f2f2f2' },
  rowLabel:       { fontSize: 14, fontWeight: '600', color: colors.textSecondary },
  rowValue:       { fontSize: 14, color: colors.textPrimary, fontWeight: '500' },
  rowValueMuted:  { color: colors.textMuted },

  signOut: {
    marginHorizontal: 20,
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.danger,
    minHeight: 52,
    justifyContent: 'center',
  },
  signOutText: { color: colors.danger, fontSize: 15, fontWeight: '700' },
})
