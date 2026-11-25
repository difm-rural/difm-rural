import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import * as homeMode from '../shared/homeMode.ts'
import * as summary from '../shared/homeSummary.ts'
import {rankOnTheGo} from '../shared/onTheGo.ts'
import {HELP_FILTERS} from '../shared/findLocalHelp.ts'
import * as availabilityDiscovery from '../shared/availabilityDiscovery.ts'
const require=createRequire(import.meta.url),ts=require('typescript')
const jsx=(type,props)=>({type,props})
const nodes=n=>!n||typeof n!=='object'?[]:Array.isArray(n)?n.flatMap(nodes):[n,...nodes(n.props?.children)]
function native(file,{viewer=true,rows=[]}={}){
 let index=0;const calls=[]
 const react={useState(value){const at=index++;const initial=typeof value==='function'?value():value;let v=initial===true?false:initial==='property'?'work':initial;if(file.includes('BrowseTab')&&at===0)v=viewer?'viewer':null;if(file.includes('MyServices')&&at===0)v=rows;return [v,()=>{}]},useEffect(){},useCallback:fn=>fn,useRef:v=>({current:v})}
 const modules={react:{...react,default:react,__esModule:true},'react/jsx-runtime':{jsx,jsxs:jsx,Fragment:'Fragment'},'react-native':{...Object.fromEntries(['View','Text','TextInput','TouchableOpacity','ScrollView','FlatList','Image','RefreshControl'].map(v=>[v,v])),StyleSheet:{create:v=>v},Alert:{alert(){}},Keyboard:{dismiss(){}}},'@react-navigation/native':{useFocusEffect(){}},'react-native-safe-area-context':{useSafeAreaInsets:()=>({top:0,bottom:0})},'../../../shared/homeMode':homeMode,'../../../shared/homeSummary':summary,'../../../shared/onTheGo':{rankOnTheGo},'../../../shared/findLocalHelp':{HELP_FILTERS},'../../../shared/availabilityDiscovery':availabilityDiscovery,'../../../shared/propertyNetwork':{},'../../../shared/notificationBody':{},'../../../shared/marketSide':{}}
 const source=readFileSync(new URL('../src/screens/'+file,import.meta.url),'utf8'),code=require('@babel/core').transformSync(source,{configFile:false,babelrc:false,presets:[['@babel/preset-react',{runtime:'automatic'}]],plugins:['@babel/plugin-transform-modules-commonjs']}).code
 const exports={};new Function('exports','require',code)(exports,name=>{
  if(name in modules)return modules[name]
  if(name==='@react-native-async-storage/async-storage')return {__esModule:true,default:{}}
  if(name.endsWith('/theme/tokens'))return {colors:{}}
  if(name.endsWith('/useNearbyBrowsing'))return {__esModule:true,default:()=>({})}
  if(name.endsWith('/nearbyBrowsing'))return {filterNearby:()=>({items:[],missingLocationCount:0})}
  if(name.includes('/components/'))return {__esModule:true,default:name.split('/').at(-1)}
  if(name.includes('/lib/')||name.startsWith('../../shared/'))return {}
  throw Error('Missing '+name)
 })
 const nav={navigate:(...args)=>calls.push(args),getParent:()=>({navigate:(...args)=>calls.push(args)})}
 const tree=exports.default({navigation:nav,route:{}})
 return {tree,all:nodes(tree),calls}
}
test('mobile Work keeps two Home cards and routes My listings to management',()=>{
 const s=native('tabs/HomeTabScreen.js'),cards=s.all.filter(n=>typeof n.type==='function'&&n.props.title)
 assert.deepEqual(cards.map(n=>n.props.title),['Find work','My listings'])
 const manage=cards[1];assert.equal(manage.props.subtitle,'Manage or create listings');manage.props.onPress();assert.deepEqual(s.calls.pop(),['MyServices'])
 cards[0].props.onPress();assert.deepEqual(s.calls.pop(),['Jobs',{screen:'JobsBoard'}])
})
test('mobile discovery management row follows search and categories and remains member-only',()=>{
 const s=native('tabs/BrowseTabScreen.js'),row=s.all.find(n=>n.props?.accessibilityLabel==='Manage my listings')
 assert.ok(row);assert.ok(s.all.indexOf(row)>s.all.findIndex(n=>n.type==='TextInput'))
 assert.ok(s.all.indexOf(row)>s.all.findIndex(n=>n.type==='ScrollView'))
 assert.deepEqual(nodes(row).filter(n=>n.type==='Icon').map(n=>n.props.name),['list-outline','chevron-forward'])
 row.props.onPress();assert.deepEqual(s.calls.pop(),['MyServices'])
 assert.equal(native('tabs/BrowseTabScreen.js',{viewer:false}).all.some(n=>n.props?.accessibilityLabel==='Manage my listings'),false)
})
test('mobile management has a primary create action and first-listing empty action',()=>{
 const s=native('MyServicesScreen.js'),create=s.all.find(n=>n.type==='Button'&&n.props.title==='Create a listing')
 assert.ok(create);assert.notEqual(create.props.variant,'secondary');create.props.onPress();assert.equal(s.calls[0][0],'CreateService');assert.equal(typeof s.calls[0][1].newListing,'number')
 const empty=s.all.find(n=>n.type==='EmptyState');assert.equal(empty.props.actionLabel,'Create your first listing');empty.props.onAction();assert.equal(s.calls[1][0],'CreateService')
 const populated=native('MyServicesScreen.js',{rows:[{id:'listing'}]});assert.ok(populated.all.find(n=>n.type==='FlatList'));assert.ok(populated.all.find(n=>n.type==='Button'&&n.props.title==='Create a listing'))
})
async function web(file,rows=[]){
 const calls=[],exports={};const query={select(){return query},eq(key,value){calls.push([key,value]);return Promise.resolve({data:rows,error:null})}}
 const modules={'@shared/listingAvailability':await import('../shared/listingAvailability.ts'),'react/jsx-runtime':{jsx,jsxs:jsx},'lucide-react':new Proxy({},{get:(_,name)=>name}), '@/components/navigation-link':{default:'Link'},'@/components/app-shell':{AppShell:'AppShell'},'@/lib/auth':{requireProvider:async()=>({user:{id:'viewer'},profile:{full_name:'Viewer'},supabase:{from:()=>query}})},'./manage-card':{ManageCard:'ManageCard'},'../listings/listing-card':{ListingCard:'ListingCard'},'@shared/findLocalHelp':{HELP_FILTERS},'@shared/listingPricing':{LISTING_KINDS:[]},'@shared/formatting':{},'@/components/discovery-search':{DiscoverySearch:'DiscoverySearch'},'@/components/side-kicker':{SideKicker:'SideKicker'},'@/lib/discovery-data':{loadDiscoveryListings:async()=>[]},'@/lib/browsing-origin':{browsingOrigin:async()=>({point:null,label:'Town'})},'@/lib/discovery':{discoveryFilters:()=>({page:1}),discover:()=>({rows:[],count:0,pages:1}),discoveryHref:()=>'/browse'}}
 const source=readFileSync(new URL('../provider-web/src/app/'+file,import.meta.url),'utf8'),code=ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS}}).outputText
 new Function('exports','require',code)(exports,name=>{assert.ok(name in modules,name);return modules[name]})
 return {all:nodes(await exports.default({searchParams:Promise.resolve({})})),calls}
}
test('web management retains the primary create link and owner scope, with useful empty copy',async()=>{
 const s=await web('listings/page.tsx');assert.ok(s.all.some(n=>n.type==='Link'&&n.props.href==='/listings/new'&&n.props.children==='Create your first listing'))
 assert.deepEqual(s.calls,[['provider_id','viewer']]);assert.ok(s.all.some(n=>n.type==='Link'&&n.props.className.includes('lform-save')&&Array.isArray(n.props.children)))
 const rows=[{id:'live',is_active:true},{id:'paused',is_active:false},{id:'closed',is_active:false,closed_at:'2026-11-01'}],populated=await web('listings/page.tsx',rows)
 assert.deepEqual(populated.all.filter(n=>n.type==='ManageCard').map(n=>n.props.s.id),['live','paused','closed'])
})
test('web discovery exposes an icon/chevron management row after discovery controls',async()=>{
 const s=await web('browse/page.tsx'),link=s.all.find(n=>n.type==='Link'&&n.props.href==='/listings')
 assert.ok(link);assert.equal(link.props.className,'listing-management-link');assert.ok(s.all.indexOf(link)>s.all.findIndex(n=>n.type==='DiscoverySearch'))
 assert.ok(nodes(link).some(n=>n.type==='ListChecks'));assert.ok(nodes(link).some(n=>n.type==='ChevronRight'))
})
