import {formatMoney} from './formatting.js'
// Format only known event templates. Unknown/older bodies and arrangement
// details are retained verbatim rather than guessing missing names or roles.
export function notificationBody(notification:{type?:string;body?:string|null}):string{
 const body=notification.body||''
 let match:RegExpMatchArray|null
 if(notification.type==='opportunity_match')return body.replace(/ · \d+(?:\.\d+)? km away\. /,' · ')
 if(notification.type==='review_received'&&(match=body.match(/^(.+) left you a ([1-5])★ review for "(.+)"\.$/)))
  return `${match[1]} gave you ${match[2]} ${match[2]==='1'?'star':'stars'} for '${match[3]}'.`
 if(['job_completed','booking_completed'].includes(notification.type||'')&&(match=body.match(/^(.+) marked "(.+)" complete\. Leave a review of your experience\.$/)))
  return `${match[1]} completed '${match[2]}'. Leave a review.`
 if(notification.type==='new_message'&&(match=body.match(/^New message from (.+) about "(.+)"\.?$/)))
  return `New message from ${match[1]} about '${match[2]}'.`
 if(notification.type==='new_bid'&&(match=body.match(/^New offer of \$([\d.]+) NZD on "(.+)"\.?$/)))
  return `New ${formatMoney(match[1])} offer for '${match[2]}'.`
 return body
}
