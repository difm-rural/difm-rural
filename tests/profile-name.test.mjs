import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {createRequire} from 'node:module'
import vm from 'node:vm'
import * as names from '../shared/profileName.ts'
const require=createRequire(import.meta.url),ts=require('typescript')
const source=await readFile(new URL('../provider-web/src/app/account/profile/profile-form.tsx',import.meta.url),'utf8')
const code=ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
function harness(){
 const state=[],refs=[];let i=0,r=0,tree,actionState={error:''},focused=0
 const react={useState(initial){const index=i++;if(!(index in state))state[index]=initial;return [state[index],value=>state[index]=value]},useRef(){return refs[r++]??(refs[r-1]={current:{focus:()=>focused++}})},useEffect(){},useActionState:()=>[actionState,()=>{},false]}
 const jsx=(type,props)=>({type,props}),module={exports:{}}
 vm.runInNewContext(code,{exports:module.exports,require(name){
  if(name==='react')return react
  if(name==='react/jsx-runtime')return {jsx,jsxs:jsx}
  if(name==='@shared/profileName')return names
  if(name==='@shared/categories')return {CATEGORY_CAPABILITIES:{},ALL_CAPABILITIES:[]}
  if(name==='@/components/navigation-link')return {default:'a'}
  if(name==='@/lib/supabase/client'||name==='../actions')return {}
  throw Error(name)
 }})
 const render=()=>{i=0;r=0;tree=module.exports.ProfileForm({userId:'test',profile:{full_name:'Paul',region:'Waitoki',latitude:null,longitude:null}})}
 const nodes=(node=tree)=>!node||typeof node!=='object'?[]:[node,...[node.props?.children].flat(Infinity).filter(c=>c!==undefined).flatMap(c=>nodes(c))]
 render()
 return {nodes,get focused(){return focused},change(value){nodes().find(n=>n.props?.name==='full_name').props.onChange({target:{value}});tree.props.onChange();render()},submit(){let prevented=false;tree.props.onSubmit({preventDefault:()=>prevented=true});render();return prevented},result(value){actionState=value;render()}}
}
test('web whitespace-only names block submission with a visible associated error and retain the entry',()=>{
 const h=harness();h.change('    ');assert.equal(h.submit(),true)
 const input=h.nodes().find(n=>n.props?.name==='full_name')
 assert.equal(input.props.value,'    ');assert.equal(input.props['aria-invalid'],true)
 assert.equal(input.props['aria-describedby'],'profile-name-error')
 assert.ok(h.nodes().find(n=>n.props?.id==='profile-name-error'));assert.equal(h.focused,1)
 h.change('Paul');assert.equal(h.nodes().find(n=>n.props?.name==='full_name').props['aria-invalid'],false)
})
test('web normal hint is distinct from errors, and failed saves preserve the edited name',()=>{
 const h=harness();assert.ok(h.nodes().find(n=>n.props?.id==='profile-name-hint'))
 assert.equal(h.nodes().some(n=>n.props?.role==='alert'),false)
 h.change('Peter');assert.equal(h.submit(),false)
 h.result({error:'Could not save your profile. Check your connection.'})
 assert.equal(h.nodes().find(n=>n.props?.name==='full_name').props.value,'Peter')
 assert.ok(h.nodes().find(n=>n.props?.role==='alert'))
})
test('shared public name rule trims before checking emptiness and the existing 80-character limit',()=>{
 for(const name of ['', '    ', '\t\n', '\u00a0'])assert.ok(names.publicNameError(name))
 assert.equal(names.publicNameError('  Te Kūiti neighbour  '),'')
 assert.equal(names.publicNameError('x'.repeat(80)),'');assert.ok(names.publicNameError('x'.repeat(81)))
})
for(const file of ['src/screens/tabs/AccountTabScreen.js','src/screens/ProfileScreen.js'])test(`mobile name save validates before updating and keeps both public names aligned: ${file}`,async()=>{
 const source=await readFile(new URL('../'+file,import.meta.url),'utf8')
 const start=source.indexOf('  async function saveEdit() {'),end=source.indexOf('\n  //',start)
 const calls=[],errors=[];let patch
 const context={saving:false,userId:'test',editModal:{field:'full_name',value:'    '},publicNameError:names.publicNameError,setEditError:message=>errors.push(message),setSaving(){},setProfile(){},setEditModal:()=>calls.push('close'),Alert:{alert(){}},supabase:{from:()=>({update:value=>{patch=value;calls.push('update');return {eq:async()=>({error:null})}}})}}
 vm.createContext(context);vm.runInContext(source.slice(start,end)+';this.save=saveEdit',context)
 await context.save();assert.equal(calls.length,0);assert.match(errors.at(-1),/only spaces/)
 context.editModal.value='  Paul  ';await context.save()
 assert.equal(patch.full_name,'Paul');assert.equal(patch.display_name,'Paul');assert.ok(calls.includes('close'))
})
