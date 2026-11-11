import { Briefcase, Tag } from 'lucide-react'

// The amber (jobs) / blue (listings) market-side cue for provider-web, mirroring
// the app's SideHeader. Renders the caps kicker with its side icon; pair it with
// `work-head {side}-head` on the surrounding <header> for the 4px top border
// (see globals.css). Used by the Jobs/Browse headers, the job/listing create &
// edit forms, and the job/listing/booking detail pages.
export function SideKicker({ side, label }: { side: 'job' | 'listing'; label: string }) {
  const Icon = side === 'job' ? Briefcase : Tag
  return (
    <p className={`work-kicker ${side}`}>
      <Icon size={14} />
      {label}
    </p>
  )
}
