import {cookies} from 'next/headers'
import type {SupabaseClient} from '@supabase/supabase-js'
import {coordinates} from './discovery'
import {privateOrigin} from './discovery-data'
export async function browsingOrigin(client:SupabaseClient,userId:string){
 const raw=(await cookies()).get('rural-browse-location')?.value
 if(raw){try{const saved=JSON.parse(raw);if(saved.userId===userId){const point=coordinates(saved.latitude,saved.longitude);if(point)return {point,label:'Current browsing location'}}}catch{}}
 return {point:await privateOrigin(client,userId),label:'Your private profile location'}
}
