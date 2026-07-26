import React, { useCallback, useState } from 'react'
import { Alert, FlatList, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '../lib/supabase'
import {
  deleteSavedInterest,
  fetchSavedInterests,
  SAVED_INTEREST_FREQUENCIES,
  updateSavedInterest,
} from '../lib/savedInterests'
import { colors } from '../theme/tokens'
import Icon from '../components/Icon'
import Loading from '../components/Loading'
import EmptyState from '../components/EmptyState'

function description(item) {
  const parts = []
  if (item.query) parts.push(`“${item.query}”`)
  if (item.category) parts.push(item.category)
  if (item.radius_km && item.location_name) parts.push(`within ${item.radius_km} km of ${item.location_name}`)
  else if (item.location_name) parts.push(item.location_name)
  return parts.join(' · ') || 'All open jobs'
}

export default function SavedInterestsScreen({ navigation }) {
  const insets = useSafeAreaInsets()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)

  useFocusEffect(useCallback(() => { load() }, []))

  async function load() {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      setItems(await fetchSavedInterests(user?.id))
    } catch (error) {
      Alert.alert('Could not load saved interests', error.message)
    } finally {
      setLoading(false)
    }
  }

  async function change(id, values) {
    const previous = items
    setItems(current => current.map(item => item.id === id ? { ...item, ...values } : item))
    try {
      const updated = await updateSavedInterest(id, values)
      setItems(current => current.map(item => item.id === id ? updated : item))
    } catch (error) {
      setItems(previous)
      Alert.alert('Could not update this interest', error.message)
    }
  }

  function remove(item) {
    Alert.alert('Delete saved interest?', item.name, [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          try {
            await deleteSavedInterest(item.id)
            setItems(current => current.filter(row => row.id !== item.id))
          } catch (error) {
            Alert.alert('Could not delete this interest', error.message)
          }
        },
      },
    ])
  }

  function renderItem({ item }) {
    return (
      <View style={[styles.card, !item.active && styles.cardPaused]}>
        <View style={styles.cardTop}>
          <View style={styles.iconWrap}><Icon name="bookmark-outline" size={20} color={colors.primary} /></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{item.name}</Text>
            <Text style={styles.description}>{description(item)}</Text>
          </View>
          <Switch
            value={item.active}
            onValueChange={active => change(item.id, { active, auto_paused_at: null })}
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor={colors.white}
            accessibilityLabel={`${item.active ? 'Pause' : 'Resume'} ${item.name}`}
          />
        </View>

        {item.auto_paused_at && !item.active && (
          <View style={styles.pausedNote}>
            <Icon name="time-outline" size={15} color={colors.warning} />
            <Text style={styles.pausedText}>Paused after six months without app activity. Turn it on to resume.</Text>
          </View>
        )}

        <Text style={styles.label}>Alert frequency</Text>
        <View style={styles.frequencyRow}>
          {SAVED_INTEREST_FREQUENCIES.map(option => (
            <TouchableOpacity
              key={option.value}
              style={[styles.frequencyChip, item.frequency === option.value && styles.frequencyChipActive]}
              onPress={() => change(item.id, {
                frequency: option.value,
                push_enabled: option.value === 'off' ? false : item.push_enabled,
                email_enabled: option.value === 'off' ? false : item.email_enabled,
              })}
              accessibilityRole="button"
              accessibilityState={{ selected: item.frequency === option.value }}>
              <Text style={[styles.frequencyText, item.frequency === option.value && styles.frequencyTextActive]}>
                {option.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {item.frequency !== 'off' && (
          <View style={styles.channelRow}>
            <TouchableOpacity
              style={styles.channel}
              onPress={() => change(item.id, { push_enabled: !item.push_enabled })}>
              <Icon name={item.push_enabled ? 'checkbox' : 'square-outline'} size={20} color={colors.primary} />
              <Text style={styles.channelText}>Push</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.channel}
              onPress={() => change(item.id, { email_enabled: !item.email_enabled })}>
              <Icon name={item.email_enabled ? 'checkbox' : 'square-outline'} size={20} color={colors.primary} />
              <Text style={styles.channelText}>Email</Text>
            </TouchableOpacity>
          </View>
        )}

        <TouchableOpacity style={styles.deleteButton} onPress={() => remove(item)} accessibilityRole="button">
          <Icon name="trash-outline" size={16} color={colors.danger} />
          <Text style={styles.deleteText}>Delete</Text>
        </TouchableOpacity>
      </View>
    )
  }

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity style={styles.back} onPress={() => navigation.goBack()} accessibilityRole="button">
          <Icon name="chevron-back" size={17} color={colors.primary} />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.kicker}>Interests</Text>
        <Text style={styles.title}>Saved interests</Text>
        <Text style={styles.subtitle}>You decide what to follow and how often we contact you.</Text>
      </View>
      {loading ? <Loading label="Loading saved interests…" /> : (
        <FlatList
          data={items}
          renderItem={renderItem}
          keyExtractor={item => item.id}
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}
          ListEmptyComponent={
            <EmptyState
              panel
              icon="bookmark-outline"
              title="Nothing saved yet"
              body="Set filters on the Jobs board, then tap Save this search."
            />
          }
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: 16, paddingBottom: 16, backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.border },
  back: { flexDirection: 'row', alignItems: 'center', marginBottom: 9 },
  backText: { color: colors.primary, fontSize: 14, fontWeight: '600' },
  kicker: { color: colors.accent, fontSize: 12, fontWeight: '700', letterSpacing: 1.4, textTransform: 'uppercase', marginBottom: 4 },
  title: { color: colors.textPrimary, fontSize: 26, fontWeight: '700' },
  subtitle: { color: colors.textSecondary, fontSize: 14, lineHeight: 20, marginTop: 4 },
  card: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 14, marginBottom: 12 },
  cardPaused: { opacity: 0.72 },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  iconWrap: { width: 38, height: 38, borderRadius: 10, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  name: { color: colors.textPrimary, fontSize: 16, fontWeight: '700', marginBottom: 3 },
  description: { color: colors.textSecondary, fontSize: 13, lineHeight: 18 },
  pausedNote: { flexDirection: 'row', gap: 7, alignItems: 'flex-start', backgroundColor: colors.warningLight, borderRadius: 8, padding: 9, marginTop: 12 },
  pausedText: { flex: 1, color: colors.textSecondary, fontSize: 12, lineHeight: 17 },
  label: { color: colors.textMuted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 14, marginBottom: 7 },
  frequencyRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  frequencyChip: { borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 7 },
  frequencyChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  frequencyText: { color: colors.textSecondary, fontSize: 12, fontWeight: '600' },
  frequencyTextActive: { color: colors.white },
  channelRow: { flexDirection: 'row', gap: 24, marginTop: 13 },
  channel: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  channelText: { color: colors.textPrimary, fontSize: 13, fontWeight: '600' },
  deleteButton: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-end', marginTop: 12, paddingVertical: 5 },
  deleteText: { color: colors.danger, fontSize: 13, fontWeight: '600' },
})
