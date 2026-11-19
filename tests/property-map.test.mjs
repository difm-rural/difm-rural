import {createRequire} from 'node:module'
import {runInNewContext} from 'node:vm'
import * as propertyMapHelpers from '../shared/propertyMap.ts'
import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {EMPTY_PROPERTY,drawPropertyPoint,drivewayMetres,mapPixel,pixelPoint,propertyAreaHa,
 mapPointInput,mapSuggestions,propertyMapError,loadPropertyMap,savePropertyMap} from '../shared/propertyMap.ts'
import {addressSearchParams,readAddressMatches} from '../supabase/functions/property-address-search/search.ts'

const ts=createRequire(import.meta.url)('typescript')
const origin={latitude:-41.2,longitude:173.8}
const identity='00000000-0000-4000-8000-000000000001'

test('property projection and coordinate editing use consistent NZ coordinates',()=>{
 const world=mapPixel(origin,17)
 const point=pixelPoint(world.x,world.y,17)
 assert.ok(Math.abs(point.latitude-origin.latitude)<1e-10)
 assert.ok(Math.abs(point.longitude-origin.longitude)<1e-10)
 assert.deepEqual(mapPointInput('-41.2, 173.8'),origin)
 assert.equal(mapPointInput('90, 173.8'),null)
 assert.equal(mapPointInput(', 0'),null)
})

test('owners can place a pin, outline and adjust a property and calculate approximate hectares',()=>{
 const square=[origin,{...origin,longitude:173.801},{latitude:-41.199,longitude:173.801},{...origin,latitude:-41.199}]
 let draft=drawPropertyPoint(EMPTY_PROPERTY,'pin',origin,identity,null)
 for(const point of square)draft=drawPropertyPoint(draft,'boundary',point,identity,null)
 assert.deepEqual(draft.pin,origin)
 assert.ok(Math.abs(propertyAreaHa(draft.boundary)-.93)<.03)
 const moved=drawPropertyPoint(draft,'boundary',{...origin,longitude:173.8005},identity,{index:1})
 assert.ok(propertyAreaHa(moved.boundary)<propertyAreaHa(square))
 assert.equal(propertyMapError({...moved,boundary:[]}), '')
 assert.match(propertyMapError({...moved,boundary:square.slice(0,2)}),/three boundary points/)
})

test('driveways use a polyline while infrastructure is a point; support suggestions are separate',()=>{
 const end={latitude:-41.199,longitude:173.8}
 let draft=drawPropertyPoint(EMPTY_PROPERTY,'driveway',origin,identity,null)
 assert.match(propertyMapError(draft),/two points/)
 draft=drawPropertyPoint(draft,'driveway',end,identity,null)
 assert.ok(Math.abs(drivewayMetres(draft.features[0].points)-111.2)<.5)
 draft=drawPropertyPoint(draft,'tank',origin,identity.replace(/1$/,'2'),null)
 assert.equal(draft.features[1].points.length,1)
 assert.deepEqual(mapSuggestions({...draft,paddocks:'4',livestock:'Sheep'}).map(item=>item.area),['water','access','livestock','land'])
 assert.deepEqual(mapSuggestions(EMPTY_PROPERTY),[])
 assert.equal(propertyMapError(draft),'')
})

test('address lookup builds a bounded LINZ search and rejects unrecognised syntax',()=>{
 assert.equal(addressSearchParams("x%';delete"),null)
 const params=addressSearchParams("Ōtaki")
 assert.equal(params.get('typeNames'),'layer-123113')
 assert.equal(params.get('count'),'8')
 assert.match(params.get('cql_filter'),/suburb_locality ILIKE 'Ōtaki'/)
 assert.match(addressSearchParams("O'Neill").get('cql_filter'),/O''Neill/)
 assert.deepEqual(readAddressMatches({features:[
  {geometry:{type:'Point',coordinates:[173.8,-41.2]},properties:{full_address:'Public fixture'}},
  {geometry:{type:'Point',coordinates:[173.8,200]},properties:{full_address:'Invalid fixture'}},
 ]}),[{label:'Public fixture',...origin}])
})

test('saving is owner scoped and guarded against overwriting another session',async()=>{
 const filters=[]
 const update={...EMPTY_PROPERTY,name:'Block',camera:{...origin,zoom:18}}
 let persisted={profile:EMPTY_PROPERTY,revision:2}
 let pending=null
 const chain={
  eq(key,value){filters.push([key,value]);return chain},
  select(){return chain},
  maybeSingle:async()=>{
   if(pending){
    const revision=filters.find(([key])=>key==='revision')?.[1]
    if(revision!==persisted.revision)return {data:null,error:null}
    persisted=pending
   }
   return {data:persisted,error:null}
  },
 }
 const client={from(table){assert.equal(table,'private_property_maps');return {
  select(){filters.length=0;pending=null;return chain},
  update(value){filters.length=0;pending=value;return chain},
 }}}
 assert.equal(await savePropertyMap(client,'owner',update,2),3)
 assert.deepEqual(filters,[['owner_id','owner'],['revision',2]])
 await assert.rejects(savePropertyMap(client,'owner',EMPTY_PROPERTY,2),/draft is kept/)
 assert.deepEqual((await loadPropertyMap(client,'owner')).profile,update)
})

test('the pending map keeps its authenticated web route and native screen registration',()=>{
 const web=readFileSync(new URL('../provider-web/src/app/property-network/map/page.tsx',import.meta.url),'utf8')
 const native=readFileSync(new URL('../src/navigation/AppNavigator.js',import.meta.url),'utf8')
 assert.match(web,/requireProvider\('\/property-network\/map'\)/)
 assert.match(native,/name="PropertyMap"\s+component=\{PropertyMapScreen\}/)
})

test('address search refuses assistant tokens before authentication or LINZ access',async()=>{
 const source=readFileSync(new URL('../supabase/functions/property-address-search/index.ts',import.meta.url),'utf8')
 const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
 const {refuseAssistantToken}=await import('../supabase/functions/_shared/assistant-token.ts')
 let handler
 runInNewContext(code,{exports:{},Response,Headers,Request,JSON,TextDecoder,
  Deno:{serve(fn){handler=fn},env:{get(){throw Error('Read secret before refusal')}}},
  require(name){
   if(name.includes('assistant-token'))return {refuseAssistantToken}
   if(name.includes('supabase-js'))return {createClient(){throw Error('Authenticated assistant before refusal')}}
   return {}
  },fetch(){throw Error('Called LINZ before refusal')},
 })
 const token=['e30',Buffer.from(JSON.stringify({sub:'owner',client_id:'assistant'})).toString('base64url'),'sig'].join('.')
 const response=await handler(new Request('https://example.test/',{method:'POST',headers:{Authorization:'Bearer '+token}}))
 assert.equal(response.status,403)
 assert.equal((await response.json()).error,'assistant_read_only')
})

test('the browser editor distinguishes tap placement from map panning and keyboard zoom',()=>{
 const source=readFileSync(new URL('../provider-web/src/app/property-network/map/property-aerial-map.tsx',import.meta.url),'utf8')
 const code=ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
 const jsx=(type,props)=>({type,props})
 const api={}
 let states=0
 runInNewContext(code,{exports:api,process:{env:{}},require(name){
  if(name==='react')return {useRef:()=>({current:null}),useEffect(){},useState(value){return [states++===0?value:{width:400,height:320},()=>{}]}}
  if(name==='react/jsx-runtime')return {jsx,jsxs:jsx,Fragment:'fragment'}
  if(name==='@shared/propertyMap')return propertyMapHelpers
  throw Error(name)
 }})
 const drawn=[],panned=[]
 const profile={...EMPTY_PROPERTY,camera:{...origin,zoom:17}}
 const tree=api.PropertyAerialMap({profile,tool:'pin',onCamera:value=>panned.push(value),onPoint:value=>drawn.push(value)})
 const viewport=tree.props.children.find(node=>node?.props?.tabIndex===0)
 const target={setPointerCapture(){},getBoundingClientRect(){return {left:0,top:0}}}
 const event=(x,y)=>({clientX:x,clientY:y,currentTarget:target,pointerId:1})
 viewport.props.onPointerDown(event(200,160))
 viewport.props.onPointerUp(event(200,160))
 assert.equal(drawn.length,1)
 assert.ok(Math.abs(drawn[0].latitude-origin.latitude)<1e-8)
 viewport.props.onPointerDown(event(200,160))
 viewport.props.onPointerMove(event(245,160))
 viewport.props.onPointerUp(event(245,160))
 assert.equal(drawn.length,1)
 assert.ok(panned[0].longitude<origin.longitude)
 viewport.props.onKeyDown({key:'+',preventDefault(){}})
 assert.equal(panned.at(-1).zoom,18)
})
