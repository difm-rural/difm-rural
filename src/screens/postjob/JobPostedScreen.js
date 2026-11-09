import React, { useRef, useState } from 'react'
import {
  Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Constants from 'expo-constants'
import { supabase } from '../../lib/supabase'
import { trackEvent } from '../../lib/analytics'
import { validateFlowFeedback, FLOW_FEEDBACK_COMMENT_MAX } from '../../../shared/flowFeedback'
import { colors, spacing, radius, typography } from '../../theme/tokens'
import Button from '../../components/Button'
import Icon from '../../components/Icon'

// Lands here right after a new job is posted (PostJobStep5Review.replace).
// Confirms the post and asks a single "how easy was that?" ease rating, then
// returns to the same tab root the old Alert flow used. Feedback is optional and
// must never block the user — any send error still navigates on.
const TAB_ROOTS = { Home: 'Dashboard', Jobs: 'JobsBoard', Browse: 'BrowseMain', Activity: 'ActivityMain' }
const EASE = [1, 2, 3, 4, 5]

export default function JobPostedScreen({ navigation, route }) {
  const insets = useSafeAreaInsets()
  const { jobId, title, body, returnTo } = route.params || {}

  const [ease, setEase] = useState(null)
  const [comment, setComment] = useState('')
  const [sending, setSending] = useState(false)
  const doneRef = useRef(false)

  // Mirrors PostJobStep5Review.returnAfterPost: wipe the wizard out of the Jobs
  // stack and land on the launching tab (or Home by default).
  function finish() {
    if (doneRef.current) return
    doneRef.current = true
    const parent = navigation.getParent()
    navigation.reset({ index: 0, routes: [{ name: 'JobsBoard' }] })
    const destTab = TAB_ROOTS[returnTo] ? returnTo : 'Home'
    if (destTab !== 'Jobs') parent?.navigate(destTab, { screen: TAB_ROOTS[destTab] })
  }

  async function send() {
    if (sending || ease == null) return
    const check = validateFlowFeedback({ ease, comment })
    if (!check.ok) return
    setSending(true)
    try {
      const { error } = await supabase.from('flow_feedback').insert({
        flow: 'post_job',
        subject_id: jobId || null,
        ease: check.value.ease,
        comment: check.value.comment,
        platform: Platform.OS,
        app_version: Constants.expoConfig?.version || null,
      })
      if (error) throw error
      trackEvent('flow_feedback_submitted', { flow: 'post_job', ease: check.value.ease })
    } catch (e) {
      // Never block the user on a feedback failure — log it and move on.
      trackEvent('flow_feedback_error', { flow: 'post_job', message: String(e?.message || e) })
    } finally {
      finish()
    }
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 24, paddingBottom: 24 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>

        <View style={styles.header}>
          <View style={styles.checkCircle}>
            <Icon name="checkmark" size={34} color={colors.primary} />
          </View>
          <Text style={styles.title}>{title || 'Job posted!'}</Text>
          {!!body && <Text style={styles.body}>{body}</Text>}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>How easy was that?</Text>

          <View style={styles.easeRow}>
            {EASE.map(n => {
              const selected = ease === n
              return (
                <TouchableOpacity
                  key={n}
                  onPress={() => setEase(n)}
                  activeOpacity={0.85}
                  style={[styles.easeBtn, selected && styles.easeBtnOn]}
                  accessibilityRole="button"
                  accessibilityLabel={`${n} out of 5`}
                  accessibilityState={{ selected }}>
                  <Text style={[styles.easeText, selected && styles.easeTextOn]}>{n}</Text>
                </TouchableOpacity>
              )
            })}
          </View>
          <View style={styles.easeEnds}>
            <Text style={styles.easeEndText}>Very hard</Text>
            <Text style={styles.easeEndText}>Very easy</Text>
          </View>

          <TextInput
            style={styles.comment}
            value={comment}
            onChangeText={setComment}
            placeholder="Anything we could improve? (optional)"
            placeholderTextColor={colors.textMuted}
            multiline
            maxLength={FLOW_FEEDBACK_COMMENT_MAX}
            textAlignVertical="top"
            accessibilityLabel="Optional feedback comment"
          />
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <Button
          title={sending ? 'Sending…' : 'Send feedback'}
          onPress={send}
          loading={sending}
          disabled={ease == null || sending}
          accessibilityLabel="Send feedback"
        />
        <TouchableOpacity
          onPress={finish}
          disabled={sending}
          style={styles.skip}
          accessibilityRole="button"
          accessibilityLabel="Skip feedback">
          <Text style={styles.skipText}>Skip</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: spacing.lg },

  header: { alignItems: 'center', marginBottom: spacing.xl },
  checkCircle: {
    width: 76, height: 76, borderRadius: 38,
    backgroundColor: colors.primaryLight,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  title: { fontSize: typography.sizeXxl, fontWeight: '700', color: colors.textPrimary, textAlign: 'center' },
  body: { fontSize: typography.sizeMd, color: colors.textSecondary, textAlign: 'center', lineHeight: 22, marginTop: spacing.sm },

  card: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  cardTitle: { fontSize: typography.sizeLg, fontWeight: '700', color: colors.textPrimary, marginBottom: spacing.lg },

  easeRow: { flexDirection: 'row', gap: spacing.sm },
  easeBtn: {
    flex: 1,
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  easeBtnOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  easeText: { fontSize: typography.sizeLg, fontWeight: '700', color: colors.textSecondary },
  easeTextOn: { color: colors.white },

  easeEnds: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.sm },
  easeEndText: { fontSize: typography.sizeXs, color: colors.textMuted },

  comment: {
    marginTop: spacing.lg,
    minHeight: 88,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: typography.sizeMd,
    color: colors.textPrimary,
    backgroundColor: colors.white,
  },

  footer: {
    backgroundColor: colors.card,
    borderTopWidth: 0.5,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  skip: { alignItems: 'center', paddingVertical: spacing.md, marginTop: spacing.xs },
  skipText: { fontSize: typography.sizeMd, fontWeight: '600', color: colors.textSecondary },
})
