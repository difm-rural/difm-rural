import React, { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
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
import Icon from '../../components/Icon'
import Loading from '../../components/Loading'
import Button from '../../components/Button'
import { canProvide } from '../../lib/roles'
import { loadUserPreferences, updateUserPreferences } from '../../lib/preferences'
import AddressAutocomplete from '../../components/AddressAutocomplete'
import CapabilityPicker from '../../components/CapabilityPicker'
import {
  authenticate,
  clearSession,
  clearSessionTokens,
  getBiometricType,
  isBiometricAvailable,
  isBiometricEnabled,
  saveSession,
} from '../../lib/biometrics'

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const SECTION_TITLES = {
  hub:     'Account',
  profile: 'Profile',
  account: 'Account settings',
  privacy: 'Privacy',
}

function getDisplayLocation(addr) {
  if (!addr) return ''
  const parts = addr.split(',').map(s => s.trim()).filter(Boolean)
  return parts.slice(-3, -1).join(', ').trim() || addr
}

function MenuRow({ icon, label, sub, value, onPress, last, danger }) {
  return (
    <TouchableOpacity
      style={[styles.row, !last && styles.rowBorder]}
      onPress={onPress}
      activeOpacity={0.6}
      accessibilityRole="button"
      accessibilityLabel={`${label}${value ? `, ${value}` : ''}`}
      accessibilityHint="Double tap to open">
      <View style={styles.rowLeft}>
        <Icon name={icon} size={18} color={danger ? colors.danger : colors.textSecondary} style={styles.rowIcon} />
        <View style={styles.rowLabelWrap}>
          <Text style={[styles.rowLabel, danger && styles.rowLabelDanger]}>{label}</Text>
          {!!sub && <Text style={styles.rowSub} numberOfLines={2}>{sub}</Text>}
        </View>
      </View>
      <View style={styles.rowRight}>
        {!!value && (
          <Text style={styles.rowValue} numberOfLines={1}>{value}</Text>
        )}
        <Icon name="chevron-forward" size={16} color={danger ? colors.danger : colors.textMuted} style={styles.rowChevron} />
      </View>
    </TouchableOpacity>
  )
}

function HubButton({ icon, label, sub, onPress }) {
  return (
    <TouchableOpacity
      style={styles.hubButton}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={label}>
      <Icon name={icon} size={22} color={colors.primary} style={styles.hubIcon} />
      <View style={{ flex: 1 }}>
        <Text style={styles.hubLabel}>{label}</Text>
        <Text style={styles.hubSub}>{sub}</Text>
      </View>
      <Icon name="chevron-forward" size={18} color={colors.textMuted} />
    </TouchableOpacity>
  )
}

function Stat({ number, label }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statNum}>{number}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  )
}

export default function AccountTabScreen({ navigation }) {
  const insets = useSafeAreaInsets()
  const { refreshProfile } = useUser()

  const [section, setSection]               = useState('hub')
  const [loading, setLoading]               = useState(true)
  const [saving, setSaving]                 = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [avatarUrl, setAvatarUrl]           = useState(null)
  const [userId, setUserId]                 = useState(null)
  const [email, setEmail]                   = useState('')
  const [memberSince, setMemberSince]       = useState('')
  const [monthsOnboard, setMonthsOnboard]   = useState(0)
  const [jobsAndServices, setJobsAndServices] = useState(0)
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
  const [dailyDigest,        setDailyDigest]        = useState(false)
  const [locationModalVisible, setLocationModalVisible] = useState(false)
  const [editModal, setEditModal]           = useState({
    visible: false, field: '', label: '', value: '', keyboardType: 'default',
  })

  useFocusEffect(useCallback(() => { loadProfile() }, []))

  // Hardware back returns to the hub before leaving the tab.
  useEffect(() => {
    const onBack = () => {
      if (section !== 'hub') { setSection('hub'); return true }
      return false
    }
    const sub = BackHandler.addEventListener('hardwareBackPress', onBack)
    return () => sub.remove()
  }, [section])

  async function loadProfile() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    setUserId(user.id)
    setEmail(user.email || '')
    const created = new Date(user.created_at)
    setMemberSince(`${MONTHS[created.getMonth()]} ${created.getFullYear()}`)
    setMonthsOnboard(Math.max(0, Math.floor((Date.now() - created.getTime()) / (1000 * 60 * 60 * 24 * 30.44))))

    const [{ data: profileData }, { data: reviewsData }, { count: jobCount }, { count: serviceCount }] = await Promise.all([
      supabase.from('profiles')
        .select('full_name, phone, region, avatar_url, primary_role, role, is_admin, display_name, bio, skills, qualifications, address, latitude, longitude')
        .eq('id', user.id)
        .single(),
      supabase.from('reviews').select('rating').eq('reviewee_id', user.id),
      supabase.from('jobs').select('id', { count: 'exact', head: true }).eq('requester_id', user.id),
      supabase.from('services').select('id', { count: 'exact', head: true }).eq('provider_id', user.id),
    ])

    if (profileData) {
      setProfile(profileData)
      setAvatarUrl(profileData.avatar_url || null)
      setSkills(profileData.skills || [])
      setQualifications(profileData.qualifications || [])
    }
    setJobsAndServices((jobCount || 0) + (serviceCount || 0))

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

    const prefs = await loadUserPreferences()
    setDailyDigest(!!prefs?.daily_digest)

    setLoading(false)
  }

  // ─── Daily summary toggle ──────────────────────────────────────────────────
  async function handleDailyDigestToggle() {
    const next = !dailyDigest
    setDailyDigest(next)                              // optimistic
    await updateUserPreferences({ daily_digest: next })
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

  async function updateRole(newRole) {
    if (!userId) return
    // The legacy `role` column only allows requester/provider — map 'both'.
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
    Alert.alert('Updated', 'Your role has been updated.')
  }

  // Main-screen "I also provide" switch: on → both, off → requester.
  function handleProvideToggle(value) {
    updateRole(value ? 'both' : 'requester')
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
    Alert.alert('Log out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log out',
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
      <View style={styles.screen}>
        <Loading />
      </View>
    )
  }

  const initials   = (profile.full_name || 'U')
    .split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()
  const hasPhoto   = !!avatarUrl
  const ratingText = ratingSummary.count > 0
    ? `${Number(ratingSummary.average || 0).toFixed(1)} / 5 · ${ratingSummary.count} review${ratingSummary.count === 1 ? '' : 's'}`
    : 'No reviews yet'
  const isProvider = canProvide(profile)
  const isAdmin = !!profile?.is_admin
  const locationDisplay = getDisplayLocation(profile.address) || profile.address || '—'

  const onboardYears = Math.floor(monthsOnboard / 12)
  const onboardValue = onboardYears >= 1 ? onboardYears : monthsOnboard
  const onboardLabel = onboardYears >= 1
    ? (onboardYears === 1 ? 'Year onboard' : 'Years onboard')
    : 'Months onboard'

  // ─── Avatar element (shared by hub) ─────────────────────────────────────────
  const avatarEl = (
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
        <Icon name="camera" size={14} color="#fff" />
      </View>
    </TouchableOpacity>
  )

  // ─── Hub ────────────────────────────────────────────────────────────────────
  const hubContent = (
    <>
      <View style={styles.summaryCard}>
        <View style={styles.summaryLeft}>
          {avatarEl}
          <Text style={styles.summaryName} numberOfLines={1}>{profile.full_name || 'User'}</Text>
          <Text style={styles.summaryLocation} numberOfLines={1}>{locationDisplay}</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryRight}>
          <Stat number={jobsAndServices} label="Jobs and Services" />
          <Stat number={ratingSummary.count} label="Reviews" />
          <Stat number={onboardValue} label={onboardLabel} />
        </View>
      </View>

      <View style={styles.provideCard}>
        <View style={{ flex: 1, marginRight: 12 }}>
          <Text style={styles.provideTitle}>I also provide</Text>
          <Text style={styles.provideSub}>Make offers on jobs and list your own services.</Text>
        </View>
        <Switch
          value={isProvider}
          onValueChange={handleProvideToggle}
          trackColor={{ false: colors.border, true: colors.primary }}
          thumbColor={colors.white}
          ios_backgroundColor={colors.border}
          accessibilityLabel="I also provide"
        />
      </View>

      <View style={styles.hubButtons}>
        {isAdmin && (
          <HubButton
            icon="speedometer-outline" label="Admin" sub="Jobs, services, bookings, activity"
            onPress={() => navigation.navigate('Admin')}
          />
        )}
        <HubButton
          icon="person-outline" label="Profile" sub="Photo, name, bio, skills"
          onPress={() => setSection('profile')}
        />
        <HubButton
          icon="settings-outline" label="Account settings" sub="Contact details, mode, notifications"
          onPress={() => setSection('account')}
        />
        <HubButton
          icon="lock-closed-outline" label="Privacy" sub="Security, terms, support"
          onPress={() => setSection('privacy')}
        />
      </View>

      <Button
        variant="destructive"
        title="Log out"
        onPress={handleSignOut}
        style={{ marginHorizontal: 16, marginTop: 20 }}
        accessibilityLabel="Log out"
      />
    </>
  )

  // ─── Profile section ────────────────────────────────────────────────────────
  const profileContent = (
    <View style={styles.body}>
      <Text style={styles.sectionLabel}>About you</Text>
      <View style={styles.card}>
        <MenuRow
          icon="person-outline" label="Full name" value={profile.full_name || '—'}
          onPress={() => openEdit('full_name', 'Full name', profile.full_name)}
        />
        <MenuRow
          icon="pricetag-outline" label="Display name" value={profile.display_name || '—'}
          onPress={() => openEdit('display_name', 'Display name', profile.display_name)}
        />
        <MenuRow
          icon="location-outline" label="Location" value={locationDisplay}
          onPress={openLocationModal}
        />
        <MenuRow
          icon="document-text-outline" label="Bio" value={profile.bio ? profile.bio.slice(0, 30) + (profile.bio.length > 30 ? '…' : '') : '—'} last
          onPress={() => openEdit('bio', 'Short bio', profile.bio)}
        />
      </View>

      {isProvider && (
        <>
          <Text style={styles.sectionLabel}>Skills</Text>
          <View style={[styles.card, { padding: 14 }]}>
            {savingSkills && <Text style={styles.savingText}>Saving…</Text>}
            <CapabilityPicker selected={skills} onToggle={toggleSkill} />
          </View>

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
                  <Icon name="school-outline" size={18} color={colors.textSecondary} style={styles.rowIcon} />
                  <Text style={[styles.rowLabel, { flex: 1 }]} numberOfLines={2}>{q}</Text>
                </View>
                <TouchableOpacity
                  onPress={() => removeQual(i)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${q}`}>
                  <Icon name="close" size={14} color={colors.danger} />
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
                  <Icon name="close" size={16} color={colors.textMuted} />
                </TouchableOpacity>
              </View>
            )}
            <TouchableOpacity
              style={styles.row}
              onPress={() => setShowQualInput(true)}
              accessibilityRole="button"
              accessibilityLabel="Add a qualification">
              <View style={styles.rowLeft}>
                <Icon name="add" size={18} color={colors.primary} style={styles.rowIcon} />
                <Text style={[styles.rowLabel, { color: colors.primary }]}>Add a qualification</Text>
              </View>
            </TouchableOpacity>
          </View>

          <Text style={styles.sectionLabel}>Provider tools</Text>
          <View style={styles.card}>
            <MenuRow
              icon="construct-outline" label="My services"
              onPress={() => navigation.navigate('MyServices')}
            />
            <MenuRow
              icon="star-outline" label="My ratings" value={ratingText} last
              onPress={() => Alert.alert('My ratings', ratingText)}
            />
          </View>
        </>
      )}
    </View>
  )

  // ─── Account settings section ───────────────────────────────────────────────
  const accountContent = (
    <View style={styles.body}>
      <Text style={styles.sectionLabel}>Contact</Text>
      <View style={styles.card}>
        <MenuRow
          icon="mail-outline" label="Email" value={email}
          onPress={() => Alert.alert('Email', 'To change your email, please contact support.')}
        />
        <MenuRow
          icon="call-outline" label="Phone" value={profile.phone || '—'} last
          onPress={() => openEdit('phone', 'Phone number', profile.phone, 'phone-pad')}
        />
      </View>

      <Text style={styles.sectionLabel}>App</Text>
      <View style={styles.card}>
        <MenuRow
          icon="mail-outline"
          label="Daily summary"
          sub="A morning notification of your jobs and bookings in flight"
          value={dailyDigest ? 'On' : 'Off'}
          last
          onPress={handleDailyDigestToggle}
        />
      </View>
    </View>
  )

  // ─── Privacy section ────────────────────────────────────────────────────────
  const privacyContent = (
    <View style={styles.body}>
      <Text style={styles.sectionLabel}>Security</Text>
      <View style={styles.card}>
        {biometricAvailable && (
          <MenuRow
            icon="shield-checkmark-outline"
            label="Biometric login"
            value={biometricEnabled ? 'Enabled' : 'Disabled'}
            onPress={handleBiometricToggle}
          />
        )}
        <MenuRow
          icon="document-text-outline" label="Terms & privacy" last
          onPress={() => Alert.alert('Terms & privacy', 'Terms and privacy policy coming soon.')}
        />
      </View>

      <Text style={styles.sectionLabel}>Support</Text>
      <View style={styles.card}>
        <MenuRow
          icon="help-circle-outline" label="Help & FAQ"
          onPress={() => Alert.alert('Help', 'Help documentation coming soon.')}
        />
        <MenuRow
          icon="mail-outline" label="Contact us" last
          onPress={() => Alert.alert('Contact us', 'support@difmrural.co.nz')}
        />
      </View>
    </View>
  )

  return (
    <View style={styles.screen}>
      {/* ── Fixed header ────────────────────────────────────────────────────── */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        {section === 'hub' ? (
          <Text style={styles.brandLabel}>RURAL CONNECTIONS</Text>
        ) : (
          <TouchableOpacity
            onPress={() => setSection('hub')}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel="Back to account">
            <Text style={styles.headerBack}><Icon name="chevron-back" size={14} color={colors.primary} /> Account</Text>
          </TouchableOpacity>
        )}
        <Text style={styles.headerLabel} accessibilityRole="header">{SECTION_TITLES[section]}</Text>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: 16, paddingBottom: insets.bottom + 80 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled">
        {section === 'hub'     && hubContent}
        {section === 'profile' && profileContent}
        {section === 'account' && accountContent}
        {section === 'privacy' && privacyContent}
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
                <Icon name="close" size={16} color={colors.textMuted} />
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
    backgroundColor: colors.background,
    paddingHorizontal: 20,
    paddingBottom: 14,
  },
  brandLabel:  { fontSize: 12, fontWeight: '700', color: colors.accent, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 6 },
  headerBack:  { fontSize: 15, fontWeight: '600', color: colors.primary, marginBottom: 6 },
  headerLabel: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.textPrimary,
  },

  // ─── Hub summary card ──────────────────────────────────────────────────────
  summaryCard: {
    flexDirection: 'row',
    backgroundColor: colors.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#ececec',
    marginHorizontal: 16,
    padding: 18,
    alignItems: 'center',
  },
  summaryLeft:    { flex: 1, alignItems: 'center', paddingRight: 12 },
  summaryDivider: { width: 1, alignSelf: 'stretch', backgroundColor: '#ececec', marginVertical: 4 },
  summaryRight:   { flex: 1, paddingLeft: 18, gap: 14 },
  summaryName:     { fontSize: 18, fontWeight: '700', color: colors.textPrimary, marginTop: 10, textAlign: 'center' },
  summaryLocation: { fontSize: 12, color: colors.textMuted, marginTop: 2, textAlign: 'center' },
  stat:      {},
  statNum:   { fontSize: 22, fontWeight: '700', color: colors.textPrimary },
  statLabel: { fontSize: 12, color: colors.textMuted, marginTop: 1 },

  // ─── Hub buttons ───────────────────────────────────────────────────────────
  hubButtons: { paddingHorizontal: 16, gap: 12, marginTop: 20 },
  hubButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#ececec',
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  hubIcon:    { fontSize: 22, width: 36 },
  hubLabel:   { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  hubSub:     { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  hubChevron: { fontSize: 24, color: colors.textMuted, fontWeight: '300' },

  // ─── Avatar ────────────────────────────────────────────────────────────────
  avatarWrap: { position: 'relative' },
  avatarCircle: {
    width: 84,
    height: 84,
    borderRadius: 42,
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
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 3,
    elevation: 4,
  },
  cameraBtnText: { fontSize: 12 },

  // ─── Body / sections ───────────────────────────────────────────────────────
  body: { padding: 16, paddingTop: 4 },

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
  rowBorder:      { borderBottomWidth: 1, borderBottomColor: '#f2f2f2' },
  rowLeft:        { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 },
  rowLabelWrap:   { flex: 1 },
  rowSub:         { fontSize: 12, color: colors.textMuted, marginTop: 2 },
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

  // "I also provide" toggle card on the main Account screen
  provideCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginHorizontal: 16,
    marginTop: 16,
  },
  provideTitle: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  provideSub:   { fontSize: 12.5, color: colors.textSecondary, marginTop: 2 },

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
