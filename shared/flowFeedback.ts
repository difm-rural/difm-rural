// Validation for lightweight flow-feedback (e.g. the post-job ease rating).
// Shared by the Expo app and provider-web so both clients apply the same rules
// the DB check constraints enforce: ease is an integer 1–5, comment is trimmed
// and capped at 2,000 characters (empty → null). See shared/postingText.ts for
// how shared validators are consumed.
export const FLOW_FEEDBACK_COMMENT_MAX = 2000

export type FlowFeedbackValue = { ease: number; comment: string | null }
export type FlowFeedbackCheck =
  | { ok: true; value: FlowFeedbackValue }
  | { ok: false; error: string }

export function validateFlowFeedback({ ease, comment }: { ease: unknown; comment?: unknown }): FlowFeedbackCheck {
  const value = Number(ease)
  if (!Number.isInteger(value) || value < 1 || value > 5) {
    return { ok: false, error: 'Choose a rating from 1 to 5.' }
  }
  const trimmed = String(comment ?? '').trim()
  if (trimmed.length > FLOW_FEEDBACK_COMMENT_MAX) {
    return { ok: false, error: `Keep your comment to ${FLOW_FEEDBACK_COMMENT_MAX.toLocaleString('en-NZ')} characters or fewer.` }
  }
  return { ok: true, value: { ease: value, comment: trimmed || null } }
}
