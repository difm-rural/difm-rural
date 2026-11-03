// Only authored changes count as a recoverable draft. Defaults and untouched
// edit/repeat seeds must not interrupt the next visit to the form.
type Fields=Record<string,string|boolean|string[]>
const normalise=(value:string|boolean|string[])=>Array.isArray(value)
 ? value.map(item=>item.trim()).filter(Boolean)
 : typeof value==='string'?value.trim():value
export function hasJobDraftChanges(draft:Fields,initial:Fields):boolean{
 return Object.keys(initial).some(key=>JSON.stringify(normalise(draft[key]??initial[key]))!==JSON.stringify(normalise(initial[key])))
}
export function readJobDraft<T extends Fields>(raw:string|null,initial:T):{draft:T;id:string}|null{
 if(!raw)return null
 try{
  const value=JSON.parse(raw)
  if(!value||typeof value.id!=='string'||!value.id.trim()||!value.draft||typeof value.draft!=='object'||Array.isArray(value.draft))return null
  const draft={...initial}
  for(const key of Object.keys(initial)){
   const field=value.draft[key]
   if(field===undefined)continue
   if(Array.isArray(initial[key])? !Array.isArray(field)||field.some((item:unknown)=>typeof item!=='string') : typeof field!==typeof initial[key])return null
   draft[key as keyof T]=field
  }
  return hasJobDraftChanges(draft,initial)?{draft,id:value.id}:null
 }catch{return null}
}
