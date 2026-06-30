import React, { useState } from 'react'
import {
  KeyboardAvoidingView, Modal, Platform, ScrollView,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { usePostJob } from '../context/PostJobContext'
import { colors } from '../theme/tokens'
import Icon from './Icon'
import Button from './Button'
import { draftJobFromText, draftBudgetText } from '../lib/draftJob'

const SCHEDULE_TEXT = { asap: 'As soon as possible', specific: 'On a specific day', flexible: 'Flexible timing' }

function DraftRow({ label, value, last }) {
  if (!value) return null
  return (
    <View style={[styles.row, !last && styles.rowBorder]}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  )
}

export default function AiJobAssistant() {
  const navigation = useNavigation()
  const { jobData } = usePostJob()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const [draft, setDraft] = useState(null)
  const [error, setError] = useState(null)

  function close() {
    setOpen(false)
    setText('')
    setDraft(null)
    setError(null)
    setLoading(false)
  }

  async function handleCreate() {
    if (text.trim().length < 8) return
    setLoading(true)
    setError(null)
    try {
      const d = await draftJobFromText(text.trim())
      if (!d || !d.title) throw new Error('I could not turn that into a job. Try adding a little more detail.')
      setDraft(d)
    } catch (e) {
      setError(e.message || 'Could not create a draft. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  function handleUse() {
    if (!draft) return
    // Land on the first step ("Job type") so the user sees the generated title,
    // then flows through the pre-filled steps. Step 1 seeds itself from aiSeed.
    // (Route name differs between the authed and guest post flows.)
    const names = navigation.getState()?.routeNames || []
    const step1 = names.includes('PostJob') ? 'PostJob' : 'GuestPostJob'
    close()
    navigation.navigate(step1, { aiSeed: draft })
  }

  // Editing an existing job — not a fresh draft, so the assistant doesn't apply.
  if (jobData._editJobId) return null

  return (
    <>
      <TouchableOpacity
        style={styles.trigger}
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="AI assistant — describe your job out loud">
        <Icon name="sparkles" size={14} color={colors.primary} />
        <Text style={styles.triggerText}>Assistant</Text>
      </TouchableOpacity>

      <Modal visible={open} animationType="slide" transparent onRequestClose={close}>
        <View style={styles.backdrop}>
          <TouchableOpacity style={styles.backdropTap} activeOpacity={1} onPress={close} accessibilityLabel="Close" />
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={styles.sheet}>
              <View style={styles.sheetHeader}>
                <Text style={styles.sheetTitle}>
                  <Icon name="sparkles" size={16} color={colors.primary} /> Describe your job
                </Text>
                <TouchableOpacity onPress={close} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Close">
                  <Icon name="close" size={22} color={colors.textMuted} />
                </TouchableOpacity>
              </View>

              {!draft ? (
                <View>
                  <Text style={styles.help}>
                    Say it in your own words — tap the mic on your keyboard and just talk. The assistant fills in the details.
                  </Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. I need someone to shift about fifty cows to the back paddock tomorrow morning while I'm away."
                    placeholderTextColor={colors.textMuted}
                    value={text}
                    onChangeText={setText}
                    multiline
                    autoFocus
                    textAlignVertical="top"
                    editable={!loading}
                    accessibilityLabel="Describe the job"
                  />
                  {!!error && <Text style={styles.error}>{error}</Text>}
                  <Button
                    title={loading ? 'Reading your description…' : 'Create my job'}
                    icon={loading ? undefined : 'sparkles'}
                    loading={loading}
                    disabled={loading || text.trim().length < 8}
                    onPress={handleCreate}
                    accessibilityLabel="Create job draft"
                  />
                </View>
              ) : (
                <ScrollView style={{ maxHeight: 400 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                  <Text style={styles.help}>Here's what I put together. Review it, then continue to set the location and post.</Text>
                  <View style={styles.draftCard}>
                    <DraftRow label="Title" value={draft.title} />
                    <DraftRow label="Category" value={draft.category} />
                    <DraftRow label="Description" value={draft.description} />
                    <DraftRow label="Suggested budget" value={draftBudgetText(draft)} />
                    <DraftRow label="Estimated time" value={draft.duration} />
                    <DraftRow label="Helpful skills" value={(draft.skills || []).join(', ')} />
                    <DraftRow label="When" value={SCHEDULE_TEXT[draft.schedule_type] || draft.schedule_type} last />
                  </View>
                  <Button title="Use this draft" icon="checkmark" onPress={handleUse} accessibilityLabel="Use this draft" />
                  <TouchableOpacity style={styles.startOver} onPress={() => setDraft(null)} accessibilityRole="button" accessibilityLabel="Start over">
                    <Text style={styles.startOverText}>Start over</Text>
                  </TouchableOpacity>
                </ScrollView>
              )}
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </>
  )
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255,255,255,0.92)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
  },
  triggerText: { color: colors.primary, fontSize: 13, fontWeight: '700' },

  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  backdropTap: { flex: 1 },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 18,
    paddingBottom: 28,
  },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },

  help: { fontSize: 13.5, color: colors.textSecondary, lineHeight: 19, marginBottom: 12 },
  input: {
    backgroundColor: colors.background,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    fontSize: 15,
    color: colors.textPrimary,
    minHeight: 120,
    textAlignVertical: 'top',
    marginBottom: 12,
  },
  error: { fontSize: 13, color: colors.danger, marginBottom: 10 },

  draftCard: {
    backgroundColor: colors.background,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    marginBottom: 14,
  },
  row: { paddingVertical: 10 },
  rowBorder: { borderBottomWidth: 0.5, borderBottomColor: colors.border },
  rowLabel: { fontSize: 11, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 3 },
  rowValue: { fontSize: 14, color: colors.textPrimary, lineHeight: 20 },

  startOver: { alignItems: 'center', paddingVertical: 12, marginTop: 4 },
  startOverText: { fontSize: 14, color: colors.textSecondary, fontWeight: '600' },
})
