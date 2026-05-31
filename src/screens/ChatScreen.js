import React, { useEffect, useRef, useState } from 'react'
import {
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as ImagePicker from 'expo-image-picker'
import { supabase } from '../lib/supabase'
import { colors } from '../theme/tokens'
import { GOOGLE_MAPS_API_KEY } from '../lib/constants'
import { getCurrentLocation, reverseGeocode } from '../lib/location'

function parseSpecialMessage(content) {
  try {
    const parsed = JSON.parse(content)
    if (parsed.type === 'location' || parsed.type === 'photo') return parsed
    return null
  } catch {
    return null
  }
}

function staticMapThumbUrl(lat, lng) {
  return `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=14&size=400x200&scale=2&markers=color:red|${lat},${lng}&key=${GOOGLE_MAPS_API_KEY}`
}

export default function ChatScreen({ route, navigation }) {
  const insets = useSafeAreaInsets()
  const { jobId, jobTitle, otherUserId, otherUserName } = route.params
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [currentUserId, setCurrentUserId] = useState(null)
  const [jobStatus, setJobStatus] = useState(null)
  const flatListRef = useRef(null)

  useEffect(() => {
    let channel

    async function setup() {
      const { data: { user } } = await supabase.auth.getUser()
      setCurrentUserId(user.id)

      const { data: jobData } = await supabase
        .from('jobs')
        .select('status')
        .eq('id', jobId)
        .single()
      setJobStatus(jobData?.status || null)

      const { data } = await supabase
        .from('messages')
        .select('*')
        .eq('job_id', jobId)
        .order('created_at', { ascending: true })

      setMessages(data || [])

      channel = supabase
        .channel(`chat-job-${jobId}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'messages', filter: `job_id=eq.${jobId}` },
          payload => {
            setMessages(prev => {
              if (prev.some(m => m.id === payload.new.id)) return prev
              return [...prev, payload.new]
            })
          }
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'jobs', filter: `id=eq.${jobId}` },
          payload => { setJobStatus(payload.new?.status || null) }
        )
        .subscribe()
    }

    setup()

    return () => {
      if (channel) supabase.removeChannel(channel)
    }
  }, [jobId])

  async function sendMessage() {
    const content = text.trim()
    if (!content) return

    const { data: latestJob } = await supabase
      .from('jobs')
      .select('status')
      .eq('id', jobId)
      .single()

    if (latestJob?.status === 'completed') {
      setJobStatus('completed')
      Alert.alert('Chat closed', 'This job has been marked complete, so chat is now read-only.')
      return
    }

    setText('')

    const { data, error } = await supabase
      .from('messages')
      .insert({ job_id: jobId, sender_id: currentUserId, receiver_id: otherUserId, content })
      .select()
      .single()

    if (error) {
      Alert.alert('Something went wrong', error.message || 'Please try again', [{ text: 'OK' }])
      setText(content)
      return
    }

    if (data) {
      setMessages(prev => {
        if (prev.some(m => m.id === data.id)) return prev
        return [...prev, data]
      })
    }
  }

  const isChatClosed = jobStatus === 'completed'

  async function sendLocationMessage() {
    const coords = await getCurrentLocation()
    if (!coords) {
      Alert.alert('Location unavailable', 'Please enable location permissions in Settings.')
      return
    }
    const content = JSON.stringify({
      type: 'location',
      latitude:  coords.latitude,
      longitude: coords.longitude,
      text: '📍 Shared location',
    })
    await supabase
      .from('messages')
      .insert({ job_id: jobId, sender_id: currentUserId, receiver_id: otherUserId, content })
  }

  async function sendProgressPhoto() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync()
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow camera access to take photos.')
      return
    }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.7 })
    if (result.canceled) return

    const coords  = await getCurrentLocation()
    const uri     = result.assets[0].uri
    const path    = `${jobId}/progress_${Date.now()}.jpg`

    let photoUrl = ''
    try {
      const ab = await (await fetch(uri)).arrayBuffer()
      const { data: uploaded, error: upErr } = await supabase.storage
        .from('job-photos').upload(path, ab, { contentType: 'image/jpeg', upsert: false })
      if (!upErr && uploaded) {
        const { data: { publicUrl } } = supabase.storage.from('job-photos').getPublicUrl(path)
        photoUrl = publicUrl
      }
    } catch { /* upload failed — still send with empty url */ }

    let caption = '📷 Progress photo'
    if (coords) {
      const addr = await reverseGeocode(coords.latitude, coords.longitude)
      caption = `📍 Taken at ${addr}`

      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        await supabase.from('job_checkins').insert({
          job_id:       jobId,
          user_id:      user.id,
          latitude:     coords.latitude,
          longitude:    coords.longitude,
          checkin_type: 'progress_photo',
          photo_url:    photoUrl || null,
        })
      }
    }

    const content = JSON.stringify({ type: 'photo', url: photoUrl || uri, caption })
    await supabase
      .from('messages')
      .insert({ job_id: jobId, sender_id: currentUserId, receiver_id: otherUserId, content })
  }

  function renderMessage({ item }) {
    const isMine   = item.sender_id === currentUserId
    const special  = parseSpecialMessage(item.content)
    const ts = new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

    if (special?.type === 'location') {
      return (
        <View style={[styles.bubbleWrapper, isMine ? styles.myWrapper : styles.theirWrapper]}>
          <TouchableOpacity
            style={[styles.bubble, styles.mapBubble, isMine ? styles.myBubble : styles.theirBubble]}
            onPress={() => navigation.navigate('JobMap', {
              job: {
                latitude:      special.latitude,
                longitude:     special.longitude,
                title:         'Shared location',
                location_name: 'Shared location',
                location_note: null,
                area_polygon:  null,
                area_hectares: null,
              },
              requesterName: otherUserName,
              viewOnly: true,
            })}
            activeOpacity={0.85}>
            <Image
              source={{ uri: staticMapThumbUrl(special.latitude, special.longitude) }}
              style={styles.mapThumbImg}
              resizeMode="cover"
            />
            <View style={styles.mapBubbleFooter}>
              <Text style={[styles.bubbleText, isMine ? styles.myText : styles.theirText]}>
                {special.text}
              </Text>
              <Text style={[styles.timestamp, isMine ? styles.myTimestamp : styles.theirTimestamp]}>
                {ts}
              </Text>
            </View>
          </TouchableOpacity>
        </View>
      )
    }

    if (special?.type === 'photo') {
      return (
        <View style={[styles.bubbleWrapper, isMine ? styles.myWrapper : styles.theirWrapper]}>
          <View style={[styles.bubble, styles.photoBubble, isMine ? styles.myBubble : styles.theirBubble]}>
            {special.url ? (
              <Image source={{ uri: special.url }} style={styles.photoMsgImg} resizeMode="cover" />
            ) : null}
            <View style={styles.mapBubbleFooter}>
              <Text style={[styles.bubbleText, { fontSize: 12 }, isMine ? styles.myText : styles.theirText]} numberOfLines={2}>
                {special.caption}
              </Text>
              <Text style={[styles.timestamp, isMine ? styles.myTimestamp : styles.theirTimestamp]}>
                {ts}
              </Text>
            </View>
          </View>
        </View>
      )
    }

    return (
      <View style={[styles.bubbleWrapper, isMine ? styles.myWrapper : styles.theirWrapper]}>
        <View style={[styles.bubble, isMine ? styles.myBubble : styles.theirBubble]}>
          <Text style={[styles.bubbleText, isMine ? styles.myText : styles.theirText]}>
            {item.content}
          </Text>
          <Text style={[styles.timestamp, isMine ? styles.myTimestamp : styles.theirTimestamp]}>
            {ts}
          </Text>
        </View>
      </View>
    )
  }

  return (
    <View style={styles.screen}>

      {/* ── Header ───────────────────────────────────────────────── */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Go back">
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.kicker}>Chat</Text>
        <Text style={styles.headerName} accessibilityRole="header">{otherUserName}</Text>
        <Text style={styles.headerJob} numberOfLines={1}>{jobTitle}</Text>
      </View>

      {/* ── Message list + input, avoid keyboard ─────────────────── */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}>

        <FlatList
          ref={flatListRef}
          style={{ flex: 1 }}
          data={[...messages].reverse()}
          renderItem={renderMessage}
          keyExtractor={item => item.id}
          inverted
          contentContainerStyle={styles.messageList}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={[styles.empty, { transform: [{ scaleY: -1 }] }]}>
              <Text style={styles.emptyTitle}>No messages yet</Text>
              <Text style={styles.emptyBody}>
                {isChatClosed
                  ? 'No messages were sent before this job was completed.'
                  : 'Send a message to get started'}
              </Text>
            </View>
          }
        />

        {/* ── Input bar or closed notice ──────────────────────────── */}
        {isChatClosed ? (
          <View style={[styles.closedBox, { paddingBottom: insets.bottom + 12 }]}>
            <Text style={styles.closedTitle}>Chat closed</Text>
            <Text style={styles.closedText}>
              This job has been marked complete. Messages are now read-only.
            </Text>
          </View>
        ) : (
          <View style={[styles.inputBar, { paddingBottom: insets.bottom + 10 }]}>
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={sendLocationMessage}
              accessibilityRole="button"
              accessibilityLabel="Share location">
              <Text style={styles.iconBtnText}>📍</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={sendProgressPhoto}
              accessibilityRole="button"
              accessibilityLabel="Send progress photo">
              <Text style={styles.iconBtnText}>📷</Text>
            </TouchableOpacity>
            <TextInput
              style={styles.input}
              placeholder="Type a message..."
              placeholderTextColor={colors.textMuted}
              value={text}
              onChangeText={setText}
              multiline
              maxLength={1000}
              autoCorrect
              autoCapitalize="sentences"
              accessibilityLabel="Message input"
            />
            <TouchableOpacity
              style={[styles.sendButton, !text.trim() && styles.sendButtonDisabled]}
              onPress={sendMessage}
              disabled={!text.trim()}
              accessibilityRole="button"
              accessibilityLabel="Send message"
              accessibilityHint="Double tap to send your message">
              <Text style={styles.sendText}>Send</Text>
            </TouchableOpacity>
          </View>
        )}

      </KeyboardAvoidingView>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },

  // ─── Header ────────────────────────────────────────────────────────
  header: {
    backgroundColor: colors.background,
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: { minHeight: 36, justifyContent: 'center', alignSelf: 'flex-start', marginBottom: 12 },
  backText:   { color: colors.primary, fontSize: 15, fontWeight: '600' },
  kicker:     { fontSize: 13, fontWeight: '700', color: colors.primary, marginBottom: 8 },
  headerName: { fontSize: 34, lineHeight: 38, fontWeight: '700', color: colors.textPrimary },
  headerJob:  { fontSize: 15, lineHeight: 22, color: colors.textSecondary, marginTop: 8 },

  // ─── Message list ──────────────────────────────────────────────────
  messageList: { padding: 16, flexGrow: 1 },

  // ─── Bubbles ───────────────────────────────────────────────────────
  bubbleWrapper: { marginBottom: 10, flexDirection: 'row' },
  myWrapper:     { justifyContent: 'flex-end' },
  theirWrapper:  { justifyContent: 'flex-start' },

  bubble: {
    maxWidth: '75%',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  myBubble: {
    backgroundColor: colors.primary,
    borderBottomRightRadius: 4,
  },
  theirBubble: {
    backgroundColor: colors.white,
    borderBottomLeftRadius: 4,
    borderWidth: 0.5,
    borderColor: colors.border,
  },

  bubbleText:    { fontSize: 15, lineHeight: 22 },
  myText:        { color: colors.white },
  theirText:     { color: colors.textPrimary },
  timestamp:     { fontSize: 12, marginTop: 4 },
  myTimestamp:   { color: 'rgba(255,255,255,0.65)', textAlign: 'right' },
  theirTimestamp: { color: colors.textMuted },

  // ─── Empty state ───────────────────────────────────────────────────
  empty:      { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: colors.textPrimary, marginBottom: 8, textAlign: 'center' },
  emptyBody:  { fontSize: 14, color: colors.textMuted, textAlign: 'center', lineHeight: 21 },

  // ─── Input bar ─────────────────────────────────────────────────────
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    backgroundColor: colors.white,
    borderTopWidth: 0.5,
    borderTopColor: '#e0e0e0',
    paddingHorizontal: 10,
    paddingTop: 10,
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-end',
    marginBottom: 2,
    flexShrink: 0,
  },
  iconBtnText: { fontSize: 18, lineHeight: 22 },
  input: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    maxHeight: 100,
    color: colors.textPrimary,
  },
  sendButton: {
    backgroundColor: colors.primary,
    borderRadius: 22,
    paddingHorizontal: 18,
    paddingVertical: 10,
    minHeight: 44,
    justifyContent: 'center',
    alignSelf: 'flex-end',
  },
  sendButtonDisabled: { backgroundColor: '#b0c4bb' },
  sendText: { color: colors.white, fontWeight: '700', fontSize: 15 },

  // ─── Special message bubbles ────────────────────────────────────────
  mapBubble:     { padding: 0, overflow: 'hidden', width: 220 },
  photoBubble:   { padding: 0, overflow: 'hidden', width: 220 },
  mapThumbImg:   { width: 220, height: 130 },
  photoMsgImg:   { width: 220, height: 160 },
  mapBubbleFooter: { paddingHorizontal: 10, paddingVertical: 8 },

  // ─── Closed chat notice ────────────────────────────────────────────
  closedBox: {
    backgroundColor: colors.primaryLight,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  closedTitle: { color: colors.primary, fontSize: 15, fontWeight: '700', marginBottom: 4 },
  closedText:  { color: colors.textSecondary, fontSize: 14, lineHeight: 20 },
})
