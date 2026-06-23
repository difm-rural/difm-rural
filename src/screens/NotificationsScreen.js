import React, { useCallback, useState } from 'react'
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
import {
  NOTIFICATION_ICONS,
  fetchNotifications,
  markAllNotificationsRead,
  notificationTimeAgo,
  openNotificationTarget,
} from '../lib/notifications'
import { requestBadgeRefresh } from '../lib/badgeEvents'

export default function NotificationsScreen({ navigation }) {
  const insets = useSafeAreaInsets()
  const [userId, setUserId] = useState(null)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  useFocusEffect(useCallback(() => { load() }, []))

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    setUserId(user?.id || null)

    const list = await fetchNotifications(100)
    // Keep the unread flag from fetch time so new items stay highlighted
    // in this view even though we mark them read below.
    setItems(list.map(n => ({ ...n, _wasUnread: !n.read })))
    setLoading(false)
    setRefreshing(false)

    if (list.some(n => !n.read)) {
      await markAllNotificationsRead()
      requestBadgeRefresh()
    }
  }

  function onRefresh() {
    setRefreshing(true)
    load()
  }

  function renderItem({ item }) {
    return (
      <TouchableOpacity
        style={[styles.row, item._wasUnread && styles.rowUnread]}
        onPress={() => openNotificationTarget(navigation, userId, item)}
        activeOpacity={0.75}
        accessibilityRole="button"
        accessibilityLabel={item.body}>
        <Text style={styles.rowIcon}>{NOTIFICATION_ICONS[item.type] || '🔔'}</Text>
        <View style={styles.rowContent}>
          <Text style={styles.rowBody}>{item.body}</Text>
          <Text style={styles.rowTime}>{notificationTimeAgo(item.created_at)}</Text>
        </View>
        {item._wasUnread && <View style={styles.unreadDot} />}
      </TouchableOpacity>
    )
  }

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Go back">
          <Text style={styles.backBtnText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.kicker}>Activity</Text>
        <Text style={styles.title} accessibilityRole="header">Notifications</Text>
      </View>

      {loading ? (
        <View style={styles.center}>
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      ) : items.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>Nothing yet</Text>
          <Text style={styles.emptyBody}>
            Bids, bookings, questions, and job updates will appear here.
          </Text>
        </View>
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
  backBtn:     { minHeight: 36, justifyContent: 'center', alignSelf: 'flex-start', marginBottom: 8 },
  backBtnText: { color: colors.primary, fontSize: 15, fontWeight: '600' },
  kicker:      { fontSize: 13, fontWeight: '700', color: colors.accent, marginBottom: 6 },
  title:       { fontSize: 30, lineHeight: 34, fontWeight: '700', color: colors.textPrimary },

  center:      { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  loadingText: { fontSize: 15, color: colors.textMuted },
  emptyTitle:  { fontSize: 18, fontWeight: '700', color: colors.textPrimary, marginBottom: 8 },
  emptyBody:   { fontSize: 14, color: colors.textMuted, textAlign: 'center', lineHeight: 21 },

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
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
    marginTop: 8,
  },
})
