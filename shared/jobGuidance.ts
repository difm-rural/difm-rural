// Short, optional prompts for Step 3 (Describe the job): what a provider needs
// to know to price the work. Chosen by the Property Network service the job
// came from, else by category, else a general set. Never AI, never required.

type Guidance = {heading:string;prompts:readonly string[]}

const GENERAL=['What needs doing, and roughly how much of it','Access: gates, tracks, vehicle or trailer access','Anything to take away or tidy up afterwards'] as const

// By Property Network service name (lower case).
const SERVICES:Record<string,readonly string[]>={
 'tree trimming':['How many trees, and roughly how tall','Access for a vehicle, ladder or machinery','Whether the branches and debris need taking away'],
 'tree removal':['How many trees, how big, and what is nearby (fences, lines, buildings)','Access for a vehicle or machinery','Whether you want the wood cut for firewood, left, or taken away'],
 'firewood':['How much (cubic metres or trailer loads) and the type of wood','Split and dry, or green','Delivered and stacked, or dropped off'],
 'fence repairs':['Roughly how many metres, and the type of fence (post and wire, netting, electric)','What is damaged and whether materials are on site','Access along the fence line'],
 'new fencing':['Roughly how many metres, and the type of fence','Ground conditions (flat, hilly, rocky)','Whether you supply materials or the provider does'],
 'gates':['How many gates, and new or repairs','Gate width and type','Whether posts need replacing too'],
 'electric fencing':['Roughly how many metres or which paddocks','Energiser and earth: working, or need checking','The problem (no power, shorts, new run)'],
 'water delivery':['How much water (litres) and the tank size','Truck access to the tank','How soon you need it'],
 'pump repairs':['The type of pump and what it is doing (not starting, losing pressure)','Where it is and how to reach it','Whether power is available on site'],
 'trough and pipe repairs':['How many troughs or how much pipe','Where the leak or fault is','Access by vehicle'],
 'tank cleaning':['How many tanks and their size','How much water is in them now','Access for a truck or equipment'],
 'paddock mowing':['Roughly how many hectares','The grass height and ground (flat, rough, steep)','Whether you want it mulched, left or baled'],
 'weed spraying':['The weed, and roughly how many hectares or metres','Nearby waterways, crops or neighbours to watch for','Access for a vehicle, quad or knapsack only'],
 'gutter cleaning':['How many buildings and storeys','Roof type and access','Whether downpipes need clearing too'],
 'roof repairs':['The roof type and what is wrong','Height and access','Whether materials are on site'],
 'gravel delivery':['How many cubic metres and the type of gravel','Truck access to where it goes','Spread, or dropped in a pile'],
 'grading':['Roughly how long the driveway or track is','Its condition (potholes, washouts)','Whether new metal is needed'],
 'stock handling':['The animals and how many','What needs doing (moving, drafting, yarding)','Yards, races and dogs available'],
 'shearing':['How many sheep and what type','Shed and yards available','Whether you need crutching or dagging too'],
 'house sitting':['The dates you are away','Animals, gardens or tasks to look after','Whether the sitter stays overnight'],
 'property checks':['How often and for how long','What to check (water, stock, buildings, gates)','How you want to hear back'],
}

// By job category.
const CATEGORIES:Record<string,readonly string[]>={
 'Fencing & Gates':SERVICES['fence repairs'],
 'Animals & Farm Sitting':['The animals and how many','What needs doing, and how often','Yards, equipment or dogs available'],
 'Water & Drainage':['What is wrong or needs doing (leak, blockage, new supply)','Where it is and how to reach it','How urgent it is'],
 'Spraying & Pest Control':SERVICES['weed spraying'],
 'Land & Vegetation':['The area (hectares or metres) or how many trees','Ground and access (flat, steep, vehicle access)','Whether debris needs taking away'],
 'Cropping, Hay & Feed':['How much (bales, tonnes or hectares)','When you need it','Delivered, or picked up'],
 'Earthworks & Driveways':['Roughly how big the job is (length, area or cubic metres)','Ground conditions and access for machinery','Whether materials are needed'],
 'Machinery & Repairs':['The machine (make, model) and the problem','Where it is: workshop or in the paddock','Whether parts are on hand'],
 'Buildings & Maintenance':['The building and what needs doing','Height and access','Whether materials are on site'],
 'Transport & Delivery':['What needs moving, and how much or how heavy','From where to where','Loading and unloading help needed'],
 'Property & House Sitting':SERVICES['house sitting'],
 'General Rural Help':GENERAL,
}

export function jobDescriptionGuidance({category,service}:{category?:string|null;service?:string|null}):Guidance{
 const byService=service?SERVICES[service.trim().toLocaleLowerCase('en-NZ')]:undefined
 if(byService)return {heading:'For '+service!.trim().toLocaleLowerCase('en-NZ')+', it helps to mention',prompts:byService}
 const byCategory=category?CATEGORIES[category]:undefined
 if(byCategory)return {heading:'It helps to mention',prompts:byCategory}
 return {heading:'It helps to mention',prompts:GENERAL}
}

// Starter lines the member can tap to add and then fill in or delete. Appended
// after anything already written; never replaces it.
export function addGuidanceToDescription(description:string,prompts:readonly string[]){
 const lines=prompts.map(prompt=>prompt+': ')
 const missing=lines.filter(line=>!description.includes(line.trim()))
 if(!missing.length)return description
 const base=description.replace(/\s+$/,'')
 return (base?base+'\n\n':'')+missing.join('\n')
}

// On Next: drop starter lines left unanswered ("Prompt:" with nothing after),
// so an untouched prompt is never posted. Anything the member typed stays.
export function removeUnusedGuidance(description:string,prompts:readonly string[]){
 const unused=new Set(prompts.map(prompt=>prompt+':'))
 return description.split('\n').filter(line=>!unused.has(line.trim())).join('\n').replace(/\n{3,}/g,'\n\n').trim()
}
