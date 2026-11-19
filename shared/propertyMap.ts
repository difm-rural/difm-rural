export type Point={latitude:number;longitude:number}
export type Camera=Point&{zoom:number}
export const FEATURE_TYPES={
 tank:{label:'Water tank',icon:'◉'},pump:{label:'Water pump',icon:'⚙'},trough:{label:'Trough',icon:'▰'},
 gate:{label:'Gate',icon:'▥'},building:{label:'Building or shed',icon:'⌂'},driveway:{label:'Driveway',icon:'↗'},
}
export type FeatureKind=keyof typeof FEATURE_TYPES
export type Feature={id:string;kind:FeatureKind;name:string;points:Point[]}
export type PropertyMap={
 name:string;propertyType:string;areaHa:string;paddocks:string;water:string;livestock:string;surface:string
 camera:Camera;pin:Point|null;boundary:Point[];features:Feature[]
}
export const EMPTY_PROPERTY:PropertyMap={
 name:'',propertyType:'',areaHa:'',paddocks:'',water:'',livestock:'',surface:'',
 camera:{latitude:-41.2,longitude:173.8,zoom:5},pin:null,boundary:[],features:[],
}
export const FIELD_LABELS={
 name:'Property name',propertyType:'Property type',areaHa:'Land area in hectares',paddocks:'Number of paddocks',
 water:'Water source',livestock:'Livestock types',surface:'Driveway surface',
}
export const PROPERTY_TYPES=['Lifestyle block','Farm','Rural residential']
export const LINZ_COPYRIGHT='© LINZ CC BY 4.0'
export const LINZ_COPYRIGHT_URL='https://www.linz.govt.nz/linz-copyright'
export const LINZ_ATTRIBUTION='Imagery Basemap contributors'
export const LINZ_ATTRIBUTION_URL='https://www.linz.govt.nz/products-services/data/licensing-and-using-data/attributing-linz-basemaps-data'
export const MAX_VERTICES=100, MAX_FEATURES=50
const DEG=Math.PI/180, EARTH=6371008.8
export const validMapPoint=(p:Point|null):p is Point=>!!p&&Number.isFinite(p.latitude)&&Number.isFinite(p.longitude)&&Math.abs(p.latitude)<=85&&Math.abs(p.longitude)<=180
export function mapPointInput(text:string):Point|null{
 const values=text.split(',').map(value=>value.trim())
 if(values.length!==2||values.some(value=>!value))return null
 const p={latitude:Number(values[0]),longitude:Number(values[1])}
 return validMapPoint(p)?p:null
}
export function propertyAreaHa(points:Point[]){
 if(points.length<3)return 0
 const origin=points[0]
 const projected=points.map(p=>({x:(p.longitude-origin.longitude)*DEG*EARTH*Math.cos(origin.latitude*DEG),y:(p.latitude-origin.latitude)*DEG*EARTH}))
 return Math.abs(projected.reduce((total,p,i)=>{
  const q=projected[(i+1)%projected.length]
  return total+p.x*q.y-q.x*p.y
 },0))/20000
}
export function drivewayMetres(points:Point[]){
 return points.slice(1).reduce((total,b,index)=>{
  const a=points[index]
  const h=Math.sin((b.latitude-a.latitude)*DEG/2)**2+
    Math.cos(a.latitude*DEG)*Math.cos(b.latitude*DEG)*Math.sin((b.longitude-a.longitude)*DEG/2)**2
  return total+2*EARTH*Math.asin(Math.min(1,Math.sqrt(h)))
 },0)
}
export function propertyMapError(p:PropertyMap){
 if(p.areaHa!==''&&(!/^[0-9]{1,7}(\.[0-9]{1,8})?$/.test(p.areaHa)||Number(p.areaHa)>1000000))return 'Enter a land area between 0 and 1,000,000 hectares.'
 if(p.paddocks!==''&&(!/^[0-9]{1,6}$/.test(p.paddocks)||Number(p.paddocks)>100000))return 'Enter a whole number of paddocks.'
 if(JSON.stringify(p).length>110000)return 'There are too many drawn points. Remove some before saving.'
 if(p.boundary.length>0&&(p.boundary.length<3||!propertyAreaHa(p.boundary)))return 'Outline at least three boundary points, or remove the outline.'
 if(p.features.some(f=>f.kind==='driveway'&&f.points.length<2))return 'Draw at least two points for each driveway, or remove the incomplete driveway.'
 return ''
}
export type MapTool='pan'|'pin'|'boundary'|FeatureKind
export type Vertex={index:number;featureId?:string}
export function drawPropertyPoint(p:PropertyMap,tool:MapTool,point:Point,featureId:string,vertex:Vertex|null):PropertyMap{
 if(!validMapPoint(point)||tool==='pan')return p
 if(vertex){
  if(vertex.featureId)return {...p,features:p.features.map(f=>f.id===vertex.featureId?{...f,points:f.points.map((old,index)=>index===vertex.index?point:old)}:f)}
  return {...p,boundary:p.boundary.map((old,index)=>index===vertex.index?point:old)}
 }
 if(tool==='pin')return {...p,pin:point}
 if(tool==='boundary')return p.boundary.length<MAX_VERTICES?{...p,boundary:[...p.boundary,point]}:p
 if(tool==='driveway'&&p.features.some(f=>f.id===featureId))return {...p,features:p.features.map(f=>f.id===featureId&&f.points.length<MAX_VERTICES?{...f,points:[...f.points,point]}:f)}
 if(p.features.length>=MAX_FEATURES)return p
 return {...p,features:[...p.features,{id:featureId,kind:tool,name:'',points:[point]}]}
}

export function mapSuggestions(p:PropertyMap){
 const suggestions=[]
 if(p.water.trim()||p.features.some(f=>['tank','pump','trough'].includes(f.kind)))suggestions.push({area:'water' as const,service:'Water delivery or pump repairs'})
 if(p.surface.trim()||p.features.some(f=>f.kind==='driveway'))suggestions.push({area:'access' as const,service:'Gravel delivery or grading'})
 if(p.livestock.trim())suggestions.push({area:'livestock' as const,service:'Stock handling or animal care'})
 if(Number(p.paddocks)>0)suggestions.push({area:'land' as const,service:'Pasture advice or paddock mowing'})
 return suggestions
}

export function mapPixel(p:Point,zoom:number){
 const width=256*2**zoom
 const sin=Math.sin(p.latitude*DEG)
 return {x:(p.longitude+180)/360*width,y:(.5-Math.log((1+sin)/(1-sin))/(4*Math.PI))*width}
}
export function pixelPoint(x:number,y:number,zoom:number):Point{
 const width=256*2**zoom
 return {longitude:Math.max(-180,Math.min(180,x/width*360-180)),latitude:Math.max(-85,Math.min(85,Math.atan(Math.sinh(Math.PI*(1-2*y/width)))/DEG))}
}
export function linzTiles(key:string){
 return 'https://basemaps.linz.govt.nz/v1/tiles/aerial/WebMercatorQuad/{z}/{x}/{y}.png?api='+encodeURIComponent(key)
}

type Result={data:{profile:PropertyMap;revision:number}|null;error:unknown}
type Write={maybeSingle:()=>PromiseLike<Result>;eq:(column:string,value:string|number)=>Write;select:(columns:string)=>{maybeSingle:()=>PromiseLike<Result>}}
type Db={from:(table:string)=>{select:(columns:string)=>Write;insert:(row:unknown)=>Write;update:(row:unknown)=>Write}}
export async function loadPropertyMap(client:unknown,owner:string){
 const {data,error}=await (client as Db).from('private_property_maps').select('profile,revision').eq('owner_id',owner).maybeSingle()
 if(error)throw error
 return data??{profile:EMPTY_PROPERTY,revision:0}
}
export async function savePropertyMap(client:unknown,owner:string,profile:PropertyMap,revision:number){
 const problem=propertyMapError(profile)
 if(problem)throw new Error(problem)
 const table=(client as Db).from('private_property_maps')
 const update={profile,revision:revision+1}
 const write=revision?table.update(update).eq('owner_id',owner).eq('revision',revision):table.insert({...update,owner_id:owner})
 const {data,error}=await write.select('profile,revision').maybeSingle()
 if(error||!data)throw new Error('Could not save. Your draft is kept. If you edited elsewhere, reopen the latest saved profile before retrying.')
 return data.revision
}
