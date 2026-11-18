import {notificationBody} from '../../../shared/notificationBody'
import {notificationSide, sideTag} from '../../../shared/marketSide'
import {rankOnTheGo} from '../../../shared/onTheGo'
import DevelopmentBadge from '../../components/DevelopmentBadge'
import React, { useCallback, useRef, useState } from 'react'
import {
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
import Icon from '../../components/Icon'
import {
  NOTIFICATION_ICONS,
  fetchNotifications,
  notificationTimeAgo,
  openNotificationTarget,
} from '../../lib/notifications'
import EmptyState from '../../components/EmptyState'
import Loading from '../../components/Loading'
import AsyncStorage from '@react-native-async-storage/async-storage'
import {HOME_MODES,homeMode,homeModeKey,homeRole} from '../../../shared/homeMode'
import {loadPropertyNetwork,propertyAreas,propertySpokes} from '../../../shared/propertyNetwork'
import { onBadgeRefresh } from '../../lib/badgeEvents'
import { fetchInvitedJobsForProvider } from '../../lib/invites'
import { fetchSeasonalReminders, recordSeasonalEvent } from '../../lib/seasonalReminders'
import SeasonalReminderCard from '../../components/SeasonalReminderCard'
import { fetchActiveNextMoves } from '../../lib/nextMove'

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
  const [mode,setMode]=useState('property')
  const [network,setNetwork]=useState(null)
  const preferenceOwner=useRef(null)
  const preferenceRevision=useRef(0)
  function chooseMode(value){
    preferenceRevision.current++
    setMode(value)
    if(userId)void AsyncStorage.setItem(homeModeKey(userId),value).catch(()=>{})
  }
  const [notifications, setNotifications] = useState([])
  const [invitedJobs, setInvitedJobs]   = useState([])
  const [seasonalReminders, setSeasonalReminders] = useState([])
  const [seasonalExpanded, setSeasonalExpanded] = useState(false)
  // Everything in flight with a next move; "Needs attention" is the subset
  // that needs your action, "On the go" ranks them all.
  const [activeMoves, setActiveMoves]     = useState([])
  const [loading, setLoading]           = useState(true)
  const [loadError,setLoadError]=useState(false)
  const [refreshing, setRefreshing]     = useState(false)

  useFocusEffect(useCallback(() => { load() }, []))
  useFocusEffect(useCallback(() => {
    let active = true
    const unsubscribe = onBadgeRefresh(() => {
      fetchNotifications(8).then(rows => { if (active) setNotifications(rows) }).catch(() => {})
    })
    return () => { active = false; unsubscribe() }
  }, []))

  async function load() {
    setLoadError(false)
    try{
    const { data: { user } } = await supabase.auth.getUser()
    if (!user)return
    setUserId(user.id)
    if(preferenceOwner.current!==user.id){
      preferenceOwner.current=user.id
      const revision=++preferenceRevision.current
      setMode('property')
      void AsyncStorage.getItem(homeModeKey(user.id)).then(value=>{
        if(preferenceRevision.current===revision)setMode(homeMode(value))
      }).catch(()=>{})
    }

    const [notifs, invited, reminders, active, propertyNetwork] = await Promise.all([
      fetchNotifications(8),
      fetchInvitedJobsForProvider(user.id),
      fetchSeasonalReminders(),
      fetchActiveNextMoves(user.id,true),
      loadPropertyNetwork(supabase,user.id).catch(()=>null),
    ])
    setNotifications(notifs)
    setInvitedJobs(invited)
    setSeasonalReminders(reminders)
    setActiveMoves(active)
    setNetwork(propertyNetwork)
    reminders.forEach(reminder => recordSeasonalEvent(reminder.id, 'impression'))
    }catch{setLoadError(true)}
    finally{setLoading(false);setRefreshing(false)}
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
      navigation.getParent()?.navigate('Browse', { screen: 'BrowseMain' })
    } else if (campaign.primary_action === 'manage_profile') {
      navigation.getParent()?.navigate('Account', { screen: 'Profile' })
    }
  }

  const propertyMode=mode==='property'
  const workItems=activeMoves.filter(item=>item.viewerRole==='provider')
  const pendingOffers=workItems.filter(item=>item.entityType==='job'&&item.item.status==='open').length
  const upcoming=workItems.filter(item=>item.nextMove.tone==='scheduled').length
  const invitationCount=invitedJobs.filter(invite=>invite.status==='pending'||invite.status==='seen').length
  const modeItems=activeMoves.filter(item=>item.viewerRole===homeRole(mode))
  const areas=network?propertyAreas(network).filter(area=>area.active):[]
  const preview=areas.slice(0,6)
  const spokes=propertySpokes(preview.length)
  const linked=areas.filter(area=>area.linkedCount).length
  const gaps=areas.filter(area=>area.needsHelp).length
  const unread=notifications.filter(n=>!n.read)
  const nextMoves=modeItems.filter(item=>item.nextMove.needsAction)
  const onTheGo=rankOnTheGo(modeItems.map(item=>({...item,needsAction:item.nextMove.needsAction})))
  const nextMoveKeys = new Set(nextMoves.map(item => `${item.entityType}:${item.entityId}`))
  const remainingNotifications = unread.filter(notification => {
    // An outstanding booking/job action does not replace a new chat message.
    if (notification.type === 'new_message') return true
    const metadata = notification.metadata || {}
    const key = metadata.booking_id
      ? `booking:${metadata.booking_id}`
      : metadata.job_id
        ? `job:${metadata.job_id}`
        : null
    return !key || !nextMoveKeys.has(key)
  })
  const attention = [
    ...nextMoves.map(item => ({ ...item, _kind: 'nextMove' })),
    ...remainingNotifications.map(item => ({ ...item, _kind: 'notification' })),
  ].slice(0, 5)
  function openAttentionItem(item) {
    if (item._kind === 'notification') {
      openNotificationTarget(navigation, userId, item)
      return
    }
    if (item.entityType === 'job') {
      if (item.viewerRole === 'provider') navigation.navigate('JobDetail', { job: item.item })
      else navigation.navigate('ManageTask', { job: item.item, bidCount: item.item.bidCount || 0 })
      return
    }
    navigation.navigate('ServiceBookingDetail', {
      booking: item.item,
      viewerRole: item.viewerRole,
    })
  }

  if (loading) {
    return (
      <View style={styles.screen}>
        <View style={[styles.header, { paddingTop: insets.top + 18 }]}>
          <Text style={styles.kicker}>Rural Connections</Text>
          <Text style={styles.title} accessibilityRole="header">Home</Text>
        </View>
        <Loading label="Loading home…" />
      </View>
    )
  }

  return (
    <View style={styles.screen}>
      {/* Fixed header — stays put while content scrolls (matches the other tabs) */}
      <View style={[styles.header, { paddingTop: insets.top + 18 }]}>
        <View style={{ flex: 1 }}>
          <Text style={styles.kicker}>Rural Connections <DevelopmentBadge/></Text>
          <View style={styles.modeSwitch} accessibilityRole="radiogroup" accessibilityLabel="Home mode">
            {HOME_MODES.map(item=><TouchableOpacity key={item.id} style={[styles.modeButton,mode===item.id&&styles.modeSelected]}
              accessibilityRole="radio" accessibilityState={{checked:mode===item.id}} onPress={()=>chooseMode(item.id)}>
              <Text style={[styles.modeLabel,mode===item.id&&styles.modeLabelSelected]}>{item.label}</Text>
            </TouchableOpacity>)}
          </View>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: insets.bottom + 88 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        showsVerticalScrollIndicator={false}>

        <Text style={styles.title} accessibilityRole="header">{HOME_MODES.find(item=>item.id===mode).heading}</Text>
        {loadError&&<Text style={styles.subtitle} accessibilityRole="alert">Some activity could not be loaded. Pull down to try again.</Text>}
        {propertyMode ? <>
          <Text style={styles.subtitle}>Find local help and manage the people supporting your property.</Text>
          <TouchableOpacity style={styles.networkPreview} onPress={()=>navigation.navigate('PropertyNetwork')}
            accessibilityRole="button" accessibilityLabel="Open My Property Network">
            <View style={styles.networkArt} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              {preview.map((area,index)=><View key={area.id} style={[styles.miniNode,area.needsHelp&&styles.miniGap,
                {left:spokes[index].x+'%',top:spokes[index].y+'%'}]}>
                <Icon name={area.icon} size={13} color={colors.primaryDark}/>
              </View>)}
              <View style={styles.miniCentre}><Icon name="home-outline" size={19} color={colors.white}/></View>
            </View>
            <View style={{flex:1}}><Text style={styles.sectionTitle}>My Property Network</Text>
              <Text style={styles.subtitle}>{linked||gaps?linked+' areas with providers · '+gaps+' areas need help':
                network?'Set up support areas and keep your local people together.':'Open your network to view support areas and providers.'}</Text>
              <Text style={[styles.sectionLink,{marginTop:8}]}>Open My Property Network</Text>
            </View>
          </TouchableOpacity>
          <View style={styles.actionsGrid}>
            <PrimaryAction title="Post a job" subtitle="Get help with something that needs doing."
              onPress={()=>navigation.getParent()?.navigate('Jobs',{screen:'PostJob',params:{origin:'Home'}})}/>
            <PrimaryAction title="Find local help" subtitle="Browse local providers and services." variant="secondary"
              onPress={()=>navigation.getParent()?.navigate('Browse',{screen:'BrowseMain'})}/>
          </View>
        </> : <>
          <View style={styles.workSummary}>
            {[[workItems.length-pendingOffers,'Active work'],[pendingOffers,'Offers awaiting replies'],[upcoming,'Upcoming confirmed'],[invitationCount,'Invitations to review']].map(([count,label],index)=>
              <TouchableOpacity key={label} style={styles.workMetric} accessibilityRole="button" accessibilityLabel={count+' '+label}
                onPress={()=>index===3?navigation.navigate('InvitedJobs'):navigation.getParent()?.navigate('Activity')}>
                <Text style={styles.metricNumber}>{count}</Text><Text style={styles.metricLabel}>{label}</Text>
              </TouchableOpacity>)}
          </View>
          <View style={styles.actionsGrid}>
            <PrimaryAction title="Find work" subtitle="Browse available jobs."
              onPress={()=>navigation.getParent()?.navigate('Jobs',{screen:'JobsBoard'})}/>
            <PrimaryAction title="Create a listing" subtitle="Advertise a service." variant="secondary"
              onPress={()=>navigation.navigate('CreateService',{newListing:Date.now()})}/>
          </View>
          <TouchableOpacity style={styles.connCard} accessibilityRole="button" onPress={()=>navigation.navigate('Connections',{side:'customers'})}>
            <Icon name="people-outline" size={22} color={colors.primary}/><Text style={styles.connCardTitle}>My Customers</Text>
            <Icon name="chevron-forward" size={17} color={colors.textMuted}/>
          </TouchableOpacity>
        </>}

        {attention.length > 0 && (
          <>
          {/* Needs attention — unread notifications */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Needs attention</Text>
              <TouchableOpacity
                onPress={() => nextMoves.length > 0
                  ? navigation.getParent()?.navigate('Activity')
                  : navigation.navigate('Notifications')}
                accessibilityRole="button"
                accessibilityLabel={nextMoves.length > 0 ? 'View all activity' : 'All notifications'}>
                <Text style={styles.sectionLink}>
                  {nextMoves.length > 0
                    ? `View activity (${nextMoves.length})`
                    : unread.length > 0
                      ? `All notifications (${unread.length})`
                      : 'All notifications'}
                </Text>
              </TouchableOpacity>
            </View>
            {attention.map((item, i) => {
              const isNextMove = item._kind === 'nextMove'
              const side = isNextMove ? null : notificationSide(item)
              const tag  = side ? sideTag(side, item) : null
              const iconName = isNextMove
                ? item.nextMove.icon
                : NOTIFICATION_ICONS[item.type] || 'notifications-outline'
              return (
                <TouchableOpacity
                  key={item.id}
                  style={[styles.notifRow, i < attention.length - 1 && styles.notifRowBorder]}
                  onPress={() => openAttentionItem(item)}
                  activeOpacity={0.75}
                  accessibilityRole="button"
                  accessibilityLabel={isNextMove ? `${item.nextMove.label}. ${item.nextMove.detail}` : notificationBody(item)}>
                  {side ? (
                    <View style={[styles.notifIconCircle, { backgroundColor: side === 'job' ? colors.jobFill : colors.listingFill }]}>
                      <Icon name={iconName} size={17} color={side === 'job' ? colors.jobIcon : colors.listingIcon} />
                    </View>
                  ) : (
                    <Icon name={iconName} size={20} color={isNextMove ? '#9a6700' : colors.primary} />
                  )}
                  {isNextMove ? (
                    <View style={{ flex: 1 }}>
                      <Text style={styles.nextMoveTitle} numberOfLines={1}>{item.title}</Text>
                      <Text style={styles.nextMoveLabel}>{item.nextMove.label}</Text>
                      <Text style={styles.notifBody} numberOfLines={2}>{item.nextMove.detail}</Text>
                    </View>
                  ) : (
                    <View style={{ flex: 1 }}>
                      {tag && <Text style={[styles.sideTag, { color: side === 'job' ? colors.jobInk : colors.listingInk }]}>{tag}</Text>}
                      <Text style={styles.notifBody} numberOfLines={2}>{notificationBody(item)}</Text>
                      <Text style={styles.notifTime}>{notificationTimeAgo(item.created_at)}</Text>
                    </View>
                  )}
                  <View style={styles.notifDot} />
                </TouchableOpacity>
              )
            })}
          </View>
          </>
        )}

        {/* On the go — what's in flight, by name, with whose turn it is (replaces the count tiles) */}
        {onTheGo.total > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>On the go</Text>
              <TouchableOpacity
                onPress={() => navigation.getParent()?.navigate('Activity')}
                accessibilityRole="button"
                accessibilityLabel={`View all ${onTheGo.total} in Activity`}>
                <Text style={styles.sectionLink}>View all ›</Text>
              </TouchableOpacity>
            </View>
            {onTheGo.shown.map((item, i) => {
              const side = item.entityType === 'job' ? 'job' : 'listing'
              const mine = item.viewerRole === (side === 'job' ? 'requester' : 'provider')
              const urgent = item.nextMove.badgeTone === 'attention'
              return (
                <TouchableOpacity
                  key={item.id}
                  style={[styles.notifRow, i < onTheGo.shown.length - 1 && styles.notifRowBorder]}
                  onPress={() => openAttentionItem({ ...item, _kind: 'nextMove' })}
                  activeOpacity={0.75}
                  accessibilityRole="button"
                  accessibilityLabel={`${item.title}. ${item.nextMove.badge}`}>
                  <View style={[styles.notifIconCircle, { backgroundColor: side === 'job' ? colors.jobFill : colors.listingFill }]}>
                    <Icon name={side === 'job' ? 'briefcase-outline' : 'pricetag-outline'} size={17} color={side === 'job' ? colors.jobIcon : colors.listingIcon} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.sideTag, { color: side === 'job' ? colors.jobInk : colors.listingInk }]}>
                      {(mine ? 'YOUR ' : '') + (side === 'job' ? 'JOB' : 'LISTING')}
                    </Text>
                    <Text style={styles.nextMoveTitle} numberOfLines={1}>{item.title}</Text>
                  </View>
                  <View style={[styles.turnBadge, urgent && styles.turnBadgeUrgent]}>
                    <Text style={[styles.turnBadgeText, urgent && styles.turnBadgeTextUrgent]} numberOfLines={1}>
                      {item.nextMove.badgeShort || item.nextMove.badge}
                    </Text>
                  </View>
                </TouchableOpacity>
              )
            })}
            {onTheGo.more > 0 && (
              <Text style={styles.onTheGoMore}>+{onTheGo.more} more in Activity</Text>
            )}
          </View>
        )}

        {!loadError&&attention.length===0&&onTheGo.total===0&&<EmptyState compact icon="leaf-outline"
          title="No active work yet" body={propertyMode?'Post a job or find local help to get started.':'Find work or create a listing to get started.'}/>}

        {seasonalReminders.length > 0 && (
          <View style={styles.seasonalSection}>
            <View style={styles.seasonalHeader}>
              <Text style={[styles.activityHeading, { marginBottom: 0 }]}>Useful right now</Text>
              {seasonalReminders.length > 2 && !seasonalExpanded && (
                <TouchableOpacity
                  onPress={() => setSeasonalExpanded(true)}
                  accessibilityRole="button"
                  accessibilityLabel="See all reminders">
                  <Text style={styles.sectionLink}>See all</Text>
                </TouchableOpacity>
              )}
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              snapToInterval={276}
              decelerationRate="fast"
              contentContainerStyle={styles.seasonalRow}>
              {(seasonalExpanded ? seasonalReminders : seasonalReminders.slice(0, 2)).map(campaign => (
                <SeasonalReminderCard
                  key={campaign.id}
                  campaign={campaign}
                  onAction={openSeasonalAction}
                  onDismiss={dismissSeasonalReminder}
                />
              ))}
            </ScrollView>
          </View>
        )}

      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  turnBadge:           { flexShrink: 0, maxWidth: 150, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: '#f5f5f5' },
  turnBadgeUrgent:     { backgroundColor: '#fff3e0' },
  turnBadgeText:       { fontSize: 12, fontWeight: '800', color: '#616161' },
  turnBadgeTextUrgent: { color: '#9a5b00' },
  onTheGoMore:         { fontSize: 12, color: colors.textMuted, marginTop: 8 },
  screen: { flex: 1, backgroundColor: colors.background },

  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingBottom: 14,
    backgroundColor: colors.background,
  },
  kicker:     { fontSize: 12, letterSpacing: 1.5, fontWeight: '700', color: colors.accent, textTransform: 'uppercase', marginBottom: 6 },
  title:      { fontSize: 28, lineHeight: 32, fontWeight: '700', color: colors.textPrimary, flexShrink: 1 },
  subtitle: { fontSize: 14, color: colors.textSecondary, marginTop: 6 },

  actionsGrid: { flexDirection: 'row', gap: 10, marginBottom: 15 },
  actionCard:  { flex: 1, borderRadius: 12, padding: 16, minHeight: 84 },

  modeSwitch:{flexDirection:'row',backgroundColor:colors.primaryLight,padding:4,borderRadius:14,gap:4},
  modeButton:{flex:1,minHeight:44,alignItems:'center',justifyContent:'center',borderRadius:10},
  modeSelected:{backgroundColor:colors.primaryDark},
  modeLabel:{color:colors.primaryDark,fontWeight:'700'},
  modeLabelSelected:{color:colors.white},
  networkPreview:{flexDirection:'row',alignItems:'center',gap:14,padding:14,backgroundColor:colors.primaryLight,borderRadius:16,marginVertical:16},
  networkArt:{width:96,height:106,position:'relative'},
  miniNode:{position:'absolute',width:23,height:23,marginLeft:-11.5,marginTop:-11.5,borderRadius:12,backgroundColor:colors.white,alignItems:'center',justifyContent:'center'},
  miniGap:{backgroundColor:colors.warningLight},
  miniCentre:{position:'absolute',left:'50%',top:'50%',marginLeft:-15,marginTop:-15,width:30,height:30,borderRadius:15,backgroundColor:colors.primaryDark,alignItems:'center',justifyContent:'center'},
  workSummary:{flexDirection:'row',flexWrap:'wrap',marginVertical:14,backgroundColor:colors.primaryLight,borderRadius:14},
  workMetric:{width:'50%',padding:12,minHeight:55},
  metricNumber:{fontSize:19,fontWeight:'800',color:colors.primaryDark},
  metricLabel:{fontSize:13,color:colors.textPrimary},
  primaryAction:   { backgroundColor: colors.primary },
  secondaryAction: { backgroundColor: colors.white },
  actionTitle:    { fontSize: 17, fontWeight: '700', marginBottom: 4 },
  actionSubtitle: { fontSize: 12, lineHeight: 17 },
  primaryActionText:   { color: colors.white },
  primaryActionSub:    { color: 'rgba(255,255,255,0.85)' },
  secondaryActionText: { color: colors.textPrimary },
  secondaryActionSub:  { color: colors.textSecondary },

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
  notifIconCircle: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  sideTag: { fontSize: 10, fontWeight: '800', letterSpacing: 0.6, marginBottom: 2 },
  nextMoveTitle: { fontSize: 12, fontWeight: '600', color: colors.textSecondary },
  nextMoveLabel: { fontSize: 14, lineHeight: 19, fontWeight: '800', color: '#8a5d00', marginTop: 1 },
  notifBody: { fontSize: 14, color: colors.textPrimary, lineHeight: 20 },
  notifTime: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  notifDot:  { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary, marginTop: 6 },

  seasonalSection: { marginTop: 1 },
  seasonalHeader:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  seasonalRow:     { gap: 12, paddingRight: 20 },
  activityHeading: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
})
