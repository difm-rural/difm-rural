import { createClient } from '@/lib/supabase/server'
import { validId } from '@/lib/job-input'

export async function GET(_:Request,{params}:{params:Promise<{id:string}>}) {
 const {id}=await params
 const headers={'Cache-Control':'private, no-store','Vary':'Cookie','X-Content-Type-Options':'nosniff'}
 if(!validId(id))return new Response(null,{status:404,headers})
 try{
  const client=await createClient()
  const {data:{session}}=await client.auth.getSession()
  const image=await fetch(process.env.NEXT_PUBLIC_SUPABASE_URL+'/functions/v1/job-primary-media?job='+id,{
   headers:{apikey:process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,...(session?{Authorization:'Bearer '+session.access_token}:{})},
   cache:'no-store',signal:AbortSignal.timeout(12000),
  })
  if(!image.ok || image.headers.get('content-type')!=='image/jpeg')return new Response(null,{status:404,headers})
  return new Response(image.body,{headers:{...headers,'Content-Type':'image/jpeg'}})
 }catch{return new Response(null,{status:503,headers})}
}
