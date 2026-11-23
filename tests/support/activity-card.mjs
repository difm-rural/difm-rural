import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import {bookingNextMove} from '../../shared/nextMove.ts'
const require=createRequire(import.meta.url)
const source=readFileSync(new URL('../../src/components/JobServiceCard.js',import.meta.url),'utf8')
const code=require('@babel/core').transformSync(source,{configFile:false,babelrc:false,presets:[['@babel/preset-react',{runtime:'automatic'}]],plugins:['@babel/plugin-transform-modules-commonjs']}).code
const element=(type,props)=>({type,props})
const react={__esModule:true,default:{}}
const modules={'../../shared/findLocalHelp':await import('../../shared/findLocalHelp.ts'),react,'react/jsx-runtime':{jsx:element,jsxs:element,Fragment:'Fragment'},'react-native':{StyleSheet:{create:v=>v},Alert:{alert(){}},...Object.fromEntries(['Image','Text','TouchableOpacity','View'].map(n=>[n,n]))},'../theme/tokens':{colors:{}},'./JobPrimaryImage':{__esModule:true,default:'JobPrimaryImage',showJobPrimaryMedia:false},'./ThumbImage':{__esModule:true,default:'ThumbImage'},'./Icon':{__esModule:true,default:'Icon'},'../lib/location':{stripPlusCode:s=>s},'../lib/categoryImages':{categoryImage:()=>null},'../lib/lifecycle':await import('../../src/lib/lifecycle.js'),'../lib/providerAvailability':await import('../../shared/providerAvailability.ts'),'../../shared/listingPricing':await import('../../shared/listingPricing.ts'),'../../shared/listingCardCopy':await import('../../shared/listingCardCopy.ts'),'../../shared/formatting.js':await import('../../shared/formatting.js'),'../../shared/nextMove':await import('../../shared/nextMove.ts')}
const exp={};new Function('exports','require',code)(exp,name=>{if(!(name in modules))throw Error('Missing '+name);return modules[name]})
export const nodes=n=>!n||typeof n!=='object'?[]:Array.isArray(n)?n.flatMap(nodes):[n,...nodes(n.props?.children)]
export const flattenStyle=value=>Object.assign({},...[value].flat(Infinity).filter(Boolean))
export function activityCard(fullWidth,onPress){return exp.default({fullWidth,onPress,item:{id:'grazing',_type:'service',kind:'grazing',title:'Long grazing listing for winter animals',photos:['photo'],pricing_type:'per_unit',rate:50,unit_label:'head/week',profile:{full_name:'Peter Provider Longname'}},status:'pending',showStatusBadge:true,nextMove:bookingNextMove({status:'pending',service:{kind:'grazing'}},'requester',{otherName:'Peter Provider Longname'})})}
