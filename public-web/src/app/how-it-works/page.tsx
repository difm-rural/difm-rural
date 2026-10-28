import Link from 'next/link'
import {ArrowLeft} from 'lucide-react'
import {MarketplaceShell} from '@/components/marketplace-shell'
import {consoleLink} from '@/lib/console-link'

export const metadata={title:'How it works',alternates:{canonical:'/how-it-works'}}

// Matches the explainer in the app's HowItWorksScreen.
const sections=[
  {title:'Need something done? Post a Job.',body:'Describe what you need — fencing, a digger for a day, feed, a hand over lambing. Nearby locals send you offers, and you choose who to go with.'},
  {title:'Got something to offer? Create a Listing.',body:'Advertise a service, grazing, gear to hire, or something to sell. People can send an enquiry about a listing, or a booking request for a service or hire. A booking is confirmed when the provider accepts.'},
  {title:'The quick difference',body:'A Job is you asking — others come to you with offers. A Listing is you offering — others come to you to take it up. You can do both from the one account.'},
  {title:'A few neighbourly basics',body:"Agree the price and what's included before work starts. Meet in person for anything you're unsure about, and trust your judgement. Be fair and prompt — it's a small community and word travels."},
]

export default function HowItWorks(){
  return <MarketplaceShell><article className="guest-how-it-works">
    <Link href="/" className="guest-how-back"><ArrowLeft size={17} aria-hidden="true"/>Back to browsing</Link>
    <h1>How it works</h1>
    <p className="guest-how-intro">Rural Connections is two things in one: a place to get a hand, and a place to offer one.</p>
    {sections.map(section=><section key={section.title}><h2>{section.title}</h2><p>{section.body}</p></section>)}
    <p className="guest-how-closing"><a href={consoleLink('/account/help')}>Still stuck? Open Account → Help &amp; feedback → Send feedback.</a></p>
  </article></MarketplaceShell>
}
