import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import * as duration from '../shared/bookingDuration.ts'
import {openBooking} from './support/booking-confirm-screen.mjs'
import {pricingSnapshot} from '../provider-web/src/lib/booking-detail.ts'
const {durationFields,durationEstimate,durationPolicy,bookingDurationSummary,mobilePricingSnapshot}=duration
const grazing={id:'listing',provider_id:'provider',kind:'grazing',title:'Grazing',pricing_type:'per_unit',rate:50,unit_label:'head/week',minimum_units:1,max_units:10}
test('grazing select offers exactly the requested week choices and Not sure yet is null',()=>{
 assert.deepEqual(duration.GRAZING_WEEKS,[1,2,4,6,8])
 for(const weeks of duration.GRAZING_WEEKS)assert.deepEqual(durationFields(grazing,String(weeks),'week'),{expected_duration:weeks,expected_duration_unit:'week'})
 assert.deepEqual(durationFields(grazing,'',''),{expected_duration:null,expected_duration_unit:null})
})
test('two head at $50/week for four weeks gives $100 weekly and $400 indicative total',()=>{
 assert.deepEqual(durationEstimate(grazing,2,4,'week'),{period:'week',periodAmount:100,total:400})
 assert.equal(durationEstimate(grazing,2,'','week').periodAmount,100)
 assert.equal(durationEstimate(grazing,2,'','week').total,null)
 assert.equal(durationEstimate({...grazing,min_charge:150},2,4,'week').total,400)
 assert.equal(durationEstimate({...grazing,min_charge:500},2,4,'week').total,500)
 assert.equal(durationEstimate({...grazing,min_charge:500},2,4,'week').periodAmount,100)
})
test('invalid durations, forged types, mismatched units and unsupported grazing choices are rejected',()=>{
 for(const [value,unit] of [[0,'week'],[-1,'week'],[3,'week'],[1.5,'week'],['NaN','week'],[Infinity,'week'],[true,'week'],[{},'week'],[4,'day'],['','week'],[10001,'week']])assert.throws(()=>durationFields(grazing,value,unit))
 const hourly={kind:'service',pricing_type:'hourly',rate:50,minimum_units:1}
 assert.throws(()=>durationFields(hourly,'1.234','hour'))
 assert.throws(()=>durationFields(hourly,3,'hour',2),/must match/)
 assert.deepEqual(durationFields(hourly,'1.25','hour',1.25),{expected_duration:1.25,expected_duration_unit:'hour'})
})
test('whole animal quantity and capacity validation remain independent of duration',async()=>{
 for(const quantity of [0,1.5,11,Infinity])assert.throws(()=>duration.validateGrazingQuantity(grazing,quantity))
 duration.validateGrazingQuantity(grazing,2)
 const screen=openBooking({service:grazing,quantity:1.5});await screen.press('Send booking request');assert.equal(screen.log.writes.length,0);assert.match(screen.log.alerts[0][1],/whole number/)
})
test('time-only rates count time once, per-item rates multiply periods, and minimum charges remain floors',()=>{
 for(const [rate,count,unit,total] of [[{kind:'hire',pricing_type:'day_rate',rate:50},4,'day',200],[{kind:'service',pricing_type:'hourly',rate:80,min_charge:200},2,'hour',200],[{kind:'hire',pricing_type:'per_unit',unit_label:'week',rate:50},4,'week',200]]){
  assert.equal(durationPolicy(rate).quantityIsTime,true)
  assert.equal(durationEstimate(rate,count,count,unit).total,total)
 }
 assert.equal(durationEstimate({kind:'hire',pricing_type:'per_unit',unit_label:'machine/day',rate:20},2,3,'day').total,120)
})
test('no conversions are invented for monthly grazing, quotes or unsupported units',()=>{
 assert.equal(durationEstimate({...grazing,unit_label:'head/month'},2,4,'week').total,null)
 assert.equal(durationEstimate({...grazing,pricing_type:'quote_required'},2,4,'week').total,null)
 assert.equal(durationPolicy({kind:'hire',pricing_type:'per_unit',unit_label:'load',rate:50}).enabled,false)
 for(const kind of ['for_sale','lease'])assert.equal(durationPolicy({kind,pricing_type:'day_rate',rate:50}).enabled,false)
 const fixed={kind:'service',pricing_type:'fixed',rate:50};assert.equal(durationPolicy(fixed).enabled,false);assert.throws(()=>durationFields(fixed,2,'day'))
})
test('native booking creation stores structured terms, frozen pricing and untouched notes',async()=>{
 const screen=openBooking({service:grazing,quantity:2})
 screen.find('ExpectedDurationControl').props.onChange('4')
 assert.equal(screen.all().find(n=>n.props?.label==='Estimated total').props.value,'$400')
 assert.equal(screen.all().find(n=>n.props?.label==='Estimated weekly cost').props.value,'$100')
 await screen.press('Send booking request')
 const payload=screen.log.writes[0].payload
 assert.equal(payload.expected_duration,4);assert.equal(payload.expected_duration_unit,'week');assert.equal(payload.total_amount,100)
 assert.equal(payload.pricing_snapshot.rate,50);assert.equal(payload.notes,null);assert.equal(payload.status,'pending')
})
test('native unsure duration remains optional; time-only duration maps to existing quantity',async()=>{
 const unsure=openBooking({service:grazing,quantity:2});await unsure.press('Send booking request')
 assert.equal(unsure.log.writes[0].payload.expected_duration,null)
 const fixed=openBooking({service:{...grazing,kind:'service',pricing_type:'fixed',unit_label:null}})
 assert.equal(fixed.find('ExpectedDurationControl'),undefined)
 fixed.find('AddressAutocomplete').props.onChangeText('Work address');await fixed.press('Send booking request')
 assert.ok(!('expected_duration' in fixed.log.writes[0].payload));assert.ok(!('pricing_snapshot' in fixed.log.writes[0].payload))
 const hire=openBooking({service:{...grazing,kind:'hire',pricing_type:'day_rate',unit_label:'day'}})
 hire.find('ExpectedDurationControl').props.onChange('4');await hire.press('Send booking request')
 assert.equal(hire.log.writes[0].payload.quantity,4);assert.equal(hire.log.writes[0].payload.total_amount,200)
 const invalid=openBooking({service:grazing});invalid.find('ExpectedDurationControl').props.onChange('3');await invalid.press('Send booking request');assert.equal(invalid.log.writes.length,0)
})
test('existing bookings do not gain invented duration or historical price, and new snapshots survive listing edits',()=>{
 const legacy=bookingDurationSummary({quantity:2,total_amount:100,service:grazing})
 assert.equal(legacy.duration,'To be agreed');assert.equal(legacy.total,null);assert.equal(legacy.periodAmount,null)
 const snapshot=mobilePricingSnapshot(grazing,null,2)
 for(const status of ['pending','confirmed','completed','withdrawn']){
  const summary=bookingDurationSummary({status,quantity:2,expected_duration:4,expected_duration_unit:'week',pricing_snapshot:snapshot,service:{...grazing,rate:900,unit_label:'head/month',kind:'hire'}})
  assert.equal(summary.duration,'4 weeks');assert.equal(summary.total,400);assert.equal(summary.periodAmount,100)
 }
 const web=pricingSnapshot(grazing,'',2);assert.deepEqual(web,snapshot)
})
test('native grazing picker exposes accessible exact choices, selection and cancellation',()=>{
 const require=createRequire(import.meta.url),jsx=(type,props)=>({type,props}),exports={},chosen=[]
 const code=require('@babel/core').transformSync(readFileSync(new URL('../src/components/ExpectedDurationControl.js',import.meta.url),'utf8'),{configFile:false,babelrc:false,presets:[['@babel/preset-react',{runtime:'automatic'}]],plugins:['@babel/plugin-transform-modules-commonjs']}).code
 const react={useState:()=>[true,()=>{}]};react.default=react
 new Function('exports','require',code)(exports,name=>name==='react'?{...react,__esModule:true}:name==='react/jsx-runtime'?{jsx,jsxs:jsx}:name==='react-native'?{...Object.fromEntries(['Modal','View','Text','TextInput','TouchableOpacity'].map(n=>[n,n])),StyleSheet:{create:v=>v}}:name.endsWith('/bookingDuration')?duration:{colors:{}})
 const tree=exports.default({grazing:true,unit:'week',value:'4',onChange:v=>chosen.push(v)}),nodes=n=>!n||typeof n!=='object'?[]:Array.isArray(n)?n.flatMap(nodes):[n,...nodes(n.props?.children)]
 const options=nodes(tree).filter(n=>n.props?.accessibilityRole==='radio');assert.equal(options.length,6)
 assert.equal(options[2].props.accessibilityState.selected,true);options[5].props.onPress();assert.deepEqual(chosen,[''])
})

const awaitedListingEstimate=await import('../shared/listingEstimate.ts'),awaitedQuantity=await import('../shared/bookingQuantity.ts')
function webForm(listing,value='',initialQuantity=2){
 const require=createRequire(import.meta.url),ts=require('typescript'),webRequire=createRequire(new URL('../provider-web/package.json',import.meta.url)),jsx=webRequire('react/jsx-runtime')
 const {renderToStaticMarkup}=webRequire('react-dom/server');let index=0
 const imports={'react/jsx-runtime':jsx,react:{useState:v=>[index++===6?value:v,()=>{}]},'@shared/bookingDuration':duration,'@shared/listingEstimate':awaitedListingEstimate,'@shared/bookingQuantity':awaitedQuantity,
  '@shared/bookingLocation':requireModules.location,'@shared/findLocalHelp':requireModules.help,'@shared/formatting':requireModules.formatting,'@shared/listingPricing':requireModules.pricing,
  '@/lib/booking-detail':requireModules.detail,'@/lib/booking-estimate':requireModules.estimate,
  '@/components/date-input':{DateInput:()=>null},'../../../work-actions':{requestBooking(){throw Error('No form submission during render')}},
  '@/components/action-form':{ActionForm:({children,label})=>jsx.jsxs('form',{children:[children,jsx.jsx('button',{children:label})]})}}
 const code=ts.transpileModule(readFileSync(new URL('../provider-web/src/app/browse/[id]/request/request-form.tsx',import.meta.url),'utf8'),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS}}).outputText,exports={}
 new Function('exports','require',code)(exports,name=>{assert.ok(name in imports,name);return imports[name]})
 return renderToStaticMarkup(jsx.jsx(exports.RequestForm,{listing,requestId:'request',initialQuantity}))
}
const requireModules={location:await import('../shared/bookingLocation.ts'),help:await import('../shared/findLocalHelp.ts'),formatting:await import('../shared/formatting.js'),pricing:await import('../shared/listingPricing.ts'),detail:await import('../provider-web/src/lib/booking-detail.ts'),estimate:await import('../provider-web/src/lib/booking-estimate.ts')}
test('web grazing form presents accessible week options, weekly cost and indicative total',()=>{
 const html=webForm(grazing,'4')
 assert.match(html,/Estimated weekly cost: \$100/);assert.match(html,/Estimated total: \$400/)
 assert.match(html,/name="expected_duration"/);assert.match(html,/name="expected_duration_unit" value="week"/)
 for(const value of [1,2,4,6,8])assert.match(html,new RegExp(`option value="${value}"`))
 assert.match(html,/Not sure yet/);assert.match(html,/step="1"/);assert.match(html,/max="10"/)
 assert.match(webForm(grazing),/Estimated total: To be agreed/)
})
test('web time-only hire uses one time quantity; fixed-price service remains unchanged',()=>{
 const hire=webForm({...grazing,kind:'hire',pricing_type:'day_rate',unit_label:'day'},'4')
 assert.match(hire,/name="quantity" value="4"/);assert.match(hire,/Estimated total: \$200/)
 const fixed=webForm({...grazing,kind:'service',pricing_type:'fixed'})
 assert.doesNotMatch(fixed,/name="expected_duration"|Estimated total:/)
})

for(const quantity of [1.5,11])test(`combined grazing duration cannot bypass mobile quantity validation (${quantity})`,async()=>{
 const screen=openBooking({service:grazing,quantity})
 screen.find('ExpectedDurationControl').props.onChange('4')
 await screen.press('Send booking request');assert.equal(screen.log.writes.length,0)
 assert.equal(screen.find('Button',p=>p.title==='Send booking request').props.disabled,true)
 assert.match(screen.texts(),/Unavailable until the quantity is valid/)
})
for(const quantity of [1.5,11])test(`combined web duration does not show an indicative total for invalid grazing quantity (${quantity})`,()=>{
 const html=webForm(grazing,'4',quantity)
 assert.match(html,/Estimated total: Unavailable until the quantity is valid/)
 assert.match(html,/role="alert"/)
})
