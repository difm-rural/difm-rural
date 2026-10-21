import {PublicBrowse} from '@/components/public-browse'
export const dynamic='force-dynamic'
export const metadata={title:'Browse listings',alternates:{canonical:'/listings'}}
export default async function Listings({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}){return <PublicBrowse kind="listings" params={await searchParams}/>}
