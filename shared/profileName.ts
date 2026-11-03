export const PUBLIC_NAME_MAX=80
export function publicNameError(value:unknown):string{
 const name=String(value??'').trim()
 if(!name)return 'Enter your public name. It cannot be only spaces.'
 return name.length>PUBLIC_NAME_MAX?'Public name must be 80 characters or fewer.':''
}
