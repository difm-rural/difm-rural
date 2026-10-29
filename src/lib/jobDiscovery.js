import {addPublicJobAreas,createPublicAreaCache,lookupPublicArea} from '../../shared/publicJobArea'
import {MAPS_PROXY_URL} from './constants'
const resolve = createPublicAreaCache(area => lookupPublicArea(MAPS_PROXY_URL, area))
export function resolvePublicJobLocations(jobs) { return addPublicJobAreas(jobs, resolve) }
