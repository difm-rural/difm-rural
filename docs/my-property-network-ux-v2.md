# My Property Network UX V2

## Experience

- Provider web and Expo retain the property-centred diagram and accessible list. Larger nodes use category icons and text to show unique linked-provider counts, outstanding gaps and unconfigured areas. An area can show both a link count and a support gap.
- Each spoke opens a focused service view. Cards show status and linked providers. Four selectable rows replace the dropdown. Provider linking still uses Saved, Worked together and filtered discovery, and gaps still offer provider discovery and job posting.
- Grow your network shows inactive areas from the existing eight-area catalogue. Tap to add and remove from the focused area view. Hiding an area uses its existing active flag, so re-adding restores prior service settings and links.
- The central My Property node and its List equivalent open a small informational view while Map V1 is pending. Restore navigation to the map editor when that release is deployed. My Locals, profiles, invitations and provider My Customers use their existing routes. V2 introduces no database, RLS or workflow changes.

The main files are `shared/propertyNetwork.ts`, `src/screens/PropertyNetworkScreen.js` and the web `property-network.tsx` and `property-network.css`. Drag-and-drop is deferred. Tap-to-add works with the existing scroll and keyboard controls.

## Validation and deployment

The isolated release passed all 298 repository tests, the provider web production build and Android and iOS Expo exports. The main working copy also passed 305 tests, including seven tests for the separate Map V1 work. The regression tests check radial positions at narrow and desktop widths for up to eight spokes, mixed provider and gap badges, hide and re-add behaviour, discovery filters, owner-scoped queries and the temporary centre-node action. The V2 changes use the existing database policies. The deployed route responded over HTTPS. Signed-in browser verification was interrupted when Windows automation could not reliably determine the active browser URL. Physical-device interaction remains unverified.

Release commit `215d010be858b08acfd96bb9c5fee69b95082c29` excludes the pending map editor, migration, address function and LINZ configuration.

- Provider web deployed successfully to the development site. Vercel deployment ID `DmjMpvwXV6zAg6ryxHae4ee2VqJx`. [Development site](https://dev.ruralconnections.nz/property-network) · [Vercel deployment](https://vercel.com/rural-connections/difm-rural/DmjMpvwXV6zAg6ryxHae4ee2VqJx)
- Expo published to `preview` for Android and iOS on runtime `1.0.0`. Update group `2718197f-ca30-4d49-bf16-4c231ab5dd09`. [Expo update](https://expo.dev/accounts/difmrural/projects/difm-rural/updates/2718197f-ca30-4d49-bf16-4c231ab5dd09)
