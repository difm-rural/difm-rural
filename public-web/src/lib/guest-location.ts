import {cookies} from 'next/headers'
import {readGuestLocation} from './nearby'
export const LOCATION_COOKIE='rural-public-location'
export async function guestLocation(){return readGuestLocation((await cookies()).get(LOCATION_COOKIE)?.value)}
