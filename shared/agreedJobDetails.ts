import {formatWorkDateTime} from './formatting.js'

export function agreedJobDetails(arrival?:string|null,duration?:string|null){
 const dateTime=arrival?formatWorkDateTime(arrival):'—'
 return {
  arrival:dateTime==='—'?null:dateTime,
  duration:duration?.trim() || null,
 }
}
