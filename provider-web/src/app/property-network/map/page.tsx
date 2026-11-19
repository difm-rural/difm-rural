import {AppShell} from '@/components/app-shell'
import {requireProvider} from '@/lib/auth'
import {PropertyMapEditor} from './property-map-editor'

export default async function PropertyMapPage(){
 const {user,profile}=await requireProvider('/property-network/map')
 return <AppShell providerName={profile.full_name || 'Member'}><PropertyMapEditor owner={user.id}/></AppShell>
}
