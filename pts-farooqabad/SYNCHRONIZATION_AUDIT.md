# PTS synchronization audit — 17 November 2026

## Authority and scope

ZKBioTime is authoritative for current employee IDs/codes, departments/positions and biometric punches. PTS remains authoritative for sanctioned Leave, OSD, timetable/shift configuration, medical records and repatriation orders. These operational records are not supplied by the BioTime transaction API and must not be erased by a biometric import. Historical trainees are deliberately retained after course completion, so total historical PTS rows are not the current BioTime employee count.

## Findings and changes

1. Repatriation compared database IDs, attendance record IDs and cap codes as one namespace. A numeric collision could repatriate an unrelated Present trainee. Matching now uses the typed trainee ID; legacy code matching additionally requires the same course. Future drops and effective rejoins are excluded as of the selected Pakistan date. Operational reasons are retained in API rows and dashboard lists. Stale Present punches are cleared from repatriate display rows.
2. Dashboard membership depended on separately fetched attendance and support data. Missing rows became fabricated Absent rows; cached attendance could be combined with newer operational state. The dashboard now requests one complete date-bound snapshot, rejects stale responses after date changes, retains support data with the same cache and shows persistent stale-data warnings. Unprocessed/no-timetable trainees remain explicitly accounted for. Master-roster membership prevents orphan report rows increasing headcount.
3. Display uses full BioTime employee codes as strings, preserving prefixes and leading zeros. Employee sync resolves the stable BioTime ID before the mutable code so code corrections update the existing mapped PTS record instead of creating a duplicate.
4. Live and manual transaction import had duplicate normalization/writers. They now share validated pagination, normalization and upserts. Server page-size caps cannot truncate imports; repeated/malformed/incomplete page responses fail visibly. Invalid optional numbers become NULL, IDs remain exact strings, and timezone-bearing timestamps convert to Pakistan wall-clock time.
5. A five-minute-only replay could permanently miss late uploads. Yesterday/today are replayed periodically, and any selected earlier date can be reconciled manually. Corrected existing transactions refresh derived attendance, not just new inserts. Failed rows persist in biometric_sync_failures and are retried after restart; unresolved failures remain inspectable. An incomplete scheduled fetch defers new absence calculation.
6. OSD start/end/reason and repatriation reason were not fully carried into dashboard/report drilldowns. Typed record joins now supply these fields. Absence start, actual return/end and duration are joined from absence episodes and bounded to the selected report date. Future returns are not shown as completed on an earlier date. Lists, printing and Excel exports expose the relevant details.
7. A regular session could display Absent while its final punch window was still open. Attendance and report endpoints now share the same effective Pending expression, including matching summary counts. Existing OPEN absence episodes remain actionable.
8. BioTime pulls depended on a logged-in browser. A server scheduler now pulls transactions each configured interval and reconciles employee masters periodically, using the existing single-flight locks. Attendance recalculation is serialized. Incomplete master syncs are not cached as completed browser sessions, and sync failures appear in the UI instead of a static green banner.
9. New read-only reconciliation diagnostics compare current BioTime employee membership/fields against the local mirror and PTS mappings, plus transaction IDs/corrections for the selected date. They report missing, extra, duplicate and unmapped records without deleting historical PTS data.

## Deployment

- Deploy the frontend and backend together. Restart the backend; the scheduler runs even with no browser open.
- Before first production sync, from backend/ run `node scripts/setup-biometric-sync.js`. This creates only the idempotent retry queue. The same table is lazily ensured by synchronization; the DB account needs CREATE privilege for that operation. Do not rerun the legacy migration folder for this change.
- Configure the actual ZKBIO_BASE_URL / ZKBIO_USERNAME / ZKBIO_PASSWORD on the VPS. BIOMETRIC_AUTO_SYNC_ENABLED defaults to enabled; BIOMETRIC_AUTO_SYNC_SECONDS defaults to 60 with a 30-second minimum. Local snapshot mode remains isolated from live BioTime.
- Open Biometric Transactions > Check BioTime Reconciliation for the selected date. Inspect failed transaction reasons. Use Sync Selected Date to replay an older day after a delayed upload or outage.
- The replay policy covers yesterday/today automatically. Older late uploads require selected-date reconciliation; it does not silently rewrite every historical day on every poll.

## Verification and limits

Regression tests exercise page caps/truncation, durable retries across restart, correction upserts, exact codes, identity collisions, repatriation timing, complete snapshots, stale-source errors and read-only count diagnostics. A separate MySQL integration test creates and removes a uniquely named temporary database on the isolated localhost:3307 runtime; it verifies real report joins, typed OSD/repatriation reasons, historical absence duration, Pending summaries and transaction retry/upsert behavior.

The saved production BioTime account was rejected by /api-token-auth/ (HTTP 400). A current PTS schema/data export and working VPS access were not available. The deployed dataset, historical backfill result and production query performance therefore remain unverified. No production data was changed, and these source changes have not been deployed.
