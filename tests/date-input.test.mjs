import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {createRequire} from 'node:module'
import vm from 'node:vm'
import * as formatting from '../shared/formatting.js'
import * as dates from '../shared/dates.ts'
const require=createRequire(import.meta.url),ts=require('typescript')
const webRequire=createRequire(new URL('../provider-web/package.json',import.meta.url))
const React=webRequire('react'),jsx=webRequire('react/jsx-runtime'),{renderToStaticMarkup}=webRequire('react-dom/server')
const source=await readFile(new URL('../provider-web/src/components/date-input.tsx',import.meta.url),'utf8')
const code=ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
const module={exports:{}}
vm.runInNewContext(code,{exports:module.exports,require(name){if(name==='react')return React;if(name==='react/jsx-runtime')return jsx;if(name==='@shared/formatting')return formatting;if(name==='@shared/dates')return dates;throw Error(name)}})
test('native date controls retain ISO submission values and echo an unambiguous NZ date',()=>{
 const html=renderToStaticMarkup(React.createElement(module.exports.DateInput,{name:'scheduled_date',value:'2026-12-01',onChange(){},min:'2026-11-03','aria-invalid':true,'aria-describedby':'date-error'}))
 assert.match(html,/value="2026-12-01"/)
 assert.match(html,/1 Dec 2026/)
 assert.match(html,/lang="en-NZ"/)
 assert.match(html,/aria-describedby="date-error"/)
 assert.match(html,/min="2026-11-03"/)
})
test('empty and optional dates show a format hint without inventing a selection',()=>{
 const html=renderToStaticMarkup(React.createElement(module.exports.DateInput,{name:'available_from',defaultValue:''}))
 assert.match(html,/Choose a date/)
 assert.match(html,/value=""/)
})
