'use client'

import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'
import { LoaderCircle, SendHorizontal } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

// Reply to one enquirer on one listing. Insert passes RLS WITH CHECK
// (auth.uid()=sender_id); the messages_notify_new trigger pushes the enquirer.
export function ReplyForm({ serviceId, enquirerId }: { serviceId: string; enquirerId: string }) {
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()

  async function send(event: FormEvent) {
    event.preventDefault()
    const content = text.trim()
    if (!content) return
    setSending(true)
    setError('')
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setSending(false)
      setError('Your session expired — please sign in again.')
      return
    }
    const { error: insertError } = await supabase.from('messages').insert({
      service_id: serviceId,
      sender_id: user.id,
      receiver_id: enquirerId,
      content,
    })
    setSending(false)
    if (insertError) {
      setError(insertError.message)
      return
    }
    setText('')
    router.refresh()
  }

  return (
    <form className="reply" onSubmit={send}>
      <textarea
        value={text}
        onChange={event => setText(event.target.value)}
        placeholder="Write a reply…"
        rows={2}
        aria-label="Reply message"
      />
      {error && <p className="form-error">{error}</p>}
      <button type="submit" disabled={sending || !text.trim()}>
        {sending ? <LoaderCircle className="spin" size={16} /> : <SendHorizontal size={16} />}
        Send reply
      </button>
    </form>
  )
}
