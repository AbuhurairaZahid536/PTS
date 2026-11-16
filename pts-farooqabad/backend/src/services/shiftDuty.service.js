const {
  pool,
} = require("../config/db");

/*
|--------------------------------------------------------------------------
| SHIFT DUTY COMMON SERVICE
|--------------------------------------------------------------------------
|
| One source of truth for staff who are working outside the regular Staff
| Timetable:
|
| 1) SECURITY_ROSTER = existing daily 1st / 2nd / 3rd Duty Roster.
| 2) CUSTOM_SHIFT    = date-range based custom groups such as Telephone
|                      Exchange / Dispensary / Control Room.
|
| The Attendance Engine and Dashboard can use this service so a staff member
| is never counted as regular-timetable ABSENT while actually assigned to a
| shift duty.
|--------------------------------------------------------------------------
*/

function pad(value) {
  return String(value).padStart(2, "0");
}

function cleanText(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const text = String(value).trim();
  return text || null;
}

function dateOnly(value) {
  if (!value) return null;

  if (value instanceof Date) {
    return [
      value.getFullYear(),
      "-",
      pad(value.getMonth() + 1),
      "-",
      pad(value.getDate()),
    ].join("");
  }

  const text = String(value).trim();
  const match = text.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

function validDate(value) {
  const date = dateOnly(value);
  return date && /^\d{4}-\d{2}-\d{2}$/.test(date)
    ? date
    : null;
}

function timeOnly(value) {
  if (value === undefined || value === null) return null;

  const text = String(value).trim();
  const match = text.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);

  if (!match) return null;

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3] || 0);

  if (
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59 ||
    second < 0 ||
    second > 59
  ) {
    return null;
  }

  return `${pad(hour)}:${pad(minute)}:${pad(second)}`;
}

function dateToOrdinal(value) {
  const date = validDate(value);
  if (!date) return null;

  const [year, month, day] = date.split("-").map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / 86400000);
}

function ordinalToDate(value) {
  const date = new Date(Number(value) * 86400000);
  return [
    date.getUTCFullYear(),
    "-",
    pad(date.getUTCMonth() + 1),
    "-",
    pad(date.getUTCDate()),
  ].join("");
}

function addDays(value, days) {
  const ordinal = dateToOrdinal(value);
  return ordinal === null
    ? null
    : ordinalToDate(ordinal + Number(days || 0));
}


function normalizeScheduleType(value) {
  const type = String(value || "DAILY").trim().toUpperCase();
  return ["DAILY", "WEEKDAYS", "SELECTED_DATES"].includes(type)
    ? type
    : "DAILY";
}

function parseWeekdays(value) {
  const raw = Array.isArray(value)
    ? value
    : String(value || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);

  return Array.from(
    new Set(
      raw
        .map(Number)
        .filter((day) => Number.isInteger(day) && day >= 1 && day <= 7)
    )
  ).sort((a, b) => a - b);
}

function isoWeekday(value) {
  const date = validDate(value);
  if (!date) return null;

  const [year, month, day] = date.split("-").map(Number);
  const jsDay = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return jsDay === 0 ? 7 : jsDay;
}

function normalizeDateOverrides(value) {
  const rows = Array.isArray(value) ? value : [];
  const map = new Map();

  rows.forEach((item) => {
    const date = validDate(item?.duty_date || item?.date);
    const dayType = String(item?.day_type || item?.type || "")
      .trim()
      .toUpperCase();

    if (date && ["DUTY", "REST"].includes(dayType)) {
      map.set(date, dayType);
    }
  });

  return map;
}

function assignmentDutyOnDate(assignment, attendanceDate) {
  const date = validDate(attendanceDate);
  const from = validDate(assignment?.effective_from);
  const to = validDate(assignment?.effective_to);

  if (!date || !from || !to || date < from || date > to) {
    return false;
  }

  const overrides = normalizeDateOverrides(assignment?.date_overrides);
  const explicit = overrides.get(date);

  if (explicit) {
    return explicit === "DUTY";
  }

  const scheduleType = normalizeScheduleType(assignment?.schedule_type);

  if (scheduleType === "DAILY") {
    return true;
  }

  if (scheduleType === "WEEKDAYS") {
    const weekday = isoWeekday(date);
    return parseWeekdays(
      assignment?.weekdays ?? assignment?.weekdays_csv
    ).includes(weekday);
  }

  /* SELECTED_DATES has no implicit duty days; explicit DUTY dates drive it. */
  return false;
}

function buildCandidateDateOverrides({ dutyDates = [], restDates = [] } = {}) {
  const rows = [];

  (Array.isArray(dutyDates) ? dutyDates : []).forEach((date) => {
    const normalized = validDate(date);
    if (normalized) rows.push({ duty_date: normalized, day_type: "DUTY" });
  });

  (Array.isArray(restDates) ? restDates : []).forEach((date) => {
    const normalized = validDate(date);
    if (normalized) rows.push({ duty_date: normalized, day_type: "REST" });
  });

  return rows;
}

function schedulesCanOverlap({
  candidate,
  candidateStart,
  candidateEnd,
  existing,
  existingStart,
  existingEnd,
}) {
  const candidateFrom = validDate(candidate?.effective_from);
  const candidateTo = validDate(candidate?.effective_to);

  if (!candidateFrom || !candidateTo) return false;

  let date = candidateFrom;
  let guard = 0;

  while (date && date <= candidateTo && guard < 20000) {
    if (assignmentDutyOnDate(candidate, date)) {
      for (const offset of [-1, 0, 1]) {
        const existingDate = addDays(date, offset);

        if (
          existingDate &&
          assignmentDutyOnDate(existing, existingDate) &&
          timeIntervalsOverlap(
            candidateStart,
            candidateEnd,
            existingStart,
            existingEnd,
            offset
          )
        ) {
          return true;
        }
      }
    }

    date = addDays(date, 1);
    guard += 1;
  }

  return false;
}

function timeToMinutes(value) {
  const time = timeOnly(value);
  if (!time) return null;

  const [hour, minute, second] = time.split(":").map(Number);
  return hour * 60 + minute + second / 60;
}

function rangesIntersect(fromA, toA, fromB, toB) {
  const a1 = dateToOrdinal(fromA);
  const a2 = dateToOrdinal(toA);
  const b1 = dateToOrdinal(fromB);
  const b2 = dateToOrdinal(toB);

  if ([a1, a2, b1, b2].some((value) => value === null)) {
    return false;
  }

  return Math.max(a1, b1) <= Math.min(a2, b2);
}

/*
| Compare two repeating daily shift intervals without enumerating every date.
| Offset represents the existing shift occurrence date relative to candidate.
| A shift can cross midnight, therefore only -1 / 0 / +1 day can intersect.
*/
function timeIntervalsOverlap(
  candidateStart,
  candidateEnd,
  existingStart,
  existingEnd,
  existingDayOffset = 0
) {
  const cStart = timeToMinutes(candidateStart);
  let cEnd = timeToMinutes(candidateEnd);
  let eStart = timeToMinutes(existingStart);
  let eEnd = timeToMinutes(existingEnd);

  if ([cStart, cEnd, eStart, eEnd].some((value) => value === null)) {
    return false;
  }

  if (cEnd <= cStart) cEnd += 1440;
  if (eEnd <= eStart) eEnd += 1440;

  eStart += existingDayOffset * 1440;
  eEnd += existingDayOffset * 1440;

  /* Adjacent shifts that touch exactly at the boundary are not overlapping. */
  return Math.max(cStart, eStart) < Math.min(cEnd, eEnd);
}

function recurringRangesCanOverlap({
  candidateFrom,
  candidateTo,
  candidateStart,
  candidateEnd,
  existingFrom,
  existingTo,
  existingStart,
  existingEnd,
}) {
  for (const offset of [-1, 0, 1]) {
    /*
    | existingDate = candidateDate + offset
    | therefore candidateDate must fall inside existing range shifted back.
    */
    const shiftedExistingFrom = addDays(existingFrom, -offset);
    const shiftedExistingTo = addDays(existingTo, -offset);

    if (
      rangesIntersect(
        candidateFrom,
        candidateTo,
        shiftedExistingFrom,
        shiftedExistingTo
      ) &&
      timeIntervalsOverlap(
        candidateStart,
        candidateEnd,
        existingStart,
        existingEnd,
        offset
      )
    ) {
      return true;
    }
  }

  return false;
}

function sqlDateTime(date, time, dayOffset = 0) {
  const normalizedDate = addDays(date, dayOffset);
  const normalizedTime = timeOnly(time);

  return normalizedDate && normalizedTime
    ? `${normalizedDate} ${normalizedTime}`
    : null;
}

function buildShiftOccurrence(row, attendanceDate) {
  const date = validDate(attendanceDate);

  if (!date) {
    throw new Error("Valid attendance date is required.");
  }

  const startTime = timeOnly(row.start_time);
  const endTime = timeOnly(row.end_time);
  const startPunchFrom = timeOnly(row.start_punch_from);
  const startPunchTo = timeOnly(row.start_punch_to);
  const endPunchFrom = timeOnly(row.end_punch_from);
  const endPunchTo = timeOnly(row.end_punch_to);

  if (
    !startTime ||
    !endTime ||
    !startPunchFrom ||
    !startPunchTo ||
    !endPunchFrom ||
    !endPunchTo
  ) {
    throw new Error("Shift timing configuration is incomplete.");
  }

  const crossesMidnight = endTime <= startTime;
  const endDayOffset = crossesMidnight ? 1 : 0;

  const startWindowToOffset =
    startPunchTo < startPunchFrom
      ? 1
      : 0;

  /* End punch window is anchored on shift end day. */
  const endWindowFromOffset = endDayOffset;
  const endWindowToOffset =
    endDayOffset +
    (endPunchTo < endPunchFrom ? 1 : 0);

  return {
    ...row,
    attendance_date: date,
    shift_start_datetime: sqlDateTime(date, startTime, 0),
    shift_end_datetime: sqlDateTime(date, endTime, endDayOffset),
    start_window_from: sqlDateTime(date, startPunchFrom, 0),
    start_window_to: sqlDateTime(date, startPunchTo, startWindowToOffset),
    end_window_from: sqlDateTime(date, endPunchFrom, endWindowFromOffset),
    end_window_to: sqlDateTime(date, endPunchTo, endWindowToOffset),
  };
}

/*
| A daily Security Duty Roster is an operational day: its post-midnight
| THIRD shift belongs to the following calendar morning. Custom Shift
| groups keep their independently configured calendar-day semantics.
*/
function securityRosterDayOffset(row) {
  const key = String(row?.shift_key || "").trim().toUpperCase();
  const start = timeToMinutes(row?.start_time);
  return key === "THIRD" && start !== null && start < 12 * 60 ? 1 : 0;
}

/*
| Resolve a biometric window relative to the actual shift start/end,
| rather than blindly attaching both times to the roster date. This
| handles 23:00-00:00 around the third-shift start AND around a second-
| shift midnight checkout, without changing any configured clock time.
*/
function rosterPunchWindow(anchorDate, anchorTime, fromTime, toTime) {
  const anchorDay = dateToOrdinal(anchorDate);
  const anchorMinute = timeToMinutes(anchorTime);
  const fromMinute = timeToMinutes(fromTime);
  const toMinute = timeToMinutes(toTime);

  if ([anchorDay, anchorMinute, fromMinute, toMinute].some((n) => n === null)) {
    throw new Error("Security roster biometric window is incomplete.");
  }

  const wraps = toMinute < fromMinute;
  const anchor = anchorDay * 1440 + anchorMinute;
  let selected = null;

  for (const offset of [-1, 0, 1]) {
    const fromDay = anchorDay + offset;
    const toDay = fromDay + (wraps ? 1 : 0);
    const from = fromDay * 1440 + fromMinute;
    const to = toDay * 1440 + toMinute;
    const distance = anchor < from ? from - anchor : anchor > to ? anchor - to : 0;
    const centerDistance = Math.abs((from + to) / 2 - anchor);

    if (!selected || distance < selected.distance ||
        (distance === selected.distance && centerDistance < selected.centerDistance)) {
      selected = { fromDay, toDay, distance, centerDistance };
    }
  }

  return {
    from: sqlDateTime(ordinalToDate(selected.fromDay), fromTime),
    to: sqlDateTime(ordinalToDate(selected.toDay), toTime),
  };
}

function buildSecurityRosterOccurrence(row, rosterDate) {
  const date = validDate(rosterDate);
  const startTime = timeOnly(row?.start_time);
  const endTime = timeOnly(row?.end_time);
  const startFrom = timeOnly(row?.start_punch_from);
  const startTo = timeOnly(row?.start_punch_to);
  const endFrom = timeOnly(row?.end_punch_from);
  const endTo = timeOnly(row?.end_punch_to);

  if (!date || !startTime || !endTime || !startFrom || !startTo || !endFrom || !endTo) {
    throw new Error("Security roster shift timing configuration is incomplete.");
  }

  const startDate = addDays(date, securityRosterDayOffset(row));
  const endDate = addDays(startDate, endTime <= startTime ? 1 : 0);
  const arrival = rosterPunchWindow(startDate, startTime, startFrom, startTo);
  const departure = rosterPunchWindow(endDate, endTime, endFrom, endTo);

  return {
    ...row,
    attendance_date: date,
    shift_start_datetime: sqlDateTime(startDate, startTime),
    shift_end_datetime: sqlDateTime(endDate, endTime),
    start_window_from: arrival.from,
    start_window_to: arrival.to,
    end_window_from: departure.from,
    end_window_to: departure.to,
  };
}

async function getSecurityShiftAssignmentsForDate(
  attendanceDate,
  connection = pool
) {
  const date = validDate(attendanceDate);

  if (!date) {
    throw new Error("Valid attendance date is required.");
  }

  const [rows] = await connection.query(
    `
      SELECT
        'SECURITY_ROSTER' AS source_type,
        dr.id AS source_group_id,
        dr.title AS source_group_name,
        dr.roster_date,
        dr.reference_no,

        drs.id AS shift_id,
        drs.shift_key,
        drs.shift_name,
        drs.start_time,
        drs.end_time,
        drs.start_punch_from,
        drs.start_punch_to,
        drs.end_punch_from,
        drs.end_punch_to,

        drp.id AS duty_point_id,
        drp.duty_point_name,

        dra.id AS assignment_id,
        dra.subject_id AS staff_id,
        dra.weapon,

        s.employee_id,
        s.belt_no,
        CONCAT_WS(' ', s.first_name, s.last_name) AS staff_name,
        sc.id AS category_id,
        sc.category_name,
        sb.id AS branch_id,
        sb.branch_name

      FROM duty_rosters dr

      JOIN duty_roster_shifts drs
        ON drs.roster_id = dr.id

      JOIN duty_roster_points drp
        ON drp.shift_id = drs.id

      JOIN duty_roster_assignments dra
        ON dra.duty_point_id = drp.id
       AND dra.subject_type = 'STAFF'

      JOIN staff s
        ON s.id = dra.subject_id
       AND s.is_deleted = 0

      LEFT JOIN staff_categories sc
        ON sc.id = s.category_id

      LEFT JOIN staff_branches sb
        ON sb.id = s.branch_id

      WHERE
        dr.roster_status = 'ACTIVE'
        AND dr.roster_date = ?

      ORDER BY
        FIELD(drs.shift_key, 'FIRST', 'SECOND', 'THIRD'),
        drp.sort_order,
        dra.sort_order,
        dra.id
    `,
    [date]
  );

  return (rows || []).map((row) =>
    buildSecurityRosterOccurrence(row, date)
  );
}

async function getCustomShiftMembershipsForDate(
  attendanceDate,
  connection = pool
) {
  const date = validDate(attendanceDate);

  if (!date) {
    throw new Error("Valid attendance date is required.");
  }

  let rows = [];

  try {
    const [queryRows] = await connection.query(
      `
      SELECT
        'CUSTOM_SHIFT' AS source_type,
        csg.id AS source_group_id,
        csg.group_name AS source_group_name,
        csg.start_date AS group_start_date,
        csg.end_date AS group_end_date,
        csg.description AS group_description,

        csd.id AS shift_id,
        NULL AS shift_key,
        csd.shift_name,
        csd.start_time,
        csd.end_time,
        csd.start_punch_from,
        csd.start_punch_to,
        csd.end_punch_from,
        csd.end_punch_to,
        csd.duty_point_name,
        csd.sort_order AS shift_sort_order,

        csa.id AS assignment_id,
        csa.staff_id,
        csa.effective_from,
        csa.effective_to,
        csa.schedule_type,
        csa.weekdays_csv,

        s.employee_id,
        s.belt_no,
        CONCAT_WS(' ', s.first_name, s.last_name) AS staff_name,
        sc.id AS category_id,
        sc.category_name,
        sb.id AS branch_id,
        sb.branch_name

      FROM custom_shift_groups csg

      JOIN custom_shift_definitions csd
        ON csd.group_id = csg.id

      JOIN custom_shift_assignments csa
        ON csa.group_id = csg.id
       AND csa.shift_id = csd.id

      JOIN staff s
        ON s.id = csa.staff_id
       AND s.is_deleted = 0

      LEFT JOIN staff_categories sc
        ON sc.id = s.category_id

      LEFT JOIN staff_branches sb
        ON sb.id = s.branch_id

      WHERE
        csg.is_active = 1
        AND ? BETWEEN csg.start_date AND csg.end_date
        AND ? BETWEEN csa.effective_from AND csa.effective_to

      ORDER BY
        csg.group_name,
        csd.sort_order,
        csd.id,
        csa.id
    `,
      [date, date]
    );

    rows = queryRows || [];
  } catch (error) {
    if (
      error?.code === "ER_NO_SUCH_TABLE" ||
      Number(error?.errno) === 1146
    ) {
      return [];
    }

    throw error;
  }

  if (!rows.length) return [];

  const assignmentIds = Array.from(
    new Set(
      rows
        .map((row) => Number(row.assignment_id))
        .filter((id) => Number.isInteger(id) && id > 0)
    )
  );

  const overrideByAssignment = new Map();

  if (assignmentIds.length) {
    try {
      const [overrideRows] = await connection.query(
        `
          SELECT assignment_id, duty_date, day_type
          FROM custom_shift_assignment_dates
          WHERE assignment_id IN (?)
            AND duty_date = ?
        `,
        [assignmentIds, date]
      );

      (overrideRows || []).forEach((row) => {
        overrideByAssignment.set(Number(row.assignment_id), {
          duty_date: dateOnly(row.duty_date),
          day_type: String(row.day_type || "").toUpperCase(),
        });
      });
    } catch (error) {
      if (
        error?.code !== "ER_NO_SUCH_TABLE" &&
        Number(error?.errno) !== 1146
      ) {
        throw error;
      }
    }
  }

  return rows.map((row) => {
    const override = overrideByAssignment.get(Number(row.assignment_id));
    const normalized = {
      ...row,
      schedule_type: normalizeScheduleType(row.schedule_type),
      weekdays: parseWeekdays(row.weekdays_csv),
      date_overrides: override ? [override] : [],
    };

    return {
      ...normalized,
      schedule_state: assignmentDutyOnDate(normalized, date) ? "DUTY" : "REST",
    };
  });
}

async function getCustomShiftAssignmentsForDate(
  attendanceDate,
  connection = pool
) {
  const date = validDate(attendanceDate);
  const memberships = await getCustomShiftMembershipsForDate(date, connection);

  return memberships
    .filter((row) => row.schedule_state === "DUTY")
    .map((row) => buildShiftOccurrence(row, date));
}

async function getCustomShiftDutyRestMembershipsForDate(
  attendanceDate,
  connection = pool
) {
  const date = validDate(attendanceDate);
  const memberships = await getCustomShiftMembershipsForDate(date, connection);

  return memberships.filter((row) => row.schedule_state === "REST");
}

async function getCustomShiftMembershipStaffIdsForDate(
  attendanceDate,
  connection = pool
) {
  const rows = await getCustomShiftMembershipsForDate(attendanceDate, connection);

  return new Set(
    rows
      .map((row) => Number(row.staff_id))
      .filter((value) => Number.isInteger(value) && value > 0)
  );
}

async function getStaffShiftAssignmentsForDate(
  attendanceDate,
  connection = pool
) {
  const [securityRows, customRows] = await Promise.all([
    getSecurityShiftAssignmentsForDate(attendanceDate, connection),
    getCustomShiftAssignmentsForDate(attendanceDate, connection),
  ]);

  return [...securityRows, ...customRows];
}

async function getShiftDutyStaffIdsForDate(
  attendanceDate,
  connection = pool
) {
  const rows = await getStaffShiftAssignmentsForDate(
    attendanceDate,
    connection
  );

  return new Set(
    rows
      .map((row) => Number(row.staff_id))
      .filter((value) => Number.isInteger(value) && value > 0)
  );
}

async function getShiftControlledStaffIdsForDate(
  attendanceDate,
  connection = pool
) {
  const [securityRows, customMemberIds] = await Promise.all([
    getSecurityShiftAssignmentsForDate(attendanceDate, connection),
    getCustomShiftMembershipStaffIdsForDate(attendanceDate, connection),
  ]);

  const ids = new Set(customMemberIds instanceof Set ? [...customMemberIds] : []);

  (securityRows || []).forEach((row) => {
    const id = Number(row.staff_id);
    if (Number.isInteger(id) && id > 0) ids.add(id);
  });

  return ids;
}

async function getApprovedStaffShiftExemption({
  staffId,
  startDatetime,
  endDatetime,
  connection = pool,
}) {
  const normalizedStaffId = Number(staffId);

  if (!Number.isInteger(normalizedStaffId) || normalizedStaffId < 1) {
    return null;
  }

  if (!startDatetime || !endDatetime) {
    return null;
  }

  /*
  | Approved Leave takes precedence over OSD only for deterministic display.
  | Both are valid exemptions from Shift Duty attendance.
  */
  const [leaveRows] = await connection.query(
    `
      SELECT
        id,
        leave_category,
        leave_type,
        start_datetime,
        end_datetime
      FROM staff_leaves
      WHERE
        staff_id = ?
        AND workflow_status = 'APPROVED'
        AND start_datetime <= ?
        AND end_datetime >= ?
      ORDER BY start_datetime ASC, id ASC
      LIMIT 1
    `,
    [normalizedStaffId, endDatetime, startDatetime]
  );

  if (leaveRows?.length) {
    const row = leaveRows[0];
    const label = [row.leave_category, row.leave_type]
      .map(cleanText)
      .filter(Boolean)
      .join(" - ");

    return {
      type: "LEAVE",
      id: Number(row.id),
      description: label || "Approved Leave",
      start_datetime: row.start_datetime,
      end_datetime: row.end_datetime,
    };
  }

  const [osdRows] = await connection.query(
    `
      SELECT
        id,
        record_type,
        reason,
        start_datetime,
        end_datetime
      FROM staff_osd
      WHERE
        staff_id = ?
        AND workflow_status = 'APPROVED'
        AND start_datetime <= ?
        AND end_datetime >= ?
      ORDER BY start_datetime ASC, id ASC
      LIMIT 1
    `,
    [normalizedStaffId, endDatetime, startDatetime]
  );

  if (osdRows?.length) {
    const row = osdRows[0];
    const type =
      String(row.record_type || "").toUpperCase() === "SHORT_PERMISSION"
        ? "SHORT_PERMISSION"
        : "OSD";

    return {
      type,
      id: Number(row.id),
      description: cleanText(row.reason) || type,
      start_datetime: row.start_datetime,
      end_datetime: row.end_datetime,
    };
  }

  return null;
}

async function getPotentialStaffShiftConflicts(
  staffId,
  startDate,
  endDate,
  connection = pool
) {
  const from = validDate(startDate);
  const to = validDate(endDate);
  const normalizedStaffId = Number(staffId);

  if (
    !from ||
    !to ||
    !Number.isInteger(normalizedStaffId) ||
    normalizedStaffId < 1
  ) {
    return [];
  }

  const expandedFrom = addDays(from, -1);
  const expandedTo = addDays(to, 1);

  const [securityRows] = await connection.query(
    `
      SELECT
        'SECURITY_ROSTER' AS source_type,
        dr.id AS source_group_id,
        dr.title AS source_group_name,
        dr.roster_date AS effective_from,
        dr.roster_date AS effective_to,
        drs.id AS shift_id,
        drs.shift_key,
        drs.shift_name,
        drs.start_time,
        drs.end_time,
        dra.id AS assignment_id
      FROM duty_rosters dr
      JOIN duty_roster_shifts drs
        ON drs.roster_id = dr.id
      JOIN duty_roster_assignments dra
        ON dra.shift_id = drs.id
       AND dra.subject_type = 'STAFF'
      WHERE
        dr.roster_status = 'ACTIVE'
        AND dra.subject_id = ?
        AND dr.roster_date BETWEEN ? AND ?
    `,
    [normalizedStaffId, expandedFrom, expandedTo]
  );

  let customRows = [];

  try {
    const [queryRows] = await connection.query(
    `
      SELECT
        'CUSTOM_SHIFT' AS source_type,
        csg.id AS source_group_id,
        csg.group_name AS source_group_name,
        GREATEST(csg.start_date, csa.effective_from) AS effective_from,
        LEAST(csg.end_date, csa.effective_to) AS effective_to,
        csd.id AS shift_id,
        csd.shift_name,
        csd.start_time,
        csd.end_time,
        csa.id AS assignment_id,
        csa.schedule_type,
        csa.weekdays_csv
      FROM custom_shift_groups csg
      JOIN custom_shift_definitions csd
        ON csd.group_id = csg.id
      JOIN custom_shift_assignments csa
        ON csa.group_id = csg.id
       AND csa.shift_id = csd.id
      WHERE
        csg.is_active = 1
        AND csa.staff_id = ?
        AND GREATEST(csg.start_date, csa.effective_from) <= ?
        AND LEAST(csg.end_date, csa.effective_to) >= ?
    `,
      [normalizedStaffId, expandedTo, expandedFrom]
    );

    customRows = queryRows || [];
  } catch (error) {
    if (
      error?.code !== "ER_NO_SUCH_TABLE" &&
      Number(error?.errno) !== 1146
    ) {
      throw error;
    }
  }

  const customAssignmentIds = Array.from(
    new Set(
      (customRows || [])
        .map((row) => Number(row.assignment_id))
        .filter((id) => Number.isInteger(id) && id > 0)
    )
  );

  if (customAssignmentIds.length) {
    try {
      const [dateRows] = await connection.query(
        `
          SELECT assignment_id, duty_date, day_type
          FROM custom_shift_assignment_dates
          WHERE assignment_id IN (?)
            AND duty_date BETWEEN ? AND ?
        `,
        [customAssignmentIds, expandedFrom, expandedTo]
      );

      const byAssignment = new Map();

      (dateRows || []).forEach((row) => {
        const assignmentId = Number(row.assignment_id);
        if (!byAssignment.has(assignmentId)) byAssignment.set(assignmentId, []);
        byAssignment.get(assignmentId).push({
          duty_date: dateOnly(row.duty_date),
          day_type: String(row.day_type || "").toUpperCase(),
        });
      });

      customRows = (customRows || []).map((row) => ({
        ...row,
        schedule_type: normalizeScheduleType(row.schedule_type),
        weekdays: parseWeekdays(row.weekdays_csv),
        date_overrides: byAssignment.get(Number(row.assignment_id)) || [],
      }));
    } catch (error) {
      if (
        error?.code !== "ER_NO_SUCH_TABLE" &&
        Number(error?.errno) !== 1146
      ) {
        throw error;
      }
    }
  }

  return [...(securityRows || []), ...(customRows || [])];
}

async function findStaffShiftOverlap({
  staffId,
  startDate,
  endDate,
  startTime,
  endTime,
  candidateShiftKey = null,
  excludeSecurityRosterId = null,
  excludeCustomGroupId = null,
  excludeCustomAssignmentId = null,
  scheduleType = "DAILY",
  weekdays = [],
  dutyDates = [],
  restDates = [],
  connection = pool,
}) {
  const from = validDate(startDate);
  const to = validDate(endDate);
  const start = timeOnly(startTime);
  const end = timeOnly(endTime);

  if (!from || !to || !start || !end) {
    throw new Error("Valid shift date range and start/end time are required.");
  }

  // A post-midnight Security THIRD shift occurs on rosterDate + 1.
  // Custom Shift recurrence remains anchored to its own effective date.
  const candidateOffset = securityRosterDayOffset({
    shift_key: candidateShiftKey,
    start_time: start,
  });
  const actualFrom = addDays(from, candidateOffset);
  const actualTo = addDays(to, candidateOffset);

  const rows = await getPotentialStaffShiftConflicts(
    staffId,
    actualFrom,
    actualTo,
    connection
  );

  for (const row of rows) {
    if (
      row.source_type === "SECURITY_ROSTER" &&
      excludeSecurityRosterId &&
      Number(row.source_group_id) === Number(excludeSecurityRosterId)
    ) {
      continue;
    }

    if (
      row.source_type === "CUSTOM_SHIFT" &&
      excludeCustomGroupId &&
      Number(row.source_group_id) === Number(excludeCustomGroupId)
    ) {
      /*
      | During a full custom-group update its old graph is replaced in one
      | transaction, so the caller may exclude the complete old group.
      */
      continue;
    }

    if (
      row.source_type === "CUSTOM_SHIFT" &&
      excludeCustomAssignmentId &&
      Number(row.assignment_id) === Number(excludeCustomAssignmentId)
    ) {
      continue;
    }

    const candidateSchedule = {
      effective_from: actualFrom,
      effective_to: actualTo,
      schedule_type: normalizeScheduleType(scheduleType),
      weekdays: parseWeekdays(weekdays),
      date_overrides: buildCandidateDateOverrides({ dutyDates, restDates }),
    };

    const existingSchedule = {
      effective_from: addDays(
        dateOnly(row.effective_from),
        row.source_type === "SECURITY_ROSTER" ? securityRosterDayOffset(row) : 0
      ),
      effective_to: addDays(
        dateOnly(row.effective_to),
        row.source_type === "SECURITY_ROSTER" ? securityRosterDayOffset(row) : 0
      ),
      schedule_type:
        row.source_type === "CUSTOM_SHIFT"
          ? normalizeScheduleType(row.schedule_type)
          : "DAILY",
      weekdays:
        row.source_type === "CUSTOM_SHIFT"
          ? parseWeekdays(row.weekdays ?? row.weekdays_csv)
          : [],
      date_overrides:
        row.source_type === "CUSTOM_SHIFT"
          ? row.date_overrides || []
          : [],
    };

    if (
      schedulesCanOverlap({
        candidate: candidateSchedule,
        candidateStart: start,
        candidateEnd: end,
        existing: existingSchedule,
        existingStart: row.start_time,
        existingEnd: row.end_time,
      })
    ) {
      return {
        source_type: row.source_type,
        source_group_id: Number(row.source_group_id),
        source_group_name: row.source_group_name || null,
        shift_id: Number(row.shift_id),
        shift_name: row.shift_name || null,
        assignment_id: Number(row.assignment_id),
        effective_from: dateOnly(row.effective_from),
        effective_to: dateOnly(row.effective_to),
        start_time: timeOnly(row.start_time),
        end_time: timeOnly(row.end_time),
      };
    }
  }

  return null;
}

module.exports = {
  validDate,
  timeOnly,
  addDays,
  buildShiftOccurrence,
  buildSecurityRosterOccurrence,
  securityRosterDayOffset,
  recurringRangesCanOverlap,

  getSecurityShiftAssignmentsForDate,
  getCustomShiftMembershipsForDate,
  getCustomShiftAssignmentsForDate,
  getCustomShiftDutyRestMembershipsForDate,
  getCustomShiftMembershipStaffIdsForDate,
  getStaffShiftAssignmentsForDate,
  getShiftDutyStaffIdsForDate,
  getShiftControlledStaffIdsForDate,
  assignmentDutyOnDate,

  getApprovedStaffShiftExemption,
  findStaffShiftOverlap,
};
