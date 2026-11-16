const {
  pool,
} = require("../config/db");

const {
  getExceptionData,
} = require("./attendance.model");

const {
  findStaffShiftOverlap,
  buildSecurityRosterOccurrence,
  securityRosterDayOffset,
} = require("../services/shiftDuty.service");


const SHIFT_NAMES = {
  FIRST:
    "1st Shift",

  SECOND:
    "2nd Shift",

  THIRD:
    "3rd Shift",
};


function cleanText(
  value
) {
  if (
    value === undefined ||
    value === null
  ) {
    return null;
  }

  const text =
    String(
      value
    ).trim();

  return text || null;
}


function cleanTime(
  value
) {
  const text =
    cleanText(
      value
    );

  if (!text) {
    return null;
  }

  const match =
    text.match(
      /^(\d{2}):(\d{2})(?::(\d{2}))?$/
    );

  if (!match) {
    return null;
  }

  const hour =
    Number(
      match[1]
    );

  const minute =
    Number(
      match[2]
    );

  const second =
    Number(
      match[3] ||
      0
    );

  if (
    hour > 23 ||
    minute > 59 ||
    second > 59
  ) {
    return null;
  }

  return [
    String(
      hour
    ).padStart(
      2,
      "0"
    ),

    String(
      minute
    ).padStart(
      2,
      "0"
    ),

    String(
      second
    ).padStart(
      2,
      "0"
    ),
  ].join(":");
}


function normalizeShiftKey(
  value
) {
  const key =
    String(
      value ||
      ""
    )
      .trim()
      .toUpperCase();

  return Object.prototype
    .hasOwnProperty.call(
      SHIFT_NAMES,
      key
    )
      ? key
      : null;
}


function normalizeSubjectType(
  value
) {
  const type =
    String(
      value ||
      ""
    )
      .trim()
      .toUpperCase();

  return [
    "STAFF",
    "TRAINEE",
  ].includes(
    type
  )
    ? type
    : null;
}


function normalizePayload(
  data = {}
) {
  const shifts =
    (
      Array.isArray(
        data.shifts
      )
        ? data.shifts
        : []
    ).map(
      (
        shift
      ) => ({
        shift_key:
          normalizeShiftKey(
            shift
              ?.shift_key
          ),

        shift_name:
          SHIFT_NAMES[
            normalizeShiftKey(
              shift
                ?.shift_key
            )
          ] ||
          null,

        start_time:
          cleanTime(
            shift
              ?.start_time
          ),

        end_time:
          cleanTime(
            shift
              ?.end_time
          ),

        start_punch_from:
          cleanTime(
            shift
              ?.start_punch_from
          ),

        start_punch_to:
          cleanTime(
            shift
              ?.start_punch_to
          ),

        end_punch_from:
          cleanTime(
            shift
              ?.end_punch_from
          ),

        end_punch_to:
          cleanTime(
            shift
              ?.end_punch_to
          ),

        duty_points:
          (
            Array.isArray(
              shift
                ?.duty_points
            )
              ? shift
                  .duty_points
              : []
          )
            .map(
              (
                point,
                pointIndex
              ) => ({
                duty_point_name:
                  cleanText(
                    point
                      ?.duty_point_name
                  ),

                sort_order:
                  pointIndex,

                employees:
                  (
                    Array.isArray(
                      point
                        ?.employees
                    )
                      ? point
                          .employees
                      : []
                  )
                    .map(
                      (
                        employee,
                        employeeIndex
                      ) => ({
                        subject_type:
                          normalizeSubjectType(
                            employee
                              ?.subject_type
                          ),

                        subject_id:
                          Number(
                            employee
                              ?.subject_id
                          ),

                        weapon:
                          cleanText(
                            employee
                              ?.weapon
                          ),

                        sort_order:
                          employeeIndex,
                      })
                    ),
              })
            ),
      })
    );

  return {
    roster_date:
      cleanText(
        data.roster_date
      ),

    title:
      cleanText(
        data.title
      ),

    reference_no:
      cleanText(
        data.reference_no
      ),

    remarks:
      cleanText(
        data.remarks
      ),

    copied_from_roster_id:
      Number(
        data
          .copied_from_roster_id
      ) ||
      null,

    shifts,
  };
}


function createDutyDateTime(
  dateString,
  timeString,
  dayOffset = 0
) {
  const date =
    String(
      dateString ||
      ""
    ).trim();

  const time =
    cleanTime(
      timeString
    );

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(
      date
    ) ||
    !time
  ) {
    return null;
  }

  const [
    year,
    month,
    day,
  ] =
    date
      .split("-")
      .map(Number);

  const [
    hour,
    minute,
    second,
  ] =
    time
      .split(":")
      .map(Number);

  return new Date(
    year,
    month - 1,
    day + dayOffset,
    hour,
    minute,
    second || 0,
    0
  );
}


function buildDutyShiftPeriod(
  rosterDate,
  shift
) {
  const startDayOffset = securityRosterDayOffset(shift);
  const start =
    createDutyDateTime(
      rosterDate,
      shift?.start_time,
      startDayOffset
    );

  let end =
    createDutyDateTime(
      rosterDate,
      shift?.end_time,
      startDayOffset
    );

  if (
    start &&
    end &&
    end.getTime() <=
      start.getTime()
  ) {
    end =
      createDutyDateTime(
        rosterDate,
        shift?.end_time,
        startDayOffset + 1
      );
  }

  return {
    start,
    end,
  };
}


function rangesOverlap(
  firstStart,
  firstEnd,
  secondStart,
  secondEnd
) {
  const aStart =
    asMillis(
      firstStart
    );

  const aEnd =
    asMillis(
      firstEnd
    );

  const bStart =
    asMillis(
      secondStart
    );

  const bEnd =
    asMillis(
      secondEnd
    );

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


function findStaffDutyExemption({
  subjectId,
  shiftStart,
  shiftEnd,
  exceptionData,
}) {
  const id =
    Number(
      subjectId
    );

  if (
    !Number.isInteger(id) ||
    id <= 0
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
          Number(
            row.subject_id
          ) === id &&
          rangesOverlap(
            row[startField],
            row[endField],
            shiftStart,
            shiftEnd
          )
      );

    return record
      ? makeResult(
          record
        )
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
        type:
          "HOME_REST",
        id: row.id,
        description:
          row.doctor_recommendation ||
          "Home Rest",
      })
    ) ||
    null
  );
}


async function validateStaffRosterExemptions(
  data
) {
  const staffAssignments = [];

  for (
    const shift
    of data.shifts || []
  ) {
    const period =
      buildDutyShiftPeriod(
        data.roster_date,
        shift
      );

    if (
      !period.start ||
      !period.end
    ) {
      continue;
    }

    for (
      const point
      of shift.duty_points || []
    ) {
      for (
        const assignment
        of point.employees || []
      ) {
        if (
          assignment.subject_type !==
          "STAFF"
        ) {
          continue;
        }

        staffAssignments.push({
          subject_id:
            assignment.subject_id,
          shift_name:
            shift.shift_name,
          start:
            period.start,
          end:
            period.end,
        });
      }
    }
  }

  if (
    !staffAssignments.length
  ) {
    return;
  }

  const starts =
    staffAssignments
      .map(
        (item) =>
          item.start
      )
      .filter(Boolean);

  const ends =
    staffAssignments
      .map(
        (item) =>
          item.end
      )
      .filter(Boolean);

  const minStart =
    new Date(
      Math.min(
        ...starts.map(
          (value) =>
            value.getTime()
        )
      )
    );

  const maxEnd =
    new Date(
      Math.max(
        ...ends.map(
          (value) =>
            value.getTime()
        )
      )
    );

  const exceptionData =
    await getExceptionData({
      subjectType:
        "STAFF",
      startDatetime:
        minStart,
      endDatetime:
        maxEnd,
    });

  for (
    const assignment
    of staffAssignments
  ) {
    const exemption =
      findStaffDutyExemption({
        subjectId:
          assignment.subject_id,
        shiftStart:
          assignment.start,
        shiftEnd:
          assignment.end,
        exceptionData,
      });

    if (!exemption) {
      continue;
    }

    const error =
      new Error(
        `Selected Staff member cannot be assigned to ${assignment.shift_name} because an active ${exemption.type.replaceAll("_", " ")} exemption overlaps this Shift.`
      );

    error.statusCode =
      400;

    throw error;
  }
}


/*
|--------------------------------------------------------------------------
| INSTANT STAFF DUTY STATUS
|--------------------------------------------------------------------------
|
| Used by Duty Roster UI immediately after a Staff member is selected.
| If Shift start/end are available, status is checked against that exact
| Shift period. Otherwise the complete roster date is checked.
|
|--------------------------------------------------------------------------
*/

async function getStaffDutyStatus({
  subjectId,
  rosterDate,
  startTime = null,
  endTime = null,
  shiftKey = null,
}) {
  const staffId = Number(subjectId);
  const date = String(rosterDate || "").trim();

  if (!Number.isInteger(staffId) || staffId <= 0) {
    const error = new Error("Valid Staff member is required.");
    error.statusCode = 400;
    throw error;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const error = new Error("Valid Roster Date is required.");
    error.statusCode = 400;
    throw error;
  }

  let period;

  if (cleanTime(startTime) && cleanTime(endTime)) {
    period = buildDutyShiftPeriod(date, {
      start_time: startTime,
      end_time: endTime,
      shift_key: shiftKey,
    });
  } else {
    period = {
      start: createDutyDateTime(date, "00:00:00"),
      end: createDutyDateTime(date, "23:59:59"),
    };
  }

  if (!period.start || !period.end) {
    const error = new Error("Could not resolve Duty Roster time period.");
    error.statusCode = 400;
    throw error;
  }

  const exceptionData = await getExceptionData({
    subjectType: "STAFF",
    startDatetime: period.start,
    endDatetime: period.end,
  });

  const exemption = findStaffDutyExemption({
    subjectId: staffId,
    shiftStart: period.start,
    shiftEnd: period.end,
    exceptionData,
  });

  if (!exemption) {
    return {
      subject_id: staffId,
      available: true,
      status: "AVAILABLE",
      status_label: "Available",
      description: null,
    };
  }

  const labels = {
    LEAVE: "On Leave",
    OSD: "OSD",
    SHORT_PERMISSION: "Short Permission",
    HOME_REST: "Home Rest",
    DUTY_REST: "Duty Rest",
  };

  return {
    subject_id: staffId,
    available: false,
    status: exemption.type,
    status_label: labels[exemption.type] || exemption.type.replaceAll("_", " "),
    exemption_id: exemption.id || null,
    description: exemption.description || null,
  };
}


async function validateSubjects(
  connection,
  assignments
) {
  const staffIds =
    Array.from(
      new Set(
        assignments
          .filter(
            (
              item
            ) =>
              item.subject_type ===
              "STAFF"
          )
          .map(
            (
              item
            ) =>
              Number(
                item.subject_id
              )
          )
      )
    );

  const traineeIds =
    Array.from(
      new Set(
        assignments
          .filter(
            (
              item
            ) =>
              item.subject_type ===
              "TRAINEE"
          )
          .map(
            (
              item
            ) =>
              Number(
                item.subject_id
              )
          )
      )
    );


  if (
    staffIds.length
  ) {
    const [
      rows,
    ] =
      await connection.query(
        `
          SELECT
            id

          FROM staff

          WHERE
            id IN (?)

            AND
            is_deleted = 0
        `,
        [
          staffIds,
        ]
      );

    if (
      rows.length !==
      staffIds.length
    ) {
      throw new Error(
        "One or more selected Staff members no longer exist."
      );
    }
  }


  if (
    traineeIds.length
  ) {
    const [
      rows,
    ] =
      await connection.query(
        `
          SELECT
            id

          FROM trainees

          WHERE
            id IN (?)

            AND
            is_deleted = 0
        `,
        [
          traineeIds,
        ]
      );

    if (
      rows.length !==
      traineeIds.length
    ) {
      throw new Error(
        "One or more selected Trainees no longer exist."
      );
    }
  }
}


function validateRosterPayload(
  data
) {
  if (
    !data.roster_date ||
    !/^\d{4}-\d{2}-\d{2}$/.test(
      data.roster_date
    )
  ) {
    return (
      "Valid Roster Date is required."
    );
  }

  if (
    !data.shifts.length
  ) {
    return (
      "At least one Shift is required."
    );
  }

  if (
    data.shifts.length >
    3
  ) {
    return (
      "Only 1st, 2nd and 3rd Shift are allowed."
    );
  }


  const shiftKeys =
    new Set();

  const assignmentKeys =
    new Set();

  for (
    const shift
    of data.shifts
  ) {
    if (
      !shift.shift_key ||
      !shift.shift_name
    ) {
      return (
        "Invalid Shift selected."
      );
    }

    if (
      shiftKeys.has(
        shift.shift_key
      )
    ) {
      return (
        "Each Shift can be added only once."
      );
    }

    shiftKeys.add(
      shift.shift_key
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
        (
          value
        ) =>
          !value
      )
    ) {
      return (
        `${shift.shift_name}: all Shift and biometric punch times are required.`
      );
    }


    if (
      !shift
        .duty_points
        .length
    ) {
      return (
        `${shift.shift_name}: at least one Duty Point is required.`
      );
    }


    for (
      const point
      of shift.duty_points
    ) {
      if (
        !point
          .duty_point_name
      ) {
        return (
          `${shift.shift_name}: Duty Point name is required.`
        );
      }

      if (
        !point
          .employees
          .length
      ) {
        return (
          `${shift.shift_name}: "${point.duty_point_name}" must have at least one Staff/Trainee assignment.`
        );
      }


      for (
        const assignment
        of point.employees
      ) {
        if (
          !assignment
            .subject_type ||
          !Number.isInteger(
            assignment
              .subject_id
          ) ||
          assignment
            .subject_id <
            1
        ) {
          return (
            "Invalid Duty Roster assignment."
          );
        }

        const key =
          `${assignment.subject_type}:${assignment.subject_id}`;

        if (
          assignmentKeys.has(
            key
          )
        ) {
          return (
            "Same Staff/Trainee cannot be assigned to multiple Duty Points/Shifts in the same Duty Roster."
          );
        }

        assignmentKeys.add(
          key
        );
      }
    }
  }

  return null;
}


async function hydrateRosters(
  rosterRows,
  connection =
    pool
) {
  if (
    !Array.isArray(
      rosterRows
    ) ||
    !rosterRows.length
  ) {
    return [];
  }


  const ids =
    rosterRows.map(
      (
        item
      ) =>
        Number(
          item.id
        )
    );


  const [
    shiftRows,
  ] =
    await connection.query(
      `
        SELECT
          *

        FROM duty_roster_shifts

        WHERE
          roster_id IN (?)

        ORDER BY
          roster_id ASC,

          FIELD(
            shift_key,
            'FIRST',
            'SECOND',
            'THIRD'
          ) ASC,

          id ASC
      `,
      [
        ids,
      ]
    );


  const shiftIds =
    shiftRows.map(
      (
        item
      ) =>
        Number(
          item.id
        )
    );


  let pointRows =
    [];

  if (
    shiftIds.length
  ) {
    const [
      rows,
    ] =
      await connection.query(
        `
          SELECT
            *

          FROM duty_roster_points

          WHERE
            shift_id IN (?)

          ORDER BY
            shift_id ASC,
            sort_order ASC,
            id ASC
        `,
        [
          shiftIds,
        ]
      );

    pointRows =
      rows;
  }


  const pointIds =
    pointRows.map(
      (
        item
      ) =>
        Number(
          item.id
        )
    );


  let assignmentRows =
    [];

  if (
    pointIds.length
  ) {
    const [
      rows,
    ] =
      await connection.query(
        `
          SELECT
            dra.*,

            s.employee_id
              AS staff_employee_id,

            s.belt_no
              AS staff_belt_no,

            s.first_name
              AS staff_first_name,

            s.last_name
              AS staff_last_name,

            t.employee_id
              AS trainee_employee_id,

            t.first_name
              AS trainee_first_name,

            t.last_name
              AS trainee_last_name,

            p.platoon_number

          FROM duty_roster_assignments dra

          LEFT JOIN staff s
            ON
              dra.subject_type =
                'STAFF'

              AND
              s.id =
                dra.subject_id

          LEFT JOIN trainees t
            ON
              dra.subject_type =
                'TRAINEE'

              AND
              t.id =
                dra.subject_id

          LEFT JOIN platoons p
            ON
              p.id =
                t.platoon_id

          WHERE
            dra.duty_point_id IN (?)

          ORDER BY
            dra.duty_point_id ASC,
            dra.sort_order ASC,
            dra.id ASC
        `,
        [
          pointIds,
        ]
      );

    assignmentRows =
      rows;
  }


  const assignmentsByPoint =
    new Map();

  for (
    const row
    of assignmentRows
  ) {
    const pointId =
      Number(
        row.duty_point_id
      );

    if (
      !assignmentsByPoint.has(
        pointId
      )
    ) {
      assignmentsByPoint.set(
        pointId,
        []
      );
    }


    const isStaff =
      row.subject_type ===
      "STAFF";

    const employeeId =
      isStaff
        ? row.staff_employee_id
        : row.trainee_employee_id;

    const firstName =
      isStaff
        ? row.staff_first_name
        : row.trainee_first_name;

    const lastName =
      isStaff
        ? row.staff_last_name
        : row.trainee_last_name;

    const name =
      [
        firstName,
        lastName,
      ]
        .filter(
          Boolean
        )
        .join(" ") ||
      employeeId ||
      "-";


    assignmentsByPoint
      .get(
        pointId
      )
      .push({
        id:
          Number(
            row.id
          ),

        subject_type:
          row.subject_type,

        subject_id:
          Number(
            row.subject_id
          ),

        name,

        first_name:
          firstName ||
          null,

        last_name:
          lastName ||
          null,

        employee_id:
          employeeId ||
          "",

        belt_no:
          isStaff
            ? row.staff_belt_no ||
              ""
            : "",

        cap_no:
          !isStaff
            ? employeeId ||
              ""
            : "",

        platoon_number:
          !isStaff
            ? row.platoon_number ||
              ""
            : "",

        weapon:
          row.weapon ||
          "",
      });
  }


  const pointsByShift =
    new Map();

  for (
    const row
    of pointRows
  ) {
    const shiftId =
      Number(
        row.shift_id
      );

    if (
      !pointsByShift.has(
        shiftId
      )
    ) {
      pointsByShift.set(
        shiftId,
        []
      );
    }

    pointsByShift
      .get(
        shiftId
      )
      .push({
        id:
          Number(
            row.id
          ),

        local_id:
          `point-${row.id}`,

        duty_point_name:
          row.duty_point_name,

        employees:
          assignmentsByPoint.get(
            Number(
              row.id
            )
          ) ||
          [],
      });
  }


  const shiftsByRoster =
    new Map();

  for (
    const row
    of shiftRows
  ) {
    const rosterId =
      Number(
        row.roster_id
      );

    if (
      !shiftsByRoster.has(
        rosterId
      )
    ) {
      shiftsByRoster.set(
        rosterId,
        []
      );
    }

    shiftsByRoster
      .get(
        rosterId
      )
      .push({
        id:
          Number(
            row.id
          ),

        shift_key:
          row.shift_key,

        shift_name:
          row.shift_name,

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

        duty_points:
          pointsByShift.get(
            Number(
              row.id
            )
          ) ||
          [],
      });
  }


  return rosterRows.map(
    (
      row
    ) => ({
      ...row,

      id:
        Number(
          row.id
        ),

      copied_from_roster_id:
        row.copied_from_roster_id
          ? Number(
              row.copied_from_roster_id
            )
          : null,

      shifts:
        shiftsByRoster.get(
          Number(
            row.id
          )
        ) ||
        [],
    })
  );
}


async function listDutyRosters({
  search = "",
  rosterDate = null,
} = {}) {
  const conditions = [
    "dr.roster_status = 'ACTIVE'",
  ];

  const params = {};

  const cleanSearch =
    cleanText(
      search
    );

  if (
    cleanSearch
  ) {
    conditions.push(`
      (
        dr.title LIKE :search
        OR dr.reference_no LIKE :search
        OR dr.remarks LIKE :search
      )
    `);

    params.search =
      `%${cleanSearch}%`;
  }


  if (
    rosterDate
  ) {
    conditions.push(
      "dr.roster_date = :rosterDate"
    );

    params.rosterDate =
      rosterDate;
  }


  const [
    rows,
  ] =
    await pool.query(
      `
        SELECT
          dr.*,

          creator.full_name
            AS created_by_name,

          updater.full_name
            AS updated_by_name

        FROM duty_rosters dr

        LEFT JOIN users creator
          ON creator.id =
             dr.created_by

        LEFT JOIN users updater
          ON updater.id =
             dr.updated_by

        WHERE
          ${conditions.join(
            " AND "
          )}

        ORDER BY
          dr.roster_date DESC,
          dr.id DESC
      `,
      params
    );

  return hydrateRosters(
    rows
  );
}


async function getDutyRosterById(
  id,
  connection =
    pool,
  {
    includeCancelled =
      false,
  } = {}
) {
  const [
    rows,
  ] =
    await connection.query(
      `
        SELECT
          dr.*,

          creator.full_name
            AS created_by_name,

          updater.full_name
            AS updated_by_name

        FROM duty_rosters dr

        LEFT JOIN users creator
          ON creator.id =
             dr.created_by

        LEFT JOIN users updater
          ON updater.id =
             dr.updated_by

        WHERE
          dr.id = ?

          ${
            includeCancelled
              ? ""
              : "AND dr.roster_status = 'ACTIVE'"
          }

        LIMIT 1
      `,
      [
        Number(
          id
        ),
      ]
    );

  if (
    !rows.length
  ) {
    return null;
  }

  const hydrated =
    await hydrateRosters(
      rows,
      connection
    );

  return (
    hydrated[0] ||
    null
  );
}


async function validateStaffShiftOverlaps(
  connection,
  rosterId,
  data
) {
  for (
    const shift
    of data.shifts || []
  ) {
    for (
      const point
      of shift.duty_points || []
    ) {
      for (
        const assignment
        of point.employees || []
      ) {
        if (
          assignment.subject_type !==
          "STAFF"
        ) {
          continue;
        }

        const conflict =
          await findStaffShiftOverlap({
            staffId:
              assignment.subject_id,
            startDate:
              data.roster_date,
            endDate:
              data.roster_date,
            startTime:
              shift.start_time,
            endTime:
              shift.end_time,
            candidateShiftKey:
              shift.shift_key,
            excludeSecurityRosterId:
              rosterId || null,
            connection,
          });

        if (conflict) {
          const sourceName =
            conflict.source_group_name ||
            (
              conflict.source_type ===
              "CUSTOM_SHIFT"
                ? "Custom Shift Duty"
                : "Security Duty Roster"
            );

          const error =
            new Error(
              `Selected Staff ID ${assignment.subject_id} already has overlapping duty in "${sourceName}" / "${conflict.shift_name || "Shift"}".`
            );

          error.statusCode =
            400;

          throw error;
        }
      }
    }
  }
}


async function insertRosterGraph(
  connection,
  rosterId,
  data
) {
  const allAssignments = [];

  for (
    const shift
    of data.shifts
  ) {
    for (
      const point
      of shift.duty_points
    ) {
      allAssignments.push(
        ...point.employees
      );
    }
  }


  await validateSubjects(
    connection,
    allAssignments
  );

  await validateStaffShiftOverlaps(
    connection,
    rosterId,
    data
  );

  /*
  | Approved Leave / OSD / Home Rest may exempt Staff from Shift Duty.
  | Duty Rest does NOT override an assigned Shift. Trainee biometric
  | attendance remains Course-timetable based.
  */
  await validateStaffRosterExemptions(
    data
  );


  for (
    const shift
    of data.shifts
  ) {
    const [
      shiftResult,
    ] =
      await connection.query(
        `
          INSERT INTO duty_roster_shifts
          (
            roster_id,

            shift_key,
            shift_name,

            start_time,
            end_time,

            start_punch_from,
            start_punch_to,

            end_punch_from,
            end_punch_to
          )

          VALUES
          (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          rosterId,

          shift.shift_key,
          shift.shift_name,

          shift.start_time,
          shift.end_time,

          shift.start_punch_from,
          shift.start_punch_to,

          shift.end_punch_from,
          shift.end_punch_to,
        ]
      );

    const shiftId =
      Number(
        shiftResult.insertId
      );


    for (
      const point
      of shift.duty_points
    ) {
      const [
        pointResult,
      ] =
        await connection.query(
          `
            INSERT INTO duty_roster_points
            (
              shift_id,
              duty_point_name,
              sort_order
            )

            VALUES
            (?, ?, ?)
          `,
          [
            shiftId,
            point.duty_point_name,
            point.sort_order,
          ]
        );

      const pointId =
        Number(
          pointResult.insertId
        );


      for (
        const assignment
        of point.employees
      ) {
        await connection.query(
          `
            INSERT INTO duty_roster_assignments
            (
              roster_id,
              shift_id,
              duty_point_id,

              subject_type,
              subject_id,

              weapon,
              sort_order
            )

            VALUES
            (?, ?, ?, ?, ?, ?, ?)
          `,
          [
            rosterId,
            shiftId,
            pointId,

            assignment.subject_type,
            assignment.subject_id,

            assignment.weapon,
            assignment.sort_order,
          ]
        );
      }
    }
  }
}


async function createDutyRoster(
  payload,
  userId =
    null
) {
  const data =
    normalizePayload(
      payload
    );

  const validationError =
    validateRosterPayload(
      data
    );

  if (
    validationError
  ) {
    const error =
      new Error(
        validationError
      );

    error.statusCode =
      400;

    throw error;
  }


  const connection =
    await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [
      result,
    ] =
      await connection.query(
        `
          INSERT INTO duty_rosters
          (
            roster_date,

            title,
            reference_no,
            remarks,

            roster_status,

            copied_from_roster_id,

            created_by,
            updated_by
          )

          VALUES
          (?, ?, ?, ?, 'ACTIVE', ?, ?, ?)
        `,
        [
          data.roster_date,

          data.title,
          data.reference_no,
          data.remarks,

          data.copied_from_roster_id,

          userId,
          userId,
        ]
      );


    const rosterId =
      Number(
        result.insertId
      );


    await insertRosterGraph(
      connection,
      rosterId,
      data
    );


    await connection.commit();

    return getDutyRosterById(
      rosterId
    );
  } catch (
    error
  ) {
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


async function updateDutyRoster(
  id,
  payload,
  userId =
    null
) {
  const rosterId =
    Number(
      id
    );

  const data =
    normalizePayload(
      payload
    );

  const validationError =
    validateRosterPayload(
      data
    );

  if (
    validationError
  ) {
    const error =
      new Error(
        validationError
      );

    error.statusCode =
      400;

    throw error;
  }


  const connection =
    await pool.getConnection();

  try {
    await connection.beginTransaction();

    const existing =
      await getDutyRosterById(
        rosterId,
        connection
      );

    if (
      !existing
    ) {
      await connection.rollback();

      return null;
    }


    await connection.query(
      `
        UPDATE duty_rosters

        SET
          roster_date = ?,

          title = ?,
          reference_no = ?,
          remarks = ?,

          copied_from_roster_id = ?,

          updated_by = ?

        WHERE
          id = ?

          AND
          roster_status =
            'ACTIVE'
      `,
      [
        data.roster_date,

        data.title,
        data.reference_no,
        data.remarks,

        data.copied_from_roster_id,

        userId,

        rosterId,
      ]
    );


    /*
    |--------------------------------------------------------------------------
    | Rebuild child graph in one transaction.
    |--------------------------------------------------------------------------
    |
    | Cascades delete points/assignments/attendance below removed shifts.
    |
    |--------------------------------------------------------------------------
    */

    await connection.query(
      `
        DELETE FROM duty_roster_shifts

        WHERE
          roster_id = ?
      `,
      [
        rosterId,
      ]
    );


    await insertRosterGraph(
      connection,
      rosterId,
      data
    );


    await connection.commit();

    return getDutyRosterById(
      rosterId
    );
  } catch (
    error
  ) {
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


async function deleteDutyRoster(
  id,
  userId =
    null
) {
  const rosterId =
    Number(
      id
    );

  const existing =
    await getDutyRosterById(
      rosterId
    );

  if (
    !existing
  ) {
    return null;
  }


  await pool.query(
    `
      UPDATE duty_rosters

      SET
        roster_status =
          'CANCELLED',

        updated_by = ?,

        updated_at =
          CURRENT_TIMESTAMP

      WHERE
        id = ?
    `,
    [
      userId,
      rosterId,
    ]
  );


  return {
    ...existing,

    roster_status:
      "CANCELLED",
  };
}




/*
|--------------------------------------------------------------------------
| DUTY ROSTER BIOMETRIC ATTENDANCE
|--------------------------------------------------------------------------
|
| Finalized rule:
| - Valid START punch inside configured start window => PRESENT.
| - If start window closes without a valid punch => ABSENT.
| - Before start window closes and no punch => PENDING.
| - END punch is stored separately as checkout information and does not decide
|   PRESENT / ABSENT.
|
|--------------------------------------------------------------------------
*/

function asMillis(
  value
) {
  if (!value) {
    return null;
  }

  const date =
    value instanceof Date
      ? value
      : new Date(
          value
        );

  const millis =
    date.getTime();

  return Number.isNaN(
    millis
  )
    ? null
    : millis;
}


function dateOnlyValue(
  value
) {
  if (!value) {
    return null;
  }

  if (
    typeof value ===
    "string"
  ) {
    const match =
      value.match(
        /^(\d{4}-\d{2}-\d{2})/
      );

    if (match) {
      return match[1];
    }
  }

  const date =
    value instanceof Date
      ? value
      : new Date(
          value
        );

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return null;
  }

  const year =
    date.getFullYear();

  const month =
    String(
      date.getMonth() +
        1
    ).padStart(
      2,
      "0"
    );

  const day =
    String(
      date.getDate()
    ).padStart(
      2,
      "0"
    );

  return (
    `${year}-${month}-${day}`
  );
}


async function getDutyRosterAttendanceSource(
  attendanceDate
) {
  const [
    rows,
  ] =
    await pool.query(
      `
        SELECT
          dr.id
            AS roster_id,

          dr.roster_date,
          dr.title
            AS roster_title,

          dr.reference_no,

          drs.id
            AS shift_id,

          drs.shift_key,
          drs.shift_name,

          drs.start_time,
          drs.end_time,

          TIMESTAMP(
            dr.roster_date,
            drs.start_time
          )
            AS shift_start_datetime,

          TIMESTAMP(
            CASE
              WHEN
                drs.end_time <=
                drs.start_time
              THEN
                DATE_ADD(
                  dr.roster_date,
                  INTERVAL 1 DAY
                )
              ELSE
                dr.roster_date
            END,
            drs.end_time
          )
            AS shift_end_datetime,

          drs.start_punch_from,
          drs.start_punch_to,

          drs.end_punch_from,
          drs.end_punch_to,

          TIMESTAMP(
            dr.roster_date,
            drs.start_punch_from
          )
            AS start_window_from,

          CASE
            WHEN
              drs.start_punch_to <
              drs.start_punch_from
            THEN
              DATE_ADD(
                TIMESTAMP(
                  dr.roster_date,
                  drs.start_punch_to
                ),
                INTERVAL 1 DAY
              )
            ELSE
              TIMESTAMP(
                dr.roster_date,
                drs.start_punch_to
              )
          END
            AS start_window_to,

          TIMESTAMP(
            CASE
              WHEN
                drs.end_time <=
                drs.start_time
              THEN
                DATE_ADD(
                  dr.roster_date,
                  INTERVAL 1 DAY
                )
              ELSE
                dr.roster_date
            END,
            drs.end_punch_from
          )
            AS end_window_from,

          CASE
            WHEN
              drs.end_punch_to <
              drs.end_punch_from
            THEN
              DATE_ADD(
                TIMESTAMP(
                  CASE
                    WHEN
                      drs.end_time <=
                      drs.start_time
                    THEN
                      DATE_ADD(
                        dr.roster_date,
                        INTERVAL 1 DAY
                      )
                    ELSE
                      dr.roster_date
                  END,
                  drs.end_punch_to
                ),
                INTERVAL 1 DAY
              )
            ELSE
              TIMESTAMP(
                CASE
                  WHEN
                    drs.end_time <=
                    drs.start_time
                  THEN
                    DATE_ADD(
                      dr.roster_date,
                      INTERVAL 1 DAY
                    )
                  ELSE
                    dr.roster_date
                END,
                drs.end_punch_to
              )
          END
            AS end_window_to,

          drp.id
            AS duty_point_id,

          drp.duty_point_name,

          dra.id
            AS assignment_id,

          dra.subject_type,
          dra.subject_id,
          dra.weapon,

          CASE
            WHEN
              dra.subject_type =
                'STAFF'
            THEN
              s.employee_id
            ELSE
              t.employee_id
          END
            AS employee_id,

          CASE
            WHEN
              dra.subject_type =
                'STAFF'
            THEN
              s.belt_no
            ELSE
              NULL
          END
            AS belt_no,

          CASE
            WHEN
              dra.subject_type =
                'TRAINEE'
            THEN
              t.employee_id
            ELSE
              NULL
          END
            AS cap_no,

          CASE
            WHEN
              dra.subject_type =
                'TRAINEE'
            THEN
              p.platoon_number
            ELSE
              NULL
          END
            AS platoon_number,

          CASE
            WHEN
              dra.subject_type =
                'STAFF'
            THEN
              sc.category_name
            ELSE
              c.course_name
          END
            AS group_name,

          sc.category_name
            AS category_name,

          sb.branch_name
            AS branch_name,

          s.designation
            AS designation,

          CASE
            WHEN
              dra.subject_type =
                'STAFF'
            THEN
              CONCAT_WS(
                ' ',
                s.first_name,
                s.last_name
              )
            ELSE
              CONCAT_WS(
                ' ',
                t.first_name,
                t.last_name
              )
          END
            AS subject_name

        FROM duty_rosters dr

        JOIN duty_roster_shifts drs
          ON drs.roster_id =
             dr.id

        JOIN duty_roster_points drp
          ON drp.shift_id =
             drs.id

        JOIN duty_roster_assignments dra
          ON dra.duty_point_id =
             drp.id

        LEFT JOIN staff s
          ON
            dra.subject_type =
              'STAFF'

            AND
            s.id =
              dra.subject_id

        LEFT JOIN staff_categories sc
          ON sc.id =
             s.category_id

        LEFT JOIN staff_branches sb
          ON sb.id =
             s.branch_id

        LEFT JOIN trainees t
          ON
            dra.subject_type =
              'TRAINEE'

            AND
            t.id =
              dra.subject_id

        LEFT JOIN courses c
          ON c.id =
             t.course_id

        LEFT JOIN platoons p
          ON p.id =
             t.platoon_id

        WHERE
          dr.roster_status =
            'ACTIVE'

          AND
          dr.roster_date = ?

        ORDER BY
          FIELD(
            drs.shift_key,
            'FIRST',
            'SECOND',
            'THIRD'
          ) ASC,

          drp.sort_order ASC,
          dra.sort_order ASC,
          dra.id ASC
      `,
      [
        attendanceDate,
      ]
    );

  // All roster attendance consumers (API, Dashboard, absence engine) use
  // the same resolved duty occurrence as the common Shift Duty service.
  return (rows || []).map((row) =>
    buildSecurityRosterOccurrence(row, attendanceDate)
  );
}


async function calculateDutyRosterAttendance(
  attendanceDate
) {
  const date =
    dateOnlyValue(
      attendanceDate
    );

  if (
    !date
  ) {
    const error =
      new Error(
        "Valid attendance_date is required."
      );

    error.statusCode =
      400;

    throw error;
  }


  const sourceRows =
    (
      await getDutyRosterAttendanceSource(
        date
      )
    ).filter(
      (row) =>
        row.subject_type ===
        "STAFF"
    );

  /*
  | Trainees on a Duty Roster are intentionally excluded from Shift biometric
  | calculation. Their Present / Absent status continues to come exclusively
  | from the Course timetable attendance engine.
  */

  if (
    !sourceRows.length
  ) {
    return {
      attendance_date:
        date,

      rows:
        [],

      total:
        0,

      summary: {
        FIRST: {
          total:
            0,

          present:
            0,

          absent:
            0,

          exempt:
            0,

          expected:
            0,

          remaining:
            0,

          pending:
            0,
        },

        SECOND: {
          total:
            0,

          present:
            0,

          absent:
            0,

          exempt:
            0,

          expected:
            0,

          remaining:
            0,

          pending:
            0,
        },

        THIRD: {
          total:
            0,

          present:
            0,

          absent:
            0,

          exempt:
            0,

          expected:
            0,

          remaining:
            0,

          pending:
            0,
        },
      },
    };
  }


  const [
    nowRows,
  ] =
    await pool.query(
      `
        SELECT
          NOW()
            AS db_now
      `
    );

  const now =
    nowRows[0]
      ?.db_now ||
    new Date();

  const nowMs =
    asMillis(
      now
    );


  const employeeCodes =
    Array.from(
      new Set(
        sourceRows
          .map(
            (
              row
            ) =>
              String(
                row.employee_id ||
                ""
              ).trim()
          )
          .filter(
            Boolean
          )
      )
    );


  let transactionRows =
    [];

  let exceptionData = {
    leaves: [],
    osd: [],
    homeRest: [],
    dutyRest: [],
  };

  const windowStarts =
    sourceRows
      .flatMap(
        (row) => [
          row.shift_start_datetime,
          row.start_window_from,
          row.end_window_from,
        ]
      )
      .map(
        asMillis
      )
      .filter(
        (value) =>
          value !== null
      );

  const windowEnds =
    sourceRows
      .flatMap(
        (row) => [
          row.shift_end_datetime,
          row.start_window_to,
          row.end_window_to,
        ]
      )
      .map(
        asMillis
      )
      .filter(
        (value) =>
          value !== null
      );

  const minWindow =
    windowStarts.length
      ? new Date(
          Math.min(
            ...windowStarts
          )
        )
      : null;

  const maxWindow =
    windowEnds.length
      ? new Date(
          Math.max(
            ...windowEnds
          )
        )
      : null;

  if (
    employeeCodes.length &&
    minWindow &&
    maxWindow
  ) {
    const [
      transactionResult,
      loadedExceptionData,
    ] =
      await Promise.all([
        pool.query(
          `
            SELECT
              id,
              emp_code,
              punch_time

            FROM zkteco_transactions

            WHERE
              emp_code IN (?)

              AND
              punch_time >= ?

              AND
              punch_time <= ?

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
          subjectType:
            "STAFF",
          startDatetime:
            minWindow,
          endDatetime:
            maxWindow,
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

  for (
    const row
    of transactionRows
  ) {
    const code =
      String(
        row.emp_code ||
        ""
      ).trim();

    if (
      !transactionsByCode.has(
        code
      )
    ) {
      transactionsByCode.set(
        code,
        []
      );
    }

    transactionsByCode
      .get(
        code
      )
      .push(
        row
      );
  }


  function firstPunchInWindow(
    code,
    from,
    to,
    excludeId =
      null
  ) {
    const fromMs =
      asMillis(
        from
      );

    const toMs =
      asMillis(
        to
      );

    if (
      fromMs ===
        null ||
      toMs ===
        null
    ) {
      return null;
    }

    const rows =
      transactionsByCode.get(
        String(
          code ||
          ""
        ).trim()
      ) ||
      [];

    return (
      rows.find(
        (
          row
        ) => {
          if (
            excludeId &&
            Number(
              row.id
            ) ===
              Number(
                excludeId
              )
          ) {
            return false;
          }

          const punchMs =
            asMillis(
              row.punch_time
            );

          return (
            punchMs !==
              null &&
            punchMs >=
              fromMs &&
            punchMs <=
              toMs
          );
        }
      ) ||
      null
    );
  }


  const calculatedRows =
    sourceRows.map(
      (
        row
      ) => {
        const code =
          String(
            row.employee_id ||
            ""
          ).trim();

        const exemption =
          findStaffDutyExemption({
            subjectId:
              row.subject_id,
            shiftStart:
              row.shift_start_datetime,
            shiftEnd:
              row.shift_end_datetime,
            exceptionData,
          });

        const startPunch =
          exemption
            ? null
            :
          code
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
                startPunch
                  ?.id ||
                  null
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
          nowMs !==
            null &&
          startWindowToMs !==
            null &&
          nowMs >
            startWindowToMs
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
          nowMs !==
            null &&
          endWindowToMs !==
            null &&
          nowMs >
            endWindowToMs
        ) {
          checkoutStatus =
            "MISSING";
        }


        return {
          ...row,

          roster_id:
            Number(
              row.roster_id
            ),

          shift_id:
            Number(
              row.shift_id
            ),

          duty_point_id:
            Number(
              row.duty_point_id
            ),

          assignment_id:
            Number(
              row.assignment_id
            ),

          subject_id:
            Number(
              row.subject_id
            ),

          attendance_status:
            attendanceStatus,

          checkout_status:
            checkoutStatus,

          exemption_type:
            exemption?.type ||
            null,

          exemption_record_id:
            exemption?.id ||
            null,

          exemption_description:
            exemption?.description ||
            null,

          start_transaction_id:
            startPunch
              ? Number(
                  startPunch.id
                )
              : null,

          start_punch_time:
            startPunch
              ?.punch_time ||
            null,

          end_transaction_id:
            endPunch
              ? Number(
                  endPunch.id
                )
              : null,

          end_punch_time:
            endPunch
              ?.punch_time ||
            null,
        };
      }
    );


  const exemptAssignmentIds =
    calculatedRows
      .filter(
        (row) =>
          row.attendance_status ===
          "EXEMPT"
      )
      .map(
        (row) =>
          row.assignment_id
      )
      .filter(Boolean);

  if (
    exemptAssignmentIds.length
  ) {
    /*
    | Exempt Staff is not expected to perform Shift Duty. Remove any stale
    | persisted Shift attendance row instead of requiring a schema change to
    | support an EXEMPT enum/value. The live API response still returns the
    | exemption details for Dashboard transparency.
    */
    await pool.query(
      `
        DELETE
        FROM duty_roster_attendance

        WHERE
          assignment_id IN (?)

          AND
          attendance_date = ?
      `,
      [
        exemptAssignmentIds,
        date,
      ]
    );
  }


  const values =
    calculatedRows
      .filter(
        (row) =>
          row.attendance_status !==
          "EXEMPT"
      )
      .map(
      (
        row
      ) => [
        row.roster_id,
        row.shift_id,
        row.assignment_id,

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

        now,
        now,
      ]
    );


  if (
    values.length
  ) {
    await pool.query(
      `
        INSERT INTO duty_roster_attendance
        (
          roster_id,
          shift_id,
          assignment_id,

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

          calculated_at,
          recalculated_at
        )

        VALUES ?

        ON DUPLICATE KEY UPDATE
          roster_id =
            VALUES(
              roster_id
            ),

          shift_id =
            VALUES(
              shift_id
            ),

          attendance_date =
            VALUES(
              attendance_date
            ),

          start_window_from =
            VALUES(
              start_window_from
            ),

          start_window_to =
            VALUES(
              start_window_to
            ),

          end_window_from =
            VALUES(
              end_window_from
            ),

          end_window_to =
            VALUES(
              end_window_to
            ),

          start_transaction_id =
            VALUES(
              start_transaction_id
            ),

          start_punch_time =
            VALUES(
              start_punch_time
            ),

          end_transaction_id =
            VALUES(
              end_transaction_id
            ),

          end_punch_time =
            VALUES(
              end_punch_time
            ),

          attendance_status =
            VALUES(
              attendance_status
            ),

          recalculated_at =
            VALUES(
              recalculated_at
            )
      `,
      [
        values,
      ]
    );
  }


  const summary = {
    FIRST: {
      total:
        0,

      present:
        0,

      absent:
        0,

      exempt:
        0,

      pending:
        0,
    },

    SECOND: {
      total:
        0,

      present:
        0,

      absent:
        0,

      exempt:
        0,

      pending:
        0,
    },

    THIRD: {
      total:
        0,

      present:
        0,

      absent:
        0,

      exempt:
        0,

      pending:
        0,
    },
  };


  for (
    const row
    of calculatedRows
  ) {
    const shift =
      summary[
        row.shift_key
      ];

    if (!shift) {
      continue;
    }

    shift.total +=
      1;

    if (
      row.attendance_status ===
      "PRESENT"
    ) {
      shift.present +=
        1;
    } else if (
      row.attendance_status ===
      "ABSENT"
    ) {
      shift.absent +=
        1;
    } else if (
      row.attendance_status ===
      "EXEMPT"
    ) {
      shift.exempt +=
        1;
    } else {
      shift.pending +=
        1;
    }
  }


  for (
    const shift
    of Object.values(
      summary
    )
  ) {
    shift.expected =
      Math.max(
        0,
        shift.total -
          shift.exempt
      );

    shift.remaining =
      Math.max(
        0,
        shift.expected -
          shift.present
      );
  }


  return {
    attendance_date:
      date,

    rows:
      calculatedRows,

    total:
      calculatedRows.length,

    summary,
  };
}


module.exports = {
  SHIFT_NAMES,

  listDutyRosters,
  getDutyRosterById,

  createDutyRoster,
  updateDutyRoster,
  deleteDutyRoster,

  calculateDutyRosterAttendance,
  getStaffDutyStatus,
};
