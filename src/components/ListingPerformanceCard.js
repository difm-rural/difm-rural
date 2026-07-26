import React from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import Icon from './Icon'
import { colors } from '../theme/tokens'
import { listingFeedback } from '../lib/listingPerformance'

function Metric({ value, label }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  )
}

export default function ListingPerformanceCard({
  job,
  performance,
  onEdit,
  onConnections,
  style,
}) {
  if (!performance) return null
  const feedback = listingFeedback(job, performance)

  return (
    <View style={[styles.card, style]}>
      <View style={styles.headingRow}>
        <View>
          <Text style={styles.eyebrow}>LISTING PERFORMANCE</Text>
          <Text style={styles.title}>Help the right provider respond</Text>
        </View>
        <Icon name="analytics-outline" size={22} color={colors.primary} />
      </View>

      <View style={styles.metrics}>
        <Metric
          value={performance.providerViews}
          label={`provider view${performance.providerViews === 1 ? '' : 's'}`}
        />
        <View style={styles.metricDivider} />
        <Metric
          value={performance.matchingProviders}
          label={`alert-ready match${performance.matchingProviders === 1 ? '' : 'es'}`}
        />
      </View>
      <Text style={styles.measurementNote}>
        Views count providers who opened this job. Matches meet the current capability, travel and availability settings.
      </Text>

      {feedback.length > 0 ? (
        <View style={styles.feedbackList}>
          {feedback.map((item, index) => (
            <TouchableOpacity
              key={item.key}
              style={[styles.feedbackRow, index < feedback.length - 1 && styles.feedbackBorder]}
              onPress={item.action === 'connections' ? onConnections : onEdit}
              activeOpacity={0.72}
              accessibilityRole="button"
              accessibilityLabel={item.title}>
              <View style={styles.iconBox}>
                <Icon name={item.icon} size={19} color={colors.primary} />
              </View>
              <View style={styles.feedbackCopy}>
                <Text style={styles.feedbackTitle}>{item.title}</Text>
                <Text style={styles.feedbackDetail}>{item.detail}</Text>
              </View>
              <Icon name="chevron-forward" size={17} color={colors.textMuted} />
            </TouchableOpacity>
          ))}
        </View>
      ) : (
        <View style={styles.complete}>
          <Icon name="checkmark-circle-outline" size={20} color={colors.primary} />
          <Text style={styles.completeText}>The key listing details are in place.</Text>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 16,
    overflow: 'hidden',
  },
  headingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 16,
    paddingBottom: 12,
  },
  eyebrow: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.9,
    marginBottom: 5,
  },
  title: { color: colors.textPrimary, fontSize: 17, fontWeight: '700' },
  metrics: {
    flexDirection: 'row',
    marginHorizontal: 16,
    borderRadius: 10,
    backgroundColor: colors.primaryLight,
    paddingVertical: 12,
  },
  metric: { flex: 1, alignItems: 'center', paddingHorizontal: 8 },
  metricValue: { color: colors.primary, fontSize: 24, fontWeight: '800' },
  metricLabel: { color: colors.textSecondary, fontSize: 12, marginTop: 2, textAlign: 'center' },
  metricDivider: { width: 1, backgroundColor: colors.border },
  measurementNote: {
    color: colors.textMuted,
    fontSize: 11,
    lineHeight: 16,
    paddingHorizontal: 16,
    paddingTop: 9,
    paddingBottom: 12,
  },
  feedbackList: { borderTopWidth: 1, borderTopColor: '#f0f1ef' },
  feedbackRow: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  feedbackBorder: { borderBottomWidth: 1, borderBottomColor: '#f0f1ef' },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: 9,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  feedbackCopy: { flex: 1 },
  feedbackTitle: { color: colors.textPrimary, fontSize: 14, fontWeight: '700', marginBottom: 2 },
  feedbackDetail: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
  complete: {
    borderTopWidth: 1,
    borderTopColor: '#f0f1ef',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 16,
  },
  completeText: { color: colors.primary, fontSize: 13, fontWeight: '600' },
})
