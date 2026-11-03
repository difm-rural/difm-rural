// Lock immediately, release on failure/cancellation, retain the lock after success
// until navigation removes the form (or its owner explicitly resets it).
export async function runSubmission(
 lock:{current:boolean},task:()=>Promise<boolean|void>,
 start:()=>void,finish:()=>void,onError:(error:unknown)=>void,
):Promise<boolean>{
 if(lock.current)return false
 lock.current=true
 let completed=false
 try{start();completed=(await task())===true;return completed}
 catch(error){onError(error);return false}
 finally{if(!completed){lock.current=false;finish()}}
}
