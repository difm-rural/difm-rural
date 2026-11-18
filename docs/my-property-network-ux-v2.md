# My Property Network UX V2

## Experience

- Provider web and Expo retain the property-centred diagram and accessible list. Larger nodes use category icons and text to show unique linked-provider counts, outstanding gaps and unconfigured areas. An area can show both a link count and a support gap.
- Each spoke opens a focused service view. Cards show status and linked providers. Four selectable rows replace the dropdown. Provider linking still uses Saved, Worked together and filtered discovery, and gaps still offer provider discovery and job posting.
- Grow your network shows inactive areas from the existing eight-area catalogue. Tap to add and remove from the focused area view. Hiding an area uses its existing active flag, so re-adding restores prior service settings and links.
- The central My Property node and its List equivalent open a small informational view while Map V1 is pending. Restore navigation to the map editor when that release is deployed. My Locals, profiles, invitations and provider My Customers use their existing routes. V2 introduces no database, RLS or workflow changes.

The main files are `shared/propertyNetwork.ts`, `src/screens/PropertyNetworkScreen.js` and the web `property-network.tsx` and `property-network.css`. Drag-and-drop is deferred. Tap-to-add works with the existing scroll and keyboard controls.

## Validation and deployment

The regression tests check radial positions at narrow and desktop widths for up to eight spokes, mixed provider and gap badges, hide and re-add behaviour, discovery filters, owner-scoped queries and the temporary centre-node action. The V2 changes use the existing database policies. Physical-device and signed-in desktop/mobile browser checks remain pending.

The release is based on `ce311e6` and excludes the pending map editor, migration, address function and LINZ configuration. Targets are the existing Vercel development site and Expo `preview`.
