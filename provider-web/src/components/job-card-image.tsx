/* eslint-disable @next/next/no-img-element -- Member photos and local category artwork. */
import {categoryArtwork} from '@shared/categoryArtwork'
export function JobCardImage({photos,category}:{photos?:string[]|null;category:string|null}){
  return <div className="job-card-image"><img src={photos?.[0] || categoryArtwork(category)} alt="" loading="lazy"/></div>
}
