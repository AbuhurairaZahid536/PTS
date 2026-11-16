# PTS Farooqabad — Public Website Features (14 October 2026)

## Changes

1. Replace the 1975 / 2001 / PTS / 24/7 home statistics strip with a right-to-left animated **News Updates** ticker. Manage its messages, publication status, and ordering from **Portal > Public Website Management > News & Tenders**.
2. Add **Tenders** to the public navbar (also visible on mobile). The new deep-link page `/?page=tenders` lists **published** tender notices with images and full descriptions. Draft tenders/images are excluded from the unauthenticated public JSON response. Upload an image with the existing CMS, complete title/date/description, set Published and **Save Website**.
3. Add public **Suggestions & Feedback** form in Contact area. Require visitor email, message and consent; allow optional name. Persist submissions to `public_site_suggestions`, enforce per-IP rate limit and a bot honeypot.
4. Authorized users possessing `public_site.manage` see a **bell in the portal header**. It polls every 45 seconds; click to view paginated suggestions, email, date, acknowledgement status, and mark items read.
5. Send the visitor an automated English thank-you email via Resend REST API when configured. Feedback is accepted and saved **even if outgoing email fails or is not configured**; delivery state recorded in DB.

## Production caution

* Patch is based on latest source uploaded **PTS_CURRENT_SOURCE_20261010.zip**. If local files changed after 10 October, compare every overlapping file before copying. Never overwrite newer source blindly.
* No Attendance Engine / Dashboard / Long Weekend / Course Lifecycle / Leave / OSD / Continuous Absence code changed. No existing DB table is altered.
* Database creates only one new table. Existing CMS data is preserved and new keys are merged in automatically.
* Pre-deployment smoke tests use mock DB/email. Real provider delivery, frontend production build and VPS operations must be checked before declaring rollout complete.

## Install (local Windows)

1. Back up Git working tree, MySQL DB, and VPS upload volume before any deploy.
2. Extract patch ZIP **into repository root** (`D:\PTS_Farooqabad\pts-farooqabad`), preserving `backend/` and `frontend/` paths.
3. `cd D:\PTS_Farooqabad\pts-farooqabad`
4. `git diff -- backend/src frontend/src` and `git status --short` — examine changes.
5. `cd frontend` then `npm ci` and `npm run build`; do not push if build fails.
6. Return to repo root and run JS syntax checks. `node tests/publicSite/predeploy.smoke.cjs` runs isolated 13-case smoke checks only if the included test script is copied.
7. Deploy via existing GitHub workflow only after the previous checks and backup.

## DB schema

New table is **lazily initialized** on first suggestion or admin inbox request using the same pattern as existing Public Website CMS (requires CREATE privilege). To install deterministically first, execute *only* `backend/migrations/20261014_public_site_suggestions.sql` against `pts_farooqabad`. It is idempotent.

**Never run `npm run migrate` just to apply this feature** — old migration files may change working `LONG_WEEKEND` exemption ENUM.

## Optional automatic email configuration

Add to production backend environment (**not to Git**):

```
RESEND_API_KEY=<real-secret-from-provider>
PUBLIC_SUGGESTION_FROM_EMAIL=PTS Farooqabad <feedback@your-verified-domain.example>
```

The sender domain must be verified with Resend. Without both environment values, submissions and admin notifications still work, but acknowledgement state is `NOT_CONFIGURED`; **no actual email is sent**. Do not present such an email as sent. A separate SMTP/Gmail integration would require a different provider transport and should not be assumed.

If the deployment injects environment variables via Docker Compose or `.env`, update that configuration and restart **only after a controlled deploy**. Do not put secrets in code or Git history.

## Verification plan

1. Public homepage: statistics box gone, right-to-left news ticker appears (empty text until admins publish). Hover pauses; reduced motion respected.
2. CMS: create news update and confirm it appears after Save Website; hide it and confirm it disappears.
3. CMS: add **draft** tender with image/date/description and save; it must not appear in the public JSON or Tenders page.
4. Publish the tender, save, open `/?page=tenders`, open image, verify text, refresh, browser Back, and mobile navigation.
5. Public Contact: invalid email / no consent blocked; valid feedback saved; visitor sees thank-you.
6. Admin portal: authorized user sees bell, new message appears within 45 seconds, can mark read, and pagination works. Unauthorized portal users must not be able to access the inbox.
7. With verified sender configured, submit to a real email and check receipt plus `email_status=SENT`. Without configuration, expect `NOT_CONFIGURED` and no mail.
8. Existing production workflow regression: verify Login, dashboard total, attendance process, live sync 200, reports 1,982 roster, OPEN Continuous Absence 42 as of 10 Oct and Long Weekend 4 as of 10 Oct **as historical comparison, not timeless counts**. They may change over time naturally.

## Scope

Changes limited to Public Website CMS, public navigation/Home, header bell, new self-contained feedback storage/email, optional `.env.example`, and the new SQL migration. Old uploads and operational records untouched.
