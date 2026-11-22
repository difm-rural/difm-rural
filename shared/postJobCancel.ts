// Cancelling the Post a Job wizard: has anything been entered or changed, what to
// ask, and how to leave. No React here, so every step and entry path is testable.
import { nzCalendarDay } from './postingDates'

type Draft=Record<string,unknown>
type Route={name:string;params?:object}
type StackState={index:number;routes:readonly Route[];routeNames:readonly string[]}

export const POST_JOB_START=['PostJob','GuestPostJob']

const text=(value:unknown)=>String(value??'').trim()
const photo=(value:unknown)=>typeof value==='string'?value:text((value as {uri?:string}|null)?.uri)

// What the member enters, each reduced to a comparable form. Left out on purpose:
// values the wizard works out itself (public area, hectares, job id, invite target).
const FIELDS:Record<string,(value:unknown)=>string>={
 title:text,category:text,description:text,locationNote:text,jobAddress:text,
 scheduleType:text,priceType:text,price:text,
 scheduledDate:value=>nzCalendarDay(value)??'',dateFrom:value=>nzCalendarDay(value)??'',dateTo:value=>nzCalendarDay(value)??'',
 latitude:value=>value?String(Number(value)):'',longitude:value=>value?String(Number(value)):'',
 areaPolygon:value=>Array.isArray(value)&&value.length?JSON.stringify(value):'',
 photos:value=>Array.isArray(value)?value.map(photo).join('\n'):'',
 primaryPhoto:value=>value?photo(value)||'photo':'',
 // Budget picks "No materials needed" by itself, so that is the same as no choice.
 materialsType:value=>text(value)==='none'?'':text(value),
 accessConditions:value=>Array.isArray(value)?[...value].sort().join('\n'):'',
 hideExactLocation:value=>value?'yes':'',
}

// No baseline means no wizard is open (or it has just been saved): nothing to lose.
export function jobDraftChanged(baseline:Draft|null|undefined,draft:Draft){
 return !!baseline&&Object.entries(FIELDS).some(([key,same])=>same(baseline[key])!==same(draft[key]))
}

export function cancelPrompt(isEdit:boolean){
 return isEdit
  ?{title:'Discard your changes?',message:'Any changes you haven’t saved will be lost. The job itself is kept.',discard:'Discard changes',keep:'Keep editing'}
  :{title:'Discard this job?',message:'Everything you’ve entered for this job will be lost.',discard:'Discard job',keep:'Keep editing'}
}

// The wizard's first screen decides the mode: a later screen can lose its params.
const start=(state:StackState)=>{
 for(let i=state.index;i>=0;i--)if(POST_JOB_START.includes(state.routes[i].name))return i
 return -1
}
export function wizardIsEdit(state:StackState){
 const first=start(state)
 return first>=0&&(state.routes[first].params as {mode?:string}|undefined)?.mode==='edit'
}

// Leave for whatever is under Step 1, however many screens are above it. Opened
// straight into an unvisited tab there is nothing under it: show the tab's root.
export function wizardExit(state:StackState):{pop:number}|{root:string}{
 const first=start(state)
 return first>0?{pop:state.index-first+1}:{root:state.routeNames[0]}
}
