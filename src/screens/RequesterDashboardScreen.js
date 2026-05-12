import React, { useEffect, useRef, useState } from 'react'
import { useFocusEffect } from '@react-navigation/native'
import {
  Animated,
  Alert,
  Dimensions,
  Easing,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { supabase } from '../lib/supabase'
import { colors } from '../theme/tokens'
import { trackEvent } from '../lib/analytics'
import JobCard from '../components/JobCard'

const { width: SCREEN_WIDTH } = Dimensions.get('window')

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

const TABS = [
  { key: 'active',     label: 'Active tasks' },
  { key: 'bids',       label: 'New bids'     },
  { key: 'inprogress', label: 'In progress'  },
]

// Pulsing skeleton rect
function SkeletonRect({ style }) {
  const opacity = useRef(new Animated.Value(0.4)).current
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.8, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ])
    )
    anim.start()
    return () => anim.stop()
  }, [])
  return <Animated.View style={[skStyles.rect, style, { opacity }]} />
}

function DashboardSkeletonCard() {
  return (
    <View style={skStyles.card}>
      <View style={skStyles.row}>
        <SkeletonRect style={skStyles.title} />
        <SkeletonRect style={skStyles.badge} />
      </View>
      <SkeletonRect style={skStyles.meta} />
      <View style={skStyles.btnRow}>
        <SkeletonRect style={skStyles.btn} />
        <SkeletonRect style={skStyles.btn} />
      </View>
    </View>
  )
}

const skStyles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e5e5e5',
  },
  rect: { backgroundColor: '#d1d5db', borderRadius: 6 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  title: { height: 18, width: '55%' },
  badge: { height: 22, width: 60, borderRadius: 11 },
  meta: { height: 14, width: '80%', marginBottom: 16 },
  btnRow: { flexDirection: 'row', gap: 8 },
  btn: { flex: 1, height: 40, borderRadius: 8 },
})

// Stat counter that animates from 0 to target
function CountUpText({ target, style }) {
  const [display, setDisplay] = useState(0)
  const progress = useRef(new Animated.Value(0)).current

  useEffect(() => {
    const id = progress.addListener(({ value }) => setDisplay(Math.round(value)))
    progress.setValue(0)
    Animated.timing(progress, {
      toValue: target,
      duration: 600,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    }).start()
    return () => {
      progress.removeListener(id)
      progress.stopAnimation()
    }
  }, [target])

  return <Text style={style}>{display}</Text>
}

export default function RequesterDashboardScreen({ navigation, route }) {
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [fullName, setFullName] = useState('')
  const [jobs, setJobs] = useState([])
  const [newBidsTotal, setNewBidsTotal] = useState(0)
  const [activeTab, setActiveTab] = useState('active')
  const [completedCount, setCompletedCount] = useState(0)
  const [contentView, setContentView] = useState('mytasks')
  const [browseJobs, setBrowseJobs] = useState([])
  const [browseLoading, setBrowseLoading] = useState(false)

  const appOpenedRef = useRef(false)

  // Toggle animation
  const [toggleWidth, setToggleWidth] = useState(SCREEN_WIDTH - 40)
  const toggleX = useRef(new Animated.Value(0)).current

  function handleTabPress(key) {
    trackEvent('tab_switched', { from: activeTab, to: key })
    setActiveTab(key)
  }

  function setContentViewAnimated(view) {
    const halfWidth = (toggleWidth - 6) / 2
    Animated.spring(toggleX, {
      toValue: view === 'browse' ? halfWidth : 0,
      damping: 20,
      stiffness: 250,
      useNativeDriver: true,
    }).start()
    setContentView(view)
  }

  useFocusEffect(React.useCallback(() => { fetchData() }, []))

  useEffect(() => {
    if (contentView === 'browse') fetchBrowseJobs()
  }, [contentView])

  useEffect(() => {
    if (route?.params?.guestPosted) {
      navigation.setParams({ guestPosted: false })
      navigation.navigate('MyJobs')
    }
  }, [route?.params?.guestPosted])

  async function fetchData() {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const [{ data: profile }, { data: jobList }, { count: doneCount }] = await Promise.all([
        supabase.from('profiles').select('full_name, avatar_url').eq('id', user.id).single(),
        supabase.from('jobs')
          .select('*')
          .eq('requester_id', user.id)
          .in('status', ['open', 'accepted', 'in_progress'])
          .order('created_at', { ascending: false }),
        supabase.from('jobs')
          .select('id', { count: 'exact', head: true })
          .eq('requester_id', user.id)
          .eq('status', 'completed'),
      ])

      if (!appOpenedRef.current) {
        appOpenedRef.current = true
        const now = new Date()
        trackEvent('app_opened', { time_of_day: now.getHours(), day_of_week: now.getDay() })
      }
      setFullName(profile?.full_name || '')
      setCompletedCount(doneCount || 0)

      const rawJobs = jobList || []
      const profileData = profile ? { full_name: profile.full_name, avatar_url: profile.avatar_url } : null

      if (rawJobs.length > 0) {
        const openIds = rawJobs.filter(j => j.status === 'open').map(j => j.id)
        let bidCountMap = {}
        if (openIds.length > 0) {
          const { data: pendingBids } = await supabase
            .from('bids').select('job_id').in('job_id', openIds).eq('status', 'pending')
          pendingBids?.forEach(b => { bidCountMap[b.job_id] = (bidCountMap[b.job_id] || 0) + 1 })
        }
        const allJobs = rawJobs.map(job => ({
          ...job,
          profiles: profileData,
          bidCount: bidCountMap[job.id] || 0,
        }))
        setJobs(allJobs)
        setNewBidsTotal(Object.values(bidCountMap).reduce((s, c) => s + c, 0))
      } else {
        setJobs([])
        setNewBidsTotal(0)
      }
    } catch (e) {
      console.log('Dashboard fetch error:', e)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  function onRefresh() {
    setRefreshing(true)
    if (contentView === 'browse') fetchBrowseJobs(true)
    else fetchData()
  }

  async function fetchBrowseJobs(isRefresh = false) {
    if (!isRefresh) setBrowseLoading(true)
    try {
      const { data: jobsData } = await supabase
        .from('jobs')
        .select('*')
        .eq('status', 'open')
        .order('created_at', { ascending: false })

      const rawJobs = jobsData || []

      if (rawJobs.length > 0) {
        const requesterIds = [...new Set(rawJobs.map(j => j.requester_id))]
        const [{ data: profilesData }, { data: bidsData }] = await Promise.all([
          supabase.from('profiles').select('id, full_name, avatar_url').in('id', requesterIds),
          supabase.from('bids').select('job_id').in('job_id', rawJobs.map(j => j.id)).eq('status', 'pending'),
        ])

        const bidCountMap = {}
        bidsData?.forEach(b => { bidCountMap[b.job_id] = (bidCountMap[b.job_id] || 0) + 1 })

        setBrowseJobs(rawJobs.map(job => ({
          ...job,
          profiles: profilesData?.find(p => p.id === job.requester_id) || null,
          bidCount: bidCountMap[job.id] || 0,
        })))
      } else {
        setBrowseJobs([])
      }
    } catch (e) {
      console.log('Browse fetch error:', e)
    } finally {
      setBrowseLoading(false)
      if (isRefresh) setRefreshing(false)
    }
  }

  const greeting = getGreeting()
  const firstName = fullName.split(' ')[0] || 'there'
  const activeTasks = jobs.filter(j => j.status === 'open').length
  const inProgressCount = jobs.filter(
    j => j.status === 'accepted' || j.status === 'in_progress'
  ).length

  const TAB_VALUES = { active: activeTasks, bids: newBidsTotal, inprogress: inProgressCount }

  const tabJobs = activeTab === 'active'
    ? jobs
    : activeTab === 'bids'
    ? jobs.filter(j => (j.bidCount || 0) > 0)
    : jobs.filter(j => j.status === 'accepted' || j.status === 'in_progress')

  const TAB_TITLES = {
    active:     'My tasks',
    bids:       'Tasks with new bids',
    inprogress: 'In progress',
  }

  function renderPanel() {
    if (tabJobs.length === 0) {
      const emptyConfig = {
        active:     { icon: '📋', title: 'No tasks yet', sub: 'Post your first task and get quotes from local providers.', btn: 'Post your first task' },
        bids:       { icon: '🏷️', title: 'No new bids yet', sub: 'Providers will bid on your open tasks — check back soon.' },
        inprogress: { icon: '🔧', title: 'Nothing in progress', sub: 'Accepted jobs will appear here once a bid is accepted.' },
      }[activeTab]
      return (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyIcon}>{emptyConfig.icon}</Text>
          <Text style={styles.emptyTitle}>{emptyConfig.title}</Text>
          <Text style={styles.emptySub}>{emptyConfig.sub}</Text>
          {emptyConfig.btn && (
            <TouchableOpacity
              style={styles.emptyBtn}
              onPress={() => navigation.navigate('PostJob')}
              accessibilityRole="button"
              accessibilityLabel={emptyConfig.btn}>
              <Text style={styles.emptyBtnText}>{emptyConfig.btn}</Text>
            </TouchableOpacity>
          )}
        </View>
      )
    }

    return tabJobs.map(job => (
      <JobCard
        key={job.id}
        job={job}
        bidCount={job.bidCount || 0}
        onPress={() => navigation.navigate('ManageTask', { job, bidCount: job.bidCount || 0 })}
      />
    ))
  }

  const pillWidth = (toggleWidth - 6) / 2

  if (loading) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <View>
              <Text style={styles.greeting}>{greeting}</Text>
              <Text style={styles.userName}>Loading... 👋</Text>
            </View>
          </View>
          <View style={styles.statsRow}>
            {TABS.map(tab => (
              <View key={tab.key} style={[styles.statTile, { backgroundColor: 'rgba(255,255,255,0.15)' }]}>
                <Text style={styles.statValue}>—</Text>
                <Text style={styles.statLabel}>{tab.label}</Text>
              </View>
            ))}
          </View>
        </View>
        <View style={styles.body}>
          {[1, 2, 3].map(i => <DashboardSkeletonCard key={i} />)}
        </View>
      </ScrollView>
    )
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={colors.white}
          colors={[colors.primary]}
        />
      }>

      {/* ── Green header ───────────────────────────────────────── */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.greeting}>{greeting}</Text>
            <Text style={styles.userName}>{firstName} 👋</Text>
          </View>
          <TouchableOpacity
            style={styles.profileIconBtn}
            onPress={() => navigation.navigate('Profile')}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel="My profile"
            accessibilityHint="Double tap to open your profile">
            <View style={styles.profileIconCircle}>
              <Text style={styles.profileIconText}>👤</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Tab tiles with animated stat counters */}
        <View style={styles.statsRow}>
          {TABS.map(tab => {
            const isActive = activeTab === tab.key
            return (
              <TouchableOpacity
                key={tab.key}
                style={[styles.statTile, isActive && styles.statTileActive]}
                onPress={() => handleTabPress(tab.key)}
                activeOpacity={0.75}
                accessibilityRole="button"
                accessibilityLabel={`${tab.label}, ${TAB_VALUES[tab.key]}`}
                accessibilityState={{ selected: isActive }}>
                <CountUpText
                  target={TAB_VALUES[tab.key]}
                  style={[styles.statValue, isActive && styles.statValueActive]}
                />
                <Text style={[styles.statLabel, isActive && styles.statLabelActive]}>
                  {tab.label}
                </Text>
                <View style={[styles.tabIndicator, isActive && styles.tabIndicatorActive]} />
              </TouchableOpacity>
            )
          })}
        </View>
      </View>

      {/* ── Body ───────────────────────────────────────────────── */}
      <View style={styles.body}>

        <TouchableOpacity
          style={styles.postTaskBtn}
          onPress={() => navigation.navigate('PostJob')}
          accessibilityRole="button"
          accessibilityLabel="Post a task"
          accessibilityHint="Double tap to post a new task">
          <Text style={styles.postTaskBtnText}>✏️  Post a task</Text>
        </TouchableOpacity>

        {/* My tasks / Browse all animated toggle */}
        <View
          style={styles.toggleWrap}
          onLayout={e => setToggleWidth(e.nativeEvent.layout.width)}>
          {/* Sliding pill indicator */}
          <Animated.View
            style={[
              styles.togglePill,
              { width: pillWidth > 0 ? pillWidth : '50%' },
              { transform: [{ translateX: toggleX }] },
            ]}
          />
          <TouchableOpacity
            style={styles.toggleOption}
            onPress={() => setContentViewAnimated('mytasks')}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="My tasks"
            accessibilityState={{ selected: contentView === 'mytasks' }}>
            <Text style={[styles.toggleOptionText, contentView === 'mytasks' && styles.toggleOptionTextActive]}>
              My tasks
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.toggleOption}
            onPress={() => setContentViewAnimated('browse')}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Browse all tasks"
            accessibilityState={{ selected: contentView === 'browse' }}>
            <Text style={[styles.toggleOptionText, contentView === 'browse' && styles.toggleOptionTextActive]}>
              Browse all
            </Text>
          </TouchableOpacity>
        </View>

        {contentView === 'mytasks' ? (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{TAB_TITLES[activeTab]}</Text>
              <TouchableOpacity
                onPress={() => navigation.navigate('MyJobs')}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityRole="button"
                accessibilityLabel="See all my jobs">
                <Text style={styles.seeAll}>See all →</Text>
              </TouchableOpacity>
            </View>

            {renderPanel()}

            <TouchableOpacity
              style={styles.postNewTaskBtn}
              onPress={() => navigation.navigate('PostJob')}
              accessibilityRole="button"
              accessibilityLabel="Post a new task">
              <Text style={styles.postNewTaskBtnText}>+ Post a new task</Text>
            </TouchableOpacity>

            {completedCount > 0 && (
              <TouchableOpacity
                style={styles.completedBtn}
                onPress={() => navigation.navigate('MyJobs', { filter: 'completed' })}
                accessibilityRole="button"
                accessibilityLabel={`View ${completedCount} completed tasks`}>
                <Text style={styles.completedBtnText}>
                  View completed tasks ({completedCount}) →
                </Text>
              </TouchableOpacity>
            )}
          </>
        ) : (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Browse listings</Text>
              <TouchableOpacity
                onPress={() => Alert.alert('Filters', 'Filter functionality coming soon.')}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityRole="button"
                accessibilityLabel="Filter listings">
                <Text style={styles.seeAll}>Filter</Text>
              </TouchableOpacity>
            </View>

            {browseLoading ? (
              [1, 2, 3].map(i => <DashboardSkeletonCard key={i} />)
            ) : browseJobs.length === 0 ? (
              <View style={styles.emptyWrap}>
                <Text style={styles.emptyIcon}>🔍</Text>
                <Text style={styles.emptyTitle}>No tasks available right now</Text>
                <Text style={styles.emptySub}>Check back soon — new tasks are posted regularly.</Text>
              </View>
            ) : (
              browseJobs.map(job => (
                <JobCard
                  key={job.id}
                  job={job}
                  bidCount={job.bidCount || 0}
                  onPress={() => navigation.navigate('JobDetail', { job })}
                />
              ))
            )}
          </>
        )}

      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  scrollContent: { paddingBottom: 40 },

  // ─── Header ──────────────────────────────────────────────────────
  header: {
    backgroundColor: colors.primary,
    paddingTop: 56,
    paddingHorizontal: 20,
    paddingBottom: 26,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 22,
  },
  greeting: { fontSize: 14, color: 'rgba(255,255,255,0.8)', fontWeight: '500', marginBottom: 4 },
  userName: { fontSize: 28, fontWeight: 'bold', color: colors.white },
  profileIconBtn: { paddingTop: 4, minHeight: 44, justifyContent: 'center' },
  profileIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileIconText: { fontSize: 20 },

  // ─── Tab tiles ───────────────────────────────────────────────────
  statsRow: { flexDirection: 'row', gap: 10 },
  statTile: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 12,
    paddingTop: 12,
    paddingBottom: 10,
    paddingHorizontal: 8,
    alignItems: 'center',
    minHeight: 44,
  },
  statTileActive: { backgroundColor: colors.white },
  statValue: { fontSize: 22, fontWeight: 'bold', color: colors.white },
  statValueActive: { color: colors.primary },
  statLabel: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.85)',
    marginTop: 3,
    textAlign: 'center',
    fontWeight: '500',
  },
  statLabelActive: { color: colors.primary },
  tabIndicator: { height: 3, width: 24, borderRadius: 2, marginTop: 6, backgroundColor: 'transparent' },
  tabIndicatorActive: { backgroundColor: colors.primary },

  // ─── Body ────────────────────────────────────────────────────────
  body: { padding: 20 },
  sectionTitle: { fontSize: 17, fontWeight: 'bold', color: colors.textPrimary, marginBottom: 12 },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  seeAll: { fontSize: 14, color: colors.primary, fontWeight: '600' },

  // ─── Post a task button ───────────────────────────────────────────
  postTaskBtn: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 14,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
    minHeight: 52,
    justifyContent: 'center',
  },
  postTaskBtnText: { color: colors.white, fontSize: 15, fontWeight: '700' },

  // ─── Animated toggle ─────────────────────────────────────────────
  toggleWrap: {
    flexDirection: 'row',
    backgroundColor: colors.border,
    borderRadius: 10,
    padding: 3,
    marginBottom: 22,
    position: 'relative',
  },
  togglePill: {
    position: 'absolute',
    top: 3,
    left: 3,
    bottom: 3,
    backgroundColor: colors.primary,
    borderRadius: 8,
  },
  toggleOption: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
    minHeight: 44,
    justifyContent: 'center',
    zIndex: 1,
  },
  toggleOptionText: { fontSize: 14, fontWeight: '600', color: colors.textMuted },
  toggleOptionTextActive: { color: colors.white },

  // ─── Post a new task (bottom of My tasks list) ────────────────────
  postNewTaskBtn: {
    marginTop: 8,
    marginBottom: 12,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.primary,
    backgroundColor: 'transparent',
    minHeight: 44,
    justifyContent: 'center',
  },
  postNewTaskBtnText: { color: colors.primary, fontSize: 14, fontWeight: '600' },

  // ─── Task cards ──────────────────────────────────────────────────
  taskCard: {
    backgroundColor: colors.white,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  taskTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
    gap: 10,
  },
  taskTitle: { fontSize: 15, fontWeight: '700', color: colors.textPrimary, flex: 1 },
  badge: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, flexShrink: 0 },
  badgeText: { fontSize: 13, fontWeight: '700' },
  taskMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 4,
    marginBottom: 14,
  },
  metaText: { fontSize: 13, color: colors.textMuted },
  metaDot:  { fontSize: 13, color: colors.border, marginHorizontal: 2 },

  // ─── Bid preview (New bids tab) ───────────────────────────────────
  bidPreviewList: {
    backgroundColor: '#f8faf9',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e8f0ec',
    marginBottom: 14,
    overflow: 'hidden',
  },
  bidPreviewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  bidPreviewBorder: { borderBottomWidth: 1, borderBottomColor: '#e8f0ec' },
  bidProviderName: { fontSize: 13, fontWeight: '600', color: colors.textPrimary, flex: 1 },
  bidPreviewAmount: { fontSize: 13, fontWeight: '700', color: colors.primary, marginLeft: 8 },
  moreBids: { fontSize: 13, color: colors.textMuted, paddingHorizontal: 12, paddingVertical: 8, fontStyle: 'italic' },

  // ─── In progress extras ───────────────────────────────────────────
  providerLine: { fontSize: 13, fontWeight: '600', color: colors.textSecondary, marginBottom: 10 },
  lastMsgWrap: {
    backgroundColor: colors.background,
    borderRadius: 8,
    padding: 10,
    marginBottom: 14,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
  },
  lastMsgLabel: { fontSize: 13, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 },
  lastMsgText: { fontSize: 13, color: colors.textSecondary, lineHeight: 20 },
  noMsgText: { fontSize: 13, color: colors.textMuted, fontStyle: 'italic', marginBottom: 14 },

  // ─── Action buttons ──────────────────────────────────────────────
  actions: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  actionsTop: { marginTop: 8 },
  btnFull: { flex: 1 },
  btnPrimary: {
    flex: 1,
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
  },
  btnPrimaryText: { color: colors.white, fontSize: 13, fontWeight: '700' },
  btnOutline: {
    flex: 1,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.primary,
    minHeight: 44,
    justifyContent: 'center',
  },
  btnOutlineText: { color: colors.primary, fontSize: 13, fontWeight: '700' },
  btnCancel: {
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.danger,
    backgroundColor: 'transparent',
    minHeight: 44,
    justifyContent: 'center',
  },
  btnCancelText: { color: colors.danger, fontSize: 13, fontWeight: '700' },
  btnDelete: {
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: colors.danger,
    minHeight: 44,
    justifyContent: 'center',
  },
  btnDeleteText: { color: colors.white, fontSize: 13, fontWeight: '700' },

  // ─── Completed tasks button ──────────────────────────────────────
  completedBtn: {
    marginTop: 8,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.textMuted,
    backgroundColor: 'transparent',
    minHeight: 44,
    justifyContent: 'center',
  },
  completedBtnText: { color: colors.textSecondary, fontSize: 14, fontWeight: '600' },

  // ─── Empty state ─────────────────────────────────────────────────
  emptyWrap: { alignItems: 'center', paddingVertical: 36, paddingHorizontal: 16 },
  emptyIcon:    { fontSize: 52, marginBottom: 16 },
  emptyTitle:   { fontSize: 18, fontWeight: 'bold', color: colors.textPrimary, marginBottom: 10 },
  emptySub:     { fontSize: 14, color: colors.textMuted, textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  emptyBtn:     { backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 16, paddingHorizontal: 28, minHeight: 52, justifyContent: 'center' },
  emptyBtnText: { color: colors.white, fontSize: 15, fontWeight: 'bold' },
})
