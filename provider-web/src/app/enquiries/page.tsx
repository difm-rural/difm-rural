import { redirect } from 'next/navigation'
import { requireProvider } from '@/lib/auth'
import { conversationHref } from '@/lib/messaging'
export default async function EnquiriesRedirect({searchParams}:{searchParams:Promise<{s?:string;c?:string}>}){
  await requireProvider()
  const {s,c}=await searchParams
  redirect(s && c?conversationHref({kind:'listing',id:s,person:c}):'/messages')
}
