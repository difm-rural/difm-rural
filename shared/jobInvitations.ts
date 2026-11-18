export const ACTIVE_JOB_INVITATIONS=['pending','seen','accepted']

export function invitationLabel(status:string){
 switch(status){
  case 'accepted':return 'Invitation accepted'
  case 'seen':return 'Invitation opened'
  case 'declined':return 'Invitation declined'
  case 'withdrawn':return 'Invitation withdrawn'
  default:return 'Invitation sent'
 }
}
