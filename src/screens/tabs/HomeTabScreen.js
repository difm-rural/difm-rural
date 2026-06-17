import React, { useCallback, useState } from 'react'
import {
  ActivityIndicator,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '../../lib/supabase'
import { colors } from '../../theme/tokens'
import {
  NOTIFICATION_ICONS,
  fetchNotifications,
  notificationTimeAgo,
  openNotificationTarget,
} from '../../lib/notifications'
import { canProvide } from '../../lib/roles'

function getInitials(name) {
  if (!name) return '?'
  return name.trim().split(/\s+/).map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()
}

function PrimaryAction({ title, subtitle, onPress, variant = 'primary' }) {
  const isPrimary = variant === 'primary'
  return (
    <TouchableOpacity
      style={[styles.actionCard, isPrimary ? styles.primaryAction : styles.secondaryAction]}
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={title}>
      <Text style={[styles.actionTitle, isPrimary ? styles.primaryActionText : styles.secondaryActionText]}>
        {title}
      </Text>
      <Text style={[styles.actionSubtitle, isPrimary ? styles.primaryActionSub : styles.secondaryActionSub]}>
        {subtitle}
      </Text>
    </TouchableOpacity>
  )
}

function SummaryRow({ label, count, onPress, last }) {
  return (
    <TouchableOpacity
      style={[styles.summaryRow, !last && styles.summaryRowBorder]}
      onPress={onPress}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel={`${count} ${label}`}>
      <View style={styles.summaryCount}>
        <Text style={styles.summaryCountText}>{count}</Text>
      </View>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryChevron}>›</Text>
    </TouchableOpacity>
  )
}

export default function HomeTabScreen({ navigation }) {
  const insets = useSafeAreaInsets()
  const [userId, setUserId]             = useState(null)
  const [profile, setProfile]           = useState(null)
  const [notifications, setNotifications] = useState([])
  const [summary, setSummary]           = useState({})
  const [loading, setLoading]           = useState(true)
  const [refreshing, setRefreshing]     = useState(false)

  useFocusEffect(useCallback(() => { load() }, []))

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); setRefreshing(false); return }
    setUserId(user.id)

    const { data: prof } = await supabase
      .from('profiles')
      .select('id, full_name, avatar_url, primary_role, role')
      .eq('id', user.id)
      .single()
    setProfile(prof)

    const isRequester = true              // everyone can request
    const isProvider  = canProvide(prof)  // providing is additive

    const [notifs, counts] = await Promise.all([
      fetchNotifications(8),
      fetchSummary(user.id, isRequester, isProvider),
    ])
    setNotifications(notifs)
    setSummary(counts)
    setLoading(false)
    setRefreshing(false)
  }

  async function fetchSummary(uid, isRequester, isProvider) {
    const activeBookingStatuses = ['pending', 'quote_sent', 'confirmed', 'in_progress', 'awaiting_completion', 'cancellation_requested']
    const tasks = []

    tasks.push(isRequester
      ? supabase.from('jobs').select('id', { count: 'exact', head: true })
          .eq('requester_id', uid).in('status', ['open', 'accepted', 'in_progress'])
      : Promise.resolve({ count: 0 }))
    tasks.push(isRequester
      ? supabase.from('bookings').select('id', { count: 'exact', head: true })
          .eq('requester_id', uid).in('status', activeBookingStatuses)
      : Promise.resolve({ count: 0 }))
    tasks.push(isProvider
      ? supabase.from('bids').select('id, jobs!inner(status)')
          .eq('provider_id', uid).in('status', ['pending', 'accepted'])
      : Promise.resolve({ data: [] }))
    tasks.push(isProvider
      ? supabase.from('bookings').select('id', { count: 'exact', head: true })
          .eq('provider_id', uid).in('status', activeBookingStatuses)
      : Promise.resolve({ count: 0 }))

    const [jobsRes, reqBookingsRes, bidsRes, provBookingsRes] = await Promise.all(tasks)

    const bids = bidsRes.data || []
    return {
      activeJobs:      jobsRes.count || 0,
      reqBookings:     reqBookingsRes.count || 0,
      pendingBids:     bids.filter(b => b.jobs?.status === 'open').length,
      jobsDoing:       bids.filter(b => ['accepted', 'in_progress'].includes(b.jobs?.status)).length,
      provBookings:    provBookingsRes.count || 0,
    }
  }

  function onRefresh() {
    setRefreshing(true)
    load()
  }

  const isRequester = true
  const isProvider  = canProvide(profile)
  const firstName   = profile?.full_name?.split(' ')[0] || 'there'
  const initials    = getInitials(profile?.full_name)
  const unread      = notifications.filter(n => !n.read)
  const attention   = unread.slice(0, 5)
  const totalActive = (summary.activeJobs || 0) + (summary.reqBookings || 0)
    + (summary.pendingBids || 0) + (summary.jobsDoing || 0) + (summary.provBookings || 0)

  if (loading) {
    return (
      <View style={[styles.screen, styles.center]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    )
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: insets.top + 18, paddingBottom: insets.bottom + 88 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.kicker}>Rural Services</Text>
            <Text style={styles.title}>
              {isProvider && !isRequester ? 'Ready for work?' : 'What needs doing?'}
            </Text>
            <Text style={styles.subtitle}>
              {totalActive > 0
                ? `${totalActive} active item${totalActive === 1 ? '' : 's'} on the go`
                : `Good to see you, ${firstName}`}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.avatarButton}
            onPress={() => navigation.getParent()?.navigate('Account')}
            accessibilityRole="button"
            accessibilityLabel="Open account">
            {profile?.avatar_url ? (
              <Image source={{ uri: profile.avatar_url }} style={styles.avatar} />
            ) : (
              <Text style={styles.avatarText}>{initials}</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Request — everyone can do this */}
        <View style={styles.actionsGrid}>
          <PrimaryAction
            title="Post a job"
            subtitle="Describe the work and get local help"
            onPress={() => navigation.getParent()?.navigate('Jobs', { screen: 'PostJob' })}
          />
          <PrimaryAction
            title="Browse services"
            subtitle="Book advertised rural services"
            variant="secondary"
            onPress={() => navigation.getParent()?.navigate('Browse')}
          />
        </View>

        {/* Provide — only if the user offers services / does jobs */}
        {isProvider && (
          <View style={styles.actionsGrid}>
            <PrimaryAction
              title="Find jobs"
              subtitle="Browse open rural work nearby"
              onPress={() => navigation.getParent()?.navigate('Jobs')}
            />
            <PrimaryAction
              title="Advertise a service"
              subtitle="Offer your skills, gear, or delivery run"
              variant="secondary"
              onPress={() => navigation.getParent()?.navigate('Account', { screen: 'CreateService' })}
            />
          </View>
        )}

        {/* Needs attention — unread notifications */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Needs attention</Text>
            <TouchableOpacity
              onPress={() => navigation.navigate('Notifications')}
              accessibilityRole="button"
              accessibilityLabel="See all notifications">
              <Text style={styles.sectionLink}>
                {unread.length > 0 ? `See all (${unread.length})` : 'See all'}
              </Text>
            </TouchableOpacity>
          </View>
          {attention.length === 0 ? (
            <Text style={styles.allClearText}>All caught up — nothing waiting on you.</Text>
          ) : (
            attention.map((n, i) => (
              <TouchableOpacity
                key={n.id}
                style={[styles.notifRow, i < attention.length - 1 && styles.notifRowBorder]}
                onPress={() => openNotificationTarget(navigation, userId, n)}
                activeOpacity={0.75}
                accessibilityRole="button"
                accessibilityLabel={n.body}>
                <Text style={styles.notifIcon}>{NOTIFICATION_ICONS[n.type] || '🔔'}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.notifBody} numberOfLines={2}>{n.body}</Text>
                  <Text style={styles.notifTime}>{notificationTimeAgo(n.created_at)}</Text>
                </View>
                <View style={styles.notifDot} />
              </TouchableOpacity>
            ))
          )}
        </View>

        {/* Active work summary */}
        {totalActive > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Your activity</Text>
            </View>
            {summary.activeJobs > 0 && (
              <SummaryRow
                label={`active job post${summary.activeJobs === 1 ? '' : 's'}`}
                count={summary.activeJobs}
                onPress={() => navigation.getParent()?.navigate('Activity')}
              />
            )}
            {summary.reqBookings > 0 && (
              <SummaryRow
                label={`service booking${summary.reqBookings === 1 ? '' : 's'}`}
                count={summary.reqBookings}
                onPress={() => navigation.getParent()?.navigate('Activity')}
              />
            )}
            {summary.pendingBids > 0 && (
              <SummaryRow
                label={`bid${summary.pendingBids === 1 ? '' : 's'} awaiting an answer`}
                count={summary.pendingBids}
                onPress={() => navigation.getParent()?.navigate('Jobs')}
              />
            )}
            {summary.jobsDoing > 0 && (
              <SummaryRow
                label={`job${summary.jobsDoing === 1 ? '' : 's'} you're doing`}
                count={summary.jobsDoing}
                onPress={() => navigation.getParent()?.navigate('Activity')}
              />
            )}
            {summary.provBookings > 0 && (
              <SummaryRow
                label={`booking${summary.provBookings === 1 ? '' : 's'} for your services`}
                count={summary.provBookings}
                onPress={() => navigation.getParent()?.navigate('Activity')}
                last
              />
            )}
          </View>
        )}

        {totalActive === 0 && (
          <View style={styles.section}>
            <Text style={styles.emptyTitle}>No active work yet</Text>
            <Text style={styles.emptyBody}>
              {isProvider && !isRequester
                ? 'Find jobs on the board or advertise a service when you are ready.'
                : 'Post a job or browse services to get started.'}
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: { alignItems: 'center', justifyContent: 'center' },

  header: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 20 },
  kicker:   { fontSize: 12, letterSpacing: 1.5, fontWeight: '700', color: colors.primary, textTransform: 'uppercase', marginBottom: 6 },
  title:    { fontSize: 28, lineHeight: 32, fontWeight: '700', color: colors.textPrimary },
  subtitle: { fontSize: 14, color: colors.textSecondary, marginTop: 6 },

  avatarButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginLeft: 12,
  },
  avatar:     { width: 44, height: 44 },
  avatarText: { color: colors.primary, fontWeight: '700', fontSize: 16 },

  actionsGrid: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  actionCard:  { flex: 1, borderRadius: 14, padding: 16, minHeight: 104 },
  primaryAction:   { backgroundColor: colors.primary },
  secondaryAction: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border },
  actionTitle:    { fontSize: 16, fontWeight: '700', marginBottom: 4 },
  actionSubtitle: { fontSize: 12, lineHeight: 17 },
  primaryActionText:   { color: colors.white },
  primaryActionSub:    { color: 'rgba(255,255,255,0.85)' },
  secondaryActionText: { color: colors.textPrimary },
  secondaryActionSub:  { color: colors.textMuted },

  section: {
    backgroundColor: colors.white,
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  sectionLink:  { fontSize: 13, fontWeight: '600', color: colors.primary },

  allClearText: { fontSize: 14, color: colors.textMuted, lineHeight: 20 },

  notifRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 12,
  },
  notifRowBorder: { borderBottomWidth: 0.5, borderBottomColor: colors.border },
  notifIcon: { fontSize: 18, lineHeight: 22 },
  notifBody: { fontSize: 14, color: colors.textPrimary, lineHeight: 20 },
  notifTime: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  notifDot:  { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary, marginTop: 6 },

  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
  },
  summaryRowBorder: { borderBottomWidth: 0.5, borderBottomColor: colors.border },
  summaryCount: {
    minWidth: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  summaryCountText: { color: colors.primary, fontWeight: '700', fontSize: 14 },
  summaryLabel:     { flex: 1, fontSize: 14, color: colors.textPrimary },
  summaryChevron:   { fontSize: 20, color: colors.textMuted },

  emptyTitle: { fontSize: 16, fontWeight: '700', color: colors.textPrimary, marginBottom: 6 },
  emptyBody:  { fontSize: 14, color: colors.textMuted, lineHeight: 20 },
})
