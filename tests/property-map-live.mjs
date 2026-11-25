// Opt-in hosted smoke test. Uses existing synthetic RC accounts only.
// node --import ./tests/support/ts-resolve.mjs tests/property-map-live.mjs
// Never prints credentials or tokens. Removes only its uniquely named map and
// temporary OAuth client; refuses to replace an existing property record.
import assert from 'node:assert/strict'
import {createClient} from '@supabase/supabase-js'
import {createHash,randomBytes,randomUUID} from 'node:crypto'
import {execFileSync} from 'node:child_process'
import {writeFileSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {EMPTY_PROPERTY,drawPropertyPoint,propertyAreaHa,drivewayMetres,loadPropertyMap,savePropertyMap,linzTiles} from '../shared/propertyMap.ts'

const base='https://opagkgfxmjqmnvhrcris.supabase.co'
const key='sb_publishable_Gz5PRvktub4RA5QsIN7n1w_4VGzkLri'
const create=()=>createClient(base,key,{auth:{persistSession:false,autoRefreshToken:false}})
const member=create(),other=create()
const testPassword=process.env.RC_TEST_PASSWORD
if(!testPassword)throw new Error('Set RC_TEST_PASSWORD for the existing synthetic test accounts before running this opt-in smoke test.')
const marker='Map smoke '+randomUUID()
let owner,clientId,created=false
const sql=query=>{
 const file=join(tmpdir(),`rc-map-${process.pid}-${Date.now()}.sql`)
 writeFileSync(file,query)
 try{return execFileSync('supabase',['db','query','--linked','-f',file,'-o','json'],{encoding:'utf8',shell:true,stdio:['ignore','pipe','pipe']})}
 finally{rmSync(file,{force:true})}
}
const login=async(client,email)=>{
 const {data,error}=await client.auth.signInWithPassword({email,password:testPassword})
 assert.equal(error,null,'Synthetic account login failed')
 return data
}
const rest=async(token,method,body)=>{
 const response=await fetch(base+'/rest/v1/private_property_maps?owner_id=eq.'+owner,{method,
  headers:{apikey:key,Authorization:'Bearer '+token,'Content-Type':'application/json',Prefer:'return=representation'},
  ...(body?{body:JSON.stringify(body)}:{})})
 return {status:response.status,body:await response.json()}
}
try{
 const signed=await login(member,'test.other@difmrural.test');owner=signed.user.id
 await login(other,'test.provider@difmrural.test')
 assert.equal((await loadPropertyMap(member,owner)).revision,0,'Existing map found; refusing to replace it')
 let profile={...structuredClone(EMPTY_PROPERTY),name:marker,camera:{latitude:-41.2,longitude:173.8,zoom:17}}
 const points=[{latitude:-41.2,longitude:173.8},{latitude:-41.199,longitude:173.8},{latitude:-41.2,longitude:173.801}]
 for(const point of points)profile=drawPropertyPoint(profile,'boundary',point,randomUUID(),null)
 profile=drawPropertyPoint(profile,'tank',points[0],randomUUID(),null)
 const drivewayId=randomUUID()
 for(const point of points.slice(0,2))profile=drawPropertyPoint(profile,'driveway',point,drivewayId,null)
 assert.ok(propertyAreaHa(profile.boundary)>.4&&propertyAreaHa(profile.boundary)<.5)
 assert.ok(drivewayMetres(profile.features[1].points)>100)
 let revision=await savePropertyMap(member,owner,profile,0);created=true
 profile={...profile,features:profile.features.slice(1)}
 revision=await savePropertyMap(member,owner,profile,revision)
 profile={...profile,features:[{id:randomUUID(),kind:'tank',name:'Synthetic tank',points:[points[0]]},...profile.features]}
 revision=await savePropertyMap(member,owner,profile,revision)
 await member.auth.signOut({scope:'local'})
 await login(member,'test.other@difmrural.test')
 assert.deepEqual((await loadPropertyMap(member,owner)).profile,profile)
 console.log('PASS owner saves boundary, area, tank and driveway; feature removal; persistence across sign-in')
 const hidden=await other.from('private_property_maps').select('*').eq('owner_id',owner)
 assert.equal(hidden.error,null);assert.deepEqual(hidden.data,[])
 const denied=await other.from('private_property_maps').update({revision:99}).eq('owner_id',owner).select()
 assert.equal(denied.error,null);assert.deepEqual(denied.data,[])
 const forged=await other.from('private_property_maps').insert({owner_id:owner,profile,revision:99})
 assert.equal(forged.error?.code,'42501')
 console.log('PASS unrelated account cannot read, update or insert owner records')
 const network=await member.from('property_network_areas').select('area').eq('owner_id',owner)
 assert.equal(network.error,null)
 console.log('PASS existing Property Network remains accessible')
 const address=await member.functions.invoke('property-address-search',{body:{query:'Wellington'}})
 assert.equal(address.error,null,'Authenticated LINZ address lookup failed')
 assert.ok(address.data.matches.length>0,'LINZ returned no location matches')
 console.log('PASS authenticated LINZ address lookup returns coordinates')
 // Genuine assistant JWT via the existing OAuth test infrastructure.
 const redirect='http://127.0.0.1:53682/callback'
 const registration=await fetch(base+'/auth/v1/oauth/clients/register',{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify({client_name:'RC property map smoke',redirect_uris:[redirect],grant_types:['authorization_code','refresh_token'],token_endpoint_auth_method:'none'})})
 assert.ok(registration.ok);clientId=(await registration.json()).client_id
 const verifier=randomBytes(32).toString('base64url')
 const url=new URL(base+'/auth/v1/oauth/authorize')
 Object.entries({client_id:clientId,redirect_uri:redirect,response_type:'code',code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256',state:randomUUID()}).forEach(([k,v])=>url.searchParams.set(k,v))
 const authorization=await fetch(url,{redirect:'manual',headers:{apikey:key}})
 const authorizationId=new URL(authorization.headers.get('location')).searchParams.get('authorization_id')
 assert.ok(authorizationId,'OAuth authorization did not return a consent request')
 const details=await member.auth.oauth.getAuthorizationDetails(authorizationId)
 assert.equal(details.error,null,'OAuth consent details unavailable')
 const consent=await member.auth.oauth.approveAuthorization(authorizationId,{skipBrowserRedirect:true})
 assert.equal(consent.error,null)
 const code=new URL(consent.data.redirect_url).searchParams.get('code')
 const exchange=await fetch(base+'/auth/v1/oauth/token',{method:'POST',headers:{apikey:key,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',code,redirect_uri:redirect,client_id:clientId,code_verifier:verifier})})
 assert.ok(exchange.ok);const token=(await exchange.json()).access_token
 const claims=JSON.parse(Buffer.from(token.split('.')[1],'base64url'))
 assert.equal(claims.sub,owner);assert.ok(claims.client_id)
 // Read guard (20261125200000): the assistant sees no private map row.
 const read=await rest(token,'GET');assert.equal(read.status,200);assert.deepEqual(read.body,[],'Assistant read private map')
 const update=await rest(token,'PATCH',{revision:99});assert.equal(update.status,200);assert.deepEqual(update.body,[])
 const deletion=await rest(token,'DELETE');assert.ok(deletion.status===403||(deletion.status===200&&deletion.body.length===0))
 const insertion=await rest(token,'POST',{owner_id:owner,profile,revision:99});assert.equal(insertion.status,403)
 const edge=await fetch(base+'/functions/v1/property-address-search',{method:'POST',headers:{apikey:key,Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({query:'Wellington'})})
 assert.equal(edge.status,403)
 assert.equal((await loadPropertyMap(member,owner)).revision,revision)
 console.log('PASS real connected-assistant JWT cannot read, insert, update, delete or invoke address search')
 // EAS supplies the public native key to this opt-in check when requested.
 if(process.env.EXPO_PUBLIC_LINZ_BASEMAPS_KEY){
  const tile=linzTiles(process.env.EXPO_PUBLIC_LINZ_BASEMAPS_KEY).replace('{z}','5').replace('{x}','31').replace('{y}','20')
  const image=await fetch(tile);assert.equal(image.status,200);assert.match(image.headers.get('content-type'),/image/)
  console.log('PASS LINZ aerial tile loads with preview key (value suppressed)')
 }
}finally{
 if(created)sql(`delete from public.private_property_maps where owner_id='${owner}' and profile->>'name'='${marker}';`)
 if(clientId){
  await member.auth.oauth.revokeGrant({clientId}).catch(()=>{})
  assert.match(clientId,/^[a-f0-9-]+$/i)
  sql(`delete from auth.oauth_consents where client_id='${clientId}'; delete from auth.oauth_authorizations where client_id='${clientId}'; delete from auth.sessions where oauth_client_id='${clientId}'; delete from auth.oauth_clients where id='${clientId}';`)
 }
 await member.auth.signOut({scope:'local'}).catch(()=>{})
 await other.auth.signOut({scope:'local'}).catch(()=>{})
 console.log('Synthetic map and temporary OAuth client cleanup completed')
}
