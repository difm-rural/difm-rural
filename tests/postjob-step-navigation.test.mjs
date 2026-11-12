import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {createRequire} from 'node:module'
import vm from 'node:vm'
const require=createRequire(import.meta.url)
const source=await readFile(new URL('../src/screens/postjob/PostJobHeader.js',import.meta.url),'utf8')
const code=require('@babel/core').transformSync(source,{configFile:false,babelrc:false,presets:[['@babel/preset-react',{runtime:'automatic'}]],plugins:['@babel/plugin-transform-modules-commonjs']}).code
for(const first of ['PostJob','GuestPostJob'])test(`mobile completed Basics returns to registered ${first} route`,()=>{
 const calls=[],module={exports:{}}
 const jsx=(type,props)=>({type,props})
 vm.runInNewContext(code,{exports:module.exports,require(name){
  if(name==='react')return {}
  if(name==='react/jsx-runtime')return {jsx,jsxs:jsx}
  if(name==='react-native')return {StyleSheet:{create:value=>value},View:'View',Text:'Text',TouchableOpacity:'Button'}
  if(name==='@react-navigation/native')return {useNavigation:()=>({getState:()=>({routeNames:[first,'PostJobStep2Location']}),popTo:name=>calls.push(name)})}
  if(name==='react-native-safe-area-context')return {useSafeAreaInsets:()=>({top:0})}
  if(name==='../../theme/tokens')return {colors:{}}
  if(name==='../../components/Icon'||name==='../../components/AiJobAssistant'||name==='../../components/SideHeader')return {default:()=>null,__esModule:true}
  throw Error(name)
 }})
 const tree=module.exports.default({currentStep:3,onBack(){}})
 const nodes=node=>!node||typeof node!=='object'?[]:[node,...[node.props?.children].flat(Infinity).filter(c=>c!==undefined).flatMap(nodes)]
 const basics=nodes(tree).find(n=>n.props?.accessibilityLabel==='Go to Basics')
 assert.equal(basics.props.disabled,false);basics.props.onPress();assert.deepEqual(calls,[first])
 assert.equal(nodes(tree).find(n=>n.props?.accessibilityLabel==='Go to Review').props.disabled,true)
})
