# Rural Connections — Product Charter

**Connecting rural people. Making rural life easier.**

Rural Connections brings rural property owners, customers and local providers together to exchange skills, services, equipment and resources. It makes finding help, offering work and maintaining trusted local relationships simpler, while giving people control over their availability, arrangements and private information.

This charter is the shared basis for design and implementation decisions, for human developers and AI coding assistants alike. Read it before proposing or building a feature.

## The core principle

**Rural Connections should reduce the effort involved in rural life, not add another layer of administration.**

That holds whether someone is ordering a water delivery, a farmer is offering grazing, a contractor is looking for work or a property owner is managing maintenance.

## The feature test

Before adding or changing a feature, ask:

> **Does this make it easier for rural people to connect, organise work or maintain a useful relationship?**

If it doesn't, question whether it belongs in Rural Connections. A feature should also support at least one principle below and work against none. If it conflicts with one, raise that before building.

## The 10 principles

1. **Connect rural communities.** Strengthen local connections, not anonymous transactions.
2. **Build trust and lasting relationships.** A completed job should start a relationship. Reviews, messaging, trusted providers and repeat bookings support this.
3. **Keep it simple.** Show only what the current task needs. Keep forms short, terminology consistent and navigation straightforward.
4. **Give customers and providers equal importance.** Finding help and finding work are equally prominent and equally easy.
5. **Put providers in control.** Providers set what they offer, where they work, their pricing and when they take work. Availability tools are optional.
6. **Design for rural realities.** Allow for distance, gates and access, large properties, weather, seasons, equipment and uncertain durations. Don't force every job into a fixed appointment or price.
7. **Let people agree arrangements directly.** The app handles discovery, messaging, bookings and reviews. Final arrangements and payment happen between the parties. Rural Connections doesn't process payments, and estimates are always labelled as estimates.
8. **Protect privacy.** Public discovery uses general locations only. Exact addresses, access points, boundaries and infrastructure are shared only with authorised people when needed. Connected AI assistants don't get unrestricted access to private property information.
9. **AI reduces effort; people stay in control.** AI drafts, suggests and helps people find their way. Nothing is published, changed or shared without the user's approval.
10. **Build a rural network, not just a marketplace.** Property Network, My People, My Customers, trusted providers, recurring work and property information give ongoing value beyond one-off jobs.

## What Rural Connections is — and isn't

| Rural Connections is | It isn't intended to be |
|---|---|
| A network for rural communities | A generic gig platform |
| A way to discover and offer local help | Only a classified ads site |
| A tool for building repeat relationships | A series of one-off transactions |
| A practical system for organising rural work | A complex business management system |
| A facilitator of direct arrangements | A payment intermediary |
| An assistant to property owners and providers | An AI that makes decisions without approval |

## Guidance for AI coding assistants

- Treat this charter as a design constraint alongside the technical conventions in the repo.
- If a requested change appears to conflict with a principle (for example, it exposes exact property locations publicly, adds payment handling, or lets AI publish without review), say so and ask before implementing.
- Prefer the simpler option: fewer fields, fewer screens and fewer steps.
- Use the app's existing terms for features (Find help, Find work, My People, Property Network and so on). Don't invent new names.
