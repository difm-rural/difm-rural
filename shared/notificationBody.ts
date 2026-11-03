// Older match alerts embedded a snapshot distance from the member's profile
// to the exact job pin. Discovery may instead use a public town and a different
// browsing origin. Keep the useful alert text without that stale comparison.
export function notificationBody(notification:{type?:string;body?:string|null}):string{
 const body=notification.body||''
 return notification.type==='opportunity_match'
  ? body.replace(/ · \d+(?:\.\d+)? km away\. /,' · ')
  : body
}
