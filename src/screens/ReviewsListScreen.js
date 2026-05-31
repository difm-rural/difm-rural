import React, { useCallback, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '../lib/supabase'
import { colors } from '../theme/tokens'

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function getInitials(name) {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0][0].toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function reviewMonth(createdAt) {
  if (!createdAt) return ''
  const d = new Date(createdAt)
  if (Number.isNaN(d.getTime())) return ''
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

function firstName(fullName) {
  if (!fullName) return 'Reviewer'
  return fullName.trim().split(/\s+/)[0]
}

function StarRow({ rating, size = 14 }) {
  return (
    <View style={styles.starRow}>
      {[1,2,3,4,5].map(i => (
        <Text key={i} style={{ fontSize: size, color: i <= rating ? '#FFD700' : '#ddd', lineHeight: size + 4 }}>★</Text>
      ))}
    </View>
  )
}

function ReviewCard({ review, reviewerName, reviewerInitials, jobCategory }) {
  return (
    <View style={styles.reviewCard}>
      <View style={styles.reviewHeader}>
        <View style={styles.reviewerAvatar}>
          <Text style={styles.reviewerInitials}>{reviewerInitials}</Text>
        </View>
        <View style={styles.reviewMeta}>
          <Text style={styles.reviewerName}>{reviewerName}</Text>
          <Text style={styles.reviewDate}>{reviewMonth(review.created_at)}</Text>
        </View>
        <StarRow rating={review.rating || 0} size={14} />
      </View>

      {review.comment ? (
        <Text style={styles.reviewComment}>{review.comment}</Text>
      ) : null}

      {jobCategory ? (
        <View style={styles.categoryChip}>
          <Text style={styles.categoryChipText}>{jobCategory}</Text>
        </View>
      ) : null}
    </View>
  )
}

export default function ReviewsListScreen({ route, navigation }) {
  const insets = useSafeAreaInsets()
  const { revieweeId, revieweeName } = route.params

  const [reviews, setReviews]               = useState([])
  const [reviewerProfiles, setReviewerProfiles] = useState([])
  const [jobCatMap, setJobCatMap]           = useState({})
  const [loading, setLoading]               = useState(true)
  const [refreshing, setRefreshing]         = useState(false)

  useFocusEffect(useCallback(() => { fetchAll() }, [revieweeId]))

  async function fetchAll() {
    try {
      const { data: revs } = await supabase
        .from('reviews')
        .select('*')
        .eq('reviewee_id', revieweeId)
        .order('created_at', { ascending: false })

      const allRevs = revs || []
      setReviews(allRevs)

      // Reviewer profiles
      if (allRevs.length > 0) {
        const reviewerIds = [...new Set(allRevs.map(r => r.reviewer_id).filter(Boolean))]
        const jobIds      = [...new Set(allRevs.map(r => r.job_id).filter(Boolean))]

        const [profileResult, jobResult] = await Promise.all([
          reviewerIds.length > 0
            ? supabase.from('profiles').select('id, full_name').in('id', reviewerIds)
            : Promise.resolve({ data: [] }),
          jobIds.length > 0
            ? supabase.from('jobs').select('id, category').in('id', jobIds)
            : Promise.resolve({ data: [] }),
        ])

        setReviewerProfiles(profileResult.data || [])

        const catMap = {}
        ;(jobResult.data || []).forEach(j => { catMap[j.id] = j.category })
        setJobCatMap(catMap)
      }
    } catch {
      // show partial data
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  function onRefresh() {
    setRefreshing(true)
    fetchAll()
  }

  function reviewerNameFor(reviewerId) {
    const p = reviewerProfiles.find(r => r.id === reviewerId)
    return p ? firstName(p.full_name) : 'Reviewer'
  }

  function reviewerInitialsFor(reviewerId) {
    const p = reviewerProfiles.find(r => r.id === reviewerId)
    return getInitials(p?.full_name)
  }

  const headerTitle = revieweeName ? `${revieweeName}'s reviews` : 'All reviews'

  const header = (
    <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
      <TouchableOpacity
        style={styles.backBtn}
        onPress={() => navigation.goBack()}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        accessibilityRole="button"
        accessibilityLabel="Go back">
        <Text style={styles.backBtnText}>← Back</Text>
      </TouchableOpacity>
      <Text style={styles.kicker}>Reviews</Text>
      <Text style={styles.headerTitle} accessibilityRole="header">{headerTitle}</Text>
      {reviews.length > 0 ? (
        <Text style={styles.headerSub}>{reviews.length} {reviews.length === 1 ? 'review' : 'reviews'}</Text>
      ) : null}
    </View>
  )

  if (loading) {
    return (
      <View style={styles.screen}>
        {header}
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </View>
    )
  }

  return (
    <View style={styles.screen}>
      {header}
      <FlatList
        data={reviews}
        keyExtractor={item => item.id || String(Math.random())}
        renderItem={({ item }) => (
          <ReviewCard
            review={item}
            reviewerName={reviewerNameFor(item.reviewer_id)}
            reviewerInitials={reviewerInitialsFor(item.reviewer_id)}
            jobCategory={jobCatMap[item.job_id] || null}
          />
        )}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: insets.bottom + 32 },
          reviews.length === 0 && styles.listContentEmpty,
        ]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>⭐</Text>
            <Text style={styles.emptyTitle}>No reviews yet</Text>
            <Text style={styles.emptyBody}>Reviews will appear here after jobs are completed.</Text>
          </View>
        }
      />
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
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn:     { marginBottom: 12, minHeight: 36, justifyContent: 'center', alignSelf: 'flex-start' },
  backBtnText: { color: colors.primary, fontSize: 15, fontWeight: '600' },
  kicker:      { fontSize: 13, fontWeight: '700', color: colors.primary, marginBottom: 8 },
  headerTitle: { fontSize: 34, lineHeight: 38, fontWeight: '700', color: colors.textPrimary },
  headerSub:   { fontSize: 14, color: colors.textMuted, marginTop: 4 },

  // ─── List ──────────────────────────────────────────────────────────
  listContent:      { padding: 16 },
  listContentEmpty: { flex: 1 },

  // ─── Review card ───────────────────────────────────────────────────
  reviewCard: {
    backgroundColor: colors.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  reviewHeader:     { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  reviewerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  reviewerInitials: { fontSize: 13, fontWeight: '700', color: colors.primary },
  reviewMeta:       { flex: 1 },
  reviewerName:     { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  reviewDate:       { fontSize: 12, color: colors.textMuted, marginTop: 1 },
  starRow:          { flexDirection: 'row', gap: 1 },
  reviewComment:    { fontSize: 14, color: colors.textSecondary, lineHeight: 22 },
  categoryChip: {
    marginTop: 10,
    alignSelf: 'flex-start',
    backgroundColor: colors.primaryLight,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  categoryChipText: { fontSize: 12, fontWeight: '700', color: colors.primary },

  // ─── Empty state ───────────────────────────────────────────────────
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, marginTop: 60 },
  emptyIcon:  { fontSize: 48, marginBottom: 16 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: colors.textPrimary, marginBottom: 8, textAlign: 'center' },
  emptyBody:  { fontSize: 15, color: colors.textSecondary, lineHeight: 22, textAlign: 'center' },
})
