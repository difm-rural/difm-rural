'use client'
import { useState } from 'react'
import { ActionForm } from '@/components/action-form'
import { StarRatingInput } from '@/components/star-rating-input'
import { reviewArrangement } from '@/app/activity/actions'

export function JobReviewForm({id,rating:initialRating,comment:initialComment,editing}:{
  id:string;rating?:number;comment?:string|null;editing:boolean
}){
  const [rating,setRating]=useState(initialRating ?? 0)
  const [comment,setComment]=useState(initialComment ?? '')
  return <ActionForm action={reviewArrangement} label={editing?'Save review changes':'Submit review'} pendingLabel={editing?'Saving changes…':'Posting review…'} pendingMessage="Saving your review. Please wait.">
    <input type="hidden" name="id" value={id}/><input type="hidden" name="kind" value="job"/>
    <StarRatingInput rating={rating} onRating={setRating}/>
    <label className="lform-field">Comments (optional)<textarea name="comment" rows={4} value={comment} onChange={event=>setComment(event.target.value)}/></label>
    <p className="muted">Your rating and comments are public.</p>
  </ActionForm>
}
