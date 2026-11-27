export const HOME_WORK_INDICATORS=[
 {id:'invitations',label:'Invitations to review',href:'/connections/invitations'},
 {id:'offers',label:'Offers awaiting replies',href:'/activity?focus=offers'},
 {id:'upcoming',label:'Upcoming confirmed',href:'/activity?focus=upcoming'},
 {id:'work',label:'Active work',href:'/activity?focus=work'},
] as const
type Indicator=typeof HOME_WORK_INDICATORS[number]
export type HomeWorkFocus=Exclude<Indicator['id'],'invitations'>
export function homeWorkFocus(value:unknown):HomeWorkFocus|null{
 return value==='offers'||value==='upcoming'||value==='work'?value:null
}
export const homeWorkLabel=(focus:HomeWorkFocus)=>HOME_WORK_INDICATORS.find(item=>item.id===focus)!.label
export function homeUpcoming(tone:string,kind:'job'|'booking',arrivalAt?:string|null,now=Date.now()){
 return tone==='scheduled'&&(kind==='booking'||(!!arrivalAt&&Date.parse(arrivalAt)>=now))
}
export function homeWorkSummary(counts:Record<Indicator['id'],number|null>){
 return {
  indicators:HOME_WORK_INDICATORS.flatMap(item=>{
   const count=counts[item.id]
   return count!==null&&count>0?[{...item,count}]:[]
  }),
  unavailable:HOME_WORK_INDICATORS.some(item=>counts[item.id]===null),
 }
}

// Attention comes from the existing lifecycle's needsAction flag, never from
// notification read state. Informational history stays in Notifications.
// `unread` only changes the wording: "all caught up" beside a bell showing
// unread updates reads as a contradiction, so say what is actually true.
// `otherMode` names the other Home mode when it has items waiting, so an empty
// mode doesn't claim "nothing needs your action" overall.
export function homeAttentionSummary<T extends {needsAction:boolean}>(moves:readonly T[]|null, additional:number|null=0, unread:number|null=0, otherMode?:{label:string;count:number}|null){
 const items=(moves||[]).filter(item=>item.needsAction)
 const count=moves===null||additional===null?null:items.length+additional
 const updates=unread&&unread>0?unread:0
 const elsewhere=otherMode&&otherMode.count>0?` ${otherMode.count} ${otherMode.count===1?'item needs':'items need'} you in ${otherMode.label}.`:''
 return {items,count,text:count===null?'Activity summary unavailable. Refresh to try again.':
  count===0?(elsewhere?`Nothing needs your action here.${elsewhere}`:updates?`Nothing needs your action. ${updates} unread ${updates===1?'update':'updates'} in Notifications.`:"You're all caught up."):`${count} ${count===1?'item needs':'items need'} your attention.`}
}

type CountQuery={eq:(key:string,value:string)=>CountQuery;neq:(key:string,value:string)=>PromiseLike<{count:number|null;error:unknown}>}
export async function homeCustomerCount(client:unknown,owner:string){
 const db=client as {from:(table:string)=>{select:(field:string,options:{head:true;count:'exact'})=>CountQuery}}
 try{
  const {count,error}=await db.from('connections').select('requester_id',{head:true,count:'exact'})
   .eq('provider_id',owner).neq('requester_id',owner)
  return error?null:count
 }catch{return null}
}

// My Property empty state. Shown only when there is no work in flight (no jobs
// or bookings in any active state — open, awaiting a provider, booked or under
// way all appear in On the go). When the Property Network has "Need help"
// items it says so, rather than a "nothing here" that contradicts that line.
export function homePropertyEmpty(helpCount:number){
 return helpCount>0
  ?{title:'No jobs posted yet',body:`Post a job for the ${helpCount} ${helpCount===1?'thing':'things'} you need help with, or find local help.`}
  :{title:'No active work yet',body:'Post a job or find local help to get started.'}
}
