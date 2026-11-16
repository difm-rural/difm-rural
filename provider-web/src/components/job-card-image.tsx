/* eslint-disable @next/next/no-img-element -- Member photos and local category artwork. */
import {categoryArtwork} from '@shared/categoryArtwork'
import {ThumbImg} from '@/components/thumb-img'
export function JobCardImage({photos,category}:{photos?:string[]|null;category:string|null}){
  // A member photo shows its small thumbnail; category artwork is used as is.
  return <div className="job-card-image">{photos?.[0]?<ThumbImg src={photos[0]} alt="" loading="lazy"/>:<img src={categoryArtwork(category)} alt="" loading="lazy"/>}</div>
}
