import React from 'react'
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { categoryImage } from '../lib/categoryImages'
import { categoryVisual } from './JobServiceCard'
import { colors } from '../theme/tokens'
import Icon from './Icon'

const ACTION_LABELS = {
  post_job: 'Post a job',
  browse_services: 'Browse services',
  manage_profile: 'Update profile',
}

export default function SeasonalReminderCard({ campaign, onAction, onDismiss }) {
  const visual = categoryVisual(campaign.category)
  const image = categoryImage(campaign.category)
  const actionLabel = ACTION_LABELS[campaign.primary_action]

  return (
    <View style={styles.card} accessibilityLabel={`Seasonal reminder: ${campaign.title}`}>
      <View style={styles.visualWrap}>
        {image ? (
          <Image source={image} style={styles.image} resizeMode="cover" />
        ) : (
          <View style={[styles.placeholder, { backgroundColor: visual.bg }]}>
            <Icon name={visual.icon} size={34} color={visual.fg} />
          </View>
        )}
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
          <Icon name="close" size={17} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        {!!campaign.category && <Text style={styles.category}>{campaign.category}</Text>}
        <Text style={styles.title}>{campaign.title}</Text>
        <Text style={styles.body}>{campaign.body}</Text>
        {!!campaign.capability && (
          <Text style={styles.capability}>Suggested: {campaign.capability}</Text>
        )}
        {!!actionLabel && (
          <TouchableOpacity
            style={styles.action}
            onPress={() => onAction(campaign)}
            accessibilityRole="button"
            accessibilityLabel={actionLabel}>
            <Text style={styles.actionText}>{actionLabel}</Text>
            <Icon name="arrow-forward" size={16} color={colors.white} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 12,
  },
  visualWrap: { height: 118, position: 'relative', backgroundColor: colors.primaryLight },
  image: { width: '100%', height: '100%' },
  placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  seasonBadge: {
    position: 'absolute', left: 12, top: 12,
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.94)',
  },
  seasonText: { color: colors.primary, fontSize: 10, fontWeight: '800', letterSpacing: 0.7 },
  dismissButton: {
    position: 'absolute', right: 10, top: 10,
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.94)',
  },
  content: { padding: 15 },
  category: { color: colors.primary, fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  title: { color: colors.textPrimary, fontSize: 18, lineHeight: 23, fontWeight: '800', marginTop: 4 },
  body: { color: colors.textSecondary, fontSize: 13.5, lineHeight: 20, marginTop: 6 },
  capability: { color: colors.textMuted, fontSize: 11.5, marginTop: 8 },
  action: {
    alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 7,
    backgroundColor: colors.primary, borderRadius: 9,
    paddingHorizontal: 13, paddingVertical: 10, marginTop: 13,
  },
  actionText: { color: colors.white, fontSize: 13, fontWeight: '800' },
})

