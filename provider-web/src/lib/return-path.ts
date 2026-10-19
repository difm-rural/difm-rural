export function safeReturnPath(value:unknown){
 if(typeof value!=='string'||!value.startsWith('/')||value.startsWith('//')||/[\\\u0000-\u001f\u007f]/.test(value))return '/'
 try{const url=new URL(value,'https://rural.invalid');if(url.origin!=='https://rural.invalid'||/^\/(login|auth)(\/|$)/.test(url.pathname))return '/';return url.pathname+url.search+url.hash}catch{return '/'}
}
