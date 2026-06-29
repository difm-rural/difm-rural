/*
 * SUPABASE SETUP REQUIRED
 *
 * 1. Create the "avatars" storage bucket:
 *    Dashboard → Storage → New bucket
 *    Name: avatars  |  Public: ON  |  Click "Save"
 *
 *    Then add a Storage policy so users can manage only their own avatar:
 *    Dashboard → Storage → avatars → Policies → New policy → "For full customization"
 *      Allowed operations: SELECT, INSERT, UPDATE, DELETE
 *      Policy expression:
 *        (auth.uid()::text = (storage.foldername(name))[1])
 *
 * 2. Ensure the profiles table has these columns (add if missing):
 *    ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;
 *    ALTER TABLE profiles ADD COLUMN IF NOT EXISTS region    TEXT;
 */

import React, { useCallback, useState } from 'react'
import { useFocusEffect } from '@react-navigation/native'
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as ImagePicker from 'expo-image-picker'
import { supabase } from '../lib/supabase'
import { colors } from '../theme/tokens'
import Icon from '../components/Icon'
import Loading from '../components/Loading'
import Button from '../components/Button'
import {
  authenticate,
  clearCredentials,
  getBiometricType,
  getCredentials,
  isBiometricAvailable,
  saveCredentials,
} from '../lib/biometrics'
import { loadUserPreferences } from '../lib/preferences'

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export default function ProfileScreen({ navigation }) {
  const insets = useSafeAreaInsets()
  const [loading, setLoading]               = useState(true)
  const [saving, setSaving]                 = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [userId, setUserId]                 = useState(null)
  const [email, setEmail]                   = useState('')
  const [memberSince, setMemberSince]       = useState('')
  const [profile, setProfile] = useState({
    full_name: '', phone: '', region: '', avatar_url: '', role: '', primary_role: 'requester',
  })
  const [editModal, setEditModal] = useState({
    visible: false, field: '', label: '', value: '', keyboardType: 'default',
  })

  const [preferredCategories, setPreferredCategories] = useState([])
  const [notificationsEnabled, setNotificationsEnabled] = useState(true)
  const [ratingSummary, setRatingSummary] = useState({ average: 0, count: 0 })

  // Biometric state
  const [biometricEnabled, setBiometricEnabled] = useState(false)
  const [biometricType, setBiometricType]       = useState(null) // 'face' | 'fingerprint' | null
  const [biometricAvailable, setBiometricAvailable] = useState(false)
  const [passwordModal, setPasswordModal]       = useState(false)
  const [passwordInput, setPasswordInput]       = useState('')
  const [enablingBiometric, setEnablingBiometric] = useState(false)

  useFocusEffect(useCallback(() => { loadProfile() }, []))

  async function loadProfile() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    setUserId(user.id)
    setEmail(user.email || '')
    const d = new Date(user.created_at)
    setMemberSince(`${MONTHS[d.getMonth()]} ${d.getFullYear()}`)

    const { data } = await supabase
      .from('profiles')
      .select('full_name, phone, region, avatar_url, role, primary_role')
      .eq('id', user.id)
      .single()
    if (data) setProfile(data)

    await loadRatingSummary(user.id)

    // Check biometric status
    const available = await isBiometricAvailable()
    setBiometricAvailable(available)
    if (available) {
      const type = await getBiometricType()
      setBiometricType(type)
      const creds = await getCredentials()
      setBiometricEnabled(!!creds)
    }

    // Load preferences
    const prefs = await loadUserPreferences()
    if (prefs?.preferred_categories?.length) {
      setPreferredCategories(prefs.preferred_categories)
    }
    if (prefs?.notifications_enabled !== undefined) {
      setNotificationsEnabled(prefs.notifications_enabled)
    }

    setLoading(false)
  }

  // ─── Edit field modal ──────────────────────────────────────────
  async function loadRatingSummary(uid) {
    try {
      const { data, error } = await supabase
        .from('reviews')
        .select('rating')
        .eq('reviewee_id', uid)

      if (error) throw error

      const ratings = data || []
      if (ratings.length === 0) {
        setRatingSummary({ average: 0, count: 0 })
        return
      }

      const total = ratings.reduce((sum, review) => sum + (review.rating || 0), 0)
      setRatingSummary({
        average: total / ratings.length,
        count: ratings.length,
      })
    } catch {
      setRatingSummary({ average: 0, count: 0 })
    }
  }

  function openEdit(field, label, value, keyboardType = 'default') {
    setEditModal({ visible: true, field, label, value: value || '', keyboardType })
  }

  async function saveEdit() {
    const { field, value } = editModal
    setSaving(true)
    const { error } = await supabase
      .from('profiles')
      .update({ [field]: value })
      .eq('id', userId)
    setSaving(false)
    if (error) {
      Alert.alert('Error', 'Could not save changes. Please try again.')
    } else {
      setProfile(p => ({ ...p, [field]: value }))
      setEditModal(m => ({ ...m, visible: false }))
    }
  }

  // ─── Biometric ─────────────────────────────────────────────────
  function handleBiometricPress() {
    if (biometricEnabled) {
      Alert.alert(
        'Disable biometric login',
        'This will remove your saved sign-in credentials from this device.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Disable', style: 'destructive', onPress: disableBiometric },
        ]
      )
    } else {
      setPasswordInput('')
      setPasswordModal(true)
    }
  }

  async function disableBiometric() {
    await clearCredentials()
    setBiometricEnabled(false)
  }

  async function enableBiometric() {
    if (!passwordInput) {
      Alert.alert('Password required', 'Please enter your password to enable biometric login.')
      return
    }
    setEnablingBiometric(true)
    // Verify the password is correct before storing it
    const { error } = await supabase.auth.signInWithPassword({ email, password: passwordInput })
    if (error) {
      setEnablingBiometric(false)
      Alert.alert('Incorrect password', 'Please check your password and try again.')
      return
    }
    // Prompt biometrics to confirm the user intends to enable it
    const label = biometricType === 'face' ? 'Face ID' : 'fingerprint'
    const success = await authenticate(`Confirm with ${label} to enable biometric login`)
    if (!success) {
      setEnablingBiometric(false)
      return
    }
    await saveCredentials(email, passwordInput)
    setBiometricEnabled(true)
    setPasswordModal(false)
    setPasswordInput('')
    setEnablingBiometric(false)
    Alert.alert('Biometric login enabled', `You can now sign in using ${label}.`)
  }

  // ─── Avatar ─────────────────────────────────────────────────────
  function showAvatarOptions() {
    Alert.alert('Change photo', 'Choose an option', [
      { text: 'Take a photo',        onPress: takePhoto },
      { text: 'Choose from library', onPress: pickFromLibrary },
      { text: 'Remove photo',        onPress: removePhoto, style: 'destructive' },
      { text: 'Cancel',              style: 'cancel' },
    ])
  }

  async function takePhoto() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync()
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow camera access to take a photo.')
      return
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    })
    if (!result.canceled) await uploadAvatar(result.assets[0].uri)
  }

  async function pickFromLibrary() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow photo library access.')
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    })
    if (!result.canceled) await uploadAvatar(result.assets[0].uri)
  }

  async function uploadAvatar(uri) {
    if (!userId) return
    setUploadingAvatar(true)
    try {
      const path = `avatars/${userId}/avatar.jpg`
      const response = await fetch(uri)
      const blob = await response.blob()

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, blob, { contentType: 'image/jpeg', upsert: true })

      if (uploadError) throw uploadError

      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)
      const bustedUrl = `${publicUrl}?t=${Date.now()}`
      await supabase.from('profiles').update({ avatar_url: bustedUrl }).eq('id', userId)
      setProfile(p => ({ ...p, avatar_url: bustedUrl }))
    } catch {
      Alert.alert('Upload failed', 'Could not upload photo. Please try again.')
    } finally {
      setUploadingAvatar(false)
    }
  }

  async function removePhoto() {
    if (!userId) return
    setUploadingAvatar(true)
    try {
      await supabase.storage.from('avatars').remove([`avatars/${userId}/avatar.jpg`])
      await supabase.from('profiles').update({ avatar_url: null }).eq('id', userId)
      setProfile(p => ({ ...p, avatar_url: null }))
    } catch {
      Alert.alert('Error', 'Could not remove photo.')
    } finally {
      setUploadingAvatar(false)
    }
  }

  // ─── Dashboard mode ────────────────────────────────────────────
  function handleRoleChange() {
    const options = [
      { text: 'Requester — Post tasks', role: 'requester' },
      { text: 'Provider — Do jobs',     role: 'provider'  },
      { text: 'Both — Post & do jobs',  role: 'both'      },
      { text: 'Cancel', style: 'cancel' },
    ]
    Alert.alert(
      'Dashboard mode',
      'Choose how you primarily use the app:',
      options.map(opt =>
        opt.style === 'cancel'
          ? opt
          : {
              text: opt.text,
              onPress: () => updatePrimaryRole(opt.role),
            }
      )
    )
  }

  async function updatePrimaryRole(newRole) {
    // Legacy `role` column only allows requester/provider — map "both" to
    // provider there; primary_role is the real source of truth.
    const legacyRole = newRole === 'both' ? 'provider' : newRole
    const { error } = await supabase
      .from('profiles')
      .update({ primary_role: newRole, role: legacyRole })
      .eq('id', userId)
    if (error) {
      Alert.alert('Could not update', error.message)
      return
    }
    setProfile(p => ({ ...p, primary_role: newRole, role: legacyRole }))
    Alert.alert('Dashboard updated', 'Your dashboard will update next time you open the app.')
  }

  // ─── Sign out ──────────────────────────────────────────────────
  function handleSignOut() {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        // Biometric credentials are intentionally preserved across sign-out
        // so the button re-appears on the login screen next time.
        onPress: () => supabase.auth.signOut(),
      },
    ])
  }

  // ─── Derived ────────────────────────────────────────────────────
  const initials = (profile.full_name || 'U')
    .split(' ')
    .map(w => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()

  const hasPhoto = !!profile.avatar_url
  const ratingText = ratingSummary.count > 0
    ? `${Number(ratingSummary.average || 0).toFixed(1)} / 5 · ${ratingSummary.count} reviewer${ratingSummary.count === 1 ? '' : 's'}`
    : 'No reviews yet'

  if (loading) {
    return <Loading />
  }

  const biometricLabel = biometricType === 'face' ? 'Face ID' : 'fingerprint'
  const biometricIcon  = biometricType === 'face' ? 'scan-outline' : 'finger-print'

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 32 }]} showsVerticalScrollIndicator={false}>

        {/* ── Green header ─────────────────────────────────────── */}
        <View style={styles.header}>

          {/* Back | Title | Spacer */}
          <View style={styles.headerNav}>
            {navigation?.canGoBack() ? (
              <TouchableOpacity
                style={styles.backBtn}
                onPress={() => navigation.goBack()}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityRole="button"
                accessibilityLabel="Go back">
                <Text style={styles.backBtnText}><Icon name="chevron-back" size={14} color={colors.primary} /> Back</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.navSpacer} />
            )}
            <Text style={styles.headerTitle} accessibilityRole="header">My profile</Text>
            <View style={styles.navSpacer} />
          </View>

          {/* Avatar */}
          <View style={styles.avatarWrap}>
            <View style={[styles.avatarCircle, !hasPhoto && styles.avatarCircleGreen]}>
              {uploadingAvatar ? (
                <ActivityIndicator color={colors.white} size="large" />
              ) : hasPhoto ? (
                <Image source={{ uri: profile.avatar_url }} style={StyleSheet.absoluteFill} />
              ) : (
                <Text style={styles.avatarInitials}>{initials}</Text>
              )}
            </View>
            <TouchableOpacity
              style={styles.cameraBtn}
              onPress={showAvatarOptions}
              activeOpacity={0.8}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel="Change profile photo"
              accessibilityHint="Double tap to change your profile photo">
              <Icon name="camera" size={14} color={colors.white} />
            </TouchableOpacity>
          </View>

          <Text style={styles.headerName}>{profile.full_name || 'User'}</Text>
          <Text style={styles.headerSince}>Member since {memberSince}</Text>

          <View style={styles.ratingPill}>
            <Text style={styles.ratingText}>★ {ratingText}</Text>
          </View>
        </View>

        {/* ── Body ─────────────────────────────────────────────── */}
        <View style={styles.body}>

          {/* Personal details */}
          <Text style={styles.sectionLabel}>Personal details</Text>
          <View style={styles.card}>
            <DetailRow
              icon="person-outline"
              label="Full name"
              value={profile.full_name || '—'}
              onPress={() => openEdit('full_name', 'Full name', profile.full_name)}
            />
            <DetailRow
              icon="mail-outline"
              label="Email"
              value={email}
            />
            <DetailRow
              icon="call-outline"
              label="Phone"
              value={profile.phone || '—'}
              onPress={() => openEdit('phone', 'Phone number', profile.phone, 'phone-pad')}
            />
            <DetailRow
              icon="location-outline"
              label="Region"
              value={profile.region || '—'}
              last
              onPress={() => openEdit('region', 'Region', profile.region)}
            />
          </View>

          {/* Account */}
          <Text style={styles.sectionLabel}>Account</Text>
          <View style={styles.card}>
            <DetailRow
              icon="star-outline"
              label="My ratings"
              value={ratingText}
            />
            <DetailRow
              icon="checkmark-circle-outline"
              label="Verification"
              value="Not verified"
              valueMuted
              onPress={() => Alert.alert('Verification', 'Identity verification coming soon.')}
            />
            <DetailRow
              icon="notifications-outline"
              label="Notifications"
              value={notificationsEnabled ? 'Enabled' : 'Disabled'}
              valueGreen={notificationsEnabled}
              valueMuted={!notificationsEnabled}
              onPress={() => Alert.alert('Notifications', 'Notification preferences coming soon.')}
            />
            {false && biometricAvailable && (
              <DetailRow
                icon={biometricIcon}
                label="Biometric login"
                value={biometricEnabled ? 'Enabled' : 'Disabled'}
                valueGreen={biometricEnabled}
                valueMuted={!biometricEnabled}
                onPress={handleBiometricPress}
              />
            )}
            <DetailRow
              icon="swap-horizontal-outline"
              label="Dashboard mode"
              value={
                profile.primary_role === 'provider' ? 'Provider'
                : profile.primary_role === 'both'   ? 'Both'
                : 'Requester'
              }
              onPress={handleRoleChange}
            />
            <DetailRow
              icon="log-out-outline"
              label="Sign out"
              labelRed
              last
              onPress={handleSignOut}
            />
          </View>

          {preferredCategories.length > 0 && (
            <>
              <Text style={styles.sectionLabel}>Preferred categories</Text>
              <View style={styles.card}>
                <View style={styles.categoryWrap}>
                  {preferredCategories.map(cat => (
                    <View key={cat} style={styles.categoryPill}>
                      <Text style={styles.categoryPillText}>{cat}</Text>
                    </View>
                  ))}
                </View>
              </View>
            </>
          )}

        </View>
      </ScrollView>

      {/* ── Edit modal ─────────────────────────────────────────── */}
      <Modal
        visible={editModal.visible}
        transparent
        animationType="fade"
        onRequestClose={() => setEditModal(m => ({ ...m, visible: false }))}>
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>{editModal.label}</Text>
            <TextInput
              style={styles.modalInput}
              value={editModal.value}
              onChangeText={v => setEditModal(m => ({ ...m, value: v }))}
              keyboardType={editModal.keyboardType}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={saveEdit}
              placeholder={`Enter ${editModal.label.toLowerCase()}`}
              placeholderTextColor={colors.textMuted}
              accessibilityLabel={editModal.label}
            />
            <View style={styles.modalActions}>
              <Button
                variant="secondary"
                title="Cancel"
                onPress={() => setEditModal(m => ({ ...m, visible: false }))}
                style={{ flex: 1 }}
                accessibilityLabel="Cancel editing"
              />
              <Button
                title="Save"
                onPress={saveEdit}
                loading={saving}
                style={{ flex: 1 }}
                accessibilityLabel="Save changes"
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Biometric password modal ────────────────────────────── */}
      <Modal
        visible={passwordModal}
        transparent
        animationType="fade"
        onRequestClose={() => setPasswordModal(false)}>
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Enable {biometricLabel}</Text>
            <Text style={styles.modalSubtitle}>
              Enter your password to confirm. It will be stored securely on this device.
            </Text>
            <TextInput
              style={styles.modalInput}
              value={passwordInput}
              onChangeText={setPasswordInput}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={enableBiometric}
              placeholder="Your password"
              placeholderTextColor={colors.textMuted}
              accessibilityLabel="Password"
            />
            <View style={styles.modalActions}>
              <Button
                variant="secondary"
                title="Cancel"
                onPress={() => { setPasswordModal(false); setPasswordInput('') }}
                style={{ flex: 1 }}
                accessibilityLabel="Cancel"
              />
              <Button
                title="Enable"
                onPress={enableBiometric}
                loading={enablingBiometric}
                style={{ flex: 1 }}
                accessibilityLabel="Enable biometric login"
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  )
}

// ─── Detail row ────────────────────────────────────────────────────
function DetailRow({ icon, label, value, valueMuted, valueGreen, valueBadge, labelRed, last, onPress }) {
  return (
    <TouchableOpacity
      style={[styles.row, !last && styles.rowBorder]}
      onPress={onPress}
      activeOpacity={onPress ? 0.6 : 1}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityLabel={label + (value ? `, ${value}` : '') + (valueBadge ? `, ${valueBadge}` : '')}
      accessibilityHint={onPress ? 'Double tap to edit' : undefined}>
      <View style={styles.rowLeft}>
        <Icon name={icon} size={18} color={labelRed ? colors.danger : colors.textSecondary} style={styles.rowIcon} />
        <Text style={[styles.rowLabel, labelRed && styles.rowLabelRed]}>{label}</Text>
      </View>
      <View style={styles.rowRight}>
        {valueBadge ? (
          <View style={styles.amberBadge}>
            <Text style={styles.amberBadgeText}>{valueBadge}</Text>
          </View>
        ) : value ? (
          <Text
            style={[
              styles.rowValue,
              valueMuted && styles.rowValueMuted,
              valueGreen && styles.rowValueGreen,
              labelRed && styles.rowValueRed,
            ]}
            numberOfLines={1}>
            {value}
          </Text>
        ) : null}
        {onPress && (
          <Icon name="chevron-forward" size={16} color={labelRed ? colors.danger : colors.textMuted} style={styles.rowChevron} />
        )}
      </View>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f0f0f0' },
  scrollContent: { paddingBottom: 48 },
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f0f0f0' },

  // ─── Header ──────────────────────────────────────────────────────
  header: {
    backgroundColor: colors.primary,
    paddingTop: 56,
    paddingHorizontal: 20,
    paddingBottom: 36,
    alignItems: 'center',
  },
  headerNav: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
    marginBottom: 28,
  },
  backBtn: { width: 80, minHeight: 44, justifyContent: 'center' },
  backBtnText: { color: colors.white, fontSize: 16, fontWeight: '600' },
  navSpacer: { width: 80 },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    color: colors.white,
    fontSize: 18,
    fontWeight: '700',
  },

  // ─── Avatar ──────────────────────────────────────────────────────
  avatarWrap: { position: 'relative', marginBottom: 16 },
  avatarCircle: {
    width: 90,
    height: 90,
    borderRadius: 45,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.45)',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarCircleGreen: { backgroundColor: 'rgba(255,255,255,0.2)' },
  avatarInitials: { fontSize: 30, fontWeight: 'bold', color: colors.white },
  cameraBtn: {
    position: 'absolute',
    bottom: 0,
    right: -2,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 3,
    elevation: 4,
  },
  cameraBtnText: { fontSize: 14, lineHeight: 18 },

  headerName: { fontSize: 22, fontWeight: 'bold', color: colors.white, marginBottom: 4, textAlign: 'center' },
  headerSince: { fontSize: 13, color: 'rgba(255,255,255,0.75)', marginBottom: 16 },
  ratingPill: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 7,
  },
  ratingText: { color: colors.white, fontSize: 13, fontWeight: '500' },

  // ─── Body ────────────────────────────────────────────────────────
  body: { padding: 16, paddingTop: 20 },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
    marginLeft: 4,
    marginTop: 4,
  },

  // ─── Card ────────────────────────────────────────────────────────
  card: {
    backgroundColor: colors.white,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 22,
    borderWidth: 1,
    borderColor: '#ececec',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    minHeight: 54,
  },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: '#f2f2f2' },
  rowLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 },
  rowIcon: { fontSize: 16, marginRight: 12, width: 22, textAlign: 'center' },
  rowLabel: { fontSize: 14, fontWeight: '500', color: colors.textPrimary },
  rowLabelRed: { color: colors.danger, fontWeight: '600' },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0, maxWidth: '55%' },
  rowValue: { fontSize: 14, color: colors.textMuted, textAlign: 'right', flexShrink: 1 },
  rowValueMuted: { color: colors.textMuted },
  rowValueGreen: { color: colors.primary, fontWeight: '600' },
  rowValueRed: { color: colors.danger },
  rowChevron: { fontSize: 20, color: colors.textMuted, lineHeight: 24 },
  rowChevronRed: { color: '#e57373' },

  // ─── Preferred categories ─────────────────────────────────────────
  categoryWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    padding: 14,
  },
  categoryPill: {
    backgroundColor: colors.primaryLight,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  categoryPillText: { fontSize: 13, fontWeight: '600', color: colors.primary },

  // ─── Amber badge ─────────────────────────────────────────────────
  amberBadge: {
    backgroundColor: colors.warningLight,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  amberBadgeText: { fontSize: 13, fontWeight: '700', color: colors.warning },

  // ─── Modals ───────────────────────────────────────────────────────
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalBox: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 24,
    width: '100%',
    maxWidth: 380,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  modalTitle: { fontSize: 16, fontWeight: '700', color: colors.textPrimary, marginBottom: 8 },
  modalSubtitle: { fontSize: 13, color: colors.textSecondary, marginBottom: 16, lineHeight: 20 },
  modalInput: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 13,
    fontSize: 15,
    color: colors.textPrimary,
    marginBottom: 20,
    backgroundColor: '#fafafa',
  },
  modalActions: { flexDirection: 'row', gap: 10 },
})
