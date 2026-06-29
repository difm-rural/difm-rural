import React, { useEffect, useState } from 'react'
import {
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native'
import { colors } from '../theme/tokens'
import Button from './Button'

export default function ReviewModal({
  visible,
  title,
  subtitle,
  initialRating = 0,
  initialComment = '',
  saving,
  onClose,
  onSubmit,
}) {
  const [rating, setRating] = useState(initialRating || 0)
  const [comment, setComment] = useState(initialComment || '')

  useEffect(() => {
    if (!visible) return
    setRating(initialRating || 0)
    setComment(initialComment || '')
  }, [visible, initialRating, initialComment])

  function handleSubmit() {
    if (!rating || saving) return
    onSubmit({ rating, comment })
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <View style={StyleSheet.absoluteFill} />
        </TouchableWithoutFeedback>
        <View style={styles.sheet}>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}

          <View style={styles.starsRow}>
            {[1, 2, 3, 4, 5].map(value => {
              const selected = value <= rating
              return (
                <TouchableOpacity
                  key={value}
                  style={styles.starButton}
                  onPress={() => setRating(value)}
                  accessibilityRole="button"
                  accessibilityLabel={`${value} star${value === 1 ? '' : 's'}`}
                  accessibilityState={{ selected }}>
                  <Text style={[styles.star, selected && styles.starSelected]}>
                    {selected ? '★' : '☆'}
                  </Text>
                </TouchableOpacity>
              )
            })}
          </View>

          <TextInput
            style={styles.commentInput}
            value={comment}
            onChangeText={setComment}
            placeholder="Add comments (optional)"
            placeholderTextColor={colors.textMuted}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
            maxLength={800}
            accessibilityLabel="Review comments"
          />

          <View style={styles.actions}>
            <Button
              variant="secondary"
              title="Cancel"
              onPress={onClose}
              disabled={saving}
              style={{ flex: 1 }}
              accessibilityLabel="Cancel review"
            />
            <Button
              title="Submit review"
              onPress={handleSubmit}
              disabled={!rating}
              loading={saving}
              style={{ flex: 1 }}
              accessibilityLabel="Submit review"
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 22,
    paddingBottom: 34,
  },
  title: { fontSize: 20, fontWeight: '700', color: colors.textPrimary, marginBottom: 6 },
  subtitle: { fontSize: 14, color: colors.textSecondary, lineHeight: 20, marginBottom: 18 },
  starsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 18,
  },
  starButton: {
    width: 46,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
  },
  star: { fontSize: 36, color: colors.border, lineHeight: 40 },
  starSelected: { color: colors.amber },
  commentInput: {
    minHeight: 110,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: colors.background,
    padding: 14,
    fontSize: 15,
    color: colors.textPrimary,
    marginBottom: 16,
  },
  actions: { flexDirection: 'row', gap: 10 },
})
