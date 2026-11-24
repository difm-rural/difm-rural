// Public account identifiers only. Passwords are never stored in source — they
// live only in Supabase. These few accounts (App Review + test bots) sign in with
// a password; every other email keeps the email-code (OTP) flow.
export const PASSWORD_LOGIN_EMAILS = [
  'review@ruralconnections.nz',
  'adminbot@ruralconnections.nz',
  'requesterbot@ruralconnections.nz',
]
// Kept for existing references.
export const REVIEW_EMAIL = 'review@ruralconnections.nz'
export const EMAIL_STEP_ACTION='Continue'
export function isPasswordAccount(email:string){return PASSWORD_LOGIN_EMAILS.includes(email.trim().toLowerCase())}
export function isReviewAccount(email:string){return isPasswordAccount(email)}
export function signInMethodHint(email:string){
 if (!email.trim()) return ''
 return isPasswordAccount(email)?'Continue to enter your password.':'Continue and we’ll email you a sign-in code.'
}
export function reviewSignInFailure(error:{code?:string;status?:number}|null){
  if(error?.status===429||error?.code==='over_request_rate_limit')return 'Too many sign-in attempts. Wait a minute and try again.'
  if(error?.code==='invalid_credentials'||error?.code==='invalid_login_credentials')return 'The email or password was not recognised. Check your details and try again.'
  return 'Could not sign in. Check your connection and try again.'
}
