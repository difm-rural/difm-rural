import {Bug,Cog,Droplet,Fence,Hammer,KeyRound,PawPrint,Signpost,Sprout,TreeDeciduous,Wheat,type LucideIcon} from 'lucide-react'
import type {AreaId} from '@shared/propertyNetwork'

// One Lucide outline icon per support area, matching the app's Ionicons.
export const PROPERTY_AREA_ICONS:Record<AreaId,LucideIcon>={
 water:Droplet,land:Sprout,fencing:Fence,livestock:PawPrint,access:Signpost,upkeep:Hammer,
 trees:TreeDeciduous,machinery:Cog,spraying:Bug,feed:Wheat,sitting:KeyRound,
}

export function PropertyAreaIcon({area,size=22}:{area:AreaId;size?:number}){
 const Icon=PROPERTY_AREA_ICONS[area]
 return <Icon size={size} strokeWidth={2} aria-hidden="true" className="property-area-icon"/>
}
