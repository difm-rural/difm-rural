import {LETTERS,OTHERS,PUBLIC_AREA_PUNCTUATION,publicAreaSpanHas} from './publicAreaCharacters'
// A place-name format check, not a claim that the town exists or is geocoded.
// Match the database's fixed character policy, ASCII-space btrim and code-point
// length. Runtime Unicode upgrades must not admit characters SQL will reject.
const punctuation=new Set<number>(PUBLIC_AREA_PUNCTUATION)
export function publicAreaError(value:unknown,required=true):string{
 const area=String(value??'').replace(/^ +| +$/g,'')
 if(!area)return required?'Enter the public town or area.':''
 const characters=Array.from(area)
 if(characters.length>150)return 'Public town or area must be 150 characters or fewer.'
 let hasLetter=false
 for(const character of characters){
  const cp=character.codePointAt(0)!
  if(punctuation.has(cp))continue
  if(publicAreaSpanHas(LETTERS,cp)){hasLetter=true;continue}
  if(!publicAreaSpanHas(OTHERS,cp))return invalidArea()
 }
 return hasLetter?'':invalidArea()
}
function invalidArea(){return 'Enter a town or area such as Waitoki or Te Kūiti. Leave out markup, emoji and double quotation marks.'}
