# Home UX V2.1

My Property retains the compact network illustration and now shows linked-area and support-gap counts, up to two named gaps, and direct My Network and My People actions. Untouched areas do not count as gaps. The preview distinguishes a new network from a configured network with no marked gaps.

My Work shows populated indicators only. Invitations and unanswered offers are listed first. Indicators open the existing Invitations screen or a filtered Activity view for pending offers, upcoming confirmed arrangements or active provider work. All-zero results show one compact message. Failed reads are handled separately from zero counts. My Customers shows a count when available from the existing member-scoped completed relationships view, with no customer details in the Home payload.

Updated Home and Activity on web and Expo. Existing preferences, requester activity, seasonal campaigns, and job and listing actions are preserved. No schema or mapping changes are needed.

## Validation and release

- Release commit `6132076128ebc2b234b1b12cd3160e6eb6b9e3d9` excludes the pending map work.
- The final isolated release passed 308 repository tests, the provider web production build and both Expo exports. Regression tests cover named gaps, configured and untouched areas, empty and unavailable metrics, indicator priority, upcoming arrival times, account-scoped customer counts and existing mode persistence.
- Signed-in browser layout and device interaction remain to be verified.
- Vercel confirmed deployment `7JAzwUmk9SmbJk9j1cmb4GAEH1zb` succeeded. The development Home and focused Activity URLs returned HTTP 200. [Development site](https://dev.ruralconnections.nz/) · [Vercel deployment](https://vercel.com/rural-connections/difm-rural/7JAzwUmk9SmbJk9j1cmb4GAEH1zb)
- Expo published Android and iOS to `preview` with runtime `1.0.0`, update group `c9628b62-b427-42d8-ab6e-c5033ead778d`. [Expo update](https://expo.dev/accounts/difmrural/projects/difm-rural/updates/c9628b62-b427-42d8-ab6e-c5033ead778d)
