import {LoaderCircle} from 'lucide-react'
export function ConsolePageLoading({destination,slow=false,retry}:{destination?:string;slow?:boolean;retry?:()=>void}){
 const names:Record<string,string>={jobs:'jobs',browse:'listings',activity:'activity',messages:'messages',notifications:'notifications',connections:'connections',listings:'your listings',account:'your account',setup:'profile setup'}
 const section=destination?.split('?')[0].split('/')[1]||''
 return <section className="page console-page-loading" aria-busy="true"><div role="status"><LoaderCircle size={24} className="spin" aria-hidden="true"/><h1>Loading {names[section]||(section?'page':'Home')}…</h1><p className="muted">{slow?'This is taking longer than usual. Check your connection or try again.':'Getting your screen ready.'}</p></div>{slow&&retry&&<button type="button" className="lform-cancel" onClick={retry}>Try again</button>}<div className="loading-placeholder" aria-hidden="true"/><div className="loading-placeholder short" aria-hidden="true"/></section>
}
