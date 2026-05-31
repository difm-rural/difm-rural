import React, { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '../lib/supabase'
import { colors } from '../theme/tokens'

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const ALL_DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getDisplayLocation(addr) {
  if (!addr) return null
  const parts = addr.split(',').map(s => s.trim()).filter(Boolean)
  return parts.slice(-3, -1).join(', ').trim() || addr
}

function getInitials(name) {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0][0].toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function displayName(fullName) {
  if (!fullName) return 'Provider'
  const parts = fullName.trim().split(/\s+/)
  if (parts.length === 1) return parts[0]
  return `${parts[0]} ${parts[parts.length - 1][0]}.`
}

function firstName(fullName) {
  if (!fullName) return 'Provider'
  return fullName.trim().split(/\s+/)[0]
}

function memberSince(createdAt) {
  if (!createdAt) return null
  const d = new Date(createdAt)
  if (Number.isNaN(d.getTime())) return null
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

function reviewMonth(createdAt) {
  if (!createdAt) return ''
  const d = new Date(createdAt)
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

function formatRate(service) {
  const { pricing_type, rate, unit_label } = service
  switch (pricing_type) {
    case 'hourly':   return `$${rate} / hour`
    case 'day_rate': return `$${rate} / day`
    case 'per_unit': return `$${rate} / ${unit_label || 'unit'}`
    case 'fixed':    return `$${rate} fixed`
    default:         return rate ? `$${rate}` : 'POA'
  }
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function StarRow({ rating, size = 14 }) {
  return (
    <View style={styles.starRow}>
      {[1,2,3,4,5].map(i => (
        <Text key={i} style={{ fontSize: size, color: i <= rating ? '#FFD700' : '#ddd', lineHeight: size + 4 }}>★</Text>
      ))}
    </View>
  )
}

function AvatarCircle({ name, size = 64 }) {
  return (
    <View style={[styles.avatarCircle, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[styles.avatarInitials, { fontSize: size * 0.35 }]}>{getInitials(name)}</Text>
    </View>
  )
}

function CategoryChip({ label }) {
  return (
    <View style={styles.chip}>
      <Text style={styles.chipText}>{label}</Text>
    </View>
  )
}

// ─── Main screen ───────────────────────────────────────────────────────────────

export default function ProviderProfileScreen({ route, navigation }) {
  const insets = useSafeAreaInsets()
  const { providerId } = route.params

  const [loading, setLoading]                   = useState(true)
  const [profile, setProfile]                   = useState(null)
  const [completedJobs, setCompletedJobs]       = useState([])
  const [services, setServices]                 = useState([])
  const [reviews, setReviews]                   = useState([])
  const [reviewerProfiles, setReviewerProfiles] = useState([])
  const [allBids, setAllBids]                   = useState([])
  const [showAllReviews, setShowAllReviews]      = useState(false)
  const [showAllServices, setShowAllServices]   = useState(false)

  useEffect(() => { fetchAll() }, [providerId])

  async function fetchAll() {
    setLoading(true)
    try {
      // Step 1: profile + bids + services + reviews in parallel
      const [profileResult, bidsResult, servicesResult, reviewsResult] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', providerId).single(),
        supabase.from('bids').select('job_id, status, created_at').eq('provider_id', providerId),
        supabase.from('services')
          .select('*')
          .eq('provider_id', providerId)
          .eq('is_active', true)
          .order('created_at', { ascending: false }),
        supabase.from('reviews')
          .select('*')
          .eq('reviewee_id', providerId)
          .order('created_at', { ascending: false }),
      ])

      setProfile(profileResult.data || null)
      setServices(servicesResult.data || [])

      const bids = bidsResult.data || []
      setAllBids(bids)

      const revs = reviewsResult.data || []
      setReviews(revs)

      // Step 2: fetch completed jobs from accepted bid job_ids
      const acceptedJobIds = bids.filter(b => b.status === 'accepted').map(b => b.job_id)
      if (acceptedJobIds.length > 0) {
        const { data: jobsData } = await supabase
          .from('jobs')
          .select('id, status, category')
          .in('id', acceptedJobIds)
          .eq('status', 'completed')
        setCompletedJobs(jobsData || [])
      }

      // Step 3: reviewer profiles
      if (revs.length > 0) {
        const reviewerIds = [...new Set(revs.map(r => r.reviewer_id).filter(Boolean))]
        const { data: rProfiles } = await supabase
          .from('profiles')
          .select('id, full_name, avatar_url')
          .in('id', reviewerIds)
        setReviewerProfiles(rProfiles || [])
      }
    } catch {
      // show whatever partial data loaded
    } finally {
      setLoading(false)
    }
  }

  // ─── Derived stats ─────────────────────────────────────────────────────────

  const completedCount = completedJobs.length

  const requesterReviews = reviews.filter(r => r.reviewer_role === 'requester')
  const avgRating = reviews.length > 0
    ? (reviews.reduce((s, r) => s + (r.rating || 0), 0) / reviews.length).toFixed(1)
    : null

  const hasEnoughBids = allBids.length >= 5
  const respondedBids = allBids.filter(b => b.status === 'accepted' || b.status === 'rejected').length
  const responseRate  = hasEnoughBids
    ? Math.round((respondedBids / allBids.length) * 100)
    : null

  // Unique categories from completed jobs + active services
  const categorySet = new Set([
    ...completedJobs.map(j => j.category),
    ...services.map(s => s.category),
  ].filter(Boolean))
  const categories = [...categorySet]

  // Coverage
  const travelRanges = services.map(s => Number(s.travel_range_km)).filter(n => n > 0)
  const maxTravel    = travelRanges.length > 0 ? Math.max(...travelRanges) : 0
  const region       = getDisplayLocation(profile?.address) || profile?.region || services[0]?.location_name || null

  // Equipment
  const hasEquipment = services.some(s => s.includes_equipment)

  // Availability union across all services
  const availDays = new Set(services.flatMap(s => Array.isArray(s.availability) ? s.availability : []))

  // Job category map for reviews
  const jobCatMap = {}
  completedJobs.forEach(j => { jobCatMap[j.id] = j.category })

  const visibleServices = showAllServices ? services : services.slice(0, 3)
  const visibleReviews  = showAllReviews  ? requesterReviews : requesterReviews.slice(0, 3)

  function reviewerName(reviewerId) {
    const p = reviewerProfiles.find(r => r.id === reviewerId)
    return p ? firstName(p.full_name) : 'Requester'
  }

  // ─── Loading state ─────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={styles.screen}>
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Go back">
            <Text style={styles.backBtnText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.kicker}>Provider profile</Text>
          <Text style={styles.headerTitle}>Provider profile</Text>
        </View>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </View>
    )
  }

  const name  = displayName(profile?.full_name)
  const since = memberSince(profile?.created_at)

  return (
    <View style={styles.screen}>
      {/* ── Header ───────────────────────────────────────────────── */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Go back">
          <Text style={styles.backBtnText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.kicker}>Provider profile</Text>
        <Text style={styles.headerTitle} accessibilityRole="header">Provider profile</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}>

        {/* ── Profile card ─────────────────────────────────────── */}
        <View style={styles.profileCard}>
          <AvatarCircle name={profile?.full_name} size={72} />

          <View style={styles.profileInfo}>
            <View style={styles.nameRow}>
              <Text style={styles.displayName}>{name}</Text>
              <View style={styles.roleBadge}>
                <Text style={styles.roleBadgeText}>Provider</Text>
              </View>
            </View>

            {since ? <Text style={styles.memberSince}>Member since {since}</Text> : null}

            <View style={styles.badgeRow}>
              {(profile?.primary_role === 'provider' || profile?.primary_role === 'both' ||
                profile?.role === 'provider' || profile?.role === 'both') && (
                <View style={styles.verifiedBadge}>
                  <Text style={styles.verifiedText}>✓ Verified</Text>
                </View>
              )}
            </View>

            <View style={styles.ratingRow}>
              {avgRating ? (
                <>
                  <StarRow rating={Math.round(Number(avgRating))} size={15} />
                  <Text style={styles.ratingScore}>{avgRating}</Text>
                  <Text style={styles.ratingCount}>({reviews.length} {reviews.length === 1 ? 'review' : 'reviews'})</Text>
                </>
              ) : (
                <Text style={styles.noReviews}>New member · No reviews yet</Text>
              )}
            </View>
          </View>
        </View>

        {/* ── Stats row ─────────────────────────────────────────── */}
        <View style={styles.statsRow}>
          <View style={styles.statTile}>
            <Text style={styles.statValue}>{completedCount}</Text>
            <Text style={styles.statLabel}>Jobs{'\n'}completed</Text>
          </View>
          <View style={[styles.statTile, styles.statTileMid]}>
            {avgRating ? (
              <>
                <Text style={styles.statValue}>{avgRating} ★</Text>
                <Text style={styles.statLabel}>Avg{'\n'}rating</Text>
              </>
            ) : (
              <>
                <Text style={styles.statValueSmall}>–</Text>
                <Text style={styles.statLabel}>Avg{'\n'}rating</Text>
              </>
            )}
          </View>
          <View style={styles.statTile}>
            {responseRate !== null ? (
              <>
                <Text style={styles.statValue}>{responseRate}%</Text>
                <Text style={styles.statLabel}>Response{'\n'}rate</Text>
              </>
            ) : (
              <>
                <Text style={styles.statValueSmall}>New</Text>
                <Text style={styles.statLabel}>member</Text>
              </>
            )}
          </View>
        </View>

        {/* ── Skills & Categories ───────────────────────────────── */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>What I do</Text>
          {categories.length > 0 ? (
            <View style={styles.chipWrap}>
              {categories.map(cat => <CategoryChip key={cat} label={cat} />)}
            </View>
          ) : (
            <Text style={styles.emptyCardText}>No skills listed yet</Text>
          )}
        </View>

        {/* ── Active services ───────────────────────────────────── */}
        {services.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Available services</Text>
            {visibleServices.map((svc, idx) => (
              <TouchableOpacity
                key={svc.id}
                style={[styles.serviceRow, idx < visibleServices.length - 1 && styles.serviceRowBorder]}
                onPress={() => navigation.navigate('ServiceDetail', { service: { ...svc, profile: { id: providerId, full_name: profile?.full_name, avatar_url: profile?.avatar_url } } })}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={`View ${svc.title}`}>
                <View style={styles.serviceRowContent}>
                  <View style={styles.serviceRowLeft}>
                    <Text style={styles.serviceTitle} numberOfLines={1}>{svc.title}</Text>
                    <Text style={styles.serviceRate}>{formatRate(svc)}</Text>
                    <View style={[styles.chip, styles.chipSmall]}>
                      <Text style={styles.chipText}>{svc.category}</Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    style={styles.viewBookBtn}
                    onPress={() => navigation.navigate('ServiceDetail', { service: { ...svc, profile: { id: providerId, full_name: profile?.full_name, avatar_url: profile?.avatar_url } } })}
                    accessibilityRole="button"
                    accessibilityLabel={`View and book ${svc.title}`}>
                    <Text style={styles.viewBookBtnText}>View & book →</Text>
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            ))}
            {services.length > 3 && !showAllServices && (
              <TouchableOpacity
                style={styles.showAllBtn}
                onPress={() => setShowAllServices(true)}
                accessibilityRole="button"
                accessibilityLabel={`See all ${services.length} services`}>
                <Text style={styles.showAllText}>See all {services.length} services →</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* ── Coverage & Equipment ──────────────────────────────── */}
        {services.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Coverage & equipment</Text>

            {maxTravel > 0 && region ? (
              <View style={styles.coverageRow}>
                <Text style={styles.coverageIcon}>🗺️</Text>
                <Text style={styles.coverageText}>
                  Operates within <Text style={styles.coverageBold}>{maxTravel}km</Text> of {region}
                </Text>
              </View>
            ) : null}

            {hasEquipment && (
              <View style={styles.coverageRow}>
                <Text style={styles.coverageIcon}>🔧</Text>
                <Text style={[styles.coverageText, { color: colors.primary }]}>✓ Equipment included in some services</Text>
              </View>
            )}

            {availDays.size > 0 && (
              <View style={styles.daysWrap}>
                {ALL_DAYS.map(day => (
                  <View key={day} style={[styles.dayChip, availDays.has(day) && styles.dayChipActive]}>
                    <Text style={[styles.dayChipText, availDays.has(day) && styles.dayChipTextActive]}>{day}</Text>
                  </View>
                ))}
              </View>
            )}

            {maxTravel === 0 && !hasEquipment && availDays.size === 0 && (
              <Text style={styles.emptyCardText}>Coverage details coming soon</Text>
            )}
          </View>
        )}

        {/* ── Reviews ───────────────────────────────────────────── */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Reviews from requesters</Text>

          {requesterReviews.length === 0 ? (
            <View style={styles.emptyReviews}>
              <Text style={styles.emptyReviewsText}>No reviews yet · Be the first</Text>
            </View>
          ) : (
            <>
              {visibleReviews.map((review, idx) => (
                <View
                  key={review.id || idx}
                  style={[styles.reviewItem, idx < visibleReviews.length - 1 && styles.reviewItemBorder]}>
                  <View style={styles.reviewHeader}>
                    <View style={styles.reviewerAvatar}>
                      <Text style={styles.reviewerInitials}>
                        {getInitials(reviewerProfiles.find(r => r.id === review.reviewer_id)?.full_name)}
                      </Text>
                    </View>
                    <View style={styles.reviewMeta}>
                      <Text style={styles.reviewerName}>{reviewerName(review.reviewer_id)}</Text>
                      <Text style={styles.reviewDate}>{reviewMonth(review.created_at)}</Text>
                    </View>
                    <StarRow rating={review.rating || 0} size={13} />
                  </View>

                  {review.comment ? (
                    <Text style={styles.reviewComment}>{review.comment}</Text>
                  ) : null}

                  {jobCatMap[review.job_id] ? (
                    <Text style={styles.reviewCategory}>{jobCatMap[review.job_id]} job</Text>
                  ) : null}
                </View>
              ))}

              {requesterReviews.length > 3 && (
                <TouchableOpacity
                  style={styles.showAllBtn}
                  onPress={() => {
                    if (showAllReviews) return
                    navigation.navigate('ReviewsList', { revieweeId: providerId, revieweeName: name })
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Show all ${requesterReviews.length} reviews`}>
                  <Text style={styles.showAllText}>Show all {requesterReviews.length} reviews →</Text>
                </TouchableOpacity>
              )}
            </>
          )}
        </View>

        {/* ── Privacy note ──────────────────────────────────────── */}
        <Text style={styles.privacyNote}>
          Contact details are shared once a job is confirmed
        </Text>

      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  screen:  { flex: 1, backgroundColor: colors.background },
  center:  { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // ─── Header ─────────────────────────────────────────────────────────
  header: {
    backgroundColor: colors.background,
    paddingHorizontal: 20,
    paddingBottom: 14,
  },
  backBtn:     { marginBottom: 12, minHeight: 36, justifyContent: 'center', alignSelf: 'flex-start' },
  backBtnText: { color: colors.primary, fontSize: 15, fontWeight: '600' },
  kicker:      { fontSize: 13, fontWeight: '700', color: colors.primary, marginBottom: 8 },
  headerTitle: { fontSize: 34, lineHeight: 38, fontWeight: '700', color: colors.textPrimary },

  // ─── Scroll ──────────────────────────────────────────────────────────
  scroll:        { flex: 1 },
  scrollContent: { padding: 20, paddingTop: 8 },

  // ─── Profile card ────────────────────────────────────────────────────
  profileCard: {
    backgroundColor: colors.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  avatarCircle: {
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarInitials: { fontWeight: '700', color: colors.primary },

  profileInfo: { flex: 1 },
  nameRow:     { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 },
  displayName: { fontSize: 22, fontWeight: '700', color: colors.textPrimary },

  roleBadge: {
    backgroundColor: colors.primaryLight,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  roleBadgeText: { fontSize: 12, fontWeight: '700', color: colors.primary },

  badgeRow:      { flexDirection: 'row', gap: 6, marginBottom: 6, flexWrap: 'wrap' },
  verifiedBadge: { backgroundColor: '#e8f5e9', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  verifiedText:  { fontSize: 12, fontWeight: '700', color: colors.primary },

  memberSince:  { fontSize: 13, color: colors.textMuted, marginBottom: 6 },
  ratingRow:    { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  starRow:      { flexDirection: 'row', gap: 1 },
  ratingScore:  { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  ratingCount:  { fontSize: 13, color: colors.textMuted },
  noReviews:    { fontSize: 13, color: colors.textMuted, fontStyle: 'italic' },

  // ─── Stats ────────────────────────────────────────────────────────────
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  statTile: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 14,
    paddingHorizontal: 8,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  statTileMid:    {},
  statValue:      { fontSize: 20, fontWeight: '700', color: colors.primary, marginBottom: 4, textAlign: 'center' },
  statValueSmall: { fontSize: 16, fontWeight: '700', color: colors.primary, marginBottom: 4 },
  statLabel:      { fontSize: 11, color: colors.textMuted, textAlign: 'center', lineHeight: 15 },

  // ─── Cards ───────────────────────────────────────────────────────────
  card: {
    backgroundColor: colors.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    marginBottom: 12,
    paddingTop: 16,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  emptyCardText: {
    fontSize: 14,
    color: colors.textMuted,
    paddingHorizontal: 16,
    paddingBottom: 16,
    fontStyle: 'italic',
  },

  // ─── Chips ───────────────────────────────────────────────────────────
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, paddingBottom: 16 },
  chip: {
    backgroundColor: colors.primaryLight,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipSmall: { paddingHorizontal: 8, paddingVertical: 3 },
  chipText:  { fontSize: 13, fontWeight: '600', color: colors.primary },

  // ─── Services ─────────────────────────────────────────────────────────
  serviceRow:        { paddingHorizontal: 16, paddingVertical: 12 },
  serviceRowBorder:  { borderBottomWidth: 1, borderBottomColor: '#f2f2f2' },
  serviceRowContent: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  serviceRowLeft:    { flex: 1 },
  serviceTitle:      { fontSize: 14, fontWeight: '700', color: colors.textPrimary, marginBottom: 3 },
  serviceRate:       { fontSize: 13, color: colors.textSecondary, marginBottom: 6 },
  viewBookBtn: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    minHeight: 36,
    justifyContent: 'center',
    flexShrink: 0,
  },
  viewBookBtnText: { color: colors.white, fontSize: 12, fontWeight: '700' },

  // ─── Coverage ─────────────────────────────────────────────────────────
  coverageRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  coverageIcon:  { fontSize: 16, lineHeight: 22 },
  coverageText:  { fontSize: 14, color: colors.textSecondary, flex: 1, lineHeight: 21 },
  coverageBold:  { fontWeight: '700', color: colors.textPrimary },
  daysWrap: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 16,
    paddingBottom: 16,
    paddingTop: 4,
    flexWrap: 'wrap',
  },
  dayChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
  },
  dayChipActive:     { backgroundColor: colors.primaryLight },
  dayChipText:       { fontSize: 12, fontWeight: '600', color: '#aaa' },
  dayChipTextActive: { color: colors.primary },

  // ─── Reviews ──────────────────────────────────────────────────────────
  emptyReviews:     { paddingHorizontal: 16, paddingBottom: 16, alignItems: 'center' },
  emptyReviewsText: { fontSize: 14, color: colors.textMuted },

  reviewItem:       { paddingHorizontal: 16, paddingVertical: 14 },
  reviewItemBorder: { borderBottomWidth: 1, borderBottomColor: '#f2f2f2' },
  reviewHeader:     { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  reviewerAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  reviewerInitials: { fontSize: 12, fontWeight: '700', color: colors.primary },
  reviewMeta:       { flex: 1 },
  reviewerName:     { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
  reviewDate:       { fontSize: 12, color: colors.textMuted },
  reviewComment:    { fontSize: 14, color: colors.textSecondary, lineHeight: 21, marginTop: 2 },
  reviewCategory:   { fontSize: 12, color: colors.primary, fontWeight: '600', marginTop: 6 },

  showAllBtn: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: '#f2f2f2',
  },
  showAllText: { fontSize: 14, fontWeight: '700', color: colors.primary, textAlign: 'center' },

  // ─── Privacy note ─────────────────────────────────────────────────────
  privacyNote: {
    fontSize: 12,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 18,
    marginTop: 8,
    paddingHorizontal: 20,
  },
})
