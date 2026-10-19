import { redirect, notFound } from 'next/navigation'
import { requireProvider } from '@/lib/auth'
import { loadActivityWork } from '@/lib/activity-data'
import { workRole } from '@/lib/activity-policy'
import { conversationHref } from '@/lib/messaging'
export default async function ConversationRedirect({params}:{params:Promise<{kind:string;id:string}>}){
  const {supabase,user}=await requireProvider();const {kind,id}=await params
  if(kind!=='job' && kind!=='booking')notFound()
  const work=await loadActivityWork(supabase,kind,id)
  if(!work || !workRole(work,user.id))notFound()
  const person=work.requesterId===user.id?work.providerId:work.requesterId
  if(!person)redirect('/activity')
  redirect(conversationHref({kind,id,person}))
}
