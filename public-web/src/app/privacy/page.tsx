import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight, Mail, ShieldCheck } from "lucide-react";

export const metadata: Metadata = {
  title: "Privacy",
  description:
    "How Rural Connections collects, uses, stores and shares personal information.",
  alternates: { canonical: "/privacy" },
};

const sections = [
  ["information", "Information we collect"],
  ["sources", "Where it comes from"],
  ["uses", "How we use it"],
  ["sharing", "Who we share it with"],
  ["ai", "Assisted drafting"],
  ["storage", "Storage and retention"],
  ["choices", "Your choices"],
  ["rights", "Your privacy rights"],
];

export default function PrivacyPage() {
  return (
    <main className="privacy-page">
      <header className="legal-header">
        <Link className="brand" href="/" aria-label="Rural Connections home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/barn-badge-red.png" alt="" />
          <span>
            <strong>Rural Connections</strong>
            <small>Local help. Rural know-how.</small>
          </span>
        </Link>
        <div className="legal-header-actions">
          <a href="mailto:hello@ruralconnections.nz">
            <Mail size={16} aria-hidden="true" /> Contact us
          </a>
          <Link href="/">
            <ArrowLeft size={16} aria-hidden="true" /> Back to home
          </Link>
        </div>
      </header>

      <section className="privacy-hero">
        <div>
          <p className="eyebrow">Privacy at Rural Connections</p>
          <h1>Your information should be handled with care.</h1>
        </div>
        <div className="privacy-intro">
          <ShieldCheck size={28} aria-hidden="true" />
          <p>
            This statement explains what we collect, why we need it, who can see it,
            and the choices you have when using the Rural Connections app and websites.
          </p>
          <span>Effective 23 July 2026</span>
        </div>
      </section>

      <div className="privacy-layout">
        <aside className="privacy-nav" aria-label="Privacy statement sections">
          <p>On this page</p>
          {sections.map(([id, label]) => (
            <a href={`#${id}`} key={id}>{label}</a>
          ))}
        </aside>

        <article className="privacy-content">
          <section className="privacy-summary">
            <p className="eyebrow">The short version</p>
            <h2>We collect what the marketplace needs to work.</h2>
            <p>
              We use personal information to create accounts, show relevant rural jobs and
              services, help people arrange work, keep participants informed, and protect the
              marketplace. We do not sell personal information.
            </p>
          </section>

          <section>
            <h2>Who we are</h2>
            <p>
              Rural Connections is a New Zealand rural marketplace connecting people who need
              work done with people offering practical rural services. For privacy questions,
              requests or complaints, contact our privacy contact at{" "}
              <a href="mailto:hello@ruralconnections.nz">hello@ruralconnections.nz</a>.
            </p>
          </section>

          <section id="information">
            <h2>Information we collect</h2>
            <p>Depending on how you use Rural Connections, this may include:</p>
            <ul>
              <li>
                <strong>Account and profile information</strong> — your name, email address,
                phone number, profile photo, role, region, biography, skills and qualifications.
              </li>
              <li>
                <strong>Location information</strong> — an address, region, service area,
                map position or device location you choose to provide. Precise location is used
                only where needed to support a job, booking or location feature.
              </li>
              <li>
                <strong>Marketplace content</strong> — job and service descriptions, photos,
                pricing, availability, questions, offers, bookings, work updates and reviews.
              </li>
              <li>
                <strong>Communications</strong> — in-app messages, support correspondence,
                notification choices and records of notices sent to you.
              </li>
              <li>
                <strong>Connections and activity</strong> — saved jobs, community connections,
                interactions with seasonal information and the status of work arranged through
                the marketplace.
              </li>
              <li>
                <strong>Technical information</strong> — authentication records, device and push
                notification tokens, IP address, app or browser information, security events and
                operational logs.
              </li>
            </ul>
            <p>
              You can choose not to provide optional information. If you do not provide information
              needed for an account, location-based matching or a transaction, some features may
              not work or we may be unable to provide that part of the service.
            </p>
          </section>

          <section id="sources">
            <h2>Where the information comes from</h2>
            <p>
              Most information comes directly from you when you register, complete a profile, post
              work, advertise a service or communicate with another user. We also generate records
              as you use the marketplace, such as booking status and notification history.
            </p>
            <p>
              Other users may provide information about you through messages, work records and
              reviews. When you ask us to create a service draft from a public business website,
              we collect the public page content and image you direct us to for that purpose.
            </p>
          </section>

          <section id="uses">
            <h2>How we use information</h2>
            <ul>
              <li>Provide, maintain and improve Rural Connections.</li>
              <li>Create accounts, profiles, job posts, service listings and work records.</li>
              <li>Match and display relevant jobs and services by category and area.</li>
              <li>Enable questions, offers, bookings, messaging, reviews and connections.</li>
              <li>Send service, security and marketplace notifications you have selected.</li>
              <li>Provide customer support and respond to privacy requests.</li>
              <li>Detect misuse, protect users, enforce marketplace rules and meet legal obligations.</li>
              <li>Understand marketplace demand and performance using aggregated operational reporting.</li>
            </ul>
          </section>

          <section id="sharing">
            <h2>Who can see or receive information</h2>
            <p>
              Profile, job and service information is shown to other Rural Connections users where
              needed for the marketplace. What is visible depends on the feature, your role and the
              stage of the work. Contact details, messages and precise work locations are not
              intended for general public display and are restricted to the people and processes
              that need them.
            </p>
            <p>We also use specialist providers to operate Rural Connections, including:</p>
            <ul>
              <li>Supabase for application hosting, database storage, file storage and authentication.</li>
              <li>Vercel for hosting the public and administration websites.</li>
              <li>Google mapping services for addresses, maps and location features.</li>
              <li>Expo and device platform providers for app delivery and push notifications.</li>
              <li>Resend and Microsoft for operational email and business communications.</li>
              <li>OpenAI when you choose an assisted drafting feature.</li>
            </ul>
            <p>
              These providers may process information outside New Zealand. We use providers and
              arrangements intended to give personal information appropriate safeguards. We may
              also disclose information where required by law, to address a serious safety or
              security concern, or in connection with a genuine business transfer. We do not sell
              personal information or provide it to data brokers.
            </p>
          </section>

          <section id="ai">
            <h2>Website and AI-assisted drafting</h2>
            <p>
              If you choose an assisted drafting feature, the text, photo or public website content
              you submit is processed to suggest a job or service draft. The result is a suggestion:
              you remain responsible for reviewing it before publishing. Do not submit sensitive
              personal information that is unnecessary for the listing.
            </p>
          </section>

          <section id="storage">
            <h2>Storage, security and retention</h2>
            <p>
              We use technical and organisational safeguards designed to protect information from
              loss, unauthorised access, misuse or disclosure. No internet service can promise
              absolute security, so please use a secure device and keep access to your email account
              protected.
            </p>
            <p>
              We retain information while your account is active and for as long as it is reasonably
              needed to operate the marketplace, maintain work and communication records, resolve
              disputes, prevent misuse and meet legal obligations. Information no longer required
              for a lawful purpose is deleted or de-identified, subject to normal backup cycles.
            </p>
            <p>
              The public website does not currently use advertising or behavioural tracking cookies.
              Our hosting providers may retain standard technical request logs for reliability and
              security.
            </p>
          </section>

          <section id="choices">
            <h2>Your choices</h2>
            <ul>
              <li>Edit your profile, listing and notification preferences in the app.</li>
              <li>Choose whether to grant device permissions such as camera, photos, location and notifications.</li>
              <li>Pause or remove eligible listings and ask us about closing your account.</li>
              <li>Contact us before using assisted drafting if you have questions about what is processed.</li>
            </ul>
          </section>

          <section id="rights">
            <h2>Your privacy rights</h2>
            <p>
              Under New Zealand’s Privacy Act 2020, you can ask for access to personal information
              we hold about you and ask us to correct it. You may also ask us to delete information;
              whether we can do so will depend on why it is held and any lawful need to retain it.
            </p>
            <p>
              Email <a href="mailto:hello@ruralconnections.nz">hello@ruralconnections.nz</a> with
              “Privacy request” in the subject line. We may need to confirm your identity before
              releasing or changing account information.
            </p>
            <p>
              If you are not satisfied with our response, you can contact the{" "}
              <a href="https://www.privacy.org.nz/" target="_blank" rel="noreferrer">
                Office of the Privacy Commissioner
                <ArrowUpRight size={14} aria-hidden="true" />
              </a>.
            </p>
          </section>

          <section>
            <h2>Changes to this statement</h2>
            <p>
              We may update this statement as Rural Connections develops or our legal obligations
              change. We will publish the updated version here and change the effective date. If a
              change materially affects how we use personal information, we will provide an
              appropriate notice.
            </p>
          </section>

          <section className="privacy-contact">
            <p className="eyebrow">Questions or requests</p>
            <h2>Talk to us directly.</h2>
            <p>We want privacy information to be understandable and useful.</p>
            <a href="mailto:hello@ruralconnections.nz">
              <Mail size={17} aria-hidden="true" /> hello@ruralconnections.nz
            </a>
          </section>
        </article>
      </div>

      <footer className="legal-footer">
        <span>© {new Date().getFullYear()} Rural Connections</span>
        <div>
          <Link href="/">Home</Link>
          <a href="mailto:hello@ruralconnections.nz">Contact</a>
        </div>
      </footer>
    </main>
  );
}
