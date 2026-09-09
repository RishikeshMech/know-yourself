# Post-assessment feedback

Newly completed assessments (including auto-submissions) go to `/feedback` before the existing student dashboard. A persistent browser marker is written after the assessment save. The dashboard and result-page gates redirect pending candidates back to feedback without rendering the report. Existing completed assessments are not retroactively blocked.

The candidate must select 1–5 stars and review a 10–1,000-character message. Every rating supplies editable wording. Only a successful Formspree HTTP response clears the pending step. Errors retain the form for retry. No test submissions were sent to the live inbox.

## AI configuration

`POST /api/feedback/suggest` uses the existing server-only `CALIBIAI_API_KEY` or `DEEPSEEK_API_KEY`, with the matching optional `_BASE_URL` and `_MODEL` variables already used by the app. Default endpoint/model: `https://api.deepseek.com`, `deepseek-chat`. Never use a `NEXT_PUBLIC_` key. With no key or an upstream failure, the original wording is retained and the UI explicitly reports that AI is unavailable. Feedback submission does not depend on AI.

AI is opt-in; only the rating and comments go to the provider. Formspree receives rating, comments, and assessment session ID at `https://formspree.io/f/maeyajza`. No candidate contact information or scores are added.

## Verification

- Finish a manual or auto-submitted assessment: feedback appears.
- Reload or directly visit `/dashboard/student` or `/result` while pending: feedback remains required.
- Use Tab and arrow keys to select the star radio inputs; suggested text updates.
- Edit text, switch ratings, and polish with AI. Edits made while AI runs are not overwritten.
- Mock Formspree failure: form stays populated and continuation stays blocked.
- Mock Formspree success: thank-you state appears; dashboard is available without repeating feedback.
- Test mobile widths and reduced-motion preferences.

This requirement is enforced in the browser, consistent with the existing assessment navigation. It is not a server-side authorization boundary: clearing site storage or another device can bypass it. Cross-device enforcement would require a persisted feedback receipt tied to authenticated assessment records and report API checks, outside this UI-focused change.
