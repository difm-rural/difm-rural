import {PublicBrowse} from '@/components/public-browse'
export const dynamic='force-dynamic'
export const metadata={title:'Browse jobs',alternates:{canonical:'/jobs'}}
export default async function Jobs({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}){return <PublicBrowse kind="jobs" params={await searchParams}/>}
