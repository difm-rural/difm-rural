export const HOME_MODES = [
 {id:'property',label:'My Property',heading:'Your property, your people'},
 {id:'work',label:'My Work',heading:'Your work, your opportunities'},
] as const

export type HomeMode = typeof HOME_MODES[number]['id']
export const homeModeKey=(owner:string)=>'rc:home-mode:'+owner
export const homeMode=(value:unknown):HomeMode=>value==='work'?'work':'property'
export const homeRole=(mode:HomeMode)=>mode==='work'?'provider':'requester'
