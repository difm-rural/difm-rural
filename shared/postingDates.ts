// Posting dates are New Zealand calendar dates, independent of the device/server timezone.
export type JobSchedule={schedule_type?:unknown;scheduled_date?:unknown;date_from?:unknown;date_to?:unknown}
export function editorScheduleType(schedule:JobSchedule):string{
 const value=String(schedule.schedule_type??'').trim().toLowerCase()
 if(value)return value // Preserve explicit saved choices, including unsupported legacy values for review.
 if(schedule.scheduled_date)return 'specific'
 if(schedule.date_from||schedule.date_to)return 'range'
 return 'flexible'
}
function validDay(value:string){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false
 const date=new Date(value+'T12:00:00Z')
 return !Number.isNaN(date.getTime())&&date.toISOString().slice(0,10)===value
}
export function nzCalendarDay(value:unknown):string|null{
 if(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value))return validDay(value)?value:null
 if(!(value instanceof Date)&&!(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T/.test(value)&&validDay(value.slice(0,10))))return null
 const date=value instanceof Date?value:new Date(value as string)
 if(Number.isNaN(date.getTime()))return null
 const parts=new Intl.DateTimeFormat('en-NZ',{timeZone:'Pacific/Auckland',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date)
 const part=(type:string)=>parts.find(p=>p.type===type)?.value
 return `${part('year')}-${part('month')}-${part('day')}`
}
export function nzToday(now=new Date()){return nzCalendarDay(now)!}
function activeDates(s:JobSchedule){return s.schedule_type==='specific'?[nzCalendarDay(s.scheduled_date)]:s.schedule_type==='range'?[nzCalendarDay(s.date_from),nzCalendarDay(s.date_to)]:[]}
export function jobScheduleError(schedule:JobSchedule,previous?:JobSchedule|null,now=new Date()):string{
 if(!['asap','specific','range','flexible'].includes(String(schedule.schedule_type)))return 'Choose when you need the job done.'
 const days=activeDates(schedule)
 if(days.some(day=>!day))return 'Choose a valid date for the job.'
 if(schedule.schedule_type==='range'&&days[0]!>days[1]!)return 'The end date must be on or after the start date.'
 const unchanged=previous&&schedule.schedule_type===previous.schedule_type&&JSON.stringify(days)===JSON.stringify(activeDates(previous))
 if(!unchanged&&days.some(day=>day!<nzToday(now)))return 'Choose today or a future date for the job.'
 return ''
}
export function listingDateError(value:unknown,previous?:unknown,now=new Date()):string{
 if(value===null||value===undefined||value==='')return '' // Available now.
 const date=nzCalendarDay(value)
 if(!date)return 'Choose a valid availability date or select Available now.'
 if(date!==nzCalendarDay(previous)&&date<nzToday(now))return 'Choose today or a future availability date, or select Available now.'
 return ''
}
