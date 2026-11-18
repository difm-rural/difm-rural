import React, { useCallback, useState } from 'react'
import { Alert, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '../lib/supabase'
import { CONSENT_SUMMARY, connectedAssistants, connectedSince } from '../../shared/connectedAssistants'
import { colors } from '../theme/tokens'
import Icon from '../components/Icon'
import Loading from '../components/Loading'
import EmptyState from '../components/EmptyState'

// Account → Connected assistants: AI assistants the member allowed through the
// Supabase OAuth server (the rc-mcp connector). Disconnect revokes the grant,
// which ends the assistant's sessions; rc-mcp then refuses its tokens.
export default function ConnectedAssistantsScreen({ navigation }) {
  const insets = useSafeAreaInsets()
  const [items, setItems] = useState([])
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(null)

  useFocusEffect(useCallback(() => { load() }, []))

  async function load() {
    try {
      const [grants, state] = await Promise.all([
        supabase.auth.oauth.listGrants(),
        supabase.rpc('ai_connector_status'),
      ])
      if (grants.error) throw grants.error
      setItems(connectedAssistants(grants.data))
      setStatus(state.error ? null : state.data)
    } catch (error) {
      Alert.alert('Could not load connected assistants', error.message)
    } finally {
      setLoading(false)
    }
  }

  function disconnect(item) {
    Alert.alert(`Disconnect ${item.name}?`, 'It will no longer be able to search Rural Connections or read your activity.', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Disconnect', style: 'destructive', onPress: async () => {
          setBusy(item.clientId)
          try {
            const { error } = await supabase.auth.oauth.revokeGrant({ clientId: item.clientId })
            if (error) throw error
            setItems(current => current.filter(row => row.clientId !== item.clientId))
          } catch (error) {
            Alert.alert('Could not disconnect this assistant', error.message)
          } finally {
            setBusy(null)
          }
        },
      },
    ])
  }

  function renderItem({ item }) {
    return (
      <View style={styles.card}>
        <View style={styles.iconWrap}><Icon name="sparkles-outline" size={20} color={colors.primary} /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>{item.name}</Text>
          <Text style={styles.description}>{connectedSince(item.connectedAt)}{item.website ? ` · ${item.website}` : ''}</Text>
        </View>
        <TouchableOpacity
          style={styles.disconnect}
          disabled={busy === item.clientId}
          onPress={() => disconnect(item)}
          accessibilityRole="button"
          accessibilityLabel={`Disconnect ${item.name}`}>
          <Text style={styles.disconnectText}>{busy === item.clientId ? 'Disconnecting…' : 'Disconnect'}</Text>
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
        <Text style={styles.kicker}>Account</Text>
        <Text style={styles.title}>Connected assistants</Text>
        <Text style={styles.subtitle}>AI assistants you’ve allowed to {CONSENT_SUMMARY}. They can’t post, offer, book or send messages, and never see exact addresses.</Text>
        {status?.paused && <Text style={styles.notice}>Rural Connections has paused assistant access for your account.</Text>}
        {status && status.ai_enabled === false && <Text style={styles.notice}>Assistant access is turned off for everyone at the moment.</Text>}
      </View>
      {loading ? <Loading label="Loading connected assistants…" /> : (
        <FlatList
          data={items}
          renderItem={renderItem}
          keyExtractor={item => item.clientId}
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}
          ListEmptyComponent={
            <EmptyState
              panel
              icon="sparkles-outline"
              title="No assistants connected"
              body="Add Rural Connections as a connector in your AI assistant. You’ll be asked to allow it."
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
  notice: { color: colors.textSecondary, fontSize: 13, lineHeight: 18, marginTop: 10, backgroundColor: colors.warningLight, borderRadius: 8, padding: 9 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 14, marginBottom: 12 },
  iconWrap: { width: 38, height: 38, borderRadius: 10, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  name: { color: colors.textPrimary, fontSize: 16, fontWeight: '700', marginBottom: 3 },
  description: { color: colors.textSecondary, fontSize: 13, lineHeight: 18 },
  disconnect: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 9 },
  disconnectText: { color: colors.danger, fontSize: 13, fontWeight: '700' },
})
