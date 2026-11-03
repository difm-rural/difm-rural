import test from 'node:test'
import assert from 'node:assert/strict'
import {listingCardCopy} from '../shared/listingCardCopy.ts'
test('card overlays do not repeat titles or descriptions despite case and punctuation differences',()=>{
 assert.deepEqual(listingCardCopy('Water delivery',' WATER DELIVERY! ','Fresh local water','Fresh local water.'),{headline:'',supporting:''})
})
test('distinct custom copy remains available and duplicate supporting lines are suppressed',()=>{
 assert.deepEqual(listingCardCopy('Water delivery','Reach difficult places','Reach difficult places!'),{headline:'Reach difficult places',supporting:''})
 assert.deepEqual(listingCardCopy('Water delivery','Reach difficult places','Flexible timing'),{headline:'Reach difficult places',supporting:'Flexible timing'})
})
