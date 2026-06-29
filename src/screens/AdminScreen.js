import React, { useEffect, useState } from 'react'
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '../lib/supabase'
import { colors } from '../theme/tokens'
import Icon from '../components/Icon'
import Loading from '../components/Loading'
import EmptyState from '../components/EmptyState'

const JOB_AWARDED = ['accepted', 'in_progress', 'awaiting_completion']
const BOOKING_ACTIVE = ['pending', 'quote_sent', 'confirmed', 'in_progress', 'awaiting_completion', 'cancellation_requested']
const TIME_FILTERS = [
  { key: '24h', label: 'Last 24 hours', hours: 24 },
  { key: '7d', label: 'Last 7 days', hours: 24 * 7 },
  { key: '30d', label: 'Last 30 days', hours: 24 * 30 },
  { key: 'all', label: 'All time', hours: null },
]

function timeAgo(iso) {
  if (!iso) return ''
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function StatTile({ label, value, tone = 'default' }) {
  return (
    <View style={[styles.statTile, tone === 'warn' && styles.statTileWarn]}>
      <Text style={styles.statValue}>{value ?? 0}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  )
}

function Section({ title, children, actionLabel, onAction }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {!!actionLabel && (
          <TouchableOpacity onPress={onAction} accessibilityRole="button" accessibilityLabel={actionLabel}>
            <Text style={styles.sectionAction}>{actionLabel}</Text>
          </TouchableOpacity>
        )}
      </View>
      {children}
    </View>
  )
}

function Row({ title, meta, status, icon = 'ellipse-outline' }) {
  return (
    <View style={styles.row}>
      <View style={styles.rowIcon}>
        <Icon name={icon} size={17} color={colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle} numberOfLines={1}>{title || 'Untitled'}</Text>
        {!!meta && <Text style={styles.rowMeta} numberOfLines={1}>{meta}</Text>}
      </View>
      {!!status && (
        <View style={styles.statusPill}>
          <Text style={styles.statusText}>{status}</Text>
        </View>
      )}
    </View>
  )
}

export default function AdminScreen({ navigation }) {
  const insets = useSafeAreaInsets()
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [allowed, setAllowed] = useState(false)
  const [timeFilter, setTimeFilter] = useState('all')
  const [filterOpen, setFilterOpen] = useState(false)
  const [counts, setCounts] = useState({})
  const [recentJobs, setRecentJobs] = useState([])
  const [recentServices, setRecentServices] = useState([])
  const [recentBookings, setRecentBookings] = useState([])
  const [recentUsers, setRecentUsers] = useState([])
  const [recentActivity, setRecentActivity] = useState([])
  const [recentMessages, setRecentMessages] = useState({ job: 0, service: 0 })

  const activeFilter = TIME_FILTERS.find(option => option.key === timeFilter) || TIME_FILTERS[0]

  useEffect(() => { load(timeFilter) }, [timeFilter])

  function cutoffFor(filterKey) {
    const option = TIME_FILTERS.find(item => item.key === filterKey)
    if (!option?.hours) return null
    return new Date(Date.now() - option.hours * 60 * 60 * 1000).toISOString()
  }

  function withTimeFilter(query, cutoff) {
    return cutoff ? query.gte('created_at', cutoff) : query
  }

  async function safeCount(table, cutoff, build = q => q) {
    const query = withTimeFilter(supabase.from(table).select('id', { count: 'exact', head: true }), cutoff)
    const { count } = await build(query)
    return count || 0
  }

  async function load(filterKey = timeFilter) {
    setRefreshing(true)
    const cutoff = cutoffFor(filterKey)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setAllowed(false)
      setLoading(false)
      setRefreshing(false)
      return
    }

    const { data: me } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .maybeSingle()

    const isAdmin = !!me?.is_admin
    setAllowed(isAdmin)
    if (!isAdmin) {
      setLoading(false)
      setRefreshing(false)
      return
    }

    const [
      users,
      jobs,
      openJobs,
      awardedJobs,
      completedJobs,
      bids,
      pendingBids,
      services,
      activeServices,
      bookings,
      activeBookings,
      reviews,
      notifications,
      jobMessageCount,
      serviceMessageCount,
      jobsData,
      servicesData,
      bookingsData,
      usersData,
      activityData,
    ] = await Promise.all([
      safeCount('profiles', cutoff),
      safeCount('jobs', cutoff),
      safeCount('jobs', cutoff, q => q.eq('status', 'open')),
      safeCount('jobs', cutoff, q => q.in('status', JOB_AWARDED)),
      safeCount('jobs', cutoff, q => q.eq('status', 'completed')),
      safeCount('bids', cutoff),
      safeCount('bids', cutoff, q => q.eq('status', 'pending')),
      safeCount('services', cutoff),
      safeCount('services', cutoff, q => q.eq('is_active', true)),
      safeCount('bookings', cutoff),
      safeCount('bookings', cutoff, q => q.in('status', BOOKING_ACTIVE)),
      safeCount('reviews', cutoff),
      safeCount('notifications', cutoff),
      safeCount('messages', cutoff),
      safeCount('service_booking_messages', cutoff),
      withTimeFilter(supabase.from('jobs').select('id, title, status, category, location_name, created_at'), cutoff).order('created_at', { ascending: false }).limit(8),
      withTimeFilter(supabase.from('services').select('id, title, is_active, category, location_name, created_at'), cutoff).order('created_at', { ascending: false }).limit(8),
      withTimeFilter(supabase.from('bookings').select('id, status, location_name, created_at, service:service_id(title)'), cutoff).order('created_at', { ascending: false }).limit(8),
      withTimeFilter(supabase.from('profiles').select('id, full_name, primary_role, role, created_at'), cutoff).order('created_at', { ascending: false }).limit(8),
      withTimeFilter(supabase.from('user_activity').select('id, event_type, created_at'), cutoff).order('created_at', { ascending: false }).limit(10),
    ])

    setCounts({
      users, jobs, openJobs, awardedJobs, completedJobs,
      bids, pendingBids, services, activeServices, bookings,
      activeBookings, reviews, notifications,
    })
    setRecentMessages({ job: jobMessageCount, service: serviceMessageCount })
    setRecentJobs(jobsData.data || [])
    setRecentServices(servicesData.data || [])
    setRecentBookings(bookingsData.data || [])
    setRecentUsers(usersData.data || [])
    setRecentActivity(activityData.data || [])
    setLoading(false)
    setRefreshing(false)
  }

  if (loading) {
    return (
      <View style={styles.screen}>
        <Loading label="Loading admin overview..." />
      </View>
    )
  }

  if (!allowed) {
    return (
      <View style={styles.screen}>
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Icon name="chevron-back" size={18} color={colors.primary} />
            <Text style={styles.backText}>Account</Text>
          </TouchableOpacity>
          <Text style={styles.brandLabel}>RURAL CONNECTIONS</Text>
          <Text style={styles.headerTitle}>Admin</Text>
        </View>
        <EmptyState
          icon="lock-closed-outline"
          title="Admin access required"
          body="Ask an existing admin to enable this account before using the admin dashboard."
        />
      </View>
    )
  }

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Icon name="chevron-back" size={18} color={colors.primary} />
          <Text style={styles.backText}>Account</Text>
        </TouchableOpacity>
        <Text style={styles.brandLabel}>RURAL CONNECTIONS</Text>
        <Text style={styles.headerTitle}>Admin</Text>
        <Text style={styles.headerSub}>Read-only activity overview</Text>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(timeFilter)} tintColor={colors.primary} />}
        showsVerticalScrollIndicator={false}>

        <View style={styles.filterWrap}>
          <Text style={styles.filterLabel}>Activity window</Text>
          <TouchableOpacity
            style={styles.filterButton}
            onPress={() => setFilterOpen(open => !open)}
            accessibilityRole="button"
            accessibilityLabel="Choose admin activity window">
            <Text style={styles.filterButtonText}>{activeFilter.label}</Text>
            <Icon name={filterOpen ? 'chevron-up' : 'chevron-down'} size={18} color={colors.primary} />
          </TouchableOpacity>
          {filterOpen && (
            <View style={styles.filterMenu}>
              {TIME_FILTERS.map(option => {
                const selected = option.key === timeFilter
                return (
                  <TouchableOpacity
                    key={option.key}
                    style={[styles.filterOption, selected && styles.filterOptionSelected]}
                    onPress={() => {
                      setFilterOpen(false)
                      setTimeFilter(option.key)
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}>
                    <Text style={[styles.filterOptionText, selected && styles.filterOptionTextSelected]}>
                      {option.label}
                    </Text>
                    {selected && <Icon name="checkmark" size={17} color={colors.primary} />}
                  </TouchableOpacity>
                )
              })}
            </View>
          )}
        </View>

        <View style={styles.statsGrid}>
          <StatTile label="Users" value={counts.users} />
          <StatTile label="Jobs" value={counts.jobs} />
          <StatTile label="Open jobs" value={counts.openJobs} tone="warn" />
          <StatTile label="Awarded" value={counts.awardedJobs} />
          <StatTile label="Services" value={counts.services} />
          <StatTile label="Active services" value={counts.activeServices} />
          <StatTile label="Bookings" value={counts.bookings} />
          <StatTile label="Active bookings" value={counts.activeBookings} tone="warn" />
          <StatTile label="Offers" value={counts.bids} />
          <StatTile label="Pending offers" value={counts.pendingBids} tone="warn" />
          <StatTile label="Reviews" value={counts.reviews} />
          <StatTile label="Notifications" value={counts.notifications} />
        </View>

        <Section title="Message volume">
          <View style={styles.messageStats}>
            <StatTile label="Job chat messages" value={recentMessages.job} />
            <StatTile label="Service chat messages" value={recentMessages.service} />
          </View>
        </Section>

        <Section title="Recent jobs">
          {recentJobs.map(job => (
            <Row
              key={job.id}
              icon="briefcase-outline"
              title={job.title}
              meta={`${job.category || 'Job'} / ${job.location_name || 'No location'} / ${timeAgo(job.created_at)}`}
              status={job.status}
            />
          ))}
        </Section>

        <Section title="Recent services">
          {recentServices.map(service => (
            <Row
              key={service.id}
              icon="construct-outline"
              title={service.title}
              meta={`${service.category || 'Service'} / ${service.location_name || 'No location'} / ${timeAgo(service.created_at)}`}
              status={service.is_active ? 'active' : 'paused'}
            />
          ))}
        </Section>

        <Section title="Recent bookings">
          {recentBookings.map(booking => (
            <Row
              key={booking.id}
              icon="calendar-outline"
              title={booking.service?.title || 'Service booking'}
              meta={`${booking.location_name || 'No location'} / ${timeAgo(booking.created_at)}`}
              status={booking.status}
            />
          ))}
        </Section>

        <Section title="Recent users">
          {recentUsers.map(user => (
            <Row
              key={user.id}
              icon="person-circle-outline"
              title={user.full_name || 'Unnamed user'}
              meta={`${user.primary_role || user.role || 'requester'} / ${timeAgo(user.created_at)}`}
            />
          ))}
        </Section>

        <Section title="Recent app activity">
          {recentActivity.length === 0 ? (
            <Text style={styles.emptyText}>No activity events visible yet.</Text>
          ) : recentActivity.map(event => (
            <Row
              key={event.id}
              icon="pulse-outline"
              title={event.event_type}
              meta={timeAgo(event.created_at)}
            />
          ))}
        </Section>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { backgroundColor: colors.background, paddingHorizontal: 20, paddingBottom: 14 },
  backBtn: { minHeight: 34, flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', marginBottom: 6 },
  backText: { color: colors.primary, fontSize: 15, fontWeight: '700' },
  brandLabel: { fontSize: 12, fontWeight: '700', color: colors.accent, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 6 },
  headerTitle: { fontSize: 32, lineHeight: 36, fontWeight: '700', color: colors.textPrimary },
  headerSub: { fontSize: 14, color: colors.textSecondary, marginTop: 4 },
  filterWrap: {
    backgroundColor: colors.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 14,
    overflow: 'hidden',
  },
  filterLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 6,
  },
  filterButton: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingBottom: 12,
  },
  filterButtonText: { fontSize: 16, fontWeight: '800', color: colors.textPrimary },
  filterMenu: {
    borderTopWidth: 1,
    borderTopColor: '#f2f2f2',
    paddingVertical: 4,
  },
  filterOption: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
  },
  filterOptionSelected: { backgroundColor: colors.primaryLight },
  filterOptionText: { fontSize: 14, fontWeight: '700', color: colors.textSecondary },
  filterOptionTextSelected: { color: colors.primary },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 18 },
  statTile: {
    width: '31.5%',
    minHeight: 78,
    backgroundColor: colors.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    justifyContent: 'center',
  },
  statTileWarn: { backgroundColor: colors.warningLight, borderColor: '#f5d2a0' },
  statValue: { fontSize: 23, fontWeight: '800', color: colors.textPrimary, marginBottom: 2 },
  statLabel: { fontSize: 11, lineHeight: 15, color: colors.textMuted, fontWeight: '700' },
  section: {
    backgroundColor: colors.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 14,
    overflow: 'hidden',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f2f2f2',
  },
  sectionTitle: { fontSize: 14, fontWeight: '800', color: colors.textPrimary, textTransform: 'uppercase', letterSpacing: 0.5 },
  sectionAction: { color: colors.primary, fontSize: 13, fontWeight: '700' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f2f2f2',
    gap: 10,
  },
  rowIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTitle: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  rowMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  statusPill: { backgroundColor: colors.primaryLight, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  statusText: { color: colors.primary, fontSize: 11, fontWeight: '800' },
  messageStats: { flexDirection: 'row', gap: 10, padding: 12 },
  emptyText: { fontSize: 13, color: colors.textMuted, padding: 14 },
})
