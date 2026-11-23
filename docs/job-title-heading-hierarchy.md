# Job title heading hierarchy

Branch: `fix/job-title-heading-hierarchy`.

Manage Job now uses the actual job title as its large accessible heading. Manage job is a small existing-style section label above it. Existing current-status banners remain below the title; their logic and actions are unchanged. The title is not line-limited, so it wraps rather than truncates, with shrinking/minimum-width constraints inside existing horizontal padding.

Provider Job Details already uses the job title as its main heading. Removed duplicate titles from the provider open/fallback summary cards and removed provider title truncation. Requester accepted-title limits remain unchanged. No buttons, navigation, lifecycle, permissions or data changed.

Verification: 505 automated tests pass. Focused tests cover heading size/order, complete long-title rendering, status below the requester title, and one multiline title across open/accepted/completed/cancelled provider views. Android and iOS Expo exports pass. Physical narrow-device and large-accessibility-font geometry remains a phone smoke check; automated tests verify rendering props, not native text measurements.

No merge, push or publication performed. Unrelated local changes preserved.
