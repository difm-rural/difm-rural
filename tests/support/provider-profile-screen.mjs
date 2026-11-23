// Runs the real ProviderProfileScreen: its effects load from a fake Supabase
// that returns the given rows, then it renders. Throws whatever the screen throws.
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'

const require=createRequire(import.meta.url)
const compile=path=>require('@babel/core').transformSync(readFileSync(new URL('../../src/'+path,import.meta.url),'utf8'),{configFile:false,babelrc:false,
 presets:[['@babel/preset-react',{runtime:'automatic'}]],plugins:['@babel/plugin-transform-modules-commonjs']}).code
const code=compile('screens/ProviderProfileScreen.js')
const real={'../../shared/formatting.js':await import('../../shared/formatting.js'),'../../shared/trustedLocals':await import('../../shared/trustedLocals.ts'),
 '../lib/providerAvailability':await import('../../shared/providerAvailability.ts')}
const nodes=node=>!node||typeof node!=='object'?[]:Array.isArray(node)?node.flatMap(nodes):[node,...nodes(node.props?.children)]
const flush=async()=>{for(let i=0;i<20;i++)await new Promise(resolve=>setImmediate(resolve))}

export async function openProviderProfile({params,rows,viewer='me'}){
 const me={slots:[],effects:[],i:0}
 const hooks={
  useState(init){const at=me.i++;if(!(at in me.slots))me.slots[at]=typeof init==='function'?init():init;return [me.slots[at],next=>{me.slots[at]=typeof next==='function'?next(me.slots[at]):next}]},
  useRef(init){const at=me.i++;me.slots[at]??={current:init};return me.slots[at]},
  useCallback:fn=>fn,
  useEffect(fn,deps){const at=me.i++,old=me.slots[at];if(!old||deps.some((v,i)=>!Object.is(v,old[i]))){me.slots[at]=deps;me.effects.push(fn)}},
 }
 const element=(type,props)=>({type,props})
 const react={...hooks,__esModule:true};react.default=react
 // Every query resolves to its table's rows, whatever filters were chained.
 const query=table=>{const result={data:table==='profiles_public'&&!Array.isArray(rows[table])?rows[table]:rows[table]??[],error:null}
  const chain=new Proxy({},{get:(_,key)=>key==='then'?(ok,fail)=>Promise.resolve(result).then(ok,fail):['single','maybeSingle'].includes(key)?async()=>result:()=>chain});return chain}
 const supabase={auth:{getUser:async()=>({data:{user:{id:viewer}}})},from:query}
 const modules={react,'react/jsx-runtime':{jsx:element,jsxs:element,Fragment:'Fragment'},
  'react-native':{StyleSheet:{create:v=>v},Alert:{alert(){}},...Object.fromEntries(['ScrollView','Text','TouchableOpacity','View'].map(v=>[v,v]))},
  '@react-navigation/native':{useFocusEffect:fn=>hooks.useEffect(fn,[params.providerId])},
  'react-native-safe-area-context':{useSafeAreaInsets:()=>({top:0,bottom:0})},
  '../lib/supabase':{supabase},'../theme/tokens':{colors:{}},
  '../components/LocalProviderActions':{LocalAction:'LocalAction',LocalShare:'LocalShare'},
  ...Object.fromEntries(['Icon','Loading','EmptyState'].map(name=>['../components/'+name,{__esModule:true,default:name}])),
 }
 const exports={}
 new Function('exports','require',code)(exports,name=>{const found=modules[name]??real[name];if(!found)throw Error('No module '+name);return found})
 const navigation={navigate(){},goBack(){},getParent:()=>({navigate(){}})}
 const render=()=>{me.i=0;const tree=exports.default({route:{params},navigation});for(const fn of me.effects.splice(0))fn();return tree}
 render();await flush();await flush()
 const tree=render()
 const all=nodes(tree)
 return {tree,texts:all.filter(n=>n.type==='Text').flatMap(n=>[n.props.children].flat()).filter(v=>typeof v==='string'||typeof v==='number').map(String),nodes:all}
}
