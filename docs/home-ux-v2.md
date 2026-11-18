# Home UX V2

Home has two modes for the same account. My Property is the default. Expo stores the last mode in AsyncStorage and web stores it in localStorage, scoped by account and device or browser.

- My Property starts with a compact Property Network preview, then Post a job, Find local help and requester On the go activity.
- My Work shows active provider work, pending offers, upcoming confirmed work and invitations awaiting review. Find work, Create a listing and My Customers link to the existing workflows.
- Useful right now remains below the primary content in both modes. The bottom navigation and existing routes are preserved.
- My Network and My People link between the existing property network and requester connections screens. Saved, Worked together and invitations use their existing data and actions. My Customers continues to use the existing provider view.

The main changes are in the Expo Home screen, provider web Home page and mode component, and the existing Property Network and connections screens. Upcoming jobs use participant-scoped arrival schedules, while bookings use their existing schedule and status. No database changes are required, and the My Property centre retains its informational fallback.

## Validation and release

Release verification pending.
