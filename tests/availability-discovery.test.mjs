// Release 2.1 – Availability Discovery across mobile, provider web and public web.
import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import {stripTypeScriptTypes} from 'node:module'
import {discovery,data} from './web-discovery-modules.mjs'
import * as findLocalHelp from '../shared/findLocalHelp.ts'
import * as availabilityDiscovery from '../shared/availabilityDiscovery.ts'
import {listingAvailability} from '../shared/listingAvailability.ts'
import {nzToday} from '../shared/postingDates.ts'
import {filterNearby} from '../src/lib/nearbyBrowsing.js'

const require=createRequire(import.meta.url)
const url=source=>'data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(source)).toString('base64')
const nearbyUrl=url(await readFile(new URL('../public-web/src/lib/nearby.ts',import.meta.url),'utf8'))
const marketSource=(await readFile(new URL('../public-web/src/lib/marketplace.ts',import.meta.url),'utf8')).replace("'./nearby'",JSON.stringify(nearbyUrl)).replace("import {resolvePublicJobLocations} from './job-discovery'","const resolvePublicJobLocations=async rows=>rows")
const market=await import(url(marketSource))
const {discoveryFilters,discover,discoveryHref}=discovery
const today=nzToday()
const addDays=n=>{const d=new Date(today+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)}

// Fixture in the existing default order (newest first). Shortest estimates are deliberately oldest.
let minute=0
const row=(id,patch={})=>({id,title:'Listing '+id,description:'Rural help',category:'Fencing & Gates',kind:'service',location_name:'Cambridge',created_at:new Date(Date.UTC(2026,10,25,12,59-(minute++))).toISOString(),latitude:null,longitude:null,availability_enabled:true,availability_updated_at:'2026-11-20T00:00:00Z',availability_status:'accepting_bookings',lead_time_type:'not_specified',...patch})
const fixture=()=>{minute=0;return [
 row('sale',{kind:'for_sale',category:'Hay & Feed',lead_time_type:'same_day'}),
 row('lease',{kind:'lease',category:'Storage',lead_time_type:'next_day'}),
 row('paused',{availability_status:'paused',lead_time_type:'same_day'}),
 row('contact',{lead_time_type:'contact_provider'}),
 row('disabled',{availability_enabled:false,lead_time_type:'same_day'}),
 row('unspecified',{availability_status:'limited'}),
 row('range',{lead_time_type:'range_days',lead_time_min_days:1,lead_time_max_days:6}),
 row('fixed',{availability_status:'limited',lead_time_type:'fixed_days',lead_time_min_days:4}),
 row('date',{lead_time_type:'earliest_date',lead_time_date:addDays(2)}),
 row('pastdate',{lead_time_type:'earliest_date',lead_time_date:addDays(-10)}),
 row('next',{lead_time_type:'next_day'}),
 row('grazing',{kind:'grazing',category:'Grazing',lead_time_type:'fixed_days',lead_time_min_days:1}),
 row('same',{lead_time_type:'same_day'}),
]}
const ACCEPTING=['contact','disabled','unspecified','range','fixed','date','pastdate','next','grazing','same']
const LEAD=['range','fixed','date','pastdate','next','grazing','same']
const SORTED=['pastdate','same','next','grazing','date','fixed','range','contact','disabled','unspecified','paused','sale','lease']
const ids=rows=>rows.map(r=>r.id)

// --- Mobile harness: renders BrowseTabScreen with real shared helpers and filterNearby.
function mobile({services=fixture(),kind='',search='',availability='',sort='default',viewer=true,nearby={point:null,radius:null}}={}){
 let index=0;const sets=[]
 const values=[viewer?'viewer':null,services,false,false,search,kind,false,availability,sort]
 const react={useState(initial){const at=index++;return [at in values?values[at]:initial,v=>sets.push([at,v])]},useEffect(){},useCallback:fn=>fn,useRef:v=>({current:v})}
 const jsx=(type,props)=>({type,props})
 const modules={react:{...react,default:react,__esModule:true},'react/jsx-runtime':{jsx,jsxs:jsx,Fragment:'Fragment'},'react-native':{...Object.fromEntries(['View','Text','TextInput','TouchableOpacity','ScrollView','RefreshControl'].map(v=>[v,v])),StyleSheet:{create:v=>v},Alert:{alert(){}},Keyboard:{dismiss(){}}},'@react-navigation/native':{useFocusEffect(){}},'react-native-safe-area-context':{useSafeAreaInsets:()=>({top:0,bottom:0})},'../../../shared/findLocalHelp':findLocalHelp,'../../../shared/availabilityDiscovery':availabilityDiscovery,'../../lib/nearbyBrowsing':{filterNearby}}
 const source=readFileSync(new URL('../src/screens/tabs/BrowseTabScreen.js',import.meta.url),'utf8'),code=require('@babel/core').transformSync(source,{configFile:false,babelrc:false,presets:[['@babel/preset-react',{runtime:'automatic'}]],plugins:['@babel/plugin-transform-modules-commonjs']}).code
 const exports={};new Function('exports','require',code)(exports,name=>{
  if(name in modules)return modules[name]
  if(name==='@react-native-async-storage/async-storage')return {__esModule:true,default:{}}
  if(name.endsWith('/theme/tokens'))return {colors:{}}
  if(name.endsWith('/useNearbyBrowsing'))return {__esModule:true,default:()=>({...nearby,setRadius(){}})}
  if(name.includes('/components/'))return {__esModule:true,default:name.split('/').at(-1)}
  if(name.endsWith('/providerAvailability'))return {availabilityDisplay:()=>({})}
  if(name.includes('/lib/'))return {}
  throw Error('Missing '+name)
 })
 const nodes=n=>!n||typeof n!=='object'?[]:Array.isArray(n)?n.flatMap(nodes):[n,...nodes(n.props?.children)]
 const all=nodes(exports.default({navigation:{navigate(){},setParams(){},getParent:()=>({navigate(){}})},route:{}}))
 const section=all.find(n=>typeof n.type==='function'&&n.type.name==='ServiceSection')
 const chips=all.filter(n=>typeof n.type==='function'&&n.type.name==='FilterChip')
 const text=all.filter(n=>n.type==='Text').map(n=>[n.props.children].flat().join(''))
 return {all,sets,items:section?.props.items ?? [],chips,text}
}
const provider=(params,rows=fixture(),origin=null)=>discover(rows,discoveryFilters(params,true),origin)
const pub=(params,rows=fixture(),radius=null)=>market.publicResults(rows,market.browseFilters(params),radius)

test('accepting bookings filter matches on every platform, excluding paused and enquiry-only listings',()=>{
 const m=mobile({availability:'accepting'}),p=provider({availability:'accepting'}),w=pub({availability:'accepting'})
 assert.deepEqual(ids(m.items),ACCEPTING);assert.deepEqual(ids(p.rows),ACCEPTING);assert.deepEqual(ids(w.rows),ACCEPTING)
 assert.equal(p.count,ACCEPTING.length);assert.equal(w.count,ACCEPTING.length)
 assert.ok(m.text.includes(ACCEPTING.length+' matching listings'))
})

test('published lead time filter needs availability management and a comparable estimate',()=>{
 for(const result of [ids(mobile({availability:'lead_time'}).items),ids(provider({availability:'lead_time'}).rows),ids(pub({availability:'lead_time'}).rows)])assert.deepEqual(result,LEAD)
})

test('shortest lead time sorts identically on every platform with groups and stable ties',()=>{
 assert.deepEqual(ids(mobile({sort:'lead_time'}).items),SORTED)
 assert.deepEqual(ids(provider({sort:'lead_time'}).rows),SORTED)
 assert.deepEqual(ids(pub({sort:'lead_time'}).rows),SORTED)
 // pastdate (0) ties with same (0); next, grazing (1) tie; ties keep newest-first default order.
 assert.ok(SORTED.indexOf('next')<SORTED.indexOf('grazing'))
})

test('filter and sort combine with category and listing type filters',()=>{
 const rows=fixture(),fencing=rows.filter(r=>r.category==='Fencing & Gates')
 const expected=ids(availabilityDiscovery.sortByLeadTime(fencing.filter(r=>availabilityDiscovery.matchesAvailabilityFilter(r,'lead_time'))))
 assert.deepEqual(ids(provider({availability:'lead_time',sort:'lead_time',category:'Fencing & Gates'},rows).rows),expected)
 assert.deepEqual(ids(pub({availability:'lead_time',sort:'lead_time',category:'Fencing & Gates'},rows).rows),expected)
 assert.deepEqual(expected,['pastdate','same','next','date','fixed','range'])
 assert.deepEqual(ids(provider({availability:'accepting',kind:'grazing'}).rows),['grazing'])
 assert.deepEqual(ids(pub({availability:'accepting',kind:'grazing'}).rows),['grazing'])
 assert.deepEqual(ids(mobile({availability:'accepting',kind:'grazing'}).items),['grazing'])
 assert.deepEqual(ids(mobile({availability:'accepting',kind:'for_sale'}).items),[],'goods are enquiry-only')
 assert.deepEqual(ids(mobile({availability:'lead_time',search:'listing ne'}).items),['next'])
})

test('filter and sort combine with location: nearest stays the tie-break and radius still applies',()=>{
 const origin={latitude:-37.9,longitude:175.47}
 const rows=fixture().map((r,i)=>({...r,latitude:i%2?-37.9+i*0.01:null,longitude:i%2?175.47:null}))
 const near=provider({sort:'lead_time',radius:'200'},rows,origin)
 assert.ok(near.rows.every(r=>r.distance!==null))
 assert.deepEqual(ids(near.rows),ids(availabilityDiscovery.sortByLeadTime(rows.filter(r=>r.latitude!==null))))
 // equal lead time (both "same_day"-tier ties) resolve nearest first when a browsing origin is set
 const tie=[row('far',{lead_time_type:'same_day',latitude:-38.5,longitude:175.47}),row('close',{lead_time_type:'same_day',latitude:-37.91,longitude:175.47})]
 assert.deepEqual(ids(provider({sort:'lead_time'},tie,origin).rows),['close','far'])
 assert.deepEqual(ids(provider({sort:'lead_time'},tie,null).rows),['far','close'],'newest first without an origin')
 const pubTie=tie.map(r=>({...r,distance:r.id==='far'?67:1}))
 assert.deepEqual(ids(pub({sort:'lead_time'},pubTie,100).rows),['close','far'])
 const mob=mobile({services:tie,sort:'lead_time',nearby:{point:origin,radius:100}})
 assert.deepEqual(ids(mob.items),['close','far'])
 assert.deepEqual(ids(mobile({services:tie,sort:'lead_time',nearby:{point:origin,radius:10}}).items),['close'],'radius still filters')
 // unlocated counts on public web follow the availability filter
 const unlocated=fixture().map(r=>({...r,distance:null}))
 assert.equal(pub({availability:'accepting'},unlocated,50).unlocated,ACCEPTING.length)
})

test('counts and pagination cover the complete matching set, not just the loaded page',()=>{
 const many=Array.from({length:60},(_,i)=>row('n'+i,i===57?{lead_time_type:'same_day'}:i===58?{availability_status:'paused'}:i===59?{kind:'for_sale',category:'Hay & Feed'}:{lead_time_type:'fixed_days',lead_time_min_days:10+(i%5)}))
 const p1=provider({sort:'lead_time'},many);assert.equal(p1.count,60);assert.equal(p1.pages,3);assert.equal(p1.rows[0].id,'n57','an older listing on the last default page sorts to the top')
 const p3=provider({sort:'lead_time',page:'3'},many);assert.deepEqual(ids(p3.rows).slice(-2),['n58','n59'])
 const w1=pub({sort:'lead_time'},many);assert.equal(w1.count,60);assert.equal(w1.pages,4);assert.equal(w1.rows[0].id,'n57')
 assert.deepEqual(ids(pub({sort:'lead_time',page:'4'},many).rows).slice(-2),['n58','n59'])
 const f=provider({availability:'accepting'},many);assert.equal(f.count,58);assert.equal(f.pages,3)
 assert.equal(pub({availability:'lead_time'},many).count,58)
 assert.equal(pub({availability:'lead_time',page:'99'},many).page,4)
 const all=[...provider({sort:'lead_time',page:'1'},many).rows,...provider({sort:'lead_time',page:'2'},many).rows,...p3.rows]
 assert.equal(new Set(ids(all)).size,60,'no listing is repeated or dropped across pages')
})

test('the default view is unchanged and filters reset to it',()=>{
 const rows=fixture(),defaultOrder=ids(rows)
 assert.deepEqual(ids(provider({},rows).rows),defaultOrder)
 assert.deepEqual(ids(pub({},rows).rows),defaultOrder)
 assert.deepEqual(ids(mobile({services:rows}).items),defaultOrder)
 assert.deepEqual(market.browseFilters({}).availability,'');assert.equal(market.browseFilters({}).sort,'')
 assert.equal(discoveryFilters({},true).availability,'');assert.equal(discoveryFilters({},true).sort,'newest')
 for(const bad of [{availability:'paused'},{sort:'cheapest'},{availability:'<script>'}]){assert.deepEqual(ids(provider(bad,rows).rows),defaultOrder);assert.deepEqual(ids(pub(bad,rows).rows),defaultOrder)}
 // Web reset: "Clear search & options" links to the bare page, which parses to the defaults.
 assert.equal(market.browseHref('/listings',market.browseFilters({})), '/listings')
 // Mobile reset clears kind, availability and sort.
 const m=mobile({availability:'lead_time',sort:'lead_time',kind:'grazing'})
 const reset=m.all.find(n=>n.props?.accessibilityLabel==='Reset filters and sort');assert.ok(reset);reset.props.onPress()
 assert.deepEqual(m.sets,[[5,''],[7,''],[8,'default']])
 const plain=mobile();assert.equal(plain.all.some(n=>n.props?.accessibilityLabel==='Reset filters and sort'),false,'no reset or count row on the default view')
})

test('filter and sort state survive pagination and kind links, and stay off job boards',()=>{
 const f=market.browseFilters({availability:'lead_time',sort:'lead_time',kind:'service',page:'2'})
 const href=new URL(market.browseHref('/listings',f),'https://x.test');assert.equal(href.searchParams.get('availability'),'lead_time');assert.equal(href.searchParams.get('sort'),'lead_time');assert.equal(href.searchParams.get('page'),'2')
 const pf=discoveryFilters({availability:'accepting',sort:'lead_time'},true),ph=new URL(discoveryHref('/browse',{...pf,page:2}),'https://x.test')
 assert.equal(ph.searchParams.get('availability'),'accepting');assert.equal(ph.searchParams.get('sort'),'lead_time')
 const jobs=discoveryFilters({availability:'accepting',sort:'lead_time'});assert.equal(jobs.sort,'newest');assert.equal('availability' in jobs,false)
 assert.equal(new URL(discoveryHref('/jobs',jobs),'https://x.test').searchParams.has('availability'),false)
})

test('mobile reuses the existing chip control and keeps existing empty-result messages',async()=>{
 const m=mobile({availability:'accepting'})
 const labels=m.chips.map(c=>c.props.label)
 assert.deepEqual(labels,[...findLocalHelp.HELP_FILTERS.map(([,l])=>l),'Accepting bookings','Published lead time','Sort: shortest lead time'])
 assert.equal(m.chips.find(c=>c.props.label==='Accepting bookings').props.selected,true)
 m.chips.find(c=>c.props.label==='Accepting bookings').props.onPress();assert.deepEqual(m.sets.pop(),[7,''],'tapping the selected chip returns to All listings')
 m.chips.find(c=>c.props.label==='Published lead time').props.onPress();assert.deepEqual(m.sets.pop(),[7,'lead_time'])
 m.chips.find(c=>c.props.label==='Sort: shortest lead time').props.onPress();assert.deepEqual(m.sets.pop(),[8,'lead_time'])
 const empty=mobile({services:[row('paused',{availability_status:'paused'})],availability:'accepting'})
 const state=empty.all.find(n=>n.type==='EmptyState');assert.equal(state.props.title,'No listings match this filter')
 assert.ok(empty.text.includes('0 matching listings'))
 const sorted=mobile({sort:'lead_time'});assert.ok(sorted.text.includes(availabilityDiscovery.LEAD_TIME_SORT_NOTE))
 // Guests (no signed-in member) get the same controls and results.
 const guest=mobile({availability:'accepting',viewer:false});assert.deepEqual(ids(guest.items),ACCEPTING);assert.equal(guest.chips.length,m.chips.length)
})

test('web controls reuse the existing search options form and sort select',async()=>{
 const search=await readFile(new URL('../provider-web/src/components/discovery-search.tsx',import.meta.url),'utf8')
 assert.match(search,/name="availability"/);assert.match(search,/LEAD_TIME_SORT_LABEL/);assert.match(search,/listings&&<option value=\{LEAD_TIME_SORT\}/,'jobs do not offer the lead-time sort')
 const browse=await readFile(new URL('../provider-web/src/app/browse/page.tsx',import.meta.url),'utf8');assert.match(browse,/discoveryFilters\(params,true\)/)
 const pub=await readFile(new URL('../public-web/src/components/public-browse.tsx',import.meta.url),'utf8')
 assert.match(pub,/<form className="public-search"[^\n]*name="availability"[^\n]*name="sort"/,'public controls live inside the existing search form')
 assert.match(pub,/availability:'' as const,sort:'' as const/,'jobs ignore listing-only options')
})

test('visibility, privacy and location masking are unchanged',async()=>{
 // Listings are still read from the public view with the same publication guards and no private columns.
 const calls=[],q={select(v){calls.push(['select',v]);return q},eq(k,v){calls.push(['eq',k,v]);return q},is(k,v){calls.push(['is',k,v]);return q},order(){return q},async range(){return {data:[],error:null}}}
 await data.loadDiscoveryListings({from(t){calls.push(['from',t]);return q}})
 assert.deepEqual(calls[0],['from','services_public']);assert.ok(calls.some(c=>c.join('|')==='eq|is_active|true'));assert.ok(calls.some(c=>c[0]==='is'&&c[1]==='closed_at'))
 for(const key of ['phone','email','address','provider_phone'])assert.equal(market.LISTING_COLUMNS.split(',').includes(key),false)
 for(const key of ['latitude','longitude','discovery_latitude'])assert.equal(market.LISTING_COLUMNS.split(',').includes(key),false,'public cards never receive coordinates')
 // Filtering and sorting never add fields (no coordinates or raw ranks leak onto cards).
 const rows=fixture().map(({latitude,longitude,...r})=>r)
 const out=pub({availability:'accepting',sort:'lead_time'},rows).rows
 for(const r of out){assert.equal('latitude' in r,false);assert.deepEqual(Object.keys(r).sort(),Object.keys(rows.find(x=>x.id===r.id)).sort())}
 // Displayed availability text is unchanged by discovery.
 const before=fixture().map(r=>listingAvailability(r).card);assert.deepEqual(provider({sort:'lead_time'}).rows.map(r=>listingAvailability(r).card),SORTED.map(id=>before[fixture().findIndex(r=>r.id===id)]))
 // No database change: the feature reads only columns Release 1.2 already exposes.
 const migrations=(await import('node:fs')).readdirSync(new URL('../supabase/migrations/',import.meta.url)).sort().at(-1)
 assert.equal(migrations,'20261126130000_optional_listing_availability.sql')
})
