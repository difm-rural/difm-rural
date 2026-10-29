/* eslint-disable @next/next/no-img-element -- Member photos and local category artwork. */
import Link from 'next/link'
import {MapPin, ArrowUpRight} from 'lucide-react'
import {formatRate, LISTING_KINDS} from '@shared/listingPricing'
import type {PublicRow} from '@/lib/marketplace'
import {categoryArtwork} from '@shared/categoryArtwork'
export function GuestCard({row,kind}:{row:PublicRow;kind:'jobs'|'listings'}){
  const listing=kind==='listings'
  const price=listing?(row.pricing_type==='quote_required'?'Quote required':row.rate==null?'Ask for pricing':formatRate(row.pricing_type || '',row.rate,row.unit_label))
    :row.price_type==='fixed'&&row.price!=null?'$'+row.price:'Open to offers'
  return <Link href={'/'+kind+'/'+row.id} className="guest-card">
    <div className="guest-card-image"><img src={row.photos?.[0] || categoryArtwork(row.category)} alt=""/><span>{listing?LISTING_KINDS.find(k=>k.id===row.kind)?.label || 'Listing':'Open job'}</span></div>
    <div className="guest-card-body"><p className="guest-card-category">{row.category || 'Rural community'}</p><h3>{row.title}</h3><p className="guest-card-description">{row.description}</p><p className="guest-card-location"><MapPin size={14} aria-hidden="true"/>{(listing?row.location_name:row.location_area) || 'Location to be arranged'}{row.distance!=null?' · About '+row.distance.toFixed(1)+' km'+(row.distanceApproximate?' · town area':''):''}</p><div className="guest-card-bottom"><strong>{price}</strong><ArrowUpRight size={18} aria-hidden="true"/></div></div>
  </Link>
}
