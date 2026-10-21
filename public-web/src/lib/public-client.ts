import {createClient} from '@supabase/supabase-js'
export function publicClient(){
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  if(!url || !key)throw new Error('Public marketplace is not configured.')
  // Never attach a member session or use a service-role key on public pages.
  return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}})
}
