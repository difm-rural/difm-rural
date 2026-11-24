import {arrangementTime} from '../../shared/notificationArrangement'
import {notificationHint} from '../../shared/notificationHints'
import {groupByDay,relativeTime} from '../../shared/notificationGroups'
import {notificationBody} from '../../shared/notificationBody'
import {notificationSide, sideTag} from '../../shared/marketSide'
import React, { useCallback, useRef, useState } from 'react'
import {
  SectionList,
  AppState,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { stackRootAction } from '../../shared/stackNavigation'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '../lib/supabase'
import { colors } from '../theme/tokens'
import Icon from '../components/Icon'
import EmptyState from '../components/EmptyState'
import Loading from '../components/Loading'
import {
  NOTIFICATION_ICONS,
  fetchNotificationInbox,
  markAllNotificationsRead,
  openNotificationTarget,
} from '../lib/notifications'
import { onBadgeRefresh, requestBadgeRefresh } from '../lib/badgeEvents'

export default function NotificationsScreen({ navigation, route }) {
  const insets = useSafeAreaInsets()
  const [filter,setFilter]=useState('all')
  const [unreadCount,setUnreadCount]=useState(0)
  const [error,setError]=useState('')
  const [marking,setMarking]=useState(false)
  const requestVersion=useRef(0)
  const timezone=Intl.DateTimeFormat().resolvedOptions().timeZone
  const [userId, setUserId] = useState(null)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const autoOpenedRef = useRef(null)
  const openingRef = useRef(false)
  const [openingId, setOpeningId] = useState(null)

  useFocusEffect(useCallback(() => {
    let refreshingInbox = false
    load()
    async function refreshInbox() {
      if(refreshingInbox)return
      refreshingInbox=true
      try {await load()} finally {refreshingInbox=false}
    }
    // Keep the open inbox current, including when returning from an email app.
    const timer = setInterval(refreshInbox, 10000)
    const unsubscribe = onBadgeRefresh(() => refreshInbox())
    const appState = AppState.addEventListener('change', state => {
      if (state === 'active') refreshInbox()
    })
    return () => { requestVersion.current++; clearInterval(timer); appState.remove(); unsubscribe() }
  }, [route?.params?.openNotificationId,filter]))

  async function load() {
    const version=++requestVersion.current
    let user,list
    try {
      const auth=await supabase.auth.getUser()
      if(auth.error)throw auth.error
      user=auth.data.user
      const inbox=await fetchNotificationInbox({unreadOnly:filter==='unread'})
      if(version!==requestVersion.current)return
      list=inbox.items
      setUserId(user?.id||null);setItems(list);setUnreadCount(inbox.unreadCount);setError('')
    } catch {
      if(version===requestVersion.current)setError('Could not load notifications. Pull down to retry.')
      return
    } finally {
      if(version===requestVersion.current){setLoading(false);setRefreshing(false)}
    }

    // Arrived from an email deep link (difmrural://notification/<id>): open the
    // same target a row tap would. Done here because openNotificationTarget
    // navigates to screens nested in this stack, so it needs this screen's
    // navigation object rather than the root container ref.
    const openId = route?.params?.openNotificationId
    if (openId && autoOpenedRef.current !== openId && user?.id) {
      autoOpenedRef.current = openId
      navigation.setParams({ openNotificationId: undefined })
      const target = list.find(n => n.id === openId)
      if (target) await handleOpen(target, user.id)
    }
  }

  function onRefresh() {
    setRefreshing(true)
    load()
  }

  async function handleOpen(item, viewerId = userId) {
    if (openingRef.current) return
    openingRef.current = true
    setOpeningId(item.id)
    try {
      const resolved = await openNotificationTarget(navigation, viewerId, item)
      if (resolved && item.type!=='new_message') {setUnreadCount(count=>Math.max(0,count-(item.read?0:1)));setItems(prev => prev.map(n => n.id === item.id ? { ...n, read: true, _wasUnread: false } : n))}
    } finally {
      openingRef.current = false
      setOpeningId(null)
    }
  }

  async function handleMarkAllRead() {
    if(marking)return
    setMarking(true)
    try {
      const cutoff=new Date().toISOString()
      if(!await markAllNotificationsRead(cutoff))throw Error('Not signed in')
      await load()
    } catch {setError('Could not mark notifications read. Try again.')}
    finally {setMarking(false)}
  }

  async function quickSetAvailability(item, status) {
    if (!userId) return
    const now = new Date().toISOString()
    const { error } = await supabase
      .from('profiles')
      .update({
        availability_status: status,
        availability_until: null,
        availability_updated_at: now,
      })
      .eq('id', userId)
    if (error) {setError('Could not save availability. Try again.');return}
    const {error:readError}=await supabase.from('notifications').update({ read: true }).eq('id', item.id).eq('user_id',userId)
    if(readError){setError('Availability saved, but read status could not be updated. Pull down to refresh.');return}
    setUnreadCount(count=>Math.max(0,count-(item.read?0:1)))
    setItems(prev => prev.map(n => n.id === item.id
      ? { ...n, read: true, _wasUnread: false, _availabilityAnswered: status }
      : n))
    requestBadgeRefresh()
  }

  const hasUnread = unreadCount>0

  function renderItem({ item }) {
    const side = notificationSide(item)
    const tag = sideTag(side,item)
    const time = arrangementTime(item,timezone)
    const iconName = NOTIFICATION_ICONS[item.type] || 'notifications-outline'
    return (
      <TouchableOpacity
        style={[styles.row, !item.read && styles.rowUnread]}
        disabled={openingId !== null}
        onPress={() => handleOpen(item)}
        activeOpacity={0.75}
        accessibilityRole="button"
        accessibilityLabel={[notificationBody(item),time].filter(Boolean).join(' ')}>
        {side ? (
          <View style={[styles.rowIconCircle, { backgroundColor: side === 'job' ? colors.jobFill : colors.listingFill }]}>
            <Icon name={iconName} size={18} color={side === 'job' ? colors.jobIcon : colors.listingIcon} />
          </View>
        ) : (
          <Icon name={iconName} size={20} color={colors.primary} />
        )}
        <View style={styles.rowContent}>
          {tag && <Text style={[styles.sideTag, { color: side === 'job' ? colors.jobInk : colors.listingInk }]}>{tag}</Text>}
          <Text style={styles.rowBody}>{notificationBody(item)}</Text>
          {time&&<Text style={styles.rowTime}>{time}</Text>}
          {notificationHint(item.type)&&<Text style={styles.rowHint}>{notificationHint(item.type)}</Text>}
          {openingId === item.id && <Text accessibilityRole="text" style={styles.rowTime}>Opening…</Text>}
          {item.type === 'availability_check' && !item.read && !item._availabilityAnswered && (
            <View style={styles.quickActions}>
              <TouchableOpacity
                style={styles.quickAction}
                onPress={() => quickSetAvailability(item, 'available_this_week')}>
                <Text style={styles.quickActionText}>Available this week</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.quickAction}
                onPress={() => quickSetAvailability(item, 'limited')}>
                <Text style={styles.quickActionText}>Limited</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.quickActionSecondary}
                onPress={() => handleOpen(item)}>
                <Text style={styles.quickActionSecondaryText}>Other</Text>
              </TouchableOpacity>
            </View>
          )}
          {item._availabilityAnswered && (
            <Text style={styles.answeredText}>
              Updated: {item._availabilityAnswered === 'limited' ? 'Limited availability' : 'Available this week'}
            </Text>
          )}
          <Text style={styles.rowTime}>{relativeTime(item.created_at,new Date(),timezone)}</Text>
        </View>
        {!item.read && <View style={styles.unreadDot} />}
      </TouchableOpacity>
    )
  }

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <View style={styles.headerTopRow}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => {
              const rootAction = stackRootAction(navigation.getState())
              if (rootAction) navigation.dispatch(rootAction)
            }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel="Done with notifications, return to main screen">
            <Text style={styles.backBtnText}>Done</Text>
          </TouchableOpacity>
          {hasUnread && (
            <TouchableOpacity
              onPress={handleMarkAllRead}
              disabled={marking} disabled={marking}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel="Mark all notifications read">
              <Text style={styles.markAllText}>Mark all read</Text>
            </TouchableOpacity>
          )}
        </View>

        <Text style={styles.title} accessibilityRole="header">Notifications</Text>
      </View>

      <View style={styles.filters} accessibilityRole="tablist">
        {['all','unread'].map(value=><TouchableOpacity key={value} accessibilityRole="tab" accessibilityState={{selected:filter===value}}
          onPress={()=>{if(value!==filter){setItems([]);setLoading(true);setFilter(value)}}} style={[styles.filter,filter===value&&styles.filterActive]}>
          <Text style={filter===value?styles.filterSelected:styles.filterText}>{value==='all'?'All':`Unread (${unreadCount})`}</Text>
        </TouchableOpacity>)}
      </View>
      {!!error&&<Text style={styles.error} accessibilityRole="alert">{error}</Text>}
      {loading ? (
        <Loading label="Loading notifications…" />
      ) : (
        <SectionList
          sections={groupByDay(items.filter(item=>filter!=='unread'||!item.read),new Date(),timezone).map(group=>({title:group.label,data:group.items}))}
          keyExtractor={item=>item.id}
          renderItem={renderItem}
          renderSectionHeader={({section})=><Text style={styles.groupHeading} accessibilityRole="header">{section.title}</Text>}
          stickySectionHeadersEnabled={false}
          alwaysBounceVertical={true}
          ListEmptyComponent={<EmptyState icon="notifications-outline" title={error?'Notifications unavailable':filter==='unread'?'All caught up':'No notifications here yet'}
            body={error?'Pull down to retry.':filter==='unread'?'You have no unread notifications.':'Messages, offers and booking updates will appear here.'}/>}
          contentContainerStyle={{ flexGrow: 1, paddingBottom: insets.bottom + 24 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          }
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },

  header: {
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.background,
  },
  headerTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  backBtn:     { minHeight: 36, justifyContent: 'center', alignSelf: 'flex-start', marginBottom: 8 },
  backBtnText: { color: colors.primary, fontSize: 15, fontWeight: '600' },
  markAllText: { color: colors.primary, fontSize: 14, fontWeight: '600' },
  kicker:      { fontSize: 13, fontWeight: '700', color: colors.accent, marginBottom: 6 },
  title:       { fontSize: 30, lineHeight: 34, fontWeight: '700', color: colors.textPrimary },


  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
    backgroundColor: colors.background,
  },
  rowUnread:  { backgroundColor: '#f0faf4' },
  rowIcon:    { fontSize: 22, lineHeight: 26 },
  rowIconCircle: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  sideTag:    { fontSize: 10, fontWeight: '800', letterSpacing: 0.6, marginBottom: 2 },
  rowContent: { flex: 1, minWidth: 0 },
  filters: {flexDirection:"row",marginHorizontal:20,marginVertical:6,padding:3,borderRadius:10,backgroundColor:colors.border},
  filter: {flex:1,minHeight:44,justifyContent:"center",alignItems:"center",borderRadius:8,paddingHorizontal:8,paddingVertical:6},
  filterActive: {backgroundColor:colors.primary},
  filterText: {fontSize:14,fontWeight:"600",color:colors.textPrimary},
  filterSelected: {fontSize:14,fontWeight:"700",color:colors.white},
  groupHeading: {paddingHorizontal:20,paddingVertical:10,fontSize:14,fontWeight:"700",color:colors.textMuted},
  rowHint: {fontSize:13,color:colors.primary,marginTop:4},
  error: {padding:16,color:colors.textPrimary},
  rowBody:    { fontSize: 15, color: colors.textPrimary, lineHeight: 21 },
  rowTime:    { fontSize: 12, color: colors.textMuted, marginTop: 4 },
  quickActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 10 },
  quickAction: { backgroundColor: colors.primary, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 },
  quickActionText: { color: colors.white, fontSize: 11.5, fontWeight: '700' },
  quickActionSecondary: { borderWidth: 1, borderColor: colors.primary, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 },
  quickActionSecondaryText: { color: colors.primary, fontSize: 11.5, fontWeight: '700' },
  answeredText: { color: colors.primary, fontSize: 12, fontWeight: '600', marginTop: 8 },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
    marginTop: 8,
  },
})
