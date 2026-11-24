type Notice={type?:string;body?:string|null;metadata?:Record<string,unknown>|null}
const types=new Set(['job_confirmed','arrival_window_confirmed'])
export function arrangementSummary(n:Notice):string|null {
 if(!types.has(n.type||''))return null
 const body=n.body||''
 const named=body.match(/^(.+?) confirmed (['"])(.+)\2:\s*.+$/)
 if(named){const name=/^(the provider|someone)$/i.test(named[1])?named[1]:named[1].trim().split(/\s+/)[0];return `${name} confirmed arrangements for '${named[3]}'.`}
 const arrival=body.match(/^Expected arrival for (['"])(.+)\1:\s*.+$/)
 return arrival?`Arrival confirmed for '${arrival[2]}'.`:null
}

// Read only explicit event timestamps or the known NZ wall-clock template.
// Never use notification.created_at as the agreed time or invent a missing year.
export function arrangementTime(n:Notice,timeZone='Pacific/Auckland'):string|null {
 if(!types.has(n.type||''))return null
 const raw=n.metadata?.arrival_start_at
 if(typeof raw==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(raw)){
  const date=new Date(raw),[year,month,day]=raw.slice(0,10).split('-').map(Number)
  const calendar=new Date(Date.UTC(year,month-1,day))
  if(Number.isFinite(date.getTime())&&calendar.getUTCMonth()===month-1&&calendar.getUTCDate()===day){
   return new Intl.DateTimeFormat('en-NZ',{weekday:'short',day:'numeric',month:'short',year:'numeric',hour:'numeric',minute:'2-digit',hour12:true,timeZone}).format(date)
  }
 }
 if(!arrangementSummary(n))return null
 const match=(n.body||'').match(/\baround\s+(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)(?:\s+(\d{4}))?,\s*(\d{1,2}):(\d{2})\s*([ap])\.?m\.?/i)
 if(!match)return null
 const [,weekday,d,month,y,h,m,period]=match,day=Number(d),hour=Number(h),minutes=Number(m)
 const monthIndex=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'].indexOf(month.toLowerCase())
 const check=new Date(Date.UTC(Number(y||2000),monthIndex,day))
 if(check.getUTCMonth()!==monthIndex||check.getUTCDate()!==day||hour<1||hour>12||minutes>59)return null
 if(y&&['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][check.getUTCDay()].toLowerCase()!==weekday.toLowerCase())return null
 return `${weekday} ${day} ${month}${y?' '+y:''}, ${hour}:${m} ${period.toLowerCase()}m (NZ time)`
}
