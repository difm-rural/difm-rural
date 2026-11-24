export function safeReturnPath(value:unknown){
 if(typeof value!=='string'||!value.startsWith('/')||value.startsWith('//')||/[\\\u0000-\u001f\u007f]/.test(value))return '/'
 try{const decoded=decodeURIComponent(value);if(/[\\\u0000-\u001f\u007f]/.test(decoded)||decoded.startsWith('//')||/^\/(login|auth)(\/|[?#]|$)/i.test(decoded))return '/';const url=new URL(value,'https://rural.invalid');if(url.origin!=='https://rural.invalid'||/^\/(login|auth)(\/|$)/i.test(decodeURIComponent(url.pathname)))return '/';return url.pathname+url.search+url.hash}catch{return '/'}
}
