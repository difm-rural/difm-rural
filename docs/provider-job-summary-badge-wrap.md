# Provider Job Details badge wrapping

Branch: `fix/provider-job-summary-badge-wrap`.

The provider-specific accepted-job summary in `JobDetailScreen.js` placed category and lifecycle badges on one non-wrapping row. The status badge had `flexShrink: 0`, allowing long text to extend past the card edge.

The header now uses `flexWrap: wrap` with top alignment. Its category and status badges each use `maxWidth: 100%`, `minWidth: 0` and shrinking; status text can wrap without a line limit. Existing screen/card horizontal padding is retained. The category override applies only in this provider summary; requester category styling is unchanged. No status text, lifecycle, permissions, data access or business logic changed.

Verification:

- Full suite: 491 passed, 0 failed.
- Regression test renders the real provider screen with Animals & Farm Sitting and Waiting on you to confirm. It verifies unchanged status/category, wrapping/shrinking constraints, unrestricted status text, and existing screen/card padding.
- iOS and Android Expo exports pass, including Hermes bundles.
- No Android device/emulator is connected (adb devices is empty); iOS native testing is unavailable on this Windows host. Physical narrow iPhone/Android visual checks remain outstanding. Style assertions and export checks do not measure native text geometry.

No dependencies, database/API changes, migrations or publication. Unrelated local changes preserved.
