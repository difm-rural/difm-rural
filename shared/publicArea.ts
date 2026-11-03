// A place-name format check, not a claim that the town exists or is geocoded.
// Keep Māori macrons, apostrophes, hyphens and common regional punctuation.
export function publicAreaError(value:unknown,required=true):string{
 const area=String(value??'').trim()
 if(!area)return required?'Enter the public town or area.':''
 if(area.length>150)return 'Public town or area must be 150 characters or fewer.'
 if(!/\p{L}/u.test(area)||!/^[\p{L}\p{M}\p{N} .,'’()&/\-]+$/u.test(area))
  return 'Enter a town or area such as Waitoki or Te Kūiti. Leave out markup, emoji and double quotation marks.'
 return ''
}
