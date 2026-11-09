import React from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { categoryVisual } from './JobServiceCard'
import { colors } from '../theme/tokens'
import Icon from './Icon'

const ACTION_LABELS = {
  post_job: 'Post a job',
  browse_services: 'Browse listings',
  manage_profile: 'Update profile',
}

// Side-coloured action pills, matching the jobs/listings colour rule.
const ACTION_STYLES = {
  post_job:        { bg: colors.jobFill,     fg: colors.jobInk,      icon: 'briefcase' },
  browse_services: { bg: colors.listingFill, fg: colors.listingInk,  icon: 'pricetag' },
  manage_profile:  { bg: colors.background,  fg: colors.textPrimary, icon: 'person-circle-outline' },
}

// Soften a CATEGORY_VISUALS tint by mixing it 50% with white, so the placeholder
// block reads as a calm backdrop behind the 44px category icon.
function softTint(hex) {
  const h = String(hex || '').replace('#', '')
  if (h.length !== 6) return hex
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16)
  const mix = c => Math.round((c + 255) / 2)
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`
}

export default function SeasonalReminderCard({ campaign, onAction, onDismiss }) {
  const visual = categoryVisual(campaign.category)
  const actionLabel = ACTION_LABELS[campaign.primary_action]
  const action = ACTION_STYLES[campaign.primary_action] || ACTION_STYLES.post_job

  return (
    <View style={styles.card} accessibilityLabel={`Seasonal reminder: ${campaign.title}`}>
      <View style={[styles.visualWrap, { backgroundColor: softTint(visual.bg) }]}>
        <Icon name={visual.icon} size={44} color={visual.fg} />
        <View style={styles.seasonBadge}>
          <Icon name="leaf" size={12} color={colors.primary} />
          <Text style={styles.seasonText}>SEASONAL</Text>
        </View>
        <TouchableOpacity
          style={styles.dismissButton}
          onPress={() => onDismiss(campaign)}
          accessibilityRole="button"
          accessibilityLabel="Dismiss reminder"
          hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}>
          <View style={styles.dismissCircle}>
            <Icon name="close" size={15} color={colors.textSecondary} />
          </View>
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        {!!campaign.category && <Text style={styles.category}>{campaign.category}</Text>}
        <Text style={styles.title}>{campaign.title}</Text>
        <Text style={styles.body} numberOfLines={2}>{campaign.body}</Text>
        {!!actionLabel && (
          <TouchableOpacity
            style={[styles.action, { backgroundColor: action.bg }]}
            onPress={() => onAction(campaign)}
            accessibilityRole="button"
            accessibilityLabel={actionLabel}>
            <Icon name={action.icon} size={16} color={action.fg} />
            <Text style={[styles.actionText, { color: action.fg }]}>{actionLabel}</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    width: 264,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    overflow: 'hidden',
  },
  visualWrap: { height: 112, position: 'relative', alignItems: 'center', justifyContent: 'center' },
  seasonBadge: {
    position: 'absolute', left: 12, top: 12,
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.94)',
  },
  seasonText: { color: colors.primary, fontSize: 10, fontWeight: '800', letterSpacing: 0.7 },
  dismissButton: {
    position: 'absolute', right: 6, top: 6,
    width: 44, height: 44,
    alignItems: 'center', justifyContent: 'center',
  },
  dismissCircle: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.white,
  },
  content: { padding: 15 },
  category: { color: colors.primary, fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  title: { color: colors.textPrimary, fontSize: 16, lineHeight: 21, fontWeight: '700', marginTop: 4 },
  body: { color: colors.textSecondary, fontSize: 13.5, lineHeight: 20, marginTop: 6 },
  action: {
    alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    borderRadius: 10, minHeight: 40, paddingHorizontal: 13, marginTop: 13,
  },
  actionText: { fontSize: 13, fontWeight: '800' },
})

