import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {addGuidanceToDescription,jobDescriptionGuidance,removeUnusedGuidance} from '../shared/jobGuidance.ts'
import {CATEGORIES} from '../shared/categories.ts'
import {SUPPORT_AREAS} from '../shared/propertyNetwork.ts'

test('description guidance comes from the Property Network service, then the category, then a general set',()=>{
 const trees=jobDescriptionGuidance({category:'Land & Vegetation',service:'Tree trimming'})
 assert.equal(trees.heading,'For tree trimming, it helps to mention')
 assert.ok(trees.prompts.some(prompt=>/how many trees/i.test(prompt)))
 assert.ok(trees.prompts.some(prompt=>/access/i.test(prompt)))
 assert.ok(trees.prompts.some(prompt=>/debris/i.test(prompt)))
 assert.equal(jobDescriptionGuidance({category:'Fencing & Gates'}).heading,'It helps to mention')
 assert.match(jobDescriptionGuidance({category:'Fencing & Gates'}).prompts[0],/metres/)
 // An unknown custom service falls back to its category; nothing at all gives the general set.
 assert.deepEqual(jobDescriptionGuidance({category:'Fencing & Gates',service:'Check the spring intake'}).prompts,
  jobDescriptionGuidance({category:'Fencing & Gates'}).prompts)
 assert.ok(jobDescriptionGuidance({}).prompts.length===3)
 // Every category has its own short guidance.
 for(const category of CATEGORIES){
  const {prompts}=jobDescriptionGuidance({category})
  assert.ok(prompts.length>=2&&prompts.length<=3,category)
  assert.ok(prompts.every(prompt=>prompt.length<=90),category)
 }
 // Most Property Network services have specific guidance.
 const names=SUPPORT_AREAS.flatMap(area=>area.services.map(service=>service.name))
 const specific=names.filter(name=>jobDescriptionGuidance({service:name}).heading.startsWith('For '))
 assert.ok(specific.length>=names.length/2,specific.length+' of '+names.length)
})

test('prompts are optional and editable: added after what is written, removed if left blank',()=>{
 const {prompts}=jobDescriptionGuidance({service:'Tree trimming'})
 const added=addGuidanceToDescription('Three big macrocarpas by the house.',prompts)
 assert.ok(added.startsWith('Three big macrocarpas by the house.\n\n'))
 assert.equal(added.split('\n').length,2+prompts.length)
 assert.equal(addGuidanceToDescription(added,prompts),added,'adding twice changes nothing')
 assert.equal(addGuidanceToDescription('',prompts).split('\n')[0],prompts[0]+': ')
 // Answered prompts stay; untouched ones go; the member's own words are never removed.
 const filled=added.replace(prompts[0]+': ',prompts[0]+': 3, about 10 m')
 assert.equal(removeUnusedGuidance(filled,prompts),'Three big macrocarpas by the house.\n\n'+prompts[0]+': 3, about 10 m')
 assert.equal(removeUnusedGuidance(addGuidanceToDescription('',prompts),prompts),'')
 assert.equal(removeUnusedGuidance('Gate: broken hinge',prompts),'Gate: broken hinge')
})

test('Step 3 shows the guidance, keeps it optional, and the Property Network passes its service',()=>{
 const step3=readFileSync(new URL('../src/screens/postjob/PostJobStep3Details.js',import.meta.url),'utf8')
 assert.match(step3,/jobDescriptionGuidance\(/)
 assert.match(step3,/Add these to the description/)
 // Once added, the box says where to answer and that blank lines go; the list isn't repeated.
 assert.match(step3,/Type your answers after each colon in the box below\. When you continue, they become sentences and blank lines are removed./)
 assert.match(step3,/!guidanceAdded \? \(/)
 assert.match(step3,/>Optional</)
 assert.match(step3,/if \(finalDescription !== description\) setDescription\(finalDescription\)/)
 assert.match(step3,/finalDescription\.length >= 8/)
 // No second AI implementation on this step.
 assert.doesNotMatch(step3,/functions\.invoke|draftJobFromText/)
 const step1=readFileSync(new URL('../src/screens/postjob/PostJobStep1JobType.js',import.meta.url),'utf8')
 assert.match(step1,/propertyService:String\(prefill\.service\)/)
 const network=readFileSync(new URL('../src/screens/PropertyNetworkScreen.js',import.meta.url),'utf8')
 assert.match(network,/prefill:\{category,service\}/)
 assert.equal((network.match(/post\(null,postCategory,service\.name\)/g)||[]).length,2)
 const context=readFileSync(new URL('../src/context/PostJobContext.js',import.meta.url),'utf8')
 assert.match(context,/propertyService: +'',/)
})
