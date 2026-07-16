import React from 'react'
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { colors } from '../theme/tokens'
import { categoryImage } from '../lib/categoryImages'
import { categoryVisual } from './JobServiceCard'
import Icon from './Icon'

function servicePrice(item) {
  const { pricing_type, rate, unit_label } = item
  switch (pricing_type) {
    case 'quote_required': return 'Quote required'
    case 'hourly':   return `$${rate}/hr`
    case 'day_rate': return `$${rate}/day`
    case 'per_unit': return `$${rate}/${unit_label || 'unit'}`
    case 'fixed':    return `$${rate}`
    default:         return rate ? `$${rate}` : 'POA'
  }
}

// Full-width horizontal service card for the Services list (category thumbnail +
// title + provider + rating/price). Mirrors the compact JobCard layout.
export default function ServiceListCard({ item, onPress }) {
  const profile   = item.profile || item.profiles || {}
  const photoUrl  = Array.isArray(item.photos) && item.photos.length > 0 ? item.photos[0] : null
  const cat       = categoryVisual(item.category)
  const catImg    = categoryImage(item.category)
  const price     = servicePrice(item)
  const ratingCount  = item.ratingCount || 0
  const ratingText   = ratingCount > 0 ? `★ ${Number(item.ratingAverage || 0).toFixed(1)} (${ratingCount})` : '★ New'
  const providerName = profile.full_name || 'Provider'
  const paused    = item.is_active === false

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel={`${item.title} by ${providerName}`}>

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
        <Text style={styles.title} numberOfLines={2}>{item.title}</Text>
        <Text style={styles.provider} numberOfLines={1}>{providerName}</Text>
        <View style={styles.bottomRow}>
          <Text style={styles.rating}>{ratingText}</Text>
          <Text style={styles.price}>{price}</Text>
          {paused && (
            <View style={styles.pausedPill}>
              <Text style={styles.pausedPillText}>Paused</Text>
            </View>
          )}
        </View>
      </View>
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
  },
  thumb: {
    width: 60,
    height: 60,
    borderRadius: 10,
    backgroundColor: colors.background,
    flexShrink: 0,
  },
  thumbPlaceholder: { alignItems: 'center', justifyContent: 'center' },

  content:  { flex: 1, minWidth: 0 },
  title:    { fontSize: 15, fontWeight: '700', color: colors.textPrimary, marginBottom: 2 },
  provider: { fontSize: 12, color: colors.textSecondary, marginBottom: 8 },

  bottomRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  rating:    { fontSize: 12, fontWeight: '700', color: colors.textPrimary },
  price:     { fontSize: 13, fontWeight: '700', color: colors.primary },

  pausedPill:     { backgroundColor: colors.background, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  pausedPillText: { fontSize: 11, fontWeight: '700', color: colors.textMuted },
})
