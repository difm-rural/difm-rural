import assert from 'node:assert/strict'
import test from 'node:test'
import {readFile} from 'node:fs/promises'
import {createRequire} from 'node:module'
import vm from 'node:vm'
const require=createRequire(import.meta.url)

// ---- App: src/lib/shrinkPhoto.js, with expo-image-manipulator mocked ----
const appSource=await readFile(new URL('../src/lib/shrinkPhoto.js',import.meta.url),'utf8')
const appCode=require('@babel/core').transformSync(appSource,{configFile:false,babelrc:false,plugins:['@babel/plugin-transform-modules-commonjs']}).code
function loadShrink({fail=false}={}){
 const calls=[],module={exports:{}}
 const manipulateAsync=async(uri,actions,options)=>{
  // Cloned into this realm so deepEqual compares values, not vm prototypes.
  calls.push(JSON.parse(JSON.stringify({uri,actions,options})))
  if(fail)throw new Error('decode failed')
  const r=actions[0]?.resize
  return {uri:'file://resized.jpg',base64:'BASE64',width:r?.width??(r?Math.round(r.height*0.75):10),height:r?.height??(r?Math.round(r.width*0.75):10)}
 }
 vm.runInNewContext(appCode,{exports:module.exports,require(name){if(name==='expo-image-manipulator')return {manipulateAsync,SaveFormat:{JPEG:'jpeg'}};throw Error(name)}})
 return {...module.exports,calls}
}
const asset=(width,height,extra={})=>({uri:'file://picked.heic',width,height,base64:'ORIGINAL',mimeType:'image/heic',fileName:'IMG_1.HEIC',...extra})

test('app sizes: 1600px for job, listing and chat photos; 512px for profile photos',()=>{
 const {PHOTO_MAX,AVATAR_MAX}=loadShrink()
 assert.equal(PHOTO_MAX,1600);assert.equal(AVATAR_MAX,512)
})
test('app: a large photo is scaled on its longest side and saved as JPEG with base64',async()=>{
 const s=loadShrink()
 const landscape=await s.shrinkPhoto(asset(4032,3024))
 assert.deepEqual(s.calls[0].actions,[{resize:{width:1600}}])
 assert.equal(s.calls[0].options.format,'jpeg');assert.equal(s.calls[0].options.base64,true)
 assert.equal(landscape.uri,'file://resized.jpg');assert.equal(landscape.base64,'BASE64')
 assert.equal(landscape.mimeType,'image/jpeg');assert.equal(landscape.fileName,'IMG_1.jpg')
 await s.shrinkPhoto(asset(3024,4032))
 assert.deepEqual(s.calls[1].actions,[{resize:{height:1600}}],'portrait scales by height')
 await s.shrinkPhoto(asset(2000,2000),s.AVATAR_MAX,{jpeg:true})
 assert.deepEqual(s.calls[2].actions,[{resize:{width:512}}],'avatars cap at 512px')
})
test('app: a small photo is left as it is, keeping the picker\'s base64',async()=>{
 const s=loadShrink(),small=asset(1200,900)
 assert.equal(await s.shrinkPhoto(small),small)
 assert.equal(s.calls.length,0)
})
test('app: jpeg mode re-encodes a small photo without resizing it',async()=>{
 const s=loadShrink()
 const out=await s.shrinkPhoto(asset(400,400),512,{jpeg:true})
 assert.deepEqual(s.calls[0].actions,[],'no resize — never enlarges')
 assert.equal(out.mimeType,'image/jpeg')
})
test('app: an unknown size is never resized (could enlarge it); a failure returns the original',async()=>{
 const s=loadShrink(),unknown=asset(0,0)
 assert.equal(await s.shrinkPhoto(unknown),unknown);assert.equal(s.calls.length,0)
 await s.shrinkPhoto(unknown,1600,{jpeg:true});assert.deepEqual(s.calls[0].actions,[])
 const failing=loadShrink({fail:true}),big=asset(5000,4000)
 assert.equal(await failing.shrinkPhoto(big),big)
 assert.equal(await failing.shrinkPhoto(null),null)
})

// ---- Web: provider-web/src/lib/resize-photo.ts, with the canvas mocked ----
const ts=require('typescript')
const webSource=await readFile(new URL('../provider-web/src/lib/resize-photo.ts',import.meta.url),'utf8')
const webCode=ts.transpileModule(webSource,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
function loadResize({width,height,decodeFails=false}){
 const drawn=[],module={exports:{}}
 const canvas={width:0,height:0,getContext:()=>({drawImage:(_,x,y,w,h)=>drawn.push([w,h])}),toBlob:(cb,type,quality)=>cb(Object.assign(new Blob(['jpeg']),{_type:type,_quality:quality}))}
 vm.runInNewContext(webCode,{exports:module.exports,Promise,Math,Blob,
  createImageBitmap:async()=>{if(decodeFails)throw new Error('bad image');return {width,height,close(){}}},
  document:{createElement:()=>canvas}})
 return {...module.exports,drawn,canvas}
}
const file=(type,name='photo')=>new File(['x'],name,{type})
test('web sizes match the app',()=>{
 const w=loadResize({width:10,height:10})
 assert.equal(w.PHOTO_MAX,1600);assert.equal(w.AVATAR_MAX,512)
})
test('web: a large photo is scaled on its longest side to a JPEG',async()=>{
 const w=loadResize({width:4000,height:3000})
 const out=await w.resizePhoto(file('image/png'))
 assert.deepEqual(w.drawn[0],[1600,1200]);assert.equal(out._type,'image/jpeg')
 const avatar=loadResize({width:1000,height:2000})
 await avatar.resizePhoto(file('image/jpeg'),avatar.AVATAR_MAX)
 assert.deepEqual(avatar.drawn[0],[256,512],'avatars cap at 512px on the longest side')
})
test('web: a small JPEG is uploaded as it is; a small PNG is still converted to JPEG',async()=>{
 const small=file('image/jpeg')
 const w=loadResize({width:800,height:600})
 assert.equal(await w.resizePhoto(small),small);assert.equal(w.drawn.length,0)
 const p=loadResize({width:800,height:600})
 const out=await p.resizePhoto(file('image/png'))
 assert.deepEqual(p.drawn[0],[800,600],'not enlarged');assert.equal(out._type,'image/jpeg')
})
test('web: a photo the browser cannot decode is uploaded unchanged',async()=>{
 const original=file('image/webp')
 assert.equal(await loadResize({width:0,height:0,decodeFails:true}).resizePhoto(original),original)
})
