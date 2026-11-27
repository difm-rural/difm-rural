import {rankOnTheGo} from '../../../shared/onTheGo'
import DevelopmentBadge from '../../components/DevelopmentBadge'
import React, { useCallback, useRef, useState } from 'react'
import {
  Alert,
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
import {fetchNotificationInbox} from '../../lib/notifications'
import Loading from '../../components/Loading'
import AsyncStorage from '@react-native-async-storage/async-storage'
import {HOME_MODES,homeMode,homeModeKey,homeRole} from '../../../shared/homeMode'
import {homeCustomerCount,homeAttentionSummary} from '../../../shared/homeSummary'
import {loadPropertyNetwork,propertyNetworkPeopleCount} from '../../../shared/propertyNetwork'
import {loadPropertyJobs,propertyPostParams} from '../../../shared/propertyNetworkJobs'
import {attentionGroup,attentionLine,goLine,propertyNetworkRow,rankAttention,rankRecent,unpostedNeeds} from '../../../shared/homeCompact'
import { onBadgeRefresh } from '../../lib/badgeEvents'
import { fetchInvitedJobsForProvider } from '../../lib/invites'
import { fetchSeasonalReminders, recordSeasonalEvent } from '../../lib/seasonalReminders'
import SeasonalReminderCard from '../../components/SeasonalReminderCard'
import { fetchActiveNextMoves } from '../../lib/nextMove'
import { dismissReviewPrompt } from '../../../shared/reviewPrompts'

function PrimaryAction({ title, subtitle, onPress, variant = 'primary' }) {
  const isPrimary = variant === 'primary'
  return (
    <TouchableOpacity
      style={[styles.actionCard, !subtitle && styles.actionCardCompact, isPrimary ? styles.primaryAction : styles.secondaryAction]}
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={title}>
      <Text style={[styles.actionTitle, isPrimary ? styles.primaryActionText : styles.secondaryActionText]}>
        {title}
      </Text>
      {!!subtitle && <Text style={[styles.actionSubtitle, isPrimary ? styles.primaryActionSub : styles.secondaryActionSub]}>
        {subtitle}
      </Text>}
    </TouchableOpacity>
  )
}

export default function HomeTabScreen({ navigation }) {
  const insets = useSafeAreaInsets()
  const [userId, setUserId]             = useState(null)
  const [mode,setMode]=useState('property')
  const [network,setNetwork]=useState(null)
  const [propertyJobs,setPropertyJobs]=useState(null)
  const preferenceOwner=useRef(null)
  const preferenceRevision=useRef(0)
  const loadRevision=useRef(0)
  function chooseMode(value){
    preferenceRevision.current++
    setMode(value)
    if(userId)void AsyncStorage.setItem(homeModeKey(userId),value).catch(()=>{})
  }
  const [unreadCount, setUnreadCount] = useState(null)
  const [invitedJobs, setInvitedJobs]   = useState(null)
  const [customerCount,setCustomerCount]=useState(null)
  const [seasonalReminders, setSeasonalReminders] = useState([])
  const [seasonalExpanded, setSeasonalExpanded] = useState(false)
  // Everything in flight with a next move; "Needs attention" is the subset
  // that needs your action, "On the go" ranks them all.
  const [activeMoves, setActiveMoves]     = useState(null)
  const [loading, setLoading]           = useState(true)
  const [loadError,setLoadError]=useState(false)
  const [refreshing, setRefreshing]     = useState(false)

  useFocusEffect(useCallback(() => { load() }, []))
  useFocusEffect(useCallback(() => {
    let active = true
    const unsubscribe = onBadgeRefresh(() => {
      if (active) load()
    })
    return () => { active = false; unsubscribe() }
  }, []))

  async function load() {
    const revision=++loadRevision.current
    setLoadError(false)
    try{
    const { data: { user } } = await supabase.auth.getUser()
    if (revision!==loadRevision.current)return
    if (!user){setActiveMoves(null);setUnreadCount(null);return}
    setUserId(user.id)
    if(preferenceOwner.current!==user.id){
      preferenceOwner.current=user.id
      const revision=++preferenceRevision.current
      setMode('property')
      void AsyncStorage.getItem(homeModeKey(user.id)).then(value=>{
        if(preferenceRevision.current===revision)setMode(homeMode(value))
      }).catch(()=>{})
    }

    const [notifs, invited, reminders, active, propertyNetwork, customers, ownJobs] = await Promise.all([
      fetchNotificationInbox({limit:0}).catch(()=>null),
      fetchInvitedJobsForProvider(user.id,{strict:true}).catch(()=>null),
      fetchSeasonalReminders(),
      fetchActiveNextMoves(user.id,true,{strict:true}).catch(()=>null),
      loadPropertyNetwork(supabase,user.id).catch(()=>null),
      homeCustomerCount(supabase,user.id),
      loadPropertyJobs(supabase,user.id).catch(()=>null),
    ])
    if (revision!==loadRevision.current)return
    setUnreadCount(notifs?.unreadCount??null)
    setInvitedJobs(invited)
    setSeasonalReminders(reminders)
    setActiveMoves(active)
    setNetwork(propertyNetwork)
    setPropertyJobs(ownJobs)
    setCustomerCount(customers)
    reminders.forEach(reminder => recordSeasonalEvent(reminder.id, 'impression'))
    }catch{if(revision===loadRevision.current)setLoadError(true)}
    finally{if(revision===loadRevision.current){setLoading(false);setRefreshing(false)}}
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
  // The work-stage counts were removed (On the go lists that work by name, and
  // the counts overlapped); invitations keep one line, as Home's only way to them.
  const invitationCount=invitedJobs?.filter(invite=>invite.status==='pending'||invite.status==='seen').length||0
  const modeItems=(activeMoves||[]).filter(item=>item.viewerRole===homeRole(mode))
  // My Property, compact: Needs attention (waiting on you, then needs not posted,
  // then reviews) and On the go, one line each, at most 3 (shared/homeCompact).
  const needs=unpostedNeeds(network,propertyJobs?.jobs,propertyJobs?.links)
  const propertyAttention=rankAttention([
    ...modeItems.filter(item=>item.nextMove.needsAction).map(item=>({...item,kind:'move',group:attentionGroup(item.nextMove),line:attentionLine(item.title,item.nextMove)})),
    ...needs.map(need=>({...need,kind:'need',group:'need',line:need.text})),
  ])
  const propertyGo=rankRecent(modeItems.filter(item=>!item.review&&!item.nextMove.needsAction).map(item=>({...item,
    line:goLine(item.title,item.nextMove,item.arrivalAt||(item.entityType==='booking'?item.item?.scheduled_date:null))})))
  // Items needing action per mode, so the mode Home didn't open on still shows them.
  const modeAttention={
    property:(activeMoves||[]).filter(item=>item.viewerRole==='requester'&&item.nextMove.needsAction).length,
    work:(activeMoves||[]).filter(item=>item.viewerRole==='provider'&&item.nextMove.needsAction).length
      +(invitedJobs?.filter(invite=>invite.status==='pending'||invite.status==='seen').length||0),
  }
  const actionSummary=homeAttentionSummary(loadError||activeMoves===null?null:modeItems.map(item=>({...item,needsAction:item.nextMove.needsAction})),
    propertyMode?0:invitedJobs?.filter(invite=>invite.status==='pending'||invite.status==='seen').length??null,unreadCount,
    propertyMode?{label:'My Work',count:modeAttention.work}:{label:'My Property',count:modeAttention.property})
  const nextMoves=actionSummary.items
  // Review prompts live in Needs attention only; On the go is work still in flight.
  const onTheGo=rankOnTheGo(modeItems.filter(item=>!item.review).map(item=>({...item,needsAction:item.nextMove.needsAction})))
  const attention=nextMoves.slice(0,5)
  // "Not reviewing": hide this review prompt for good (the review itself stays
  // available on the job or booking screen).
  async function dismissReview(item) {
    try {
      await dismissReviewPrompt(supabase, { kind: item.entityType, id: item.entityId, viewerRole: item.viewerRole })
      setActiveMoves(moves => (moves || []).filter(move => move.id !== item.id))
    } catch {
      Alert.alert('Could not dismiss', 'Check your connection and try again.')
    }
  }
  function openAttentionItem(item) {
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
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
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
              <Text style={[styles.modeLabel,mode===item.id&&styles.modeLabelSelected]}>{item.label}{modeAttention[item.id]>0?` (${modeAttention[item.id]})`:''}</Text>
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
        {(loadError||!activeMoves)&&<Text style={styles.subtitle} accessibilityRole="alert">Some activity could not be loaded. Pull down to try again.</Text>}
        {propertyMode ? <>
          <View style={styles.actionsGrid}>
            <PrimaryAction title="Post a job"
              onPress={()=>navigation.getParent()?.navigate('Jobs',{screen:'PostJob',params:{origin:'Home'}})}/>
            <PrimaryAction title="Find local help" variant="secondary"
              onPress={()=>navigation.getParent()?.navigate('Browse',{screen:'BrowseMain'})}/>
          </View>
        </> : <>
          <Text style={styles.workEmpty}>{actionSummary.text}</Text>
          {invitationCount>0&&<TouchableOpacity onPress={()=>navigation.navigate('InvitedJobs')} accessibilityRole="button"
            accessibilityLabel={`${invitationCount} ${invitationCount===1?'invitation':'invitations'} to review`} style={{marginBottom:12}}>
            <Text style={styles.sectionLink}>{invitationCount} {invitationCount===1?'invitation':'invitations'} to review ›</Text>
          </TouchableOpacity>}
          <View style={styles.actionsGrid}>
            <PrimaryAction title="Find work" subtitle="Browse available jobs."
              onPress={()=>navigation.getParent()?.navigate('Jobs',{screen:'JobsBoard'})}/>
            <PrimaryAction title="My listings" subtitle="Manage or create listings" variant="secondary"
              onPress={()=>navigation.navigate('MyServices')}/>
          </View>
          <TouchableOpacity style={styles.connCard} accessibilityRole="button" onPress={()=>navigation.navigate('Connections',{side:'customers'})}>
            <Icon name="people-outline" size={22} color={colors.primary}/>
            <View style={{flex:1}}><Text style={styles.connCardTitle}>My Customers</Text>
              {customerCount>0&&<Text style={styles.subtitle}>{customerCount} previous {customerCount===1?'customer':'customers'}</Text>}
            </View>
            <Icon name="chevron-forward" size={17} color={colors.textMuted}/>
          </TouchableOpacity>
        </>}

        {propertyMode && <>
          {propertyAttention.total > 0 && <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Needs attention</Text>
              {propertyAttention.more > 0 && <TouchableOpacity onPress={()=>navigation.getParent()?.navigate('Activity')} accessibilityRole="button" accessibilityLabel={`See all ${propertyAttention.total} in Activity`}>
                <Text style={styles.sectionLink}>See all</Text></TouchableOpacity>}
            </View>
            {propertyAttention.shown.map((item,i)=><View key={item.kind==='need'?item.key:item.id} style={[styles.compactRow, i<propertyAttention.shown.length-1&&styles.notifRowBorder]}>
              <TouchableOpacity style={{flex:1,minWidth:0}} accessibilityRole="button" accessibilityLabel={item.line}
                onPress={()=>item.kind==='need'?navigation.navigate('PropertyNetwork',{area:item.area.id}):openAttentionItem(item)}>
                <Text style={styles.compactText} numberOfLines={1}>{item.line}</Text>
              </TouchableOpacity>
              {item.kind==='need'&&<TouchableOpacity style={styles.compactAction} accessibilityRole="button" accessibilityLabel={`Post a job for ${item.service.name}`}
                onPress={()=>navigation.getParent()?.navigate('Jobs',{screen:'PostJob',params:propertyPostParams(item.area,item.service,undefined,userId)})}>
                <Text style={styles.compactActionText}>Post it</Text></TouchableOpacity>}
              {item.kind==='move'&&item.review&&<TouchableOpacity style={styles.compactAction} accessibilityRole="button" accessibilityLabel={`Not reviewing ${item.title}`} onPress={()=>dismissReview(item)}>
                <Text style={styles.compactDismissText}>Not reviewing</Text></TouchableOpacity>}
            </View>)}
          </View>}
          {propertyGo.total > 0 && <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>On the go</Text>
              {propertyGo.more > 0 && <TouchableOpacity onPress={()=>navigation.getParent()?.navigate('Jobs',{screen:'JobsBoard'})} accessibilityRole="button" accessibilityLabel={`See all ${propertyGo.total} in Jobs`}>
                <Text style={styles.sectionLink}>See all</Text></TouchableOpacity>}
            </View>
            {propertyGo.shown.map((item,i)=><TouchableOpacity key={item.id} style={[styles.compactRow, i<propertyGo.shown.length-1&&styles.notifRowBorder]}
              accessibilityRole="button" accessibilityLabel={item.line} onPress={()=>openAttentionItem(item)}>
              <Text style={styles.compactText} numberOfLines={1}>{item.line}</Text>
            </TouchableOpacity>)}
          </View>}
        </>}

        {!propertyMode && attention.length > 0 && (
          <>
          {/* Current lifecycle actions; unread history is independent. */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Needs attention ({nextMoves.length})</Text>
              <TouchableOpacity onPress={()=>navigation.getParent()?.navigate('Activity')} accessibilityRole="button" accessibilityLabel="View all activity">
                <Text style={styles.sectionLink}>View activity</Text>
              </TouchableOpacity>
            </View>
            {attention.map((item, i) => {
              return (
                <TouchableOpacity
                  key={`${item.entityType}:${item.entityId}`}
                  style={[styles.notifRow, i < attention.length - 1 && styles.notifRowBorder]}
                  onPress={() => openAttentionItem(item)}
                  activeOpacity={0.75}
                  accessibilityRole="button"
                  accessibilityLabel={`${item.title}. ${item.nextMove.label}. ${item.nextMove.detail}`}>
                  <Icon name={item.nextMove.icon} size={20} color="#9a6700" />
                  <View style={{flex:1,minWidth:0}}>
                    <Text style={styles.nextMoveTitle}>{item.title}</Text>
                    <Text style={styles.nextMoveLabel}>{item.nextMove.label}</Text>
                    <Text style={styles.notifBody}>{item.nextMove.detail}</Text>
                    <Text style={styles.sectionLink}>{item.nextMove.actionLabel || 'View details'} →</Text>
                    {item.review && <TouchableOpacity onPress={() => dismissReview(item)} hitSlop={8}
                      accessibilityRole="button" accessibilityLabel={`Not reviewing ${item.title}`} style={styles.dismissReview}>
                      <Text style={styles.dismissReviewText}>Not reviewing</Text>
                    </TouchableOpacity>}
                  </View>
                  <View style={styles.notifDot} />
                </TouchableOpacity>
              )
            })}
          </View>
          </>
        )}

        {/* On the go — what's in flight, by name, with whose turn it is (replaces the count tiles) */}
        {!propertyMode && onTheGo.total > 0 && (
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
                  key={`${item.entityType}:${item.entityId}`}
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

        {propertyMode&&<>
          {/* Below the day-to-day work: My Property Network isn't the main v0.1 feature.
              Always shown on My Property, as Home's way into My Network (and My People). */}
          <TouchableOpacity style={styles.networkRow} accessibilityRole="button"
            accessibilityLabel={propertyNetworkRow(propertyNetworkPeopleCount(network))} onPress={()=>navigation.navigate('PropertyNetwork')}>
            <Icon name="people-outline" size={20} color={colors.primary}/>
            <Text style={styles.networkRowText} numberOfLines={1}>{propertyNetworkRow(propertyNetworkPeopleCount(network))}</Text>
            <Icon name="chevron-forward" size={18} color={colors.primary}/>
          </TouchableOpacity>
        </>}

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
    paddingBottom: 10,
    backgroundColor: colors.background,
  },
  kicker:     { fontSize: 12, letterSpacing: 1.5, fontWeight: '700', color: colors.accent, textTransform: 'uppercase', marginBottom: 6 },
  title:      { fontSize: 28, lineHeight: 32, fontWeight: '700', color: colors.textPrimary, flexShrink: 1 },
  subtitle: { fontSize: 14, color: colors.textSecondary, marginTop: 6 },

  actionsGrid: { flexDirection: 'row', gap: 14, marginBottom: 15 },
  actionCard:  { flex: 1, borderRadius: 12, padding: 16, minHeight: 84 },
  actionCardCompact: { minHeight: 56, paddingVertical: 14, justifyContent: 'center', alignItems: 'center' },

  modeSwitch:{flexDirection:'row',backgroundColor:colors.primaryLight,padding:4,borderRadius:14,gap:4},
  modeButton:{flex:1,minHeight:44,alignItems:'center',justifyContent:'center',borderRadius:10},
  modeSelected:{backgroundColor:colors.primaryDark},
  modeLabel:{color:colors.primaryDark,fontWeight:'700'},
  modeLabelSelected:{color:colors.white},
  compactRow:   { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, paddingVertical: 10 },
  compactText:  { flex: 1, fontSize: 15, color: colors.textPrimary },
  compactAction:{ paddingHorizontal: 10, paddingVertical: 6, minHeight: 36, justifyContent: 'center' },
  compactActionText: { fontSize: 14, fontWeight: '700', color: colors.primary },
  compactDismissText:{ fontSize: 13, color: colors.textSecondary, textDecorationLine: 'underline' },
  networkRow:   { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 14, backgroundColor: colors.primaryLight, borderRadius: 12, marginVertical: 12 },
  networkRowText: { flex: 1, fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  networkPreview:{flexDirection:'row',alignItems:'center',gap:14,padding:14,backgroundColor:colors.primaryLight,borderRadius:16,marginVertical:12},
  networkArt:{width:96,height:106,position:'relative'},
  miniNode:{position:'absolute',width:23,height:23,marginLeft:-11.5,marginTop:-11.5,borderRadius:12,backgroundColor:colors.white,alignItems:'center',justifyContent:'center'},
  miniGap:{backgroundColor:colors.warningLight},
  miniCentre:{position:'absolute',left:'50%',top:'50%',marginLeft:-15,marginTop:-15,width:30,height:30,borderRadius:15,backgroundColor:colors.primaryDark,alignItems:'center',justifyContent:'center'},
  workSummary:{flexDirection:'row',flexWrap:'wrap',marginVertical:12,backgroundColor:colors.primaryLight,borderRadius:14},
  workEmpty:{marginVertical:12,color:colors.textSecondary,lineHeight:20},
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
  dismissReview:     { alignSelf: 'flex-start', marginTop: 6, paddingVertical: 2 },
  dismissReviewText: { fontSize: 13, color: colors.textSecondary, textDecorationLine: 'underline' },

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
  connCardTitle: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },

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
