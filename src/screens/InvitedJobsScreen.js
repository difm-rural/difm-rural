import React, { useCallback, useState } from 'react'
import { FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '../lib/supabase'
import { colors } from '../theme/tokens'
import Icon from '../components/Icon'
import Loading from '../components/Loading'
import EmptyState from '../components/EmptyState'
import { ConnectionAvatar } from '../components/ConnectionAvatar'
import { fetchInvitedJobsForProvider } from '../lib/invites'
import { notificationTimeAgo } from '../lib/notifications'

export default function InvitedJobsScreen({ navigation }) {
  const insets = useSafeAreaInsets()
  const [invites, setInvites] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  useFocusEffect(useCallback(() => { load() }, []))

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setInvites([]); setLoading(false); setRefreshing(false); return }
    setInvites(await fetchInvitedJobsForProvider(user.id))
    setLoading(false)
    setRefreshing(false)
  }

  function onRefresh() {
    setRefreshing(true)
    load()
  }

  function renderItem({ item }) {
    const who = item.requester?.full_name || 'A requester'
    return (
      <TouchableOpacity
        style={styles.row}
        activeOpacity={0.75}
        onPress={() => navigation.navigate('JobDetail', { job: item.job })}
        accessibilityRole="button"
        accessibilityLabel={`Job offer from ${who}: ${item.job?.title}`}>
        <ConnectionAvatar name={who} avatarUrl={item.requester?.avatar_url} />
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>{item.job?.title || 'Job'}</Text>
          <Text style={styles.meta} numberOfLines={1}>
            From {who}{item.job?.category ? ` · ${item.job.category}` : ''}
          </Text>
          <Text style={styles.time}>Invited {notificationTimeAgo(item.created_at)}</Text>
        </View>
        <Icon name="chevron-forward" size={18} color={colors.textMuted} />
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
          <Text style={styles.backBtnText}><Icon name="chevron-back" size={14} color={colors.primary} /> Back</Text>
        </TouchableOpacity>
        <Text style={styles.kicker}>Connections</Text>
        <Text style={styles.headerTitle} accessibilityRole="header">Invited to you</Text>
        <Text style={styles.headerSub}>Jobs offered to you privately. Make an offer to take one on.</Text>
      </View>

      {loading ? (
        <Loading label="Loading your invites…" />
      ) : invites.length === 0 ? (
        <EmptyState
          icon="mail-open-outline"
          title="No job offers yet"
          body="When someone you've worked with offers you a job directly, it shows up here."
        />
      ) : (
        <FlatList
          data={invites}
          renderItem={renderItem}
          keyExtractor={item => item.id}
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },

  header: { paddingHorizontal: 16, paddingBottom: 14, backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.border },
  backBtn: { marginBottom: 8 },
  backBtnText: { color: colors.primary, fontSize: 14, fontWeight: '600' },
  kicker: { fontSize: 12, letterSpacing: 1.5, fontWeight: '700', color: colors.accent, textTransform: 'uppercase', marginBottom: 4 },
  headerTitle: { fontSize: 24, fontWeight: '700', color: colors.textPrimary },
  headerSub: { fontSize: 13, color: colors.textSecondary, marginTop: 4 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    marginBottom: 10,
  },
  title: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  meta: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  time: { fontSize: 12, color: colors.textMuted, marginTop: 3 },
})
