# Trusted Locals Stage 3

My Locals has separate **Saved** and **Worked together** sections on Expo and provider web. A provider can appear in both. Saved cards link to the public profile and show the provider’s photo, region and live service categories when available, with profile skills as a fallback. My Customers continues to show completed work. The Expo network view remains available in My Customers and the existing job invitation picker.

Both My Locals sections can invite a provider to an eligible open job. The chooser excludes active invitations, supports re-invitation using the current revision, and links to the existing new-job wizard. Stage 2 RPCs still enforce eligibility, ownership, job status and duplicate prevention. Selecting Post a job opens a draft.

Profiles and My Locals share the public profile URL. Expo uses the native share sheet and clipboard. The web uses the browser share API or copies the link, with a selectable link if clipboard access fails. Signed-out recipients see only the public profile fields needed for the landing page. The signed-in profile and its private actions retain their existing authentication boundary.

Migration `20261118160000_saved_providers.sql` adds one owner-scoped bookmark table. The unique requester/provider key prevents duplicates. Authenticated requesters can read, create and remove their own rows. Saving adds no notification, work-history entry, invitation or access to private records. Stage 3 uses existing backend functions.

Local validation passed all 288 repository tests, the provider web production build, Android and iOS Expo exports, and rollback-only PostgreSQL tests for bookmark privacy, duplicate saves, first-time and previous-provider invitations, and Stage 2 invitation and gallery access.

## Hosted rollout

- Release commit `d6ab3b44a1342402227cfb68b7bbce4c8577ee42`.
- Supabase migration `20261118160000` applied to the existing test project. The linked dry run listed this migration alone.
- [Development website](https://dev.ruralconnections.nz) deployed successfully. [Vercel deployment](https://vercel.com/rural-connections/difm-rural/8BJHw6ydJ2DrTtqh2TXQiQcVEqfj)
- Android and iOS published on Expo `preview`, runtime `1.0.0`. [Expo update group](https://expo.dev/accounts/difmrural/projects/difm-rural/updates/03c18cfb-832a-478a-b8b7-d8b7644c9b34)
- Hosted checks with the approved requester and provider verified save, duplicate rejection, owner-only access, removal of the test bookmark, signed-out public profile access, and the signed-in My Locals and My Customers pages. The bookmark was restored to its original state.
- Native interaction with the published Expo update was not verified on a device. The sharing and copy fallback logic is covered by automated tests.
