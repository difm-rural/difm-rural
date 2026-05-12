import React from 'react'
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { colors } from '../theme/tokens'

function truncateWords(text, max = 30) {
  if (!text) return ''
  const words = text.trim().split(/\s+/)
  if (words.length <= max) return text
  return words.slice(0, max).join(' ') + '…'
}

function shortName(fullName) {
  if (!fullName) return 'New'
  const parts = fullName.trim().split(/\s+/)
  if (parts.length === 1) return parts[0]
  return `${parts[0]} ${parts[parts.length - 1][0]}.`
}

function getInitials(fullName) {
  if (!fullName) return '?'
  const parts = fullName.trim().split(/\s+/)
  if (parts.length === 1) return parts[0][0].toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function getStatusText(job, bidCount) {
  switch (job.status) {
    case 'open':      return bidCount > 0 ? `${bidCount} bid${bidCount > 1 ? 's' : ''}` : 'Open'
    case 'accepted':
    case 'in_progress': return 'In progress'
    case 'completed': return 'Completed'
    case 'cancelled': return 'Cancelled'
    default:          return job.status
  }
}

export default function JobCard({ job, bidCount = 0, onPress, style, isWatched, onWatchToggle }) {
  const profile    = job.profiles || {}
  const hasBids    = bidCount > 0 && job.status === 'open'
  const isOpen     = job.status === 'open'
  const initials   = getInitials(profile.full_name)
  const name       = shortName(profile.full_name)
  const descPreview = truncateWords(job.description)
  const budgetText = job.price_type === 'fixed' ? `$${job.price} NZD` : 'Open'
  const statusText = getStatusText(job, bidCount)

  return (
    <TouchableOpacity
      style={[styles.card, hasBids && styles.cardHighlight, style]}
      onPress={onPress}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel={`${job.title}, ${job.category}`}>

      {/* Top row: title+category left, watch+budget right */}
      <View style={styles.topRow}>
        <View style={styles.topLeft}>
          <Text style={styles.title} numberOfLines={2}>{job.title}</Text>
          <Text style={styles.category}>{job.category}</Text>
        </View>
        <View style={styles.topRight}>
          {onWatchToggle && (
            <TouchableOpacity
              style={[styles.watchBtn, isWatched && styles.watchBtnActive]}
              onPress={() => onWatchToggle(job.id, isWatched)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel={isWatched ? 'Remove from watchlist' : 'Add to watchlist'}>
              <Text style={styles.watchBtnText}>🔖</Text>
            </TouchableOpacity>
          )}
          <Text style={styles.budgetLabel}>Budget</Text>
          <Text style={styles.budgetAmount}>{budgetText}</Text>
          {hasBids && (
            <View style={styles.bidBadge}>
              <Text style={styles.bidBadgeText}>{bidCount} new bid{bidCount > 1 ? 's' : ''}</Text>
            </View>
          )}
        </View>
      </View>

      {/* Middle: avatar + description preview */}
      <View style={styles.middleRow}>
        <View style={styles.avatarWrap}>
          {profile.avatar_url ? (
            <Image source={{ uri: profile.avatar_url }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarFallback}>
              <Text style={styles.avatarInitials}>{initials}</Text>
            </View>
          )}
        </View>
        <Text style={styles.description} numberOfLines={3}>{descPreview}</Text>
      </View>

      {/* Location */}
      <Text style={styles.location}>📍 {job.location_name}</Text>

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.footerName} numberOfLines={1}>★ 0.0 New · {name}</Text>
        <View style={styles.footerRight}>
          <Text style={styles.statusText}>{statusText}</Text>
          <View style={[styles.viewBtn, !isOpen && styles.viewBtnOutline]}>
            <Text style={[styles.viewBtnText, !isOpen && styles.viewBtnTextOutline]}>View</Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
    borderWidth: 0.5,
    borderColor: colors.border,
  },
  cardHighlight: { borderWidth: 1.5, borderColor: colors.primary },

  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
    gap: 12,
  },
  topLeft:      { flex: 1 },
  title:        { fontSize: 15, fontWeight: '700', color: colors.textPrimary, marginBottom: 3 },
  category:     { fontSize: 12, color: colors.textMuted },
  topRight:     { alignItems: 'flex-end', flexShrink: 0 },
  watchBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
    opacity: 0.5,
  },
  watchBtnActive: { backgroundColor: '#ede7f6', opacity: 1 },
  watchBtnText:   { fontSize: 13 },
  budgetLabel:  { fontSize: 11, color: colors.textMuted, marginBottom: 2 },
  budgetAmount: { fontSize: 15, fontWeight: '700', color: colors.primary },
  bidBadge: {
    marginTop: 4,
    backgroundColor: colors.primaryLight,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  bidBadgeText: { fontSize: 11, fontWeight: '700', color: colors.primary },

  middleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 10,
  },
  avatarWrap: { flexShrink: 0 },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: colors.primary,
  },
  avatarFallback: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: { fontSize: 16, fontWeight: '700', color: colors.primary },
  description:    { flex: 1, fontSize: 13, color: colors.textSecondary, lineHeight: 20 },
  location:       { fontSize: 13, color: colors.textMuted, marginBottom: 12 },

  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    paddingTop: 10,
  },
  footerName:  { fontSize: 13, color: colors.textMuted, flex: 1, marginRight: 8 },
  footerRight: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 0 },
  statusText:  { fontSize: 12, color: colors.textMuted },
  viewBtn: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 7,
    minHeight: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  viewBtnOutline:     { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: colors.primary },
  viewBtnText:        { fontSize: 13, fontWeight: '700', color: colors.white },
  viewBtnTextOutline: { color: colors.primary },
})
