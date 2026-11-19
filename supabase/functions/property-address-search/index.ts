import {createClient} from 'npm:@supabase/supabase-js@2'
import {readBoundedBody} from '../_shared/primary-photo.ts'
import {refuseAssistantToken} from '../_shared/assistant-token.ts'
import {addressSearchParams,readAddressMatches} from './search.ts'

const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info',
 'Access-Control-Allow-Methods':'POST, OPTIONS','Cache-Control':'private, no-store'}
const answer=(status:number,data:object)=>Response.json(data,{status,headers})
Deno.serve(async request=>{
 if(request.method==='OPTIONS')return new Response(null,{headers})
 if(request.method!=='POST')return answer(405,{error:'Method unavailable'})
 const assistant=refuseAssistantToken(request,headers)
 if(assistant)return assistant
 try{
  const token=request.headers.get('Authorization')?.match(/^Bearer (.+)$/i)?.[1]
  if(!token)return answer(401,{error:'Sign in to search'})
  const client=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_ANON_KEY')!,{auth:{persistSession:false}})
  if(!(await client.auth.getUser(token)).data.user)return answer(401,{error:'Sign in to search'})
  const key=Deno.env.get('LINZ_LDS_API_KEY')
  if(!key)return answer(503,{error:'LINZ address search is not configured'})
  // Bound input before parsing and never log the address or credential.
  let body
  try{body=JSON.parse(new TextDecoder().decode(await readBoundedBody(request,1024)))}
  catch{return answer(400,{error:'Invalid address search'})}
  const params=addressSearchParams(body?.query)
  if(!params)return answer(400,{error:'Enter at least three address or locality characters'})
  const result=await fetch('https://data.linz.govt.nz/services;key='+encodeURIComponent(key)+'/wfs?'+params,{
   signal:AbortSignal.timeout(8000),
  })
  if(!result.ok)return answer(503,{error:'Address search unavailable'})
  return answer(200,{matches:readAddressMatches(await result.json())})
 }catch{return answer(503,{error:'Address search unavailable'})}
})
