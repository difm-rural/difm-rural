import React, { useEffect, useRef, useState } from 'react'
import {
  Keyboard, Modal, Platform, ScrollView,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native'
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

export default function AiJobAssistant({ onUse }) {
  const [mode, setMode] = useState(null)
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const [draft, setDraft] = useState(null)
  const [error, setError] = useState(null)
  const [kbHeight, setKbHeight] = useState(0)
  const request = useRef(0)
  const locked = useRef(false)

  // Track the keyboard so the bottom sheet lifts above it (RN modals don't
  // resize for the keyboard on Android).
  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow'
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide'
    const s = Keyboard.addListener(showEvt, e => setKbHeight(e.endCoordinates?.height || 0))
    const h = Keyboard.addListener(hideEvt, () => setKbHeight(0))
    return () => { s.remove(); h.remove() }
  }, [])

  function close() {
    request.current++
    locked.current = false
    setMode(null)
    setLoading(false)
  }

  async function handleCreate() {
    if (text.trim().length < 8 || locked.current) return
    locked.current = true
    const version = ++request.current
    setLoading(true)
    setError(null)
    try {
      const d = await draftJobFromText(text.trim())
      if (!d || !d.title) throw new Error('I could not turn that into a job. Try adding a little more detail.')
      if (version === request.current) setDraft(d)
    } catch (e) {
      if (version === request.current) setError(e.message || 'Could not create a draft. Please try again.')
    } finally {
      if (version === request.current) {
        locked.current = false
        setLoading(false)
      }
    }
  }

  function handleUse() {
    if (!draft) return
    onUse(draft)
    setDraft(null)
    close()
  }

  return (
    <>
      {['Speak', 'Describe'].map(choice => <TouchableOpacity key={choice}
        style={styles.trigger}
        onPress={() => setMode(choice)}
        accessibilityRole="button"
        accessibilityLabel={choice === 'Speak' ? 'Speak with the AI assistant' : 'Describe your job to the AI assistant'}>
        <Icon name={choice === 'Speak' ? 'mic-outline' : 'create-outline'} size={18} color={colors.primary} />
        <Text style={styles.triggerText}>{choice}</Text>
      </TouchableOpacity>)}

      <Modal visible={mode !== null} animationType="slide" transparent onRequestClose={close}>
        <View style={styles.backdrop}>
          <TouchableOpacity style={styles.backdropTap} activeOpacity={1} onPress={close} accessibilityLabel="Close" />
          <View style={[styles.sheet, { marginBottom: kbHeight }]}>
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
                    {mode === 'Speak' ? 'Tap the mic on your keyboard and describe what you need.' : 'Describe what you need in your own words.'}
                  </Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. I need someone to shift about fifty cows to the back paddock tomorrow morning while I'm away."
                    placeholderTextColor={colors.textMuted}
                    value={text}
                    onChangeText={setText}
                    multiline
                    maxLength={2000}
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
        </View>
      </Modal>
    </>
  )
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 10,
    minHeight: 44,
  },
  triggerText: { color: colors.textPrimary, fontSize: 15, fontWeight: '700' },

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
