import {readFile} from 'node:fs/promises'
import {stripTypeScriptTypes} from 'node:module'
const url=source=>'data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(source)).toString('base64')
const file=name=>new URL('../provider-web/src/'+name,import.meta.url)
export const discoveryUrl=url((await readFile(file('lib/discovery.ts'),'utf8')).replace("'@shared/categories'",JSON.stringify(new URL('../shared/categories.ts',import.meta.url).href)))
export const dataUrl=url((await readFile(file('lib/discovery-data.ts'),'utf8')).replace("'./discovery'",JSON.stringify(discoveryUrl)))
export const connectionsUrl=url((await readFile(file('lib/connections-data.ts'),'utf8')).replace("'./discovery-data'",JSON.stringify(dataUrl)))
const originSource=(await readFile(file('lib/browsing-origin.ts'),'utf8')).replace("import {cookies} from 'next/headers'","const cookies=async()=>globalThis.__discoveryCookies").replace("'./discovery'",JSON.stringify(discoveryUrl)).replace("'./discovery-data'",JSON.stringify(dataUrl))
export const originUrl=url(originSource)
const jobUrl=url((await readFile(file('lib/job-input.ts'),'utf8')).replace("'@shared/categories'",JSON.stringify(new URL('../shared/categories.ts',import.meta.url).href)))
const authReplace=source=>source.replace("import {requireProvider} from '@/lib/auth'","const requireProvider=async()=>globalThis.__discoveryAuth").replace("import {revalidatePath} from 'next/cache'","const revalidatePath=()=>{}").replace("import {redirect} from 'next/navigation'","const redirect=path=>{throw new Error('REDIRECT:'+path)}").replace("'@/lib/job-input'",JSON.stringify(jobUrl))
export const actionsUrl=url(authReplace(await readFile(file('app/discovery-actions.ts'),'utf8')).replace("import {cookies} from 'next/headers'","const cookies=async()=>globalThis.__discoveryCookies").replace("'@/lib/discovery'",JSON.stringify(discoveryUrl)).replace("'@/lib/discovery-data'",JSON.stringify(dataUrl)).replace("'@/lib/browsing-origin'",JSON.stringify(originUrl)))
export const invitesUrl=url(authReplace(await readFile(file('app/connections/actions.ts'),'utf8')))
export const discovery=await import(discoveryUrl),data=await import(dataUrl),connections=await import(connectionsUrl),actions=await import(actionsUrl),invites=await import(invitesUrl),origin=await import(originUrl)
