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

function firstName(fullName) {
  if (!fullName) return 'Requester'
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

function StarRow({ rating, size = 14 }) {
  return (
    <View style={styles.starRow}>
      {[1,2,3,4,5].map(i => (
        <Text key={i} style={[styles.star, { fontSize: size, color: i <= rating ? '#FFD700' : '#ddd' }]}>★</Text>
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

export default function RequesterProfileScreen({ route, navigation }) {
  const insets = useSafeAreaInsets()
  const { requesterId } = route.params

  const [loading, setLoading]               = useState(true)
  const [profile, setProfile]               = useState(null)
  const [jobs, setJobs]                     = useState([])
  const [reviews, setReviews]               = useState([])
  const [reviewerProfiles, setReviewerProfiles] = useState([])
  const [jobCategoryMap, setJobCategoryMap] = useState({})
  const [showAllReviews, setShowAllReviews] = useState(false)

  useEffect(() => { fetchAll() }, [requesterId])

  async function fetchAll() {
    setLoading(true)
    try {
      const [profileResult, jobsResult, reviewsResult] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', requesterId).single(),
        supabase.from('jobs').select('id, status, category').eq('requester_id', requesterId),
        supabase.from('reviews')
          .select('*')
          .eq('reviewee_id', requesterId)
          .eq('reviewer_role', 'provider')
          .order('created_at', { ascending: false }),
      ])

      setProfile(profileResult.data || null)

      const allJobs = jobsResult.data || []
      setJobs(allJobs)

      // Build a job_id → category map for use in review display
      const catMap = {}
      allJobs.forEach(j => { catMap[j.id] = j.category })
      setJobCategoryMap(catMap)

      const revs = reviewsResult.data || []
      setReviews(revs)

      if (revs.length > 0) {
        const reviewerIds = [...new Set(revs.map(r => r.reviewer_id).filter(Boolean))]
        const { data: rProfiles } = await supabase
          .from('profiles')
          .select('id, full_name, avatar_url')
          .in('id', reviewerIds)
        setReviewerProfiles(rProfiles || [])
      }
    } catch {
      // show whatever partial data loaded successfully
    } finally {
      setLoading(false)
    }
  }

  // ─── Derived stats ────────────────────────────────────────────────
  const totalPosted    = jobs.length
  const totalCompleted = jobs.filter(j => j.status === 'completed').length
  const respondedJobs  = jobs.filter(j => j.status !== 'open').length
  const hasEnoughData  = totalPosted >= 3
  const responseRate   = hasEnoughData
    ? Math.round((respondedJobs / totalPosted) * 100)
    : null

  const avgRating = reviews.length > 0
    ? (reviews.reduce((s, r) => s + (r.rating || 0), 0) / reviews.length).toFixed(1)
    : null

  const visibleReviews = showAllReviews ? reviews : reviews.slice(0, 3)

  function reviewerName(reviewerId) {
    const p = reviewerProfiles.find(r => r.id === reviewerId)
    return p ? firstName(p.full_name) : 'Provider'
  }

  // ─── Loading ──────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={styles.screen}>
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Go back">
            <Text style={styles.backBtnText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.kicker}>Member profile</Text>
          <Text style={styles.headerTitle}>Requester profile</Text>
        </View>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </View>
    )
  }

  const displayName = firstName(profile?.full_name)
  const since       = memberSince(profile?.created_at)

  return (
    <View style={styles.screen}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Go back">
          <Text style={styles.backBtnText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.kicker}>Member profile</Text>
        <Text style={styles.headerTitle} accessibilityRole="header">Requester profile</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}>

        {/* ── Profile card ─────────────────────────────────────────── */}
        <View style={styles.profileCard}>
          <AvatarCircle name={profile?.full_name} size={72} />

          <View style={styles.profileInfo}>
            <View style={styles.nameRow}>
              <Text style={styles.displayName}>{displayName}</Text>
              {profile?.primary_role === 'requester' || profile?.role === 'requester' ? (
                <View style={styles.verifiedBadge}>
                  <Text style={styles.verifiedText}>✓ Verified</Text>
                </View>
              ) : null}
            </View>

            {since ? (
              <Text style={styles.memberSince}>Member since {since}</Text>
            ) : null}

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

        {/* ── Stats row ─────────────────────────────────────────────── */}
        <View style={styles.statsRow}>
          <View style={styles.statTile}>
            <Text style={styles.statValue}>{totalPosted}</Text>
            <Text style={styles.statLabel}>Tasks posted</Text>
          </View>
          <View style={[styles.statTile, styles.statTileMid]}>
            <Text style={styles.statValue}>{totalCompleted}</Text>
            <Text style={styles.statLabel}>Completed</Text>
          </View>
          <View style={styles.statTile}>
            {responseRate !== null ? (
              <>
                <Text style={styles.statValue}>{responseRate}%</Text>
                <Text style={styles.statLabel}>Response rate</Text>
              </>
            ) : (
              <>
                <Text style={styles.statValueSmall}>New</Text>
                <Text style={styles.statLabel}>member</Text>
              </>
            )}
          </View>
        </View>

        {/* ── Location card ─────────────────────────────────────────── */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Location</Text>
          <View style={styles.locationRow}>
            <Text style={styles.locationPin}>📍</Text>
            <View>
              <Text style={styles.locationLabel}>Based in</Text>
              <Text style={styles.locationValue}>
                {getDisplayLocation(profile?.address) || profile?.region || 'Location not specified'}
              </Text>
            </View>
          </View>
        </View>

        {/* ── Reviews card ──────────────────────────────────────────── */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Reviews from providers</Text>

          {reviews.length === 0 ? (
            <View style={styles.emptyReviews}>
              <Text style={styles.emptyReviewsText}>No reviews yet</Text>
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

                  {jobCategoryMap[review.job_id] ? (
                    <Text style={styles.reviewCategory}>{jobCategoryMap[review.job_id]} job</Text>
                  ) : null}
                </View>
              ))}

              {reviews.length > 3 && !showAllReviews && (
                <TouchableOpacity
                  style={styles.showAllBtn}
                  onPress={() => setShowAllReviews(true)}
                  accessibilityRole="button"
                  accessibilityLabel={`Show all ${reviews.length} reviews`}>
                  <Text style={styles.showAllText}>Show all {reviews.length} reviews →</Text>
                </TouchableOpacity>
              )}
            </>
          )}
        </View>

        {/* ── Privacy note ──────────────────────────────────────────── */}
        <Text style={styles.privacyNote}>
          Contact details are shared once a job is confirmed
        </Text>

      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // ─── Header ────────────────────────────────────────────────────────
  header: {
    backgroundColor: colors.background,
    paddingHorizontal: 20,
    paddingBottom: 14,
  },
  backBtn:     { marginBottom: 12, minHeight: 36, justifyContent: 'center', alignSelf: 'flex-start' },
  backBtnText: { color: colors.primary, fontSize: 15, fontWeight: '600' },
  kicker:      { fontSize: 13, fontWeight: '700', color: colors.accent, marginBottom: 8 },
  headerTitle: { fontSize: 34, lineHeight: 38, fontWeight: '700', color: colors.textPrimary },

  // ─── Scroll ─────────────────────────────────────────────────────────
  scroll:        { flex: 1 },
  scrollContent: { padding: 20, paddingTop: 8 },

  // ─── Profile card ───────────────────────────────────────────────────
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
  verifiedBadge: {
    backgroundColor: colors.primaryLight,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  verifiedText: { fontSize: 12, fontWeight: '700', color: colors.primary },
  memberSince:  { fontSize: 13, color: colors.textMuted, marginBottom: 8 },
  ratingRow:    { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  starRow:      { flexDirection: 'row', gap: 1 },
  star:         { lineHeight: 18 },
  ratingScore:  { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  ratingCount:  { fontSize: 13, color: colors.textMuted },
  noReviews:    { fontSize: 13, color: colors.textMuted, fontStyle: 'italic' },

  // ─── Stats row ──────────────────────────────────────────────────────
  statsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  statTile: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 14,
    paddingHorizontal: 10,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  statTileMid: {
    borderLeftWidth: 0,
    borderRightWidth: 0,
  },
  statValue:      { fontSize: 22, fontWeight: '700', color: colors.primary, marginBottom: 4 },
  statValueSmall: { fontSize: 16, fontWeight: '700', color: colors.primary, marginBottom: 4 },
  statLabel:      { fontSize: 12, color: colors.textMuted, textAlign: 'center' },

  // ─── Cards ──────────────────────────────────────────────────────────
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

  // ─── Location ───────────────────────────────────────────────────────
  locationRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  locationPin:   { fontSize: 18, lineHeight: 22 },
  locationLabel: { fontSize: 12, color: colors.textMuted, marginBottom: 2 },
  locationValue: { fontSize: 15, fontWeight: '600', color: colors.textPrimary },

  // ─── Reviews ────────────────────────────────────────────────────────
  emptyReviews:     { paddingHorizontal: 16, paddingBottom: 16, alignItems: 'center' },
  emptyReviewsText: { fontSize: 14, color: colors.textMuted },

  reviewItem: { paddingHorizontal: 16, paddingVertical: 14 },
  reviewItemBorder: { borderBottomWidth: 1, borderBottomColor: '#f2f2f2' },

  reviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
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

  // ─── Privacy note ────────────────────────────────────────────────────
  privacyNote: {
    fontSize: 12,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 18,
    marginTop: 8,
    paddingHorizontal: 20,
  },
})
