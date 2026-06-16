import React, { useCallback, useState } from 'react'
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
import { useFocusEffect } from '@react-navigation/native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { pickAndUploadAvatar, removeAvatar as removeAvatarRecord } from '../../lib/uploadAvatar'
import { useUser } from '../../context/UserContext'
import { supabase } from '../../lib/supabase'
import { colors } from '../../theme/tokens'
import AddressAutocomplete from '../../components/AddressAutocomplete'
import {
  authenticate,
  clearSession,
  clearSessionTokens,
  getBiometricType,
  isBiometricAvailable,
  isBiometricEnabled,
  saveSession,
} from '../../lib/biometrics'

const ALL_SKILLS = [
  'Fencing', 'General labour', 'Machinery operation', 'Animal care',
  'Water systems', 'Property maintenance', 'Landscaping', 'Irrigation',
  'Welding', 'Electrical', 'Plumbing', 'Spraying',
  'Trucking', 'Shearing', 'Chainsaw', 'Tractor operation', 'Other',
]

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function getDisplayLocation(addr) {
  if (!addr) return ''
  const parts = addr.split(',').map(s => s.trim()).filter(Boolean)
  return parts.slice(-3, -1).join(', ').trim() || addr
}

function MenuRow({ icon, label, value, onPress, last, danger }) {
  return (
    <TouchableOpacity
      style={[styles.row, !last && styles.rowBorder]}
      onPress={onPress}
      activeOpacity={0.6}
      accessibilityRole="button"
      accessibilityLabel={`${label}${value ? `, ${value}` : ''}`}
      accessibilityHint="Double tap to open">
      <View style={styles.rowLeft}>
        <Text style={styles.rowIcon}>{icon}</Text>
        <Text style={[styles.rowLabel, danger && styles.rowLabelDanger]}>{label}</Text>
      </View>
      <View style={styles.rowRight}>
        {!!value && (
          <Text style={styles.rowValue} numberOfLines={1}>{value}</Text>
        )}
        <Text style={[styles.rowChevron, danger && styles.rowChevronDanger]}>›</Text>
      </View>
    </TouchableOpacity>
  )
}

export default function AccountTabScreen({ navigation }) {
  const insets = useSafeAreaInsets()
  const { refreshProfile } = useUser()

  const [loading, setLoading]               = useState(true)
  const [saving, setSaving]                 = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [avatarUrl, setAvatarUrl]           = useState(null)
  const [userId, setUserId]                 = useState(null)
  const [email, setEmail]                   = useState('')
  const [memberSince, setMemberSince]       = useState('')
  const [profile, setProfile]               = useState({
    full_name: '', phone: '', region: '', avatar_url: '', primary_role: 'requester',
    display_name: '', bio: '', skills: [], qualifications: [],
    address: '', latitude: null, longitude: null,
  })
  const [skills, setSkills]                 = useState([])
  const [qualifications, setQualifications] = useState([])
  const [showQualInput, setShowQualInput]   = useState(false)
  const [qualInput, setQualInput]           = useState('')
  const [savingSkills, setSavingSkills]     = useState(false)
  const [ratingSummary, setRatingSummary]       = useState({ average: 0, count: 0 })
  const [biometricEnabled,   setBiometricEnabled]   = useState(false)
  const [biometricAvailable, setBiometricAvailable] = useState(false)
  const [locationModalVisible, setLocationModalVisible] = useState(false)
  const [editModal, setEditModal]           = useState({
    visible: false, field: '', label: '', value: '', keyboardType: 'default',
  })

  useFocusEffect(useCallback(() => { loadProfile() }, []))

  async function loadProfile() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    setUserId(user.id)
    setEmail(user.email || '')
    const d = new Date(user.created_at)
    setMemberSince(`${MONTHS[d.getMonth()]} ${d.getFullYear()}`)

    const [{ data: profileData }, { data: reviewsData }] = await Promise.all([
      supabase.from('profiles')
        .select('full_name, phone, region, avatar_url, primary_role, role, display_name, bio, skills, qualifications, address, latitude, longitude')
        .eq('id', user.id)
        .single(),
      supabase.from('reviews').select('rating').eq('reviewee_id', user.id),
    ])

    if (profileData) {
      setProfile(profileData)
      setAvatarUrl(profileData.avatar_url || null)
      setSkills(profileData.skills || [])
      setQualifications(profileData.qualifications || [])
    }

    const ratings = reviewsData || []
    if (ratings.length > 0) {
      const total = ratings.reduce((s, r) => s + (r.rating || 0), 0)
      setRatingSummary({ average: total / ratings.length, count: ratings.length })
    } else {
      setRatingSummary({ average: 0, count: 0 })
    }

    const [available, enabled] = await Promise.all([isBiometricAvailable(), isBiometricEnabled()])
    setBiometricAvailable(available)
    setBiometricEnabled(enabled)

    setLoading(false)
  }

  // ─── Biometric toggle ──────────────────────────────────────────────────────

  async function handleBiometricToggle() {
    if (biometricEnabled) {
      Alert.alert(
        'Disable biometric login?',
        'You will need to use your email code to sign in next time.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Disable',
            style: 'destructive',
            onPress: async () => {
              await clearSession()
              setBiometricEnabled(false)
            },
          },
        ]
      )
    } else {
      const success = await authenticate()
      if (!success) return

      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        Alert.alert('Error', 'No active session found. Please sign out and back in.')
        return
      }

      await saveSession(session.access_token, session.refresh_token)
      setBiometricEnabled(true)

      const type  = await getBiometricType()
      const label = type === 'face' ? 'Face ID' : 'fingerprint'
      Alert.alert('Enabled', `${label} login is now active.`)
    }
  }

  // ─── Edit field modal ──────────────────────────────────────────────────────

  function openEdit(field, label, value, keyboardType = 'default') {
    setEditModal({ visible: true, field, label, value: value || '', keyboardType })
  }

  async function saveEdit() {
    if (!userId) return
    setSaving(true)
    const { error } = await supabase
      .from('profiles')
      .update({ [editModal.field]: editModal.value })
      .eq('id', userId)
    setSaving(false)
    if (error) {
      Alert.alert('Error', error.message)
    } else {
      setProfile(p => ({ ...p, [editModal.field]: editModal.value }))
      setEditModal(m => ({ ...m, visible: false }))
    }
  }

  // ─── Location ──────────────────────────────────────────────────────────────

  function openLocationModal() {
    setLocationModalVisible(true)
  }

  async function saveLocation(addr, lat, lng) {
    if (!userId) return
    const { error } = await supabase
      .from('profiles')
      .update({ address: addr, latitude: lat, longitude: lng })
      .eq('id', userId)
    if (error) {
      Alert.alert('Error', error.message)
    } else {
      setProfile(p => ({ ...p, address: addr, latitude: lat, longitude: lng }))
      setLocationModalVisible(false)
    }
  }

  // ─── Role ──────────────────────────────────────────────────────────────────

  function handleRoleChange() {
    Alert.alert(
      'How do you use DIFM Rural?',
      'You can always post jobs and book services. Providing adds tools to advertise services and take on jobs.',
      [
        { text: '🏡 I just need help', onPress: () => updateRole('requester') },
        { text: '🔧 I also provide',   onPress: () => updateRole('both') },
        { text: 'Cancel', style: 'cancel' },
      ]
    )
  }

  async function updateRole(newRole) {
    if (!userId) return
    const { error } = await supabase
      .from('profiles')
      .update({ primary_role: newRole, role: newRole })
      .eq('id', userId)
    if (!error) {
      setProfile(p => ({ ...p, primary_role: newRole, role: newRole }))
      Alert.alert('Dashboard updated', 'Your dashboard will update next time you open the app.')
    }
  }

  // ─── Skills & qualifications ──────────────────────────────────────────────

  async function toggleSkill(skill) {
    if (!userId) return
    const next = skills.includes(skill)
      ? skills.filter(s => s !== skill)
      : [...skills, skill]
    setSkills(next)
    setSavingSkills(true)
    await supabase.from('profiles').update({ skills: next }).eq('id', userId)
    setSavingSkills(false)
  }

  async function saveQualifications(next) {
    if (!userId) return
    setQualifications(next)
    await supabase.from('profiles').update({ qualifications: next }).eq('id', userId)
  }

  function removeQual(idx) {
    const next = qualifications.filter((_, i) => i !== idx)
    saveQualifications(next)
  }

  async function confirmAddQual() {
    const text = qualInput.trim()
    if (!text) return
    const next = [...qualifications, text]
    setQualInput('')
    setShowQualInput(false)
    await saveQualifications(next)
  }

  // ─── Avatar ────────────────────────────────────────────────────────────────

  function handleAvatarPress() {
    Alert.alert('Profile photo', 'Choose an option', [
      { text: 'Take a photo',        onPress: () => doUpload(true) },
      { text: 'Choose from library', onPress: () => doUpload(false) },
      avatarUrl
        ? { text: 'Remove photo', style: 'destructive', onPress: doRemove }
        : null,
      { text: 'Cancel', style: 'cancel' },
    ].filter(Boolean))
  }

  async function doUpload(useCamera) {
    if (!userId) return
    setUploadingAvatar(true)
    const url = await pickAndUploadAvatar(userId, useCamera)
    if (url) { setAvatarUrl(url); refreshProfile() }
    setUploadingAvatar(false)
  }

  async function doRemove() {
    if (!userId) return
    setUploadingAvatar(true)
    await removeAvatarRecord(userId)
    setAvatarUrl(null)
    refreshProfile()
    setUploadingAvatar(false)
  }

  // ─── Sign out ──────────────────────────────────────────────────────────────

  function handleSignOut() {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          // Keep the enabled flag so biometric is re-activated after next OTP login
          await clearSessionTokens()
          supabase.auth.signOut()
        },
      },
    ])
  }

  // ─── Derived ──────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={[styles.screen, styles.center]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    )
  }

  const initials   = (profile.full_name || 'U')
    .split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()
  const hasPhoto   = !!avatarUrl
  const ratingText = ratingSummary.count > 0
    ? `${Number(ratingSummary.average || 0).toFixed(1)} / 5 · ${ratingSummary.count} review${ratingSummary.count === 1 ? '' : 's'}`
    : 'No reviews yet'
  const roleLabel  = (profile.primary_role === 'provider' || profile.primary_role === 'both')
    ? 'Provider' : 'Requester'
  const isProvider = profile.primary_role === 'provider' || profile.primary_role === 'both'
  const locationDisplay = getDisplayLocation(profile.address) || profile.address || '—'

  return (
    <View style={styles.screen}>
      {/* ── Fixed green header ──────────────────────────────────────────────── */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.brandLabel}>DIFM RURAL</Text>
        <Text style={styles.headerLabel} accessibilityRole="header">Account</Text>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled">

        {/* ── White hero section ──────────────────────────────────────────── */}
        <View style={styles.hero}>
          <TouchableOpacity
            style={styles.avatarWrap}
            onPress={handleAvatarPress}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Change profile photo">
            <View style={[styles.avatarCircle, !hasPhoto && styles.avatarBg]}>
              {uploadingAvatar ? (
                <ActivityIndicator color={colors.primary} size="large" />
              ) : hasPhoto ? (
                <Image source={{ uri: avatarUrl }} style={styles.avatarImg} />
              ) : (
                <Text style={styles.avatarInitials}>{initials}</Text>
              )}
            </View>
            <View style={styles.cameraBtn}>
              <Text style={styles.cameraBtnText}>📷</Text>
            </View>
          </TouchableOpacity>

          <Text style={styles.heroName}>{profile.full_name || 'User'}</Text>
          <Text style={styles.heroSince}>Member since {memberSince}</Text>

          <View style={styles.pillRow}>
            <View style={styles.ratingPill}>
              <Text style={styles.ratingText}>⭐ {ratingText}</Text>
            </View>
            <TouchableOpacity
              style={styles.rolePill}
              onPress={handleRoleChange}
              accessibilityRole="button"
              accessibilityLabel={`Dashboard mode: ${roleLabel}. Tap to change`}>
              <Text style={styles.roleText}>{roleLabel}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Body ───────────────────────────────────────────────────────── */}
        <View style={styles.body}>

          {/* My account */}
          <Text style={styles.sectionLabel}>My account</Text>
          <View style={styles.card}>
            <MenuRow
              icon="👤" label="Full name" value={profile.full_name || '—'}
              onPress={() => openEdit('full_name', 'Full name', profile.full_name)}
            />
            <MenuRow
              icon="🏷️" label="Display name" value={profile.display_name || '—'}
              onPress={() => openEdit('display_name', 'Display name', profile.display_name)}
            />
            <MenuRow
              icon="✉️" label="Email" value={email}
              onPress={() => Alert.alert('Email', 'To change your email, please contact support.')}
            />
            <MenuRow
              icon="📞" label="Phone" value={profile.phone || '—'}
              onPress={() => openEdit('phone', 'Phone number', profile.phone, 'phone-pad')}
            />
            <MenuRow
              icon="📍" label="Location" value={locationDisplay}
              onPress={openLocationModal}
            />
            <MenuRow
              icon="📝" label="Bio" value={profile.bio ? profile.bio.slice(0, 30) + (profile.bio.length > 30 ? '…' : '') : '—'} last
              onPress={() => openEdit('bio', 'Short bio', profile.bio)}
            />
          </View>

          {/* Skills — providers and both only */}
          {isProvider && (
            <>
              <Text style={styles.sectionLabel}>Skills</Text>
              <View style={[styles.card, { padding: 14 }]}>
                {savingSkills && (
                  <Text style={styles.savingText}>Saving…</Text>
                )}
                <View style={styles.chipGrid}>
                  {ALL_SKILLS.map(skill => {
                    const selected = skills.includes(skill)
                    return (
                      <TouchableOpacity
                        key={skill}
                        style={[styles.chip, selected && styles.chipSelected]}
                        onPress={() => toggleSkill(skill)}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        accessibilityLabel={skill}>
                        <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                          {skill}
                        </Text>
                      </TouchableOpacity>
                    )
                  })}
                </View>
              </View>

              {/* Qualifications */}
              <Text style={styles.sectionLabel}>Qualifications</Text>
              <View style={styles.card}>
                {qualifications.length === 0 && !showQualInput && (
                  <View style={[styles.row, styles.rowBorder]}>
                    <Text style={{ fontSize: 13, color: colors.textMuted, paddingVertical: 4 }}>
                      No qualifications added yet
                    </Text>
                  </View>
                )}
                {qualifications.map((q, i) => (
                  <View key={i} style={[styles.row, styles.rowBorder]}>
                    <View style={styles.rowLeft}>
                      <Text style={styles.rowIcon}>🎓</Text>
                      <Text style={[styles.rowLabel, { flex: 1 }]} numberOfLines={2}>{q}</Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => removeQual(i)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${q}`}>
                      <Text style={{ color: colors.danger, fontSize: 13, fontWeight: '700', padding: 4 }}>✕</Text>
                    </TouchableOpacity>
                  </View>
                ))}
                {showQualInput && (
                  <View style={[styles.row, styles.rowBorder, { gap: 8 }]}>
                    <TextInput
                      style={styles.qualInlineInput}
                      value={qualInput}
                      onChangeText={setQualInput}
                      placeholder="e.g. Growsafe certified"
                      placeholderTextColor={colors.textMuted}
                      autoFocus
                      returnKeyType="done"
                      onSubmitEditing={confirmAddQual}
                      accessibilityLabel="Qualification"
                    />
                    <TouchableOpacity
                      style={styles.qualConfirmBtn}
                      onPress={confirmAddQual}
                      accessibilityRole="button"
                      accessibilityLabel="Add">
                      <Text style={styles.qualConfirmText}>Add</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => { setShowQualInput(false); setQualInput('') }}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Text style={{ color: colors.textMuted, fontSize: 14, fontWeight: '600' }}>✕</Text>
                    </TouchableOpacity>
                  </View>
                )}
                <TouchableOpacity
                  style={styles.row}
                  onPress={() => setShowQualInput(true)}
                  accessibilityRole="button"
                  accessibilityLabel="Add a qualification">
                  <View style={styles.rowLeft}>
                    <Text style={[styles.rowIcon, { color: colors.primary }]}>＋</Text>
                    <Text style={[styles.rowLabel, { color: colors.primary }]}>Add a qualification</Text>
                  </View>
                </TouchableOpacity>
              </View>
            </>
          )}

          {/* Provider tools */}
          {isProvider && (
            <>
              <Text style={styles.sectionLabel}>Provider tools</Text>
              <View style={styles.card}>
                <MenuRow
                  icon="🛠️" label="My services"
                  onPress={() => navigation.navigate('MyServices')}
                />
                <MenuRow
                  icon="⭐" label="My ratings" value={ratingText} last
                  onPress={() => Alert.alert('My ratings', ratingText)}
                />
              </View>
            </>
          )}

          {/* Preferences */}
          <Text style={styles.sectionLabel}>Preferences</Text>
          <View style={styles.card}>
            <MenuRow
              icon="🔔" label="Notifications" value="Enabled"
              onPress={() => Alert.alert('Notifications', 'Notification preferences coming soon.')}
            />
            <MenuRow
              icon="🔄" label="Dashboard mode" value={roleLabel}
              last={!biometricAvailable}
              onPress={handleRoleChange}
            />
            {biometricAvailable && (
              <MenuRow
                icon="🔐"
                label="Biometric login"
                value={biometricEnabled ? 'Enabled' : 'Disabled'}
                last
                onPress={handleBiometricToggle}
              />
            )}
          </View>

          {/* Support */}
          <Text style={styles.sectionLabel}>Support</Text>
          <View style={styles.card}>
            <MenuRow
              icon="❓" label="Help & FAQ"
              onPress={() => Alert.alert('Help', 'Help documentation coming soon.')}
            />
            <MenuRow
              icon="✉️" label="Contact us"
              onPress={() => Alert.alert('Contact us', 'support@difmrural.co.nz')}
            />
            <MenuRow
              icon="📄" label="Terms & privacy" last
              onPress={() => Alert.alert('Terms & privacy', 'Terms and privacy policy coming soon.')}
            />
          </View>

          {/* Sign out */}
          <TouchableOpacity
            style={styles.signOutBtn}
            onPress={handleSignOut}
            accessibilityRole="button"
            accessibilityLabel="Sign out">
            <Text style={styles.signOutText}>Sign out</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* ── Location modal ──────────────────────────────────────────────────── */}
      <Modal
        visible={locationModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setLocationModalVisible(false)}>
        <View style={styles.locationOverlay}>
          <View style={styles.locationBox}>
            <View style={styles.locationHeader}>
              <Text style={styles.locationTitle}>Update location</Text>
              <TouchableOpacity
                onPress={() => setLocationModalVisible(false)}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                accessibilityRole="button"
                accessibilityLabel="Close">
                <Text style={styles.locationClose}>✕</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.locationHint}>
              Search for your suburb, town, or region in New Zealand
            </Text>
            <View style={{ zIndex: 999, elevation: 999, marginBottom: 12 }}>
              <AddressAutocomplete
                defaultValue={profile.address}
                placeholder="Search suburb or town..."
                autoFocus
                onSelect={({ address: addr, latitude: lat, longitude: lng }) => {
                  saveLocation(addr || '', lat, lng)
                }}
              />
            </View>
            <TouchableOpacity
              style={styles.locationCancelBtn}
              onPress={() => setLocationModalVisible(false)}
              accessibilityRole="button"
              accessibilityLabel="Cancel">
              <Text style={styles.locationCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Edit modal ─────────────────────────────────────────────────────── */}
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
              <TouchableOpacity
                style={styles.modalCancel}
                onPress={() => setEditModal(m => ({ ...m, visible: false }))}
                accessibilityRole="button"
                accessibilityLabel="Cancel">
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSave, saving && { opacity: 0.6 }]}
                onPress={saveEdit}
                disabled={saving}
                accessibilityRole="button"
                accessibilityLabel="Save changes">
                <Text style={styles.modalSaveText}>{saving ? 'Saving…' : 'Save'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f0f0f0' },
  center: { justifyContent: 'center', alignItems: 'center' },

  // ─── Fixed green header ───────────────────────────────────────────────────
  header: {
    backgroundColor: colors.primary,
    paddingHorizontal: 20,
    paddingBottom: 14,
  },
  brandLabel:  { fontSize: 11, fontWeight: '600', color: '#95d5b2', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 6 },
  headerLabel: {
    fontSize: 26,
    fontWeight: 'bold',
    color: colors.white,
  },

  // ─── White hero card (scrolls with content) ───────────────────────────────
  hero: {
    backgroundColor: colors.white,
    alignItems: 'center',
    paddingTop: 28,
    paddingBottom: 24,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    marginBottom: 4,
  },

  avatarWrap: { position: 'relative', marginBottom: 14 },
  avatarCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 3,
    borderColor: colors.primary,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarBg:       { backgroundColor: colors.primaryLight },
  avatarImg:      { width: '100%', height: '100%' },
  avatarInitials: { fontSize: 28, fontWeight: 'bold', color: colors.primary },
  cameraBtn: {
    position: 'absolute',
    bottom: 0,
    right: -2,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 3,
    elevation: 4,
  },
  cameraBtnText: { fontSize: 13 },

  heroName:  { fontSize: 22, fontWeight: 'bold', color: colors.textPrimary, marginBottom: 4, textAlign: 'center' },
  heroSince: { fontSize: 13, color: colors.textMuted, marginBottom: 14 },

  pillRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  ratingPill: {
    backgroundColor: colors.primaryLight,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  ratingText: { color: colors.primary, fontSize: 13, fontWeight: '600' },
  rolePill: {
    backgroundColor: colors.primary,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  roleText: { color: colors.white, fontSize: 13, fontWeight: '700' },

  // ─── Body ────────────────────────────────────────────────────────────────
  body: { padding: 16, paddingTop: 20 },

  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
    marginLeft: 4,
    marginTop: 4,
  },

  // ─── Card / rows ──────────────────────────────────────────────────────────
  card: {
    backgroundColor: colors.white,
    borderRadius: 14,
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
  rowBorder:      { borderBottomWidth: 1, borderBottomColor: '#f2f2f2' },
  rowLeft:        { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 },
  rowIcon:        { fontSize: 16, marginRight: 12, width: 22, textAlign: 'center' },
  rowLabel:       { fontSize: 14, fontWeight: '500', color: colors.textPrimary },
  rowLabelDanger: { color: colors.danger, fontWeight: '600' },
  rowRight:       { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 0, maxWidth: '55%' },
  rowValue:       { fontSize: 13, color: colors.textMuted, textAlign: 'right', flexShrink: 1 },
  rowChevron:     { fontSize: 20, color: colors.textMuted, lineHeight: 24 },
  rowChevronDanger: { color: '#e57373' },

  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999,
    backgroundColor: colors.background,
    borderWidth: 1.5, borderColor: colors.border,
  },
  chipSelected: { backgroundColor: colors.primaryLight, borderColor: colors.primary },
  chipText:         { fontSize: 12, fontWeight: '500', color: colors.textSecondary },
  chipTextSelected: { color: colors.primary, fontWeight: '700' },
  savingText: { fontSize: 12, color: colors.textMuted, marginBottom: 8 },
  qualInlineInput: {
    flex: 1, borderWidth: 1.5, borderColor: colors.primary, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 8, fontSize: 14, color: colors.textPrimary,
  },
  qualConfirmBtn: {
    backgroundColor: colors.primary, borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 8, justifyContent: 'center',
  },
  qualConfirmText: { color: colors.white, fontWeight: '700', fontSize: 13 },

  signOutBtn: {
    borderWidth: 1.5,
    borderColor: colors.danger,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  signOutText: { fontSize: 15, fontWeight: '700', color: colors.danger },

  // ─── Location modal ───────────────────────────────────────────────────────
  locationOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  locationBox: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 40,
    minHeight: 380,
  },
  locationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  locationTitle: { fontSize: 17, fontWeight: '700', color: colors.textPrimary },
  locationClose: { fontSize: 16, color: colors.textMuted, fontWeight: '600', padding: 4 },
  locationHint:  { fontSize: 13, color: colors.textSecondary, marginBottom: 16 },
  locationCancelBtn: {
    marginTop: 16,
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  locationCancelText: { fontSize: 14, fontWeight: '600', color: colors.textSecondary },

  // ─── Edit modal ───────────────────────────────────────────────────────────
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalBox: {
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 380,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  modalTitle: { fontSize: 16, fontWeight: '700', color: colors.textPrimary, marginBottom: 12 },
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
  modalActions:     { flexDirection: 'row', gap: 10 },
  modalCancel: {
    flex: 1, borderRadius: 10, paddingVertical: 14, alignItems: 'center',
    borderWidth: 1.5, borderColor: colors.border, minHeight: 52, justifyContent: 'center',
  },
  modalCancelText: { fontSize: 14, fontWeight: '600', color: colors.textSecondary },
  modalSave: {
    flex: 1, borderRadius: 10, paddingVertical: 14, alignItems: 'center',
    backgroundColor: colors.primary, minHeight: 52, justifyContent: 'center',
  },
  modalSaveText: { fontSize: 14, fontWeight: '700', color: colors.white },
})
