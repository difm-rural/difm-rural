import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {jobPublicationMessage,JOB_PHOTO_HINT,JOB_PHOTO_REVIEW_HINT,JOB_PHOTO_LIMIT_LABEL} from '../shared/jobGuidance.ts'

const read=path=>readFileSync(new URL('../src/screens/postjob/'+path,import.meta.url),'utf8')

test('the publish message matches what providers will actually see of the location',()=>{
 // Locality only for everyone but the owner and the accepted provider (the jobs_public rule).
 assert.equal(jobPublicationMessage({locality:'Matakana',hasLocation:true}),
  'Your job will be visible to providers near Matakana as soon as you post it. They see the area only; your exact address is shared with the provider you accept.')
 assert.match(jobPublicationMessage({hasLocation:true}),/near your area/)
 // No location at all: no promise about an address.
 assert.equal(jobPublicationMessage({hasLocation:false}),'Your job will be visible to providers across the platform as soon as you post it.')
 // Edits and invitations say what really happens.
 assert.match(jobPublicationMessage({locality:'Matakana',hasLocation:true,isEdit:true}),/^Your changes show on the job as soon as you save\. They see the area only/)
 assert.match(jobPublicationMessage({hasLocation:true,inviteName:'Ana'}),/^Only Ana will see this job\./)
 assert.match(jobPublicationMessage({locality:'Matakana',hasLocation:true,inviteName:'Ana',alsoPublic:true}),/^Your job goes to Ana and to providers near Matakana/)
})

test('Details and Review use the same photo wording; Review passes the real privacy, edit and invite state',()=>{
 const details=read('PostJobStep3Details.js'),review=read('PostJobStep5Review.js')
 assert.match(details,/\{JOB_PHOTO_LIMIT_LABEL\}/)
 assert.match(details,/\{JOB_PHOTO_HINT\}/)
 assert.match(review,/\{JOB_PHOTO_REVIEW_HINT\}/)
 assert.ok(JOB_PHOTO_REVIEW_HINT.includes(JOB_PHOTO_HINT))
 assert.equal(JOB_PHOTO_LIMIT_LABEL,'Optional · up to 6')
 assert.match(review,/isEdit: isEditMode,/)
 assert.match(review,/inviteName: isInvite \?/)
 // The saved privacy flag is unchanged.
 assert.match(readFileSync(new URL('../shared/jobEdit.ts',import.meta.url),'utf8'),/hide_exact_location:!!data\.hideExactLocation,/)
})

test('Step 2 labels say what tracing and skipping do; the five steps stay',()=>{
 const step2=read('PostJobStep2Location.js')
 assert.match(step2,/\{hasArea \? 'Edit work area' : 'Trace work area'\}/)
 assert.match(step2,/>Skip map location</)
 assert.match(step2,/Your town or area is still used\./)
 assert.match(step2,/accessibilityLabel="Remove traced area"/)
 assert.doesNotMatch(step2,/tap Skip/)
 const steps=['PostJobStep1JobType.js','PostJobStep2Location.js','PostJobStep3Details.js','PostJobStep4Budget.js','PostJobStep5Review.js']
 for(const file of steps)assert.ok(read(file).length>0,file)
})
