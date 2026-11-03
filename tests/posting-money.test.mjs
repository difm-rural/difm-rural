import assert from 'node:assert/strict'
import test from 'node:test'
import {moneyInputError,listingMoneyError,MAX_POSTING_AMOUNT} from '../shared/postingMoney.ts'
test('posting money rejects excessive values and precision without truncating input',()=>{
 for(const value of ['999999999999','99999999999999','100000000','12.345','1e3','12abc','Infinity','NaN','-1','',null])assert.ok(moneyInputError(value),String(value))
 for(const value of ['0.01','12.34','12','12.',' .50 ',MAX_POSTING_AMOUNT])assert.equal(moneyInputError(value),'',String(value))
 assert.equal(moneyInputError('0','Budget').length>0,true)
 assert.equal(moneyInputError('0','Rate',true),'')
 assert.ok(moneyInputError('10000000.01'))
})
test('all listing money fields use the same bounds and precision',()=>{
 const base={pricingType:'fixed',rate:'50',minCharge:'',addOns:[],variants:[]}
 for(const patch of [{rate:'12.345'},{rate:'99999999999999'},{minCharge:'100000000'},{addOns:[{label:'Delivery',amount:'12.345'}]},{variants:[{label:'Large',rate:'99999999999999'}]},{variants:[{label:'Large',rate:'50',min_charge:'12.345'}]}])assert.ok(listingMoneyError({...base,...patch}),JSON.stringify(patch))
 assert.equal(listingMoneyError({...base,rate:'0'}),'')
 assert.equal(listingMoneyError({...base,pricingType:'quote_required',rate:''}),'')
 assert.equal(listingMoneyError({...base,addOns:[{label:'Delivery',amount:'12.34'}],variants:[{label:'Large',rate:'60.50',min_charge:'100'}]}),'')
 assert.ok(listingMoneyError({...base,variants:[{label:'Large',rate:'0'}]}))
})
