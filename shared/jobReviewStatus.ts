export function jobReviewStatus(own: boolean | undefined, other: boolean | undefined, otherRole: string) {
  return [
    own === undefined ? null : own ? 'Your review: submitted' : 'Your review: not yet submitted',
    other === undefined ? null : other ? `${otherRole} review: submitted` : `${otherRole} review: not yet submitted`,
  ]
}
