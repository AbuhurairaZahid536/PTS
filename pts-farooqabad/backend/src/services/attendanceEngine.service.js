const {
  getSubjects,
  getTimetableAssignments,
  getPunchesBulk,
  getExceptionData,
  saveAttendanceBulk,
  removeStaleAttendanceRecords,
} = require(
  "../models/attendance.model"
);

const {
  getShiftDutyStaffIdsForDate,
  getShiftControlledStaffIdsForDate,
  getCustomShiftDutyRestMembershipsForDate,
} = require(
  "./shiftDuty.service"
);

const {
  calculateDutyRosterAttendance,
} = require(
  "../models/dutyRoster.model"
);

const {
  calculateCustomShiftAttendance,
} = require(
  "../models/customShift.model"
);

const {
  getWeekends,
} = require(
  "../models/weekend.model"
);

/*
|--------------------------------------------------------------------------
| DATE HELPERS
|--------------------------------------------------------------------------
*/

function pad(value) {
  return String(
    value
  ).padStart(
    2,
    "0"
  );
}

function normalizeDate(
  value
) {
  const text =
    String(
      value ||
      ""
    ).trim();

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(
      text
    )
  ) {
    throw new Error(
      "Attendance date must be YYYY-MM-DD."
    );
  }

  return text;
}

function normalizeTime(
  value
) {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  return String(
    value
  ).substring(
    0,
    8
  );
}

function createLocalDateTime(
  dateString,
  timeString
) {
  const time =
    normalizeTime(
      timeString
    );

  if (!time) {
    return null;
  }

  const [
    year,
    month,
    day,
  ] =
    dateString
      .split("-")
      .map(Number);

  const [
    hour,
    minute,
    second = 0,
  ] =
    time
      .split(":")
      .map(Number);

  return new Date(
    year,
    month - 1,
    day,
    hour,
    minute,
    second,
    0
  );
}

function parseDbDateTime(
  value
) {
  if (!value) {
    return null;
  }

  if (
    value instanceof Date
  ) {
    return value;
  }

  const text =
    String(value)
      .replace(
        "T",
        " "
      )
      .substring(
        0,
        19
      );

  const [
    datePart,
    timePart =
      "00:00:00",
  ] =
    text.split(" ");

  return createLocalDateTime(
    datePart,
    timePart
  );
}

function addMinutes(
  date,
  minutes
) {
  return new Date(
    date.getTime() +
      Number(
        minutes
      ) *
        60000
  );
}

function sqlDateTime(
  date
) {
  return [
    date.getFullYear(),
    "-",
    pad(
      date.getMonth() +
      1
    ),
    "-",
    pad(
      date.getDate()
    ),
    " ",
    pad(
      date.getHours()
    ),
    ":",
    pad(
      date.getMinutes()
    ),
    ":",
    pad(
      date.getSeconds()
    ),
  ].join("");
}

function diffMinutes(
  later,
  earlier
) {
  return Math.max(
    0,
    Math.round(
      (
        later.getTime() -
        earlier.getTime()
      ) /
        60000
    )
  );
}

/*
|--------------------------------------------------------------------------
| SESSION WINDOW
|--------------------------------------------------------------------------
*/

function buildSessionWindow(
  attendanceDate,
  timetable,
  sessionType
) {
  const prefix =
    sessionType ===
    "MORNING"
      ? "morning"
      : "evening";

  const start =
    createLocalDateTime(
      attendanceDate,
      timetable[
        `${prefix}_start`
      ]
    );

  let end =
    createLocalDateTime(
      attendanceDate,
      timetable[
        `${prefix}_end`
      ]
    );

  if (
    !start ||
    !end
  ) {
    throw new Error(
      `${sessionType} timetable window is incomplete.`
    );
  }

  if (
    end.getTime() <
    start.getTime()
  ) {
    end =
      new Date(
        end.getTime() +
          24 *
            60 *
            60 *
            1000
      );
  }

  const earlyMinutes =
    Number(
      timetable[
        `${prefix}_early_minutes`
      ] ||
      0
    );

  const lateMinutes =
    Number(
      timetable[
        `${prefix}_late_grace_minutes`
      ] ||
      0
    );

  return {
    start,

    end,

    earlyStart:
      addMinutes(
        start,
        -earlyMinutes
      ),

    lateEnd:
      addMinutes(
        end,
        lateMinutes
      ),
  };
}

/*
|--------------------------------------------------------------------------
| TIMETABLE MAP
|--------------------------------------------------------------------------
*/

function buildTimetableMaps(
  rows
) {
  const courseMap =
    new Map();

  const categoryMap =
    new Map();

  for (
    const row of rows
  ) {
    const key =
      String(
        row.assignment_id
      );

    if (
      row.assignment_type ===
      "TRAINEE"
    ) {
      if (
        !courseMap.has(
          key
        )
      ) {
        courseMap.set(
          key,
          row
        );
      }
    } else if (
      !categoryMap.has(
        key
      )
    ) {
      categoryMap.set(
        key,
        row
      );
    }
  }

  return {
    courseMap,
    categoryMap,
  };
}

function getTimetableForSubject(
  subject,
  maps
) {
  if (
    subject.subject_type ===
    "TRAINEE"
  ) {
    if (
      !subject.course_id
    ) {
      return null;
    }

    return (
      maps.courseMap.get(
        String(
          subject.course_id
        )
      ) ||
      null
    );
  }

  if (
    !subject.category_id
  ) {
    return null;
  }

  return (
    maps.categoryMap.get(
      String(
        subject.category_id
      )
    ) ||
    null
  );
}

/*
|--------------------------------------------------------------------------
| SUBJECT IDENTITY / AMBIGUITY
|--------------------------------------------------------------------------
*/

function subjectKey(
  subjectType,
  subjectId
) {
  return `${subjectType}:${subjectId}`;
}

function employeeKey(
  value
) {
  return String(
    value ||
    ""
  ).trim();
}

function findAmbiguousSubjects(
  subjects
) {
  const employeeMap =
    new Map();

  for (
    const subject of subjects
  ) {
    const key =
      employeeKey(
        subject.employee_id
      );

    if (!key) {
      continue;
    }

    if (
      !employeeMap.has(
        key
      )
    ) {
      employeeMap.set(
        key,
        []
      );
    }

    employeeMap
      .get(key)
      .push(
        subject
      );
  }

  const ambiguousKeys =
    new Set();

  for (
    const [, matches]
    of employeeMap
  ) {
    if (
      matches.length <=
      1
    ) {
      continue;
    }

    for (
      const subject of matches
    ) {
      ambiguousKeys.add(
        subjectKey(
          subject.subject_type,
          subject.subject_id
        )
      );
    }
  }

  return ambiguousKeys;
}

/*
|--------------------------------------------------------------------------
| PUNCH MAP
|--------------------------------------------------------------------------
*/

function buildPunchMap(
  punches
) {
  const map =
    new Map();

  for (
    const punch of punches
  ) {
    const key =
      String(
        punch.emp_code ||
        ""
      ).trim();

    if (!key) {
      continue;
    }

    if (
      !map.has(
        key
      )
    ) {
      map.set(
        key,
        []
      );
    }

    map
      .get(key)
      .push(
        punch
      );
  }

  return map;
}

/*
|--------------------------------------------------------------------------
| PUNCH SELECTION
|--------------------------------------------------------------------------
*/

function choosePunch(
  punches,
  window
) {
  const parsed =
    punches
      .map(
        (punch) => ({
          ...punch,

          date:
            parseDbDateTime(
              punch.punch_time
            ),
        })
      )
      .filter(
        (punch) =>
          punch.date &&
          !Number.isNaN(
            punch.date.getTime()
          )
      )
      .sort(
        (a, b) =>
          a.date -
          b.date
      );

  /*
  |--------------------------------------------------------------------------
  | Inside normal window
  |--------------------------------------------------------------------------
  */

  const inside =
    parsed.find(
      (punch) =>
        punch.date >=
          window.start &&
        punch.date <=
          window.end
    );

  if (inside) {
    return {
      punch:
        inside,

      attendanceStatus:
        "PRESENT",

      timingStatus:
        "IN_TIME",

      timingMinutes:
        0,
    };
  }

  /*
  |--------------------------------------------------------------------------
  | Early
  |--------------------------------------------------------------------------
  */

  const early =
    parsed.find(
      (punch) =>
        punch.date >=
          window.earlyStart &&
        punch.date <
          window.start
    );

  if (early) {
    return {
      punch:
        early,

      attendanceStatus:
        "PRESENT",

      timingStatus:
        "EARLY",

      timingMinutes:
        diffMinutes(
          window.start,
          early.date
        ),
    };
  }

  /*
  |--------------------------------------------------------------------------
  | Late
  |--------------------------------------------------------------------------
  */

  const late =
    parsed.find(
      (punch) =>
        punch.date >
          window.end &&
        punch.date <=
          window.lateEnd
    );

  if (late) {
    return {
      punch:
        late,

      attendanceStatus:
        "PRESENT",

      timingStatus:
        "LATE",

      timingMinutes:
        diffMinutes(
          late.date,
          window.end
        ),
    };
  }

  return null;
}

/*
|--------------------------------------------------------------------------
| EXCEPTION MAP
|--------------------------------------------------------------------------
*/

function buildListMap(
  rows
) {
  const map =
    new Map();

  for (
    const row of rows
  ) {
    const key =
      subjectKey(
        row.subject_type,
        row.subject_id
      );

    if (
      !map.has(
        key
      )
    ) {
      map.set(
        key,
        []
      );
    }

    map
      .get(key)
      .push(
        row
      );
  }

  return map;
}

function buildExceptionMaps(
  data
) {
  return {
    leaves:
      buildListMap(
        data.leaves
      ),

    osd:
      buildListMap(
        data.osd
      ),

    homeRest:
      buildListMap(
        data.homeRest
      ),

    trainingDrop:
      buildListMap(
        data.trainingDrop
      ),

    manualAbsence:
      buildListMap(
        data.manualAbsence
      ),

    dutyRest:
      buildListMap(
        data.dutyRest
      ),

    longWeekend:
      buildListMap(
        data.longWeekend || []
      ),
  };
}

function buildLongWeekendExceptionRows(
  weekends
) {
  const result = [];

  for (
    const weekend
    of Array.isArray(weekends)
      ? weekends
      : []
  ) {
    if (
      Number(
        weekend?.is_active ?? 1
      ) !== 1
    ) {
      continue;
    }

    const weekendStart =
      parseDbDateTime(
        weekend?.start_datetime
      );

    const weekendEnd =
      parseDbDateTime(
        weekend?.end_datetime
      );

    if (
      !weekendStart ||
      !weekendEnd
    ) {
      continue;
    }

    const validIds =
      new Set(
        (
          weekend
            ?.departure_long_weekend_trainee_ids ||
          weekend
            ?.departure_present_trainee_ids ||
          []
        )
          .map(Number)
          .filter(
            (id) =>
              Number.isInteger(id) &&
              id > 0
          )
      );

    if (!validIds.size) {
      continue;
    }

    const biometricIds =
      new Set(
        (
          weekend
            ?.departure_present_trainee_ids ||
          []
        )
          .map(Number)
          .filter(
            (id) =>
              Number.isInteger(id) &&
              id > 0
          )
      );

    const leaveByTraineeId =
      new Map(
        (
          weekend
            ?.departure_authorized_leave_trainees ||
          []
        )
          .map(
            (item) => [
              Number(
                item?.trainee_id
              ),
              item,
            ]
          )
          .filter(
            ([id]) =>
              Number.isInteger(id) &&
              id > 0
          )
      );

    for (const traineeId of validIds) {
      let effectiveStart =
        weekendStart;

      if (
        !biometricIds.has(
          traineeId
        )
      ) {
        const leave =
          leaveByTraineeId.get(
            traineeId
          );

        const leaveEnd =
          parseDbDateTime(
            leave
              ?.leave_end_datetime
          );

        if (
          leaveEnd &&
          leaveEnd >
            effectiveStart
        ) {
          effectiveStart =
            leaveEnd;
        }
      }

      if (
        effectiveStart >=
        weekendEnd
      ) {
        continue;
      }

      result.push({
        subject_type:
          "TRAINEE",

        subject_id:
          traineeId,

        id:
          Number(
            weekend?.id
          ) || null,

        start_datetime:
          effectiveStart,

        end_datetime:
          weekendEnd,

        weekend_name:
          weekend
            ?.weekend_name ||
          "Long Weekend",
      });
    }
  }

  return result;
}


function overlaps(
  startValue,
  endValue,
  windowStart,
  windowEnd
) {
  const start =
    parseDbDateTime(
      startValue
    );

  const end =
    parseDbDateTime(
      endValue
    );

  if (
    !start ||
    !end
  ) {
    return false;
  }

  return (
    start <=
      windowEnd &&
    end >=
      windowStart
  );
}

/*
|--------------------------------------------------------------------------
| TRAINING DROP HELPERS
|--------------------------------------------------------------------------
|
| Drop interval:
|
| drop_datetime <= time < rejoin_datetime
|--------------------------------------------------------------------------
*/

function getTrainingDropsForSubject(
  subject,
  maps
) {
  if (
    subject.subject_type !==
    "TRAINEE"
  ) {
    return [];
  }

  const key =
    subjectKey(
      subject.subject_type,
      subject.subject_id
    );

  return (
    maps.trainingDrop.get(
      key
    ) ||
    []
  );
}

function trainingDropContainsDate(
  row,
  date
) {
  const start =
    parseDbDateTime(
      row.drop_datetime
    );

  const end =
    row.rejoin_datetime
      ? parseDbDateTime(
          row.rejoin_datetime
        )
      : null;

  if (!start) {
    return false;
  }

  return (
    date >= start &&
    (
      !end ||
      date < end
    )
  );
}

function trainingDropOverlapsWindow(
  row,
  window
) {
  const start =
    parseDbDateTime(
      row.drop_datetime
    );

  const end =
    row.rejoin_datetime
      ? parseDbDateTime(
          row.rejoin_datetime
        )
      : null;

  if (!start) {
    return false;
  }

  /*
  |--------------------------------------------------------------------------
  | Half-open Drop interval:
  |
  | [drop, rejoin)
  |--------------------------------------------------------------------------
  */

  return (
    start <=
      window.end &&
    (
      !end ||
      end >
        window.start
    )
  );
}

function findTrainingDropForWindow(
  subject,
  window,
  maps
) {
  const rows =
    getTrainingDropsForSubject(
      subject,
      maps
    );

  return (
    rows.find(
      (row) =>
        trainingDropOverlapsWindow(
          row,
          window
        )
    ) ||
    null
  );
}

function removeDroppedPunches(
  subject,
  punches,
  maps
) {
  if (
    subject.subject_type !==
    "TRAINEE"
  ) {
    return punches;
  }

  const drops =
    getTrainingDropsForSubject(
      subject,
      maps
    );

  if (!drops.length) {
    return punches;
  }

  return punches.filter(
    (punch) => {
      const punchDate =
        parseDbDateTime(
          punch.punch_time
        );

      if (!punchDate) {
        return true;
      }

      return !drops.some(
        (drop) =>
          trainingDropContainsDate(
            drop,
            punchDate
          )
      );
    }
  );
}

/*
|--------------------------------------------------------------------------
| MANUAL ABSENCE
|--------------------------------------------------------------------------
*/

function getManualAbsencesForWindow(
  subject,
  window,
  maps
) {
  const key =
    subjectKey(
      subject.subject_type,
      subject.subject_id
    );

  const rows =
    maps.manualAbsence.get(
      key
    ) ||
    [];

  return rows.filter(
    (row) =>
      overlaps(
        row.start_datetime,
        row.end_datetime,
        window.start,
        window.end
      )
  );
}

/*
|--------------------------------------------------------------------------
| OTHER EXEMPTIONS
|--------------------------------------------------------------------------
*/

function resolveException({
  subject,
  window,
  maps,
}) {
  const key =
    subjectKey(
      subject.subject_type,
      subject.subject_id
    );

  /*
  |--------------------------------------------------------------------------
  | LEAVE
  |--------------------------------------------------------------------------
  */

  const leaves =
    maps.leaves.get(
      key
    ) ||
    [];

  const leave =
    leaves.find(
      (row) =>
        overlaps(
          row.start_datetime,
          row.end_datetime,
          window.start,
          window.end
        )
    );

  if (leave) {
    return {
      type:
        "LEAVE",

      id:
        leave.id,

      description:
        `${leave.leave_category || ""}${
          leave.leave_type
            ? ` - ${leave.leave_type}`
            : ""
        }`.trim(),
    };
  }

  /*
  |--------------------------------------------------------------------------
  | OSD / SHORT PERMISSION
  |--------------------------------------------------------------------------
  */

  const osdRows =
    maps.osd.get(
      key
    ) ||
    [];

  const osd =
    osdRows.find(
      (row) =>
        overlaps(
          row.start_datetime,
          row.end_datetime,
          window.start,
          window.end
        )
    );

  if (osd) {
    return {
      type:
        osd.record_type ===
        "SHORT_PERMISSION"
          ? "SHORT_PERMISSION"
          : "OSD",

      id:
        osd.id,

      description:
        osd.reason ||
        osd.record_type,
    };
  }

  /*
  |--------------------------------------------------------------------------
  | HOME REST
  |--------------------------------------------------------------------------
  */

  const homeRows =
    maps.homeRest.get(
      key
    ) ||
    [];

  const home =
    homeRows.find(
      (row) =>
        overlaps(
          row.home_rest_start,
          row.home_rest_end,
          window.start,
          window.end
        )
    );

  if (home) {
    return {
      type:
        "HOME_REST",

      id:
        home.id,

      description:
        home.doctor_recommendation ||
        "Home Rest",
    };
  }

  /*
  |--------------------------------------------------------------------------
  | TRAINEE LONG WEEKEND
  |--------------------------------------------------------------------------
  |
  | Long Weekend is an operational biometric exemption only after the
  | trainee has a valid Weekend departure authority. Biometric departures
  | start at Weekend start; Leave-authorized departures start only after the
  | approved Leave ends. This keeps Leave and Long Weekend mutually correct.
  |--------------------------------------------------------------------------
  */

  if (
    subject.subject_type ===
    "TRAINEE"
  ) {
    const weekendRows =
      maps.longWeekend.get(
        key
      ) ||
      [];

    const weekend =
      weekendRows.find(
        (row) =>
          overlaps(
            row.start_datetime,
            row.end_datetime,
            window.start,
            window.end
          )
      );

    if (weekend) {
      return {
        type:
          "LONG_WEEKEND",

        id:
          weekend.id,

        description:
          weekend.weekend_name ||
          "Long Weekend",
      };
    }
  }

  /*
  |--------------------------------------------------------------------------
  | STAFF DUTY REST
  |--------------------------------------------------------------------------
  */

  if (
    subject.subject_type ===
    "STAFF"
  ) {
    const dutyRestRows =
      maps.dutyRest.get(
        key
      ) ||
      [];

    const dutyRest =
      dutyRestRows.find(
        (row) =>
          overlaps(
            row.start_datetime,
            row.end_datetime,
            window.start,
            window.end
          )
      );

    if (dutyRest) {
      return {
        type:
          "DUTY_REST",

        id:
          dutyRest.id,

        description:
          dutyRest.title ||
          dutyRest.reason ||
          "Duty Rest",
      };
    }
  }

  return null;
}

/*
|--------------------------------------------------------------------------
| NO TIMETABLE RECORD
|--------------------------------------------------------------------------
*/

function createNoTimetableRecord({
  attendanceDate,
  subject,
  sessionType,
}) {
  return {
    attendance_date:
      attendanceDate,

    subject_type:
      subject.subject_type,

    subject_id:
      subject.subject_id,

    employee_id:
      subject.employee_id,

    session_type:
      sessionType,

    timetable_id:
      null,

    timetable_name:
      null,

    window_start:
      null,

    window_end:
      null,

    early_window_start:
      null,

    late_window_end:
      null,

    selected_punch:
      null,

    transaction_id:
      null,

    attendance_status:
      "NO_TIMETABLE",

    timing_status:
      "NO_TIMETABLE",

    timing_minutes:
      null,

    exemption_type:
      null,

    exemption_record_id:
      null,

    exemption_description:
      null,

    has_manual_absence:
      0,

    manual_absence_data:
      null,
  };
}

function createCustomShiftDutyRestRecord({
  attendanceDate,
  subject,
  sessionType,
}) {
  return {
    attendance_date: attendanceDate,
    subject_type: "STAFF",
    subject_id: subject.subject_id,
    employee_id: subject.employee_id,
    session_type: sessionType,
    timetable_id: null,
    timetable_name: "Custom Shift Duty Rest",
    window_start: null,
    window_end: null,
    early_window_start: null,
    late_window_end: null,
    selected_punch: null,
    transaction_id: null,
    attendance_status: "EXEMPT",
    timing_status: "EXEMPT",
    timing_minutes: null,
    exemption_type: "DUTY_REST",
    exemption_record_id: null,
    exemption_description: "Custom Shift Duty Rest",
    has_manual_absence: 0,
    manual_absence_data: null,
  };
}

/*
|--------------------------------------------------------------------------
| PROCESS SESSION
|--------------------------------------------------------------------------
*/

function processSession({
  attendanceDate,
  subject,
  timetable,
  sessionType,
  punchMap,
  exceptionMaps,
}) {
  if (!timetable) {
    return createNoTimetableRecord({
      attendanceDate,
      subject,
      sessionType,
    });
  }

  const window =
    buildSessionWindow(
      attendanceDate,
      timetable,
      sessionType
    );

  const windowStart =
    sqlDateTime(
      window.start
    );

  const windowEnd =
    sqlDateTime(
      window.end
    );

  const earlyWindowStart =
    sqlDateTime(
      window.earlyStart
    );

  const lateWindowEnd =
    sqlDateTime(
      window.lateEnd
    );

  const manualAbsences =
    getManualAbsencesForWindow(
      subject,
      window,
      exceptionMaps
    );

  /*
  |--------------------------------------------------------------------------
  | TRAINING DROP
  |--------------------------------------------------------------------------
  */

  const trainingDrop =
    findTrainingDropForWindow(
      subject,
      window,
      exceptionMaps
    );

  /*
  |--------------------------------------------------------------------------
  | PUNCHES
  |--------------------------------------------------------------------------
  |
  | Punches jo exact Training Drop interval ke andar hain wo attendance punch
  | ke taur par count nahi honge.
  |
  | Punch before Drop or at/after Rejoin remains valid.
  |--------------------------------------------------------------------------
  */

  const rawPunches =
    punchMap.get(
      String(
        subject.employee_id ||
        ""
      ).trim()
    ) ||
    [];

  const eligiblePunches =
    removeDroppedPunches(
      subject,
      rawPunches,
      exceptionMaps
    );

  const selected =
    choosePunch(
      eligiblePunches,
      window
    );

  /*
  |--------------------------------------------------------------------------
  | VALID PUNCH WINS
  |--------------------------------------------------------------------------
  |
  | Example:
  |
  | Morning punch 06:00
  | Drop 08:00
  |
  | 06:00 punch occurred before Drop, so Morning remains Present.
  |--------------------------------------------------------------------------
  */

  if (selected) {
    return {
      attendance_date:
        attendanceDate,

      subject_type:
        subject.subject_type,

      subject_id:
        subject.subject_id,

      employee_id:
        subject.employee_id,

      session_type:
        sessionType,

      timetable_id:
        timetable.id,

      timetable_name:
        timetable.timetable_name,

      window_start:
        windowStart,

      window_end:
        windowEnd,

      early_window_start:
        earlyWindowStart,

      late_window_end:
        lateWindowEnd,

      selected_punch:
        sqlDateTime(
          selected.punch.date
        ),

      transaction_id:
        selected.punch.id,

      attendance_status:
        selected.attendanceStatus,

      timing_status:
        selected.timingStatus,

      timing_minutes:
        selected.timingMinutes,

      exemption_type:
        null,

      exemption_record_id:
        null,

      exemption_description:
        null,

      has_manual_absence:
        manualAbsences.length
          ? 1
          : 0,

      manual_absence_data:
        manualAbsences,
    };
  }

  /*
  |--------------------------------------------------------------------------
  | TRAINING DROP EXEMPTION
  |--------------------------------------------------------------------------
  |
  | No valid non-drop punch exists and Training Drop overlaps session.
  |--------------------------------------------------------------------------
  */

  if (trainingDrop) {
    return {
      attendance_date:
        attendanceDate,

      subject_type:
        subject.subject_type,

      subject_id:
        subject.subject_id,

      employee_id:
        subject.employee_id,

      session_type:
        sessionType,

      timetable_id:
        timetable.id,

      timetable_name:
        timetable.timetable_name,

      window_start:
        windowStart,

      window_end:
        windowEnd,

      early_window_start:
        earlyWindowStart,

      late_window_end:
        lateWindowEnd,

      selected_punch:
        null,

      transaction_id:
        null,

      attendance_status:
        "EXEMPT",

      timing_status:
        "EXEMPT",

      timing_minutes:
        null,

      exemption_type:
        "TRAINING_DROP",

      exemption_record_id:
        trainingDrop.id,

      exemption_description:
        trainingDrop.reason ||
        "Training Drop",

      has_manual_absence:
        manualAbsences.length
          ? 1
          : 0,

      manual_absence_data:
        manualAbsences,
    };
  }

  /*
  |--------------------------------------------------------------------------
  | LEAVE / OSD / HOME REST
  |--------------------------------------------------------------------------
  */

  const exemption =
    resolveException({
      subject,
      window,
      maps:
        exceptionMaps,
    });

  if (exemption) {
    return {
      attendance_date:
        attendanceDate,

      subject_type:
        subject.subject_type,

      subject_id:
        subject.subject_id,

      employee_id:
        subject.employee_id,

      session_type:
        sessionType,

      timetable_id:
        timetable.id,

      timetable_name:
        timetable.timetable_name,

      window_start:
        windowStart,

      window_end:
        windowEnd,

      early_window_start:
        earlyWindowStart,

      late_window_end:
        lateWindowEnd,

      selected_punch:
        null,

      transaction_id:
        null,

      attendance_status:
        "EXEMPT",

      timing_status:
        "EXEMPT",

      timing_minutes:
        null,

      exemption_type:
        exemption.type,

      exemption_record_id:
        exemption.id,

      exemption_description:
        exemption.description,

      has_manual_absence:
        manualAbsences.length
          ? 1
          : 0,

      manual_absence_data:
        manualAbsences,
    };
  }

  /*
  |--------------------------------------------------------------------------
  | ABSENT
  |--------------------------------------------------------------------------
  */

  return {
    attendance_date:
      attendanceDate,

    subject_type:
      subject.subject_type,

    subject_id:
      subject.subject_id,

    employee_id:
      subject.employee_id,

    session_type:
      sessionType,

    timetable_id:
      timetable.id,

    timetable_name:
      timetable.timetable_name,

    window_start:
      windowStart,

    window_end:
      windowEnd,

    early_window_start:
      earlyWindowStart,

    late_window_end:
      lateWindowEnd,

    selected_punch:
      null,

    transaction_id:
      null,

    attendance_status:
      "ABSENT",

    timing_status:
      "NO_PUNCH",

    timing_minutes:
      null,

    exemption_type:
      null,

    exemption_record_id:
      null,

    exemption_description:
      null,

    has_manual_absence:
      manualAbsences.length
        ? 1
        : 0,

    manual_absence_data:
      manualAbsences,
  };
}

/*
|--------------------------------------------------------------------------
| PROCESS DATE
|--------------------------------------------------------------------------
*/

async function processAttendanceDateUnlocked({
  attendanceDate,
  subjectType = null,
}) {
  const startedAt =
    Date.now();

  const date =
    normalizeDate(
      attendanceDate
    );

  const normalizedType =
    subjectType
      ? String(
          subjectType
        )
          .trim()
          .toUpperCase()
      : null;

  if (
    normalizedType &&
    ![
      "TRAINEE",
      "STAFF",
    ].includes(
      normalizedType
    )
  ) {
    throw new Error(
      "subject_type must be TRAINEE or STAFF."
    );
  }

  /*
  |--------------------------------------------------------------------------
  | SUBJECTS + TIMETABLES
  |--------------------------------------------------------------------------
  */

  const [
    rawSubjects,
    timetableRows,
    shiftControlledStaffSubjectIds,
    actualShiftDutyStaffSubjectIds,
    customShiftRestMemberships,
  ] =
    await Promise.all([
      getSubjects(
        date,
        normalizedType
      ),

      getTimetableAssignments(
        date
      ),

      normalizedType ===
        "TRAINEE"
        ? Promise.resolve(new Set())
        : getShiftControlledStaffIdsForDate(
            date
          ),

      normalizedType ===
        "TRAINEE"
        ? Promise.resolve(new Set())
        : getShiftDutyStaffIdsForDate(
            date
          ),

      normalizedType ===
        "TRAINEE"
        ? Promise.resolve([])
        : getCustomShiftDutyRestMembershipsForDate(
            date
          ),
    ]);

  /*
  |--------------------------------------------------------------------------
  | STAFF ON SHIFT DUTY
  |--------------------------------------------------------------------------
  |
  | A Staff member assigned to either an ACTIVE Security Duty Roster or an
  | ACTIVE Custom Shift is deliberately removed from normal Staff timetable
  | processing for that date. Their attendance is calculated exclusively from
  | the applicable Shift biometric windows.
  |
  | This prevents a night-shift / custom-shift Staff member from becoming a
  | false regular-timetable ABSENT on cards, pie charts and attendance reports.
  | Trainees remain Course-timetable based even when named on a Duty Roster.
  |
  |--------------------------------------------------------------------------
  */

  const shiftControlledStaffSet =
    shiftControlledStaffSubjectIds instanceof Set
      ? shiftControlledStaffSubjectIds
      : new Set(
          (shiftControlledStaffSubjectIds || [])
            .map(Number)
            .filter(
              (id) =>
                Number.isInteger(id) &&
                id > 0
            )
        );

  const actualShiftDutyStaffSet =
    actualShiftDutyStaffSubjectIds instanceof Set
      ? actualShiftDutyStaffSubjectIds
      : new Set(
          (actualShiftDutyStaffSubjectIds || [])
            .map(Number)
            .filter(
              (id) =>
                Number.isInteger(id) &&
                id > 0
            )
        );

  const customShiftRestStaffSet =
    new Set(
      (customShiftRestMemberships || [])
        .map((row) => Number(row.staff_id))
        .filter(
          (id) =>
            Number.isInteger(id) &&
            id > 0 &&
            !actualShiftDutyStaffSet.has(id)
        )
    );

  const customShiftRestSubjects =
    rawSubjects.filter(
      (subject) =>
        subject.subject_type === "STAFF" &&
        customShiftRestStaffSet.has(
          Number(subject.subject_id)
        )
    );

  const timetableSubjects =
    rawSubjects.filter(
      (subject) =>
        !(
          subject.subject_type ===
            "STAFF" &&
          shiftControlledStaffSet.has(
            Number(
              subject.subject_id
            )
          )
        )
    );

  /*
  |--------------------------------------------------------------------------
  | AMBIGUOUS BIOMETRIC ID PROTECTION
  |--------------------------------------------------------------------------
  |
  | Combined processing:
  |
  | TRAINEE 15 + STAFF 8 with Employee ID 123
  |
  | or
  |
  | Two Trainee Course records with Employee ID 123 covering same date
  |
  | => NO GUESS.
  |--------------------------------------------------------------------------
  */

  const ambiguousKeys =
    findAmbiguousSubjects(
      timetableSubjects
    );

  const ambiguousSubjects =
    timetableSubjects.filter(
      (subject) =>
        ambiguousKeys.has(
          subjectKey(
            subject.subject_type,
            subject.subject_id
          )
        )
    );

  const subjects =
    timetableSubjects.filter(
      (subject) =>
        !ambiguousKeys.has(
          subjectKey(
            subject.subject_type,
            subject.subject_id
          )
        )
    );

  /*
  |--------------------------------------------------------------------------
  | TIMETABLE MAP
  |--------------------------------------------------------------------------
  */

  const timetableMaps =
    buildTimetableMaps(
      timetableRows
    );

  const workItems = [];

  let globalStart =
    null;

  let globalEnd =
    null;

  for (
    const subject of subjects
  ) {
    const timetable =
      getTimetableForSubject(
        subject,
        timetableMaps
      );

    for (
      const sessionType of [
        "MORNING",
        "EVENING",
      ]
    ) {
      if (timetable) {
        const window =
          buildSessionWindow(
            date,
            timetable,
            sessionType
          );

        if (
          !globalStart ||
          window.earlyStart <
            globalStart
        ) {
          globalStart =
            window.earlyStart;
        }

        if (
          !globalEnd ||
          window.lateEnd >
            globalEnd
        ) {
          globalEnd =
            window.lateEnd;
        }
      }

      workItems.push({
        subject,
        timetable,
        sessionType,
      });
    }
  }

  /*
  |--------------------------------------------------------------------------
  | PUNCH + EXCEPTIONS
  |--------------------------------------------------------------------------
  */

  let punches = [];

  let exceptionData = {
    leaves: [],
    osd: [],
    homeRest: [],
    trainingDrop: [],
    manualAbsence: [],
    longWeekend: [],
  };

  if (
    globalStart &&
    globalEnd
  ) {
    const employeeIds =
      subjects.map(
        (subject) =>
          subject.employee_id
      );

    const startDatetime =
      sqlDateTime(
        globalStart
      );

    const endDatetime =
      sqlDateTime(
        globalEnd
      );

    const [
      loadedPunches,
      loadedExceptionData,
      weekendRows,
    ] =
      await Promise.all([
        getPunchesBulk({
          employeeIds,

          startDatetime,

          endDatetime,
        }),

        getExceptionData({
          subjectType:
            normalizedType,

          startDatetime,

          endDatetime,
        }),

        normalizedType ===
          "STAFF"
          ? Promise.resolve([])
          : getWeekends(),
      ]);

    punches =
      loadedPunches;

    exceptionData = {
      ...loadedExceptionData,

      longWeekend:
        buildLongWeekendExceptionRows(
          weekendRows
        ),
    };
  }

  const punchMap =
    buildPunchMap(
      punches
    );

  const exceptionMaps =
    buildExceptionMaps(
      exceptionData
    );

  const records = [];

  const summary = {
    date,

    subject_type:
      normalizedType ||
      "ALL",

    subjects:
      subjects.length,

    ambiguous_subjects:
      ambiguousSubjects.length,

    /* Backward-compatible key retained for existing logs/clients. */
    duty_roster_staff:
      actualShiftDutyStaffSet.size,

    shift_duty_staff:
      actualShiftDutyStaffSet.size,

    custom_shift_duty_rest:
      customShiftRestStaffSet.size,

    shift_duty: {
      security: null,
      custom: null,
    },

    records:
      0,

    present:
      0,

    absent:
      0,

    exempt:
      0,

    no_timetable:
      0,

    early:
      0,

    in_time:
      0,

    late:
      0,

    manual_absence:
      0,

    failed:
      0,

    failures:
      [],

    duration_ms:
      0,
  };

  /*
  |--------------------------------------------------------------------------
  | AMBIGUITY FAILURES
  |--------------------------------------------------------------------------
  */

  for (
    const subject of
    ambiguousSubjects
  ) {
    summary.failed += 1;

    summary.failures.push({
      employee_id:
        subject.employee_id,

      subject_type:
        subject.subject_type,

      subject_id:
        subject.subject_id,

      session_type:
        null,

      error:
        "Employee ID / Cap No. maps to more than one eligible subject on this attendance date. Attendance was not guessed.",
    });
  }

  /*
  |--------------------------------------------------------------------------
  | PROCESS
  |--------------------------------------------------------------------------
  */

  for (
    const item of workItems
  ) {
    try {
      const result =
        processSession({
          attendanceDate:
            date,

          subject:
            item.subject,

          timetable:
            item.timetable,

          sessionType:
            item.sessionType,

          punchMap,

          exceptionMaps,
        });

      records.push(
        result
      );

      summary.records += 1;

      if (
        result.attendance_status ===
        "PRESENT"
      ) {
        summary.present += 1;
      }

      if (
        result.attendance_status ===
        "ABSENT"
      ) {
        summary.absent += 1;
      }

      if (
        result.attendance_status ===
        "EXEMPT"
      ) {
        summary.exempt += 1;
      }

      if (
        result.attendance_status ===
        "NO_TIMETABLE"
      ) {
        summary.no_timetable += 1;
      }

      if (
        result.timing_status ===
        "EARLY"
      ) {
        summary.early += 1;
      }

      if (
        result.timing_status ===
        "IN_TIME"
      ) {
        summary.in_time += 1;
      }

      if (
        result.timing_status ===
        "LATE"
      ) {
        summary.late += 1;
      }

      if (
        result.has_manual_absence
      ) {
        summary.manual_absence +=
          1;
      }
    } catch (error) {
      summary.failed += 1;

      summary.failures.push({
        employee_id:
          item.subject
            .employee_id,

        subject_type:
          item.subject
            .subject_type,

        subject_id:
          item.subject
            .subject_id,

        session_type:
          item.sessionType,

        error:
          error.message,
      });
    }
  }

  /*
  |--------------------------------------------------------------------------
  | CUSTOM SHIFT DUTY REST
  |--------------------------------------------------------------------------
  |
  | Staff who belong to an active Custom Shift Group but are not scheduled
  | for duty on this date remain under Custom Shift control. They must not
  | fall back to the Regular Staff Timetable. A full-day Duty Rest attendance
  | record is saved for both Staff sessions.
  |
  | If the same Staff member has an actual Security/Custom Shift assignment
  | on this date, actual Shift Duty wins and no Duty Rest record is generated.
  |--------------------------------------------------------------------------
  */

  for (const subject of customShiftRestSubjects) {
    for (const sessionType of ["MORNING", "EVENING"]) {
      const restRecord = createCustomShiftDutyRestRecord({
        attendanceDate: date,
        subject,
        sessionType,
      });

      records.push(restRecord);
      summary.records += 1;
      summary.exempt += 1;
    }
  }

  /*
  |--------------------------------------------------------------------------
  | STALE CLEANUP
  |--------------------------------------------------------------------------
  |
  | Exact pair:
  |
  | subject_type + subject_id
  |--------------------------------------------------------------------------
  */

  await removeStaleAttendanceRecords({
    attendanceDate:
      date,

    subjectType:
      normalizedType,

    subjects,
  });

  /*
  |--------------------------------------------------------------------------
  | SAVE
  |--------------------------------------------------------------------------
  */

  await saveAttendanceBulk(
    records
  );

  /*
  |--------------------------------------------------------------------------
  | SHIFT DUTY ATTENDANCE
  |--------------------------------------------------------------------------
  |
  | Regular Staff timetable records have already excluded every Staff member
  | assigned to Security or Custom Shift Duty. Now calculate the two Shift
  | sources from their own biometric windows so the same Staff member is never
  | counted in both attendance systems for the selected date.
  |
  | Approved Leave / OSD / Home Rest may exempt a Shift assignment. Duty Rest
  | does NOT exempt Shift Duty; Shift Duty has priority over Duty Rest.
  |--------------------------------------------------------------------------
  */

  if (
    normalizedType === null ||
    normalizedType === "STAFF"
  ) {
    const [
      securityShiftResult,
      customShiftResult,
    ] = await Promise.all([
      calculateDutyRosterAttendance(
        date
      ),
      calculateCustomShiftAttendance(
        date
      ),
    ]);

    summary.shift_duty = {
      security: {
        total:
          Number(
            securityShiftResult?.total ||
            0
          ),
        summary:
          securityShiftResult?.summary ||
          {},
      },
      custom: {
        total:
          Number(
            customShiftResult?.total ||
            0
          ),
        summary:
          customShiftResult?.summary ||
          {},
      },
    };
  }

  summary.duration_ms =
    Date.now() -
    startedAt;

  return summary;
}

function processAttendanceDate(args) {
  const { runExclusive } = require("../integrations/zkbiotime/syncCoordinator");
  return runExclusive("attendance-recalculation", () => processAttendanceDateUnlocked(args));
}

module.exports = {
  processAttendanceDate,

  processSession,

  choosePunch,

  buildSessionWindow,
};