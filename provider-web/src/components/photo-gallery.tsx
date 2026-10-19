'use client'
import {useRef,useState} from 'react'
export function PhotoGallery({photos,title}:{photos:string[]|null;title:string}){
 const images=(photos || []).filter(url=>{try{return new URL(url).protocol==='https:'}catch{return false}}),[index,setIndex]=useState(0),dialog=useRef<HTMLDialogElement>(null)
 if(!images.length)return null
 return <section className="listing-gallery" aria-label="Listing photos"><button type="button" className="listing-photo-main" onClick={()=>dialog.current?.showModal()} aria-label="Open selected photo full size"><img src={images[index]} alt={title+' - photo '+(index+1)}/><span>View photo {index+1} of {images.length}</span></button>{images.length>1&&<div className="listing-thumbnails">{images.map((url,i)=><button type="button" key={url+i} aria-label={'Show photo '+(i+1)} aria-pressed={i===index} onClick={()=>setIndex(i)}><img src={url} alt=""/></button>)}</div>}
 <dialog ref={dialog} className="photo-dialog"><form method="dialog"><button className="lform-cancel">Close photo</button></form><img src={images[index]} alt={title+' - photo '+(index+1)}/><div className="lform-actions"><button type="button" className="lform-cancel" disabled={index===0} onClick={()=>setIndex(i=>i-1)}>Previous photo</button><span>{index+1} of {images.length}</span><button type="button" className="lform-cancel" disabled={index===images.length-1} onClick={()=>setIndex(i=>i+1)}>Next photo</button></div></dialog></section>
}
