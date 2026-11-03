// Track only same-origin page changes, not downloads, external URLs or hash jumps.
export function navigationTarget(href:unknown,currentUrl:string):string|null{
 try{
  const current=new URL(currentUrl)
  let target:string
  if(typeof href==='string')target=href
  else if(href&&typeof href==='object'){
   const value=href as {pathname?:string;search?:string;query?:Record<string,unknown>;hash?:string;protocol?:string;host?:string;hostname?:string}
   if(value.protocol||value.host||value.hostname)return null
   const query=new URLSearchParams()
   for(const [key,item] of Object.entries(value.query||{}))for(const v of Array.isArray(item)?item:[item])if(v!==undefined&&v!==null)query.append(key,String(v))
   target=(value.pathname||current.pathname)+(value.search||(query.size?'?'+query:''))+(value.hash||'')
  }else return null
  const url=new URL(target,current)
  if(url.origin!==current.origin||!['http:','https:'].includes(url.protocol)||url.pathname.startsWith('/auth/'))return null
  const path=url.pathname+url.search
  return path===current.pathname+current.search?null:path
 }catch{return null}
}
