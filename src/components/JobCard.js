import React from 'react'
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { colors } from '../theme/tokens'
import { jobStatusLabel } from '../lib/lifecycle'
import { stripPlusCode, coarseSuburb } from '../lib/location'
import { categoryImage } from '../lib/categoryImages'
import { categoryVisual } from './JobServiceCard'
import Icon from './Icon'

function postedAgo(createdAt) {
  if (!createdAt) return 'recently'
  const created = new Date(createdAt)
  if (Number.isNaN(created.getTime())) return 'recently'
  const diffDays = Math.floor((Date.now() - created.getTime()) / (1000 * 60 * 60 * 24))
  if (diffDays <= 0) return 'today'
  if (diffDays === 1) return '1d ago'
  if (diffDays < 30) return `${diffDays}d ago`
  const diffMonths = Math.floor(diffDays / 30)
  return diffMonths === 1 ? '1mo ago' : `${diffMonths}mo ago`
}

// Compact horizontal board card: category thumbnail + title + a single meta line
// + budget, with the watchlist bookmark tucked top-right.
export default function JobCard({ job, onPress, style, isWatched, onWatchToggle, distanceKm = null, offered = false, offerAmount = null }) {
  const isOpen     = job.status === 'open'
  const paidAmount = job.completedAmount ?? job.acceptedBidAmount
  const budgetText = job.status === 'completed' && paidAmount != null
    ? `Paid · $${paidAmount} NZD`
    : job.price_type === 'fixed' ? `$${job.price} NZD`
    : job.price_type === 'unpaid' ? 'Free'
    : 'Open to offers'

  const photoUrl = Array.isArray(job.photos) && job.photos.length > 0 ? job.photos[0] : null
  const cat      = categoryVisual(job.category)
  const catImg   = categoryImage(job.category)

  const locText = job.hide_exact_location
    ? (coarseSuburb(job.location_area || job.location_name) || job.location_area || 'Area only')
    : (stripPlusCode(job.location_name) || job.location_area || 'Location shared on accept')
  const meta = [
    locText,
    job.hide_exact_location ? 'exact address hidden' : null,
    distanceKm != null ? `${distanceKm} km` : null,
    postedAgo(job.created_at),
  ].filter(Boolean).join(' · ')

  return (
    <TouchableOpacity
      style={[styles.card, style]}
      onPress={onPress}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel={`${job.title}, ${job.category}${offered ? ', offer sent' : ''}`}>

      {photoUrl ? (
        <Image source={{ uri: photoUrl }} style={styles.thumb} />
      ) : catImg ? (
        <Image source={catImg} style={styles.thumb} resizeMode="cover" />
      ) : (
        <View style={[styles.thumb, styles.thumbPlaceholder, { backgroundColor: cat.bg }]}>
          <Icon name={cat.icon} size={24} color={cat.fg} />
        </View>
      )}

      <View style={styles.content}>
        <Text style={styles.title} numberOfLines={2}>{job.title}</Text>
        <Text style={styles.meta} numberOfLines={1}>{meta}</Text>
        <View style={styles.bottomRow}>
          <Text style={styles.budget}>{budgetText}</Text>
          {offered ? (
            <View style={styles.offerPill}>
              <Text style={styles.offerPillText}>Offer sent{offerAmount != null ? ` · $${offerAmount}` : ''}</Text>
            </View>
          ) : !isOpen ? (
            <View style={styles.statusPill}>
              <Text style={styles.statusPillText}>{jobStatusLabel(job.status)}</Text>
            </View>
          ) : null}
        </View>
      </View>

      {onWatchToggle && (
        <TouchableOpacity
          style={styles.watchBtn}
          onPress={() => onWatchToggle(job.id, isWatched)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel={isWatched ? 'Remove from watchlist' : 'Add to watchlist'}>
          <Icon name={isWatched ? 'bookmark' : 'bookmark-outline'} size={18} color={isWatched ? colors.primary : colors.textMuted} />
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
  },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: 12,
    backgroundColor: colors.background,
    flexShrink: 0,
  },
  thumbPlaceholder: { alignItems: 'center', justifyContent: 'center' },

  content: { flex: 1, minWidth: 0 },
  title:   { fontSize: 15, fontWeight: '700', color: colors.textPrimary, marginBottom: 3 },
  meta:    { fontSize: 12, color: colors.textMuted, marginBottom: 8 },

  bottomRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  budget:    { fontSize: 13, fontWeight: '700', color: colors.primary },

  offerPill:     { backgroundColor: colors.primaryLight, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  offerPillText: { fontSize: 11, fontWeight: '700', color: colors.primary },
  statusPill:     { backgroundColor: colors.background, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  statusPillText: { fontSize: 11, fontWeight: '700', color: colors.textSecondary },

  watchBtn: { padding: 2 },
})
