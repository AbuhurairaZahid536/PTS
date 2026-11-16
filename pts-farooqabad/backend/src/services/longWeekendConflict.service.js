const { pool } = require("../config/db");

function normalizeIds(values) {
  return Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .map(Number)
        .filter((id) => Number.isInteger(id) && id > 0),
    ),
  );
}

function placeholders(values) {
  return values.map(() => "?").join(", ");
}

function cleanLabel(value) {
  return String(value ?? "").trim();
}

function personLabel(row) {
  const employeeId = cleanLabel(row?.employee_id);
  const traineeName = cleanLabel(row?.trainee_name);

  if (employeeId && traineeName) {
    return `${employeeId} (${traineeName})`;
  }

  return employeeId || traineeName || `Trainee ID ${row?.trainee_id ?? "-"}`;
}

/*
|--------------------------------------------------------------------------
| INDIVIDUAL LONG WEEKEND -> OPERATIONAL STATUS CONFLICT
|--------------------------------------------------------------------------
|
| Only explicitly selected Individual Trainees are checked here.
|
| All-Trainees and Selected-Course Long Weekends must remain saveable even
| when some trainees are already on Leave / Home Rest / OSD / Repatriate.
| Those bulk-scope trainees are resolved by the existing operational priority
| and departure-authorisation rules instead of blocking the whole Weekend.
|
| Medical Rest is intentionally excluded: it is not a biometric exemption.
|--------------------------------------------------------------------------
*/

async function findIndividualWeekendOperationalConflicts({
  traineeIds,
  startDatetime,
  endDatetime,
}) {
  const ids = normalizeIds(traineeIds);

  if (!ids.length || !startDatetime || !endDatetime) {
    return [];
  }

  const inSql = placeholders(ids);
  const params = [...ids, endDatetime, startDatetime];

  const [leaveRows, osdRows, homeRestRows, repatriateRows] = await Promise.all([
    pool.query(
      `
        SELECT
          l.trainee_id,
          t.employee_id,
          TRIM(CONCAT_WS(' ', t.first_name, t.last_name)) AS trainee_name,
          'LEAVE' AS conflict_type,
          l.id AS conflict_id,
          l.start_datetime AS conflict_start,
          l.end_datetime AS conflict_end,
          l.leave_type AS conflict_detail

        FROM trainee_leaves l

        JOIN trainees t
          ON t.id = l.trainee_id

        WHERE
          l.trainee_id IN (${inSql})
          AND l.workflow_status IN ('APPROVED', 'COMPLETED')
          AND l.biometric_exempt = 1
          AND l.start_datetime <= ?
          AND l.end_datetime >= ?
      `,
      params,
    ),

    pool.query(
      `
        SELECT
          o.trainee_id,
          t.employee_id,
          TRIM(CONCAT_WS(' ', t.first_name, t.last_name)) AS trainee_name,
          'OSD' AS conflict_type,
          o.id AS conflict_id,
          o.start_datetime AS conflict_start,
          o.end_datetime AS conflict_end,
          o.record_type AS conflict_detail

        FROM trainee_osd o

        JOIN trainees t
          ON t.id = o.trainee_id

        WHERE
          o.trainee_id IN (${inSql})
          AND o.workflow_status IN ('APPROVED', 'COMPLETED')
          AND o.record_type IN ('OSD', 'SHORT_PERMISSION')
          AND o.biometric_exempt = 1
          AND o.start_datetime <= ?
          AND o.end_datetime >= ?
      `,
      params,
    ),

    pool.query(
      `
        SELECT
          o.trainee_id,
          t.employee_id,
          TRIM(CONCAT_WS(' ', t.first_name, t.last_name)) AS trainee_name,
          'HOME_REST' AS conflict_type,
          o.id AS conflict_id,
          o.home_rest_start AS conflict_start,
          o.home_rest_end AS conflict_end,
          'Home Rest' AS conflict_detail

        FROM trainee_outdoor o

        JOIN trainees t
          ON t.id = o.trainee_id

        WHERE
          o.trainee_id IN (${inSql})
          AND o.workflow_status IN ('ACTIVE', 'COMPLETED')
          AND COALESCE(o.home_rest, 0) = 1
          AND o.home_rest_start IS NOT NULL
          AND o.home_rest_end IS NOT NULL
          AND o.home_rest_start <= ?
          AND o.home_rest_end >= ?
      `,
      params,
    ),

    pool.query(
      `
        SELECT
          d.trainee_id,
          t.employee_id,
          TRIM(CONCAT_WS(' ', t.first_name, t.last_name)) AS trainee_name,
          'REPATRIATE' AS conflict_type,
          d.id AS conflict_id,
          d.drop_datetime AS conflict_start,
          d.rejoin_datetime AS conflict_end,
          d.reason AS conflict_detail

        FROM trainee_training_drop d

        JOIN trainees t
          ON t.id = d.trainee_id

        WHERE
          d.trainee_id IN (${inSql})
          AND d.drop_status IN ('ACTIVE', 'REJOINED')
          AND d.drop_datetime <= ?
          AND (
            d.drop_status = 'ACTIVE'
            OR d.rejoin_datetime IS NULL
            OR d.rejoin_datetime >= ?
          )
      `,
      params,
    ),
  ]);

  const combined = [
    ...(leaveRows?.[0] || []),
    ...(osdRows?.[0] || []),
    ...(homeRestRows?.[0] || []),
    ...(repatriateRows?.[0] || []),
  ];

  const rank = {
    REPATRIATE: 1,
    LEAVE: 2,
    HOME_REST: 3,
    OSD: 4,
  };

  return combined.sort((a, b) => {
    const traineeDiff = Number(a.trainee_id) - Number(b.trainee_id);
    if (traineeDiff) return traineeDiff;
    return (rank[a.conflict_type] || 99) - (rank[b.conflict_type] || 99);
  });
}

function buildIndividualWeekendConflictMessage(conflicts) {
  const rows = Array.isArray(conflicts) ? conflicts : [];

  if (!rows.length) {
    return null;
  }

  const firstByTrainee = new Map();

  for (const row of rows) {
    const traineeId = Number(row.trainee_id);
    if (!firstByTrainee.has(traineeId)) {
      firstByTrainee.set(traineeId, row);
    }
  }

  const visible = Array.from(firstByTrainee.values()).slice(0, 5);
  const labels = visible.map((row) => {
    const typeLabel =
      row.conflict_type === "HOME_REST"
        ? "Home Rest"
        : row.conflict_type === "REPATRIATE"
          ? "Repatriate"
          : row.conflict_type === "OSD"
            ? cleanLabel(row.conflict_detail) || "OSD"
            : "Leave";

    return `${personLabel(row)} - ${typeLabel}`;
  });

  const extra = firstByTrainee.size > visible.length
    ? ` and ${firstByTrainee.size - visible.length} more`
    : "";

  return (
    `Individual Long Weekend cannot be saved because overlapping operational status already exists for: ` +
    `${labels.join(", ")}${extra}. ` +
    `Adjust/cancel the overlapping Leave, Home Rest, OSD or Repatriate record first.`
  );
}

/*
|--------------------------------------------------------------------------
| OPERATIONAL STATUS -> EXISTING INDIVIDUAL LONG WEEKEND CONFLICT
|--------------------------------------------------------------------------
|
| Reverse validation is deliberately limited to weekend_trainee_assignments.
| An All-Trainees / Course Weekend must NOT block Leave, Home Rest, OSD or
| Repatriate; those bulk-scope overlaps are valid and resolved operationally.
|--------------------------------------------------------------------------
*/

async function findIndividualLongWeekendConflict({
  traineeId,
  startDatetime,
  endDatetime = null,
}) {
  const id = Number(traineeId);

  if (!Number.isInteger(id) || id <= 0 || !startDatetime) {
    return null;
  }

  const params = [id, startDatetime];
  let overlapSql = "w.end_datetime >= ?";

  if (endDatetime) {
    overlapSql = "w.start_datetime <= ? AND w.end_datetime >= ?";
    params.splice(1, 0, endDatetime);
  }

  const [rows] = await pool.query(
    `
      SELECT DISTINCT
        w.id AS weekend_id,
        w.weekend_name,
        w.start_datetime,
        w.end_datetime,
        t.employee_id,
        TRIM(CONCAT_WS(' ', t.first_name, t.last_name)) AS trainee_name

      FROM attendance_weekends w

      JOIN weekend_trainee_assignments wta
        ON wta.weekend_id = w.id
       AND wta.trainee_id = ?

      JOIN trainees t
        ON t.id = wta.trainee_id

      WHERE
        w.is_active = 1
        AND ${overlapSql}

        AND NOT EXISTS
        (
          SELECT 1
          FROM weekend_detained_trainees wdt
          WHERE wdt.weekend_id = w.id
            AND wdt.trainee_id = wta.trainee_id
        )

      ORDER BY
        w.start_datetime ASC,
        w.id ASC

      LIMIT 1
    `,
    params,
  );

  return rows?.[0] || null;
}

function buildReverseConflictMessage(conflict, operationLabel) {
  if (!conflict) {
    return null;
  }

  const label = cleanLabel(operationLabel) || "Operational status";
  const who = personLabel(conflict);

  return (
    `${label} cannot be saved because ${who} is already individually assigned to overlapping Long Weekend ` +
    `"${conflict.weekend_name || "Long Weekend"}". ` +
    `Remove/adjust the individual Long Weekend assignment first.`
  );
}

module.exports = {
  findIndividualWeekendOperationalConflicts,
  buildIndividualWeekendConflictMessage,
  findIndividualLongWeekendConflict,
  buildReverseConflictMessage,
};
