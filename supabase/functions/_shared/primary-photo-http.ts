import { createClient } from 'npm:@supabase/supabase-js@2'
import { decode } from 'npm:jpeg-js@0.4.4'
import { readPhoto } from './primary-photo.ts'

export async function verifiedPhoto(request: Request) {
  const image=await readPhoto(request)
  decode(image,{useTArray:true,tolerantDecoding:false,maxResolutionInMP:1.05,maxMemoryUsageInMB:32})
  return image
}

export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, x-draft-id, x-cleanup-secret, x-job-photo-note',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Cache-Control': 'private, no-store',
}
export function answer(status: number, body: object) { return Response.json(body, { status, headers: cors }) }
export const uuid = (id: unknown): id is string => typeof id==='string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)
export function photoClients(budget?: AbortSignal) {
  const url = Deno.env.get('SUPABASE_URL')!
  const key = (Deno.env.get('SB_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY'))!
  const service = Deno.env.get('SB_SECRET_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const auth = { persistSession: false, autoRefreshToken: false }
  const boundedFetch: typeof fetch = (input, init) => fetch(input, {
    ...init, signal: AbortSignal.any([AbortSignal.timeout(20000), ...[init?.signal,budget].filter((signal): signal is AbortSignal=>!!signal)]),
  })
  const options = { auth, global: { fetch: boundedFetch } }
  return { authClient: createClient(url,key,options), serviceClient: createClient(url,service,options) }
}
