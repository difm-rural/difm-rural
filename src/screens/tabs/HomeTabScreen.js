import React, { useCallback, useState } from 'react'
import {
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
import { JOB_ACTIVE_STATUSES, BOOKING_ACTIVE_STATUSES, isJobAwarded } from '../../lib/lifecycle'
import { colors } from '../../theme/tokens'
import Icon from '../../components/Icon'
import {
  NOTIFICATION_ICONS,
  fetchNotifications,
  notificationTimeAgo,
  openNotificationTarget,
} from '../../lib/notifications'
import { canProvide } from '../../lib/roles'
import EmptyState from '../../components/EmptyState'
import Loading from '../../components/Loading'
import { fetchConnectionsForRequester } from '../../lib/connections'
import { fetchInvitedJobsForProvider } from '../../lib/invites'
import { fetchSeasonalReminders, recordSeasonalEvent } from '../../lib/seasonalReminders'
import SeasonalReminderCard from '../../components/SeasonalReminderCard'

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

export default function HomeTabScreen({ navigation }) {
  const insets = useSafeAreaInsets()
  const [userId, setUserId]             = useState(null)
  const [profile, setProfile]           = useState(null)
  const [notifications, setNotifications] = useState([])
  const [summary, setSummary]           = useState({})
  const [connections, setConnections]   = useState([])
  const [invitedJobs, setInvitedJobs]   = useState([])
  const [seasonalReminders, setSeasonalReminders] = useState([])
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

    const [notifs, counts, conns, invited, reminders] = await Promise.all([
      fetchNotifications(8),
      fetchSummary(user.id, isRequester, isProvider),
      fetchConnectionsForRequester(user.id),
      isProvider ? fetchInvitedJobsForProvider(user.id) : Promise.resolve([]),
      fetchSeasonalReminders(),
    ])
    setNotifications(notifs)
    setSummary(counts)
    setConnections(conns)
    setInvitedJobs(invited)
    setSeasonalReminders(reminders)
    reminders.forEach(reminder => recordSeasonalEvent(reminder.id, 'impression'))
    setLoading(false)
    setRefreshing(false)
  }

  async function fetchSummary(uid, isRequester, isProvider) {
    const activeBookingStatuses = BOOKING_ACTIVE_STATUSES
    const tasks = []

    tasks.push(isRequester
      ? supabase.from('jobs').select('id', { count: 'exact', head: true })
          .eq('requester_id', uid).in('status', JOB_ACTIVE_STATUSES)
      : Promise.resolve({ count: 0 }))
    tasks.push(isRequester
      ? supabase.from('bookings').select('id', { count: 'exact', head: true })
          .eq('requester_id', uid).in('status', activeBookingStatuses)
      : Promise.resolve({ count: 0 }))
    // Anyone can place an offer, so always look for offers to track (not just
    // provider accounts).
    tasks.push(
      supabase.from('bids').select('id, jobs!inner(status)')
        .eq('provider_id', uid).in('status', ['pending', 'accepted']))
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
      jobsDoing:       bids.filter(b => isJobAwarded(b.jobs?.status)).length,
      provBookings:    provBookingsRes.count || 0,
    }
  }

  function onRefresh() {
    setRefreshing(true)
    load()
  }

  function dismissSeasonalReminder(campaign) {
    setSeasonalReminders(items => items.filter(item => item.id !== campaign.id))
    recordSeasonalEvent(campaign.id, 'dismiss')
  }

  function openSeasonalAction(campaign) {
    recordSeasonalEvent(campaign.id, 'action')
    if (campaign.primary_action === 'post_job') {
      navigation.getParent()?.navigate('Jobs', { screen: 'PostJob', params: { origin: 'Home' } })
    } else if (campaign.primary_action === 'browse_services') {
      navigation.getParent()?.navigate('Browse')
    } else if (campaign.primary_action === 'manage_profile') {
      navigation.getParent()?.navigate('Account', { screen: 'Profile' })
    }
  }

  const isRequester = true
  const isProvider  = canProvide(profile)
  const firstName   = profile?.full_name?.split(' ')[0] || 'there'
  const unread      = notifications.filter(n => !n.read)
  const attention   = unread.slice(0, 5)
  const totalActive = (summary.activeJobs || 0) + (summary.reqBookings || 0)
    + (summary.pendingBids || 0) + (summary.jobsDoing || 0) + (summary.provBookings || 0)

  // Three stat tiles for the "Your activity" row (mock-style): posts you've made,
  // offers you've placed, and everything active/booked.
  const activityTiles = [
    { label: 'Open jobs',   count: summary.activeJobs || 0,  target: 'Activity' },
    { label: 'Offers made', count: summary.pendingBids || 0, target: 'Jobs' },
    { label: 'In progress', count: (summary.jobsDoing || 0) + (summary.reqBookings || 0) + (summary.provBookings || 0), target: 'Activity' },
  ]

  if (loading) {
    return (
      <View style={styles.screen}>
        <Loading />
      </View>
    )
  }

  return (
    <View style={styles.screen}>
      {/* Fixed header — stays put while content scrolls (matches the other tabs) */}
      <View style={[styles.header, { paddingTop: insets.top + 18 }]}>
        <View style={{ flex: 1 }}>
          <Text style={styles.kicker}>Rural Connections</Text>
          <View style={styles.titleRow}>
            <Image source={require('../../../assets/brand/barn-badge-red.png')} style={styles.brandBadge} />
            <Text style={styles.title}>
              {isProvider && !isRequester ? 'Ready for work?' : 'What needs doing?'}
            </Text>
          </View>
          <Text style={styles.subtitle}>
            {totalActive > 0
              ? `${totalActive} active item${totalActive === 1 ? '' : 's'} on the go`
              : `Good to see you, ${firstName}`}
          </Text>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: insets.bottom + 88 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        showsVerticalScrollIndicator={false}>

        {/* Request — everyone can do this */}
        <View style={styles.actionsGrid}>
          <PrimaryAction
            title="Post a job"
            subtitle="Describe the work and get local help"
            onPress={() => navigation.getParent()?.navigate('Jobs', { screen: 'PostJob', params: { origin: 'Home' } })}
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

        {/* Invited to you — private job offers from past requesters */}
        {invitedJobs.length > 0 && (
          <TouchableOpacity
            style={styles.inviteCard}
            onPress={() => navigation.navigate('InvitedJobs')}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={`You've been invited to ${invitedJobs.length} jobs`}>
            <Icon name="mail-open-outline" size={22} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.inviteCardTitle}>
                You've been invited to {invitedJobs.length} job{invitedJobs.length === 1 ? '' : 's'}
              </Text>
              <Text style={styles.inviteCardSub}>Someone you've worked with offered you work directly.</Text>
            </View>
            <Icon name="chevron-forward" size={18} color={colors.primary} />
          </TouchableOpacity>
        )}

        {/* Needs attention — unread notifications */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Needs attention</Text>
            <TouchableOpacity
              onPress={() => navigation.navigate('Notifications')}
              accessibilityRole="button"
              accessibilityLabel="All notifications">
              <Text style={styles.sectionLink}>
                {unread.length > 0 ? `All notifications (${unread.length})` : 'All notifications'}
              </Text>
            </TouchableOpacity>
          </View>
          {attention.length === 0 ? (
            <View style={styles.attentionClear}>
              <Icon name="checkmark-circle" size={18} color={colors.success} />
              <Text style={styles.attentionClearText}>All caught up — nothing waiting on you.</Text>
            </View>
          ) : (
            attention.map((n, i) => (
              <TouchableOpacity
                key={n.id}
                style={[styles.notifRow, i < attention.length - 1 && styles.notifRowBorder]}
                onPress={() => openNotificationTarget(navigation, userId, n)}
                activeOpacity={0.75}
                accessibilityRole="button"
                accessibilityLabel={n.body}>
                <Icon name={NOTIFICATION_ICONS[n.type] || 'notifications-outline'} size={20} color={colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.notifBody} numberOfLines={2}>{n.body}</Text>
                  <Text style={styles.notifTime}>{notificationTimeAgo(n.created_at)}</Text>
                </View>
                <View style={styles.notifDot} />
              </TouchableOpacity>
            ))
          )}
        </View>

        {/* Active work summary — stat tiles */}
        {totalActive > 0 && (
          <View style={styles.activitySection}>
            <Text style={styles.activityHeading}>Your activity</Text>
            <View style={styles.statRow}>
              {activityTiles.map(t => (
                <TouchableOpacity
                  key={t.label}
                  style={styles.statTile}
                  onPress={() => navigation.getParent()?.navigate(t.target)}
                  activeOpacity={0.75}
                  accessibilityRole="button"
                  accessibilityLabel={`${t.count} ${t.label}`}>
                  <Text style={styles.statNumber}>{t.count}</Text>
                  <Text style={styles.statLabel}>{t.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {totalActive === 0 && (
          <View style={styles.section}>
            <EmptyState
              compact
              icon="leaf-outline"
              title="No active work yet"
              body={
                isProvider && !isRequester
                  ? 'Find jobs on the board or advertise a service when you are ready.'
                  : 'Post a job or browse services to get started.'
              }
            />
          </View>
        )}

        {seasonalReminders.length > 0 && (
          <View style={styles.seasonalSection}>
            <Text style={styles.activityHeading}>Useful right now</Text>
            {seasonalReminders.map(campaign => (
              <SeasonalReminderCard
                key={campaign.id}
                campaign={campaign}
                onAction={openSeasonalAction}
                onDismiss={dismissSeasonalReminder}
              />
            ))}
          </View>
        )}

        {/* Your connections — a button to the full list */}
        {connections.length > 0 && (
          <TouchableOpacity
            style={styles.connCard}
            onPress={() => navigation.navigate('Connections')}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={`Your connections, ${connections.length}`}>
            <Icon name="people-outline" size={22} color={colors.primary} />
            <Text style={styles.connCardTitle}>Your connections</Text>
            <View style={styles.summaryCount}>
              <Text style={styles.summaryCountText}>{connections.length}</Text>
            </View>
            <Icon name="chevron-forward" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },

  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingBottom: 14,
    backgroundColor: colors.background,
  },
  kicker:     { fontSize: 12, letterSpacing: 1.5, fontWeight: '700', color: colors.accent, textTransform: 'uppercase', marginBottom: 6 },
  titleRow:   { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandBadge: { width: 30, height: 30, borderRadius: 8 },
  title:      { fontSize: 28, lineHeight: 32, fontWeight: '700', color: colors.textPrimary, flexShrink: 1 },
  subtitle: { fontSize: 14, color: colors.textSecondary, marginTop: 6 },

  actionsGrid: { flexDirection: 'row', gap: 12, marginBottom: 15 },
  actionCard:  { flex: 1, borderRadius: 12, padding: 16, minHeight: 104 },
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
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  sectionLink:  { fontSize: 13, fontWeight: '600', color: colors.primary },

  attentionClear: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 2 },
  attentionClearText: { fontSize: 13, color: colors.textMuted },

  inviteCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.primaryLight,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  inviteCardTitle: { fontSize: 15, fontWeight: '700', color: colors.primary },
  inviteCardSub:   { fontSize: 12.5, color: colors.textSecondary, marginTop: 2 },

  connCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  connCardTitle: { flex: 1, fontSize: 16, fontWeight: '700', color: colors.textPrimary },

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

  // Connections button count pill
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

  // "Your activity" stat tiles
  activitySection: { marginBottom: 12 },
  seasonalSection: { marginTop: 1 },
  activityHeading: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  statRow:  { flexDirection: 'row', gap: 10 },
  statTile: {
    flex: 1,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  statNumber: { fontSize: 22, fontWeight: '800', color: colors.primary },
  statLabel:  { fontSize: 11, color: colors.textMuted, marginTop: 2, textAlign: 'center' },

})
