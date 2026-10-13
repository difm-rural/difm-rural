import React, { useCallback, useRef, useState } from 'react'
import { FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors } from '../theme/tokens'
import { fetchMessageThreads } from '../lib/messageThreads'
import EmptyState from '../components/EmptyState'
import Loading from '../components/Loading'
import Icon from '../components/Icon'

export default function MessagesScreen({ navigation }) {
  const insets = useSafeAreaInsets()
  const [threads, setThreads] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState(false)
  const loadingRef = useRef(false)

  const load = useCallback(async () => {
    if (loadingRef.current) return
    loadingRef.current = true
    try {
      const rows = await fetchMessageThreads()
      setThreads(rows)
      setError(false)
    } catch {
      setError(true)
    } finally {
      loadingRef.current = false
      setLoading(false)
      setRefreshing(false)
    }
  }, [])
  useFocusEffect(useCallback(() => { load() }, [load]))
  const refresh = () => { if (!loadingRef.current) { setRefreshing(true); load() } }

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity style={styles.back} onPress={() => navigation.goBack()}
          accessibilityRole="button" accessibilityLabel="Back to Activity">
          <Icon name="chevron-back" size={18} color={colors.primary} />
          <Text style={styles.backText}>Activity</Text>
        </TouchableOpacity>
        <Text style={styles.title} accessibilityRole="header">Messages</Text>
        <Text style={styles.subtitle}>Your jobs, bookings and listing enquiries</Text>
      </View>
      <FlatList
        data={loading || error ? [] : threads}
        keyExtractor={thread => thread.key}
        alwaysBounceVertical
        contentContainerStyle={{ flexGrow: 1, padding: 20, paddingBottom: insets.bottom + 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />}
        ListEmptyComponent={loading ? <Loading /> : error ? (
          <EmptyState icon="cloud-offline-outline" title="Couldn't load messages"
            body="Check your connection and try again." actionLabel="Retry" onAction={refresh} />
        ) : (
          <EmptyState icon="chatbubbles-outline" title="No conversations yet"
            body="Messages you send or receive about jobs, bookings and listings will appear here." />
        )}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.row} onPress={() => navigation.navigate('Chat', item.chatParams)}
            accessibilityRole="button" accessibilityLabel={`${item.otherUserName}, ${item.title}, ${item.preview}`}>
            <Text style={styles.kind}>{item.subjectLabel}</Text>
            <Text style={styles.name}>{item.otherUserName}</Text>
            <Text style={styles.subject} numberOfLines={2}>{item.title}</Text>
            <Text style={styles.preview} numberOfLines={2}>{item.preview}</Text>
          </TouchableOpacity>
        )}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
  back: { flexDirection: 'row', alignItems: 'center', minHeight: 44, alignSelf: 'flex-start' },
  backText: { color: colors.primary, fontSize: 15, fontWeight: '600' },
  title: { fontSize: 26, fontWeight: '700', color: colors.textPrimary },
  subtitle: { fontSize: 14, color: colors.textSecondary, marginTop: 6 },
  row: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 16, marginBottom: 12 },
  kind: { fontSize: 12, color: colors.textSecondary, marginBottom: 4 },
  name: { fontSize: 17, fontWeight: '700', color: colors.textPrimary },
  subject: { fontSize: 15, color: colors.textPrimary, marginTop: 4 },
  preview: { fontSize: 14, color: colors.textSecondary, marginTop: 6, lineHeight: 20 },
})
