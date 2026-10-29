import React, { useState } from 'react'
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Icon from './Icon'
import { colors } from '../theme/tokens'
import { NEARBY_RADII } from '../lib/nearbyBrowsing'

export default function NearbyControls({ nearby, unlocated = 0 }) {
  const insets = useSafeAreaInsets()
  const [open, setOpen] = useState(false), [query, setQuery] = useState(''), [suggestions, setSuggestions] = useState([]), [searching, setSearching] = useState(false), [searchError, setSearchError] = useState('')
  const busy = nearby.busy || searching
  const title = nearby.radius === null ? 'All New Zealand' : nearby.point ? `Within ${nearby.radius} km · ${nearby.label}` : 'Near you · choose your location'
  async function findTowns() {
    if (busy) return
    setSearching(true); setSearchError(''); setSuggestions([])
    try {
      const results = await nearby.findTowns(query)
      setSuggestions(results)
      if (!results.length) setSearchError('No matching towns found. Try a nearby town or suburb.')
    } catch (e) { setSearchError(e.message || 'Could not find towns. Check your connection and try again.') }
    finally { setSearching(false) }
  }
  return <View style={styles.wrapper}>
    <TouchableOpacity style={styles.summary} onPress={() => { setSearchError(''); nearby.clearError(); setOpen(true) }} accessibilityRole="button" accessibilityLabel={`Location and distance: ${title}. Change location or distance.`}>
      <Icon name="location-outline" size={18} color={colors.primary} /><Text style={styles.summaryText} numberOfLines={2}>{title}</Text><Text style={styles.change}>Change</Text>
    </TouchableOpacity>
    {!nearby.point && nearby.radius !== null && <Text style={styles.hint}>Choose a location to see nearby results. Until then, showing all New Zealand.</Text>}
    {nearby.point && nearby.radius !== null && unlocated > 0 && <Text style={styles.hint}>Items whose public location cannot be found are included under All New Zealand.</Text>}
    {!!nearby.error && !open && <Text style={styles.error} accessibilityRole="alert">{nearby.error}</Text>}
    <Modal visible={open} transparent animationType="slide" onRequestClose={() => { if (!busy) setOpen(false) }}>
      <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}><View style={[styles.sheet, { paddingBottom: Math.max(20, insets.bottom) }]}>
        <View style={styles.heading}><Text style={styles.title}>Location & distance</Text><TouchableOpacity disabled={busy} hitSlop={10} onPress={() => setOpen(false)} accessibilityRole="button" accessibilityLabel="Close location and distance"><Icon name="close" size={24} color={colors.primary}/></TouchableOpacity></View>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
          <Text style={styles.hint}>Choose where to browse. This does not change your profile. Browsing choices are remembered for six hours.</Text>
          <TouchableOpacity style={styles.action} disabled={busy} onPress={async () => { if (await nearby.useCurrentLocation()) setOpen(false) }} accessibilityRole="button"><Icon name="locate-outline" size={18} color={colors.primary}/><Text style={styles.actionText}>Use my location</Text></TouchableOpacity>
          <Text style={styles.label}>Or choose a town or suburb</Text><View style={styles.searchRow}><TextInput style={styles.input} value={query} onChangeText={value => { setQuery(value); setSuggestions([]) }} maxLength={120} placeholder="e.g. Cambridge" accessibilityLabel="Town or suburb in New Zealand" editable={!busy} onSubmitEditing={findTowns} returnKeyType="search"/><TouchableOpacity style={styles.find} onPress={findTowns} disabled={busy} accessibilityRole="button"><Text style={styles.actionText}>Find</Text></TouchableOpacity></View>
          {suggestions.map(suggestion => <TouchableOpacity key={suggestion.place_id} style={styles.result} disabled={busy} onPress={async () => { if (await nearby.chooseTown(suggestion)) { setSuggestions([]); setOpen(false) } }} accessibilityRole="button"><Text style={styles.resultText}>{suggestion.description}</Text></TouchableOpacity>)}
          {!!searchError && <Text style={styles.error} accessibilityRole="alert">{searchError}</Text>}
          <Text style={styles.label}>Distance</Text><View style={styles.radii}>{[...NEARBY_RADII, null].map(radius => <TouchableOpacity key={radius ?? 'all'} style={[styles.radius, nearby.radius === radius && styles.selected]} disabled={busy} onPress={async () => { if (await nearby.setRadius(radius)) setOpen(false) }} accessibilityRole="button" accessibilityState={{ selected: nearby.radius === radius }}><Text style={[styles.radiusText, nearby.radius === radius && styles.selectedText]}>{radius === null ? 'All New Zealand' : `${radius} km`}</Text></TouchableOpacity>)}</View>
          {nearby.point && <TouchableOpacity style={styles.action} disabled={busy} onPress={async () => { if (await nearby.clearLocation()) setOpen(false) }} accessibilityRole="button"><Text style={styles.actionText}>Clear browsing location</Text></TouchableOpacity>}
          {busy && <ActivityIndicator color={colors.primary} accessibilityLabel="Updating browsing location"/>}
          {!!nearby.error && <Text style={styles.error} accessibilityRole="alert">{nearby.error}</Text>}
          <Text style={styles.hint}>Distances are approximate. Jobs with private pins use their public town area; exact locations stay hidden. Choose All New Zealand to include items without a usable public location.</Text>
        </ScrollView>
      </View></KeyboardAvoidingView>
    </Modal>
  </View>
}
const styles = StyleSheet.create({
  wrapper: { marginHorizontal: 16, marginVertical: 10 }, summary: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 10, backgroundColor: '#e8f1eb', minHeight: 46 }, summaryText: { flex: 1, color: colors.primary, fontSize: 13, fontWeight: '600' }, change: { color: colors.primary, fontSize: 12, fontWeight: '700' }, hint: { color: colors.textSecondary, fontSize: 12, lineHeight: 18, marginTop: 7 }, error: { color: colors.danger, fontSize: 13, lineHeight: 19, marginTop: 8 }, backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }, sheet: { backgroundColor: colors.white, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '88%' }, heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }, title: { fontSize: 20, fontWeight: '700', color: colors.textPrimary }, content: { paddingBottom: 12 }, action: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 14, minHeight: 48 }, actionText: { color: colors.primary, fontWeight: '600', fontSize: 14 }, label: { color: colors.textPrimary, fontSize: 14, fontWeight: '600', marginTop: 18, marginBottom: 10 }, searchRow: { flexDirection: 'row', gap: 8 }, input: { flex: 1, minWidth: 0, borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 12, color: colors.textPrimary }, find: { justifyContent: 'center', paddingHorizontal: 16, backgroundColor: colors.primaryLight, borderRadius: 8 }, result: { paddingVertical: 14, borderBottomWidth: 1, borderColor: colors.border }, resultText: { color: colors.textPrimary, fontSize: 14, lineHeight: 20 }, radii: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, radius: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingVertical: 12, paddingHorizontal: 16 }, selected: { backgroundColor: colors.primary, borderColor: colors.primary }, radiusText: { color: colors.textSecondary, fontSize: 13 }, selectedText: { color: colors.white, fontWeight: '600' },
})
