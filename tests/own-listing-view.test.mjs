import * as listingAvailability from '../shared/listingAvailability.ts'
import * as cardCopy from '../shared/listingCardCopy.ts'
import * as formatting from '../shared/formatting.js'
import assert from 'node:assert/strict'
import test from 'node:test'
import {readFile} from 'node:fs/promises'
import {createRequire} from 'node:module'
import vm from 'node:vm'
import * as pricing from '../shared/listingPricing.ts'
import * as photos from '../shared/photos.ts'
import * as artwork from '../shared/categoryArtwork.ts'
const require=createRequire(import.meta.url),webRequire=createRequire(new URL('../provider-web/package.json',import.meta.url)),ts=require('typescript')
const React=webRequire('react'),{renderToStaticMarkup}=webRequire('react-dom/server'),jsx=webRequire('react/jsx-runtime')
const Link=({children,...props})=>React.createElement('a',props,children)
async function load(file,extra={}){
 const source=await readFile(new URL((file.startsWith('../')?'../provider-web/src/components/'+file.slice(3):'../provider-web/src/app/listings/'+file),import.meta.url),'utf8')
 const compiled=ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
 const module={exports:{}}
 vm.runInNewContext(compiled,{exports:module.exports,require(name){
  if(name==='@shared/listingAvailability')return listingAvailability
  if(name==='@shared/formatting')return formatting
 if(name==='@shared/listingCardCopy')return cardCopy
 if(name==='react')return React;if(name==='react/jsx-runtime')return jsx
  if(name==='@/components/navigation-link')return {default:Link}
  if(name==='lucide-react')return new Proxy({},{get:()=>()=>React.createElement('svg')})
  if(name==='@shared/listingPricing')return pricing
  if(name==='@shared/photos')return photos
  if(name==='@shared/categoryArtwork')return artwork
  if(name==='next/navigation')return {useRouter:()=>({refresh(){}})}
  if(name==='@/lib/supabase/client')return {createClient:()=>({})}
  if(name in extra)return extra[name]
  throw Error(name)
 },process:{env:{NEXT_PUBLIC_JOB_PRIMARY_MEDIA:'true'}}})
 return module.exports
}
const thumb=await load('../thumb-img.tsx')
const primary=await load('../job-primary-image.tsx')
const cards=await load('listing-card.tsx',{'@/components/thumb-img':thumb,'@/components/job-primary-image':primary}),{ManageCard}=await load('manage-card.tsx',{'./listing-card':cards,'./manage-availability':await load('manage-availability.tsx')})
const id='2b8f6b59-b9f3-41a6-9816-55a7dfecf1f4'
test('job cards use the authenticated image route while legacy cards keep their existing URL',()=>{
 const card=props=>renderToStaticMarkup(React.createElement(cards.CardImage,props))
 assert.match(card({jobId:id}),new RegExp('/job-media/'+id))
 const legacy='https://fixture.test/storage/v1/object/public/job-photos/legacy.jpg'
 const rendered=card({jobId:id,photoUrl:legacy})
 assert.match(rendered,/legacy(?:_thumb)?\.jpg/)
 assert.doesNotMatch(rendered,/\/job-media\//)
})
test('live, paused and closed own listings expose a card link and explicit View listing action',()=>{
 for(const status of [{is_active:true,closed_at:null},{is_active:false,closed_at:null},{is_active:false,closed_at:'2026-11-03T00:00:00Z'}]){
  const html=renderToStaticMarkup(React.createElement(ManageCard,{s:{id,title:'Container moving',kind:'service',pricing_type:'fixed',rate:50,photos:[],...status}}))
  assert.match(html,new RegExp('href="/listings/'+id+'"'))
  assert.match(html,/View listing<\/a>/)
  assert.match(html,/aria-label="View listing: Container moving"/)
  assert.match(html,/<\/a><div class="manage-actions/)
  assert.match(html,/<button[^>]*>Pause advertising<\/button>|<button[^>]*>Resume advertising<\/button>/)
  assert.doesNotMatch(html,/Manage availability/)
 }
})
test('management card keeps paused bookings and live advertising distinct, with the saved estimate',()=>{
 const html=renderToStaticMarkup(React.createElement(ManageCard,{s:{id,title:'Water delivery',kind:'service',
  is_active:true,availability_status:'paused',availability_updated_at:'2026-11-26T01:00:00Z',
  lead_time_type:'range_days',lead_time_min_days:2,lead_time_max_days:4}}))
 assert.match(html,/Advertising live/)
 assert.match(html,/Temporarily paused/)
 assert.match(html,/Estimated lead time: 2 to 4 days/)
 assert.match(html,/class="lform-cancel"[^>]*aria-label="Manage availability/)
})
test('ordinary listing cards remain unlinked internally so browse links cannot nest anchors',()=>{
 const html=renderToStaticMarkup(React.createElement(cards.ListingCard,{data:{title:'Example'}}))
 assert.ok(!html.includes('<a '))
})
test('management detail route reuses the existing authorised browse detail implementation',async()=>{
 const route=await readFile(new URL('../provider-web/src/app/listings/[id]/page.tsx',import.meta.url),'utf8')
 assert.match(route,/export \{default\} from '\.\.\/\.\.\/browse\/\[id\]\/page'/)
})

test('listing cards omit duplicate photo copy but retain distinct taglines and the full accessible title',()=>{
 const title='Water delivery'
 const duplicate=renderToStaticMarkup(React.createElement(cards.ListingCard,{data:{title,description:'Fresh local water',photoUrl:'/local.jpg',cardHeadline:'WATER DELIVERY!',cardSupporting:'Fresh local water'}}))
 assert.equal(duplicate.includes('lcard-msg'),false)
 assert.ok(duplicate.includes('title="Water delivery"'))
 const distinct=renderToStaticMarkup(React.createElement(cards.ListingCard,{data:{title,photoUrl:'/local.jpg',cardHeadline:'Difficult access welcome'}}))
 assert.ok(distinct.includes('lcard-msg'))
 assert.ok(distinct.includes('Difficult access welcome'))
})

test('listing edit and delete controls have visible text and distinct accessible names',()=>{
 const html=renderToStaticMarkup(React.createElement(ManageCard,{s:{id,title:'Water delivery',kind:'service',is_active:true,closed_at:null,pricing_type:'fixed',rate:50,photos:[]}}))
 assert.match(html,/aria-label="Edit listing: Water delivery"/)
 assert.match(html,/aria-label="Delete listing: Water delivery"/)
 assert.match(html,/> Edit<\/a>/)
 assert.match(html,/> Delete<\/button>/)
 assert.doesNotMatch(html,/aria-label=""/)
})

test('listing cards show the small thumbnail of an uploaded photo; artwork-free cards unchanged',()=>{
 const full='https://opagkgfxmjqmnvhrcris.supabase.co/storage/v1/object/public/service-photos/svc/1_0.jpg'
 const html=renderToStaticMarkup(React.createElement(cards.ListingCard,{data:{title:'Example',photoUrl:full}}))
 assert.match(html,/src="https:\/\/[^"]+\/service-photos\/svc\/1_0_thumb\.jpg"/)
 assert.ok(!html.includes('1_0.jpg"'),'cards do not load the full photo first')
 const preview=renderToStaticMarkup(React.createElement(cards.ListingCard,{data:{title:'Draft',photoUrl:'blob:http://localhost/abc'}}))
 assert.match(preview,/src="blob:http:\/\/localhost\/abc"/,'a local preview is shown as it is')
})
