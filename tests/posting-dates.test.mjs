import assert from 'node:assert/strict'
import test from 'node:test'
import {nzCalendarDay,nzToday,jobScheduleError,listingDateError} from '../shared/postingDates.ts'
const now=new Date('2026-11-02T11:30:00Z') // Already 3 November in NZ, still 2 November in UTC.
test('NZ calendar days keep today valid across UTC midnight and daylight saving',()=>{
 assert.equal(nzToday(now),'2026-11-03')
 assert.equal(nzCalendarDay('2026-11-02T11:30:00Z'),'2026-11-03')
 assert.equal(nzCalendarDay(new Date('2026-07-02T12:30:00Z')),'2026-07-03')
 assert.equal(nzCalendarDay('2026-11-03'),'2026-11-03')
 assert.equal(nzCalendarDay('2026-02-30'),null)
 assert.equal(nzCalendarDay('2026-02-30T00:00:00Z'),null)
})
test('new jobs reject past specific dates, invalid dates and ranges starting in the past',()=>{
 for(const day of ['2020-01-01','2026-11-02','2026-02-30',''])assert.ok(jobScheduleError({schedule_type:'specific',scheduled_date:day},null,now))
 for(const day of ['2026-11-03','2026-11-04','2026-11-02T11:30:00Z'])assert.equal(jobScheduleError({schedule_type:'specific',scheduled_date:day},null,now),'')
 assert.ok(jobScheduleError({schedule_type:'range',date_from:'2020-01-01',date_to:'2026-11-04'},null,now))
 assert.ok(jobScheduleError({schedule_type:'range',date_from:'2026-11-04',date_to:'2026-11-03'},null,now))
 assert.equal(jobScheduleError({schedule_type:'range',date_from:'2026-11-03',date_to:'2026-11-03'},null,now),'')
 for(const schedule_type of ['asap','flexible'])assert.equal(jobScheduleError({schedule_type},null,now),'')
})
test('listing availability rejects past dates but allows available now, today and future dates',()=>{
 for(const day of ['2020-01-01','2026-11-02','2026-02-30','invalid'])assert.ok(listingDateError(day,null,now))
 for(const day of [null,'','2026-11-03','2026-11-04'])assert.equal(listingDateError(day,null,now),'')
})
test('editing unrelated details retains valid historical dates, but changing to another past date fails',()=>{
 const old={schedule_type:'specific',scheduled_date:'2020-01-01'}
 assert.equal(jobScheduleError(old,old,now),'')
 assert.ok(jobScheduleError({...old,scheduled_date:'2020-01-02'},old,now))
 assert.equal(listingDateError('2020-01-01','2020-01-01',now),'')
 assert.ok(listingDateError('2020-01-02','2020-01-01',now))
})
test('a saved draft is rechecked when the day changes',()=>{
 const job={schedule_type:'specific',scheduled_date:'2026-11-03'}
 assert.equal(jobScheduleError(job,null,now),'')
 assert.ok(jobScheduleError(job,null,new Date('2026-11-03T12:00:00Z')))
})
