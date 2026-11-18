# My Property Network V1

My Property Network is available from Home on provider web and Expo. It opens with six suggested support areas and an interactive property diagram. The List toggle exposes the same controls. The radial links show where providers are linked, and a separate marker identifies areas with a service explicitly set to **I need to find someone**.

A requester can hide and re-add areas, set each service's status, and add custom services. Hiding an area keeps its settings and linked providers. A service can link several providers from Saved, Worked together or public listing discovery. Provider profiles, category-filtered browsing, new-job drafts and invitations open through the existing workflows. Linking a provider sends no notification.

Migration `20261118170000_property_network.sql` adds owner-only tables for area preferences, service states and provider links. Suggested services are generated from the shared catalogue and only materialised when used. RLS scopes every row to its owner. Linking uses an invoker RPC, the existing public profile projection and a composite foreign key to the owner's service. Property addresses and job details are outside the data model.

The post-completion suggestion is deferred. Requesters can link providers from Worked together in V1.
