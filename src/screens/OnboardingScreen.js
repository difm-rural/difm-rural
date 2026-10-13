import React, { useEffect, useRef, useState } from 'react'
import {
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
import { supabase } from '../lib/supabase'
import { colors } from '../theme/tokens'
import Icon from '../components/Icon'
import Button from '../components/Button'
import AddressAutocomplete from '../components/AddressAutocomplete'
import { CATEGORIES, CATEGORY_CAPABILITIES } from '../lib/categories'
import { completeOnboarding, onboardingPublicProfile } from '../lib/onboarding'
import { coarseSuburb } from '../lib/location'

// Step meta indexed by step number (0–3). The requester/provider choice is retired:
// everyone goes through the same flow and is recorded as 'both' on completion.
const STEP_META = [
  { title: 'RURAL CONNECTIONS', subtitle: null },                                  // 0 welcome
  { title: 'Welcome to Rural Connections', subtitle: 'Step 1 of 2 — your name and location' }, // 1 profile
  { title: 'What can you help with?', subtitle: 'Step 2 of 2 — optional skills' }, // 2 skills
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

  // Two setup steps, followed by completion choices. Skills are optional.
  const [step, setStep]         = useState(1)
  const [saving, setSaving]     = useState(false)
  const completingRef = useRef(false)

  // Profile fields
  const [fullName, setFullName] = useState(initialProfile?.full_name || initialProfile?.display_name || '')
  const [address, setAddress] = useState(initialProfile?.address || initialProfile?.region || '')
  const [latitude,  setLatitude]  = useState(initialProfile?.latitude  || null)
  const [longitude, setLongitude] = useState(initialProfile?.longitude || null)
  const [avatarUrl,      setAvatarUrl]      = useState(initialProfile?.avatar_url || null)
  const [offerCategories, setOfferCategories] = useState(deriveCategories(initialProfile?.skills))
  const savedOfferCategories = useRef(deriveCategories(initialProfile?.skills))
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
      setFullName(profile.full_name || profile.display_name || '')
      setAddress(profile.address || profile.region || '')
      setLatitude(profile.latitude || null)
      setLongitude(profile.longitude || null)
      setOfferCategories(deriveCategories(profile.skills || []))
      savedOfferCategories.current = deriveCategories(profile.skills || [])
      setAvatarUrl(profile.avatar_url || null)
    }
  }

  // ─── Persistence helpers ──────────────────────────────────────────────────────

  async function markComplete(destination = 'home') {
    if (completingRef.current || saving) return
    completingRef.current = true
    setSaving(true)
    try {
      await completeOnboarding(supabase)
      onComplete(destination)
    } catch (error) {
      Alert.alert('Could not finish setup',
        error.message || 'Please check your connection and try again.', [
          { text: 'Not now', style: 'cancel' },
          { text: 'Retry', onPress: () => markComplete(destination) },
        ])
    } finally {
      completingRef.current = false
      setSaving(false)
    }
  }

  // Saves the profile step (step 1) and advances to the skills step.
  async function saveStep2AndAdvance() {
    if (saving) return
    setSaving(true)
    try {
      const publicProfile = onboardingPublicProfile(fullName, address)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user?.id) {
        Alert.alert('Error', 'Not logged in. Please restart the app.')
        return
      }
      const { data, error } = await supabase
        .from('profiles')
        .update({
          ...publicProfile,
          region: coarseSuburb(address),
          address:      address            || null,
          latitude:     latitude           || null,
          longitude:    longitude          || null,
        })
        .eq('id', user.id)
        .select('id').single()
      if (error) throw error
      if (!data) throw new Error('Your profile could not be saved. Please try again.')
      setStep(2)
    } catch (error) {
      Alert.alert('Could not save profile', error.message || 'Check your connection and try again.')
    } finally {
      setSaving(false)
    }
  }

  // Saves the skills step (step 2) and advances to the summary step.
  async function saveStep3AndAdvance() {
    if (saving) return
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
      const { data, error } = await supabase
        .from('profiles')
        .update({
          skills:         expandedSkills,
        })
        .eq('id', user.id)
        .select('id').single()
      if (error) {
        Alert.alert('Error saving', error.message)
        return
      }
      if (!data) throw new Error('Profile not saved')
      savedOfferCategories.current = offerCategories
      setStep(3)
    } catch {
      Alert.alert('Could not save skills', 'Check your connection and try again, or choose Skip for now.')
    } finally {
      setSaving(false)
    }
  }

  // ─── Skills ───────────────────────────────────────────────────────────────────

  function toggleCategory(c) {
    setOfferCategories(prev =>
      prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c]
    )
  }

  // ─── Navigation ───────────────────────────────────────────────────────────────

  function handleNext() {
    if (step === 1) { saveStep2AndAdvance(); return } // profile → skills
    if (step === 2) { saveStep3AndAdvance(); return } // skills → summary
    if (step === 3) { markComplete(); return }        // summary → done
  }

  async function handleSkip() {
    if (saving) return
    if (step === 2) {
      setOfferCategories(savedOfferCategories.current)
      setStep(3)
      return
    }
    if (step === 1) await markComplete()
  }

  // ─── Step renderers ───────────────────────────────────────────────────────────

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

          <Text style={styles.introText}>Post a job when you need a hand. Browse listings for services, grazing, hire and local goods. You can request help and offer it from the same account.</Text>
          <Text style={styles.fieldLabel}>Public name</Text>
          <TextInput
            style={styles.input}
            value={fullName}
            onChangeText={setFullName}
            placeholder="First name, nickname or business name"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="words"
            returnKeyType="next"
            accessibilityLabel="Public name"
          />
          <Text style={styles.fieldHelper}>This name appears on your profile, jobs, listings and messages.</Text>

          <Text style={styles.fieldLabel}>Location</Text>
          <AddressAutocomplete
            defaultValue={address}
            placeholder="Search suburb, town or region..."
            onChangeText={text => { setAddress(text); setLatitude(null); setLongitude(null) }}
            onSelect={({ address: addr, latitude: lat, longitude: lng }) => {
              setAddress(addr || '')
              setLatitude(lat)
              setLongitude(lng)
            }}
          />
          <Text style={styles.fieldHelper}>A town or region is enough. Type it if search is unavailable.</Text>
          <Text style={styles.introText}>Your name and region are public. Phone numbers and exact profile addresses are not shown on public profiles. Job and booking locations are handled separately.</Text>
          <Text style={styles.fieldHelper}>Add a photo, phone number, bio and qualifications later in Account.</Text>

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
            Choose the areas you can help with. This is optional — choose Skip for now to continue without saving changes to your skills. You can update them later in Account.
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

        </ScrollView>
      </KeyboardAvoidingView>
    )
  }

  function renderStep3() {
    const shownSkills = offerCategories.slice(0, 4)
    const extraSkills = offerCategories.length > 4 ? offerCategories.length - 4 : 0
    const nameToShow  = fullName || 'Welcome!'
    const locationStr = coarseSuburb(address)

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
            Start by posting a job or browsing listings in your area. You can update your profile anytime from the Account tab.
          </Text>
        </View>

        <View style={styles.actionCards}>
          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => markComplete('post_job')}
            disabled={saving}
            accessibilityState={{ disabled: saving }}
            accessibilityRole="button"
            accessibilityLabel="Post a job">
            <Icon name="clipboard-outline" size={22} color={colors.primary} />
            <Text style={styles.actionCardTitle}>Post a job</Text>
            <Text style={styles.actionCardSub}>Get rural help sorted</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => markComplete('listings')}
            disabled={saving}
            accessibilityState={{ disabled: saving }}
            accessibilityRole="button"
            accessibilityLabel="Browse listings">
            <Icon name="search-outline" size={22} color={colors.primary} />
            <Text style={styles.actionCardTitle}>Browse listings</Text>
            <Text style={styles.actionCardSub}>Find local providers</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    )
  }

  // ─── Render ───────────────────────────────────────────────────────────────────

  const meta        = STEP_META[step] || STEP_META[0]
  const isLastStep  = step === 3
  const totalSteps = 2
  const currentDot = step
  const progressPct = step === 1 ? 50 : 100
  const btnLabel = isLastStep ? 'Explore the app' : saving ? 'Saving…' : 'Continue'
  const skipLabel = step === 2 ? 'Skip for now' : 'Finish setup later'

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
          {!isLastStep && <StepDots current={currentDot} total={totalSteps} />}
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
            disabled={saving}
            accessibilityState={{ disabled: saving }}
            accessibilityRole="button"
            accessibilityLabel={skipLabel}>
            <Text style={styles.skipBtnText}>{skipLabel}</Text>
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
