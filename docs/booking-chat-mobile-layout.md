# Confirmed grazing booking Chat layout correction

Branch: `codex/booking-chat-mobile-layout`, based on approved pricing-display commit `ca12d9a123176a9245ed67cd3f4e3ce2884c591a`.

## Investigation

Chat receives the correct title and primary variant; the shared Button renders a white Text label and its navigation handler remains present. The confirmed footer inherited a wrapping horizontal layout and reused an acceptance style containing percentage flexBasis with no explicit width. Chat switched from `flex: 1` to that basis-only style after acceptance, while Complete booking mounted directly in the confirmed state. That is a fragile native sizing/measurement contract; the previous mocked-button tests only checked props and did not render the real Button label.

Static and transition Yoga checks did not reproduce the exact small-rectangle/missing-label artifact reported on physical devices. The precise device/runtime trigger therefore remains unconfirmed; this change removes the sizing ambiguity rather than claiming a reproduced Yoga engine defect.

## Correction

For active confirmed/in-progress grazing only, the footer uses an explicit vertical, nonwrapping, stretched layout. Chat has width 100%, primary styling and remains first; the provider's Complete booking has the same explicit width and secondary styling below it. Requester cancellation retains its existing control/handler in the same stack. Existing 16-point horizontal padding, gap, button minimum height, safe-area bottom padding and navigation are preserved. No shared Button behaviour, lifecycle permissions, acceptance/completion mutation, pricing calculation, snapshot, backend or database change.

## Validation

- Full `npm test`: 708 passed, 0 failed.
- Focused navigation suite: 21 passed, including real Button rendering for Android/iOS, both participant roles and confirmed/in-progress states; verifies label text/colour, accessible label, explicit full width, vertical order and unchanged Chat route without mutations.
- Isolated scratch Yoga 3.2.1 check using actual screen/Button styles: 12 cases passed at 280, 320, 360, 375, 390 and 430 points, font scales 1 and 1.3. Checks full available width within padding, label measurement and vertical separation. No package/dependency files were changed to run this check.
- Android and iOS Expo exports passed.
- `git diff --check` passed.

Physical-device recheck remains necessary: open an already-confirmed booking and also accept a pending booking, verify Chat text/width and Complete booking on narrow Android/iPhone, then tap Chat and return. Confirm the same screen still shows the approved pricing refinement. No physical Android/iOS runtime was available for this local verification.

Kept local: no merge, push, deployment or publication. Property Map security and unrelated worktrees untouched.
