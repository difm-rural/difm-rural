import React from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { colors } from '../theme/tokens'
import ReviewList from './ReviewList'

// A party's reputation: name, rating summary, and their recent written reviews.
export default function ReputationCard({
  label,
  name,
  memberSince,
  onPressReviews,
  ratingAvg = 0,
  ratingCount = 0,
  reviews = [],
  style,
}) {
  const summary = ratingCount > 0
    ? `★ ${Number(ratingAvg).toFixed(1)} (${ratingCount} review${ratingCount === 1 ? '' : 's'})`
    : '★ No rating yet'
  const joined = memberSince ? new Date(memberSince) : null
  const since = joined && !Number.isNaN(joined.getTime())
    ? joined.toLocaleDateString('en-NZ', { month: 'long', year: 'numeric' }) : null

  return (
    <View style={[styles.card, style]}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={styles.header}>
        <Text style={styles.name}>{name}</Text>
        {onPressReviews ? (
          <TouchableOpacity onPress={onPressReviews} style={styles.reviewButton}
            accessibilityRole="button" accessibilityLabel={`View reviews and comments for ${name}`}>
            <Text style={[styles.summary, styles.reviewLink]}>{summary}</Text>
            <Text style={styles.reviewLink}>View reviews ›</Text>
          </TouchableOpacity>
        ) : <Text style={styles.summary}>{summary}</Text>}
      </View>
      {since ? <Text style={styles.memberSince}>Member since {since}</Text> : null}
      {!onPressReviews && <ReviewList reviews={reviews} emptyText="No written reviews yet." />}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingTop: 14,
    marginBottom: 14,
    overflow: 'hidden',
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  name: { flex: 1, fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  memberSince: { fontSize: 13, color: colors.textSecondary, paddingHorizontal: 16, paddingBottom: 12 },
  summary: { fontSize: 13, fontWeight: '700', color: colors.textSecondary },
  reviewButton: { minHeight: 44, justifyContent: 'center', gap: 4 },
  reviewLink: { fontSize: 13, color: colors.primary, fontWeight: '700' },
})
