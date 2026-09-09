# In-page help requests

The shared navbar, assessment header, and post-assessment feedback header expose a question-mark button. It opens an accessible native dialog with required email, phone, and message fields. Signed-in email is prefilled but remains editable. The dialog traps focus, supports closing, and retains unsent input when reopened on the same page.

Requests are sent directly as JSON to `https://formspree.io/f/xdeoyzrp` with `Accept: application/json`. Fields: `email`, `phone`, `message`, `page` (pathname only), and `_subject`. No assessment answers, scores, tokens, or URL query parameters are sent. Success is shown only after a successful HTTP response; failed/timed-out requests retain the text and allow retry. The request has a 20-second timeout and a duplicate-click guard. No live test messages were sent to the endpoint.

## Assessment safety

Help renders inside the current fullscreen element (or the document body), using `dialog.showModal()` rather than a new tab, external navigation, browser alert, or fullscreen exit. Moving focus to its form controls stays inside the same document, so it does not trigger the existing window-blur / document-hidden warning conditions. There is deliberately **no blanket proctoring suppression**: switching tabs, leaving fullscreen, and connecting displays still follow the existing rules. The assessment timer continues. The dialog closes when a real violation, submission, termination, or assessment review must take priority.

## Checks

- `npm test` includes phone and message boundary/format tests.
- `npx tsc --noEmit` validates component wiring and portal types.
- Manual browser check: open help from the navbar, use Tab / Shift+Tab, close it, reopen, and confirm draft retention.
- In an active fullscreen assessment: open, type, send (mock endpoint), and close help; confirm the warning count is unchanged and the timer continues.
- Mock HTTP 200 for the success state and 422/500/network failure for retry; check the submitted field values without sending test messages to the real inbox.
- While help is open, a real tab switch / fullscreen exit should retain normal proctoring behavior; assessment timeout should dismiss help and show review.
- Check 360px mobile layout and reduced-motion preferences.

Browser automation was attempted in this sandbox, but downloading Chromium was blocked by a TLS/network error. The browser-only checklist above still needs verification in an environment with a browser installed.
