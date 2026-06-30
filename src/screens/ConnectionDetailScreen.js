import React, { useEffect, useState } from 'react'
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '../lib/supabase'
import { colors } from '../theme/tokens'
import Icon from '../components/Icon'
import Button from '../components/Button'
import { ConnectionAvatar } from '../components/ConnectionAvatar'
import { formatLastWorked, timesWorkedLabel } from '../lib/connections'

export default function ConnectionDetailScreen({ navigation, route }) {
  const insets = useSafeAreaInsets()
  const { connection } = route.params
  const provider = connection.provider
  const providerId = connection.provider_id
  const name = provider?.full_name || 'Provider'

  const [services, setServices] = useState([])
  const [loadingServices, setLoadingServices] = useState(true)

  useEffect(() => {
    let active = true
    ;(async () => {
      const { data } = await supabase
        .from('services')
        .select('*')
        .eq('provider_id', providerId)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
      if (active) {
        setServices(data || [])
        setLoadingServices(false)
      }
    })()
    return () => { active = false }
  }, [providerId])

  function bookService(svc) {
    navigation.navigate('ServiceDetail', {
      service: { ...svc, profile: { id: providerId, full_name: provider?.full_name, avatar_url: provider?.avatar_url } },
    })
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
        <View style={styles.headerRow}>
          <ConnectionAvatar name={name} avatarUrl={provider?.avatar_url} size={56} />
          <View style={{ flex: 1 }}>
            <Text style={styles.name} accessibilityRole="header" numberOfLines={1}>{name}</Text>
            <Text style={styles.meta}>{timesWorkedLabel(connection.times_worked)}</Text>
          </View>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}
        showsVerticalScrollIndicator={false}>

        {/* History summary */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Your history together</Text>
          <View style={styles.statsRow}>
            <Stat number={connection.jobs_count || 0} label={`job${connection.jobs_count === 1 ? '' : 's'}`} />
            <Stat number={connection.bookings_count || 0} label={`booking${connection.bookings_count === 1 ? '' : 's'}`} />
            <Stat number={connection.times_worked || 0} label="total" />
          </View>
          <View style={styles.factRow}>
            <Icon name="calendar-outline" size={15} color={colors.textMuted} />
            <Text style={styles.factText}>
              {connection.first_engaged_at ? `First worked together ${formatLastWorked(connection.first_engaged_at)}` : 'Recently connected'}
              {connection.last_engaged_at && connection.last_engaged_at !== connection.first_engaged_at
                ? ` · most recent ${formatLastWorked(connection.last_engaged_at)}`
                : ''}
            </Text>
          </View>
          {connection.categories?.length > 0 && (
            <View style={styles.chipsRow}>
              {connection.categories.map(cat => (
                <View key={cat} style={styles.chip}><Text style={styles.chipText}>{cat}</Text></View>
              ))}
            </View>
          )}
        </View>

        {/* Re-book */}
        <Text style={styles.sectionLabel}>Book them again</Text>
        {loadingServices ? (
          <View style={styles.card}><Text style={styles.muted}>Loading their services…</Text></View>
        ) : services.length === 0 ? (
          <View style={styles.card}>
            <Text style={styles.muted}>
              {name.split(' ')[0]} has no active services listed right now. You can still view their profile or post a job they can offer on.
            </Text>
          </View>
        ) : (
          services.map(svc => (
            <View key={svc.id} style={styles.serviceRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.serviceTitle} numberOfLines={1}>{svc.title}</Text>
                {!!svc.category && <Text style={styles.serviceCat}>{svc.category}</Text>}
              </View>
              <Button size="sm" title="Book again" icon="calendar-outline" onPress={() => bookService(svc)} accessibilityLabel={`Book ${svc.title} again`} />
            </View>
          ))
        )}

        <Button
          variant="secondary"
          title="View full profile"
          icon="person-outline"
          onPress={() => navigation.navigate('ProviderProfile', { providerId })}
          style={{ marginTop: 16 }}
          accessibilityLabel={`View ${name}'s full profile`}
        />
      </ScrollView>
    </View>
  )
}

function Stat({ number, label }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statNumber}>{number}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },

  header: { paddingHorizontal: 16, paddingBottom: 14, backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.border },
  backBtn: { marginBottom: 8 },
  backBtnText: { color: colors.primary, fontSize: 14, fontWeight: '600' },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  name: { fontSize: 22, fontWeight: '700', color: colors.textPrimary },
  meta: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },

  card: { backgroundColor: colors.white, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 16, marginBottom: 16 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: colors.textPrimary, marginBottom: 12 },

  statsRow: { flexDirection: 'row', marginBottom: 12 },
  stat: { flex: 1, alignItems: 'center' },
  statNumber: { fontSize: 22, fontWeight: '700', color: colors.primary },
  statLabel: { fontSize: 12, color: colors.textMuted, marginTop: 2 },

  factRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  factText: { flex: 1, fontSize: 13, color: colors.textSecondary },

  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  chip: { backgroundColor: colors.primaryLight, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 4 },
  chipText: { fontSize: 12, color: colors.primary, fontWeight: '600' },

  sectionLabel: { fontSize: 13, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  muted: { fontSize: 14, color: colors.textSecondary, lineHeight: 20 },

  serviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginBottom: 10,
  },
  serviceTitle: { fontSize: 15, fontWeight: '600', color: colors.textPrimary },
  serviceCat: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
})
