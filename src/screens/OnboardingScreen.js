import React, { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Image,
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
import { pickAndUploadAvatar, removeAvatar as removeAvatarRecord } from '../lib/uploadAvatar'
import { supabase } from '../lib/supabase'
import { colors } from '../theme/tokens'
import Icon from '../components/Icon'
import Button from '../components/Button'
import AddressAutocomplete from '../components/AddressAutocomplete'
import { CATEGORIES, CATEGORY_CAPABILITIES } from '../lib/categories'

// Step meta indexed by step number (0–3). The requester/provider choice is retired:
// everyone goes through the same flow and is recorded as 'both' on completion.
const STEP_META = [
  { title: 'RURAL CONNECTIONS', subtitle: null },                                  // 0 welcome
  { title: 'Your profile', subtitle: 'How others will see you' },                  // 1 profile
  { title: 'Offer work?',  subtitle: 'Optional — the areas you can help with' },   // 2 offer
  { title: 'All set!',     subtitle: 'Your profile is ready' },                    // 3 summary
]

// Which top-level categories a capability list implies (any capability under a
// category selects it). Used to seed the category chips from stored skills.
const deriveCategories = (sk) => {
  const list = Array.isArray(sk) ? sk : [] // skills column can be null, not just undefined
  return CATEGORIES.filter(c => (CATEGORY_CAPABILITIES[c] || []).some(cap => list.includes(cap)))
}

function getInitials(name) {
  if (!name) return '?'
  return name.trim().split(/\s+/).map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()
}

function getDisplayLocation(addr) {
  if (!addr) return ''
  const parts = addr.split(',').map(s => s.trim()).filter(Boolean)
  return parts.slice(-3, -1).join(', ').trim() || addr
}

function StepDots({ current, total }) {
  return (
    <View style={styles.dots}>
      {Array.from({ length: total }, (_, i) => i + 1).map(i => (
        <View
          key={i}
          style={[
            styles.dot,
            i < current  && styles.dotDone,
            i === current && styles.dotActive,
          ]}
        />
      ))}
    </View>
  )
}

function ProgressBar({ pct }) {
  return (
    <View style={styles.progressTrack}>
      <View style={[styles.progressFill, { width: `${pct}%` }]} />
    </View>
  )
}

export default function OnboardingScreen({ profile: initialProfile, onComplete }) {
  const insets = useSafeAreaInsets()

  // step 0 = welcome, 1 = profile, 2 = offer (areas), 3 = summary
  const [step, setStep]         = useState(0)
  const [saving, setSaving]     = useState(false)
  const [uploading, setUploading] = useState(false)

  // Profile fields
  const [fullName,    setFullName]    = useState(initialProfile?.full_name    || '')
  const [displayName, setDisplayName] = useState(
    initialProfile?.display_name || initialProfile?.full_name?.trim().split(/\s+/)[0] || ''
  )
  const [phone,     setPhone]     = useState(initialProfile?.phone     || '')
  const [address,   setAddress]   = useState(initialProfile?.address   || '')
  const [latitude,  setLatitude]  = useState(initialProfile?.latitude  || null)
  const [longitude, setLongitude] = useState(initialProfile?.longitude || null)
  const [bio,       setBio]       = useState(initialProfile?.bio       || '')
  const [avatarUrl,      setAvatarUrl]      = useState(initialProfile?.avatar_url || null)
  const [offerCategories, setOfferCategories] = useState(deriveCategories(initialProfile?.skills))
  const [qualifications, setQualifications] = useState(initialProfile?.qualifications || [])
  const [qualInput,      setQualInput]      = useState('')
  const [showQualInput,  setShowQualInput]  = useState(false)

  // Derived
  const initials = getInitials(displayName || fullName)

  // ─── Fresh data load ──────────────────────────────────────────────────────────

  useEffect(() => {
    loadProfile()
  }, [])

  async function loadProfile() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()
    if (profile) {
      setFullName(profile.full_name || '')
      setDisplayName(profile.display_name || profile.full_name?.trim().split(/\s+/)[0] || '')
      setPhone(profile.phone || '')
      setAddress(profile.address || '')
      setLatitude(profile.latitude || null)
      setLongitude(profile.longitude || null)
      setBio(profile.bio || '')
      setOfferCategories(deriveCategories(profile.skills || []))
      setQualifications(profile.qualifications || [])
      setAvatarUrl(profile.avatar_url || null)
    }
  }

  // ─── Persistence helpers ──────────────────────────────────────────────────────

  async function markComplete() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.id) { onComplete(); return }
    // Record everyone as 'both' (requester + provider) — set here so it applies even
    // when the user skips. The legacy `role` column maps 'both' → provider.
    await supabase
      .from('profiles')
      .update({ onboarding_completed: true, primary_role: 'both', role: 'provider' })
      .eq('id', user.id)
    onComplete()
  }

  // Saves the profile step (step 1) and advances to the skills step.
  async function saveStep2AndAdvance() {
    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user?.id) {
        Alert.alert('Error', 'Not logged in. Please restart the app.')
        return
      }
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name:    fullName.trim()    || null,
          display_name: displayName.trim() || null,
          phone:        phone.trim()       || null,
          address:      address            || null,
          latitude:     latitude           || null,
          longitude:    longitude          || null,
          bio:          bio.trim()         || null,
        })
        .eq('id', user.id)
      if (error) {
        Alert.alert('Error saving', error.message)
        return
      }
      setStep(2)
    } finally {
      setSaving(false)
    }
  }

  // Saves the skills step (step 2) and advances to the summary step.
  async function saveStep3AndAdvance() {
    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user?.id) {
        Alert.alert('Error', 'Not logged in. Please restart the app.')
        return
      }
      // Chips are category-level, but matching SQL compares capability-level skills,
      // so expand the chosen categories to the union of their capabilities on save.
      const expandedSkills = Array.from(new Set(
        offerCategories.flatMap(c => CATEGORY_CAPABILITIES[c] || [])
      ))
      const { error } = await supabase
        .from('profiles')
        .update({
          skills:         expandedSkills,
          qualifications: qualifications,
        })
        .eq('id', user.id)
      if (error) {
        Alert.alert('Error saving', error.message)
        return
      }
      setStep(3)
    } finally {
      setSaving(false)
    }
  }

  // ─── Avatar ───────────────────────────────────────────────────────────────────

  async function handleAvatarPress() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    Alert.alert('Profile photo', 'Choose an option', [
      { text: 'Take a photo',        onPress: () => doUpload(user.id, true) },
      { text: 'Choose from library', onPress: () => doUpload(user.id, false) },
      avatarUrl
        ? { text: 'Remove photo', style: 'destructive', onPress: () => doRemove(user.id) }
        : null,
      { text: 'Cancel', style: 'cancel' },
    ].filter(Boolean))
  }

  async function doUpload(userId, useCamera) {
    setUploading(true)
    const url = await pickAndUploadAvatar(userId, useCamera)
    if (url) setAvatarUrl(url)
    setUploading(false)
  }

  async function doRemove(userId) {
    await removeAvatarRecord(userId)
    setAvatarUrl(null)
  }

  // ─── Skills ───────────────────────────────────────────────────────────────────

  function toggleCategory(c) {
    setOfferCategories(prev =>
      prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c]
    )
  }

  function confirmAddQual() {
    const text = qualInput.trim()
    if (!text) return
    setQualifications(q => [...q, text])
    setQualInput('')
    setShowQualInput(false)
  }

  function removeQual(idx) {
    setQualifications(q => q.filter((_, i) => i !== idx))
  }

  // ─── Navigation ───────────────────────────────────────────────────────────────

  function handleNext() {
    if (step === 0) { setStep(1); return }          // welcome → profile
    if (step === 1) { saveStep2AndAdvance(); return } // profile → skills
    if (step === 2) { saveStep3AndAdvance(); return } // skills → summary
    if (step === 3) { markComplete(); return }        // summary → done
  }

  async function handleSkip() {
    // Welcome (step 0) cannot be skipped
    if (step === 0) return
    await markComplete()
  }

  // ─── Step renderers ───────────────────────────────────────────────────────────

  function renderStep0() {
    return (
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.stepContent, { paddingBottom: insets.bottom + 120 }]}
        keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets={true}>

        <View style={styles.infoCard}>
          <Icon name="flash-outline" size={22} color={colors.primary} />
          <View style={styles.infoCardBody}>
            <Text style={styles.infoCardLabel}>
              Quick setup — 3 steps
            </Text>
            <Text style={styles.infoCardSub}>
              Takes less than 2 minutes. You can skip anything and update it later in Account settings.
            </Text>
          </View>
        </View>

        <View style={styles.infoCard}>
          <Icon name="lock-closed-outline" size={22} color={colors.primary} />
          <View style={styles.infoCardBody}>
            <Text style={styles.infoCardLabel}>Your privacy matters</Text>
            <Text style={styles.infoCardSub}>
              Your contact details are only shared with providers once a job is confirmed.
            </Text>
          </View>
        </View>
      </ScrollView>
    )
  }

  function renderStep1() {
    return (
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
        enabled={Platform.OS === 'android'}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.stepContent, { paddingBottom: insets.bottom + 120 }]}
          keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets={true}>

          {/* Avatar */}
          <View style={styles.avatarRow}>
            <TouchableOpacity
              style={styles.avatarWrap}
              onPress={handleAvatarPress}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Change profile photo">
              <View style={styles.avatarCircle}>
                {uploading ? (
                  <ActivityIndicator color={colors.primary} />
                ) : avatarUrl ? (
                  <Image source={{ uri: avatarUrl }} style={styles.avatarImg} />
                ) : (
                  <Text style={styles.avatarInitials}>{initials}</Text>
                )}
              </View>
              <View style={styles.cameraOverlay}>
                <Icon name="camera" size={12} color={colors.white} />
              </View>
            </TouchableOpacity>
          </View>

          <Text style={styles.fieldLabel}>Full name</Text>
          <TextInput
            style={styles.input}
            value={fullName}
            onChangeText={setFullName}
            placeholder="First and last name"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="words"
            returnKeyType="next"
            accessibilityLabel="Full name"
          />

          <Text style={styles.fieldLabel}>Display name</Text>
          <TextInput
            style={styles.input}
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="First name or nickname"
            placeholderTextColor={colors.textMuted}
            returnKeyType="next"
            accessibilityLabel="Display name"
          />
          <Text style={styles.fieldHelper}>This is how you'll appear to others</Text>

          <Text style={styles.fieldLabel}>Phone number</Text>
          <TextInput
            style={styles.input}
            value={phone}
            onChangeText={setPhone}
            placeholder="e.g. 027 123 4567"
            placeholderTextColor={colors.textMuted}
            keyboardType="phone-pad"
            returnKeyType="next"
            accessibilityLabel="Phone number"
          />

          <Text style={styles.fieldLabel}>Location</Text>
          <AddressAutocomplete
            defaultValue={address}
            placeholder="Search suburb, town or region..."
            onSelect={({ address: addr, latitude: lat, longitude: lng }) => {
              setAddress(addr || '')
              setLatitude(lat)
              setLongitude(lng)
            }}
          />
          <Text style={styles.fieldHelper}>Used to match you with nearby jobs</Text>

          <Text style={styles.fieldLabel}>
            Short bio <Text style={styles.optional}>(optional)</Text>
          </Text>
          <TextInput
            style={[styles.input, styles.inputMulti]}
            value={bio}
            onChangeText={setBio}
            placeholder="Tell others about yourself and your property..."
            placeholderTextColor={colors.textMuted}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
            returnKeyType="done"
            accessibilityLabel="Short bio"
          />
        </ScrollView>
      </KeyboardAvoidingView>
    )
  }

  function renderStep2() {
    return (
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        enabled={Platform.OS === 'android'}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.stepContent, { paddingBottom: insets.bottom + 120 }]}
          keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets={true}>

          <Text style={styles.introText}>
            Planning to offer services or take on jobs? Pick the areas you can help with — or tap Skip below if you're mostly here to find help.
          </Text>

          <View style={styles.chipGrid}>
            {CATEGORIES.map(c => {
              const selected = offerCategories.includes(c)
              return (
                <TouchableOpacity
                  key={c}
                  style={[styles.chip, selected && styles.chipSelected]}
                  onPress={() => toggleCategory(c)}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={c}>
                  <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{c}</Text>
                </TouchableOpacity>
              )
            })}
          </View>

          <Text style={[styles.fieldLabel, { marginTop: 20 }]}>
            Qualifications <Text style={styles.optional}>(optional)</Text>
          </Text>

          {qualifications.map((q, i) => (
            <View key={i} style={styles.qualRow}>
              <Icon name="school-outline" size={16} color={colors.textSecondary} />
              <Text style={styles.qualText} numberOfLines={2}>{q}</Text>
              <TouchableOpacity
                onPress={() => removeQual(i)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${q}`}>
                <Icon name="close" size={14} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
          ))}

          {showQualInput ? (
            <View style={styles.qualInputRow}>
              <TextInput
                style={styles.qualInput}
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
                style={styles.qualAddBtn}
                onPress={confirmAddQual}
                accessibilityRole="button"
                accessibilityLabel="Add">
                <Text style={styles.qualAddBtnText}>Add</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.qualCancelBtn}
                onPress={() => { setShowQualInput(false); setQualInput('') }}
                accessibilityRole="button"
                accessibilityLabel="Cancel">
                <Icon name="close" size={16} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.qualAddRow}
              onPress={() => setShowQualInput(true)}
              accessibilityRole="button"
              accessibilityLabel="Add a qualification">
              <Icon name="add" size={18} color={colors.primary} />
              <Text style={styles.qualAddText}>Add a qualification...</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    )
  }

  function renderStep3() {
    const shownSkills = offerCategories.slice(0, 4)
    const extraSkills = offerCategories.length > 4 ? offerCategories.length - 4 : 0
    const nameToShow  = displayName || fullName || 'Welcome!'
    const locationStr = getDisplayLocation(address)

    return (
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.stepContent, { paddingBottom: insets.bottom + 120 }]}
        keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets={true}>

        <View style={styles.summaryCard}>
          <View style={styles.summaryAvatarRow}>
            <View style={styles.summaryAvatarCircle}>
              {avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={styles.summaryAvatarImg} />
              ) : (
                <Text style={styles.summaryAvatarInitials}>{getInitials(nameToShow)}</Text>
              )}
            </View>
          </View>
          <Text style={styles.summaryName}>{nameToShow}</Text>
          <View style={styles.summaryMeta}>
            {!!locationStr && <Text style={styles.summaryMetaText}><Icon name="location-outline" size={12} color={colors.textMuted} /> {locationStr}</Text>}
          </View>
          {offerCategories.length > 0 && (
            <View style={styles.summaryChips}>
              {shownSkills.map(s => (
                <View key={s} style={styles.summaryChip}>
                  <Text style={styles.summaryChipText}>{s}</Text>
                </View>
              ))}
              {extraSkills > 0 && (
                <View style={styles.summaryChip}>
                  <Text style={styles.summaryChipText}>+{extraSkills} more</Text>
                </View>
              )}
            </View>
          )}
        </View>

        <View style={styles.whatsNextCard}>
          <Text style={styles.whatsNextTitle}>What's next?</Text>
          <Text style={styles.whatsNextBody}>
            Two ways to use Rural Connections: post a Job when you need a hand, or create a Listing to offer a service or sell something. You can do both.
          </Text>
          <Text style={[styles.whatsNextBody, { marginTop: 10 }]}>
            Start by posting a task or browsing services in your area. You can update your profile anytime from the Account tab.
          </Text>
        </View>

        <View style={styles.actionCards}>
          <TouchableOpacity
            style={styles.actionCard}
            onPress={markComplete}
            accessibilityRole="button"
            accessibilityLabel="Post a task">
            <Icon name="clipboard-outline" size={22} color={colors.primary} />
            <Text style={styles.actionCardTitle}>Post a task</Text>
            <Text style={styles.actionCardSub}>Get rural help sorted</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionCard}
            onPress={markComplete}
            accessibilityRole="button"
            accessibilityLabel="Browse listings">
            <Icon name="search-outline" size={22} color={colors.primary} />
            <Text style={styles.actionCardTitle}>Browse services</Text>
            <Text style={styles.actionCardSub}>Find local providers</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    )
  }

  // ─── Render ───────────────────────────────────────────────────────────────────

  const meta        = STEP_META[step] || STEP_META[0]
  const isLastStep  = step === 3
  const totalSteps  = 4
  const currentDot  = step + 1
  const progressPct = ({ 0: 25, 1: 50, 2: 75, 3: 100 }[step] ?? 100)
  const btnLabel    = isLastStep ? 'Go to dashboard' : saving ? 'Saving…' : 'Next'

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>

      {/* Green header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          {step === 0 ? (
            <Text style={styles.brandLabel}>RURAL CONNECTIONS</Text>
          ) : (
            <Text style={styles.stepKicker}>{meta.title}</Text>
          )}
          <StepDots current={currentDot} total={totalSteps} />
        </View>

        {step === 0 ? (
          <>
            <Text style={styles.headerTitle}>Welcome to Rural Connections</Text>
            <Text style={styles.headerSub}>Let's get your account set up</Text>
          </>
        ) : (
          <>
            <Text style={styles.headerTitle}>{meta.title}</Text>
            {meta.subtitle && <Text style={styles.headerSub}>{meta.subtitle}</Text>}
          </>
        )}
        <ProgressBar pct={progressPct} />
      </View>

      {/* Step content */}
      <View style={{ flex: 1 }}>
        {step === 0 && renderStep0()}
        {step === 1 && renderStep1()}
        {step === 2 && renderStep2()}
        {step === 3 && renderStep3()}
      </View>

      {/* Footer */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <Button
          title={btnLabel}
          onPress={handleNext}
          loading={saving}
          style={{ marginBottom: 10 }}
          accessibilityLabel={btnLabel}
        />
        {/* Skip is not available for step 0 (welcome) or last step */}
        {!isLastStep && step > 0 && (
          <TouchableOpacity
            style={styles.skipBtn}
            onPress={handleSkip}
            accessibilityRole="button"
            accessibilityLabel="Skip setup">
            <Text style={styles.skipBtnText}>Skip setup</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },

  // ─── Header ──────────────────────────────────────────────────────────────────
  header: {
    backgroundColor: colors.primary,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  brandLabel: {
    fontSize: 11, fontWeight: '700', color: '#95d5b2',
    letterSpacing: 2.5, textTransform: 'uppercase',
  },
  stepKicker: {
    fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.7)',
    letterSpacing: 1, textTransform: 'uppercase',
  },
  headerTitle: {
    fontSize: 30, fontWeight: '800', color: colors.white, lineHeight: 34, marginBottom: 4,
  },
  headerSub: {
    fontSize: 14, color: 'rgba(255,255,255,0.82)', marginBottom: 16,
  },

  // ─── Step dots ────────────────────────────────────────────────────────────────
  dots: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: {
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  dotDone:   { backgroundColor: '#95d5b2' },
  dotActive: { width: 18, height: 6, borderRadius: 3, backgroundColor: colors.white },

  // ─── Progress bar ─────────────────────────────────────────────────────────────
  progressTrack: {
    height: 3, backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 2, overflow: 'hidden',
  },
  progressFill: {
    height: 3, backgroundColor: colors.white, borderRadius: 2,
  },

  // ─── Step content ─────────────────────────────────────────────────────────────
  stepContent: { padding: 20 },

  // ─── Info cards (Step 0 welcome) ──────────────────────────────────────────────
  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  infoCardIcon:  { fontSize: 22, lineHeight: 28, marginTop: 1 },
  infoCardBody:  { flex: 1 },
  infoCardLabel: { fontSize: 15, fontWeight: '700', color: colors.textPrimary, marginBottom: 5 },
  infoCardSub:   { fontSize: 13, color: colors.textSecondary, lineHeight: 19 },

  // ─── Step 1 (profile) ─────────────────────────────────────────────────────────
  avatarRow:    { alignItems: 'center', marginBottom: 22 },
  avatarWrap:   { position: 'relative' },
  avatarCircle: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: colors.primaryLight,
    borderWidth: 2.5, borderColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImg:      { width: '100%', height: '100%' },
  avatarInitials: { fontSize: 26, fontWeight: '700', color: colors.primary },
  cameraOverlay: {
    position: 'absolute', bottom: 0, right: -2,
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: colors.white,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 3, elevation: 3,
  },

  fieldLabel: {
    fontSize: 13, fontWeight: '700', color: colors.textSecondary,
    marginBottom: 7, marginTop: 14, marginLeft: 2,
  },
  fieldHelper: {
    fontSize: 12, color: colors.textMuted, marginTop: 4, marginLeft: 2, marginBottom: 4,
  },
  optional: { fontWeight: '400', color: colors.textMuted },
  input: {
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 15,
    color: colors.textPrimary,
  },
  inputMulti: {
    height: 84,
    paddingTop: 13,
    textAlignVertical: 'top',
  },

  // ─── Step 2 (skills) ──────────────────────────────────────────────────────────
  introText: {
    fontSize: 14, color: colors.textSecondary, lineHeight: 20, marginBottom: 16,
  },
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 13, paddingVertical: 8, borderRadius: 999,
    backgroundColor: colors.white,
    borderWidth: 1.5, borderColor: colors.border,
  },
  chipSelected: { backgroundColor: colors.primaryLight, borderColor: colors.primary },
  chipText:         { fontSize: 13, fontWeight: '500', color: colors.textSecondary },
  chipTextSelected: { color: colors.primary, fontWeight: '700' },

  qualRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: colors.white,
    borderRadius: 12, padding: 12, marginBottom: 8,
    borderWidth: 1, borderColor: colors.border,
  },
  qualIcon:   { fontSize: 16 },
  qualText:   { flex: 1, fontSize: 14, color: colors.textPrimary },
  qualRemove: { fontSize: 12, color: colors.danger, fontWeight: '700', padding: 4 },

  qualInputRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4,
  },
  qualInput: {
    flex: 1,
    backgroundColor: colors.white,
    borderWidth: 1.5, borderColor: colors.primary,
    borderRadius: 12,
    paddingHorizontal: 13, paddingVertical: 11,
    fontSize: 14, color: colors.textPrimary,
  },
  qualAddBtn: {
    backgroundColor: colors.primary, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 11, justifyContent: 'center',
  },
  qualAddBtnText:    { color: colors.white, fontWeight: '700', fontSize: 13 },
  qualCancelBtn:     { padding: 10 },
  qualCancelBtnText: { color: colors.textMuted, fontSize: 14, fontWeight: '600' },

  qualAddRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: colors.white,
    borderRadius: 12, padding: 12,
    borderWidth: 1.5, borderColor: colors.border, borderStyle: 'dashed',
    marginTop: 4,
  },
  qualAddIcon: { fontSize: 16, color: colors.primary, fontWeight: '700' },
  qualAddText: { fontSize: 14, color: colors.primary, fontWeight: '600' },

  // ─── Step 3 (summary) ─────────────────────────────────────────────────────────
  summaryCard: {
    backgroundColor: colors.white,
    borderRadius: 12, padding: 20, marginBottom: 14,
    alignItems: 'center',
    borderWidth: 1, borderColor: colors.border,
  },
  summaryAvatarRow:    { marginBottom: 12 },
  summaryAvatarCircle: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: colors.primaryLight,
    borderWidth: 2.5, borderColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
  },
  summaryAvatarImg:      { width: '100%', height: '100%' },
  summaryAvatarInitials: { fontSize: 22, fontWeight: '700', color: colors.primary },
  summaryName:  { fontSize: 20, fontWeight: '700', color: colors.textPrimary, marginBottom: 8 },
  summaryMeta:  { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  summaryMetaText: { fontSize: 13, color: colors.textSecondary },
  summaryChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center' },
  summaryChip: {
    backgroundColor: colors.primaryLight, borderRadius: 999,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  summaryChipText: { fontSize: 12, fontWeight: '600', color: colors.primary },

  whatsNextCard: {
    backgroundColor: colors.white,
    borderRadius: 12, padding: 18, marginBottom: 14,
    borderWidth: 1, borderColor: colors.border,
  },
  whatsNextTitle: { fontSize: 16, fontWeight: '700', color: colors.textPrimary, marginBottom: 6 },
  whatsNextBody:  { fontSize: 14, color: colors.textSecondary, lineHeight: 21 },

  actionCards: { flexDirection: 'row', gap: 10 },
  actionCard: {
    flex: 1, backgroundColor: colors.white,
    borderRadius: 12, padding: 16,
    borderWidth: 1, borderColor: colors.border,
    alignItems: 'center',
  },
  actionCardIcon:  { fontSize: 26, marginBottom: 8 },
  actionCardTitle: { fontSize: 14, fontWeight: '700', color: colors.textPrimary, marginBottom: 4, textAlign: 'center' },
  actionCardSub:   { fontSize: 12, color: colors.textSecondary, textAlign: 'center' },

  // ─── Footer ───────────────────────────────────────────────────────────────────
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  skipBtn:     { minHeight: 36, alignItems: 'center', justifyContent: 'center' },
  skipBtnText: { color: colors.textMuted, fontSize: 14 },
})
