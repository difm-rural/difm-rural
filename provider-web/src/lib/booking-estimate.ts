export type BookingRate = { kind?: string | null; pricing_type: string; rate: number | null; unit_label?: string | null; minimum_units?: number | null; min_charge?: number | null; max_units?: number | null }
export function bookingEstimate(s: BookingRate, requested: number) {
  const perQuantity=['hourly','day_rate','per_unit'].includes(s.pricing_type)
  let quantity=perQuantity ? Math.max(1,s.minimum_units || 1,Number.isFinite(requested)?requested:1) : 1
  if(s.kind==='grazing' && /^head\/(week|month)$/.test(s.unit_label || '') && s.max_units && s.max_units>=Math.max(1,s.minimum_units || 1)) quantity=Math.min(quantity,s.max_units)
  return {quantity,amount:s.pricing_type==='quote_required'?null:Math.round(Math.max(quantity*Number(s.rate || 0),s.min_charge || 0)*100)/100}
}
