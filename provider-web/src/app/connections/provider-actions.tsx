import { Bookmark } from 'lucide-react'
import Link from '@/components/navigation-link'
import { ActionForm } from '@/components/action-form'
import { ShareProvider } from '@/components/share-provider'
import { inviteConnection } from './actions'
import { saveProvider } from './save-provider'
import { providerInviteJobs, type loadInviteChoices } from '@shared/trustedLocals'

export function SaveProviderButton({provider,saved}:{provider:string;saved:boolean}){
 return <div className="lform-actions"><Bookmark size={17} aria-hidden="true" fill={saved?'currentColor':'none'}/>
  <ActionForm action={saveProvider} label={saved?'Remove from saved':'Save provider'}>
   <input type="hidden" name="provider_id" value={provider}/>
   <input type="hidden" name="intent" value={saved?'remove':'save'}/>
  </ActionForm>
 </div>
}

export function LocalProviderActions({provider,saved,choices}:{provider:string;saved:boolean;choices:Awaited<ReturnType<typeof loadInviteChoices>>|null}){
 const jobs=choices?providerInviteJobs(choices.jobs,choices.invites,provider):[]
 return <>
  <SaveProviderButton provider={provider} saved={saved}/>
  <details className="activity-action"><summary>Invite to job</summary>
   {choices===null?<p role="alert">Could not load your open jobs. Refresh to retry.</p>:jobs.length>0
    ?<ActionForm action={inviteConnection} label="Send invitation" pendingLabel="Sending invitation…">
      <input type="hidden" name="person_id" value={provider}/>
      <label className="lform-field">Your open job<select name="job_choice" required defaultValue="">
       <option value="" disabled>Choose a job</option>
       {jobs.map(job=><option key={job.id} value={job.id+(job.revision?'|'+job.revision:'')}>{job.title}{job.revision?' · Invite again':''}</option>)}
      </select></label>
      <label className="account-setting"><input name="confirmed" type="checkbox" required/>Invite this provider to view the job and make an offer.</label>
     </ActionForm>:<p>No eligible open jobs for this provider.</p>}
   <Link href={'/jobs/new?invite='+provider} className="card-link">Post a job</Link>
  </details>
  <ShareProvider providerId={provider}/>
 </>
}
