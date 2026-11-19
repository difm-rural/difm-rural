'use client'

import {useEffect,useRef,useState} from 'react'
import {FEATURE_TYPES,LINZ_ATTRIBUTION,LINZ_ATTRIBUTION_URL,LINZ_COPYRIGHT,LINZ_COPYRIGHT_URL,linzTiles,mapPixel,pixelPoint,type Camera,type MapTool,type Point,type PropertyMap} from '@shared/propertyMap'

export function PropertyAerialMap({profile,tool,onCamera,onPoint}:{
 profile:PropertyMap;tool:MapTool;onCamera:(camera:Camera)=>void;onPoint:(point:Point)=>void
}){
 const key=process.env.NEXT_PUBLIC_LINZ_BASEMAPS_KEY
 const viewport=useRef<HTMLDivElement>(null), canvas=useRef<HTMLCanvasElement>(null)
 const drag=useRef<{x:number;y:number;moved:boolean}|null>(null)
 const [failed,setFailed]=useState(false)
 const [size,setSize]=useState({width:0,height:0})
 useEffect(()=>{
  if(!viewport.current)return
  const observer=new ResizeObserver(([event])=>setSize({width:event.contentRect.width,height:event.contentRect.height}))
  observer.observe(viewport.current)
  return ()=>observer.disconnect()
 },[])
 const zoom=Math.round(profile.camera.zoom)
 const centre=mapPixel(profile.camera,zoom)
 const left=centre.x-size.width/2,top=centre.y-size.height/2
 const tiles:{x:number;y:number}[]=[]
 if(key&&size.width&&size.height){
  for(let y=Math.max(0,Math.floor(top/256));y<=Math.min(2**zoom-1,Math.floor((top+size.height)/256));y++){
   for(let x=Math.max(0,Math.floor(left/256));x<=Math.min(2**zoom-1,Math.floor((left+size.width)/256));x++)tiles.push({x,y})
  }
 }
 useEffect(()=>{
  const context=canvas.current?.getContext('2d')
  if(!context)return
  context.clearRect(0,0,size.width,size.height)
  function path(points:Point[],polygon=false){
   if(!context||points.length<2)return
   context.beginPath()
   points.forEach((point,index)=>{
    const pixel=mapPixel(point,zoom)
    if(index)context.lineTo(pixel.x-left,pixel.y-top)
    else context.moveTo(pixel.x-left,pixel.y-top)
   })
   if(polygon&&points.length>2){context.closePath();context.fillStyle='rgba(28,110,73,.26)';context.fill()}
   context.strokeStyle=polygon?'#57e29b':'#ffcf63';context.lineWidth=3;context.stroke()
  }
  function pin(point:Point,label:string){
   if(!context)return
   const p=mapPixel(point,zoom)
   context.fillStyle='#153e30';context.beginPath();context.arc(p.x-left,p.y-top,11,0,Math.PI*2);context.fill()
   context.font='bold 14px sans-serif';context.fillStyle='#fff';context.textAlign='center';context.textBaseline='middle'
   context.fillText(label,p.x-left,p.y-top)
  }
  path(profile.boundary,true)
  profile.boundary.forEach((point,index)=>pin(point,String(index+1)))
  if(profile.pin)pin(profile.pin,'●')
  for(const feature of profile.features){
   if(feature.kind==='driveway'){path(feature.points);feature.points.forEach((point,index)=>pin(point,String(index+1)))}
   else if(feature.points[0])pin(feature.points[0],FEATURE_TYPES[feature.kind].icon)
  }
 },[profile,left,top,zoom,size])
 const pan=(x:number,y:number)=>onCamera({...pixelPoint(centre.x+x,centre.y+y,zoom),zoom})
 const changeZoom=(amount:number)=>onCamera({...profile.camera,zoom:Math.max(4,Math.min(20,zoom+amount))})
 return <section aria-label="Aerial map">
  {!key&&<p role="status">LINZ imagery is unavailable. Use the coordinate editor below to enter or adjust points.</p>}
  {failed&&<p role="status">Some aerial imagery could not load. You can still edit your points.</p>}
  <div ref={viewport} tabIndex={0} aria-label="Property map. Use arrow keys to pan and plus or minus to zoom."
   style={{position:'relative',overflow:'hidden',height:'clamp(300px, 56vh, 620px)',backgroundColor:'#32463e',touchAction:'none',borderRadius:12}}
   onKeyDown={event=>{
    const movement:{[key:string]:number[]}={ArrowLeft:[-90,0],ArrowRight:[90,0],ArrowUp:[0,-90],ArrowDown:[0,90]}
    const step=movement[event.key]
    if(step){event.preventDefault();pan(step[0],step[1])}
    if(event.key==='+'||event.key==='-'){event.preventDefault();changeZoom(event.key==='+'?1:-1)}
   }}
   onPointerDown={event=>{event.currentTarget.setPointerCapture(event.pointerId);drag.current={x:event.clientX,y:event.clientY,moved:false}}}
   onPointerMove={event=>{
    const prior=drag.current
    if(prior&&(prior.moved||Math.hypot(event.clientX-prior.x,event.clientY-prior.y)>6)){
     pan(prior.x-event.clientX,prior.y-event.clientY)
     drag.current={x:event.clientX,y:event.clientY,moved:true}
    }
   }}
   onPointerCancel={()=>{drag.current=null}}
   onPointerUp={event=>{
    if(drag.current&&!drag.current.moved&&tool!=='pan'){
     const bounds=event.currentTarget.getBoundingClientRect()
     onPoint(pixelPoint(left+event.clientX-bounds.left,top+event.clientY-bounds.top,zoom))
    }
    drag.current=null
   }}>
   {key&&tiles.map(tile=><img key={zoom+'-'+tile.x+'-'+tile.y} aria-hidden="true" alt="" draggable={false}
    onError={()=>setFailed(true)}
    src={linzTiles(key).replace('{z}',String(zoom)).replace('{x}',String(tile.x)).replace('{y}',String(tile.y))}
    style={{position:'absolute',pointerEvents:'none',width:256,height:256,left:tile.x*256-left,top:tile.y*256-top}}/>)}
   <canvas ref={canvas} width={size.width} height={size.height} aria-hidden="true" style={{position:'absolute',inset:0,pointerEvents:'none'}}/>
  </div>
  <div className="lform-actions">
   <button type="button" className="lform-cancel" aria-label="Zoom in" onClick={()=>changeZoom(1)}>+</button>
   <button type="button" className="lform-cancel" aria-label="Zoom out" onClick={()=>changeZoom(-1)}>−</button>
   {key&&<>
    <a className="card-link" href={LINZ_COPYRIGHT_URL} target="_blank" rel="noreferrer">{LINZ_COPYRIGHT}</a>
    <a className="card-link" href={LINZ_ATTRIBUTION_URL} target="_blank" rel="noreferrer">{LINZ_ATTRIBUTION}</a>
   </>}
  </div>
 </section>
}
