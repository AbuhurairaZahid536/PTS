# PTS Public Website — Compact Contact Layout Patch (14 Oct 2026)

## Apply only these files
Extract this archive into your existing local repo at `D:\PTS_Farooqabad\pts-farooqabad`, retaining the `frontend/`, `backend/` and `tests/` directory structure. This patch applies on top of `PTS_PUBLIC_SITE_NEWS_TENDERS_SUGGESTIONS_PATCH_20261014.zip` (the one already copied before deployment).

## Scope
- Shrinks the suggestion card, places it alongside the institution title, rather than spanning the full section.
- Official Phone, Official Email, and Visitor Hours display horizontally in one strip on desktop, stacked cleanly on mobile.
- Adds Contact > Google Maps Location Link to Public Website Management CMS. Google Maps share links open in a new tab; invalid/non-Google URLs render as plain text and trigger CMS warning.
- Footer includes school/department/motto and copyright year with "All rights reserved."
- Preserves form validation, privacy consent, honeypot, API endpoint, thank-you response, admin bell and acknowledgement email logic.

## Files changed/added
- Changed: frontend/src/pages/Home.jsx
- Changed: frontend/src/pages/PublicWebsiteManagement.jsx
- Changed: frontend/src/components/PublicSuggestionForm.jsx
- Changed: backend/src/models/publicSite.model.js (adds optional CMS field only)
- Added: frontend/src/publicContactCompact.css
- Added: frontend/src/utils/publicGoogleMapsUrl.js
- Added: tests/publicSite/contactCompact.smoke.cjs

No existing database table, migration or attendance module changed. Existing public-site migration `20261014_public_site_suggestions.sql` remains already prepared and applied on VPS.

## Before deploy — Windows PowerShell
```powershell
cd D:\PTS_Farooqabad\pts-farooqabad
node --check backend\src\models\publicSite.model.js
node tests\publicSite\predeploy.smoke.cjs
node tests\publicSite\contactCompact.smoke.cjs
cd frontend
npm run build
```
All checks should pass. Frontend full build requires npm dependencies available on the user's PC; not run in this sandbox.

## Important deployment guardrails
Do not rerun the old migrations or replace other backend/frontend files. Re-stage the modified files before git commit, since some were already staged before this patch was copied. Do not stage unrelated files.

## After deployment
In Public Website Management > Contact, enter a *Google Maps Share link* in the new field, save Website, and refresh public homepage. Test contact mobile view and submit one benign test suggestion. Verify admin bell and email handling only after mail provider is configured.
