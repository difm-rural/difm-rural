import {listingEstimate,type EstimateListing,type EstimateOption} from '../../../shared/listingEstimate.ts'
export type BookingRate=EstimateListing & {pricing_type:string;rate:number|null}
export function bookingEstimate(s:BookingRate,requested:number,option:EstimateOption|null=null){const estimate=listingEstimate(s,option,requested);return {quantity:estimate.quantity,amount:estimate.baseAmount}}
