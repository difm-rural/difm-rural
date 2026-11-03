const comparable=(value:string)=>value.normalize('NFKC').toLocaleLowerCase('en-NZ').replace(/[^\p{L}\p{N}]+/gu,'')
export function listingCardCopy(title?:string|null,headline?:string|null,supporting?:string|null,description?:string|null){
 const seen=new Set([title,description].map(value=>comparable(value||'')).filter(Boolean))
 const unique=(value?:string|null)=>{
  const text=(value||'').trim(),key=comparable(text)
  if(!key||seen.has(key))return ''
  seen.add(key);return text
 }
 return {headline:unique(headline),supporting:unique(supporting)}
}
