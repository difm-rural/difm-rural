import React, { useEffect, useRef, useState } from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import Icon from './Icon'
import { supabase } from '../lib/supabase'
import { colors } from '../theme/tokens'
import {
  acceptPropertySuggestion, dismissPropertySuggestion, loadPropertySuggestionState, propertySuggestion, propertySuggestionText,
} from '../../shared/propertyNetwork'

// After completed work (and its review), offer the requester one tap to add the
// provider to their property network for the matching area. Shows nothing when
// nothing maps, they are already linked there, or the member said "Not now".
export default function PropertyNetworkSuggestion({ providerId, providerName, work, onOpenNetwork }) {
  const [owner, setOwner] = useState(null)
  const [suggestion, setSuggestion] = useState(null)
  const [state, setState] = useState('idle')
  const lock = useRef(false)
  const { category, kind, title } = work || {}

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user || !providerId || user.id === providerId) return
        const { network, dismissals } = await loadPropertySuggestionState(supabase, user.id)
        if (!active) return
        setOwner(user.id)
        setSuggestion(propertySuggestion(network, dismissals, { category, kind, title, providerId }))
      } catch { /* the offer is optional; stay quiet */ }
    })()
    return () => { active = false }
  }, [providerId, category, kind, title])

  async function respond(accept) {
    if (lock.current || !suggestion) return
    lock.current = true
    setState('busy')
    try {
      if (accept) await acceptPropertySuggestion(supabase, suggestion)
      else await dismissPropertySuggestion(supabase, owner, suggestion)
      setState(accept ? 'added' : 'dismissed')
    } catch {
      setState('error')
    } finally {
      lock.current = false
    }
  }

  if (!suggestion || state === 'dismissed') return null
  const name = providerName || 'this provider'
  if (state === 'added') {
    return (
      <View style={styles.card} accessibilityLiveRegion="polite">
        <Text style={styles.title}>{name} is in your property network for {suggestion.areaLabel}.</Text>
        {onOpenNetwork && (
          <TouchableOpacity accessibilityRole="button" style={styles.link} onPress={() => onOpenNetwork(suggestion.area)}>
            <Text style={styles.linkText}>Open My Property Network</Text>
          </TouchableOpacity>
        )}
      </View>
    )
  }
  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <Icon name="people-outline" size={20} color={colors.primary} />
        <Text style={[styles.title, { flex: 1 }]}>{propertySuggestionText(name, suggestion)}</Text>
      </View>
      <Text style={styles.body}>They'll be listed for {suggestion.name.toLowerCase()} so you can find them again.</Text>
      {state === 'error' && <Text accessibilityRole="alert" style={styles.error}>Could not save. Try again.</Text>}
      <View style={styles.row}>
        <TouchableOpacity accessibilityRole="button" accessibilityState={{ disabled: state === 'busy' }} disabled={state === 'busy'}
          style={styles.primary} onPress={() => respond(true)}>
          <Text style={styles.primaryText}>Add {name.split(' ')[0]}</Text>
        </TouchableOpacity>
        <TouchableOpacity accessibilityRole="button" accessibilityState={{ disabled: state === 'busy' }} disabled={state === 'busy'}
          style={styles.secondary} onPress={() => respond(false)}>
          <Text style={styles.secondaryText}>Not now</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.primaryLight, borderRadius: 14, padding: 14, marginBottom: 12, gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  title: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  body: { color: colors.textSecondary, lineHeight: 20 },
  error: { color: colors.danger, fontWeight: '600' },
  primary: { minHeight: 44, paddingHorizontal: 16, borderRadius: 10, backgroundColor: colors.primary, justifyContent: 'center' },
  primaryText: { color: colors.white, fontWeight: '700' },
  secondary: { minHeight: 44, paddingHorizontal: 16, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white, justifyContent: 'center' },
  secondaryText: { color: colors.textPrimary, fontWeight: '600' },
  link: { minHeight: 44, justifyContent: 'center' },
  linkText: { color: colors.primary, fontWeight: '700' },
})
