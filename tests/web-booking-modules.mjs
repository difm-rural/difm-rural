import {readFile} from 'node:fs/promises'
import {stripTypeScriptTypes} from 'node:module'
const resolveShared=s=>s.replace(/(['"])@shared\/([^'"]+)\1/g,(_,q,name)=>JSON.stringify(new URL('../shared/'+name+(/\.[jt]s$/.test(name)?'':'.ts'),import.meta.url).href))
const source=resolveShared((await readFile(new URL('../provider-web/src/lib/booking-detail.ts',import.meta.url),'utf8')).replace("'./booking-estimate'",JSON.stringify(new URL('../provider-web/src/lib/booking-estimate.ts',import.meta.url).href)))
export const bookingDetailUrl='data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(source)).toString('base64')
export const bookingDetail=await import(bookingDetailUrl)
