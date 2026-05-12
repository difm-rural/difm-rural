import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useFocusEffect } from '@react-navigation/native'
import {
  Alert,
  Animated,
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
import { removeFromWatchlist } from '../lib/watchlist'
import JobCard from '../components/JobCard'

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

function formatDate(isoString) {
  if (!isoString) return ''
  const d = new Date(isoString)
  return d.toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' })
}

function daysAgoText(isoString) {
  const days = Math.floor((Date.now() - new Date(isoString)) / 86400000)
  if (days === 0) return 'today'
  if (days === 1) return '1 day ago'
  return `${days} days ago`
}

// ─── Provider card components ─────────────────────────────────────────────────

function BidPendingCard({ bid, onWithdraw, navigation }) {
  const { job, amount, created_at } = bid
  if (!job) return null
  const total = job.totalBidCount || 0

  let infoText
  if (total <= 1) infoText = 'Only bid so far — good chance!'
  else if (total <= 3) infoText = `Submitted ${daysAgoText(created_at)} · Requester reviewing bids`
  else infoText = `${total} bids submitted — competitive task`

  return (
    <View style={styles.pCard}>
      <View style={styles.pCardHeader}>
        <Text style={styles.pCardTitle} numberOfLines={2}>{job.title}</Text>
        <View style={styles.pBadgeAmber}>
          <Text style={styles.pBadgeAmberText}>Your bid: ${amount} NZD</Text>
        </View>
      </View>
      <View style={styles.pMetaRow}>
        <Text style={styles.pMeta}>📍 {job.location_name}</Text>
        <Text style={styles.pMeta}>{job.category}</Text>
        <Text style={styles.pMeta}>{total} bid{total !== 1 ? 's' : ''} total</Text>
      </View>
      <View style={styles.pInfoBoxAmber}>
        <Text style={styles.pInfoBoxAmberText}>{infoText}</Text>
      </View>
      <View style={styles.pBtnRow}>
        <TouchableOpacity
          style={styles.pBtnWithdraw}
          onPress={() => onWithdraw(bid)}
          accessibilityRole="button"
          accessibilityLabel="Withdraw bid">
          <Text style={styles.pBtnWithdrawText}>Withdraw</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.pBtnPrimary}
          onPress={() => navigation.navigate('JobDetail', { job })}
          accessibilityRole="button"
          accessibilityLabel="View job details">
          <Text style={styles.pBtnPrimaryText}>View job →</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

function BidAcceptedCard({ bid, navigation }) {
  const { job } = bid
  if (!job) return null
  return (
    <View style={[styles.pCard, styles.pCardAccepted]}>
      <View style={styles.pCardHeader}>
        <Text style={styles.pCardTitle} numberOfLines={2}>{job.title}</Text>
        <View style={styles.pBadgeGreen}>
          <Text style={styles.pBadgeGreenText}>Accepted!</Text>
        </View>
      </View>
      <View style={styles.pMetaRow}>
        <Text style={styles.pMeta}>📍 {job.location_name}</Text>
        <Text style={styles.pMeta}>{job.category}</Text>
        {job.price_type === 'fixed'
          ? <Text style={styles.pMeta}>${job.price} NZD</Text>
          : <Text style={styles.pMeta}>Open to bids</Text>}
      </View>
      <View style={styles.pInfoBox}>
        <Text style={styles.pInfoBoxText}>
          ✅ Your bid was accepted — contact the requester to confirm your start time
        </Text>
      </View>
      <View style={styles.pBtnRow}>
        <TouchableOpacity
          style={styles.pBtnSecondary}
          onPress={() => navigation.navigate('Chat', {
            jobId: job.id,
            jobTitle: job.title,
            otherUserId: job.requester_id,
            otherUserName: job.profiles?.full_name || 'Requester',
          })}
          accessibilityRole="button"
          accessibilityLabel="Chat with requester">
          <Text style={styles.pBtnSecondaryText}>💬 Chat</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.pBtnPrimary}
          onPress={() => navigation.navigate('JobDetail', { job })}
          accessibilityRole="button"
          accessibilityLabel="Confirm start time">
          <Text style={styles.pBtnPrimaryText}>Confirm start →</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

function ActiveJobInProgressCard({ job, lastMessage, navigation }) {
  if (!job) return null
  const firstName = job.profiles?.full_name?.split(' ')[0] || 'Requester'
  const preview = lastMessage
    ? `💬 ${firstName}: ${lastMessage.length > 60 ? lastMessage.slice(0, 60) + '…' : lastMessage}`
    : null
  return (
    <View style={styles.pCard}>
      <View style={styles.pCardHeader}>
        <Text style={styles.pCardTitle} numberOfLines={2}>{job.title}</Text>
        <View style={styles.pBadgeBlue}>
          <Text style={styles.pBadgeBlueText}>In progress</Text>
        </View>
      </View>
      <View style={styles.pMetaRow}>
        <Text style={styles.pMeta}>📍 {job.location_name}</Text>
        {job.price_type === 'fixed'
          ? <Text style={styles.pMeta}>${job.price} NZD</Text>
          : <Text style={styles.pMeta}>Open to bids</Text>}
        {job.scheduled_date
          ? <Text style={styles.pMeta}>📅 {formatDate(job.scheduled_date)}</Text>
          : null}
      </View>
      {preview ? (
        <View style={styles.pChatPreview}>
          <Text style={styles.pChatPreviewText} numberOfLines={2}>{preview}</Text>
        </View>
      ) : null}
      <View style={styles.pBtnRow}>
        <TouchableOpacity
          style={styles.pBtnSecondary}
          onPress={() => navigation.navigate('Chat', {
            jobId: job.id,
            jobTitle: job.title,
            otherUserId: job.requester_id,
            otherUserName: job.profiles?.full_name || 'Requester',
          })}
          accessibilityRole="button"
          accessibilityLabel="Chat with requester">
          <Text style={styles.pBtnSecondaryText}>💬 Chat</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.pBtnPrimary}
          onPress={() => navigation.navigate('JobDetail', { job })}
          accessibilityRole="button"
          accessibilityLabel="Update progress">
          <Text style={styles.pBtnPrimaryText}>Update progress →</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

function ActiveJobNotStartedCard({ job, bid, navigation }) {
  if (!job) return null
  const agoText = daysAgoText(bid?.updated_at || job.updated_at)
  return (
    <View style={styles.pCard}>
      <View style={styles.pCardHeader}>
        <Text style={styles.pCardTitle} numberOfLines={2}>{job.title}</Text>
        <View style={styles.pBadgeGreen}>
          <Text style={styles.pBadgeGreenText}>Not started</Text>
        </View>
      </View>
      <View style={styles.pMetaRow}>
        <Text style={styles.pMeta}>📍 {job.location_name}</Text>
        {job.price_type === 'fixed'
          ? <Text style={styles.pMeta}>${job.price} NZD</Text>
          : <Text style={styles.pMeta}>Open to bids</Text>}
        {job.scheduled_date
          ? <Text style={styles.pMeta}>📅 {formatDate(job.scheduled_date)}</Text>
          : null}
      </View>
      <View style={styles.pInfoBox}>
        <Text style={styles.pInfoBoxText}>
          Accepted {agoText} · Confirm your start time with the requester
        </Text>
      </View>
      <View style={styles.pBtnRow}>
        <TouchableOpacity
          style={styles.pBtnSecondary}
          onPress={() => navigation.navigate('Chat', {
            jobId: job.id,
            jobTitle: job.title,
            otherUserId: job.requester_id,
            otherUserName: job.profiles?.full_name || 'Requester',
          })}
          accessibilityRole="button"
          accessibilityLabel="Chat with requester">
          <Text style={styles.pBtnSecondaryText}>💬 Chat</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.pBtnPrimary}
          onPress={() => navigation.navigate('JobDetail', { job })}
          accessibilityRole="button"
          accessibilityLabel="View job details">
          <Text style={styles.pBtnPrimaryText}>View details →</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

function CompletedProviderJobCard({ job, bid, navigation }) {
  if (!job) return null
  const requesterName = job.profiles?.full_name || 'Requester'
  return (
    <View style={styles.pCard}>
      <View style={styles.pCardHeader}>
        <Text style={styles.pCardTitle} numberOfLines={2}>{job.title}</Text>
        <View style={styles.pBadgeGreen}>
          <Text style={styles.pBadgeGreenText}>Completed</Text>
        </View>
      </View>
      <View style={styles.pMetaRow}>
        <Text style={styles.pMeta}>📍 {job.location_name}</Text>
        <Text style={styles.pMeta}>{job.category}</Text>
        {bid?.amount ? <Text style={styles.pMeta}>${bid.amount} NZD</Text> : null}
      </View>
      <View style={styles.pInfoBox}>
        <Text style={styles.pInfoBoxText}>Review {requesterName} and keep your work history up to date.</Text>
      </View>
      <TouchableOpacity
        style={styles.pBtnPrimary}
        onPress={() => navigation.navigate('JobDetail', { job })}
        accessibilityRole="button"
        accessibilityLabel="Review requester">
        <Text style={styles.pBtnPrimaryText}>Review requester →</Text>
      </TouchableOpacity>
    </View>
  )
}

function WatchlistCard({ watchItem, onUnwatch, navigation }) {
  const { job, bidCount } = watchItem
  const isUnavailable = job?.status !== 'open'
  if (!job) return null

  let infoBox = null
  if (!isUnavailable) {
    if (bidCount === 0) {
      infoBox = (
        <View style={styles.pInfoBox}>
          <Text style={styles.pInfoBoxText}>No bids yet — be the first!</Text>
        </View>
      )
    } else if (bidCount <= 2) {
      infoBox = (
        <View style={styles.pInfoBoxAmber}>
          <Text style={styles.pInfoBoxAmberText}>
            {bidCount} bid{bidCount !== 1 ? 's' : ''} submitted so far
          </Text>
        </View>
      )
    } else {
      infoBox = (
        <View style={styles.pInfoBoxAmber}>
          <Text style={styles.pInfoBoxAmberText}>Competitive — {bidCount} bids submitted</Text>
        </View>
      )
    }
  }

  return (
    <View style={[styles.pCard, isUnavailable && styles.pCardUnavailable]}>
      <View style={styles.pCardHeader}>
        <Text style={[styles.pCardTitle, isUnavailable && styles.pTextMuted]} numberOfLines={2}>
          {job.title}
        </Text>
        {isUnavailable ? (
          <View style={styles.pBadgeGray}>
            <Text style={styles.pBadgeGrayText}>No longer available</Text>
          </View>
        ) : (
          <View style={styles.pBadgeAmber}>
            <Text style={styles.pBadgeAmberText}>
              {bidCount > 0 ? `${bidCount} bid${bidCount !== 1 ? 's' : ''}` : 'Open'}
            </Text>
          </View>
        )}
      </View>
      {!isUnavailable && (
        <View style={styles.pMetaRow}>
          <Text style={styles.pMeta}>{job.category}</Text>
          <Text style={styles.pMeta}>📍 {job.location_name}</Text>
          {job.price_type === 'fixed'
            ? <Text style={styles.pMeta}>${job.price} NZD</Text>
            : <Text style={styles.pMeta}>Open to bids</Text>}
        </View>
      )}
      {infoBox}
      <View style={styles.pBtnRow}>
        <TouchableOpacity
          style={styles.pBtnUnwatch}
          onPress={() => onUnwatch(watchItem.jobId)}
          accessibilityRole="button"
          accessibilityLabel="Remove from watchlist">
          <Text style={styles.pBtnUnwatchText}>Unwatch</Text>
        </TouchableOpacity>
        {!isUnavailable && (
          <TouchableOpacity
            style={styles.pBtnPrimary}
            onPress={() => navigation.navigate('JobDetail', { job })}
            accessibilityRole="button"
            accessibilityLabel="Place a bid on this job">
            <Text style={styles.pBtnPrimaryText}>Place bid →</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  )
}

// ─── Animated counter ─────────────────────────────────────────────────────────

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

// ─── Main component ───────────────────────────────────────────────────────────

export default function UnifiedDashboardScreen({ navigation, route }) {
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [userId, setUserId] = useState(null)
  const [fullName, setFullName] = useState('')
  const [primaryRole, setPrimaryRole] = useState('requester')

  // Requester data
  const [postedJobs, setPostedJobs] = useState([])
  const [newBidsTotal, setNewBidsTotal] = useState(0)

  // Provider — Tab 1: Bids pending
  const [pendingBids, setPendingBids] = useState([])
  const [acceptedBidsNotStarted, setAcceptedBidsNotStarted] = useState([])

  // Provider — Tab 2: Active jobs
  const [inProgressBids, setInProgressBids] = useState([])
  const [completedProviderBids, setCompletedProviderBids] = useState([])

  // Provider — Tab 3: Watchlist
  const [watchlistItems, setWatchlistItems] = useState([])

  const [lastMessages, setLastMessages] = useState({})
  const [requesterTab, setRequesterTab] = useState('active')
  const [providerTab, setProviderTab] = useState('bidspending')

  // Shared (REQUESTER + BOTH modes)
  const [myBids, setMyBids] = useState([])

  useFocusEffect(useCallback(() => { fetchData() }, []))

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
      setUserId(user.id)

      const { data: profileData } = await supabase
        .from('profiles')
        .select('full_name, primary_role, role')
        .eq('id', user.id)
        .single()

      // primary_role is canonical; fall back to legacy role for accounts
      // where the trigger didn't populate primary_role yet.
      const role = profileData?.primary_role || profileData?.role || 'requester'
      setPrimaryRole(role)
      setFullName(profileData?.full_name?.split(' ')[0] || '')

      if (role === 'provider') {
        await Promise.all([
          fetchPostedJobs(user.id),
          fetchProviderData(user.id),
          fetchWatchlistData(user.id),
        ])
      } else {
        await Promise.all([
          fetchPostedJobs(user.id),
          fetchMyBidsSimple(user.id),
        ])
      }
    } catch {
      // silently skip
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  async function fetchPostedJobs(uid) {
    const { data: jobsData } = await supabase
      .from('jobs')
      .select('*')
      .eq('requester_id', uid)
      .order('created_at', { ascending: false })

    const rawJobs = jobsData || []
    if (rawJobs.length === 0) { setPostedJobs([]); setNewBidsTotal(0); return }

    const { data: profileData } = await supabase
      .from('profiles')
      .select('id, full_name, avatar_url')
      .eq('id', uid)
      .single()

    const openIds = rawJobs.filter(j => j.status === 'open').map(j => j.id)
    let bidCountMap = {}
    if (openIds.length > 0) {
      const { data: bidsData } = await supabase
        .from('bids').select('job_id').in('job_id', openIds).eq('status', 'pending')
      bidsData?.forEach(b => { bidCountMap[b.job_id] = (bidCountMap[b.job_id] || 0) + 1 })
    }

    setNewBidsTotal(Object.values(bidCountMap).reduce((s, c) => s + c, 0))
    setPostedJobs(rawJobs.map(job => ({
      ...job,
      profiles: profileData || null,
      bidCount: bidCountMap[job.id] || 0,
    })))
  }

  async function fetchMyBidsSimple(uid) {
    const { data: bidsData } = await supabase
      .from('bids')
      .select('*, jobs(*)')
      .eq('provider_id', uid)
      .order('created_at', { ascending: false })

    const bidList = bidsData || []
    if (bidList.length === 0) { setMyBids([]); return }

    const requesterIds = [...new Set(bidList.map(b => b.jobs?.requester_id).filter(Boolean))]
    const { data: profilesData } = await supabase
      .from('profiles')
      .select('id, full_name, avatar_url')
      .in('id', requesterIds)

    setMyBids(bidList.map(bid => ({
      ...bid,
      jobs: bid.jobs ? {
        ...bid.jobs,
        profiles: profilesData?.find(p => p.id === bid.jobs.requester_id) || null,
        bidCount: 0,
      } : null,
    })))
  }

  async function fetchProviderData(uid) {
    const { data: allBidsData } = await supabase
      .from('bids')
      .select('*')
      .eq('provider_id', uid)
      .in('status', ['pending', 'accepted'])
      .order('created_at', { ascending: false })

    const allBids = allBidsData || []
    if (allBids.length === 0) {
      setPendingBids([])
      setAcceptedBidsNotStarted([])
      setInProgressBids([])
      setCompletedProviderBids([])
      return
    }

    const jobIds = [...new Set(allBids.map(b => b.job_id))]

    const [jobsRes, bidCountsRes] = await Promise.all([
      supabase.from('jobs').select('*').in('id', jobIds),
      supabase.from('bids').select('job_id').in('job_id', jobIds),
    ])

    const jobList = jobsRes.data || []
    const bidCountMap = {}
    bidCountsRes.data?.forEach(b => { bidCountMap[b.job_id] = (bidCountMap[b.job_id] || 0) + 1 })

    const requesterIds = [...new Set(jobList.map(j => j.requester_id).filter(Boolean))]
    const { data: profilesData } = await supabase
      .from('profiles')
      .select('id, full_name, avatar_url')
      .in('id', requesterIds)

    const jobMap = {}
    jobList.forEach(j => {
      jobMap[j.id] = {
        ...j,
        profiles: profilesData?.find(p => p.id === j.requester_id) || null,
        totalBidCount: bidCountMap[j.id] || 0,
      }
    })

    const enrichedBids = allBids.map(bid => ({ ...bid, job: jobMap[bid.job_id] || null }))

    const pending = enrichedBids.filter(b => b.status === 'pending')
    const accepted = enrichedBids.filter(b => b.status === 'accepted')
    const acceptedNotStarted = accepted.filter(b => b.job?.status === 'accepted')
    const inProgress = accepted.filter(b => b.job?.status === 'in_progress')
    const completed = accepted.filter(b => b.job?.status === 'completed')

    setPendingBids(pending)
    setAcceptedBidsNotStarted(acceptedNotStarted)
    setInProgressBids(inProgress)
    setCompletedProviderBids(completed)

    if (inProgress.length > 0) {
      await fetchLastMessages(inProgress.map(b => b.job_id))
    }
  }

  async function fetchLastMessages(jobIds) {
    if (jobIds.length === 0) return
    try {
      const { data } = await supabase
        .from('messages')
        .select('job_id, content, created_at')
        .in('job_id', jobIds)
        .order('created_at', { ascending: false })

      if (!data) return
      const map = {}
      data.forEach(msg => {
        if (!map[msg.job_id]) map[msg.job_id] = msg.content
      })
      setLastMessages(map)
    } catch {
      // messages table may not exist — skip silently
    }
  }

  async function fetchWatchlistData(uid) {
    const { data: wlData } = await supabase
      .from('watchlist')
      .select('*')
      .eq('user_id', uid)
      .order('created_at', { ascending: false })

    const wlList = wlData || []
    if (wlList.length === 0) { setWatchlistItems([]); return }

    const jobIds = wlList.map(w => w.job_id)
    const { data: jobsData } = await supabase
      .from('jobs')
      .select('*')
      .in('id', jobIds)

    const jobList = jobsData || []

    const openJobIds = jobList.filter(j => j.status === 'open').map(j => j.id)
    let bidCountMap = {}
    if (openJobIds.length > 0) {
      const { data: bidsData } = await supabase
        .from('bids').select('job_id').in('job_id', openJobIds).eq('status', 'pending')
      bidsData?.forEach(b => { bidCountMap[b.job_id] = (bidCountMap[b.job_id] || 0) + 1 })
    }

    setWatchlistItems(wlList.map(wl => ({
      watchId: wl.id,
      jobId: wl.job_id,
      job: jobList.find(j => j.id === wl.job_id) || null,
      bidCount: bidCountMap[wl.job_id] || 0,
    })))
  }

  async function handleUnwatch(jobId) {
    if (!userId) return
    setWatchlistItems(prev => prev.filter(w => w.jobId !== jobId))
    await removeFromWatchlist(userId, jobId)
  }

  async function handleWithdrawBid(bid) {
    Alert.alert(
      'Withdraw bid',
      `Withdraw your bid of $${bid.amount} NZD?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Withdraw',
          style: 'destructive',
          onPress: async () => {
            await supabase.from('bids').delete().eq('id', bid.id)
            setPendingBids(prev => prev.filter(b => b.id !== bid.id))
          },
        },
      ]
    )
  }

  function onRefresh() { setRefreshing(true); fetchData() }

  // ─── Derived stats ────────────────────────────────────────────────
  const activePosted     = postedJobs.filter(j => ['open', 'accepted', 'in_progress'].includes(j.status))
  const inProgressPosted = postedJobs.filter(j => j.status === 'in_progress' || j.status === 'accepted')
  const completedPosted  = postedJobs.filter(j => j.status === 'completed')
  const activeBids       = myBids.filter(b => b.status === 'pending')

  if (loading) {
    return (
      <View style={styles.screen}>
        <View style={styles.header}>
          <Text style={styles.greeting}>Loading…</Text>
        </View>
      </View>
    )
  }

  // ─── Shared sub-components ────────────────────────────────────────
  function StatCard({ label, target, accent, selected, onPress }) {
    const active = accent || selected
    const content = (
      <>
        <CountUpText target={target} style={[styles.statNum, active && styles.statNumAccent]} />
        <Text style={[styles.statLabel, active && styles.statLabelAccent]}>{label}</Text>
      </>
    )
    const cardStyle = [styles.statCard, active && styles.statCardAccent]

    if (onPress) {
      return (
        <TouchableOpacity
          style={cardStyle}
          onPress={onPress}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel={`${label}, ${target}`}
          accessibilityState={{ selected }}>
          {content}
        </TouchableOpacity>
      )
    }

    return <View style={cardStyle}>{content}</View>
  }

  function QuickBtn({ emoji, label, onPress, outline, flex }) {
    return (
      <TouchableOpacity
        style={[styles.quickBtn, outline && styles.quickBtnOutline, flex && { flex: 1 }]}
        onPress={onPress}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={label}>
        <Text style={styles.quickBtnEmoji}>{emoji}</Text>
        <Text style={[styles.quickBtnText, outline && styles.quickBtnTextOutline]}>{label}</Text>
      </TouchableOpacity>
    )
  }

  function SectionHeader({ title, onViewAll }) {
    return (
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {onViewAll && (
          <TouchableOpacity onPress={onViewAll} accessibilityRole="button" accessibilityLabel="View all">
            <Text style={styles.viewAllText}>View all</Text>
          </TouchableOpacity>
        )}
      </View>
    )
  }

  const refreshControl = (
    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
  )

  // ─────────────────────────────────────────────────────────────────
  //  REQUESTER MODE
  // ─────────────────────────────────────────────────────────────────
  if (primaryRole === 'requester') {
    const requesterTabs = [
      { key: 'active', label: 'Active', target: activePosted.length, jobs: activePosted },
      { key: 'bids', label: 'New bids', target: newBidsTotal, jobs: postedJobs.filter(j => j.status === 'open' && (j.bidCount || 0) > 0) },
      { key: 'inprogress', label: 'In progress', target: inProgressPosted.length, jobs: inProgressPosted },
    ]
    const selectedRequesterTab = requesterTabs.find(tab => tab.key === requesterTab) || requesterTabs[0]
    const displayJobs = selectedRequesterTab.jobs.slice(0, 5)
    const requesterEmpty = {
      active: { icon: 'Tasks', title: 'No active tasks', body: 'Post your first task to get started' },
      bids: { icon: 'Bids', title: 'No new bids', body: 'Tasks with new provider bids will appear here' },
      inprogress: { icon: 'Work', title: 'Nothing in progress', body: 'Accepted jobs will appear here until they are completed' },
    }[selectedRequesterTab.key]

    return (
      <View style={styles.screen}>
        <View style={styles.header}>
          <View style={styles.headerTopRow}>
            <View>
              <Text style={styles.greeting}>{getGreeting()}, {fullName || 'there'} 👋</Text>
              <Text style={styles.headerSub}>Here's your task overview</Text>
            </View>
            <TouchableOpacity
              style={styles.profileBtn}
              onPress={() => navigation.navigate('Profile')}
              accessibilityRole="button"
              accessibilityLabel="Go to profile">
              <Text style={styles.profileBtnText}>👤</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.statsRow}>
            {requesterTabs.map(tab => (
              <StatCard
                key={tab.key}
                label={tab.label}
                target={tab.target}
                selected={requesterTab === tab.key}
                onPress={() => setRequesterTab(tab.key)}
              />
            ))}
          </View>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          refreshControl={refreshControl}
          showsVerticalScrollIndicator={false}>

          <QuickBtn emoji="➕" label="Post a task" onPress={() => navigation.navigate('PostJob')} />

          <SectionHeader
            title={selectedRequesterTab.label}
            onViewAll={selectedRequesterTab.jobs.length > 5 ? () => navigation.navigate('MyJobs') : null}
          />

          {displayJobs.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>📋</Text>
              <Text style={styles.emptyTitle}>{requesterEmpty.title}</Text>
              <Text style={styles.emptyBody}>{requesterEmpty.body}</Text>
            </View>
          ) : (
            displayJobs.map(job => (
              <JobCard
                key={job.id}
                job={job}
                bidCount={job.bidCount || 0}
                onPress={() => navigation.navigate('ManageTask', { job, bidCount: job.bidCount || 0 })}
              />
            ))
          )}

          {activeBids.length > 0 && (
            <>
              <SectionHeader title="Jobs I'm doing" onViewAll={() => navigation.navigate('MyJobs')} />
              {activeBids.slice(0, 3).map(bid => (
                <JobCard
                  key={bid.id}
                  job={bid.jobs}
                  bidCount={0}
                  onPress={() => navigation.navigate('JobDetail', { job: bid.jobs })}
                />
              ))}
            </>
          )}

          {completedPosted.length > 0 && (
            <TouchableOpacity
              style={styles.secondaryLink}
              onPress={() => navigation.navigate('MyJobs', { filter: 'completed' })}
              accessibilityRole="button"
              accessibilityLabel={`View ${completedPosted.length} completed tasks`}>
              <Text style={styles.secondaryLinkText}>View completed tasks ({completedPosted.length})</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={styles.secondaryLink}
            onPress={() => navigation.navigate('JobFeed')}
            accessibilityRole="button"
            accessibilityLabel="Browse available jobs">
            <Text style={styles.secondaryLinkText}>🔍  Browse available jobs</Text>
          </TouchableOpacity>

        </ScrollView>
      </View>
    )
  }

  // ─────────────────────────────────────────────────────────────────
  //  PROVIDER MODE
  // ─────────────────────────────────────────────────────────────────
  if (primaryRole === 'provider') {
    const pendingBidsCount = pendingBids.length
    const activeJobsCount  = inProgressBids.length + acceptedBidsNotStarted.length

    const TABS = [
      { key: 'bidspending', label: 'Bids pending', count: pendingBidsCount },
      { key: 'activejobs',  label: 'Active jobs',  count: activeJobsCount  },
      { key: 'watchlist',   label: 'Watchlist',    count: watchlistItems.length },
    ]

    let panelTitle = ''
    let panelContent = null

    if (providerTab === 'bidspending') {
      panelTitle = 'Your bids'
      panelContent = pendingBids.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>🎯</Text>
          <Text style={styles.emptyTitle}>No pending bids</Text>
          <Text style={styles.emptyBody}>Browse available jobs and submit your first bid</Text>
        </View>
      ) : (
        pendingBids.map(bid => (
          <BidPendingCard
            key={bid.id}
            bid={bid}
            onWithdraw={handleWithdrawBid}
            navigation={navigation}
          />
        ))
      )
    } else if (providerTab === 'activejobs') {
      panelTitle = 'Active jobs'
      const hasJobs = inProgressBids.length > 0 || acceptedBidsNotStarted.length > 0
      panelContent = !hasJobs ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>🔧</Text>
          <Text style={styles.emptyTitle}>No active jobs</Text>
          <Text style={styles.emptyBody}>Jobs you've been hired for will appear here</Text>
        </View>
      ) : (
        <>
          {inProgressBids.map(bid => (
            <ActiveJobInProgressCard
              key={bid.id}
              job={bid.job}
              lastMessage={lastMessages[bid.job_id]}
              navigation={navigation}
            />
          ))}
          {acceptedBidsNotStarted.map(bid => (
            <ActiveJobNotStartedCard
              key={bid.id}
              job={bid.job}
              bid={bid}
              navigation={navigation}
            />
          ))}
        </>
      )
    } else {
      panelTitle = 'Watching'
      panelContent = watchlistItems.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>🔖</Text>
          <Text style={styles.emptyTitle}>Nothing in watchlist</Text>
          <Text style={styles.emptyBody}>Bookmark jobs while browsing to track them here</Text>
        </View>
      ) : (
        watchlistItems.map(item => (
          <WatchlistCard
            key={item.watchId}
            watchItem={item}
            onUnwatch={handleUnwatch}
            navigation={navigation}
          />
        ))
      )
    }

    return (
      <View style={styles.screen}>
        <View style={styles.header}>
          <View style={styles.headerTopRow}>
            <View>
              <Text style={styles.greeting}>{getGreeting()}, {fullName || 'there'} 👋</Text>
              <Text style={styles.headerSub}>Manage your work</Text>
            </View>
            <TouchableOpacity
              style={styles.profileBtn}
              onPress={() => navigation.navigate('Profile')}
              accessibilityRole="button"
              accessibilityLabel="Go to profile">
              <Text style={styles.profileBtnText}>👤</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.statsRow}>
            {TABS.map(tab => (
              <TouchableOpacity
                key={tab.key}
                style={[styles.statCard, providerTab === tab.key && styles.statCardAccent]}
                onPress={() => setProviderTab(tab.key)}
                activeOpacity={0.75}
                accessibilityRole="button"
                accessibilityLabel={`${tab.label}, ${tab.count} items`}
                accessibilityState={{ selected: providerTab === tab.key }}>
                <Text style={[styles.statNum, providerTab === tab.key && styles.statNumAccent]}>
                  {tab.count}
                </Text>
                <Text style={[styles.statLabel, providerTab === tab.key && styles.statLabelAccent]}>
                  {tab.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          refreshControl={refreshControl}
          showsVerticalScrollIndicator={false}>

          <SectionHeader title={panelTitle} />
          {panelContent}

          {providerTab === 'activejobs' && completedProviderBids.length > 0 && (
            <>
              <SectionHeader title="Completed jobs" />
              {completedProviderBids.map(bid => (
                <CompletedProviderJobCard
                  key={bid.id}
                  job={bid.job}
                  bid={bid}
                  navigation={navigation}
                />
              ))}
            </>
          )}

          <View style={styles.providerActionRow}>
            <QuickBtn
              emoji="🔍"
              label="Find more jobs"
              flex
              onPress={() => navigation.navigate('JobFeed')}
            />
          </View>

          <QuickBtn
            emoji="➕"
            label="Post a task"
            outline
            onPress={() => navigation.navigate('PostJob')}
          />

        </ScrollView>
      </View>
    )
  }

  // ─────────────────────────────────────────────────────────────────
  //  BOTH MODE
  // ─────────────────────────────────────────────────────────────────
  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          <View>
            <Text style={styles.greeting}>{getGreeting()}, {fullName || 'there'} 👋</Text>
            <Text style={styles.headerSub}>Your activity overview</Text>
          </View>
          <TouchableOpacity
            style={styles.profileBtn}
            onPress={() => navigation.navigate('Profile')}
            accessibilityRole="button"
            accessibilityLabel="Go to profile">
            <Text style={styles.profileBtnText}>👤</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.statsRow}>
          <StatCard label="Posted" target={activePosted.length} />
          <StatCard label="New bids" target={newBidsTotal} accent />
          <StatCard label="Doing" target={activeBids.length} />
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={refreshControl}
        showsVerticalScrollIndicator={false}>

        <View style={styles.dualBtnRow}>
          <QuickBtn emoji="➕" label="Post a task" flex onPress={() => navigation.navigate('PostJob')} />
          <View style={{ width: 12 }} />
          <QuickBtn emoji="🔍" label="Find jobs" outline flex onPress={() => navigation.navigate('JobFeed')} />
        </View>

        <SectionHeader
          title="My posted tasks"
          onViewAll={activePosted.length > 3 ? () => navigation.navigate('MyJobs') : null}
        />

        {activePosted.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyBody}>No active tasks posted yet</Text>
          </View>
        ) : (
          activePosted.slice(0, 3).map(job => (
            <JobCard
              key={job.id}
              job={job}
              bidCount={job.bidCount || 0}
              onPress={() => navigation.navigate('ManageTask', { job, bidCount: job.bidCount || 0 })}
            />
          ))
        )}

        <View style={styles.divider} />

        <SectionHeader
          title="Jobs I'm doing"
          onViewAll={myBids.length > 3 ? () => navigation.navigate('MyJobs') : null}
        />

        {activeBids.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyBody}>No active bids placed yet</Text>
          </View>
        ) : (
          activeBids.slice(0, 3).map(bid => (
            <JobCard
              key={bid.id}
              job={bid.jobs}
              bidCount={0}
              onPress={() => navigation.navigate('JobDetail', { job: bid.jobs })}
            />
          ))
        )}

      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },

  // ─── Header ──────────────────────────────────────────────────────
  header: {
    backgroundColor: colors.primary,
    paddingTop: 56,
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  headerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  greeting: { fontSize: 20, fontWeight: 'bold', color: colors.white },
  headerSub: { fontSize: 13, color: 'rgba(255,255,255,0.75)', marginTop: 2 },
  profileBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileBtnText: { fontSize: 18 },

  // ─── Stats / tabs ─────────────────────────────────────────────────
  statsRow: { flexDirection: 'row', gap: 10 },
  statCard: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  statCardAccent: { backgroundColor: colors.white },
  statNum: { fontSize: 26, fontWeight: 'bold', color: colors.white },
  statNumAccent: { color: colors.primary },
  statLabel: { fontSize: 11, color: 'rgba(255,255,255,0.8)', marginTop: 2, fontWeight: '600' },
  statLabelAccent: { color: colors.textMuted },

  // ─── Scroll ───────────────────────────────────────────────────────
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 48 },

  // ─── Quick action buttons ─────────────────────────────────────────
  quickBtn: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 16,
    minHeight: 52,
  },
  quickBtnOutline: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  quickBtnEmoji: { fontSize: 18 },
  quickBtnText: { fontSize: 15, fontWeight: '700', color: colors.white },
  quickBtnTextOutline: { color: colors.primary },
  dualBtnRow: { flexDirection: 'row', marginBottom: 20 },
  providerActionRow: { marginTop: 8 },

  // ─── Section header ───────────────────────────────────────────────
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  viewAllText: { fontSize: 13, color: colors.primary, fontWeight: '600' },

  // ─── Empty state ──────────────────────────────────────────────────
  emptyState: { alignItems: 'center', paddingVertical: 32, marginBottom: 8 },
  emptyIcon: { fontSize: 36, marginBottom: 10 },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: colors.textSecondary, marginBottom: 4 },
  emptyBody: { fontSize: 13, color: colors.textMuted, textAlign: 'center', lineHeight: 20 },

  // ─── Divider ──────────────────────────────────────────────────────
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 20 },

  // ─── Secondary link ───────────────────────────────────────────────
  secondaryLink: { alignItems: 'center', paddingVertical: 16, marginTop: 4 },
  secondaryLinkText: { fontSize: 14, color: colors.primary, fontWeight: '600' },

  // ─── Provider cards ───────────────────────────────────────────────
  pCard: {
    backgroundColor: colors.white,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  pCardAccepted:    { borderLeftWidth: 4, borderLeftColor: colors.primary },
  pCardUnavailable: { opacity: 0.6 },
  pCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
    gap: 10,
  },
  pCardTitle: { flex: 1, fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  pTextMuted: { color: colors.textMuted },
  pMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  pMeta: { fontSize: 12, color: colors.textMuted },

  // Provider badges
  pBadgeBlue:      { backgroundColor: colors.infoLight,    borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, flexShrink: 0 },
  pBadgeBlueText:  { fontSize: 11, fontWeight: '700', color: colors.info },
  pBadgeGreen:     { backgroundColor: colors.primaryLight,  borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, flexShrink: 0 },
  pBadgeGreenText: { fontSize: 11, fontWeight: '700', color: colors.primary },
  pBadgeGray:      { backgroundColor: '#efefef',            borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, flexShrink: 0 },
  pBadgeGrayText:  { fontSize: 11, fontWeight: '700', color: colors.textMuted },
  pBadgeAmber:     { backgroundColor: colors.warningLight,  borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, flexShrink: 0 },
  pBadgeAmberText: { fontSize: 11, fontWeight: '700', color: colors.warning },

  // Provider info boxes
  pChatPreview:     { backgroundColor: colors.infoLight,   borderRadius: 8, padding: 10, marginBottom: 12 },
  pChatPreviewText: { fontSize: 13, color: colors.info,    lineHeight: 18 },
  pInfoBox:         { backgroundColor: colors.primaryLight, borderRadius: 8, padding: 10, marginBottom: 12 },
  pInfoBoxText:     { fontSize: 13, color: colors.primary,  lineHeight: 18 },
  pInfoBoxAmber:     { backgroundColor: colors.warningLight, borderRadius: 8, padding: 10, marginBottom: 12 },
  pInfoBoxAmberText: { fontSize: 13, color: colors.warning,  lineHeight: 18 },

  // Provider action buttons
  pBtnRow: { flexDirection: 'row', gap: 10, marginTop: 2 },
  pBtnPrimary: {
    flex: 1,
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  pBtnPrimaryText: { fontSize: 13, fontWeight: '700', color: colors.white },
  pBtnSecondary: {
    flex: 1,
    backgroundColor: colors.infoLight,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  pBtnSecondaryText: { fontSize: 13, fontWeight: '700', color: colors.info },
  pBtnUnwatch: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: '#7c3aed',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  pBtnUnwatchText: { fontSize: 13, fontWeight: '700', color: '#7c3aed' },
  pBtnWithdraw: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: colors.danger,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  pBtnWithdrawText: { fontSize: 13, fontWeight: '700', color: colors.danger },
})
