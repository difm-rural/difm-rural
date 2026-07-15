import React from 'react'
import { Alert, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { colors } from '../theme/tokens'
import { statusLabel, statusTone } from '../lib/lifecycle'
import { stripPlusCode } from '../lib/location'
import Icon from './Icon'

// ─── Constants ────────────────────────────────────────────────────────────────
export const CARD_WIDTH    = 155
export const CARD_GAP      = 10
export const SNAP_INTERVAL = CARD_WIDTH + CARD_GAP

// Colour + icon per category, keyed lowercase so both job ("Animal Care") and
// service ("Animal care") casings resolve. Used as the card placeholder when a
// listing has no photo.
export const CATEGORY_VISUALS = {
  fencing:          { bg: '#d1fae5', fg: '#5a8a45', icon: 'grid-outline' },
  maintenance:      { bg: '#ffedd5', fg: '#fb8c00', icon: 'construct-outline' },
  'property check': { bg: '#e0f2f1', fg: '#00838f', icon: 'home-outline' },
  'house-sitting':  { bg: '#e8f0fe', fg: '#3b6ea5', icon: 'home-outline' },
  landscaping:      { bg: '#dcfce7', fg: '#388e3c', icon: 'leaf-outline' },
  'animal care':    { bg: '#fef3c7', fg: '#f57c00', icon: 'paw-outline' },
  machinery:        { bg: '#ede9fe', fg: '#7e57c2', icon: 'cog-outline' },
  labour:           { bg: '#dbeafe', fg: '#1565c0', icon: 'people-outline' },
  'general labour': { bg: '#dbeafe', fg: '#1565c0', icon: 'people-outline' },
  spraying:         { bg: '#e0f2fe', fg: '#0277bd', icon: 'color-fill-outline' },
  water:            { bg: '#ccfbf1', fg: '#00897b', icon: 'water-outline' },
  'water delivery': { bg: '#ccfbf1', fg: '#00897b', icon: 'water-outline' },
  other:            { bg: '#f3f4f6', fg: '#546e7a', icon: 'pricetag-outline' },
}

export function categoryVisual(category) {
  return CATEGORY_VISUALS[String(category || '').toLowerCase()] || CATEGORY_VISUALS.other
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatPrice(item) {
  if (item._type === 'job' || item.itemType === 'task') {
    if (item.price_type === 'fixed') return `$${item.price}`
    if (item.price_type === 'unpaid') return 'Free'
    return 'Open'
  }
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

function getInitials(name) {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0][0].toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function getFirstName(name) {
  if (!name) return 'User'
  return name.trim().split(/\s+/)[0]
}

// Badge colours per semantic tone (see statusTone in lifecycle). Language and
// stage→tone mapping live in lifecycle; only the palette lives here.
const STATUS_TONE_COLORS = {
  active:    { bg: '#e8f5e9', fg: colors.primary },
  waiting:   { bg: '#fff3e0', fg: '#fb8c00' },
  engaged:   { bg: '#e3f2fd', fg: '#1565c0' },
  attention: { bg: '#fff3e0', fg: '#fb8c00' },
  done:      { bg: '#f5f5f5', fg: '#757575' },
  muted:     { bg: '#f5f5f5', fg: '#757575' },
  cancelled: { bg: '#fdecea', fg: colors.danger },
}

function statusBadgeProps(status, bidCount) {
  if (!status) return null
  const tone = STATUS_TONE_COLORS[statusTone(status)] || STATUS_TONE_COLORS.muted
  return { label: statusLabel(status, bidCount), ...tone }
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function JobServiceCard({
  item,
  onPress,
  onWatchlistToggle,
  isWatched = false,
  showStatusBadge = false,
  status,
  isGuest = false,
  onGuestAction,
}) {
  const isService = item._type === 'service' || item.itemType === 'service'
  const profile   = isService ? (item.profile || {}) : (item.profiles || {})
  const photoUrl  = Array.isArray(item.photos) && item.photos.length > 0 ? item.photos[0] : null
  const category  = item.category || 'Other'
  const cat       = categoryVisual(category)
  const initials  = getInitials(profile.full_name)
  const firstName = getFirstName(profile.full_name)
  const price     = formatPrice(item)
  const bidCount  = item.bidCount || 0

  const ratingCount = isService ? (item.ratingCount || 0) : 0
  const ratingAvg   = isService ? Number(item.ratingAverage || 0).toFixed(1) : null
  const ratingText  = ratingCount > 0 ? `★ ${ratingAvg} · ${ratingCount}` : '★ New'

  const badge = showStatusBadge ? statusBadgeProps(status || item.status, bidCount) : null
  const showHeart = !!onWatchlistToggle || isGuest

  function handleHeartPress() {
    if (isGuest) {
      if (onGuestAction) {
        onGuestAction('watchlist')
      } else {
        Alert.alert('Sign in required', 'Sign in to save this to your watchlist.', [{ text: 'OK' }])
      }
    } else {
      onWatchlistToggle(item.id, isWatched)
    }
  }

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={item.title || 'Listing'}>

      {/* ── Image area ──────────────────────────────────────────────────────── */}
      <View style={styles.imageBox}>
        {photoUrl ? (
          <Image source={{ uri: photoUrl }} style={styles.photo} />
        ) : (
          <View style={[styles.placeholder, { backgroundColor: cat.bg }]}>
            <Icon name={cat.icon} size={34} color={cat.fg} />
          </View>
        )}

        {/* Watchlist heart */}
        {showHeart && (
          <TouchableOpacity
            style={styles.heartBtn}
            onPress={handleHeartPress}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel={isWatched ? 'Remove from watchlist' : 'Save'}>
            <Text style={[styles.heartIcon, isWatched && styles.heartActive]}>
              <Icon name={isWatched ? 'heart' : 'heart-outline'} size={14} color={isWatched ? '#e53935' : colors.textMuted} />
            </Text>
          </TouchableOpacity>
        )}

        {/* Status badge overlay (top-left) */}
        {badge && (
          <View style={[styles.overlayBadge, { backgroundColor: badge.bg }]}>
            <Text style={[styles.overlayBadgeText, { color: badge.fg }]}>{badge.label}</Text>
          </View>
        )}

      </View>

      {/* ── Card body ───────────────────────────────────────────────────────── */}
      <View style={styles.body}>

        {/* Row 1: avatar + first name + price */}
        <View style={styles.row1}>
          <View style={styles.miniAvatarWrap}>
            {!isService && item.category === 'House-sitting' ? (
              <View style={styles.miniAvatarFallback} accessibilityLabel="House-sitting">
                <Icon name="home-outline" size={16} color={colors.primary} />
              </View>
            ) : profile.avatar_url ? (
              <Image source={{ uri: profile.avatar_url }} style={styles.miniAvatarImg} />
            ) : (
              <View style={styles.miniAvatarFallback}>
                <Text style={styles.miniAvatarInitials}>{initials}</Text>
              </View>
            )}
          </View>
          <Text style={styles.providerName} numberOfLines={1}>{firstName}</Text>
          <Text style={styles.price} numberOfLines={1}>{price}</Text>
        </View>

        {/* Row 2: service badge pill */}
        {isService && (
          <View style={styles.servicePill}>
            <Text style={styles.servicePillText}>SERVICE</Text>
          </View>
        )}

        {/* Row 3: title */}
        <Text style={styles.title} numberOfLines={2}>{item.title}</Text>

        {/* Row 4: location + distance */}
        <Text style={styles.location} numberOfLines={1}>
          {item._distanceKm != null
            ? `${item._distanceKm} km away`
            : (stripPlusCode(item.location_name) || item.location_area || 'Location TBC')}
        </Text>

        {/* Row 5: rating */}
        <Text style={styles.rating}>{ratingText}</Text>
      </View>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  card: {
    width: CARD_WIDTH,
    backgroundColor: colors.white,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 0.5,
    borderColor: colors.border,
  },

  // ─── Image area ─────────────────────────────────────────────────────────────
  imageBox: { width: CARD_WIDTH, height: 110, position: 'relative' },
  photo:    { width: CARD_WIDTH, height: 110 },
  placeholder: {
    width: CARD_WIDTH,
    height: 110,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderIcon: { fontSize: 34 },

  // Watchlist heart
  heartBtn: {
    position: 'absolute',
    top: 7,
    right: 7,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 3,
    elevation: 2,
  },
  heartIcon:   { fontSize: 13, color: colors.textMuted },
  heartActive: { color: '#e53935' },

  // Status overlay
  overlayBadge: {
    position: 'absolute',
    top: 7,
    left: 7,
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  overlayBadgeText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.2 },

  // Bid bubble
  bidBubble: {
    position: 'absolute',
    top: 7,
    left: 7,
    backgroundColor: colors.white,
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  bidBubbleText: { fontSize: 9, fontWeight: '800', color: colors.textPrimary },

  // ─── Body ───────────────────────────────────────────────────────────────────
  body: { padding: 8, paddingBottom: 10 },

  // Row 1
  row1: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 5 },
  miniAvatarWrap: { width: 20, height: 20, borderRadius: 10, overflow: 'hidden', flexShrink: 0 },
  miniAvatarImg: { width: 20, height: 20 },
  miniAvatarFallback: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniAvatarInitials: { fontSize: 7, fontWeight: '700', color: colors.primary },
  providerName: { flex: 1, fontSize: 11, color: colors.textSecondary, fontWeight: '500' },
  price:        { fontSize: 11, fontWeight: '700', color: colors.textPrimary, flexShrink: 0 },

  // Row 2: service pill
  servicePill: {
    alignSelf: 'flex-start',
    backgroundColor: '#ede9fe',
    borderRadius: 5,
    paddingHorizontal: 5,
    paddingVertical: 2,
    marginBottom: 4,
  },
  servicePillText: { fontSize: 8, fontWeight: '700', color: '#5b21b6', letterSpacing: 0.5 },

  // Row 3: title
  title: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
    lineHeight: 17,
    marginBottom: 4,
  },

  // Row 4: location
  location: { fontSize: 10, color: colors.textMuted, marginBottom: 3 },

  // Row 5: rating
  rating: { fontSize: 10, color: colors.textMuted },
})
