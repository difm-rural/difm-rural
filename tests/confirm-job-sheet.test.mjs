import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import * as postingDates from '../shared/postingDates.ts'
import * as requestedDate from '../shared/requestedDate.ts'
import * as formatting from '../shared/formatting.js'
import * as offers from '../shared/offers.ts'
import * as quickPick from '../src/lib/quickPickDates.js'

const require=createRequire(import.meta.url),jsx=(type,props)=>({type,props})
const nodes=n=>!n||typeof n!=='object'?[]:Array.isArray(n)?n.flatMap(nodes):[n,...nodes(n.props?.children)]
const text=n=>nodes(n).flatMap(v=>[v.props?.children].flat()).filter(v=>typeof v==='string').join(' ')

// Renders ConfirmJobSheet once with real date logic and stubbed UI parts.
function sheet(props){
 const react={useState:v=>[typeof v==='function'?v():v,()=>{}],useEffect(){},useRef:v=>({current:v})};react.default=react
 const mods={react:{...react,__esModule:true},'react/jsx-runtime':{jsx,jsxs:jsx,Fragment:'Fragment'},
  'react-native':{StyleSheet:{create:v=>v},...Object.fromEntries(['View','Text','TextInput','TouchableOpacity'].map(n=>[n,n]))},
  '../../shared/formatting.js':formatting,'../../shared/postingDates':postingDates,'../../shared/requestedDate':requestedDate,
  '../lib/quickPickDates':quickPick,'../lib/supabase':{supabase:{}},'../../shared/offers':offers,'../theme/tokens':{colors:{}},
  './ArrivalWhen':{__esModule:true,default:'ArrivalWhen'},'./FullScreenSheet':{__esModule:true,default:'FullScreenSheet'},'./Button':{__esModule:true,default:'Button'}}
 const code=require('@babel/core').transformSync(readFileSync(new URL('../src/components/ConfirmJobSheet.js',import.meta.url),'utf8'),
  {configFile:false,babelrc:false,presets:[['@babel/preset-react',{runtime:'automatic'}]],plugins:['@babel/plugin-transform-modules-commonjs']}).code
 const exports={};new Function('exports','require',code)(exports,name=>{if(name in mods)return mods[name];throw Error('Missing '+name)})
 const tree=exports.default({visible:true,bidId:'b',jobTitle:'Paint fence',requesterFirst:'Paul',job:{schedule_type:'flexible'},amount:25,pricingType:'hourly',...props})
 return {tree,all:nodes(tree),footer:nodes(tree.props.footer)}
}
const future=postingDates.nzToday(new Date(Date.now()+3*864e5))

test('the offer day and start time are prefilled, so Confirm is ready straight away',()=>{
 const s=sheet({availableFrom:future,availableTime:'09:00:00'})
 const when=s.all.find(n=>n.type==='ArrivalWhen')
 assert.equal(when.props.alwaysOpen,true)
 assert.equal(when.props.daySelected,true);assert.equal(when.props.timeSelected,true)
 assert.equal(when.props.value.getHours(),9)
 assert.equal(s.footer.find(n=>n.type==='Button').props.disabled,false)
 assert.equal(text(s.footer),'')
})

test('without an offer time, the footer says the arrival time is what is missing',()=>{
 const s=sheet({availableFrom:future})
 assert.equal(s.footer.find(n=>n.type==='Button').props.disabled,true)
 assert.match(text(s.footer),/Choose an arrival time to confirm\./)
})

test('with no day to start from, it asks for both',()=>{
 const s=sheet({})
 assert.match(text(s.footer),/Choose a day and an arrival time to confirm\./)
 assert.match(text(s.tree),/\(optional\)/)
})
