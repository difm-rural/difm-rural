import React, { useCallback, useRef, useState } from 'react'
import {
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
import Icon from '../components/Icon'
import EmptyState from '../components/EmptyState'
import Loading from '../components/Loading'
import {
  NOTIFICATION_ICONS,
  fetchNotifications,
  markAllNotificationsRead,
  notificationTimeAgo,
  openNotificationTarget,
} from '../lib/notifications'
import { requestBadgeRefresh } from '../lib/badgeEvents'

export default function NotificationsScreen({ navigation, route }) {
  const insets = useSafeAreaInsets()
  const [userId, setUserId] = useState(null)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const autoOpenedRef = useRef(null)

  useFocusEffect(useCallback(() => { load() }, []))

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    setUserId(user?.id || null)

    const list = await fetchNotifications(100)
    // Items stay unread until the user acts on one (taps to open) or chooses
    // "Mark all read" — simply viewing the inbox no longer clears the command
    // centre, so nothing disappears before it's been dealt with.
    setItems(list.map(n => ({ ...n, _wasUnread: !n.read })))
    setLoading(false)
    setRefreshing(false)

    // Arrived from an email deep link (difmrural://notification/<id>): open the
    // same target a row tap would. Done here because openNotificationTarget
    // navigates to screens nested in this stack, so it needs this screen's
    // navigation object rather than the root container ref.
    const openId = route?.params?.openNotificationId
    if (openId && autoOpenedRef.current !== openId && user?.id) {
      autoOpenedRef.current = openId
      navigation.setParams({ openNotificationId: undefined })
      const target = list.find(n => n.id === openId)
      if (target) await openNotificationTarget(navigation, user.id, target)
    }
  }

  function onRefresh() {
    setRefreshing(true)
    load()
  }

  async function handleMarkAllRead() {
    setItems(prev => prev.map(n => ({ ...n, read: true, _wasUnread: false })))
    await markAllNotificationsRead()
    requestBadgeRefresh()
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
    if (error) return
    await supabase.from('notifications').update({ read: true }).eq('id', item.id)
    setItems(prev => prev.map(n => n.id === item.id
      ? { ...n, read: true, _wasUnread: false, _availabilityAnswered: status }
      : n))
    requestBadgeRefresh()
  }

  const hasUnread = items.some(n => !n.read)

  function renderItem({ item }) {
    return (
      <TouchableOpacity
        style={[styles.row, item._wasUnread && styles.rowUnread]}
        onPress={async () => {
          const resolved = await openNotificationTarget(navigation, userId, item)
          if (resolved) {
            setItems(prev => prev.map(n => (n.id === item.id ? { ...n, read: true, _wasUnread: false } : n)))
          }
        }}
        activeOpacity={0.75}
        accessibilityRole="button"
        accessibilityLabel={item.body}>
        <Icon name={NOTIFICATION_ICONS[item.type] || 'notifications-outline'} size={20} color={colors.primary} />
        <View style={styles.rowContent}>
          <Text style={styles.rowBody}>{item.body}</Text>
          {item.type === 'availability_check' && !item._availabilityAnswered && (
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
                onPress={() => openNotificationTarget(navigation, userId, item)}>
                <Text style={styles.quickActionSecondaryText}>Other</Text>
              </TouchableOpacity>
            </View>
          )}
          {item._availabilityAnswered && (
            <Text style={styles.answeredText}>
              Updated: {item._availabilityAnswered === 'limited' ? 'Limited availability' : 'Available this week'}
            </Text>
          )}
          <Text style={styles.rowTime}>{notificationTimeAgo(item.created_at)}</Text>
        </View>
        {item._wasUnread && <View style={styles.unreadDot} />}
      </TouchableOpacity>
    )
  }

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <View style={styles.headerTopRow}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel="Go back">
            <Text style={styles.backBtnText}><Icon name="chevron-back" size={14} color={colors.primary} /> Back</Text>
          </TouchableOpacity>
          {hasUnread && (
            <TouchableOpacity
              onPress={handleMarkAllRead}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel="Mark all notifications read">
              <Text style={styles.markAllText}>Mark all read</Text>
            </TouchableOpacity>
          )}
        </View>
        <Text style={styles.kicker}>Activity</Text>
        <Text style={styles.title} accessibilityRole="header">Notifications</Text>
      </View>

      {loading ? (
        <Loading label="Loading notifications…" />
      ) : items.length === 0 ? (
        <EmptyState
          icon="notifications-outline"
          title="Nothing yet"
          body="Offers, bookings, questions, and job updates will appear here."
        />
      ) : (
        <FlatList
          data={items}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
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
  rowContent: { flex: 1 },
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
