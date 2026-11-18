import {jobDraftCategory} from './categories'
import {POSTING_DESCRIPTION_MAX,POSTING_TITLE_MAX} from './postingText'

type DraftFields = {title:string;description:string;category:string}

export function fillJobDraftFields(current:DraftFields,suggestion:Partial<Record<keyof DraftFields,unknown>>){
 const clean=(value:unknown,max:number)=>typeof value==='string'?value.trim().slice(0,max):''
 const candidate={
  title:clean(suggestion.title,POSTING_TITLE_MAX),
  description:clean(suggestion.description,POSTING_DESCRIPTION_MAX),
  category:jobDraftCategory(suggestion.category),
 }
 if(!candidate.title&&!candidate.description&&!candidate.category)return null
 const fields={
  title:current.title.trim()?current.title:candidate.title,
  description:current.description.trim()?current.description:candidate.description,
  category:current.category.trim()?current.category:candidate.category,
 }
 return {fields,changed:Object.keys(fields).some(key=>fields[key as keyof DraftFields]!==current[key as keyof DraftFields])}
}
