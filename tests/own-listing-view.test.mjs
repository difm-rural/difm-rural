import * as cardCopy from '../shared/listingCardCopy.ts'
import * as formatting from '../shared/formatting.js'
import assert from 'node:assert/strict'
import test from 'node:test'
import {readFile} from 'node:fs/promises'
import {createRequire} from 'node:module'
import vm from 'node:vm'
import * as pricing from '../shared/listingPricing.ts'
const require=createRequire(import.meta.url),webRequire=createRequire(new URL('../provider-web/package.json',import.meta.url)),ts=require('typescript')
const React=webRequire('react'),{renderToStaticMarkup}=webRequire('react-dom/server'),jsx=webRequire('react/jsx-runtime')
const Link=({children,...props})=>React.createElement('a',props,children)
async function load(file,extra={}){
 const source=await readFile(new URL('../provider-web/src/app/listings/'+file,import.meta.url),'utf8')
 const compiled=ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
 const module={exports:{}}
 vm.runInNewContext(compiled,{exports:module.exports,require(name){
  if(name==='@shared/formatting')return formatting
 if(name==='@shared/listingCardCopy')return cardCopy
 if(name==='react')return React;if(name==='react/jsx-runtime')return jsx
  if(name==='@/components/navigation-link')return {default:Link}
  if(name==='lucide-react')return new Proxy({},{get:()=>()=>React.createElement('svg')})
  if(name==='@shared/listingPricing')return pricing
  if(name==='next/navigation')return {useRouter:()=>({refresh(){}})}
  if(name==='@/lib/supabase/client')return {createClient:()=>({})}
  if(name in extra)return extra[name]
  throw Error(name)
 }})
 return module.exports
}
const cards=await load('listing-card.tsx'),{ManageCard}=await load('manage-card.tsx',{'./listing-card':cards})
const id='2b8f6b59-b9f3-41a6-9816-55a7dfecf1f4'
test('live, paused and closed own listings expose a card link and explicit View listing action',()=>{
 for(const status of [{is_active:true,closed_at:null},{is_active:false,closed_at:null},{is_active:false,closed_at:'2026-11-03T00:00:00Z'}]){
  const html=renderToStaticMarkup(React.createElement(ManageCard,{s:{id,title:'Container moving',kind:'service',pricing_type:'fixed',rate:50,photos:[],...status}}))
  assert.match(html,new RegExp('href="/listings/'+id+'"'))
  assert.match(html,/View listing<\/a>/)
  assert.match(html,/aria-label="View listing: Container moving"/)
  assert.match(html,/<\/a><div class="manage-actions/)
  assert.match(html,/<button[^>]*>Pause<\/button>|<button[^>]*>Resume<\/button>/)
 }
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
