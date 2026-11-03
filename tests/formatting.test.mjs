import test from 'node:test'
import assert from 'node:assert/strict'
import {formatMoney,formatDate,formatDateTime,formatDateLabel} from '../shared/formatting.js'
import {formatRate,addOnDisplay} from '../shared/listingPricing.ts'
import {formatOfferAmount} from '../shared/offers.ts'
test('NZ money groups thousands, preserves cents and omits the NZD suffix',()=>{
 assert.equal(formatMoney(100000000),'$100,000,000')
 assert.equal(formatMoney('1250.5'),'$1,250.50')
 assert.equal(formatMoney(0),'$0')
 assert.equal(formatMoney(-1250), '-$1,250')
 for(const value of [null,undefined,'','abc',Infinity])assert.equal(formatMoney(value),'—')
 assert.equal(formatRate('fixed',100000000),'$100,000,000 fixed')
 assert.equal(formatOfferAmount(1200,'hourly'),'$1,200/hr')
 assert.equal(addOnDisplay({amount:'1234.50',label:'Delivery'}),'+$1,234.50 Delivery')
})
test('calendar dates remain literal while timestamps use the New Zealand day',()=>{
 assert.equal(formatDate('2026-12-01'),'1 Dec 2026')
 assert.equal(formatDate('2026-12-01T11:30:00Z'),'2 Dec 2026')
 assert.match(formatDateTime('2026-12-01T11:30:00Z'),/^2 Dec 2026, 12:30/)
 for(const value of ['2026-02-30','invalid',null,''])assert.equal(formatDate(value),'—')
 assert.equal(formatDateLabel('2026-12-01'),'1 Dec 2026')
 assert.equal(formatDateLabel('Weekdays'),'Weekdays')
})

test('free rates are explicit without hiding minimum charges or quote-required pricing',()=>{
 assert.equal(formatRate('fixed',0),'Free')
 assert.equal(formatRate('hourly',0,null,150),'Minimum $150')
 assert.equal(formatRate('quote_required',0),'Quote required')
})
