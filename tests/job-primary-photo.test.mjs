import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { MAX_PHOTO_BYTES,normalisePhotoDraft,readPhoto,sanitisePhoto } from '../supabase/functions/_shared/primary-photo.ts'

// Minimal JPEG structure for the metadata parser. Pixel decode is an
// additional separate check at the Edge ingress.
const header = [255,216,255,192,0,8,8,0,1,0,1,1]
const scan = [255,218,0,2,23,255,0,45,255,217]
const metadata = [255,225,0,8,69,120,105,102,0,0,255,254,0,5,71,80,83]
const jpeg = Uint8Array.from([...header,...metadata,...scan])

test('photo ingestion drops application metadata and comments and preserves scan bytes',async()=>{
 const expected=Uint8Array.from([...header,...scan])
 assert.deepEqual(sanitisePhoto(jpeg),expected)
 assert.deepEqual(await readPhoto(new Request('https://fixture.test',{method:'POST',body:jpeg})),expected)
})

test('photo ingestion rejects oversized, malformed, over-dimension and trailing data',async()=>{
 for(const broken of [new Uint8Array(MAX_PHOTO_BYTES+1),jpeg.slice(0,-2),Uint8Array.from([...jpeg,1])])
  assert.throws(()=>sanitisePhoto(broken),/Invalid JPEG/)
 const oversized=jpeg.slice()
 oversized[7]=5
 assert.throws(()=>sanitisePhoto(oversized),/Invalid JPEG/)
 await assert.rejects(readPhoto(new Request('https://fixture.test',{method:'POST',body:new Uint8Array(MAX_PHOTO_BYTES+1)})),/Invalid photo size/)
})

test('photo drafts validate category and uncertainty, accept at most one question and exclude other fields',()=>{
 const categories=['Fencing & Gates']
 const raw={status:'draft',title:'Fix gate',description:'Repair this gate.',category:categories[0],question:'',price:500}
 assert.deepEqual(normalisePhotoDraft(raw,categories),{
  status:'draft',title:'Fix gate',description:'Repair this gate.',category:categories[0],question:'',
 })
 const uncertain=normalisePhotoDraft({...raw,status:'needs_detail',category:'invented',question:'Which part needs work? Any other damage?'},categories)
 assert.equal(uncertain.question,'Which part needs work?')
 assert.equal(uncertain.category,null)
 assert.equal(normalisePhotoDraft({...raw,description:null},categories),null)
 assert.equal(normalisePhotoDraft({...raw,status:'unusable'},categories).title,'')
})

test('both posting clients route photo publication through the authenticated handler and retain text posting',()=>{
 const web=readFileSync(new URL('../provider-web/src/app/work-actions.ts',import.meta.url),'utf8')
 const mobile=readFileSync(new URL('../src/screens/postjob/PostJobStep5Review.js',import.meta.url),'utf8')
 for(const source of [web,mobile]){
  assert.match(source,/job-primary-media\?action=publish/)
  assert.doesNotMatch(source,/\.rpc\('publish_job_with_primary_media'/)
  assert.match(source,/\.from\('jobs'\)\s*\.insert\(/)
 }
 assert.match(web,/published\?\.id!==id/)
 assert.match(mobile,/data\?\.id===draftJobId/)
})
