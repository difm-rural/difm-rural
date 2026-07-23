import {
  ArrowRight,
  BadgeCheck,
  BriefcaseBusiness,
  Check,
  ChevronRight,
  Droplets,
  Fence,
  Handshake,
  Leaf,
  MapPin,
  PawPrint,
  Shovel,
  Tractor,
  Wrench,
} from "lucide-react";
import { formatServicePrice, getFeaturedServices, type PublicService } from "@/lib/services";

export const revalidate = 300;

const categories = [
  { name: "Fencing & Gates", icon: Fence },
  { name: "Animals & Farm Sitting", icon: PawPrint },
  { name: "Water & Drainage", icon: Droplets },
  { name: "Land & Vegetation", icon: Leaf },
  { name: "Earthworks & Driveways", icon: Shovel },
  { name: "Machinery & Repairs", icon: Tractor },
];

const exampleServices: PublicService[] = [
  {
    id: "example-fencing",
    title: "Rural fencing and gate repairs",
    description: "Practical help with fence repairs, posts, gates and property access.",
    category: "Fencing & Gates",
    pricing_type: "quote_required",
    rate: null,
    unit_label: null,
    location_name: "Local providers",
    photos: ["/images/fencing.jpg"],
    card_headline: "Strong fences. Safer stock.",
    card_supporting_text: "Find local help for new work, repairs and gates.",
    card_style: "bottom",
  },
  {
    id: "example-animals",
    title: "Animal care and property checks",
    description: "Keep animals and rural properties looked after while you are away.",
    category: "Animals & Farm Sitting",
    pricing_type: "quote_required",
    rate: null,
    unit_label: null,
    location_name: "Local providers",
    photos: ["/images/animals.jpg"],
    card_headline: "Away from home?",
    card_supporting_text: "Arrange practical animal care and property checks.",
    card_style: "clean",
  },
  {
    id: "example-earthworks",
    title: "Driveway and track maintenance",
    description: "Connect with operators for grading, gravel, drainage and access work.",
    category: "Earthworks & Driveways",
    pricing_type: "quote_required",
    rate: null,
    unit_label: null,
    location_name: "Local providers",
    photos: ["/images/earthworks.jpg"],
    card_headline: "Keep access in good shape.",
    card_supporting_text: "From grading and gravel to drainage and repairs.",
    card_style: "bold",
  },
];

function ServiceCard({ service }: { service: PublicService }) {
  const image = service.photos?.[0] || "/images/general.jpg";
  const style = service.card_style || "bottom";

  return (
    <article className="service-card">
      <div className="service-image">
        {/* Public service photos can come from Supabase Storage or a local fallback. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={image} alt="" />
        {service.card_headline ? (
          <div className={`service-message ${style}`}>
            <strong>{service.card_headline}</strong>
            {service.card_supporting_text ? <span>{service.card_supporting_text}</span> : null}
          </div>
        ) : null}
      </div>
      <div className="service-body">
        <div className="service-topline">
          <span>{service.category || "Rural service"}</span>
          <span className="price">{formatServicePrice(service)}</span>
        </div>
        <h3>{service.title}</h3>
        <p>{service.description || "Contact the provider through Rural Connections to discuss the work."}</p>
        <div className="service-location">
          <MapPin size={15} aria-hidden="true" />
          {service.location_name || "New Zealand"}
        </div>
      </div>
    </article>
  );
}

export default async function Home() {
  const liveServices = await getFeaturedServices();
  const services = liveServices.length ? liveServices : exampleServices;

  return (
    <main>
      <div className="launch-banner" role="status">
        <strong>Launching shortly</strong>
        <span>Rural Connections is getting ready to connect rural New Zealand.</span>
      </div>

      <header className="site-header">
        <a className="brand" href="#top" aria-label="Rural Connections home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/barn-badge-red.png" alt="" />
          <span>
            <strong>Rural Connections</strong>
            <small>Local help. Rural know-how.</small>
          </span>
        </a>
        <nav className="desktop-nav" aria-label="Main navigation">
          <a href="#how-it-works">How it works</a>
          <a href="#services">Services</a>
          <a href="#why-rural-connections">Why us</a>
          <a href="mailto:hello@ruralconnections.nz">Contact</a>
        </nav>
        <a className="header-cta" href="difmrural://">
          Open the app <ArrowRight size={16} aria-hidden="true" />
        </a>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow">A rural marketplace for New Zealand</p>
          <h1>Get rural work sorted.</h1>
          <p className="hero-lead">
            Find nearby people with the practical skills your property needs—or turn your rural
            know-how into work in your community.
          </p>
          <div className="hero-actions">
            <a className="button primary" href="#services">
              Find local help <ArrowRight size={18} aria-hidden="true" />
            </a>
            <a className="button secondary" href="#offer-a-service">
              Offer a service
            </a>
          </div>
          <ul className="hero-points" aria-label="Marketplace benefits">
            <li><Check size={16} aria-hidden="true" /> Built for rural properties</li>
            <li><Check size={16} aria-hidden="true" /> Local jobs and services</li>
            <li><Check size={16} aria-hidden="true" /> Clear updates from start to finish</li>
          </ul>
        </div>

        <div className="hero-visual" aria-label="Rural services in the community">
          <div className="hero-photo hero-photo-main">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/fencing.jpg" alt="Rural fencing across rolling farmland" />
          </div>
          <div className="hero-photo hero-photo-small">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/machinery.jpg" alt="Rural machinery at work" />
          </div>
          <div className="hero-note">
            <span className="note-icon"><Handshake size={22} aria-hidden="true" /></span>
            <span><strong>Neighbours helping neighbours</strong>Practical skills, closer to home.</span>
          </div>
          <div className="hero-stamp" aria-hidden="true">RC</div>
        </div>
      </section>

      <section className="category-strip" aria-labelledby="category-title">
        <div className="section-heading compact">
          <p className="eyebrow">What needs doing?</p>
          <h2 id="category-title">Help across the whole property</h2>
        </div>
        <div className="category-grid">
          {categories.map(({ name, icon: Icon }) => (
            <a href="#services" className="category-card" key={name}>
              <Icon size={23} strokeWidth={1.7} aria-hidden="true" />
              <span>{name}</span>
              <ChevronRight size={16} aria-hidden="true" />
            </a>
          ))}
        </div>
        <p className="more-categories">
          Plus spraying, cropping, buildings, delivery, house sitting and general rural help.
        </p>
      </section>

      <section className="how-section" id="how-it-works">
        <div className="section-heading">
          <p className="eyebrow">Two ways to connect</p>
          <h2>Post the work—or advertise what you do.</h2>
          <p>
            Rural Connections brings demand and local capability together without making either
            side fit a city-focused marketplace.
          </p>
        </div>
        <div className="path-grid">
          <article className="path-card requester">
            <div className="path-number">01</div>
            <BriefcaseBusiness size={28} aria-hidden="true" />
            <p className="path-kicker">For property owners</p>
            <h3>Post a job</h3>
            <p>Describe what needs doing, set the location and timing, then hear from local providers.</p>
            <ol>
              <li><span>1</span> Add the work and a photo</li>
              <li><span>2</span> Receive questions and offers</li>
              <li><span>3</span> Choose who suits the job</li>
            </ol>
          </article>
          <article className="path-card provider">
            <div className="path-number">02</div>
            <Wrench size={28} aria-hidden="true" />
            <p className="path-kicker">For rural providers</p>
            <h3>Offer a service</h3>
            <p>Create a clear service card, define where you work and let nearby customers find you.</p>
            <ol>
              <li><span>1</span> Show your skills and service</li>
              <li><span>2</span> Set pricing and coverage</li>
              <li><span>3</span> Manage enquiries in one place</li>
            </ol>
          </article>
        </div>
      </section>

      <section className="services-section" id="services">
        <div className="section-heading row">
          <div>
            <p className="eyebrow">{liveServices.length ? "Available now" : "What you can find"}</p>
            <h2>{liveServices.length ? "Services from the community" : "Practical rural services"}</h2>
          </div>
          <p>
            {liveServices.length
              ? "A selection of services currently advertising through Rural Connections."
              : "Examples of the work Rural Connections is designed to help you arrange."}
          </p>
        </div>
        <div className="service-grid">
          {services.slice(0, 6).map((service) => <ServiceCard service={service} key={service.id} />)}
        </div>
        <div className="services-foot">
          <span><BadgeCheck size={18} aria-hidden="true" /> Provider details stay inside Rural Connections.</span>
          <a href="difmrural://">Browse in the app <ArrowRight size={16} aria-hidden="true" /></a>
        </div>
      </section>

      <section className="why-section" id="why-rural-connections">
        <div className="why-image">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/general.jpg" alt="A rural property surrounded by farmland" />
          <div className="why-image-caption">Designed around real rural properties—not city errands.</div>
        </div>
        <div className="why-copy">
          <p className="eyebrow">Made for rural life</p>
          <h2>The right context matters.</h2>
          <p>
            Distance, access, machinery, animals and weather all shape rural work. Rural Connections
            gives people room to explain the job properly and keeps progress visible once work begins.
          </p>
          <div className="feature-list">
            <div><MapPin aria-hidden="true" /><span><strong>Local discovery</strong>Find work and services around the regions providers cover.</span></div>
            <div><BadgeCheck aria-hidden="true" /><span><strong>Clear profiles</strong>See practical skills, service details and community history.</span></div>
            <div><Leaf aria-hidden="true" /><span><strong>Season-aware</strong>Useful rural reminders surface when the timing is relevant.</span></div>
          </div>
        </div>
      </section>

      <section className="seasonal-banner">
        <div>
          <p className="eyebrow light">Useful right now</p>
          <h2>Plan the work before the season gets busy.</h2>
        </div>
        <p>
          Fencing, spraying, water systems, feed, property care—find help early and keep the next
          job from becoming the urgent one.
        </p>
      </section>

      <section className="final-cta" id="offer-a-service">
        <div className="final-mark">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/barn-badge-red.png" alt="" />
        </div>
        <p className="eyebrow">Rural skills are valuable</p>
        <h2>Put your know-how to work locally.</h2>
        <p>
          Create a service card, show people what you offer, and connect with customers who need
          practical rural help.
        </p>
        <a className="button primary" href="difmrural://">
          Open Rural Connections <ArrowRight size={18} aria-hidden="true" />
        </a>
        <small>Already have the app installed? This link will open it directly.</small>
      </section>

      <footer>
        <a className="brand footer-brand" href="#top">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/barn-badge-red.png" alt="" />
          <span><strong>Rural Connections</strong><small>Local help. Rural know-how.</small></span>
        </a>
        <p>Connecting rural New Zealand, one useful job at a time.</p>
        <div className="footer-contact">
          <span>Questions, feedback or early interest?</span>
          <a href="mailto:hello@ruralconnections.nz">hello@ruralconnections.nz</a>
        </div>
        <div className="footer-links">
          <a href="#how-it-works">How it works</a>
          <a href="#services">Services</a>
          <a href="/privacy">Privacy</a>
          <a href="difmrural://">Open the app</a>
        </div>
        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} Rural Connections</span>
          <span>ruralconnections.nz</span>
        </div>
      </footer>
    </main>
  );
}
