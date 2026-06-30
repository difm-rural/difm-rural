import React, { useCallback, useState } from 'react'
import { FlatList, Image, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '../lib/supabase'
import { colors } from '../theme/tokens'
import Icon from '../components/Icon'
import Loading from '../components/Loading'
import EmptyState from '../components/EmptyState'
import { fetchConnectionsForRequester, formatLastWorked, timesWorkedLabel, categoriesLabel } from '../lib/connections'

function getInitials(name) {
  if (!name) return '?'
  return name.trim().split(/\s+/).map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()
}

export function ConnectionAvatar({ name, avatarUrl, size = 48 }) {
  const dim = { width: size, height: size, borderRadius: size / 2 }
  if (avatarUrl) {
    return <Image source={{ uri: avatarUrl }} style={[styles.avatar, dim]} />
  }
  return (
    <View style={[styles.avatar, styles.avatarFallback, dim]}>
      <Text style={[styles.avatarInitials, { fontSize: size * 0.36 }]}>{getInitials(name)}</Text>
    </View>
  )
}

export default function ConnectionsScreen({ navigation }) {
  const insets = useSafeAreaInsets()
  const [connections, setConnections] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  useFocusEffect(useCallback(() => { load() }, []))

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setConnections([]); setLoading(false); setRefreshing(false); return }
    const rows = await fetchConnectionsForRequester(user.id)
    setConnections(rows)
    setLoading(false)
    setRefreshing(false)
  }

  function onRefresh() {
    setRefreshing(true)
    load()
  }

  function renderItem({ item }) {
    const name = item.provider?.full_name || 'Provider'
    return (
      <TouchableOpacity
        style={styles.row}
        activeOpacity={0.75}
        onPress={() => navigation.navigate('ConnectionDetail', { connection: item })}
        accessibilityRole="button"
        accessibilityLabel={`${name}, ${timesWorkedLabel(item.times_worked)}`}>
        <ConnectionAvatar name={name} avatarUrl={item.provider?.avatar_url} />
        <View style={{ flex: 1 }}>
          <Text style={styles.name} numberOfLines={1}>{name}</Text>
          <Text style={styles.meta} numberOfLines={1}>
            {timesWorkedLabel(item.times_worked)}
            {item.last_engaged_at ? ` · last ${formatLastWorked(item.last_engaged_at)}` : ''}
          </Text>
          {item.categories?.length > 0 && (
            <Text style={styles.categories} numberOfLines={1}>{categoriesLabel(item.categories)}</Text>
          )}
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
        <Text style={styles.headerTitle} accessibilityRole="header">People you've worked with</Text>
        {!loading && connections.length > 0 && (
          <Text style={styles.headerSub}>
            {connections.length} provider{connections.length === 1 ? '' : 's'}
          </Text>
        )}
      </View>

      {loading ? (
        <Loading label="Loading your connections…" />
      ) : connections.length === 0 ? (
        <EmptyState
          icon="people-outline"
          title="No connections yet"
          body="Once you complete a job or booking, the providers you worked with show up here so you can offer them work again."
        />
      ) : (
        <FlatList
          data={connections}
          renderItem={renderItem}
          keyExtractor={item => `${item.requester_id}-${item.provider_id}`}
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
  avatar: { backgroundColor: colors.primaryLight },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  avatarInitials: { color: colors.primary, fontWeight: '700' },

  name: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  meta: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  categories: { fontSize: 12, color: colors.textMuted, marginTop: 3 },
})
