import {formatDate as nzDate} from '@shared/formatting'
import Link from '@/components/navigation-link'
import { ActionForm } from '@/components/action-form'
import { reviewArrangement } from '@/app/activity/actions'
import { StarRatingInput } from '@/components/star-rating-input'
import type { WorkAction } from '@/lib/activity-policy'

export type WorkReview={id:string;reviewer_id:string;reviewer_role:string;rating:number;comment:string|null;created_at:string}

function stars(n:number){return '★'.repeat(n)+'☆'.repeat(5-n)}

// The reviews block for a completed job or booking: the review you received, your
// own review shown read-only (edit behind a toggle), and — before you've reviewed
// — the form to leave one. Shared by the job and booking workspaces.
export function ReviewsSection({kind,id,actions,personName,personId,received,ownReview,reviewError,justReviewed}:{
  kind:'job'|'booking';id:string;actions:WorkAction[];personName:string|null;personId?:string|null;
  received?:WorkReview;ownReview?:WorkReview;reviewError:boolean;justReviewed?:boolean}){
  const firstName=personName?personName.trim().split(/\s+/)[0]:'the other person'
  const reviewForm=(
    <ActionForm key={ownReview?.id || 'new'} action={reviewArrangement} label={ownReview?'Save review changes':'Submit review'} pendingLabel={ownReview?'Saving changes…':'Posting review…'}>
      <input type="hidden" name="id" value={id}/><input type="hidden" name="kind" value={kind}/>
      <StarRatingInput initial={ownReview?.rating}/>
      <label className="lform-field">Comments (optional)<textarea name="comment" rows={4} defaultValue={ownReview?.comment || ''} placeholder="Share your experience working with this person."/></label>
      <p className="muted">Your rating and comments are public.</p>
    </ActionForm>
  )
  return <section className="card" id="reviews"><h2>Reviews</h2>
    {justReviewed && <p className="home-clear" role="status">Thanks — your review is posted.</p>}
    {reviewError?<p role="alert">Could not load reviews. Refresh before adding or editing your review.</p>:<>
      {received && <article className="activity-received"><h3>{personName || 'Their'} review of you</h3><p><span aria-label={received.rating+' out of 5'}>{stars(received.rating)}</span> · {nzDate(new Date(received.created_at))}</p><p className="work-description">{received.comment || 'No written comment.'}</p></article>}
      {!received && <p className="muted">The other person has not left a review yet.</p>}
      {ownReview
        ? <article className="activity-received"><h3>Your review of {firstName}</h3>
            <p><span aria-label={ownReview.rating+' out of 5'}>{stars(ownReview.rating)}</span> · {nzDate(new Date(ownReview.created_at))}</p>
            <p className="work-description">{ownReview.comment || 'No written comment.'}</p>
            <p className="muted">This is how it appears on {firstName}&apos;s public profile.</p>
            {personId && <Link href={'/people/'+personId+'/reviews'} className="card-link">View on their profile →</Link>}
            <details className="activity-action"><summary>Edit your review</summary>{reviewForm}</details>
          </article>
        : actions.includes('review') && <><h3>Review {personName || 'the other person'}</h3>{reviewForm}</>}
    </>}
  </section>
}
