export type Point={latitude:number;longitude:number}
export type GuestLocation={point:Point|null;label:string;radius:number|null}
export const NEARBY_RADII=[10,25,50,100,200]
export const DEFAULT_RADIUS=50
export function point(latitude:unknown,longitude:unknown):Point|null{
  if(typeof latitude!=='number'||typeof longitude!=='number'||!Number.isFinite(latitude)||!Number.isFinite(longitude)||Math.abs(latitude)>90||Math.abs(longitude)>180)return null
  return {latitude,longitude}
}
export function distance(a:Point,b:Point){const r=Math.PI/180,x=(b.latitude-a.latitude)*r,y=(b.longitude-a.longitude)*r,h=Math.sin(x/2)**2+Math.cos(a.latitude*r)*Math.cos(b.latitude*r)*Math.sin(y/2)**2;return 6371*2*Math.atan2(Math.sqrt(Math.min(1,h)),Math.sqrt(Math.max(0,1-h)))}
export function readGuestLocation(raw:string|undefined,now=Date.now()):GuestLocation{
  const fallback={point:null,label:'',radius:DEFAULT_RADIUS}
  try{const v=JSON.parse(raw || '');if(!Number.isFinite(v.expires)||v.expires<=now)return fallback
    return {point:point(v.latitude,v.longitude),label:typeof v.label==='string'?v.label.slice(0,120):'',radius:v.radius===null?null:NEARBY_RADII.includes(v.radius)?v.radius:DEFAULT_RADIUS}
  }catch{return fallback}
}
