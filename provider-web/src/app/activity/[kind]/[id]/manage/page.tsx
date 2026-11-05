import { redirect, notFound } from 'next/navigation'

// Jobs and bookings are now managed on their own workspaces (/jobs/[id] and
// /bookings/[id]). This route only redirects old links to them.
export default async function ManageArrangementPage({params}:{params:Promise<{kind:string;id:string}>}){
  const {kind,id}=await params
  if(kind==='job')redirect('/jobs/'+id+'#manage')
  if(kind==='booking')redirect('/bookings/'+id+'#manage')
  notFound()
}
