// Public account identifier only. The password is never stored in source.
export const REVIEW_EMAIL = 'review@ruralconnections.nz'
export function isReviewAccount(email:string){return email.trim().toLowerCase()===REVIEW_EMAIL}
export function reviewSignInFailure(error:{code?:string;status?:number}|null){
  if(error?.status===429||error?.code==='over_request_rate_limit')return 'Too many sign-in attempts. Wait a minute and try again.'
  if(error?.code==='invalid_credentials'||error?.code==='invalid_login_credentials')return 'The email or password was not recognised. Check your details and try again.'
  return 'Could not sign in. Check your connection and try again.'
}
