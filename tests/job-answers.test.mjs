import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {ANSWER_TEMPLATES,answerSentence,finishJobDescription} from '../shared/jobAnswers.ts'
import {JOB_PROMPTS,addGuidanceToDescription,jobDescriptionGuidance} from '../shared/jobGuidance.ts'

const prompts=input=>jobDescriptionGuidance(input).prompts
const filled=(list,answers)=>list.map((prompt,i)=>prompt+': '+answers[i]).join('\n')
const [TREES,ACCESS,BRANCHES]=prompts({service:'Tree trimming'})
const EXPECTED='Trim 5 trees, approximately 6 metres tall. Good vehicle access is available. Please include removal of branches and a tidy-up afterwards.'
const answers=['5 trees, 6 metres tall','good access','yes tidy up']

test('the reviewed example becomes three natural sentences, from a service or a general job',()=>{
 assert.equal(finishJobDescription(filled(prompts({service:'Tree trimming'}),answers),{service:'Tree trimming',title:'Help'}),EXPECTED)
 assert.equal(finishJobDescription(filled(prompts({category:'General Rural Help'}),answers),{title:'Tree trimming'}),EXPECTED)
 // Nothing says trimming or trees: no verb or branches are invented.
 assert.equal(finishJobDescription(filled(prompts({}),answers),{title:'Help wanted'}),
  '5 trees, approximately 6 metres tall. Good vehicle access is available. Please include a tidy-up afterwards.')
})

test('every prompt has a template, and no answered prompt ever keeps its label or loses a word',()=>{
 assert.deepEqual(JOB_PROMPTS.filter(prompt=>!ANSWER_TEMPLATES[prompt]),[])
 assert.deepEqual(Object.keys(ANSWER_TEMPLATES).filter(prompt=>!JOB_PROMPTS.includes(prompt)),[])
 const odd='Ring Aroha McKay first: 021 555, $40/hr (gate 7b)'
 for(const prompt of JOB_PROMPTS){
  const made=finishJobDescription(prompt+': '+odd,{title:'Tree trimming'})
  assert.ok(made.includes('Aroha McKay first: 021 555, $40/hr (gate 7b)'),prompt)
  assert.ok(!made.includes(prompt+':'),prompt)
  for(const plain of ['yes','no','not sure','12'])
   assert.match(finishJobDescription(prompt+': '+plain,{title:'Tree trimming'}),/^[\p{Lu}\d][^:]*\.$/u,prompt+' / '+plain)
 }
})

test('yes and no keep their meaning; anything qualified stays in the member\'s words',()=>{
 const branches=answer=>answerSentence(BRANCHES,answer,'Tree trimming')
 assert.equal(branches('Yes please'),'Please include removal of the branches and debris.')
 assert.equal(branches('no'),'The branches and debris do not need taking away.')
 assert.equal(branches('not sure'),'Not sure about the branches and debris.')
 assert.equal(branches('yes but not the logs'),'As for the branches and debris, yes but not the logs.')
 assert.equal(branches('yes the wood can stay'),'As for the branches and debris, yes the wood can stay.')
 assert.equal(branches('yes 2 trailer loads'),'As for the branches and debris, yes 2 trailer loads.')
 assert.equal(branches('no, leave it'),'As for the branches and debris, no, leave it.')
 assert.equal(branches('No need to take the branches away'),'No need to take the branches away.')
 // Never widened to the whole question, and either/or questions are never guessed.
 assert.equal(answerSentence(ACCESS,'yes, a vehicle'),'As for access, yes, a vehicle.')
 assert.equal(answerSentence('Whether you want the wood cut for firewood, left, or taken away','yes'),'As for the wood, yes.')
})

test('amounts, access, timing and ground use a template only when the answer plainly fits',()=>{
 const trees=answer=>answerSentence(TREES,answer,'Tree trimming')
 assert.equal(trees('5'),'Trim 5 trees.')
 assert.equal(trees('1'),'Trim 1 tree.')
 assert.equal(trees('5, 6m tall'),'Trim 5 trees, approximately 6m tall.')
 assert.equal(trees('about 5 trees, 6m tall'),'Trim about 5 trees, 6m tall.')
 assert.equal(trees('exactly 5 trees, 6 m tall'),'Exactly 5 trees, 6 m tall.')
 assert.equal(trees('5 trees, 2 to trim and 3 to remove'),'5 trees, 2 to trim and 3 to remove.')
 assert.equal(answerSentence(TREES,'5 trees','Trim and remove trees'),'5 trees.')
 assert.equal(answerSentence(ACCESS,'limited'),'Vehicle access is limited.')
 assert.equal(answerSentence(ACCESS,'via the back gate'),'Access is via the back gate.')
 assert.equal(answerSentence(ACCESS,'good access but steep'),'Good access but steep.')
 assert.equal(answerSentence('How soon you need it','By next Friday'),'This is needed by next Friday.')
 assert.equal(answerSentence('Ground conditions (flat, hilly, rocky)','steep and rocky'),'The ground is steep and rocky.')
 assert.equal(answerSentence('Roughly how many metres, and the type of fence','200, post and wire'),'As for the fence, 200 metres, post and wire.')
 // "3" may be paddock 3, so no unit is guessed.
 assert.equal(answerSentence('Roughly how many metres or which paddocks','3'),'As for the metres or paddocks, 3.')
})

test('free text, edited labels and posted jobs are left alone; blanks go; a second Next changes nothing',()=>{
 const free='Gate: broken hinge\nAccess: good access\n\nCall me after 5 pm'
 assert.equal(finishJobDescription(free,{title:'Tree trimming'}),free)
 const edited='How many trees: 5\n'+ACCESS+' - good'
 assert.equal(finishJobDescription(edited,{title:'Tree trimming'}),edited)
 const list=prompts({service:'Tree trimming'})
 const draft=addGuidanceToDescription('Three big macrocarpas by the house',list).replace(ACCESS+': ',ACCESS+': good')+'\nDogs on site'
 const once=finishJobDescription(draft,{service:'Tree trimming'})
 // Text after a blank prompt stays on its own line.
 assert.equal(once,'Three big macrocarpas by the house\n\nGood vehicle access is available.\nDogs on site')
 assert.equal(finishJobDescription(once,{service:'Tree trimming'}),once)
 assert.equal(finishJobDescription(EXPECTED+' Watch the dog',{service:'Tree trimming'}),EXPECTED+' Watch the dog')
 assert.equal(finishJobDescription(addGuidanceToDescription('',list),{}),'')
 // Editing a posted job: its own lines stay as posted; newly answered ones are converted.
 const posted=TREES+': 5 trees'
 assert.equal(finishJobDescription(posted+'\n'+ACCESS+': good',{service:'Tree trimming',skip:posted}),posted+'\nGood vehicle access is available.')
})

test('Step 3 converts only on Next, validates what it saves, and adds no AI or web call',()=>{
 const step3=readFileSync(new URL('../src/screens/postjob/PostJobStep3Details.js',import.meta.url),'utf8')
 assert.match(step3,/finishJobDescription\(description, \{ service, title: jobData\.title, skip: posted \}\)/)
 assert.match(step3,/const posted = route\.params\?\.mode === 'edit' \?/)
 assert.match(step3,/postingTextError\(finalDescription,'description'\)/)
 assert.equal((step3.match(/setDescription\(finalDescription\)/g)||[]).length,1)
 assert.match(step3,/onChangeText=\{setDescription\}/)
 assert.match(step3,/When you continue, they become sentences and blank lines are removed\./)
 assert.doesNotMatch(readFileSync(new URL('../shared/jobAnswers.ts',import.meta.url),'utf8'),/fetch\(|invoke\(|supabase|await /)
})
