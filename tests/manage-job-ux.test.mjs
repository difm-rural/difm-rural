import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import {jobNextMove} from '../shared/nextMove.ts'
const require=createRequire(import.meta.url)
const source=readFileSync(new URL('../src/screens/ManageTaskScreen.js',import.meta.url),'utf8')
const code=require('@babel/core').transformSync(source,{configFile:false,babelrc:false,plugins:['@babel/plugin-transform-react-jsx','@babel/plugin-transform-modules-commonjs']}).code
const stateNames=[...source.matchAll(/const \[([^,]+),[^\]]+\] = useState/g)].map(match=>match[1])
const nodes=value=>!value||typeof value!=='object'?[]:Array.isArray(value)?value.flatMap(nodes):[value,...nodes(value.props?.children)]
function screen(overrides={}) {
 const values={job:{id:'j',requester_id:'me',status:'open',title:'A very long rural job title '.repeat(8),category:'Fencing',location_name:'Exact farm address',price_type:'fixed',price:250,...overrides.job},authChecked:true,currentUserId:'me',bids:[],invites:[],questionCount:0,...overrides}
 values.job={id:'j',requester_id:'me',status:'open',title:'A very long rural job title '.repeat(8),category:'Fencing',location_name:'Exact farm address',price_type:'fixed',price:250,...overrides.job}
 let at=0,tree
 const log={navigate:[],alerts:[],share:[]}
 const react={createElement:(type,props,...children)=>typeof type==='function'?type({...props,children}):({type,props:{...props,children}}),useState:init=>{const name=stateNames[at++];return [name in values?values[name]:init,next=>values[name]=typeof next==='function'?next(values[name]):next]},useRef:init=>({current:init}),useEffect(){},useCallback:fn=>fn}
 const mocks={react,'react-native':{StyleSheet:{create:v=>v},Alert:{alert:(...v)=>log.alerts.push(v)},Share:{share:v=>log.share.push(v)},...Object.fromEntries(['Text','View','ScrollView','Image','TouchableOpacity'].map(v=>[v,v]))},'@react-navigation/native':{useFocusEffect(){}},'react-native-safe-area-context':{useSafeAreaInsets:()=>({top:0,bottom:0})},'../lib/lifecycle':{isJobAwarded:status=>['accepted','in_progress','awaiting_completion'].includes(status),isJobActive:status=>['open','accepted','in_progress'].includes(status),jobStatusLabel:status=>status},'../lib/nextMove':{jobNextMove},'../theme/tokens':{colors:{}},'../../shared/formatting.js':{formatMoney:v=>`$${v}`,formatDate:v=>v},'../lib/offers':{formatOfferAmount:v=>`$${v}`},'../../shared/jobReviewStatus':{jobReviewStatus:()=>[]},'../../shared/paymentAcknowledgement':{paymentAcknowledgementAvailable:()=>true}}
 const module={exports:{}}
 new Function('require','module','exports',code)(name=>mocks[name]??(name.includes('components/')?{__esModule:true,default:name.split('/').at(-1),JobArrangementSummary:'JobArrangementSummary',JobStatusNotice:'JobStatusNotice'}:{}),module,module.exports)
 const render=()=>{at=0;tree=module.exports.default({route:{params:{job:values.job,bidCount:values.bids.length}},navigation:{navigate:(...v)=>log.navigate.push(v),goBack(){}}});return nodes(tree)}
 return {render,values,log,press(label){const node=render().find(n=>(n.props?.accessibilityLabel===label||n.props?.label===label));assert.ok(node,label);node.props.onPress()},text(){return render().filter(n=>n.type==='Text').flatMap(n=>n.props.children).join(' ')}}
}
test('open without offers: one status, compact performance, accessible edit/share and collapsed details',()=>{
 const s=screen();const n=s.render();assert.equal(n.filter(v=>v.type==='NextMoveBanner').length,1)
 assert.equal(n.find(v=>v.type==='NextMoveBanner').props.nextMove.label,'Waiting for offers')
 assert.equal(n.find(v=>v.type==='ListingPerformanceCard').props.compact,true)
 assert.ok(!s.text().includes('Job summary'));s.press('Edit job');assert.equal(s.log.navigate[0][0],'PostJob')
 s.press('Share job');assert.equal(s.log.share.length,1)
 assert.ok(!s.text().includes('Exact farm address'));s.press('Job details');assert.ok(s.text().includes('Exact farm address'));s.press('Job details');assert.ok(!s.text().includes('Exact farm address'))
 s.press('More actions');assert.ok(s.render().some(v=>v.props?.accessibilityLabel==='Delete job'));assert.ok(s.render().some(v=>v.props?.accessibilityLabel==='Cancel job'))
})
const bid=id=>({id,provider_id:id,amount:200,provider:{full_name:'A very long provider name '.repeat(5)}})
test('multiple offers retain individual amounts, profile and acceptance confirmations before supporting content',()=>{
 const s=screen({bids:[bid('a'),bid('b')]});const n=s.render();assert.equal(n.filter(v=>v.props?.accessibilityLabel?.startsWith('Accept offer from')).length,2)
 s.press('Accept offer from '+bid('a').provider.full_name);assert.equal(s.log.alerts[0][0],'Accept offer?')
 s.press('More actions');assert.ok(!s.render().some(v=>v.props?.accessibilityLabel==='Delete job'))
 assert.ok(n.findIndex(v=>v.props?.accessibilityLabel?.startsWith('Accept offer from'))<n.findIndex(v=>v.props?.accessibilityLabel==='Job details'))
})
test('unanswered questions are actionable while offer acceptance stays available',()=>{
 const s=screen({questionCount:1,bids:[bid('a')]});s.press('Waiting on you: answer provider questions');assert.equal(s.log.navigate[0][0],'JobDetail');assert.equal(s.log.navigate[0][1].fromManage,true)
 assert.ok(s.render().some(v=>v.props?.accessibilityLabel?.startsWith('Accept offer from')))
})
for(const sorted of [null,'2026-11-23'])test('accepted provider: single status, chat before payment, payment attribution retained '+sorted,()=>{
 const s=screen({job:{status:'accepted'},acceptedBid:{bidId:'b',providerId:'p',providerName:'Peter Very Long Name',bidAmount:200,paymentSortedAt:sorted,paymentSortedBy:'me'}});const n=s.render()
 assert.equal(n.filter(v=>v.type==='NextMoveBanner').length,1);assert.ok(!s.text().includes('Job summary'))
 assert.ok(n.findIndex(v=>v.props?.onPress&&v.props.accessibilityLabel==='Chat with Peter')<n.findIndex(v=>v.type==='JobPaymentHandoff'))
 const payment=n.find(v=>v.type==='JobPaymentHandoff');assert.equal(payment.props.sortedAt,sorted);assert.equal(payment.props.sortedBy,'me')
 s.press('Chat with Peter');assert.equal(s.log.navigate[0][0],'Chat')
})
test('later lifecycle retains schedule/review actions and expanded original details',()=>{
 const s=screen({job:{status:'completed'}});assert.ok(s.render().some(v=>v.props?.accessibilityLabel==='Review provider'));assert.ok(s.text().includes('Job summary'))
})

