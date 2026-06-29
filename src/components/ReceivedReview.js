import React from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { colors } from '../theme/tokens'
import StarRating from './StarRating'

// The review the other party left about you, for this job or booking.
// Renders nothing until a review exists.
export default function ReceivedReview({ review, fromLabel = 'them', style }) {
  if (!review) return null
  return (
    <View style={[styles.card, style]}>
      <Text style={styles.label}>Review from {fromLabel}</Text>
      <StarRating rating={review.rating} style={styles.stars} />
      {review.comment ? <Text style={styles.comment}>{review.comment}</Text> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginBottom: 14,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  stars: { fontSize: 14, marginBottom: 4 },
  comment: { fontSize: 14, color: colors.textSecondary, lineHeight: 20 },
})
