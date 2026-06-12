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
import AddressAutocomplete from '../components/AddressAutocomplete'

const SKILLS = [
  'Fencing', 'General labour', 'Machinery operation', 'Animal care',
  'Water systems', 'Property maintenance', 'Landscaping', 'Irrigation',
  'Welding', 'Electrical', 'Plumbing', 'Spraying',
  'Trucking', 'Shearing', 'Chainsaw', 'Tractor operation', 'Other',
]

const ROLE_OPTIONS = [
  { key: 'requester', emoji: '🏡', label: 'Post jobs',  sub: 'I need jobs done on my property' },
  { key: 'provider',  emoji: '🔧', label: 'Do jobs',   sub: 'I provide rural services' },
  { key: 'both',      emoji: '🔄', label: 'Both',       sub: 'I do both' },
]

// Step meta indexed by step number (0–4)
const STEP_META = [
  { title: 'DIFM RURAL',   subtitle: null },                              // 0 role selection
  { title: 'DIFM RURAL',   subtitle: null },                              // 1 welcome
  { title: 'Your profile', subtitle: 'How others will see you' },         // 2 details
  { title: 'Your skills',  subtitle: 'What can you help with?' },         // 3 skills
  { title: 'All set!',     subtitle: 'Your profile is ready' },           // 4 summary
]

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

  // step 0 = role selection, 1 = welcome, 2 = profile, 3 = skills, 4 = summary
  const [step, setStep]         = useState(0)
  const [saving, setSaving]     = useState(false)
  const [uploading, setUploading] = useState(false)

  // Role (new: selected in step 0)
  const [primaryRole, setPrimaryRole] = useState(
    initialProfile?.primary_role || initialProfile?.role || null
  )

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
  const [skills,         setSkills]         = useState(initialProfile?.skills         || [])
  const [qualifications, setQualifications] = useState(initialProfile?.qualifications || [])
  const [qualInput,      setQualInput]      = useState('')
  const [showQualInput,  setShowQualInput]  = useState(false)

  // Derived
  const roleLabel   = primaryRole === 'provider' ? 'Provider' : primaryRole === 'both' ? 'Both' : 'Requester'
  const isRequester = primaryRole === 'requester'
  const initials    = getInitials(displayName || fullName)

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
      setPrimaryRole(profile.primary_role || profile.role || null)
      setFullName(profile.full_name || '')
      setDisplayName(profile.display_name || profile.full_name?.trim().split(/\s+/)[0] || '')
      setPhone(profile.phone || '')
      setAddress(profile.address || '')
      setLatitude(profile.latitude || null)
      setLongitude(profile.longitude || null)
      setBio(profile.bio || '')
      setSkills(profile.skills || [])
      setQualifications(profile.qualifications || [])
      setAvatarUrl(profile.avatar_url || null)
    }
  }

  // ─── Persistence helpers ──────────────────────────────────────────────────────

  async function markComplete() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.id) { onComplete(); return }
    await supabase
      .from('profiles')
      .update({ onboarding_completed: true })
      .eq('id', user.id)
    onComplete()
  }

  async function savePrimaryRole() {
    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user?.id) {
        Alert.alert('Error', 'Not logged in. Please restart the app.')
        return
      }
      const { error } = await supabase
        .from('profiles')
        .update({ primary_role: primaryRole, role: primaryRole })
        .eq('id', user.id)
      if (error) {
        Alert.alert('Error saving', error.message)
        return
      }
      setStep(1)
    } finally {
      setSaving(false)
    }
  }

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
      setStep(isRequester ? 4 : 3)
    } finally {
      setSaving(false)
    }
  }

  async function saveStep3AndAdvance() {
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
          skills:         skills,
          qualifications: qualifications,
        })
        .eq('id', user.id)
      if (error) {
        Alert.alert('Error saving', error.message)
        return
      }
      setStep(4)
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

  function toggleSkill(skill) {
    setSkills(prev =>
      prev.includes(skill) ? prev.filter(s => s !== skill) : [...prev, skill]
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
    if (step === 0) {
      if (!primaryRole) {
        Alert.alert('Select a role', 'Please choose how you will use the app.')
        return
      }
      savePrimaryRole()
      return
    }
    if (step === 1) { setStep(2); return }
    if (step === 2) { saveStep2AndAdvance(); return }
    if (step === 3) { saveStep3AndAdvance(); return }
    if (step === 4) { markComplete(); return }
  }

  async function handleSkip() {
    // Role selection (step 0) cannot be skipped
    if (step === 0) return
    await markComplete()
  }

  // ─── Step renderers ───────────────────────────────────────────────────────────

  function renderStep0() {
    return (
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.stepContent, { paddingBottom: insets.bottom + 120 }]}
        keyboardShouldPersistTaps="handled">
        {ROLE_OPTIONS.map(r => (
          <TouchableOpacity
            key={r.key}
            style={[styles.roleTile, primaryRole === r.key && styles.roleTileSelected]}
            onPress={() => setPrimaryRole(r.key)}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityState={{ selected: primaryRole === r.key }}
            accessibilityLabel={`${r.label} — ${r.sub}`}>
            <Text style={styles.roleTileEmoji}>{r.emoji}</Text>
            <View style={styles.roleTileBody}>
              <Text style={[styles.roleTileLabel, primaryRole === r.key && styles.roleTileLabelSelected]}>
                {r.label}
              </Text>
              <Text style={[styles.roleTileSub, primaryRole === r.key && styles.roleTileSubSelected]}>
                {r.sub}
              </Text>
            </View>
            {primaryRole === r.key && (
              <Text style={styles.roleTileCheck}>✓</Text>
            )}
          </TouchableOpacity>
        ))}
      </ScrollView>
    )
  }

  function renderStep1() {
    return (
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.stepContent, { paddingBottom: insets.bottom + 120 }]}
        keyboardShouldPersistTaps="handled">

        <View style={styles.infoCard}>
          <Text style={styles.infoCardIcon}>👤</Text>
          <View style={styles.infoCardBody}>
            <Text style={styles.infoCardLabel}>You're set up as</Text>
            <View style={styles.roleBadge}>
              <Text style={styles.roleBadgeText}>{roleLabel}</Text>
            </View>
          </View>
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.infoCardIcon}>⚡</Text>
          <View style={styles.infoCardBody}>
            <Text style={styles.infoCardLabel}>
              Quick setup — {isRequester ? '2' : '3'} steps
            </Text>
            <Text style={styles.infoCardSub}>
              Takes less than 2 minutes. You can skip anything and update it later in Account settings.
            </Text>
          </View>
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.infoCardIcon}>🔒</Text>
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

  function renderStep2() {
    return (
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.stepContent, { paddingBottom: insets.bottom + 120 }]}
          keyboardShouldPersistTaps="handled">

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
                <Text style={{ fontSize: 12 }}>📷</Text>
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

  function renderStep3() {
    return (
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.stepContent, { paddingBottom: insets.bottom + 120 }]}
          keyboardShouldPersistTaps="handled">

          <Text style={styles.introText}>
            Select any skills you have — this helps match you with relevant jobs
          </Text>

          <Text style={styles.fieldLabel}>Skills</Text>
          <View style={styles.chipGrid}>
            {SKILLS.map(skill => {
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

          <Text style={[styles.fieldLabel, { marginTop: 20 }]}>
            Qualifications <Text style={styles.optional}>(optional)</Text>
          </Text>

          {qualifications.map((q, i) => (
            <View key={i} style={styles.qualRow}>
              <Text style={styles.qualIcon}>🎓</Text>
              <Text style={styles.qualText} numberOfLines={2}>{q}</Text>
              <TouchableOpacity
                onPress={() => removeQual(i)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${q}`}>
                <Text style={styles.qualRemove}>✕</Text>
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
                <Text style={styles.qualCancelBtnText}>✕</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.qualAddRow}
              onPress={() => setShowQualInput(true)}
              accessibilityRole="button"
              accessibilityLabel="Add a qualification">
              <Text style={styles.qualAddIcon}>＋</Text>
              <Text style={styles.qualAddText}>Add a qualification...</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    )
  }

  function renderStep4() {
    const shownSkills = skills.slice(0, 4)
    const extraSkills = skills.length > 4 ? skills.length - 4 : 0
    const nameToShow  = displayName || fullName || 'Welcome!'
    const locationStr = getDisplayLocation(address)

    return (
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.stepContent, { paddingBottom: insets.bottom + 120 }]}
        keyboardShouldPersistTaps="handled">

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
            {!!locationStr && <Text style={styles.summaryMetaText}>📍 {locationStr}</Text>}
            <View style={styles.roleBadge}>
              <Text style={styles.roleBadgeText}>{roleLabel}</Text>
            </View>
          </View>
          {!isRequester && skills.length > 0 && (
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
            Start by posting a task or browsing services in your area. You can update your profile anytime from the Account tab.
          </Text>
        </View>

        <View style={styles.actionCards}>
          <TouchableOpacity
            style={styles.actionCard}
            onPress={markComplete}
            accessibilityRole="button"
            accessibilityLabel="Post a task">
            <Text style={styles.actionCardIcon}>📋</Text>
            <Text style={styles.actionCardTitle}>Post a task</Text>
            <Text style={styles.actionCardSub}>Get rural help sorted</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionCard}
            onPress={markComplete}
            accessibilityRole="button"
            accessibilityLabel="Browse services">
            <Text style={styles.actionCardIcon}>🔍</Text>
            <Text style={styles.actionCardTitle}>Browse services</Text>
            <Text style={styles.actionCardSub}>Find local providers</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    )
  }

  // ─── Render ───────────────────────────────────────────────────────────────────

  const meta       = STEP_META[step] || STEP_META[0]
  const isLastStep = step === 4
  // Steps for requester: 0,1,2,4 (skip 3) → 4 total. Provider: 0–4 → 5 total.
  const totalSteps  = isRequester ? 4 : 5
  const currentDot  = Math.min(step + 1, totalSteps)
  const progressPct = isRequester
    ? ({ 0: 25, 1: 50, 2: 75, 4: 100 }[step] ?? 100)
    : ({ 0: 20, 1: 40, 2: 60, 3: 80, 4: 100 }[step] ?? 100)
  const btnLabel = isLastStep ? 'Go to dashboard →' : saving ? 'Saving…' : 'Next →'

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>

      {/* Green header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          {step <= 1 ? (
            <Text style={styles.brandLabel}>DIFM RURAL</Text>
          ) : (
            <Text style={styles.stepKicker}>{meta.title}</Text>
          )}
          <StepDots current={currentDot} total={totalSteps} />
        </View>

        {step === 0 ? (
          <>
            <Text style={styles.headerTitle}>Welcome to DIFM Rural</Text>
            <Text style={styles.headerSub}>How will you mainly use the app?</Text>
          </>
        ) : step === 1 ? (
          <>
            <Text style={styles.headerTitle}>Welcome!</Text>
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
        {step === 4 && renderStep4()}
      </View>

      {/* Footer */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <TouchableOpacity
          style={[styles.nextBtn, saving && { opacity: 0.7 }]}
          onPress={handleNext}
          disabled={saving}
          accessibilityRole="button"
          accessibilityLabel={btnLabel}>
          <Text style={styles.nextBtnText}>{btnLabel}</Text>
        </TouchableOpacity>
        {/* Skip is not available for step 0 (role required) or last step */}
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

  // ─── Role selection tiles (Step 0) ────────────────────────────────────────────
  roleTile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: 18,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  roleTileSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  roleTileEmoji: { fontSize: 32 },
  roleTileBody:  { flex: 1 },
  roleTileLabel: {
    fontSize: 18, fontWeight: '700', color: colors.textPrimary, marginBottom: 4,
  },
  roleTileLabelSelected: { color: colors.primary },
  roleTileSub: { fontSize: 14, color: colors.textSecondary, lineHeight: 20 },
  roleTileSubSelected: { color: colors.primaryDark },
  roleTileCheck: { fontSize: 22, color: colors.primary, fontWeight: '700' },

  // ─── Info cards (Step 1) ──────────────────────────────────────────────────────
  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  infoCardIcon:  { fontSize: 22, lineHeight: 28, marginTop: 1 },
  infoCardBody:  { flex: 1 },
  infoCardLabel: { fontSize: 15, fontWeight: '700', color: colors.textPrimary, marginBottom: 5 },
  infoCardSub:   { fontSize: 13, color: colors.textSecondary, lineHeight: 19 },
  roleBadge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.primaryLight,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
    marginTop: 4,
  },
  roleBadgeText: { fontSize: 13, fontWeight: '700', color: colors.primary },

  // ─── Step 2 ───────────────────────────────────────────────────────────────────
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

  // ─── Step 3 ───────────────────────────────────────────────────────────────────
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
    borderRadius: 10, padding: 12, marginBottom: 8,
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
    borderRadius: 10,
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
    borderRadius: 10, padding: 12,
    borderWidth: 1.5, borderColor: colors.border, borderStyle: 'dashed',
    marginTop: 4,
  },
  qualAddIcon: { fontSize: 16, color: colors.primary, fontWeight: '700' },
  qualAddText: { fontSize: 14, color: colors.primary, fontWeight: '600' },

  // ─── Step 4 ───────────────────────────────────────────────────────────────────
  summaryCard: {
    backgroundColor: colors.white,
    borderRadius: 16, padding: 20, marginBottom: 14,
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
    borderRadius: 16, padding: 18, marginBottom: 14,
    borderWidth: 1, borderColor: colors.border,
  },
  whatsNextTitle: { fontSize: 16, fontWeight: '700', color: colors.textPrimary, marginBottom: 6 },
  whatsNextBody:  { fontSize: 14, color: colors.textSecondary, lineHeight: 21 },

  actionCards: { flexDirection: 'row', gap: 10 },
  actionCard: {
    flex: 1, backgroundColor: colors.white,
    borderRadius: 16, padding: 16,
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
  nextBtn: {
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: 17,
    alignItems: 'center',
    marginBottom: 10,
    minHeight: 54,
    justifyContent: 'center',
  },
  nextBtnText: { color: colors.white, fontSize: 16, fontWeight: '700' },
  skipBtn:     { minHeight: 36, alignItems: 'center', justifyContent: 'center' },
  skipBtnText: { color: colors.textMuted, fontSize: 14 },
})
