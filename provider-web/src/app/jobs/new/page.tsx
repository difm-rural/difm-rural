import Link from 'next/link'
import { requireProvider } from '@/lib/auth'
import { AppShell } from '@/components/app-shell'
import { JobForm } from './job-form'
export default async function NewJobPage(){const {profile}=await requireProvider();return <AppShell providerName={profile?.full_name || 'Member'}><section className="page"><Link className="card-link" href="/">Back to Home</Link><h1>Post a job</h1><JobForm/></section></AppShell>}
