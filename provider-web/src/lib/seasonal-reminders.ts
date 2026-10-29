import type {SupabaseClient} from '@supabase/supabase-js'
export type SeasonalCampaign={id:string;title:string;body:string;category:string|null;capability:string|null;primary_action:string}
export const SEASONAL_ACTIONS:Record<string,{label:string;href:string}>={
  post_job:{label:'Post a job',href:'/jobs/new'},
  browse_services:{label:'Browse listings',href:'/browse'},
  manage_profile:{label:'Update profile',href:'/account/profile'},
}
export async function loadSeasonalReminders(client:SupabaseClient):Promise<SeasonalCampaign[]>{
  try{
    const {data,error}=await client.rpc('get_my_seasonal_campaigns')
    return error?[]:data || []
  }catch{return []}
}
export async function recordSeasonalEvent(client:SupabaseClient,id:string,event:'impression'|'action'|'dismiss'){
  try{
    const {error}=await client.rpc('record_seasonal_campaign_event',{p_campaign_id:id,p_event:event})
    return !error
  }catch{return false}
}
