# Home UX V2

Home has two modes for the same account. My Property is the default. Expo stores the last mode in AsyncStorage and web stores it in localStorage, scoped by account and device or browser.

- My Property starts with a compact Property Network preview, then Post a job, Find local help and requester On the go activity.
- My Work shows active provider work, pending offers, upcoming confirmed work and invitations awaiting review. Find work, Create a listing and My Customers link to the existing workflows.
- Useful right now remains below the primary content in both modes. The bottom navigation and existing routes are preserved.
- My Network and My People link between the existing property network and requester connections screens. Saved, Worked together and invitations use their existing data and actions. My Customers continues to use the existing provider view.

The main changes are in the Expo Home screen, provider web Home page and mode component, and the existing Property Network and connections screens. Upcoming jobs use participant-scoped arrival schedules, while bookings use their existing schedule and status. No database changes are required, and the My Property centre retains its informational fallback.

## Validation and release

- Release commit `7412b2200b872331a1373e7f6eecc7270c8c0acb` excludes the pending LINZ work.
- The isolated release passed 305 repository tests, the provider web production build, and the Android and iOS Expo exports. The working copy passed 312 tests, including seven for pending map work.
- Tests exercise the default and restored modes, browser preference storage, role-specific activity, confirmed arrival totals, privacy-masked activity lookups, relationship navigation and existing seasonal campaigns.
- Signed-in desktop and mobile browser interaction and physical-device checks are pending.
- Vercel deployment `Cm7kYGzW79zv9KM5DfGQmYkuhu9f` succeeded. The development Home returned HTTP 200. [Development site](https://dev.ruralconnections.nz/) · [Vercel deployment](https://vercel.com/rural-connections/difm-rural/Cm7kYGzW79zv9KM5DfGQmYkuhu9f)
- Expo published Android and iOS to `preview` on runtime `1.0.0`, update group `634237bb-5a36-4993-a3a1-e304806bfa5d`. [Expo update](https://expo.dev/accounts/difmrural/projects/difm-rural/updates/634237bb-5a36-4993-a3a1-e304806bfa5d)
