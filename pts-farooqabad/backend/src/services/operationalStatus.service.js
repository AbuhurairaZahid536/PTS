const { pool } = require("../config/db");
const { getLeaves } = require("../models/leave.model");
const { getRecords: getOsdRecords } = require("../models/osd.model");
const { getOutdoorRecords } = require("../models/outdoor.model");
const { getWeekends } = require("../models/weekend.model");
const {
  getCustomShiftDutyRestMembershipsForDate,
  getShiftDutyStaffIdsForDate,
} = require("./shiftDuty.service");

const PTS_OFFSET_MINUTES = 5 * 60;

function normalize(value) {
  return value === undefined || value === null
    ? ""
    : String(value).trim().toUpperCase();
}

function truthy(value) {
  return value === true || Number(value) === 1 || String(value).trim() === "1";
}

function ptsNowParts() {
  const shifted = new Date(Date.now() + PTS_OFFSET_MINUTES * 60 * 1000);
  const iso = shifted.toISOString();

  return {
    date: iso.slice(0, 10),
    dateTime: iso.slice(0, 19).replace("T", " "),
  };
}

function wallClockValue(value) {
  if (!value) return null;

  const text = String(value).trim().replace("T", " ").replace(/Z$/i, "");
  const match = text.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?/,
  );

  if (!match) return null;

  return Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4] || 0),
    Number(match[5] || 0),
    Number(match[6] || 0),
  );
}

function activeAt(record, startField, endField, nowValue) {
  const start = wallClockValue(record?.[startField]);
  const end = wallClockValue(record?.[endField]);

  return Boolean(
    start !== null &&
      end !== null &&
      start <= nowValue &&
      end >= nowValue,
  );
}

function identityKey(subjectType, subjectId) {
  const type = normalize(subjectType);
  const id = Number(subjectId);

  if (!type || !Number.isInteger(id) || id <= 0) return null;

  return `${type}:${id}`;
}

function addProtection(set, subjectType, subjectId) {
  const key = identityKey(subjectType, subjectId);
  if (key) set.add(key);
}

function positiveIds(values) {
  return new Set(
    (Array.isArray(values) ? values : [])
      .map(Number)
      .filter((id) => Number.isInteger(id) && id > 0),
  );
}

function weekendValidIds(weekend) {
  return positiveIds([
    ...(weekend?.departure_present_trainee_ids || []),
    ...(weekend?.departure_long_weekend_trainee_ids || []),
  ]);
}

function weekendExplicitIds(weekend) {
  return positiveIds([
    ...(weekend?.trainee_ids || []),
    ...(
      Array.isArray(weekend?.trainees)
        ? weekend.trainees.map((item) => item?.trainee_id ?? item?.id)
        : []
    ),
  ]);
}

function weekendDetainedIds(weekend) {
  return positiveIds([
    ...(weekend?.detained_trainee_ids || []),
    ...(
      Array.isArray(weekend?.detained_trainees)
        ? weekend.detained_trainees.map((item) => item?.trainee_id ?? item?.id)
        : []
    ),
  ]);
}

function weekendCourseIds(weekend) {
  return positiveIds(weekend?.course_ids || []);
}

function weekendTraineeCourseId(weekend, traineeId) {
  const sources = [
    ...(weekend?.trainees || []),
    ...(weekend?.departure_present_trainees || []),
    ...(weekend?.departure_long_weekend_trainees || []),
    ...(weekend?.departure_authorized_leave_trainees || []),
  ];

  const match = sources.find(
    (item) => Number(item?.trainee_id ?? item?.id) === Number(traineeId),
  );

  const courseId = Number(match?.course_id);
  return Number.isInteger(courseId) && courseId > 0 ? courseId : null;
}

function weekendTargetScopeIncludesTrainee(target, traineeId, courseId) {
  if (truthy(target?.apply_all_trainees)) return true;
  if (weekendExplicitIds(target).has(Number(traineeId))) return true;

  return Boolean(
    courseId &&
      weekendCourseIds(target).has(Number(courseId)),
  );
}

async function safeLoad(label, loader, fallback = []) {
  try {
    const value = await loader();
    return Array.isArray(value) ? value : fallback;
  } catch (error) {
    console.error(`[OPERATIONAL STATUS] ${label} load failed:`, error.message);
    return fallback;
  }
}

async function getActiveStaffDutyRestIds(nowDateTime) {
  try {
    const [rows] = await pool.query(
      `
        SELECT DISTINCT
          s.id AS staff_id

        FROM staff s

        JOIN staff_duty_rest dr
          ON dr.record_status = 'ACTIVE'
         AND ? BETWEEN dr.start_datetime AND dr.end_datetime

        WHERE
          s.is_deleted = 0

          AND
          (
            dr.selection_mode = 'ALL'

            OR

            (
              dr.selection_mode = 'CATEGORIES'
              AND EXISTS
              (
                SELECT 1
                FROM staff_duty_rest_categories drc
                WHERE drc.duty_rest_id = dr.id
                  AND drc.category_id = s.category_id
              )
            )

            OR

            (
              dr.selection_mode = 'STAFF'
              AND EXISTS
              (
                SELECT 1
                FROM staff_duty_rest_members drm
                WHERE drm.duty_rest_id = dr.id
                  AND drm.staff_id = s.id
              )
            )
          )
      `,
      [nowDateTime],
    );

    return (rows || [])
      .map((row) => Number(row.staff_id))
      .filter((id) => Number.isInteger(id) && id > 0);
  } catch (error) {
    if (error?.code === "ER_NO_SUCH_TABLE" || Number(error?.errno) === 1146) {
      return [];
    }

    console.error(
      "[OPERATIONAL STATUS] Staff Duty Rest lookup failed:",
      error.message,
    );

    return [];
  }
}


/*
|--------------------------------------------------------------------------
| LONG WEEKEND BIOMETRIC CLOSURE EVENTS
|--------------------------------------------------------------------------
|
| A Long Weekend only interrupts an already-open Continuous Absence when the
| trainee has a REAL biometric departure punch accepted inside that Weekend's
| configured departure window.
|
| Important:
| - Merely being selected for Long Weekend does NOT close Continuous Absence.
| - Leave-authorized Weekend departure rows do NOT count here because Leave
|   itself is the administrative interruption.
| - The accepted first in-window punch remains authoritative even if the
|   trainee later punches again after the departure window.
|
| The returned events are intentionally small and identity-based so the
| Continuous Absence model can transactionally close the matching OPEN episode.
|--------------------------------------------------------------------------
*/

async function getLongWeekendBiometricClosureEvents() {
  const weekends =
    await safeLoad(
      "Long Weekend closure events",
      () => getWeekends()
    );

  const events =
    [];

  const seen =
    new Set();

  for (const weekend of weekends || []) {
    const weekendEnd =
      weekend?.end_datetime ||
      null;

    for (
      const trainee
      of weekend?.departure_present_trainees || []
    ) {
      const traineeId =
        Number(
          trainee?.trainee_id ??
          trainee?.id
        );

      const punchTime =
        trainee?.punch_time ||
        null;

      const transactionId =
        Number(
          trainee?.transaction_id
        ) || null;

      if (
        !Number.isInteger(
          traineeId
        ) ||
        traineeId <= 0 ||
        !punchTime
      ) {
        continue;
      }

      const key =
        `${traineeId}:` +
        `${transactionId || ""}:` +
        `${String(
          punchTime
        )}`;

      if (
        seen.has(
          key
        )
      ) {
        continue;
      }

      seen.add(
        key
      );

      events.push({
        subject_type:
          "TRAINEE",

        subject_id:
          traineeId,

        event_type:
          "LONG_WEEKEND_BIOMETRIC",

        closure_at:
          punchTime,

        coverage_end:
          weekendEnd,

        transaction_id:
          transactionId,
      });
    }
  }

  return events;
}

/**
 * Returns the Portal identities that are currently in a sanctioned operational
 * state and therefore must NOT be presented as a live OPEN Continuous Absence.
 *
 * Medical Rest is intentionally excluded because PTS business rules treat it
 * as operational information, not as a biometric attendance exemption.
 */
async function getCurrentOperationalProtectionKeys({ subjectType = null } = {}) {
  const requestedType = normalize(subjectType);
  const { date, dateTime } = ptsNowParts();
  const nowValue = wallClockValue(dateTime);
  const protectedKeys = new Set();

  const includeTrainee = !requestedType || requestedType === "TRAINEE";
  const includeStaff = !requestedType || requestedType === "STAFF";

  const tasks = [];

  if (includeTrainee) {
    tasks.push(
      safeLoad("trainee leaves", () =>
        getLeaves({
          subjectType: "TRAINEE",
          dateFrom: date,
          dateTo: date,
        }),
      ).then((rows) => ({ type: "TRAINEE_LEAVE", rows })),

      safeLoad("trainee OSD", () =>
        getOsdRecords({
          subjectType: "TRAINEE",
          dateFrom: date,
          dateTo: date,
        }),
      ).then((rows) => ({ type: "TRAINEE_OSD", rows })),

      safeLoad("trainee Home Rest", () =>
        getOutdoorRecords({
          subjectType: "TRAINEE",
          dateFrom: date,
          dateTo: date,
          homeRestOnly: true,
        }),
      ).then((rows) => ({ type: "TRAINEE_HOME_REST", rows })),

      safeLoad("Long Weekend", () => getWeekends()).then((rows) => ({
        type: "LONG_WEEKEND",
        rows,
      })),
    );
  }

  if (includeStaff) {
    tasks.push(
      safeLoad("staff leaves", () =>
        getLeaves({
          subjectType: "STAFF",
          dateFrom: date,
          dateTo: date,
        }),
      ).then((rows) => ({ type: "STAFF_LEAVE", rows })),

      safeLoad("staff OSD", () =>
        getOsdRecords({
          subjectType: "STAFF",
          dateFrom: date,
          dateTo: date,
        }),
      ).then((rows) => ({ type: "STAFF_OSD", rows })),

      safeLoad("staff Home Rest", () =>
        getOutdoorRecords({
          subjectType: "STAFF",
          dateFrom: date,
          dateTo: date,
          homeRestOnly: true,
        }),
      ).then((rows) => ({ type: "STAFF_HOME_REST", rows })),
    );
  }

  const loaded = await Promise.all(tasks);

  for (const item of loaded) {
    const rows = item.rows || [];

    if (item.type.endsWith("_LEAVE")) {
      for (const row of rows) {
        if (
          ["APPROVED", "COMPLETED"].includes(normalize(row.workflow_status)) &&
          truthy(row.biometric_exempt) &&
          activeAt(row, "start_datetime", "end_datetime", nowValue)
        ) {
          addProtection(
            protectedKeys,
            item.type.startsWith("TRAINEE") ? "TRAINEE" : "STAFF",
            row.subject_id ?? row.trainee_id ?? row.staff_id,
          );
        }
      }
      continue;
    }

    if (item.type.endsWith("_OSD")) {
      for (const row of rows) {
        if (
          ["APPROVED", "COMPLETED"].includes(normalize(row.workflow_status)) &&
          ["OSD", "SHORT_PERMISSION"].includes(normalize(row.record_type)) &&
          truthy(row.biometric_exempt) &&
          activeAt(row, "start_datetime", "end_datetime", nowValue)
        ) {
          addProtection(
            protectedKeys,
            item.type.startsWith("TRAINEE") ? "TRAINEE" : "STAFF",
            row.subject_id ?? row.trainee_id ?? row.staff_id,
          );
        }
      }
      continue;
    }

    if (item.type.endsWith("_HOME_REST")) {
      for (const row of rows) {
        if (
          !["CANCELLED", "REJECTED"].includes(normalize(row.workflow_status)) &&
          truthy(row.home_rest) &&
          activeAt(
            row,
            "home_rest_start_datetime",
            "home_rest_end_datetime",
            nowValue,
          )
        ) {
          addProtection(
            protectedKeys,
            item.type.startsWith("TRAINEE") ? "TRAINEE" : "STAFF",
            row.subject_id ?? row.trainee_id ?? row.staff_id,
          );
        }
      }
      continue;
    }

    if (item.type === "LONG_WEEKEND") {
      const activeWeekends = rows.filter(
        (weekend) =>
          truthy(weekend.is_active) &&
          activeAt(weekend, "start_datetime", "end_datetime", nowValue),
      );

      /* Direct current Long Weekend authority. */
      for (const weekend of activeWeekends) {
        const detained = weekendDetainedIds(weekend);
        const validIds = weekendValidIds(weekend);

        for (const traineeId of validIds) {
          if (!detained.has(traineeId)) {
            addProtection(protectedKeys, "TRAINEE", traineeId);
          }
        }
      }

      /*
       * Earlier Individual Weekend -> broader overlapping Weekend bridge.
       *
       * A trainee released earlier through an explicitly assigned individual
       * Weekend must not become OPEN absence merely because the broader
       * All-Trainees/Course Weekend started later and does not require a
       * second departure punch. This mirrors the Dashboard inheritance rule
       * so Dashboard and Continuous Absence share the same protection set.
       */
      for (const target of activeWeekends) {
        const targetStart = wallClockValue(target?.start_datetime);
        if (targetStart === null) continue;

        const targetDetained = weekendDetainedIds(target);

        for (const source of rows) {
          if (
            !truthy(source?.is_active) ||
            String(source?.id ?? "") === String(target?.id ?? "")
          ) {
            continue;
          }

          const sourceStart = wallClockValue(source?.start_datetime);
          const sourceEnd = wallClockValue(source?.end_datetime);

          if (
            sourceStart === null ||
            sourceEnd === null ||
            sourceStart > targetStart ||
            sourceEnd < targetStart
          ) {
            continue;
          }

          const explicitSourceIds = weekendExplicitIds(source);
          const validSourceIds = weekendValidIds(source);

          for (const traineeId of validSourceIds) {
            if (
              !explicitSourceIds.has(traineeId) ||
              targetDetained.has(traineeId)
            ) {
              continue;
            }

            const courseId =
              weekendTraineeCourseId(source, traineeId) ||
              weekendTraineeCourseId(target, traineeId);

            if (
              weekendTargetScopeIncludesTrainee(
                target,
                traineeId,
                courseId,
              )
            ) {
              addProtection(protectedKeys, "TRAINEE", traineeId);
            }
          }
        }
      }

    }
  }

  if (includeStaff) {
    const [shiftDutyIds, customRestRows, dutyRestIds] = await Promise.all([
      getShiftDutyStaffIdsForDate(date).catch((error) => {
        console.error(
          "[OPERATIONAL STATUS] Shift Duty lookup failed:",
          error.message,
        );
        return new Set();
      }),
      getCustomShiftDutyRestMembershipsForDate(date).catch((error) => {
        console.error(
          "[OPERATIONAL STATUS] Custom Shift Duty Rest lookup failed:",
          error.message,
        );
        return [];
      }),
      getActiveStaffDutyRestIds(dateTime),
    ]);

    const dutyIds = shiftDutyIds instanceof Set ? shiftDutyIds : new Set();

    for (const row of customRestRows || []) {
      const staffId = Number(row.staff_id);
      if (Number.isInteger(staffId) && staffId > 0 && !dutyIds.has(staffId)) {
        addProtection(protectedKeys, "STAFF", staffId);
      }
    }

    for (const staffId of dutyRestIds) {
      if (!dutyIds.has(staffId)) {
        addProtection(protectedKeys, "STAFF", staffId);
      }
    }
  }

  return protectedKeys;
}

module.exports = {
  ptsNowParts,
  getCurrentOperationalProtectionKeys,
  getLongWeekendBiometricClosureEvents,
};
