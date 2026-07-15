import React from 'react'
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { colors } from '../theme/tokens'
import { jobStatusLabel } from '../lib/lifecycle'
import { stripPlusCode } from '../lib/location'
import { categoryVisual } from './JobServiceCard'
import Icon from './Icon'

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

function getStatusText(job) {
  // Offers are private — providers browsing the board never see offer counts.
  return jobStatusLabel(job.status)
}

function fmtRange(from, to) {
  try {
    const opt = { day: 'numeric', month: 'short' }
    return `${new Date(from).toLocaleDateString('en-NZ', opt)} – ${new Date(to).toLocaleDateString('en-NZ', opt)}`
  } catch { return '' }
}

function postedAgo(createdAt) {
  if (!createdAt) return 'Posted recently'
  const created = new Date(createdAt)
  if (Number.isNaN(created.getTime())) return 'Posted recently'
  const diffDays = Math.floor((Date.now() - created.getTime()) / (1000 * 60 * 60 * 24))
  if (diffDays <= 0) return 'Posted today'
  if (diffDays === 1) return 'Posted 1 day ago'
  if (diffDays < 30) return `Posted ${diffDays} days ago`
  const diffMonths = Math.floor(diffDays / 30)
  return diffMonths === 1 ? 'Posted 1 month ago' : `Posted ${diffMonths} months ago`
}

export default function JobCard({ job, bidCount = 0, onPress, style, isWatched, onWatchToggle, actionLabel = 'View', distanceKm = null, offered = false, offerAmount = null }) {
  const profile    = job.profiles || {}
  const isOpen     = job.status === 'open'
  const initials   = getInitials(profile.full_name)
  const name       = shortName(profile.full_name)
  const descPreview = truncateWords(job.description)
  const paidAmount = job.completedAmount ?? job.acceptedBidAmount
  const budgetText = job.status === 'completed' && paidAmount != null
    ? `$${paidAmount} NZD`
    : job.price_type === 'fixed' ? `$${job.price} NZD`
    : job.price_type === 'unpaid' ? 'Free'
    : 'Open'
  // When the viewing provider has already offered on this board job, surface it
  // rather than showing a plain "Open" card as if it were untouched.
  const statusText = offered ? 'Awaiting response' : getStatusText(job)
  const photoUrl = Array.isArray(job.photos) && job.photos.length > 0 ? job.photos[0] : null
  const cat      = categoryVisual(job.category)
  const showCompletedSummary = job.status === 'completed' && (
    paidAmount != null ||
    job.providerRatingGiven ||
    job.requesterRatingGiven
  )

  return (
    <TouchableOpacity
      style={[styles.card, offered && styles.cardHighlight, style]}
      onPress={onPress}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel={`${job.title}, ${job.category}${offered ? ', offer sent, awaiting response' : ''}`}>

      {/* Top row: title+category left, watch+budget right */}
      <View style={styles.topRow}>
        <View style={styles.topLeft}>
          <Text style={styles.title} numberOfLines={2}>{job.title}</Text>
          <Text style={styles.category}>{job.category}</Text>
          {offered && (
            <View style={styles.offeredPill}>
              <Icon name="checkmark-circle" size={12} color={colors.primary} />
              <Text style={styles.offeredPillText}>
                Offer sent{offerAmount != null ? ` · $${offerAmount} NZD` : ''}
              </Text>
            </View>
          )}
        </View>
        <View style={styles.topRight}>
          {onWatchToggle && (
            <TouchableOpacity
              style={[styles.watchBtn, isWatched && styles.watchBtnActive]}
              onPress={() => onWatchToggle(job.id, isWatched)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel={isWatched ? 'Remove from watchlist' : 'Add to watchlist'}>
              <Icon name={isWatched ? 'bookmark' : 'bookmark-outline'} size={16} color={isWatched ? colors.primary : colors.textMuted} />
            </TouchableOpacity>
          )}
          <Text style={styles.budgetLabel}>{job.status === 'completed' && paidAmount != null ? 'Paid' : 'Budget'}</Text>
          <Text style={styles.budgetAmount}>{budgetText}</Text>
        </View>
      </View>

      {photoUrl ? (
        <Image source={{ uri: photoUrl }} style={styles.jobPhoto} />
      ) : (
        <View style={[styles.jobPhoto, styles.photoPlaceholder, { backgroundColor: cat.bg }]}>
          <Icon name={cat.icon} size={40} color={cat.fg} />
        </View>
      )}

      {/* Middle: avatar + description preview */}
      <View style={styles.middleRow}>
        <View style={styles.avatarWrap}>
          {job.category === 'House-sitting' ? (
            <View style={styles.avatarFallback} accessibilityLabel="House-sitting">
              <Icon name="home-outline" size={22} color={colors.primary} />
            </View>
          ) : profile.avatar_url ? (
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
      <Text style={styles.location}>
        <Icon name="location-outline" size={11} color={colors.textMuted} /> {stripPlusCode(job.location_name) || job.location_area || 'Location shared on accept'}{distanceKm != null ? `  ·  ${distanceKm} km away` : ''}
      </Text>
      {job.date_from && job.date_to ? (
        <Text style={styles.datesLine}>
          <Icon name="calendar-outline" size={11} color={colors.textMuted} /> {fmtRange(job.date_from, job.date_to)}
        </Text>
      ) : null}

      <Text style={styles.postedDate}>{postedAgo(job.created_at)}</Text>

      {showCompletedSummary ? (
        <View style={styles.completedSummary}>
          {paidAmount != null ? (
            <View style={styles.summaryPill}>
              <Text style={styles.summaryLabel}>Paid</Text>
              <Text style={styles.summaryValue}>${paidAmount} NZD</Text>
            </View>
          ) : null}
          <View style={styles.ratingRow}>
            <Text style={styles.ratingText}>
              Provider gave: {job.providerRatingGiven ? `${job.providerRatingGiven}/5` : 'Not rated yet'}
            </Text>
            <Text style={styles.ratingText}>
              You gave: {job.requesterRatingGiven ? `${job.requesterRatingGiven}/5` : 'Not rated yet'}
            </Text>
          </View>
        </View>
      ) : null}

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.footerName} numberOfLines={1}>★ 0.0 New · {name}</Text>
        <View style={styles.footerRight}>
          <Text style={[styles.statusText, offered && styles.statusTextOffered]}>{statusText}</Text>
          <View style={[styles.viewBtn, !isOpen && styles.viewBtnOutline]}>
            <Text style={[styles.viewBtnText, !isOpen && styles.viewBtnTextOutline]}>{actionLabel}</Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardHighlight: { borderWidth: 1.5, borderColor: colors.primary },
  jobPhoto: {
    width: '100%',
    height: 150,
    borderRadius: 12,
    marginBottom: 12,
    backgroundColor: colors.background,
  },
  photoPlaceholder: { alignItems: 'center', justifyContent: 'center' },

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
  offeredPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    backgroundColor: colors.primaryLight,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginTop: 6,
  },
  offeredPillText: { fontSize: 11, fontWeight: '700', color: colors.primary },
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
  location:       { fontSize: 13, color: colors.textMuted, marginBottom: 4 },
  datesLine:      { fontSize: 12, color: colors.textMuted, marginBottom: 4 },
  postedDate:     { fontSize: 12, color: colors.textMuted, marginBottom: 12 },
  completedSummary: {
    backgroundColor: colors.primaryLight,
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
    gap: 8,
  },
  summaryPill: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryLabel: { fontSize: 12, color: colors.textMuted, fontWeight: '700' },
  summaryValue: { fontSize: 13, color: colors.primary, fontWeight: '800' },
  ratingRow: { gap: 4 },
  ratingText: { fontSize: 13, color: colors.textSecondary, lineHeight: 19 },

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
  statusTextOffered: { color: colors.primary, fontWeight: '700' },
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
