// Step 3, on Next: turn answered description prompts ("Prompt: answer" lines) into
// short sentences without their labels. Fixed templates only, never AI. Rules:
// - only a line that still starts with one of our exact prompts is touched;
// - a template is used only when the answer plainly fits it, otherwise the member's
//   words are kept as they are, with just enough context to still make sense;
// - unanswered prompts are dropped and everything else is left alone.
import { JOB_PROMPTS, removeUnusedGuidance } from './jobGuidance'

// about: what the answer is about. one/many: the unit for a bare number.
// yes/no: the sentence for a plain yes or no.
// access: what "good" describes. works: the answer is the amount of work.
type Template={about:string;one?:string;many?:string;yes?:string;no?:string;access?:string;works?:boolean}
const BRANCHES='Whether the branches and debris need taking away'
const TIDY='Anything to take away or tidy up afterwards'
const TREE_TIDY='Please include removal of branches and a tidy-up afterwards.'

export const ANSWER_TEMPLATES:Record<string,Template>={
 'What needs doing, and roughly how much of it':{about:'the work',works:true},
 'Access: gates, tracks, vehicle or trailer access':{about:'access',access:'vehicle access'},
 'Anything to take away or tidy up afterwards':{about:'taking things away and tidying up',yes:'Please include taking things away and a tidy-up afterwards.',no:'There is nothing to take away or tidy up.'},
 'How many trees, and roughly how tall':{about:'the trees',one:'tree',many:'trees',works:true},
 'Access for a vehicle, ladder or machinery':{about:'access',access:'vehicle access',yes:'There is access for a vehicle, ladder or machinery.',no:'There is no access for a vehicle, ladder or machinery.'},
 'Whether the branches and debris need taking away':{about:'the branches and debris',yes:'Please include removal of the branches and debris.',no:'The branches and debris do not need taking away.'},
 'How many trees, how big, and what is nearby (fences, lines, buildings)':{about:'the trees',one:'tree',many:'trees',works:true},
 'Access for a vehicle or machinery':{about:'access',access:'vehicle access',yes:'There is access for a vehicle or machinery.',no:'There is no access for a vehicle or machinery.'},
 'Whether you want the wood cut for firewood, left, or taken away':{about:'the wood'},
 'How much (cubic metres or trailer loads) and the type of wood':{about:'the amount and type of wood'},
 'Split and dry, or green':{about:'the wood'},
 'Delivered and stacked, or dropped off':{about:'delivery'},
 'Roughly how many metres, and the type of fence (post and wire, netting, electric)':{about:'the fence',one:'metre',many:'metres'},
 'What is damaged and whether materials are on site':{about:'the damage and materials'},
 'Access along the fence line':{about:'access along the fence line',access:'access along the fence line',yes:'There is access along the fence line.',no:'There is no access along the fence line.'},
 'Roughly how many metres, and the type of fence':{about:'the fence',one:'metre',many:'metres'},
 'Ground conditions (flat, hilly, rocky)':{about:'the ground'},
 'Whether you supply materials or the provider does':{about:'who supplies materials'},
 'How many gates, and new or repairs':{about:'the gates',one:'gate',many:'gates'},
 'Gate width and type':{about:'the gate width and type'},
 'Whether posts need replacing too':{about:'the posts',yes:'The posts need replacing too.',no:'The posts do not need replacing.'},
 'Roughly how many metres or which paddocks':{about:'the metres or paddocks'},
 'Energiser and earth: working, or need checking':{about:'the energiser and earth'},
 'The problem (no power, shorts, new run)':{about:'the problem'},
 'How much water (litres) and the tank size':{about:'the water and tank size'},
 'Truck access to the tank':{about:'truck access to the tank',access:'truck access to the tank',yes:'There is truck access to the tank.',no:'There is no truck access to the tank.'},
 'How soon you need it':{about:'timing'},
 'The type of pump and what it is doing (not starting, losing pressure)':{about:'the pump'},
 'Where it is and how to reach it':{about:'where it is and how to reach it'},
 'Whether power is available on site':{about:'power on site',yes:'Power is available on site.',no:'Power is not available on site.'},
 'How many troughs or how much pipe':{about:'the troughs or pipe'},
 'Where the leak or fault is':{about:'where the leak or fault is'},
 'Access by vehicle':{about:'vehicle access',access:'vehicle access',yes:'There is vehicle access.',no:'There is no vehicle access.'},
 'How many tanks and their size':{about:'the tanks',one:'tank',many:'tanks'},
 'How much water is in them now':{about:'the water in them now'},
 'Access for a truck or equipment':{about:'access for a truck or equipment',yes:'There is access for a truck or equipment.',no:'There is no access for a truck or equipment.'},
 'Roughly how many hectares':{about:'the area',one:'hectare',many:'hectares',works:true},
 'The grass height and ground (flat, rough, steep)':{about:'the grass height and ground'},
 'Whether you want it mulched, left or baled':{about:'the cut grass'},
 'The weed, and roughly how many hectares or metres':{about:'the weeds and area'},
 'Nearby waterways, crops or neighbours to watch for':{about:'nearby waterways, crops or neighbours',no:'There are no nearby waterways, crops or neighbours to watch for.'},
 'Access for a vehicle, quad or knapsack only':{about:'access'},
 'How many buildings and storeys':{about:'the buildings and storeys'},
 'Roof type and access':{about:'the roof type and access'},
 'Whether downpipes need clearing too':{about:'the downpipes',yes:'The downpipes need clearing too.',no:'The downpipes do not need clearing.'},
 'The roof type and what is wrong':{about:'the roof'},
 'Height and access':{about:'height and access'},
 'Whether materials are on site':{about:'materials',yes:'Materials are on site.',no:'Materials are not on site.'},
 'How many cubic metres and the type of gravel':{about:'the gravel',one:'cubic metre',many:'cubic metres'},
 'Truck access to where it goes':{about:'truck access to where it goes',access:'truck access to where it goes',yes:'There is truck access to where it goes.',no:'There is no truck access to where it goes.'},
 'Spread, or dropped in a pile':{about:'the gravel'},
 'Roughly how long the driveway or track is':{about:'the driveway or track length'},
 'Its condition (potholes, washouts)':{about:'its condition'},
 'Whether new metal is needed':{about:'new metal',yes:'New metal is needed.',no:'New metal is not needed.'},
 'The animals and how many':{about:'the animals'},
 'What needs doing (moving, drafting, yarding)':{about:'the work'},
 'Yards, races and dogs available':{about:'yards, races and dogs'},
 'How many sheep and what type':{about:'the sheep',one:'sheep',many:'sheep',works:true},
 'Shed and yards available':{about:'the shed and yards',yes:'A shed and yards are available.',no:'No shed or yards are available.'},
 'Whether you need crutching or dagging too':{about:'crutching or dagging',no:'Crutching and dagging are not needed.'},
 'The dates you are away':{about:'the dates away'},
 'Animals, gardens or tasks to look after':{about:'what to look after'},
 'Whether the sitter stays overnight':{about:'staying overnight',yes:'The sitter needs to stay overnight.',no:'The sitter does not need to stay overnight.'},
 'How often and for how long':{about:'how often and for how long'},
 'What to check (water, stock, buildings, gates)':{about:'what to check'},
 'How you want to hear back':{about:'hearing back'},
 'What needs doing, and how often':{about:'the work'},
 'Yards, equipment or dogs available':{about:'yards, equipment or dogs'},
 'What is wrong or needs doing (leak, blockage, new supply)':{about:'the problem or work'},
 'How urgent it is':{about:'urgency'},
 'The area (hectares or metres) or how many trees':{about:'the area or trees',works:true},
 'Ground and access (flat, steep, vehicle access)':{about:'the ground and access'},
 'Whether debris needs taking away':{about:'the debris',yes:'Please include removal of the debris.',no:'The debris does not need taking away.'},
 'How much (bales, tonnes or hectares)':{about:'the amount'},
 'When you need it':{about:'timing'},
 'Delivered, or picked up':{about:'delivery'},
 'Roughly how big the job is (length, area or cubic metres)':{about:'the size of the job'},
 'Ground conditions and access for machinery':{about:'the ground and machinery access'},
 'Whether materials are needed':{about:'materials',yes:'Materials are needed.',no:'Materials are not needed.'},
 'The machine (make, model) and the problem':{about:'the machine and problem'},
 'Where it is: workshop or in the paddock':{about:'where it is'},
 'Whether parts are on hand':{about:'parts',yes:'Parts are on hand.',no:'Parts are not on hand.'},
 'The building and what needs doing':{about:'the building and work'},
 'What needs moving, and how much or how heavy':{about:'what needs moving'},
 'From where to where':{about:'the trip'},
 'Loading and unloading help needed':{about:'loading and unloading',yes:'Help with loading and unloading is needed.',no:'Help with loading and unloading is not needed.'},
}

// The verb comes from the member's own service or title, and only when exactly one fits.
const VERBS:readonly [RegExp,string,string][]=[
 [/\btrim/i,'Trim','trees?|hedges?|shrubs?|branches'],
 [/\bprun/i,'Prune','trees?|hedges?|shrubs?|vines?'],
 [/\btree removal\b|\b(remov|fell|cut down)/i,'Remove','trees?'],
 [/\bmow/i,'Mow','hectares?|ha|acres?|paddocks?|lawns?'],
 [/\bshear/i,'Shear','sheep|ewes?|lambs?|hoggets?|rams?'],
]
const HEDGE='(?:about |approx(?:imately|\\.)? |roughly |around |up to |~)'
const HEDGED=/\b(?:exactly|about|approx|roughly|around|up to|over|under|at least|at most)|~/i
const HEIGHT=/,\s*(\d+(?:\.\d+)?\s*(?:m|metres?|meters?|ft|feet)\s+(?:tall|high)[.]?)$/i
const MEASURE='\\d+(?:\\.\\d+)?\\s*(?:m|metres?|meters?|ft|feet)(?:\\s+(?:tall|high|long|wide))?(?:\\s+each)?'

const YES_FILLERS=new Set(['please','pls','thanks','all','of','it','them','that','they','do','does','is','are','need','needs','needed','too','afterwards'])
const GROUND=new Set('flat hilly rocky steep rough rolling wet dry soft firm hard boggy sandy clay mostly quite very fairly and'.split(' '))

const capital=(text:string)=>text.charAt(0).toLocaleUpperCase('en-NZ')+text.slice(1)
const sentence=(text:string)=>{
 const body=capital(text.trim().replace(/[\s,;:]+$/,''))
 return /[.!?…]["'”’)]?$/.test(body)?body:body+'.'
}
const words=(text:string)=>text.toLocaleLowerCase('en-NZ').match(/\p{L}+/gu)??[]
const stems=(text:string)=>new Set(words(text).filter(word=>word.length>3).map(word=>word.slice(0,4)))
// Lower-cases only plain opening words; names and "I" keep their capital.
const follow=(text:string)=>text.replace(/^(Yes|Yep|Yeah|No|Not|The|A|An|It|They|There|Please|By|Via|From|Good|Easy|Both|All|Some|Only|Just|About|Around)\b/,word=>word.toLowerCase())
const inContext=(about:string,answer:string)=>sentence('As for '+about+', '+follow(answer))

function workSentence(answer:string,context:string){
 const matches=VERBS.filter(([pattern])=>pattern.test(context))
 if(matches.length!==1)return ''
 const [,verb,nouns]=matches[0]
 // Only "5 trees" or "5 large trees, 6 m tall": anything more stays in the member's words.
 const fits=new RegExp('^'+HEDGE+'?\\d+(?:\\.\\d+)?\\s*(?:(?:large|big|small|tall|medium) )?(?:'+nouns+')(?:\\s*[,(]\\s*'+HEDGE+'?'+MEASURE+'\\)?)?[.]?$','i')
 return fits.test(answer)?sentence(verb+' '+follow(answer)):''
}

// One answered prompt as a sentence. `context` is the member's own service or title.
export function answerSentence(prompt:string,raw:string,context=''){
 const template=ANSWER_TEMPLATES[prompt]
 let answer=raw.trim()
 if(!template||!answer)return answer
 const bare=answer.replace(/[.!]+$/,'').trim().toLocaleLowerCase('en-NZ')

 // Plain yes / no. A "yes" may only add words that change nothing ("yes please, all
 // of it"); "yes, a vehicle" or "yes but not the logs" keep the member's own words.
 const yes=bare.match(/^(?:yes|yep|yeah|yup|y)(?:[\s,]+(.*))?$/)
 if(yes){
  const rest=/\d/.test(answer)?['digits']:words(yes[1]??'').filter(word=>!YES_FILLERS.has(word))
  const tidy=rest.length>0&&rest.every(word=>word==='tidy'||word==='up')
  const trees=/\b(?:trim|prun)/i.test(context)&&/\b(?:tree|hedge)/i.test(context)
  if(tidy&&prompt===BRANCHES)return TREE_TIDY
  if(tidy&&prompt===TIDY)return trees?TREE_TIDY:'Please include a tidy-up afterwards.'
  return template.yes&&!rest.length?template.yes:inContext(template.about,answer)
 }
 if(/^(?:no|nope|nah|n)(?:[\s,]+(?:thanks|thank you))?$/.test(bare))return template.no??inContext(template.about,answer)
 if(/^(?:not sure|unsure|don['’]?t know|no idea)$/.test(bare))return 'Not sure about '+template.about+'.'

 if(template.access){
  const quality=bare.match(/^((?:very |really |quite |pretty )?)(good|great|excellent|easy|reasonable|limited|poor|tight|difficult)(?: access)?$/)
  if(quality){
   const how=quality[1]+quality[2]
   return /limited|poor|tight|difficult/.test(how)?capital(template.access)+' is '+how+'.':capital(how)+' '+template.access+' is available.'
  }
 }
 if(/\baccess\b/.test(template.about)&&!/ and /.test(template.about)&&/^(?:via|through|from|off|along)\b/.test(bare))return sentence('Access is '+follow(answer.replace(/^(Through|Off|Along)\b/,word=>word.toLowerCase())))
 if(template.about==='timing'&&/^(?:by|before|within|in|on|this|next|asap|as soon as)\b/.test(bare))
  return sentence('This is needed '+answer.replace(/^(?:By|Before|Within|In|On|This|Next|As)\b/,word=>word.toLowerCase()))
 if(template.about==='the ground'&&words(answer).length>0&&words(answer).every(word=>GROUND.has(word)))return sentence('The ground is '+bare)
 if(template.many&&/^\d+(?:\.\d+)?$/.test(bare))answer=bare+' '+(bare==='1'?template.one:template.many)
 // "5, 6 m tall" or "200, post and wire": the first number is the one asked for.
 else if(template.many)answer=answer.replace(/^(\d+)(?=,\s+(?:[a-z]|\d+(?:\.\d+)?\s*(?:m|metres?|meters?|ft|feet)\b))/i,(_,n)=>n+' '+(n==='1'?template.one:template.many))
 // The height was asked for roughly, so a plain height is given as an estimate.
 if(/\broughly\b/.test(prompt)&&!HEDGED.test(answer))answer=answer.replace(HEIGHT,', approximately $1')
 if(template.works){
  const work=workSentence(answer,context)
  if(work)return work
 }
 // Already says what it is about (or describes the work itself): the words stand alone.
 const own=stems(answer)
 const clear=!/^no\b\s*[,.;:]/i.test(answer)&&
  ((/^the (?:work|problem)/.test(template.about)&&words(answer).length>1)||[...stems(template.about)].some(stem=>own.has(stem)))
 return clear?sentence(answer):inContext(template.about,answer)
}

// What Step 3 saves. `skip` is a description whose prompt lines stay as written (a
// job already posted with them). Text with no answered prompts is only tidied as before.
export function finishJobDescription(description:string,{service,title,skip=''}:{service?:string|null;title?:string|null;skip?:string}={}){
 const kept=new Set(skip.split('\n').map(line=>line.trim()))
 const out:string[]=[]
 let joining=false
 for(const line of removeUnusedGuidance(description,JOB_PROMPTS).split('\n')){
  const text=line.trim()
  const prompt=kept.has(text)?undefined:JOB_PROMPTS.find(item=>text.startsWith(item+':'))
  if(!prompt){out.push(line);if(text)joining=false;continue}
  const made=answerSentence(prompt,text.slice(prompt.length+1),(service||title||'').trim())
  if(joining){
   while(!out[out.length-1].trim())out.pop()
   out[out.length-1]+=' '+made
  }else out.push(made)
  joining=true
 }
 return out.join('\n').trim()
}
