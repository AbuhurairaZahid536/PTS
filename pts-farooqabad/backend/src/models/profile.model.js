const { pool } = require("../config/db");

const {
  getProfileContinuousAbsenceHistory,
} = require("./profileAbsence.model");
/*
|--------------------------------------------------------------------------
| HELPERS
|--------------------------------------------------------------------------
*/

function normalizeSubjectType(value) {
  const type = String(value || "")
    .trim()
    .toUpperCase();

  if (type !== "TRAINEE" && type !== "STAFF") {
    return null;
  }

  return type;
}

/*
|--------------------------------------------------------------------------
| PERSON
|--------------------------------------------------------------------------
*/

async function getProfilePerson({ subjectType, subjectId }) {
  const type = normalizeSubjectType(subjectType);

  if (!type) {
    return null;
  }

  if (type === "TRAINEE") {
    const [rows] = await pool.query(
      `
          SELECT
            t.*,

            c.course_name,
            c.course_code,

            p.platoon_number,
            p.platoon_name

          FROM trainees t

          LEFT JOIN courses c
            ON c.id =
               t.course_id

          LEFT JOIN platoons p
            ON p.id =
               t.platoon_id

          WHERE
            t.id =
              :subjectId

          LIMIT 1
        `,
      {
        subjectId,
      },
    );

    return rows[0] || null;
  }

  const [rows] = await pool.query(
    `
        SELECT
          s.*,

          sc.category_name,

          sb.branch_name

        FROM staff s

        LEFT JOIN staff_categories sc
          ON sc.id =
             s.category_id

        LEFT JOIN staff_branches sb
          ON sb.id =
             s.branch_id

        WHERE
          s.id =
            :subjectId

        LIMIT 1
      `,
    {
      subjectId,
    },
  );

  return rows[0] || null;
}

/*
|--------------------------------------------------------------------------
| TRAINEE COURSE HISTORY
|--------------------------------------------------------------------------
*/

async function getTraineeCourseHistory(employeeId) {
  if (!employeeId) {
    return [];
  }

  const [rows] = await pool.query(
    `
        SELECT
          t.id,
          t.employee_id,

          t.first_name,
          t.last_name,
          t.father_name,

          t.course_id,
          c.course_name,
          c.course_code,

          t.platoon_id,
          p.platoon_number,
          p.platoon_name,

          t.training_start_date,
          t.training_end_date,

          t.status,

          t.zkteco_synced,

          t.created_at,
          t.updated_at

        FROM trainees t

        LEFT JOIN courses c
          ON c.id =
             t.course_id

        LEFT JOIN platoons p
          ON p.id =
             t.platoon_id

        WHERE
          TRIM(
            t.employee_id
          ) =
          :employeeId

        ORDER BY
          t.id DESC
      `,
    {
      employeeId: String(employeeId).trim(),
    },
  );

  return rows;
}

/*
|--------------------------------------------------------------------------
| ATTENDANCE
|--------------------------------------------------------------------------
*/

async function getProfileAttendance({ subjectType, subjectId }) {
  const [rows] = await pool.query(
    `
        SELECT
          ar.*

        FROM attendance_records ar

        WHERE
          ar.subject_type =
            :subjectType

          AND ar.subject_id =
            :subjectId

        ORDER BY
          ar.attendance_date DESC,

          CASE
            WHEN
              ar.session_type =
              'MORNING'
            THEN 1

            ELSE 2
          END,

          ar.id DESC
      `,
    {
      subjectType,
      subjectId,
    },
  );

  return rows;
}

/*
|--------------------------------------------------------------------------
| ATTENDANCE SUMMARY
|--------------------------------------------------------------------------
*/

async function getProfileAttendanceSummary({ subjectType, subjectId }) {
  const [rows] = await pool.query(
    `
        SELECT
          COUNT(*) AS total_sessions,

          SUM(
            attendance_status =
            'PRESENT'
          ) AS present,

          SUM(
            attendance_status =
            'ABSENT'
          ) AS absent,

          SUM(
            attendance_status =
            'EXEMPT'
          ) AS exempt,

          SUM(
            attendance_status =
            'NO_TIMETABLE'
          ) AS no_timetable,

          SUM(
            timing_status =
            'EARLY'
          ) AS early,

          SUM(
            timing_status =
            'IN_TIME'
          ) AS in_time,

          SUM(
            timing_status =
            'LATE'
          ) AS late,

          SUM(
            has_manual_absence =
            1
          ) AS manual_absence

        FROM attendance_records

        WHERE
          subject_type =
            :subjectType

          AND subject_id =
            :subjectId
      `,
    {
      subjectType,
      subjectId,
    },
  );

  const row = rows[0] || {};

  return {
    total_sessions: Number(row.total_sessions || 0),

    present: Number(row.present || 0),

    absent: Number(row.absent || 0),

    exempt: Number(row.exempt || 0),

    no_timetable: Number(row.no_timetable || 0),

    early: Number(row.early || 0),

    in_time: Number(row.in_time || 0),

    late: Number(row.late || 0),

    manual_absence: Number(row.manual_absence || 0),
  };
}

/*
|--------------------------------------------------------------------------
| GENERIC SUBJECT HISTORY
|--------------------------------------------------------------------------
|
| Tables ka actual complete schema different ho sakta hai.
| SELECT * intentionally rakha gaya hai taa-ke complete record profile
| mein available ho.
|--------------------------------------------------------------------------
*/

async function getSubjectTableHistory({
  subjectType,
  subjectId,
  traineeTable,
  staffTable,
  traineeIdColumn = "trainee_id",
  staffIdColumn = "staff_id",
  orderColumn = "id",
}) {
  const isTrainee = subjectType === "TRAINEE";

  const table = isTrainee ? traineeTable : staffTable;

  const idColumn = isTrainee ? traineeIdColumn : staffIdColumn;

  if (!table) {
    return [];
  }

  const [rows] = await pool.query(
    `
        SELECT *

        FROM ${table}

        WHERE
          ${idColumn} =
            :subjectId

        ORDER BY
          ${orderColumn} DESC
      `,
    {
      subjectId,
    },
  );

  return rows;
}

/*
|--------------------------------------------------------------------------
| TRAINING DROP
|--------------------------------------------------------------------------
*/

async function getTrainingDropHistory(traineeId) {
  const [rows] = await pool.query(
    `
        SELECT *

        FROM trainee_training_drop

        WHERE
          trainee_id =
            :traineeId

        ORDER BY
          id DESC
      `,
    {
      traineeId,
    },
  );

  return rows;
}

/*
|--------------------------------------------------------------------------
| TRAINEE LONG WEEKEND / DEPARTURE HISTORY
|--------------------------------------------------------------------------
*/

async function getTraineeLongWeekendHistory(traineeId) {
  const [rows] = await pool.query(
    `
        SELECT
          wda.id,
          wda.weekend_id,

          aw.weekend_name,

          aw.start_datetime,
          aw.end_datetime,

          aw.departure_early_minutes,
          aw.departure_late_minutes,

          wda.departure_date,

          wda.window_start,
          wda.window_end,

          wda.punch_transaction_id,
          wda.punch_time,

          wda.attendance_status,

          wda.calculated_at,
          wda.recalculated_at

        FROM weekend_departure_attendance wda

        INNER JOIN attendance_weekends aw
          ON aw.id =
             wda.weekend_id

        WHERE
          wda.trainee_id =
            :traineeId

        ORDER BY
          wda.departure_date DESC,
          wda.weekend_id DESC
      `,
    {
      traineeId: Number(traineeId),
    },
  );

  const summary = {
    total_long_weekends: 0,

    departure_present: 0,

    departure_absent: 0,

    detained: 0,
  };

  for (const row of rows) {
    const status = String(row.attendance_status || "")
      .trim()
      .toUpperCase();

    if (status === "PRESENT") {
      summary.departure_present += 1;

      summary.total_long_weekends += 1;
    } else if (status === "ABSENT") {
      summary.departure_absent += 1;

      summary.total_long_weekends += 1;
    } else if (status === "DETAINED") {
      summary.detained += 1;
    }
  }

  return {
    summary,
    records: rows,
  };
}

/*
|--------------------------------------------------------------------------
| STAFF CUSTOM SHIFT DUTY HISTORY
|--------------------------------------------------------------------------
|
| Reads persisted custom_shift_attendance only. It intentionally does not
| recalculate old dates from current configuration. Superseded rows remain
| in the database for audit, but do not double-count in the profile once
| attendance for the newer effective version has been calculated.
|--------------------------------------------------------------------------
*/

async function getStaffCustomShiftHistory(staffId) {
  const [rows] = await pool.query(
    `
      SELECT
        csa.id,
        DATE(csa.attendance_date) AS attendance_date,

        csa.group_id,
        csg.group_name,

        csa.shift_id,
        csd.shift_name,
        csd.duty_point_name,
        csd.start_time,
        csd.end_time,

        csa.start_window_from,
        csa.start_window_to,
        csa.end_window_from,
        csa.end_window_to,

        csa.start_punch_time,
        csa.end_punch_time,

        csa.attendance_status,
        csa.checkout_status,

        csa.exemption_type,
        csa.exemption_description,

        csa.calculated_at,
        csa.recalculated_at

      FROM custom_shift_attendance csa

      INNER JOIN custom_shift_groups csg
        ON csg.id = csa.group_id

      INNER JOIN custom_shift_definitions csd
        ON csd.id = csa.shift_id

      WHERE csa.staff_id = :staffId
        AND NOT EXISTS (
          SELECT 1
          FROM custom_shift_attendance replacement
          INNER JOIN custom_shift_groups replacement_group
            ON replacement_group.id = replacement.group_id
          WHERE replacement.staff_id = csa.staff_id
            AND replacement.attendance_date = csa.attendance_date
            AND replacement.group_id <> csa.group_id
            AND replacement_group.is_active = 1
            AND replacement.attendance_date
                BETWEEN replacement_group.start_date AND replacement_group.end_date
            AND (
              csg.is_active = 0
              OR csa.attendance_date NOT BETWEEN csg.start_date AND csg.end_date
            )
        )

      ORDER BY
        csa.attendance_date DESC,
        csd.sort_order ASC,
        csa.id DESC
    `,
    {
      staffId: Number(staffId),
    },
  );

  const summary = {
    total: 0,
    present: 0,
    absent: 0,
    exempt: 0,
    pending: 0,
    checked_out: 0,
    missing_checkout: 0,
  };

  for (const row of rows) {
    summary.total += 1;

    const status = String(row.attendance_status || "").trim().toUpperCase();
    const checkoutStatus = String(row.checkout_status || "").trim().toUpperCase();

    if (status === "PRESENT") {
      summary.present += 1;
    } else if (status === "ABSENT") {
      summary.absent += 1;
    } else if (status === "EXEMPT") {
      summary.exempt += 1;
    } else if (status === "PENDING") {
      summary.pending += 1;
    }

    if (checkoutStatus === "CHECKED_OUT") {
      summary.checked_out += 1;
    } else if (checkoutStatus === "MISSING") {
      summary.missing_checkout += 1;
    }
  }

  return {
    summary,
    records: rows,
  };
}

/*
|--------------------------------------------------------------------------
| AUDIT LOGS
|--------------------------------------------------------------------------
*/

async function getAuditHistory({ subjectType, subjectId, employeeId }) {
  const module = subjectType === "TRAINEE" ? "TRAINEE" : "STAFF";

  const employeeSearch = employeeId ? `%${String(employeeId).trim()}%` : null;

  const [rows] = await pool.query(
    `
        SELECT
          al.*,

          u.username

        FROM audit_logs al

        LEFT JOIN users u
          ON u.id =
             al.user_id

        WHERE
          (
            (
              al.module =
                :module

              AND al.record_id =
                :recordId
            )

            OR
            (
              :employeeSearch IS NOT NULL

              AND
              (
                al.description
                  LIKE :employeeSearch

                OR al.old_data
                  LIKE :employeeSearch

                OR al.new_data
                  LIKE :employeeSearch
              )
            )
          )

        ORDER BY
          al.id DESC
      `,
    {
      module,

      recordId: String(subjectId),

      employeeSearch,
    },
  );

  return rows;
}

/*
|--------------------------------------------------------------------------
| COMPLETE PROFILE
|--------------------------------------------------------------------------
*/

async function getCompleteProfile({ subjectType, subjectId }) {
  const type = normalizeSubjectType(subjectType);

  if (!type) {
    throw new Error("Invalid profile subject type.");
  }

  const person = await getProfilePerson({
    subjectType: type,

    subjectId,
  });

  if (!person) {
    return null;
  }

  const [
    attendance,
    attendanceSummary,
    continuousAbsence,
    manualAbsence,
    leaves,
    osdPermission,
    outdoorMedical,
    audit,
  ] = await Promise.all([
    getProfileAttendance({
      subjectType: type,

      subjectId,
    }),

    getProfileAttendanceSummary({
      subjectType: type,

      subjectId,
    }),

    getProfileContinuousAbsenceHistory({
      subjectType: type,

      subjectId,

      employeeId: person.employee_id,
    }),

    getSubjectTableHistory({
      subjectType: type,

      subjectId,

      traineeTable: "trainee_manual_absence",

      staffTable: "staff_manual_absence",
    }),

    getSubjectTableHistory({
      subjectType: type,

      subjectId,

      traineeTable: "trainee_leaves",

      staffTable: "staff_leaves",
    }),

    getSubjectTableHistory({
      subjectType: type,

      subjectId,

      traineeTable: "trainee_osd",

      staffTable: "staff_osd",
    }),

    getSubjectTableHistory({
      subjectType: type,

      subjectId,

      traineeTable: "trainee_outdoor",

      staffTable: "staff_outdoor",
    }),

    getAuditHistory({
      subjectType: type,

      subjectId,

      employeeId: person.employee_id,
    }),
  ]);

  const trainingDrop =
    type === "TRAINEE" ? await getTrainingDropHistory(subjectId) : [];

  const courseHistory =
    type === "TRAINEE" ? await getTraineeCourseHistory(person.employee_id) : [];

  const longWeekend =
    type === "TRAINEE"
      ? await getTraineeLongWeekendHistory(subjectId)
      : {
          summary: {
            total_long_weekends: 0,

            departure_present: 0,

            departure_absent: 0,

            detained: 0,
          },

          records: [],
        };

  const customShiftDuty =
    type === "STAFF"
      ? await getStaffCustomShiftHistory(subjectId)
      : {
          summary: {
            total: 0,
            present: 0,
            absent: 0,
            exempt: 0,
            pending: 0,
            checked_out: 0,
            missing_checkout: 0,
          },
          records: [],
        };

  return {
    subject_type: type,

    subject_id: Number(subjectId),

    person,

    course_history: courseHistory,

    attendance: {
      summary: attendanceSummary,

      records: attendance,
    },

    continuous_absence: continuousAbsence,

    manual_absence: manualAbsence,

    leaves,

    osd_permission: osdPermission,

    outdoor_medical: outdoorMedical,

    training_drop: trainingDrop,

    long_weekend: longWeekend,

    custom_shift_duty: customShiftDuty,

    audit,
  };
}

module.exports = {
  getProfilePerson,
  getTraineeCourseHistory,

  getProfileAttendance,
  getProfileAttendanceSummary,

  getSubjectTableHistory,
  getTrainingDropHistory,
  getTraineeLongWeekendHistory,
  getStaffCustomShiftHistory,
  getAuditHistory,

  getCompleteProfile,
};
