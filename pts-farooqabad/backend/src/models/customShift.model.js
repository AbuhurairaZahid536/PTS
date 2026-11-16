const {
  pool,
} = require("../config/db");

const {
  getExceptionData,
} = require("./attendance.model");

const {
  validDate,
  timeOnly,
  addDays,
  recurringRangesCanOverlap,
  assignmentDutyOnDate,
  getCustomShiftAssignmentsForDate,
  findStaffShiftOverlap,
} = require("../services/shiftDuty.service");


function cleanText(value) {
  if (
    value === undefined ||
    value === null
  ) {
    return null;
  }

  const text =
    String(value).trim();

  return text || null;
}


function asMillis(value) {
  if (!value) {
    return null;
  }

  const date =
    value instanceof Date
      ? value
      : new Date(value);

  const millis =
    date.getTime();

  return Number.isNaN(millis)
    ? null
    : millis;
}


function rangesOverlap(
  firstStart,
  firstEnd,
  secondStart,
  secondEnd
) {
  const aStart =
    asMillis(firstStart);
  const aEnd =
    asMillis(firstEnd);
  const bStart =
    asMillis(secondStart);
  const bEnd =
    asMillis(secondEnd);

  if (
    aStart === null ||
    aEnd === null ||
    bStart === null ||
    bEnd === null
  ) {
    return false;
  }

  return (
    aStart <= bEnd &&
    aEnd >= bStart
  );
}


/*
|--------------------------------------------------------------------------
| CUSTOM SHIFT EXEMPTION PRECEDENCE
|--------------------------------------------------------------------------
|
| Approved Leave / OSD / Short Permission / Home Rest can exempt a Staff
| member from a Shift assignment. Duty Rest is intentionally NOT checked
| here because Shift Duty has priority over Duty Rest.
|--------------------------------------------------------------------------
*/
function findCustomShiftExemption({
  staffId,
  shiftStart,
  shiftEnd,
  exceptionData,
}) {
  const id =
    Number(staffId);

  if (
    !Number.isInteger(id) ||
    id < 1
  ) {
    return null;
  }

  const pick = (
    rows,
    startField,
    endField,
    makeResult
  ) => {
    const record =
      (rows || []).find(
        (row) =>
          Number(row.subject_id) === id &&
          rangesOverlap(
            row[startField],
            row[endField],
            shiftStart,
            shiftEnd
          )
      );

    return record
      ? makeResult(record)
      : null;
  };

  return (
    pick(
      exceptionData?.leaves,
      "start_datetime",
      "end_datetime",
      (row) => ({
        type: "LEAVE",
        id: row.id,
        description:
          row.reason ||
          row.leave_type ||
          "Leave",
      })
    ) ||
    pick(
      exceptionData?.osd,
      "start_datetime",
      "end_datetime",
      (row) => ({
        type:
          row.record_type ===
          "SHORT_PERMISSION"
            ? "SHORT_PERMISSION"
            : "OSD",
        id: row.id,
        description:
          row.reason ||
          row.record_type ||
          "OSD",
      })
    ) ||
    pick(
      exceptionData?.homeRest,
      "home_rest_start",
      "home_rest_end",
      (row) => ({
        type: "HOME_REST",
        id: row.id,
        description:
          row.doctor_recommendation ||
          "Home Rest",
      })
    ) ||
    null
  );
}


function normalizeBoolean(
  value,
  fallback = true
) {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return fallback;
  }

  if (
    value === true ||
    value === 1 ||
    value === "1" ||
    String(value).toLowerCase() === "true"
  ) {
    return true;
  }

  if (
    value === false ||
    value === 0 ||
    value === "0" ||
    String(value).toLowerCase() === "false"
  ) {
    return false;
  }

  return fallback;
}


function normalizePositiveId(value) {
  const id = Number(value);

  return (
    Number.isInteger(id) &&
    id > 0
  )
    ? id
    : null;
}


function normalizeScheduleType(value) {
  const type = String(value || "DAILY").trim().toUpperCase();
  return ["DAILY", "WEEKDAYS", "SELECTED_DATES"].includes(type)
    ? type
    : "DAILY";
}

function normalizeWeekdays(value) {
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

function normalizeDateList(value) {
  return Array.from(
    new Set(
      (Array.isArray(value) ? value : [])
        .map(validDate)
        .filter(Boolean)
    )
  ).sort();
}

function assignmentDateOverrides(assignment) {
  return [
    ...(assignment?.duty_dates || []).map((date) => ({
      duty_date: date,
      day_type: "DUTY",
    })),
    ...(assignment?.rest_dates || []).map((date) => ({
      duty_date: date,
      day_type: "REST",
    })),
  ];
}

function assignmentDutyOnPayloadDate(assignment, date) {
  return assignmentDutyOnDate(
    {
      effective_from: assignment.effective_from,
      effective_to: assignment.effective_to,
      schedule_type: assignment.schedule_type,
      weekdays: assignment.weekdays,
      date_overrides: assignmentDateOverrides(assignment),
    },
    date
  );
}

function scheduledAssignmentsOverlap(first, second) {
  let date = first.effective_from;
  let guard = 0;

  while (date && date <= first.effective_to && guard < 20000) {
    if (assignmentDutyOnPayloadDate(first, date)) {
      for (const offset of [-1, 0, 1]) {
        const otherDate = addDays(date, offset);

        if (
          otherDate &&
          assignmentDutyOnPayloadDate(second, otherDate) &&
          recurringRangesCanOverlap({
            candidateFrom: date,
            candidateTo: date,
            candidateStart: first.start_time,
            candidateEnd: first.end_time,
            existingFrom: otherDate,
            existingTo: otherDate,
            existingStart: second.start_time,
            existingEnd: second.end_time,
          })
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

function normalizeAssignment(
  value,
  groupStart,
  groupEnd
) {
  const source =
    value &&
    typeof value === "object"
      ? value
      : {
          staff_id: value,
        };

  return {
    id:
      normalizePositiveId(
        source.id
      ),

    staff_id:
      normalizePositiveId(
        source.staff_id ??
        source.subject_id ??
        source.id
      ),

    effective_from:
      validDate(
        source.effective_from ||
        groupStart
      ),

    effective_to:
      validDate(
        source.effective_to ||
        groupEnd
      ),

    schedule_type:
      normalizeScheduleType(
        source.schedule_type
      ),

    weekdays:
      normalizeWeekdays(
        source.weekdays ??
        source.weekdays_csv
      ),

    duty_dates:
      normalizeDateList(
        source.duty_dates
      ),

    rest_dates:
      normalizeDateList(
        source.rest_dates
      ),
  };
}


function normalizeShift(
  value,
  index,
  groupStart,
  groupEnd
) {
  const assignmentsInput =
    Array.isArray(
      value?.assignments
    )
      ? value.assignments
      : Array.isArray(
          value?.staff_ids
        )
      ? value.staff_ids
      : [];

  return {
    id:
      normalizePositiveId(
        value?.id
      ),

    shift_name:
      cleanText(
        value?.shift_name
      ),

    duty_point_name:
      cleanText(
        value?.duty_point_name
      ),

    start_time:
      timeOnly(
        value?.start_time
      ),

    end_time:
      timeOnly(
        value?.end_time
      ),

    start_punch_from:
      timeOnly(
        value?.start_punch_from
      ),

    start_punch_to:
      timeOnly(
        value?.start_punch_to
      ),

    end_punch_from:
      timeOnly(
        value?.end_punch_from
      ),

    end_punch_to:
      timeOnly(
        value?.end_punch_to
      ),

    sort_order:
      Number.isInteger(
        Number(
          value?.sort_order
        )
      )
        ? Number(
            value.sort_order
          )
        : index,

    assignments:
      assignmentsInput.map(
        (assignment) =>
          normalizeAssignment(
            assignment,
            groupStart,
            groupEnd
          )
      ),
  };
}


function normalizePayload(
  payload = {}
) {
  const startDate =
    validDate(
      payload.start_date
    );

  const endDate =
    validDate(
      payload.end_date
    );

  return {
    group_name:
      cleanText(
        payload.group_name
      ),

    start_date:
      startDate,

    end_date:
      endDate,

    description:
      cleanText(
        payload.description
      ),

    is_active:
      normalizeBoolean(
        payload.is_active,
        true
      ),

    shifts:
      (
        Array.isArray(
          payload.shifts
        )
          ? payload.shifts
          : []
      ).map(
        (shift, index) =>
          normalizeShift(
            shift,
            index,
            startDate,
            endDate
          )
      ),
  };
}


function compareDates(
  first,
  second
) {
  return String(first).localeCompare(
    String(second)
  );
}


function validatePayload(data) {
  if (!data.group_name) {
    return "Custom Shift Group name is required.";
  }

  if (
    !data.start_date ||
    !data.end_date
  ) {
    return "Valid Custom Shift start and end dates are required.";
  }

  if (
    compareDates(
      data.end_date,
      data.start_date
    ) < 0
  ) {
    return "Custom Shift end date cannot be before start date.";
  }

  if (!data.shifts.length) {
    return "Add at least one Shift to the Custom Shift Group.";
  }

  const shiftNames =
    new Set();

  for (const shift of data.shifts) {
    if (!shift.shift_name) {
      return "Every Custom Shift must have a Shift Name.";
    }

    const shiftNameKey =
      shift.shift_name
        .trim()
        .toUpperCase();

    if (
      shiftNames.has(
        shiftNameKey
      )
    ) {
      return `Shift Name "${shift.shift_name}" is duplicated in this group.`;
    }

    shiftNames.add(
      shiftNameKey
    );

    const requiredTimes = [
      shift.start_time,
      shift.end_time,
      shift.start_punch_from,
      shift.start_punch_to,
      shift.end_punch_from,
      shift.end_punch_to,
    ];

    if (
      requiredTimes.some(
        (value) => !value
      )
    ) {
      return `${shift.shift_name}: Shift time and all biometric punch windows are required.`;
    }

    if (
      shift.start_time ===
      shift.end_time
    ) {
      return `${shift.shift_name}: Start Time and End Time cannot be the same.`;
    }

    if (!shift.assignments.length) {
      return `${shift.shift_name}: assign at least one Staff member.`;
    }

    const assignmentKeys =
      new Set();

    for (
      const assignment
      of shift.assignments
    ) {
      if (!assignment.staff_id) {
        return `${shift.shift_name}: invalid Staff assignment.`;
      }

      if (
        !assignment.effective_from ||
        !assignment.effective_to
      ) {
        return `${shift.shift_name}: every Staff assignment requires valid effective dates.`;
      }

      if (
        compareDates(
          assignment.effective_to,
          assignment.effective_from
        ) < 0
      ) {
        return `${shift.shift_name}: Staff assignment end date cannot be before start date.`;
      }

      if (
        compareDates(
          assignment.effective_from,
          data.start_date
        ) < 0 ||
        compareDates(
          assignment.effective_to,
          data.end_date
        ) > 0
      ) {
        return `${shift.shift_name}: Staff assignment effective dates must stay inside the Custom Shift Group date range.`;
      }

      if (
        assignment.schedule_type === "WEEKDAYS" &&
        !assignment.weekdays.length
      ) {
        return `${shift.shift_name}: select at least one Duty Weekday for Staff assignment.`;
      }

      if (
        assignment.schedule_type === "SELECTED_DATES" &&
        !assignment.duty_dates.length
      ) {
        return `${shift.shift_name}: select at least one Duty Date for Staff assignment.`;
      }

      const allPatternDates = [
        ...assignment.duty_dates,
        ...assignment.rest_dates,
      ];

      for (const patternDate of allPatternDates) {
        if (
          compareDates(patternDate, assignment.effective_from) < 0 ||
          compareDates(patternDate, assignment.effective_to) > 0
        ) {
          return `${shift.shift_name}: Duty/Rest dates must stay inside the Staff effective assignment period.`;
        }
      }

      const dutyDateSet = new Set(assignment.duty_dates);
      if (assignment.rest_dates.some((date) => dutyDateSet.has(date))) {
        return `${shift.shift_name}: the same date cannot be both Duty and Duty Rest.`;
      }

      const assignmentKey =
        [
          assignment.staff_id,
          assignment.effective_from,
          assignment.effective_to,
        ].join(":");

      if (
        assignmentKeys.has(
          assignmentKey
        )
      ) {
        return `${shift.shift_name}: duplicate Staff assignment found.`;
      }

      assignmentKeys.add(
        assignmentKey
      );
    }
  }

  return null;
}


function createValidationError(
  message,
  statusCode = 400
) {
  const error =
    new Error(message);

  error.statusCode =
    statusCode;

  return error;
}


async function validateStaffIds(
  connection,
  data
) {
  const staffIds =
    Array.from(
      new Set(
        data.shifts.flatMap(
          (shift) =>
            shift.assignments.map(
              (assignment) =>
                assignment.staff_id
            )
        )
      )
    );

  if (!staffIds.length) {
    throw createValidationError(
      "Select at least one Staff member."
    );
  }

  const [rows] =
    await connection.query(
      `
        SELECT id
        FROM staff
        WHERE
          id IN (?)
          AND is_deleted = 0
      `,
      [staffIds]
    );

  if (
    rows.length !==
    staffIds.length
  ) {
    throw createValidationError(
      "One or more selected Staff members no longer exist."
    );
  }
}


function validateInternalShiftOverlaps(data) {
  const assignments = [];

  data.shifts.forEach(
    (shift) => {
      shift.assignments.forEach(
        (assignment) => {
          assignments.push({
            shift_name:
              shift.shift_name,

            start_time:
              shift.start_time,

            end_time:
              shift.end_time,

            staff_id:
              assignment.staff_id,

            effective_from:
              assignment.effective_from,

            effective_to:
              assignment.effective_to,

            schedule_type:
              assignment.schedule_type,

            weekdays:
              assignment.weekdays,

            duty_dates:
              assignment.duty_dates,

            rest_dates:
              assignment.rest_dates,
          });
        }
      );
    }
  );

  for (
    let firstIndex = 0;
    firstIndex < assignments.length;
    firstIndex += 1
  ) {
    const first =
      assignments[firstIndex];

    for (
      let secondIndex = firstIndex + 1;
      secondIndex < assignments.length;
      secondIndex += 1
    ) {
      const second =
        assignments[secondIndex];

      if (
        first.staff_id !==
        second.staff_id
      ) {
        continue;
      }

      if (
        scheduledAssignmentsOverlap(
          first,
          second
        )
      ) {
        throw createValidationError(
          `Same Staff cannot be assigned to overlapping Custom Shifts "${first.shift_name}" and "${second.shift_name}".`
        );
      }
    }
  }
}


async function validateExternalShiftOverlaps({
  connection,
  data,
  excludeCustomGroupId = null,
}) {
  for (
    const shift
    of data.shifts
  ) {
    for (
      const assignment
      of shift.assignments
    ) {
      const conflict =
        await findStaffShiftOverlap({
          staffId:
            assignment.staff_id,

          startDate:
            assignment.effective_from,

          endDate:
            assignment.effective_to,

          startTime:
            shift.start_time,

          endTime:
            shift.end_time,

          excludeCustomGroupId,

          scheduleType:
            assignment.schedule_type,

          weekdays:
            assignment.weekdays,

          dutyDates:
            assignment.duty_dates,

          restDates:
            assignment.rest_dates,

          connection,
        });

      if (conflict) {
        const groupLabel =
          conflict.source_group_name ||
          (
            conflict.source_type ===
            "SECURITY_ROSTER"
              ? "Security Duty Roster"
              : "Custom Shift Duty"
          );

        throw createValidationError(
          `Selected Staff ID ${assignment.staff_id} already has overlapping duty in "${groupLabel}" / "${conflict.shift_name || "Shift"}" (${conflict.effective_from} to ${conflict.effective_to}).`
        );
      }
    }
  }
}


async function hydrateGroups(
  groupRows,
  connection = pool
) {
  if (
    !Array.isArray(groupRows) ||
    !groupRows.length
  ) {
    return [];
  }

  const groupIds =
    groupRows.map(
      (row) => Number(row.id)
    );

  const [shiftRows] =
    await connection.query(
      `
        SELECT
          id,
          group_id,
          shift_name,
          duty_point_name,
          start_time,
          end_time,
          start_punch_from,
          start_punch_to,
          end_punch_from,
          end_punch_to,
          sort_order,
          created_at,
          updated_at
        FROM custom_shift_definitions
        WHERE group_id IN (?)
        ORDER BY group_id, sort_order, id
      `,
      [groupIds]
    );

  const [assignmentRows] =
    await connection.query(
      `
        SELECT
          csa.id,
          csa.group_id,
          csa.shift_id,
          csa.staff_id,
          csa.effective_from,
          csa.effective_to,
          csa.schedule_type,
          csa.weekdays_csv,
          csa.created_at,
          csa.updated_at,

          s.employee_id,
          s.belt_no,
          s.first_name,
          s.last_name,
          CONCAT_WS(' ', s.first_name, s.last_name) AS staff_name,
          s.designation,

          sc.id AS category_id,
          sc.category_name,

          sb.id AS branch_id,
          sb.branch_name

        FROM custom_shift_assignments csa

        JOIN staff s
          ON s.id = csa.staff_id
         AND s.is_deleted = 0

        LEFT JOIN staff_categories sc
          ON sc.id = s.category_id

        LEFT JOIN staff_branches sb
          ON sb.id = s.branch_id

        WHERE csa.group_id IN (?)

        ORDER BY
          csa.group_id,
          csa.shift_id,
          csa.effective_from,
          csa.id
      `,
      [groupIds]
    );

  const assignmentIds =
    (assignmentRows || [])
      .map((row) => Number(row.id))
      .filter((id) => Number.isInteger(id) && id > 0);

  const datesByAssignment =
    new Map();

  if (assignmentIds.length) {
    const [assignmentDateRows] =
      await connection.query(
        `
          SELECT
            assignment_id,
            duty_date,
            day_type
          FROM custom_shift_assignment_dates
          WHERE assignment_id IN (?)
          ORDER BY assignment_id, duty_date
        `,
        [assignmentIds]
      );

    (assignmentDateRows || []).forEach((row) => {
      const assignmentId = Number(row.assignment_id);
      if (!datesByAssignment.has(assignmentId)) {
        datesByAssignment.set(assignmentId, []);
      }

      datesByAssignment.get(assignmentId).push({
        duty_date: validDate(row.duty_date),
        day_type: String(row.day_type || "").toUpperCase(),
      });
    });
  }

  const assignmentsByShift =
    new Map();

  assignmentRows.forEach(
    (row) => {
      const key =
        Number(row.shift_id);

      if (
        !assignmentsByShift.has(
          key
        )
      ) {
        assignmentsByShift.set(
          key,
          []
        );
      }

      assignmentsByShift
        .get(key)
        .push({
          ...row,
          id:
            Number(row.id),
          group_id:
            Number(row.group_id),
          shift_id:
            Number(row.shift_id),
          staff_id:
            Number(row.staff_id),
          schedule_type:
            normalizeScheduleType(row.schedule_type),
          weekdays:
            normalizeWeekdays(row.weekdays_csv),
          duty_dates:
            (datesByAssignment.get(Number(row.id)) || [])
              .filter((item) => item.day_type === "DUTY")
              .map((item) => item.duty_date),
          rest_dates:
            (datesByAssignment.get(Number(row.id)) || [])
              .filter((item) => item.day_type === "REST")
              .map((item) => item.duty_date),
          category_id:
            row.category_id === null
              ? null
              : Number(row.category_id),
          branch_id:
            row.branch_id === null
              ? null
              : Number(row.branch_id),
        });
    }
  );

  const shiftsByGroup =
    new Map();

  shiftRows.forEach(
    (row) => {
      const groupId =
        Number(row.group_id);

      if (
        !shiftsByGroup.has(
          groupId
        )
      ) {
        shiftsByGroup.set(
          groupId,
          []
        );
      }

      const shiftId =
        Number(row.id);

      const assignments =
        assignmentsByShift.get(
          shiftId
        ) || [];

      shiftsByGroup
        .get(groupId)
        .push({
          ...row,
          id:
            shiftId,
          group_id:
            groupId,
          assignments,
          staff_ids:
            Array.from(
              new Set(
                assignments.map(
                  (item) =>
                    Number(item.staff_id)
                )
              )
            ),
          staff_count:
            Array.from(
              new Set(
                assignments.map(
                  (item) =>
                    Number(item.staff_id)
                )
              )
            ).length,
        });
    }
  );

  return groupRows.map(
    (row) => {
      const groupId =
        Number(row.id);

      const shifts =
        shiftsByGroup.get(
          groupId
        ) || [];

      const staffIds =
        Array.from(
          new Set(
            shifts.flatMap(
              (shift) =>
                shift.staff_ids || []
            )
          )
        );

      return {
        ...row,
        id:
          groupId,
        is_active:
          Boolean(
            Number(row.is_active)
          ),
        shifts,
        shift_count:
          shifts.length,
        staff_ids:
          staffIds,
        staff_count:
          staffIds.length,
      };
    }
  );
}


async function listCustomShiftGroups({
  search = "",
  activeOn = null,
  isActive = null,
} = {}) {
  const conditions = [
    "1 = 1",
  ];

  const params = {};

  const cleanedSearch =
    cleanText(search);

  if (cleanedSearch) {
    conditions.push(`
      (
        csg.group_name LIKE :search
        OR csg.description LIKE :search
      )
    `);

    params.search =
      `%${cleanedSearch}%`;
  }

  const activeDate =
    validDate(activeOn);

  if (activeDate) {
    conditions.push(`
      :activeOn BETWEEN csg.start_date AND csg.end_date
    `);
    params.activeOn =
      activeDate;
  }

  if (
    isActive !== undefined &&
    isActive !== null &&
    isActive !== ""
  ) {
    conditions.push(
      "csg.is_active = :isActive"
    );

    params.isActive =
      normalizeBoolean(
        isActive,
        true
      )
        ? 1
        : 0;
  }

  const [rows] =
    await pool.query(
      `
        SELECT
          csg.*
        FROM custom_shift_groups csg
        WHERE ${conditions.join(" AND ")}
        ORDER BY
          csg.start_date DESC,
          csg.group_name ASC,
          csg.id DESC
      `,
      params
    );

  return hydrateGroups(
    rows,
    pool
  );
}


async function getCustomShiftGroupById(
  id,
  connection = pool
) {
  const groupId =
    normalizePositiveId(id);

  if (!groupId) {
    return null;
  }

  const [rows] =
    await connection.query(
      `
        SELECT *
        FROM custom_shift_groups
        WHERE id = ?
        LIMIT 1
      `,
      [groupId]
    );

  if (!rows.length) {
    return null;
  }

  const hydrated =
    await hydrateGroups(
      rows,
      connection
    );

  return hydrated[0] || null;
}


async function insertGroupGraph({
  connection,
  groupId,
  data,
  userId,
}) {
  for (
    const shift
    of data.shifts
  ) {
    const [shiftResult] =
      await connection.query(
        `
          INSERT INTO custom_shift_definitions
          (
            group_id,
            shift_name,
            duty_point_name,
            start_time,
            end_time,
            start_punch_from,
            start_punch_to,
            end_punch_from,
            end_punch_to,
            sort_order
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          groupId,
          shift.shift_name,
          shift.duty_point_name,
          shift.start_time,
          shift.end_time,
          shift.start_punch_from,
          shift.start_punch_to,
          shift.end_punch_from,
          shift.end_punch_to,
          shift.sort_order,
        ]
      );

    const shiftId =
      Number(
        shiftResult.insertId
      );

    for (
      const assignment
      of shift.assignments
    ) {
      const [assignmentResult] =
        await connection.query(
          `
            INSERT INTO custom_shift_assignments
            (
              group_id,
              shift_id,
              staff_id,
              effective_from,
              effective_to,
              schedule_type,
              weekdays_csv,
              created_by
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `,
          [
            groupId,
            shiftId,
            assignment.staff_id,
            assignment.effective_from,
            assignment.effective_to,
            assignment.schedule_type,
            assignment.weekdays.length
              ? assignment.weekdays.join(",")
              : null,
            userId,
          ]
        );

      const assignmentId = Number(assignmentResult.insertId);
      const dateRows = assignmentDateOverrides(assignment);

      for (const dateRow of dateRows) {
        await connection.query(
          `
            INSERT INTO custom_shift_assignment_dates
            (
              assignment_id,
              duty_date,
              day_type
            )
            VALUES (?, ?, ?)
          `,
          [
            assignmentId,
            dateRow.duty_date,
            dateRow.day_type,
          ]
        );
      }
    }
  }
}


async function createCustomShiftGroup(
  payload,
  userId = null
) {
  const data =
    normalizePayload(
      payload
    );

  const validationError =
    validatePayload(
      data
    );

  if (validationError) {
    throw createValidationError(
      validationError
    );
  }

  validateInternalShiftOverlaps(
    data
  );

  const connection =
    await pool.getConnection();

  try {
    await connection.beginTransaction();

    await validateStaffIds(
      connection,
      data
    );

    await validateExternalShiftOverlaps({
      connection,
      data,
    });

    const [result] =
      await connection.query(
        `
          INSERT INTO custom_shift_groups
          (
            group_name,
            start_date,
            end_date,
            description,
            is_active,
            created_by,
            updated_by
          )
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        [
          data.group_name,
          data.start_date,
          data.end_date,
          data.description,
          data.is_active ? 1 : 0,
          userId,
          userId,
        ]
      );

    const groupId =
      Number(
        result.insertId
      );

    await insertGroupGraph({
      connection,
      groupId,
      data,
      userId,
    });

    await connection.commit();

    return getCustomShiftGroupById(
      groupId
    );
  } catch (error) {
    try {
      await connection.rollback();
    } catch (_) {
      // Ignore rollback failure.
    }

    throw error;
  } finally {
    connection.release();
  }
}


async function updateCustomShiftGroup(
  id,
  payload,
  userId = null
) {
  const groupId =
    normalizePositiveId(id);

  if (!groupId) {
    return null;
  }

  const data =
    normalizePayload(
      payload
    );

  const validationError =
    validatePayload(
      data
    );

  if (validationError) {
    throw createValidationError(
      validationError
    );
  }

  validateInternalShiftOverlaps(
    data
  );

  const connection =
    await pool.getConnection();

  try {
    await connection.beginTransaction();

    // Lock before reading the current configuration. Concurrent edits must
    // not split an out-of-date version of this group.
    await connection.query(
      `SELECT id FROM custom_shift_groups WHERE id = ? FOR UPDATE`,
      [groupId]
    );

    const existing =
      await getCustomShiftGroupById(
        groupId,
        connection
      );

    if (!existing) {
      await connection.rollback();
      return null;
    }

    /*
    |-----------------------------------------------------------------------
    | BACKDATED CUSTOM SHIFT REVISION — NON-DESTRUCTIVE
    |-----------------------------------------------------------------------
    | Completed attendance references the original shift/assignment IDs.
    | A submitted effective period may start on ANY valid date (including
    | a past date already containing punches). It must not delete the
    | original graph or the official biometric/exemption evidence.
    |
    | The new graph becomes authoritative for duty calculations within its
    | effective dates. Old attendance remains attached to its original IDs
    | for audit. Reprocessing historical dates is intentionally separate.
    |-----------------------------------------------------------------------
    */
    const [previousAttendanceRows] = await connection.query(
      `
        SELECT
          COUNT(*) AS total,
          DATE_FORMAT(MIN(attendance_date), '%Y-%m-%d') AS oldest_date,
          DATE_FORMAT(MAX(attendance_date), '%Y-%m-%d') AS latest_date
        FROM custom_shift_attendance
        WHERE group_id = ?
      `,
      [groupId]
    );

    // Any recorded attendance status (including ABSENT or PENDING) needs
    // stable historical FK references; do not cascade-delete those rows.
    const historicalCount = Number(previousAttendanceRows?.[0]?.total || 0);

    if (historicalCount > 0) {
      const originalStart = validDate(existing.start_date);
      const originalEnd = validDate(existing.end_date);

      if (!originalStart || !originalEnd) {
        throw createValidationError(
          'Existing Custom Shift dates are invalid. No records were changed.'
        );
      }

      await validateStaffIds(connection, data);
      await validateExternalShiftOverlaps({
        connection,
        data,
        excludeCustomGroupId: groupId,
      });

      const previousDay = addDays(data.start_date, -1);
      const oldEnd = originalEnd < previousDay ? originalEnd : previousDay;

      // Only check an actual transition between two successive duty days.
      // When replacing an old period from its first day (or earlier), there
      // is no active previous-day duty in this old group to overlap.
      if (data.start_date > originalStart && previousDay <= originalEnd) {
        for (const priorShift of existing.shifts || []) {
          for (const priorRow of priorShift.assignments || []) {
            const prior = normalizeAssignment(priorRow, originalStart, originalEnd);
            if (!assignmentDutyOnPayloadDate(prior, previousDay)) continue;

            for (const nextShift of data.shifts) {
              for (const next of nextShift.assignments) {
                if (
                  next.staff_id === prior.staff_id &&
                  assignmentDutyOnPayloadDate(next, data.start_date) &&
                  recurringRangesCanOverlap({
                    candidateFrom: data.start_date,
                    candidateTo: data.start_date,
                    candidateStart: nextShift.start_time,
                    candidateEnd: nextShift.end_time,
                    existingFrom: previousDay,
                    existingTo: previousDay,
                    existingStart: priorShift.start_time,
                    existingEnd: priorShift.end_time,
                  })
                ) {
                  throw createValidationError(
                    `Staff ID ${next.staff_id} has overlapping overnight duty between the old and new Custom Shift periods.`
                  );
                }
              }
            }
          }
        }
      }

      // Do not remove ANY existing rows, even historic ABSENT or PENDING.
      // A replacement is calculated against the new version/assignment IDs.
      // The standard report/profile suppresses superseded rows only when
      // a newer active version has calculated attendance for that staff/day.

      if (data.start_date <= originalStart) {
        // The replacement starts at/before the old start. Deactivate the
        // old graph; its attendance, assignments and FK links remain intact.
        // Only the new group will drive active attendance calculations.
        await connection.query(
          `UPDATE custom_shift_groups
           SET is_active = 0, updated_by = ?
           WHERE id = ?`,
          [userId, groupId]
        );
      } else if (oldEnd < originalEnd) {
        // Preserve the original graph (including completed rows even after
        // this boundary). Effective group dates stop old duty calculations;
        // no cascading DELETE of original shifts or assignments is allowed.
        await connection.query(
          `UPDATE custom_shift_groups
           SET end_date = ?, updated_by = ?
           WHERE id = ?`,
          [oldEnd, userId, groupId]
        );
      }

      const [newGroupResult] = await connection.query(
        `
          INSERT INTO custom_shift_groups
          (
            group_name, start_date, end_date, description,
            is_active, created_by, updated_by
          )
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        [
          data.group_name, data.start_date, data.end_date,
          data.description, data.is_active ? 1 : 0,
          userId, userId,
        ]
      );

      const newGroupId = Number(newGroupResult.insertId);
      await insertGroupGraph({
        connection,
        groupId: newGroupId,
        data,
        userId,
      });

      await connection.commit();
      const nextPeriod = await getCustomShiftGroupById(newGroupId);
      return {
        ...nextPeriod,
        effective_period_created: true,
        backdated_revision: data.start_date <= (validDate(previousAttendanceRows?.[0]?.latest_date) || originalStart),
        previous_group_id: groupId,
        previous_group_end_date: data.start_date > originalStart ? oldEnd : null,
        historical_attendance_preserved: true,
        historical_reprocessing_required: data.start_date <= (validDate(previousAttendanceRows?.[0]?.latest_date) || originalStart),
      };
    }

    await validateStaffIds(
      connection,
      data
    );

    await validateExternalShiftOverlaps({
      connection,
      data,
      excludeCustomGroupId:
        groupId,
    });

    await connection.query(
      `
        UPDATE custom_shift_groups
        SET
          group_name = ?,
          start_date = ?,
          end_date = ?,
          description = ?,
          is_active = ?,
          updated_by = ?
        WHERE id = ?
      `,
      [
        data.group_name,
        data.start_date,
        data.end_date,
        data.description,
        data.is_active ? 1 : 0,
        userId,
        groupId,
      ]
    );

    await connection.query(
      `
        DELETE FROM custom_shift_definitions
        WHERE group_id = ?
      `,
      [groupId]
    );

    await insertGroupGraph({
      connection,
      groupId,
      data,
      userId,
    });

    await connection.commit();

    return getCustomShiftGroupById(
      groupId
    );
  } catch (error) {
    try {
      await connection.rollback();
    } catch (_) {
      // Ignore rollback failure.
    }

    throw error;
  } finally {
    connection.release();
  }
}


async function permanentlyDeleteCustomShiftGroup(
  id
) {
  const groupId =
    normalizePositiveId(id);

  if (!groupId) {
    return null;
  }

  const connection =
    await pool.getConnection();

  try {
    await connection.beginTransaction();

    const existing =
      await getCustomShiftGroupById(
        groupId,
        connection
      );

    if (!existing) {
      await connection.rollback();
      return null;
    }

    /*
    |---------------------------------------------------------------------
    | SAFE PERMANENT DELETE
    |---------------------------------------------------------------------
    | Temporary engine-created PENDING / no-punch ABSENT rows should not
    | make an accidentally created group impossible to remove.
    |
    | Permanent delete is blocked only when the group contains actual
    | official attendance evidence: a biometric punch/transaction, PRESENT,
    | EXEMPT, or a completed checkout. In that case the operator should
    | Deactivate the group so historical evidence remains preserved.
    |---------------------------------------------------------------------
    */
    const [protectedRows] =
      await connection.query(
        `
          SELECT COUNT(*) AS total
          FROM custom_shift_attendance
          WHERE group_id = ?
            AND (
              attendance_status IN ('PRESENT', 'EXEMPT')
              OR checkout_status = 'CHECKED_OUT'
              OR exemption_type IS NOT NULL
              OR exemption_record_id IS NOT NULL
              OR start_transaction_id IS NOT NULL
              OR end_transaction_id IS NOT NULL
              OR start_punch_time IS NOT NULL
              OR end_punch_time IS NOT NULL
            )
        `,
        [groupId]
      );

    if (
      Number(
        protectedRows?.[0]?.total ||
        0
      ) > 0
    ) {
      throw createValidationError(
        "This Custom Shift Group contains official biometric or exempt attendance and cannot be permanently deleted. Deactivate the group instead so its attendance history remains preserved."
      );
    }

    /*
    | Child rows in definitions, assignments, assignment dates and custom
    | shift attendance are removed automatically by the existing ON DELETE
    | CASCADE foreign keys.
    */
    await connection.query(
      `
        DELETE FROM custom_shift_groups
        WHERE id = ?
      `,
      [groupId]
    );

    await connection.commit();

    return {
      ...existing,
      permanently_deleted: true,
    };
  } catch (error) {
    try {
      await connection.rollback();
    } catch (_) {
      // Ignore rollback failure.
    }

    throw error;
  } finally {
    connection.release();
  }
}


async function deactivateCustomShiftGroup(
  id,
  userId = null
) {
  const groupId =
    normalizePositiveId(id);

  if (!groupId) {
    return null;
  }

  const existing =
    await getCustomShiftGroupById(
      groupId
    );

  if (!existing) {
    return null;
  }

  await pool.query(
    `
      UPDATE custom_shift_groups
      SET
        is_active = 0,
        updated_by = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    [
      userId,
      groupId,
    ]
  );

  return getCustomShiftGroupById(
    groupId
  );
}


async function getCustomShiftGroupsForDate(
  attendanceDate
) {
  const date =
    validDate(
      attendanceDate
    );

  if (!date) {
    throw createValidationError(
      "Valid attendance date is required."
    );
  }

  const rows =
    await getCustomShiftAssignmentsForDate(
      date
    );

  const groupMap =
    new Map();

  rows.forEach(
    (row) => {
      const groupId =
        Number(
          row.source_group_id
        );

      if (
        !groupMap.has(
          groupId
        )
      ) {
        groupMap.set(
          groupId,
          {
            id:
              groupId,
            group_name:
              row.source_group_name,
            start_date:
              row.group_start_date,
            end_date:
              row.group_end_date,
            description:
              row.group_description,
            shifts:
              [],
          }
        );
      }

      const group =
        groupMap.get(
          groupId
        );

      let shift =
        group.shifts.find(
          (item) =>
            Number(item.id) ===
            Number(row.shift_id)
        );

      if (!shift) {
        shift = {
          id:
            Number(row.shift_id),
          shift_name:
            row.shift_name,
          duty_point_name:
            row.duty_point_name,
          start_time:
            row.start_time,
          end_time:
            row.end_time,
          start_punch_from:
            row.start_punch_from,
          start_punch_to:
            row.start_punch_to,
          end_punch_from:
            row.end_punch_from,
          end_punch_to:
            row.end_punch_to,
          assignments:
            [],
        };

        group.shifts.push(
          shift
        );
      }

      shift.assignments.push(
        row
      );
    }
  );

  return [
    ...groupMap.values(),
  ];
}


/*
|--------------------------------------------------------------------------
| CUSTOM SHIFT BIOMETRIC ATTENDANCE
|--------------------------------------------------------------------------
|
| Custom Shift attendance is stored separately from regular Staff timetable
| attendance. Only the configured start/end biometric windows are used.
|
| Present = at least one punch in the Shift arrival window.
| Absent  = arrival window has closed without a valid punch.
| Pending = arrival window has not closed yet.
| Exempt  = approved Leave / OSD / Short Permission / Home Rest overlaps.
|
| Duty Rest never creates EXEMPT here; assigned Shift Duty wins.
|--------------------------------------------------------------------------
*/
async function calculateCustomShiftAttendance(
  attendanceDate
) {
  const date =
    validDate(attendanceDate);

  if (!date) {
    throw createValidationError(
      "Valid attendance_date is required."
    );
  }

  const sourceRows =
    await getCustomShiftAssignmentsForDate(
      date
    );

  if (!sourceRows.length) {
    return {
      attendance_date: date,
      rows: [],
      total: 0,
      summary: {
        total: 0,
        present: 0,
        absent: 0,
        exempt: 0,
        pending: 0,
        expected: 0,
        remaining: 0,
        groups: [],
      },
    };
  }

  const [nowRows] =
    await pool.query(
      `SELECT NOW() AS db_now`
    );

  const now =
    nowRows?.[0]?.db_now ||
    new Date();

  const nowMs =
    asMillis(now);

  const employeeCodes =
    Array.from(
      new Set(
        sourceRows
          .map((row) =>
            String(
              row.employee_id ||
              ""
            ).trim()
          )
          .filter(Boolean)
      )
    );

  const windowStarts =
    sourceRows
      .flatMap((row) => [
        row.shift_start_datetime,
        row.start_window_from,
        row.end_window_from,
      ])
      .map(asMillis)
      .filter((value) =>
        value !== null
      );

  const windowEnds =
    sourceRows
      .flatMap((row) => [
        row.shift_end_datetime,
        row.start_window_to,
        row.end_window_to,
      ])
      .map(asMillis)
      .filter((value) =>
        value !== null
      );

  const minWindow =
    windowStarts.length
      ? new Date(
          Math.min(...windowStarts)
        )
      : null;

  const maxWindow =
    windowEnds.length
      ? new Date(
          Math.max(...windowEnds)
        )
      : null;

  let transactionRows = [];
  let exceptionData = {
    leaves: [],
    osd: [],
    homeRest: [],
    dutyRest: [],
  };

  if (
    employeeCodes.length &&
    minWindow &&
    maxWindow
  ) {
    const [
      transactionResult,
      loadedExceptionData,
    ] = await Promise.all([
      pool.query(
        `
          SELECT
            id,
            emp_code,
            punch_time
          FROM zkteco_transactions
          WHERE
            emp_code IN (?)
            AND punch_time >= ?
            AND punch_time <= ?
          ORDER BY
            emp_code ASC,
            punch_time ASC,
            id ASC
        `,
        [
          employeeCodes,
          minWindow,
          maxWindow,
        ]
      ),
      getExceptionData({
        subjectType: "STAFF",
        startDatetime: minWindow,
        endDatetime: maxWindow,
      }),
    ]);

    transactionRows =
      transactionResult?.[0] ||
      [];

    exceptionData =
      loadedExceptionData ||
      exceptionData;
  }

  const transactionsByCode =
    new Map();

  for (const row of transactionRows) {
    const code =
      String(
        row.emp_code ||
        ""
      ).trim();

    if (!transactionsByCode.has(code)) {
      transactionsByCode.set(
        code,
        []
      );
    }

    transactionsByCode
      .get(code)
      .push(row);
  }

  function firstPunchInWindow(
    code,
    from,
    to,
    excludeId = null
  ) {
    const fromMs =
      asMillis(from);
    const toMs =
      asMillis(to);

    if (
      fromMs === null ||
      toMs === null
    ) {
      return null;
    }

    const rows =
      transactionsByCode.get(
        String(code || "").trim()
      ) || [];

    return (
      rows.find((row) => {
        if (
          excludeId &&
          Number(row.id) ===
          Number(excludeId)
        ) {
          return false;
        }

        const punchMs =
          asMillis(row.punch_time);

        return (
          punchMs !== null &&
          punchMs >= fromMs &&
          punchMs <= toMs
        );
      }) || null
    );
  }

  const calculatedRows =
    sourceRows.map((row) => {
      const code =
        String(
          row.employee_id ||
          ""
        ).trim();

      const exemption =
        findCustomShiftExemption({
          staffId: row.staff_id,
          shiftStart:
            row.shift_start_datetime,
          shiftEnd:
            row.shift_end_datetime,
          exceptionData,
        });

      const startPunch =
        exemption
          ? null
          : code
          ? firstPunchInWindow(
              code,
              row.start_window_from,
              row.start_window_to
            )
          : null;

      const endPunch =
        exemption
          ? null
          : code
          ? firstPunchInWindow(
              code,
              row.end_window_from,
              row.end_window_to,
              startPunch?.id || null
            )
          : null;

      const startWindowToMs =
        asMillis(
          row.start_window_to
        );

      const endWindowToMs =
        asMillis(
          row.end_window_to
        );

      let attendanceStatus =
        exemption
          ? "EXEMPT"
          : "PENDING";

      if (
        !exemption &&
        startPunch
      ) {
        attendanceStatus =
          "PRESENT";
      } else if (
        !exemption &&
        nowMs !== null &&
        startWindowToMs !== null &&
        nowMs > startWindowToMs
      ) {
        attendanceStatus =
          "ABSENT";
      }

      let checkoutStatus =
        exemption
          ? "EXEMPT"
          : "PENDING";

      if (
        !exemption &&
        endPunch
      ) {
        checkoutStatus =
          "CHECKED_OUT";
      } else if (
        !exemption &&
        nowMs !== null &&
        endWindowToMs !== null &&
        nowMs > endWindowToMs
      ) {
        checkoutStatus =
          "MISSING";
      }

      return {
        ...row,
        subject_type: "STAFF",
        subject_id:
          Number(row.staff_id),
        staff_id:
          Number(row.staff_id),
        source_type: "CUSTOM_SHIFT",
        group_id:
          Number(
            row.source_group_id
          ),
        group_name:
          row.source_group_name,
        shift_id:
          Number(row.shift_id),
        assignment_id:
          Number(row.assignment_id),
        attendance_status:
          attendanceStatus,
        checkout_status:
          checkoutStatus,
        exemption_type:
          exemption?.type || null,
        exemption_record_id:
          exemption?.id || null,
        exemption_description:
          exemption?.description || null,
        start_transaction_id:
          startPunch
            ? Number(startPunch.id)
            : null,
        start_punch_time:
          startPunch?.punch_time ||
          null,
        end_transaction_id:
          endPunch
            ? Number(endPunch.id)
            : null,
        end_punch_time:
          endPunch?.punch_time ||
          null,
      };
    });

  const values =
    calculatedRows.map((row) => [
      row.group_id,
      row.shift_id,
      row.assignment_id,
      row.staff_id,
      date,
      row.start_window_from,
      row.start_window_to,
      row.end_window_from,
      row.end_window_to,
      row.start_transaction_id,
      row.start_punch_time,
      row.end_transaction_id,
      row.end_punch_time,
      row.attendance_status,
      row.checkout_status,
      row.exemption_type,
      row.exemption_record_id,
      row.exemption_description,
      now,
      now,
    ]);

  if (values.length) {
    await pool.query(
      `
        INSERT INTO custom_shift_attendance
        (
          group_id,
          shift_id,
          assignment_id,
          staff_id,
          attendance_date,
          start_window_from,
          start_window_to,
          end_window_from,
          end_window_to,
          start_transaction_id,
          start_punch_time,
          end_transaction_id,
          end_punch_time,
          attendance_status,
          checkout_status,
          exemption_type,
          exemption_record_id,
          exemption_description,
          calculated_at,
          recalculated_at
        )
        VALUES ?
        ON DUPLICATE KEY UPDATE
          group_id = VALUES(group_id),
          shift_id = VALUES(shift_id),
          staff_id = VALUES(staff_id),
          start_window_from = VALUES(start_window_from),
          start_window_to = VALUES(start_window_to),
          end_window_from = VALUES(end_window_from),
          end_window_to = VALUES(end_window_to),
          start_transaction_id = VALUES(start_transaction_id),
          start_punch_time = VALUES(start_punch_time),
          end_transaction_id = VALUES(end_transaction_id),
          end_punch_time = VALUES(end_punch_time),
          attendance_status = VALUES(attendance_status),
          checkout_status = VALUES(checkout_status),
          exemption_type = VALUES(exemption_type),
          exemption_record_id = VALUES(exemption_record_id),
          exemption_description = VALUES(exemption_description),
          recalculated_at = VALUES(recalculated_at)
      `,
      [values]
    );
  }

  const totals = {
    total: 0,
    present: 0,
    absent: 0,
    exempt: 0,
    pending: 0,
  };

  const groups =
    new Map();

  for (const row of calculatedRows) {
    totals.total += 1;

    const status =
      String(
        row.attendance_status ||
        "PENDING"
      ).toUpperCase();

    if (status === "PRESENT") {
      totals.present += 1;
    } else if (status === "ABSENT") {
      totals.absent += 1;
    } else if (status === "EXEMPT") {
      totals.exempt += 1;
    } else {
      totals.pending += 1;
    }

    const groupKey =
      Number(row.group_id);

    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        group_id: groupKey,
        group_name:
          row.group_name ||
          "Custom Shift Duty",
        group_start_date:
          row.group_start_date ||
          null,
        group_end_date:
          row.group_end_date ||
          null,
        total: 0,
        present: 0,
        absent: 0,
        exempt: 0,
        pending: 0,
        shifts: [],
        _shiftMap: new Map(),
      });
    }

    const group =
      groups.get(groupKey);

    group.total += 1;
    group[status.toLowerCase()] =
      Number(
        group[status.toLowerCase()] ||
        0
      ) + 1;

    const shiftKey =
      Number(row.shift_id);

    if (!group._shiftMap.has(shiftKey)) {
      const shiftSummary = {
        shift_id: shiftKey,
        shift_name:
          row.shift_name ||
          `Shift ${shiftKey}`,
        duty_point_name:
          row.duty_point_name ||
          null,
        start_time:
          row.start_time || null,
        end_time:
          row.end_time || null,
        total: 0,
        present: 0,
        absent: 0,
        exempt: 0,
        pending: 0,
      };

      group._shiftMap.set(
        shiftKey,
        shiftSummary
      );
      group.shifts.push(
        shiftSummary
      );
    }

    const shift =
      group._shiftMap.get(shiftKey);

    shift.total += 1;
    shift[status.toLowerCase()] =
      Number(
        shift[status.toLowerCase()] ||
        0
      ) + 1;
  }

  const groupRows =
    [...groups.values()].map(
      (group) => {
        delete group._shiftMap;

        group.expected =
          Math.max(
            0,
            group.total -
            group.exempt
          );
        group.remaining =
          Math.max(
            0,
            group.expected -
            group.present
          );

        group.shifts =
          group.shifts.map(
            (shift) => ({
              ...shift,
              expected:
                Math.max(
                  0,
                  shift.total -
                  shift.exempt
                ),
              remaining:
                Math.max(
                  0,
                  shift.total -
                  shift.exempt -
                  shift.present
                ),
            })
          );

        return group;
      }
    );

  const expected =
    Math.max(
      0,
      totals.total -
      totals.exempt
    );

  return {
    attendance_date: date,
    rows: calculatedRows,
    total: calculatedRows.length,
    summary: {
      ...totals,
      expected,
      remaining:
        Math.max(
          0,
          expected -
          totals.present
        ),
      groups: groupRows,
    },
  };
}


module.exports = {
  listCustomShiftGroups,
  getCustomShiftGroupById,
  createCustomShiftGroup,
  updateCustomShiftGroup,
  deactivateCustomShiftGroup,
  permanentlyDeleteCustomShiftGroup,
  getCustomShiftGroupsForDate,
  calculateCustomShiftAttendance,
};
