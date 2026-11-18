type PreviewArea={label:string;linkedCount:number;needsHelp:boolean;configured:boolean}
export function homeNetworkSummary(areas:PreviewArea[]){
 const linked=areas.filter(area=>area.linkedCount>0).length
 const gaps=areas.filter(area=>area.needsHelp)
 const counts=linked+' '+(linked===1?'area':'areas')+' with providers · '+gaps.length+' '+(gaps.length===1?'area needs':'areas need')+' help'
 const detail=gaps.length
  ?gaps.slice(0,2).map(area=>area.label).join(gaps.length>2?', ':' and ')+(gaps.length>2?' and '+(gaps.length-2)+' more need support.':gaps.length===1?' needs support.':' need support.')
  :linked||areas.some(area=>area.configured)?'No support gaps marked.':'Start building your network by setting up a support area.'
 return {counts,detail}
}

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

type CountQuery={eq:(key:string,value:string)=>CountQuery;neq:(key:string,value:string)=>PromiseLike<{count:number|null;error:unknown}>}
export async function homeCustomerCount(client:unknown,owner:string){
 const db=client as {from:(table:string)=>{select:(field:string,options:{head:true;count:'exact'})=>CountQuery}}
 try{
  const {count,error}=await db.from('connections').select('requester_id',{head:true,count:'exact'})
   .eq('provider_id',owner).neq('requester_id',owner)
  return error?null:count
 }catch{return null}
}
