import React, { useEffect, useRef, useState } from 'react'
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { supabase } from '../lib/supabase'
import { colors } from '../theme/tokens'

export default function ChatScreen({ route, navigation }) {
  const { jobId, jobTitle, otherUserId, otherUserName } = route.params
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [currentUserId, setCurrentUserId] = useState(null)
  const flatListRef = useRef(null)

  useEffect(() => {
    let channel

    async function setup() {
      const { data: { user } } = await supabase.auth.getUser()
      setCurrentUserId(user.id)

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
    setText('')

    const { data } = await supabase
      .from('messages')
      .insert({ job_id: jobId, sender_id: currentUserId, receiver_id: otherUserId, content })
      .select()
      .single()

    if (data) {
      setMessages(prev => {
        if (prev.some(m => m.id === data.id)) return prev
        return [...prev, data]
      })
    }
  }

  function renderMessage({ item }) {
    const isMine = item.sender_id === currentUserId
    return (
      <View style={[styles.bubbleWrapper, isMine ? styles.myWrapper : styles.theirWrapper]}>
        <View style={[styles.bubble, isMine ? styles.myBubble : styles.theirBubble]}>
          <Text style={[styles.bubbleText, isMine ? styles.myText : styles.theirText]}>
            {item.content}
          </Text>
          <Text style={[styles.timestamp, isMine ? styles.myTimestamp : styles.theirTimestamp]}>
            {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </View>
      </View>
    )
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}>

      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Go back">
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={styles.headerName}>{otherUserName}</Text>
          <Text style={styles.headerJob} numberOfLines={1}>{jobTitle}</Text>
        </View>
      </View>

      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.messageList}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No messages yet. Say hello!</Text>
          </View>
        }
      />

      <SafeAreaView edges={['bottom']} style={styles.inputSafeArea}>
        <View style={styles.inputRow}>
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
            onSubmitEditing={sendMessage}
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
      </SafeAreaView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingTop: 55,
    paddingBottom: 14,
    paddingHorizontal: 16,
    gap: 12,
  },
  backButton: { paddingRight: 4, minHeight: 44, justifyContent: 'center' },
  backText: { color: colors.white, fontSize: 16, fontWeight: '600' },
  headerInfo: { flex: 1 },
  headerName: { color: colors.white, fontSize: 17, fontWeight: 'bold' },
  headerJob: { color: colors.primaryMuted, fontSize: 13, marginTop: 1 },
  messageList: { padding: 16, paddingBottom: 8, flexGrow: 1 },
  bubbleWrapper: { marginBottom: 10, flexDirection: 'row' },
  myWrapper: { justifyContent: 'flex-end' },
  theirWrapper: { justifyContent: 'flex-start' },
  bubble: { maxWidth: '75%', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10 },
  myBubble: { backgroundColor: colors.primary, borderBottomRightRadius: 4 },
  theirBubble: { backgroundColor: colors.white, borderBottomLeftRadius: 4, elevation: 1 },
  bubbleText: { fontSize: 15, lineHeight: 22 },
  myText: { color: colors.white },
  theirText: { color: colors.textPrimary },
  timestamp: { fontSize: 13, marginTop: 4 },
  myTimestamp: { color: colors.primaryMuted, textAlign: 'right' },
  theirTimestamp: { color: colors.textMuted },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60 },
  emptyText: { color: colors.textMuted, fontSize: 15 },
  inputSafeArea: {
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 12,
    paddingBottom: 16,
    backgroundColor: colors.white,
    gap: 10,
  },
  input: {
    flex: 1,
    backgroundColor: colors.background,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sendButton: {
    backgroundColor: colors.primary,
    borderRadius: 22,
    paddingHorizontal: 20,
    paddingVertical: 10,
    minHeight: 44,
    justifyContent: 'center',
  },
  sendButtonDisabled: { backgroundColor: '#b0c4bb' },
  sendText: { color: colors.white, fontWeight: 'bold', fontSize: 15 },
})
