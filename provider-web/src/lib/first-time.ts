import { safeReturnPath } from './return-path'

export function setupDestination(value:unknown){
  const path=safeReturnPath(value)
  return /^\/setup(?:[/?#]|$)/.test(path)?'/':path
}
export function setupInput(data:FormData){
  if(data.get('intent')==='later')return {ok:true as const,value:{onboarding_completed:true}}
  const name=String(data.get('name') || '').trim(),region=String(data.get('region') || '').trim()
  if(!name || name.length>80)return {ok:false as const,error:'Enter the name you want other members to see (up to 80 characters).'}
  if(!region || region.length>120)return {ok:false as const,error:'Enter your town or region (up to 120 characters).'}
  return {ok:true as const,value:{full_name:name,display_name:name,region,onboarding_completed:true}}
}
export function normaliseEmail(value:string){return value.trim().toLowerCase()}
export function validEmail(value:string){return value.length<=254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)}
export function signInFailure(error:{code?:string;status?:number}|null,verifying=false){
  if(error?.status===429 || error?.code==='over_email_send_rate_limit')return 'Too many attempts. Wait a few minutes before trying again.'
  if(verifying && ['otp_expired','otp_disabled','validation_failed'].includes(error?.code || ''))return 'That code is invalid or has expired. Request a new code and try again.'
  return verifying?'Could not verify that code. Check your connection, or request a new code if it has expired.':'Could not send your code. Check your email address and connection, then try again.'
}
