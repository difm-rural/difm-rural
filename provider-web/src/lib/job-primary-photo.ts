import { createClient } from '@/lib/supabase/client'
import { resizePhoto } from './resize-photo'

export async function prepareJobPhoto(file: File) {
  if (!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size > 8 * 1024 * 1024)
    throw new Error('Choose a JPG, PNG or WebP image under 8 MB.')
  const photo = await resizePhoto(file,1024,0.8,{reencode:true})
  if (photo === file || photo.type !== 'image/jpeg' || photo.size > 1024 * 1024)
    throw new Error('Could not prepare this photo. Choose another image.')
  return photo
}

export async function jobPhotoRequest<T>(endpoint: string, photo: Blob, draft?: string, note=''): Promise<T> {
  const client=createClient()
  const {data:{session}}=await client.auth.getSession()
  if(!session)throw new Error('Sign in to use Photo-to-Job.')
  const response=await fetch(process.env.NEXT_PUBLIC_SUPABASE_URL+'/functions/v1/'+endpoint,{
    method:'POST',headers:{Authorization:'Bearer '+session.access_token,'Content-Type':'image/jpeg',
      apikey:process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,...(draft?{'x-draft-id':draft}:{}),
      ...(note.trim()?{'x-job-photo-note':encodeURIComponent(note.trim())}:{})},
    body:photo,signal:AbortSignal.timeout(30000),
  })
  if(!response.ok)throw new Error(draft?'Could not upload the photo. Your draft is kept. Try again.':'Could not suggest a job. Try again or enter the details yourself.')
  return response.json()
}
