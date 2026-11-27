// My Property Home, compact form: one line per item, at most 3 per section.
// Shared by the mobile app and provider-web so both read the same.
import { latestTime, rankOnTheGo } from './onTheGo.ts'
import { formatWorkDate } from './formatting.js'
import { propertyAreas, propertyGaps, type NetworkData } from './propertyNetwork.ts'
import { propertyLinkedJobs, type AreaJob, type AreaJobLink } from './propertyNetworkJobs.ts'

export const HOME_COMPACT_LIMIT = 3

type MoveLike = { label: string; detail: string; badge: string; tone: string; needsAction: boolean }
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

// Needs attention, in priority groups: (a) someone is waiting on you,
// (b) a need not posted yet, (c) leave a review.
export type AttentionGroup = 'waiting' | 'need' | 'review'
export const ATTENTION_ORDER: AttentionGroup[] = ['waiting', 'need', 'review']

export function attentionGroup(move: Pick<MoveLike, 'badge'>): AttentionGroup {
  return move.badge === 'Waiting on you to review' ? 'review' : 'waiting'
}

// "2 offers on Paint fence", "1 question on Gate repair", "Quote to review · Water tank",
// "Paint fence · leave a review".
export function attentionLine(title: string, move: Pick<MoveLike, 'detail' | 'badge'>): string {
  const detail = move.detail || ''
  let m = /^Review and choose from (\d+) offers$/.exec(detail)
  if (m) return `${plural(Number(m[1]), 'offer', 'offers')} on ${title}`
  if (detail === 'Review and choose an offer') return `1 offer on ${title}`
  m = /^Answer (\d+) provider questions$/.exec(detail)
  if (m) return `${plural(Number(m[1]), 'question', 'questions')} on ${title}`
  if (detail === 'Answer a provider question') return `1 question on ${title}`
  if (detail === 'Review and accept the quote') return `Quote to review · ${title}`
  if (attentionGroup(move) === 'review') return `${title} · leave a review`
  return `${title} · ${detail.charAt(0).toLowerCase()}${detail.slice(1)}`
}

// On the go: "Paint fence · waiting for offers", "Gate repair · booked Tue 3 Dec 2026",
// "Clean barn · waiting on Pat to complete".
export function goLine(title: string, move: Pick<MoveLike, 'label' | 'badge' | 'tone'>, arrivalAt?: string | null): string {
  if (move.label === 'Waiting for offers') return `${title} · waiting for offers`
  if (move.tone === 'scheduled' && arrivalAt) {
    const day = formatWorkDate(arrivalAt)
    if (day && day !== '—') return `${title} · booked ${day}`
  }
  const badge = move.badge || move.label
  return `${title} · ${badge.charAt(0).toLowerCase()}${badge.slice(1)}`
}

// Sort into priority groups, newest within each, and cap.
export function rankAttention<T extends { group: AttentionGroup; updatedAt?: unknown }>(items: T[], limit = HOME_COMPACT_LIMIT) {
  const ranked = items
    .map((item, index) => ({ item, index, at: latestTime(item.updatedAt) }))
    .sort((a, b) => ATTENTION_ORDER.indexOf(a.item.group) - ATTENTION_ORDER.indexOf(b.item.group) || b.at - a.at || a.index - b.index)
    .map(row => row.item)
  return { shown: ranked.slice(0, limit), total: ranked.length, more: Math.max(0, ranked.length - limit) }
}

// Most recent activity first, capped (On the go).
export function rankRecent<T extends { updatedAt?: unknown }>(items: T[], limit = HOME_COMPACT_LIMIT) {
  const ranked = items
    .map((item, index) => ({ item, index, at: latestTime(item.updatedAt) }))
    .sort((a, b) => b.at - a.at || a.index - b.index)
    .map(row => row.item)
  return { shown: ranked.slice(0, limit), total: ranked.length, more: Math.max(0, ranked.length - limit) }
}

// Property needs marked "Need help" whose area has no open or accepted job
// linked to it yet.
// TODO(need-level linking): property_network_jobs links a posted job to the
// AREA, not the need, so posting a job for one need also hides the other needs
// in that area. Fix with property_network_jobs.need_id (service_key) and match
// on it here.
export function unpostedNeeds(network: NetworkData | null | undefined, jobs: AreaJob[] = [], links: AreaJobLink[] = []) {
  if (!network) return []
  const covered = (area: string) => propertyLinkedJobs(jobs, links, area).some(job => job.status === 'open' || job.status === 'accepted')
  return propertyGaps(propertyAreas(network))
    .filter(({ area }) => !covered(area.id))
    .map(({ area, service }) => ({ key: `need:${area.id}:${service.service_key}`, area, service, text: `${service.name} · not posted yet` }))
}

export const propertyNetworkRow = (people: number) =>
  `My Property Network · ${plural(people, 'person', 'people')}`

// Jobs tab "On the go": agreed (accepted) jobs on either side, one line each,
// waiting-on-you first. Open jobs and pending offers have their own rows there.
type InFlight = { entityType: string; review?: unknown; title: string; arrivalAt?: string | null; item?: { status?: string } | null;
  nextMove: MoveLike & { badge: string }; updatedAt?: unknown }
export function jobsOnTheGo<T extends InFlight>(items: T[] | null | undefined, limit = HOME_COMPACT_LIMIT) {
  return rankOnTheGo((items || [])
    .filter(item => item.entityType === 'job' && !item.review && item.item?.status === 'accepted')
    .map(item => ({ ...item, needsAction: item.nextMove.needsAction, line: goLine(item.title, item.nextMove, item.arrivalAt) })), limit)
}
