import { requireAdmin } from '@/lib/auth'

export type FlowFeedbackRow = {
  id: string
  flow: string
  ease: number
  comment: string | null
  platform: string
  app_version: string | null
  created_at: string
}

// Reads flow_feedback newest first. The admin RLS select policy
// (current_user_is_admin()) gates visibility — no service-role client needed.
export async function getFlowFeedback(limit = 200) {
  const { supabase, profile } = await requireAdmin()
  const { data, error } = await supabase
    .from('flow_feedback')
    .select('id, flow, ease, comment, platform, app_version, created_at')
    .order('created_at', { ascending: false })
    .limit(limit)

  const rows = (data || []) as FlowFeedbackRow[]
  const withEase = rows.filter(row => typeof row.ease === 'number')
  const averageEase = withEase.length
    ? withEase.reduce((sum, row) => sum + row.ease, 0) / withEase.length
    : null

  return {
    adminName: profile.display_name || profile.full_name || 'Admin',
    rows,
    error: !!error,
    total: rows.length,
    averageEase,
    withComments: rows.filter(row => row.comment && row.comment.trim()).length,
  }
}
