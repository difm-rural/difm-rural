import React from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { colors } from '../theme/tokens'
import ReviewList from './ReviewList'

// A party's reputation: name, rating summary, and their recent written reviews.
export default function ReputationCard({
  label,
  name,
  ratingAvg = 0,
  ratingCount = 0,
  reviews = [],
  style,
}) {
  const summary = ratingCount > 0
    ? `★ ${Number(ratingAvg).toFixed(1)} (${ratingCount} review${ratingCount === 1 ? '' : 's'})`
    : '★ No rating yet'

  return (
    <View style={[styles.card, style]}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={styles.header}>
        <Text style={styles.name}>{name}</Text>
        <Text style={styles.summary}>{summary}</Text>
      </View>
      <ReviewList reviews={reviews} emptyText="No written reviews yet." />
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: 14,
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
  summary: { fontSize: 13, fontWeight: '700', color: colors.textSecondary },
})
