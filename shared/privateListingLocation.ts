// Exact locations are separate from the legacy/coarse services API.
// Only owner editors call this hydrator; database RLS is the authority.
type PrivateLocation={service_id:string;location_name:string|null;latitude:number|null;longitude:number|null;service_latitude:number|null;service_longitude:number|null}
type Client={from:(name:string)=>{select:(columns:string)=>{in:(key:string,ids:string[])=>PromiseLike<{data:PrivateLocation[]|null;error:unknown}>}}}
export async function withPrivateListingLocations<T extends {id:string}>(client:unknown,rows:T[]):Promise<T[]>{
 const locations=new Map<string,Omit<PrivateLocation,'service_id'>>()
 for(let start=0;start<rows.length;start+=200){
  const {data,error}=await (client as Client).from('service_private_locations').select('service_id,location_name,latitude,longitude,service_latitude,service_longitude').in('service_id',rows.slice(start,start+200).map(row=>row.id))
  if(error)throw error
  for(const {service_id,...location} of data || [])locations.set(service_id,location)
 }
 return rows.map(row=>{
  const location=locations.get(row.id)
  if(!location)throw new Error('Private listing location unavailable. Refresh before editing.')
  return {...row,...location}
 })
}
