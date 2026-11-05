import { redirect } from 'next/navigation'
import { conversationHref, validConversation, type ConversationRef } from '@/lib/messaging'

// The Messages inbox is retired — every conversation now lives on its job,
// booking or listing page, with Activity as the hub. This route only redirects
// old links to the right place.
export default async function MessagesPage({searchParams}:{searchParams:Promise<{kind?:string;id?:string;person?:string}>}){
  const {kind,id,person}=await searchParams
  const ref={kind,id,person} as ConversationRef
  redirect(validConversation(ref)?conversationHref(ref):'/activity')
}
