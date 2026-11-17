import { supabase } from './supabase'
import { shrinkPhoto } from './shrinkPhoto'

export const photoToJobEnabled = process.env.EXPO_PUBLIC_PHOTO_TO_JOB === 'true'

export async function prepareJobPrimaryPhoto(asset) {
  if (!asset?.uri || asset.fileSize > 8 * 1024 * 1024)
    throw new Error('Choose an image under 8 MB.')
  const prepared = await shrinkPhoto(asset,1024,{jpeg:true})
  if (prepared === asset || prepared.mimeType !== 'image/jpeg') throw new Error('Could not prepare this photo. Choose another.')
  const bytes = await (await fetch(prepared.uri)).arrayBuffer()
  if (bytes.byteLength > 1024 * 1024) throw new Error('Choose a smaller photo.')
  return bytes
}

export async function jobPrimaryPhotoRequest(endpoint,asset,draftId,note='') {
  const {data:{session}} = await supabase.auth.getSession()
  if (!session) throw new Error('Sign in to use Photo-to-Job.')
  const {data,error} = await supabase.functions.invoke(endpoint,{
    body:await prepareJobPrimaryPhoto(asset),timeout:30000,
    headers:{'Content-Type':'image/jpeg',...(draftId?{'x-draft-id':draftId}:{}),
      ...(note.trim()?{'x-job-photo-note':encodeURIComponent(note.trim())}:{})},
  })
  if(error)throw new Error(draftId?'Could not upload this photo. Your job details are kept.':'Could not suggest a job. Try again or enter the details yourself.')
  return data
}
