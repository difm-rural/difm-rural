import type { SupabaseClient } from '@supabase/supabase-js'
import { PUBLIC_PROFILE_COLUMNS } from './profile-input'
export async function loadPublicProfile(client:SupabaseClient,id:string){
  return client.from('profiles_public').select(PUBLIC_PROFILE_COLUMNS).eq('id',id).maybeSingle()
}
export type PublicReview={id:string;reviewer_id:string;reviewee_role:string;rating:number;comment:string|null;created_at:string}
export async function allPublicReviews(client:SupabaseClient,id:string){
  const rows:PublicReview[]=[]
  for(let offset=0;;offset+=500){
    const {data,error}=await client.from('reviews').select('id,reviewer_id,reviewee_role,rating,comment,created_at').eq('reviewee_id',id).order('created_at',{ascending:false}).order('id',{ascending:false}).range(offset,offset+499)
    if(error)throw error
    rows.push(...(data || []));if(!data || data.length<500)return rows
  }
}
