import {addPublicJobAreas,createPublicAreaCache,lookupPublicArea} from '@shared/publicJobArea'
const resolve=createPublicAreaCache(area=>lookupPublicArea(process.env.NEXT_PUBLIC_SUPABASE_URL+'/functions/v1/maps-proxy',area))
export function resolvePublicJobLocations<T extends {latitude?:unknown;longitude?:unknown;location_area?:string|null}>(jobs:T[]){return addPublicJobAreas(jobs,resolve)}
