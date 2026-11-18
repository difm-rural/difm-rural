import {AppShell} from '@/components/app-shell'
import {requireProvider} from '@/lib/auth'
import {PropertyNetwork} from './property-network'
import './property-network.css'

export default async function PropertyNetworkPage({searchParams}:{searchParams:Promise<{area?:string}>}){
 const {profile,user}=await requireProvider('/property-network')
 const {area}=await searchParams
 return <AppShell providerName={profile?.full_name || 'Member'}><PropertyNetwork owner={user.id} initialArea={area} preferredArea={profile?.region}/></AppShell>
}
