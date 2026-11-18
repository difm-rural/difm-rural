import { encode } from 'npm:jpeg-js@0.4.4'
import { strict as assert } from 'node:assert'

const requester='10000000-0000-4000-8000-000000000001'
const job='10000000-0000-4000-8000-000000000002'
const key=requester+'/'+job+'/test.jpg'
const jpeg=encode({width:2,height:2,data:new Uint8Array(16).fill(100),comments:['GPS marker fixture']},80).data
const auth={authorization:'Bearer approved-test-token'}
const settings={SUPABASE_URL:'https://fixture.supabase.test',SUPABASE_ANON_KEY:'anon',SUPABASE_SERVICE_ROLE_KEY:'service',
  PHOTO_TO_JOB_ENABLED:'true',OPENAI_API_KEY:'fixture',JOB_MEDIA_CLEANUP_SECRET:'cleanup-fixture'}

Deno.test('mocked Edge transport validates image bytes, authorization, retry and AI response',async()=>{
 const serve=Deno.serve
 const fetch=globalThis.fetch
 const handler:((request:Request)=>Response|Promise<Response>)[]=[]
 const prior=Object.fromEntries(Object.keys(settings).map(name=>[name,Deno.env.get(name)]))
 try{
  Object.assign(Deno,{serve:(fn:typeof handler[number])=>handler.push(fn)})
  for(const [name,value] of Object.entries(settings))Deno.env.set(name,value)
  await import('../supabase/functions/job-primary-media/index.ts')
  await import('../supabase/functions/draft-job-from-photo/index.ts')
  const [media,ai]=handler
  let visible=false,uploaded:Uint8Array|undefined,aiStatus='draft',modelCalls=0
  const modelInputs: unknown[][] = []
  let publishCalls=0,stageEligible=true,cleanupClaim=true,leaseCurrent=false
  let beforeRemove: (()=>Promise<void>) | undefined
  const lease='10000000-0000-4000-8000-000000000003'
  globalThis.fetch=async(input,init)=>{
    const request=new Request(input,init)
    const url=new URL(request.url), path=url.pathname
    assert.ok(['fixture.supabase.test','api.openai.com'].includes(url.hostname))
    if(path==='/auth/v1/user')return request.headers.get('authorization')===auth.authorization?Response.json({id:requester}):Response.json({}, {status:401})
    if(path.endsWith('/read_job_primary_media')){
      const body=await request.json()
      return Response.json(visible&&body.p_job===job?key:null)
    }
    if(path.endsWith('/read_job_gallery_photo')){
      const body=await request.json()
      return Response.json(visible&&body.p_job===job&&body.p_photo===lease?key:null)
    }
    if(path.endsWith('/reserve_job_primary_media'))return Response.json(key)
    if(path.endsWith('/reserve_job_edit_photo')){
      const body=await request.json()
      assert.equal(body.p_owner,requester)
      assert.equal(body.p_job,lease)
      assert.equal(body.p_draft,job)
      return Response.json(key)
    }
    if(path.endsWith('/confirm_job_primary_upload')){
      const body=await request.json()
      assert.equal(body.p_owner,requester)
      assert.equal(body.p_key,key)
      return Response.json(true)
    }
    if(path.endsWith('/publish_job_with_primary_media')){
      publishCalls++
      const body=await request.json()
      assert.equal(body.p_owner,requester)
      assert.equal(body.p_draft,job)
      assert.equal(body.p_public,false)
      return stageEligible?Response.json(job):Response.json({message:'Upload a primary photo first'},{status:400})
    }
    if(path.endsWith('/claim_job_media_cleanup')){
      if(!cleanupClaim)return Response.json([])
      cleanupClaim=false
      return Response.json([{object_key:key,lease_token:lease}])
    }
    if(path.endsWith('/finish_job_media_cleanup')){
      assert.deepEqual(await request.json(),{p_key:key,p_lease:lease})
      return Response.json(leaseCurrent)
    }
    if(path.endsWith('/claim_job_photo_analysis'))return Response.json(true)
    if(path.startsWith('/storage/v1/object/')){
      if(request.method==='DELETE'){
        assert.deepEqual(await request.json(),{prefixes:[key]})
        await beforeRemove?.()
        return Response.json([])
      }
      if(request.method==='POST'){
        if(uploaded)return Response.json({message:'Duplicate'}, {status:409})
        uploaded=new Uint8Array(await request.arrayBuffer())
        return Response.json({Key:key})
      }
      return uploaded?new Response(new Uint8Array(uploaded),{headers:{'Content-Type':'image/jpeg'}}):new Response(null,{status:404})
    }
    if(url.hostname==='api.openai.com'){
      modelCalls++
      const body=await request.json()
      assert.equal(body.store,false)
      modelInputs.push(body.input[0].content)
      return Response.json({output:[{content:[{type:'output_text',text:JSON.stringify({
        status:aiStatus,title:'Fix gate',description:'Repair this gate.',category:'Fencing & Gates',
        question:'Which hinge needs work?',
      })}]}]})
    }
    return new Response(null,{status:404})
  }
  const imageRequest=(headers:HeadersInit=auth, body:BodyInit=new Uint8Array(jpeg))=>new Request('https://fixture.test/',{
    method:'POST',headers:{...headers,'x-draft-id':job,'Content-Type':'image/jpeg'},body,
  })
  assert.equal((await media(imageRequest({}))).status,401)
  assert.equal((await media(imageRequest(auth,new Uint8Array([1,2])))).status,400)
  const first=await media(imageRequest())
  assert.equal(first.status,200)
  assert.ok(uploaded)
  assert.ok(!new TextDecoder().decode(uploaded).includes('GPS marker fixture'))
  const upload=await first.json()
  assert.deepEqual(await (await media(imageRequest())).json(),upload)
  const editStage=new Request('https://fixture.test/?action=stage-edit&job='+lease,imageRequest())
  assert.deepEqual(await (await media(editStage)).json(),upload)
  const publication=(headers:HeadersInit=auth, overrides={})=>new Request('https://fixture.test/?action=publish',{
    method:'POST',headers:{...headers,'Content-Type':'application/json'},
    body:JSON.stringify({draftId:job,checksum:upload.checksum,details:{title:'Fix gate'},ownerId:job,
      providerId:lease,publicListing:false,...overrides}),
  })
  assert.equal((await media(publication({}))).status,401)
  Deno.env.set('PHOTO_TO_JOB_ENABLED','false')
  assert.equal((await media(publication())).status,503)
  assert.equal((await media(imageRequest())).status,503)
  Deno.env.set('PHOTO_TO_JOB_ENABLED','true')
  assert.equal((await media(publication(auth,{providerId:null}))).status,400)
  assert.equal(publishCalls,0)
  stageEligible=false
  assert.equal((await media(publication())).status,409)
  stageEligible=true
  assert.deepEqual(await (await media(publication())).json(),{id:job})
  assert.deepEqual(await (await media(publication())).json(),{id:job})
  assert.equal(publishCalls,3)
  const read=()=>new Request('https://fixture.test/?job='+job)
  assert.equal((await media(read())).status,404)
  visible=true
  const allowed=await media(read())
  assert.equal(allowed.status,200)
  assert.equal(allowed.headers.get('Cache-Control'),'private, no-store')
  const galleryRead=()=>new Request('https://fixture.test/?job='+job+'&photo='+lease)
  assert.equal((await media(galleryRead())).status,200)
  visible=false
  assert.equal((await media(galleryRead())).status,404)
  assert.equal((await media(read())).status,404)
  assert.equal((await ai(imageRequest({}))).status,401)
  assert.equal((await ai(imageRequest({...auth,'x-job-photo-note':'%bad%'}))).status,400)
  assert.equal((await ai(imageRequest({...auth,'x-job-photo-note':'a'.repeat(401)}))).status,400)
  assert.equal((await ai(imageRequest())).status,200)
  assert.equal(modelInputs[0].length,1)
  aiStatus='needs_detail'
  const note='Replace the hinge near the pā gate.'
  const withNote=imageRequest({...auth,'x-job-photo-note':encodeURIComponent(note)})
  assert.equal((await (await ai(withNote)).json()).question,'Which hinge needs work?')
  assert.deepEqual(modelInputs[1][0],{type:'input_text',text:'Requester context: '+note})
  assert.match(JSON.stringify(modelInputs[1][1]),/data:image\/jpeg;base64,/)
  aiStatus='invalid'
  assert.equal((await ai(imageRequest())).status,503)
  assert.equal(modelCalls,3)
  const cleanup=(secret:string)=>new Request('https://fixture.test/',{method:'DELETE',headers:{'x-cleanup-secret':secret}})
  assert.equal((await media(cleanup('incorrect'))).status,401)
  const removing=Promise.withResolvers<void>()
  const releaseRemove=Promise.withResolvers<void>()
  beforeRemove=()=>{removing.resolve();return releaseRemove.promise}
  const staleRun=Promise.resolve(media(cleanup(settings.JOB_MEDIA_CLEANUP_SECRET)))
  await removing.promise
  assert.deepEqual(await (await media(cleanup(settings.JOB_MEDIA_CLEANUP_SECRET))).json(),
    {claimed:0,removed:0,failed:0,timed_out:false})
  releaseRemove.resolve()
  const stale=await staleRun
  assert.equal(stale.status,503)
  assert.deepEqual(await stale.json(),{claimed:1,removed:0,failed:1,timed_out:false})
  cleanupClaim=true
  leaseCurrent=true
  beforeRemove=undefined
  assert.deepEqual(await (await media(cleanup(settings.JOB_MEDIA_CLEANUP_SECRET))).json(),
    {claimed:1,removed:1,failed:0,timed_out:false})
 }finally{
  globalThis.fetch=fetch
  Object.assign(Deno,{serve})
  for(const [name,value] of Object.entries(prior))if(value===undefined)Deno.env.delete(name);else Deno.env.set(name,value)
 }
})
