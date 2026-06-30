import React, { useCallback, useState } from 'react'
import { Dimensions, FlatList, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '../lib/supabase'
import { colors } from '../theme/tokens'
import Icon from '../components/Icon'
import Loading from '../components/Loading'
import EmptyState from '../components/EmptyState'
import { ConnectionAvatar } from '../components/ConnectionAvatar'
import ConnectionNetwork from '../components/ConnectionNetwork'
import {
  fetchConnectionsForRequester,
  formatLastWorked,
  timesWorkedLabel,
  categoriesLabel,
  categoryColor,
  primaryCategory,
} from '../lib/connections'

const CANVAS_SIZE = Math.min(Dimensions.get('window').width - 32, 420)

export default function ConnectionsScreen({ navigation }) {
  const insets = useSafeAreaInsets()
  const [connections, setConnections] = useState([])
  const [me, setMe] = useState(null)
  const [view, setView] = useState('network') // 'network' | 'list'
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  useFocusEffect(useCallback(() => { load() }, []))

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setConnections([]); setLoading(false); setRefreshing(false); return }
    const [rows, profRes] = await Promise.all([
      fetchConnectionsForRequester(user.id),
      supabase.from('profiles').select('full_name, avatar_url').eq('id', user.id).single(),
    ])
    setConnections(rows)
    setMe({ name: profRes.data?.full_name, avatarUrl: profRes.data?.avatar_url })
    setLoading(false)
    setRefreshing(false)
  }

  function onRefresh() {
    setRefreshing(true)
    load()
  }

  function openConnection(conn) {
    navigation.navigate('ConnectionDetail', { connection: conn })
  }

  function renderItem({ item }) {
    const name = item.provider?.full_name || 'Provider'
    return (
      <TouchableOpacity
        style={styles.row}
        activeOpacity={0.75}
        onPress={() => openConnection(item)}
        accessibilityRole="button"
        accessibilityLabel={`${name}, ${timesWorkedLabel(item.times_worked)}`}>
        <View style={[styles.rowDot, { backgroundColor: categoryColor(primaryCategory(item.categories)) }]} />
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

  const legendCats = [...new Set(connections.map(c => primaryCategory(c.categories)).filter(Boolean))]

  const networkView = (
    <ScrollView
      contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      showsVerticalScrollIndicator={false}>
      <ConnectionNetwork center={me} connections={connections} onSelect={openConnection} size={CANVAS_SIZE} />

      <View style={styles.legend}>
        <View style={styles.legendRow}><Icon name="resize-outline" size={15} color={colors.textMuted} /><Text style={styles.legendText}>Closer to you = worked together more recently</Text></View>
        <View style={styles.legendRow}><Icon name="ellipse" size={13} color={colors.textMuted} /><Text style={styles.legendText}>Bigger dot = worked together more often</Text></View>
        <View style={styles.legendRow}><Icon name="color-palette-outline" size={15} color={colors.textMuted} /><Text style={styles.legendText}>Colour = main type of work</Text></View>
        {legendCats.length > 0 && (
          <View style={styles.legendChips}>
            {legendCats.map(cat => (
              <View key={cat} style={styles.legendChip}>
                <View style={[styles.legendChipDot, { backgroundColor: categoryColor(cat) }]} />
                <Text style={styles.legendChipText}>{cat}</Text>
              </View>
            ))}
          </View>
        )}
      </View>

      {connections.length > 16 && (
        <Text style={styles.moreNote}>Showing your 16 most recent. Switch to List to see all {connections.length}.</Text>
      )}
    </ScrollView>
  )

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
          <View style={styles.toggle}>
            {['network', 'list'].map(v => (
              <TouchableOpacity
                key={v}
                style={[styles.toggleBtn, view === v && styles.toggleBtnActive]}
                onPress={() => setView(v)}
                accessibilityRole="button"
                accessibilityState={{ selected: view === v }}
                accessibilityLabel={v === 'network' ? 'Network view' : 'List view'}>
                <Icon name={v === 'network' ? 'git-network-outline' : 'list-outline'} size={15} color={view === v ? colors.white : colors.textSecondary} />
                <Text style={[styles.toggleText, view === v && styles.toggleTextActive]}>
                  {v === 'network' ? 'Network' : 'List'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
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
      ) : view === 'network' ? (
        networkView
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

  toggle: { flexDirection: 'row', backgroundColor: colors.background, borderRadius: 10, padding: 3, marginTop: 12, alignSelf: 'flex-start' },
  toggleBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 8 },
  toggleBtnActive: { backgroundColor: colors.primary },
  toggleText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  toggleTextActive: { color: colors.white },

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
  rowDot: { width: 8, height: 8, borderRadius: 4 },
  name: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  meta: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  categories: { fontSize: 12, color: colors.textMuted, marginTop: 3 },

  legend: {
    backgroundColor: colors.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginTop: 12,
    gap: 8,
  },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  legendText: { fontSize: 13, color: colors.textSecondary, flex: 1 },
  legendChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  legendChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.background, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  legendChipDot: { width: 10, height: 10, borderRadius: 5 },
  legendChipText: { fontSize: 12, color: colors.textPrimary, fontWeight: '600' },

  moreNote: { fontSize: 12, color: colors.textMuted, textAlign: 'center', marginTop: 14 },
})
