# My Property Network V1

My Property Network is available from Home on provider web and Expo. It opens with six suggested support areas and an interactive property diagram. The List toggle exposes the same controls. The radial links show where providers are linked, and a separate marker identifies areas with a service explicitly set to **I need to find someone**.

A requester can hide and re-add areas, set each service's status, and add custom services. Hiding an area keeps its settings and linked providers. A service can link several providers from Saved, Worked together or public listing discovery. Provider profiles, category-filtered browsing, new-job drafts and invitations open through the existing workflows. Linking a provider sends no notification.

Migration `20261118170000_property_network.sql` adds owner-only tables for area preferences, service states and provider links. Suggested services are generated from the shared catalogue and only materialised when used. RLS scopes every row to its owner. Linking uses an invoker RPC, the existing public profile projection and a composite foreign key to the owner's service. Property addresses and job details are outside the data model.

## Areas and categories

There are 11 support areas. Together they reach every category in `shared/categories.ts` except General Rural Help. Each suggested service in `SUPPORT_AREAS` has a fixed `key` (`suggested-N`), its own listing `category`, and an optional `kind` (Equipment hire is kind `hire`, category `Machinery`). Find help, provider discovery and matching use the service's category and kind. Post a job uses the main category (`propertyJobCategory`). The new areas, Spraying & Pests, Hay & Feed, and House & Property Sitting, start inactive. Weed spraying moved from Pasture & Land to Spraying & Pests and kept `suggested-1`. Migration `20261118224050_property_network_more_areas.sql` widens the area checks and moves the saved Weed spraying rows and their links. It also activates Spraying & Pests for owners who had set Weed spraying up. Up to 8 active areas share one oval. With 9 to 11, the diagram uses a taller oval (`propertyDiagramRatio`). Web icons are Lucide (`property-network/area-icon.tsx`). App icons are Ionicons, with `mci:` MaterialCommunityIcons used for the tree and barley icons, which Ionicons lacks.

The post-completion suggestion is deferred. Requesters can link providers from Worked together in V1.

## Validation and deployment

- All 297 repository tests passed. Isolated PostgreSQL tests verified private reads and writes, area restoration, status changes, multiple provider links, atomic linking, unlinking and the existing invitation rules. The provider web build and Android and iOS Expo exports passed.
- Hosted testing verified that a synthetic service and provider link persist across sign-ins and are invisible to the linked provider and guests. Unlinking worked. A Windows quoting error interrupted the first fixture cleanup. The exact fixture was removed, and the rerun passed with cleanup verified.
- The deployed diagram and List view passed signed-in Chrome checks at 1280 px and 360 px. Area selection opened the corresponding services. The diagram nodes stayed within the chart and did not overlap at either width.
- Release commit `ce311e6d8b9844cca029c95e61f22257de953088`. Supabase migration `20261118170000` applied to the existing RC test project.
- [My Property Network on the development website](https://dev.ruralconnections.nz/property-network) · [Vercel deployment](https://vercel.com/rural-connections/difm-rural/CcjqhHHL9FvcoTBCEw6aa9gayiTV)
- [Expo preview group `cb0ffe95-769e-4c27-8ce8-391021e569c3`](https://expo.dev/accounts/difmrural/projects/difm-rural/updates/cb0ffe95-769e-4c27-8ce8-391021e569c3) published for Android and iOS on runtime `1.0.0`. Native on-device interaction remains unverified.
