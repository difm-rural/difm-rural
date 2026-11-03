type JobLocation={latitude?:unknown;longitude?:unknown;location_name?:string|null;location_area?:string|null;area_polygon?:unknown}
const normalise=(value:string)=>value.toLocaleLowerCase('en-NZ').replace(/[^\p{L}\p{N}]/gu,'')
// Coordinates alone may be a geocoded town centre. Avoid presenting those as
// directions to the property. Explicit pins without an address keep a pin label.
export function jobMapTarget(job:JobLocation){
 const values=[job.latitude,job.longitude]
 if(!values.every(value=>(typeof value==='number'||typeof value==='string')&&String(value).trim()!==''))return null
 const latitude=Number(job.latitude),longitude=Number(job.longitude)
 if(!Number.isFinite(latitude)||!Number.isFinite(longitude)||Math.abs(latitude)>90||Math.abs(longitude)>180)return null
 const address=(job.location_name||'').trim(),area=(job.location_area||'').trim()
 const mappedArea=Array.isArray(job.area_polygon)&&job.area_polygon.length>=3
 if(!address&&area&&!mappedArea)return null
 const plusCode=/\b[A-Z0-9]{4,8}\+[A-Z0-9]{2,3}\b/i.test(address)
 const numberedAddress=/^(?:unit\s+)?\d+[a-z]?(?:\s*[/\-]\s*\d+[a-z]?)?\s+\p{L}/iu.test(address)
 if(address&&!mappedArea&&!plusCode&&(!numberedAddress||normalise(address)===normalise(area)))return null
 const kind=numberedAddress&&!mappedArea&&!plusCode?'address':'pin'
 return {kind,label:kind==='address'?'Open job location in Maps':'Open job pin in Maps',href:'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(latitude+','+longitude)}
}
