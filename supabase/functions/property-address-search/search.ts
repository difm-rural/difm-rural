export function addressSearchParams(value:unknown){
 if(typeof value!=='string')return null
 // Limit CQL to letters, numbers and an explicit set of address punctuation.
 const query=value.normalize('NFC').trim().replace(/ +/g,' ')
 if(query.length<3||query.length>100||!/^[\p{L}\p{M}\p{N} ,.'/-]+$/u.test(query))return null
 const escaped=query.replaceAll("'","''")
 return new URLSearchParams({service:'WFS',version:'2.0.0',request:'GetFeature',typeNames:'layer-123113',
  propertyName:'full_address,shape',outputFormat:'json',srsName:'EPSG:4326',count:'8',
  cql_filter:"full_address ILIKE '"+escaped+"%' OR town_city ILIKE '"+escaped+"' OR suburb_locality ILIKE '"+escaped+"'",
 })
}

export function readAddressMatches(input:{features?:unknown[]}){
 if(!Array.isArray(input?.features))return []
 return input.features.slice(0,8).flatMap(item=>{
  const feature=item as {geometry?:{type?:string;coordinates?:number[]};properties?:{full_address?:string}}|null
  const [longitude,latitude]=feature?.geometry?.coordinates??[]
  const label=feature?.properties?.full_address
  if(feature?.geometry?.type!=='Point'||typeof label!=='string'||!Number.isFinite(latitude)||!Number.isFinite(longitude)||Math.abs(latitude)>85||Math.abs(longitude)>180)return []
  return [{label,latitude,longitude}]
 })
}
