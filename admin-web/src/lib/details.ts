import { requireAdmin } from '@/lib/auth'

export const DETAIL_VIEWS = ['open-jobs', 'active-services', 'active-bookings', 'new-users', 'lifecycle'] as const
export type DetailView = typeof DETAIL_VIEWS[number]
type Row = { id: string; values: Record<string, string> }
type Column = { key: string; label: string }

const ACTIVE_BOOKINGS = ['pending', 'quote_sent', 'confirmed', 'in_progress', 'awaiting_completion', 'cancellation_requested']

function date(value: string | null | undefined) {
  if (!value) return 'Not set'
  return new Intl.DateTimeFormat('en-NZ', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Pacific/Auckland' }).format(new Date(value))
}

function duration(hours: number) {
  if (hours < 48) return `${Math.round(hours)} hrs`
  return `${(hours / 24).toFixed(1)} days`
}

function nameFor(profile: { display_name: string | null; full_name: string | null } | undefined) {
  return profile?.display_name || profile?.full_name || 'Name not supplied'
}

export async function getDetailData(view: DetailView, days: number): Promise<{ adminName: string; title: string; description: string; columns: Column[]; rows: Row[] }> {
  const { supabase, profile } = await requireAdmin()
  const cutoffDate = new Date()
  cutoffDate.setUTCHours(0, 0, 0, 0)
  cutoffDate.setUTCDate(cutoffDate.getUTCDate() - days + 1)
  const cutoff = cutoffDate.toISOString()
  const adminName = profile.display_name || profile.full_name || 'Admin'

  async function profiles(ids: (string | null)[]) {
    const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))]
    if (!unique.length) return new Map<string, { display_name: string | null; full_name: string | null }>()
    const { data } = await supabase.from('profiles_public').select('id, display_name, full_name').in('id', unique)
    return new Map((data || []).map(item => [item.id, item]))
  }

  if (view === 'open-jobs') {
    const { data } = await supabase.from('jobs').select('id, title, category, requester_id, location_name, created_at, status').eq('status', 'open').order('created_at', { ascending: false }).limit(250)
    const items = data || []
    const people = await profiles(items.map(item => item.requester_id))
    return {
      adminName, title: 'Open jobs', description: 'Jobs currently available to rural service providers.',
      columns: [{ key: 'job', label: 'Job' }, { key: 'category', label: 'Category' }, { key: 'requester', label: 'Requester' }, { key: 'location', label: 'Location' }, { key: 'posted', label: 'Posted' }, { key: 'status', label: 'Status' }],
      rows: items.map(item => ({ id: item.id, values: { job: item.title, category: item.category || 'Uncategorised', requester: nameFor(people.get(item.requester_id)), location: item.location_name || 'Not set', posted: date(item.created_at), status: item.status.replaceAll('_', ' ') } })),
    }
  }

  if (view === 'active-services') {
    const { data } = await supabase.from('services').select('id, title, category, provider_id, location_name, pricing_type, rate, unit_label, created_at').eq('is_active', true).order('created_at', { ascending: false }).limit(250)
    const items = data || []
    const people = await profiles(items.map(item => item.provider_id))
    return {
      adminName, title: 'Active services', description: 'Service listings currently available for customers to book.',
      columns: [{ key: 'service', label: 'Service' }, { key: 'category', label: 'Category' }, { key: 'provider', label: 'Provider' }, { key: 'location', label: 'Location' }, { key: 'pricing', label: 'Pricing' }, { key: 'listed', label: 'Listed' }],
      rows: items.map(item => ({ id: item.id, values: { service: item.title, category: item.category || 'Uncategorised', provider: nameFor(people.get(item.provider_id)), location: item.location_name || 'Not set', pricing: item.pricing_type === 'quote_required' ? 'Quote required' : `$${Number(item.rate || 0).toFixed(2)}${item.unit_label ? ` / ${item.unit_label}` : ''}`, listed: date(item.created_at) } })),
    }
  }

  if (view === 'active-bookings') {
    const { data } = await supabase.from('bookings').select('id, service_id, requester_id, provider_id, status, scheduled_date, location_name, created_at').in('status', ACTIVE_BOOKINGS).order('created_at', { ascending: false }).limit(250)
    const items = data || []
    const people = await profiles(items.flatMap(item => [item.requester_id, item.provider_id]))
    const serviceIds = [...new Set(items.map(item => item.service_id).filter(Boolean))]
    const { data: services } = serviceIds.length ? await supabase.from('services').select('id, title').in('id', serviceIds) : { data: [] }
    const serviceNames = new Map((services || []).map(item => [item.id, item.title]))
    return {
      adminName, title: 'Active bookings', description: 'Bookings currently moving through quoting, confirmation or delivery.',
      columns: [{ key: 'service', label: 'Service' }, { key: 'requester', label: 'Requester' }, { key: 'provider', label: 'Provider' }, { key: 'location', label: 'Location' }, { key: 'scheduled', label: 'Scheduled' }, { key: 'status', label: 'Status' }],
      rows: items.map(item => ({ id: item.id, values: { service: serviceNames.get(item.service_id) || 'Service unavailable', requester: nameFor(people.get(item.requester_id)), provider: nameFor(people.get(item.provider_id)), location: item.location_name || 'Not set', scheduled: item.scheduled_date || 'Flexible', status: item.status.replaceAll('_', ' ') } })),
    }
  }

  if (view === 'new-users') {
    const { data } = await supabase.from('profiles_public').select('id, display_name, full_name, primary_role, role, region, created_at').gte('created_at', cutoff).order('created_at', { ascending: false }).limit(250)
    const items = data || []
    return {
      adminName, title: 'New users', description: `Accounts created during the selected ${days}-day period.`,
      columns: [{ key: 'name', label: 'Name' }, { key: 'role', label: 'Role' }, { key: 'region', label: 'Region' }, { key: 'joined', label: 'Joined' }],
      rows: items.map(item => ({ id: item.id, values: { name: nameFor(item), role: (item.primary_role || item.role || 'requester').replaceAll('_', ' '), region: item.region || 'Not supplied', joined: date(item.created_at) } })),
    }
  }

  const { data: events } = await supabase.from('job_status_history').select('id, job_id, changed_at').eq('to_status', 'completed').not('from_status', 'is', null).gte('changed_at', cutoff).order('changed_at', { ascending: false }).limit(250)
  const completionRows = events || []
  const jobIds = [...new Set(completionRows.map(item => item.job_id))]
  const { data: jobs } = jobIds.length ? await supabase.from('jobs').select('id, title, requester_id, created_at').in('id', jobIds) : { data: [] }
  const jobMap = new Map((jobs || []).map(item => [item.id, item]))
  const people = await profiles((jobs || []).map(item => item.requester_id))
  return {
    adminName, title: 'Completed job lifecycle', description: `Jobs completed during the selected ${days}-day period and their elapsed time from posting.`,
    columns: [{ key: 'job', label: 'Job' }, { key: 'requester', label: 'Requester' }, { key: 'posted', label: 'Posted' }, { key: 'completed', label: 'Completed' }, { key: 'lifecycle', label: 'Lifecycle' }],
    rows: completionRows.flatMap(event => {
      const job = jobMap.get(event.job_id)
      if (!job) return []
      const hours = Math.max(0, (new Date(event.changed_at).getTime() - new Date(job.created_at).getTime()) / 3_600_000)
      return [{ id: String(event.id), values: { job: job.title, requester: nameFor(people.get(job.requester_id)), posted: date(job.created_at), completed: date(event.changed_at), lifecycle: duration(hours) } }]
    }),
  }
}
