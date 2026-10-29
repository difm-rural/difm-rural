import {SHOW_DEVELOPMENT_BADGE} from '@shared/releaseStage'
export function DevelopmentBadge(){
  return SHOW_DEVELOPMENT_BADGE?<span className="development-badge" aria-label="Development version">Dev</span>:null
}
