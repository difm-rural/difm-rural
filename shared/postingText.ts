export const POSTING_TITLE_MAX=160
export const POSTING_DESCRIPTION_MAX=2000
export function postingTextError(value:unknown,field:'title'|'description'):string{
 const limit=field==='title'?POSTING_TITLE_MAX:POSTING_DESCRIPTION_MAX
 return String(value??'').length>limit?`${field==='title'?'Title':'Description'} must be ${limit.toLocaleString('en-NZ')} characters or fewer.`:''
}
