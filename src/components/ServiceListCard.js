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
  const creative  = !!(photoUrl && item.card_headline)
  const clean     = item.card_style === 'clean'

  return (
    <TouchableOpacity
      style={[styles.card, creative && styles.creativeCard]}
      onPress={onPress}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel={`${item.title} by ${providerName}`}>

      {creative ? (
        <View style={styles.creativeHero}>
          <Image source={{ uri: photoUrl }} style={styles.creativePhoto} resizeMode="cover" />
          <View style={[
            styles.cardMessage,
            item.card_style === 'bold' && styles.cardMessageBold,
            clean && styles.cardMessageClean,
          ]}>
            <Text style={[styles.cardHeadline, clean && styles.cardMessageTextClean]} numberOfLines={2}>{item.card_headline}</Text>
            {!!item.card_supporting_text && (
              <Text style={[styles.cardSupporting, clean && styles.cardMessageTextClean]} numberOfLines={2}>{item.card_supporting_text}</Text>
            )}
          </View>
        </View>
      ) : photoUrl ? (
        <Image source={{ uri: photoUrl }} style={styles.thumb} resizeMode="contain" />
      ) : catImg ? (
        <Image source={catImg} style={styles.thumb} resizeMode="cover" />
      ) : (
        <View style={[styles.thumb, styles.thumbPlaceholder, { backgroundColor: cat.bg }]}>
          <Icon name={cat.icon} size={24} color={cat.fg} />
        </View>
      )}

      <View style={[styles.content, creative && styles.creativeContent]}>
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
  creativeCard: { flexDirection: 'column', padding: 0, gap: 0, overflow: 'hidden' },
  creativeHero: { width: '100%', height: 154, position: 'relative', backgroundColor: colors.background },
  creativePhoto: { width: '100%', height: '100%' },
  creativeContent: { padding: 12 },
  cardMessage: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: 'rgba(15,45,33,0.78)',
  },
  cardMessageBold: { top: 0, justifyContent: 'center', backgroundColor: 'rgba(15,45,33,0.60)' },
  cardMessageClean: { left: 10, right: 10, bottom: 10, borderRadius: 9, backgroundColor: 'rgba(255,255,255,0.90)' },
  cardHeadline: { color: colors.white, fontSize: 17, lineHeight: 20, fontWeight: '800' },
  cardSupporting: { color: colors.white, fontSize: 11, lineHeight: 15, marginTop: 4 },
  cardMessageTextClean: { color: colors.primaryDark },
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
