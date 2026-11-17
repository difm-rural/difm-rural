import { answer, cors, photoClients, uuid, verifiedPhoto } from '../_shared/primary-photo-http.ts'
import { readBoundedBody } from '../_shared/primary-photo.ts'

const bucket = 'job-primary-media'

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response(null,{headers:cors})
  try {
    const cleanupBudget = request.method === 'DELETE' ? AbortSignal.timeout(45000) : undefined
    const {authClient,serviceClient} = photoClients(cleanupBudget)
    const storage = serviceClient.storage.from(bucket)
    if (request.method === 'DELETE') {
      const secret = Deno.env.get('JOB_MEDIA_CLEANUP_SECRET')
      if (!secret || request.headers.get('x-cleanup-secret') !== secret) return answer(401,{error:'unauthorised'})
      let claimed = 0, removed = 0, failed = 0
      while (claimed < 25 && !cleanupBudget?.aborted) {
        const {data,error} = await serviceClient.rpc('claim_job_media_cleanup')
        if (error) { failed++; break }
        const row = data?.[0]
        if (!row) break
        claimed++
        // A claimed key cannot be attached or reused. Storage deletion may
        // outlive its caller, while only the current lease can commit results.
        const {error:removeError} = await storage.remove([row.object_key])
        if (removeError) { failed++; continue }
        const {data:finished,error:finishError} = await serviceClient.rpc('finish_job_media_cleanup',{p_key:row.object_key,p_lease:row.lease_token})
        if (finishError || finished!==true) failed++
        else removed++
      }
      const diagnostics = {claimed,removed,failed,timed_out:cleanupBudget?.aborted ?? false}
      console.info('job_media_cleanup',diagnostics)
      return answer(failed || diagnostics.timed_out ? 503 : 200,diagnostics)
    }
    const auth = request.headers.get('authorization')
    const token = auth?.match(/^Bearer (.+)$/i)?.[1]
    const user = token ? (await authClient.auth.getUser(token)).data.user : null
    if (auth && !user) return answer(401,{error:'unauthorised'})
    if (request.method === 'GET') {
      const job = new URL(request.url).searchParams.get('job')
      if (!uuid(job)) return answer(404,{error:'not_found'})
      const {data:key,error} = await serviceClient.rpc('read_job_primary_media',{p_job:job,p_viewer:user?.id ?? null})
      if (error) return answer(503,{error:'unavailable'})
      if (!key) return answer(404,{error:'not_found'})
      const {data:blob,error:readError} = await storage.download(key)
      if (readError || !blob) return answer(404,{error:'not_found'})
      const {data:current} = await serviceClient.rpc('read_job_primary_media',{p_job:job,p_viewer:user?.id ?? null})
      if (current!==key) return answer(404,{error:'not_found'})
      return new Response(blob,{headers:{...cors,'Content-Type':'image/jpeg','X-Content-Type-Options':'nosniff'}})
    }
    if (request.method !== 'POST') return answer(405,{error:'method_not_allowed'})
    if (!user) return answer(401,{error:'unauthorised'})
    if (Deno.env.get('PHOTO_TO_JOB_ENABLED') !== 'true') return answer(503,{error:'disabled'})
    const action = new URL(request.url).searchParams.get('action')
    if (action === 'publish') {
      let body
      try { body = JSON.parse(new TextDecoder().decode(await readBoundedBody(request,65536))) }
      catch { return answer(400,{error:'invalid_job'}) }
      if (!body || !uuid(body.draftId) || typeof body.checksum!=='string' || !/^[0-9a-f]{64}$/.test(body.checksum) ||
          !body.details || typeof body.details!=='object' || Array.isArray(body.details) ||
          typeof body.publicListing!=='boolean' || !(body.providerId===null || uuid(body.providerId)) ||
          (!body.publicListing && !body.providerId)) return answer(400,{error:'invalid_job'})
      const {data:id,error} = await serviceClient.rpc('publish_job_with_primary_media',{
        p_owner:user.id,p_draft:body.draftId,p_checksum:body.checksum,p_details:body.details,
        p_provider:body.providerId,p_public:body.publicListing,
      })
      return error || id!==body.draftId ? answer(409,{error:'publication_unavailable'}) : answer(200,{id})
    }
    if (action!==null) return answer(400,{error:'invalid_action'})
    const draft = request.headers.get('x-draft-id')
    if (!uuid(draft)) return answer(400,{error:'invalid_draft'})
    let photo: Uint8Array
    try { photo = await verifiedPhoto(request) } catch { return answer(400,{error:'invalid_photo'}) }
    const digest = await crypto.subtle.digest('SHA-256',new Uint8Array(photo))
    const checksum = Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('')
    const {data:key,error} = await serviceClient.rpc('reserve_job_primary_media',{p_owner:user.id,p_draft:draft,p_checksum:checksum})
    if (error) return answer(409,{error:'photo_reservation_unavailable'})
    if (key) {
      const {error:uploadError} = await storage.upload(key,new Uint8Array(photo),{contentType:'image/jpeg',upsert:false,cacheControl:'0'})
      if (uploadError) {
        // A retry may be observing an earlier successful immutable upload.
        const {data:existing} = await storage.download(key)
        if (!existing) return answer(503,{error:'upload_failed'})
        const existingHash = await crypto.subtle.digest('SHA-256',await existing.arrayBuffer())
        if (Array.from(new Uint8Array(existingHash),byte=>byte.toString(16).padStart(2,'0')).join('') !== checksum)
          return answer(503,{error:'upload_failed'})
      }
      const {data:ready,error:confirmError} = await serviceClient.rpc('confirm_job_primary_upload',{
        p_owner:user.id,p_draft:draft,p_key:key,p_checksum:checksum,
      })
      if (confirmError || ready!==true) return answer(409,{error:'photo_reservation_unavailable'})
    }
    return answer(200,{checksum})
  } catch { return answer(503,{error:'unavailable'}) }
})
