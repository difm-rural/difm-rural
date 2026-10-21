import {PublicListingDetail} from '@/components/public-listing-detail'
export const dynamic='force-dynamic'
export async function generateMetadata({params}:{params:Promise<{id:string}>}){return {title:'Listing details',alternates:{canonical:'/listings/'+(await params).id}}}
export default async function Listing({params}:{params:Promise<{id:string}>}){return <PublicListingDetail id={(await params).id}/>}
