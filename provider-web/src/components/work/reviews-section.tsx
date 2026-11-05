import {formatDate as nzDate} from '@shared/formatting'
import { ActionForm } from '@/components/action-form'
import { reviewArrangement } from '@/app/activity/actions'
import { StarRatingInput } from '@/components/star-rating-input'
import type { WorkAction } from '@/lib/activity-policy'

export type WorkReview={id:string;reviewer_id:string;reviewer_role:string;rating:number;comment:string|null;created_at:string}

// The reviews block for a completed job or booking: the review received (filled
// + empty star bar) and the form to leave/edit your own (StarRatingInput).
// Shared by the job workspace and the booking manage page. The caller decides
// whether to render it (status === 'completed').
export function ReviewsSection({kind,id,actions,personName,received,ownReview,reviewError}:{
  kind:'job'|'booking';id:string;actions:WorkAction[];personName:string|null;
  received?:WorkReview;ownReview?:WorkReview;reviewError:boolean}){
  return <section className="card" id="reviews"><h2>Reviews</h2>
    {reviewError?<p role="alert">Could not load reviews. Refresh before adding or editing your review.</p>:<>
      {received && <article className="activity-received"><h3>{personName || 'Their'} review of you</h3><p><span aria-label={received.rating+' out of 5'}>{'★'.repeat(received.rating)+'☆'.repeat(5-received.rating)}</span> · {nzDate(new Date(received.created_at))}</p><p className="work-description">{received.comment || 'No written comment.'}</p></article>}
      {!received && <p className="muted">The other person has not left a review yet.</p>}
      {actions.includes('review') && <ActionForm key={ownReview?.id || 'new'} action={reviewArrangement} label={ownReview?'Save review changes':'Submit review'}>
        <h3>{ownReview?'Edit your review':'Review '+(personName || 'the other person')}</h3>
        <input type="hidden" name="id" value={id}/><input type="hidden" name="kind" value={kind}/>
        <StarRatingInput initial={ownReview?.rating}/>
        <label className="lform-field">Comments (optional)<textarea name="comment" rows={4} defaultValue={ownReview?.comment || ''} placeholder="Share your experience working with this person."/></label>
        <p className="muted">Your rating and comments are public.</p>
      </ActionForm>}
    </>}
  </section>
}
