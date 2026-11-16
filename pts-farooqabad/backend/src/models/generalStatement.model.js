const {
  pool,
} = require("../config/db");


const LEGACY_STAFF_COURSE_PATTERNS = [
  "admin%",
  "dhobi khana%",
  "%washing branch%",
  "class 4 staff%",
  "line staff%",
  "drill instructor%",
  "drill staff%",
  "law instructor%",
  "menial staff%",
  "ministerial staff%",
  "security staff%",
  "band staff%",
  "cl staff%",
  "weapon staff%",
];

function legacyStaffCourseExclusionSql(
  alias = "c",
  indent = "          "
) {
  const nameSql =
    `LOWER(TRIM(COALESCE(${alias}.course_name, '')))`;

  return LEGACY_STAFF_COURSE_PATTERNS
    .map(
      (pattern) =>
        `${nameSql} NOT LIKE '${String(pattern).replace(/'/g, "''")}'`
    )
    .join(`\n${indent}AND\n${indent}`);
}

function activeStaffIdentityExclusionSql(
  traineeAlias = "t"
) {
  return `
    NOT EXISTS
    (
      SELECT 1

      FROM staff staff_identity

      WHERE
        staff_identity.is_deleted = 0

        AND
        TRIM(
          CAST(
            staff_identity.employee_id
            AS CHAR
          )
        ) =
        TRIM(
          CAST(
            ${traineeAlias}.employee_id
            AS CHAR
          )
        )
    )
  `;
}


/*
|--------------------------------------------------------------------------
| HELPERS
|--------------------------------------------------------------------------
*/

function placeholders(
  values
) {
  return values
    .map(
      () => "?"
    )
    .join(",");
}


function personName(
  row
) {
  return [
    row.first_name,
    row.last_name,
  ]
    .filter(Boolean)
    .join(" ")
    .trim();
}


function platoonLabel(
  value
) {
  return (
    value === null ||
    value === undefined ||
    value === ""
  )
    ? "Unassigned"
    : `Platoon ${value}`;
}


function rowsByTrainee(
  rows
) {
  const map =
    new Map();

  for (
    const row
    of rows || []
  ) {
    const id =
      Number(
        row.trainee_id
      );

    if (
      !map.has(
        id
      )
    ) {
      map.set(
        id,
        []
      );
    }

    map
      .get(id)
      .push(row);
  }

  return map;
}


function firstMatching(
  rows,
  predicate
) {
  return (
    (rows || [])
      .find(
        predicate
      ) ||
    null
  );
}


function periodContains(
  statementDatetime,
  startValue,
  endValue
) {
  if (
    !startValue ||
    !endValue
  ) {
    return false;
  }

  const point =
    new Date(
      String(
        statementDatetime
      ).replace(
        " ",
        "T"
      )
    );

  const start =
    new Date(
      startValue
    );

  const end =
    new Date(
      endValue
    );

  if (
    Number.isNaN(
      point.getTime()
    ) ||
    Number.isNaN(
      start.getTime()
    ) ||
    Number.isNaN(
      end.getTime()
    )
  ) {
    return false;
  }

  return (
    start <= point &&
    end >= point
  );
}


/*
|--------------------------------------------------------------------------
| ACTIVE COURSES FOR SIDEBAR
|--------------------------------------------------------------------------
|
| IMPORTANT:
|
| Course lifecycle source of truth:
|
| start_date + end_date
|
| Legacy courses.is_active is NOT used here.
|
| DATE_NOT_SET:
|   excluded
|
| UPCOMING:
|   excluded
|
| ACTIVE today:
|   included
|
| COMPLETED:
|   excluded from current sidebar
|
|--------------------------------------------------------------------------
*/

async function getActiveGeneralStatementCourses() {
  const [
    rows,
  ] =
    await pool.query(
      `
        SELECT
          c.id,
          c.course_name,
          c.course_code,

          c.start_date,
          c.end_date,

          COUNT(
            t.id
          )
            AS total_strength

        FROM courses c

        LEFT JOIN trainees t
          ON
            t.course_id =
            c.id

          AND
            t.is_deleted = 0

          AND
            t.is_staff_exempt = 0

          AND
            ${activeStaffIdentityExclusionSql(
              "t"
            )}

        WHERE
          c.start_date
            IS NOT NULL

          AND
          c.end_date
            IS NOT NULL

          AND
          DATE(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+05:00'))
          BETWEEN
            c.start_date
          AND
            c.end_date

          AND
          ${legacyStaffCourseExclusionSql(
            "c"
          )}

        GROUP BY
          c.id,
          c.course_name,
          c.course_code,
          c.start_date,
          c.end_date

        ORDER BY
          c.start_date DESC,
          c.course_name ASC
      `
    );

  return rows.map(
    (
      row
    ) => ({
      ...row,

      total_strength:
        Number(
          row.total_strength ||
          0
        ),
    })
  );
}


/*
|--------------------------------------------------------------------------
| COURSE FOR SELECTED STATEMENT DATE
|--------------------------------------------------------------------------
|
| IMPORTANT:
|
| Selected statement date is the source of truth.
|
| Example:
|
| Course:
|   01-Jan-2026 -> 30-Jun-2026
|
| Today:
|   Sep-2026
|
| Statement Date:
|   15-Mar-2026
|
| Result:
|   VALID
|
| Historical General Statement therefore remains available after Course
| completion.
|
| Legacy is_active does NOT control this query.
|
|--------------------------------------------------------------------------
*/

async function getCourseForStatement(
  courseId,
  statementDate
) {
  const [
    rows,
  ] =
    await pool.query(
      `
        SELECT
          c.id,
          c.course_name,
          c.course_code,

          c.start_date,
          c.end_date,

          c.is_active

        FROM courses c

        WHERE
          c.id =
            :courseId

          AND
          c.start_date
            IS NOT NULL

          AND
          c.end_date
            IS NOT NULL

          AND
          :statementDate
          BETWEEN
            c.start_date
          AND
            c.end_date

          AND
          ${legacyStaffCourseExclusionSql(
            "c"
          )}

        LIMIT 1
      `,
      {
        courseId,
        statementDate,
      }
    );

  return (
    rows[0] ||
    null
  );
}


/*
|--------------------------------------------------------------------------
| ALL TRAINEES OF COURSE
|--------------------------------------------------------------------------
|
| Training Drop trainee is intentionally included in Total Strength.
|
| Training Drop is later deducted from Total Strength to calculate:
|
| Effective Strength
|
|--------------------------------------------------------------------------
*/

async function getCourseTrainees(
  courseId
) {
  const [
    rows,
  ] =
    await pool.query(
      `
        SELECT
          t.id
            AS trainee_id,

          t.employee_id,

          t.first_name,
          t.last_name,

          t.platoon_id,

          p.platoon_number

        FROM trainees t

        LEFT JOIN platoons p
          ON
            p.id =
            t.platoon_id

        WHERE
          t.course_id =
            :courseId

          AND
          t.is_deleted = 0

          AND
          t.is_staff_exempt = 0

          AND
          ${activeStaffIdentityExclusionSql(
            "t"
          )}

        ORDER BY
          CASE
            WHEN
              p.platoon_number
              IS NULL
              THEN 1

            ELSE 0
          END,

          p.platoon_number ASC,

          t.employee_id ASC,

          t.id ASC
      `,
      {
        courseId,
      }
    );

  return rows;
}


/*
|--------------------------------------------------------------------------
| PHYSICAL STATUS DATA
|--------------------------------------------------------------------------
|
| General Statement uses physical administrative status.
|
| Biometric transactions are NOT used here.
|
|--------------------------------------------------------------------------
*/

async function getPhysicalStatusRows({
  traineeIds,
  statementDatetime,
}) {
  const ids = [
    ...new Set(
      (
        traineeIds ||
        []
      )
        .map(
          Number
        )
        .filter(
          (
            value
          ) =>
            Number.isInteger(
              value
            ) &&
            value >
              0
        )
    ),
  ];


  if (
    !ids.length
  ) {
    return {
      drops:
        [],

      leaves:
        [],

      osd:
        [],

      outdoor:
        [],

      manualAbsence:
        [],
    };
  }


  const idsSql =
    placeholders(
      ids
    );


  const [
    dropResult,
    leaveResult,
    osdResult,
    outdoorResult,
    manualResult,
  ] =
    await Promise.all([
      /*
      |--------------------------------------------------------------------------
      | TRAINING DROP / REPATRIATE
      |--------------------------------------------------------------------------
      |
      | Period:
      |
      | [drop_datetime, rejoin_datetime)
      |
      | Meaning exact rejoin time par trainee dobara effective strength mein
      | aa jata hai.
      |
      |--------------------------------------------------------------------------
      */

      pool.query(
        `
          SELECT
            id,
            trainee_id,

            drop_status,

            drop_datetime,
            rejoin_datetime,

            reason,
            order_reference

          FROM trainee_training_drop

          WHERE
            trainee_id
            IN
            (
              ${idsSql}
            )

            AND
            drop_status <>
              'CANCELLED'

            AND
            drop_datetime <= ?

            AND
            (
              rejoin_datetime
                IS NULL

              OR

              rejoin_datetime > ?
            )

          ORDER BY
            drop_datetime DESC,
            id DESC
        `,
        [
          ...ids,

          statementDatetime,
          statementDatetime,
        ]
      ),


      /*
      |--------------------------------------------------------------------------
      | LEAVE / EMERGENCY LEAVE
      |--------------------------------------------------------------------------
      */

      pool.query(
        `
          SELECT
            id,
            trainee_id,

            leave_type,
            leave_category,

            workflow_status,

            start_datetime,
            end_datetime,

            reason,
            reference_no

          FROM trainee_leaves

          WHERE
            trainee_id
            IN
            (
              ${idsSql}
            )

            AND
            workflow_status
            IN
            (
              'APPROVED',
              'COMPLETED'
            )

            AND
            start_datetime <= ?

            AND
            end_datetime >= ?

          ORDER BY
            start_datetime DESC,
            id DESC
        `,
        [
          ...ids,

          statementDatetime,
          statementDatetime,
        ]
      ),


      /*
      |--------------------------------------------------------------------------
      | OSD / PERMISSION
      |--------------------------------------------------------------------------
      */

      pool.query(
        `
          SELECT
            id,
            trainee_id,

            record_type,
            workflow_status,

            reason,
            duty_place,
            reference_no,

            start_datetime,
            end_datetime

          FROM trainee_osd

          WHERE
            trainee_id
            IN
            (
              ${idsSql}
            )

            AND
            workflow_status
            IN
            (
              'APPROVED',
              'COMPLETED'
            )

            AND
            start_datetime <= ?

            AND
            end_datetime >= ?

          ORDER BY
            start_datetime DESC,
            id DESC
        `,
        [
          ...ids,

          statementDatetime,
          statementDatetime,
        ]
      ),


      /*
      |--------------------------------------------------------------------------
      | OUTDOOR / MEDICAL REST / HOME REST
      |--------------------------------------------------------------------------
      |
      | Outdoor:
      |   single-date transaction stored internally as same-day start/end.
      |
      | Medical Rest:
      |   full From -> To Date/Time period.
      |
      | Home Rest:
      |   full From -> To Date/Time period.
      |
      |--------------------------------------------------------------------------
      */

      pool.query(
        `
          SELECT
            id,
            trainee_id,

            outdoor_purpose,
            reference_no,
            location,

            start_datetime,
            end_datetime,

            workflow_status,

            doctor_name,
            doctor_recommendation,

            medical_rest,
            medical_rest_start,
            medical_rest_end,

            home_rest,
            home_rest_start,
            home_rest_end,

            remarks

          FROM trainee_outdoor

          WHERE
            trainee_id
            IN
            (
              ${idsSql}
            )

            AND
            workflow_status
            IN
            (
              'ACTIVE',
              'COMPLETED'
            )

            AND
            (
              (
                start_datetime <= ?

                AND
                end_datetime >= ?
              )

              OR

              (
                medical_rest = 1

                AND
                medical_rest_start
                  IS NOT NULL

                AND
                medical_rest_end
                  IS NOT NULL

                AND
                medical_rest_start <= ?

                AND
                medical_rest_end >= ?
              )

              OR

              (
                home_rest = 1

                AND
                home_rest_start
                  IS NOT NULL

                AND
                home_rest_end
                  IS NOT NULL

                AND
                home_rest_start <= ?

                AND
                home_rest_end >= ?
              )
            )

          ORDER BY
            start_datetime DESC,
            id DESC
        `,
        [
          ...ids,

          statementDatetime,
          statementDatetime,

          statementDatetime,
          statementDatetime,

          statementDatetime,
          statementDatetime,
        ]
      ),


      /*
      |--------------------------------------------------------------------------
      | MANUAL ABSENCE
      |--------------------------------------------------------------------------
      |
      | General Statement mein Manual Absence ki separate column nahi.
      |
      | Manual Absence => ABSENT
      |
      |--------------------------------------------------------------------------
      */

      pool.query(
        `
          SELECT
            id,
            trainee_id,

            absence_category,
            program_class,

            start_datetime,
            end_datetime,

            reason,
            reference_no,
            remarks

          FROM trainee_manual_absence

          WHERE
            trainee_id
            IN
            (
              ${idsSql}
            )

            AND
            record_status =
              'ACTIVE'

            AND
            start_datetime <= ?

            AND
            end_datetime >= ?

          ORDER BY
            start_datetime DESC,
            id DESC
        `,
        [
          ...ids,

          statementDatetime,
          statementDatetime,
        ]
      ),
    ]);


  return {
    drops:
      dropResult[0] ||
      [],

    leaves:
      leaveResult[0] ||
      [],

    osd:
      osdResult[0] ||
      [],

    outdoor:
      outdoorResult[0] ||
      [],

    manualAbsence:
      manualResult[0] ||
      [],
  };
}


/*
|--------------------------------------------------------------------------
| CLASSIFY ONE TRAINEE
|--------------------------------------------------------------------------
|
| One trainee can appear in only ONE General Statement category.
|
| Priority order is intentional.
|
|--------------------------------------------------------------------------
*/

function classifyTrainee({
  trainee,
  statementDatetime,
  maps,
}) {
  const traineeId =
    Number(
      trainee.trainee_id
    );


  const drops =
    maps.drops.get(
      traineeId
    ) ||
    [];


  const leaves =
    maps.leaves.get(
      traineeId
    ) ||
    [];


  const osdRows =
    maps.osd.get(
      traineeId
    ) ||
    [];


  const outdoorRows =
    maps.outdoor.get(
      traineeId
    ) ||
    [];


  const manualRows =
    maps.manualAbsence.get(
      traineeId
    ) ||
    [];


  /*
  |--------------------------------------------------------------------------
  | 1. TRAINING DROP / REPATRIATE
  |--------------------------------------------------------------------------
  */

  const drop =
    drops[0] ||
    null;


  if (
    drop
  ) {
    return {
      category:
        "TRAINING_DROP_REPATRIATE",

      detail:
        drop.reason ||
        "Training Drop / Repatriate",

      reference_no:
        drop.order_reference ||
        null,

      period_start:
        drop.drop_datetime ||
        null,

      period_end:
        drop.rejoin_datetime ||
        null,
    };
  }


  /*
  |--------------------------------------------------------------------------
  | 2. EMERGENCY LEAVE
  |--------------------------------------------------------------------------
  */

  const emergencyLeave =
    firstMatching(
      leaves,

      (
        row
      ) =>
        String(
          row.leave_category ||
          ""
        ).toUpperCase() ===
        "EMERGENCY"
    );


  if (
    emergencyLeave
  ) {
    return {
      category:
        "EMERGENCY_LEAVE",

      detail:
        emergencyLeave.leave_type ||
        emergencyLeave.reason ||
        "Emergency Leave",

      reference_no:
        emergencyLeave.reference_no ||
        null,

      period_start:
        emergencyLeave.start_datetime,

      period_end:
        emergencyLeave.end_datetime,
    };
  }


  /*
  |--------------------------------------------------------------------------
  | 3. NORMAL LEAVE
  |--------------------------------------------------------------------------
  */

  const leave =
    firstMatching(
      leaves,

      (
        row
      ) =>
        String(
          row.leave_category ||
          "NORMAL"
        ).toUpperCase() !==
        "EMERGENCY"
    );


  if (
    leave
  ) {
    return {
      category:
        "LEAVE",

      detail:
        leave.leave_type ||
        leave.reason ||
        "Leave",

      reference_no:
        leave.reference_no ||
        null,

      period_start:
        leave.start_datetime,

      period_end:
        leave.end_datetime,
    };
  }


  /*
  |--------------------------------------------------------------------------
  | 4. OSD
  |--------------------------------------------------------------------------
  */

  const osd =
    firstMatching(
      osdRows,

      (
        row
      ) =>
        String(
          row.record_type ||
          ""
        ).toUpperCase() ===
        "OSD"
    );


  if (
    osd
  ) {
    return {
      category:
        "OSD",

      detail:
        osd.duty_place ||
        osd.reason ||
        "OSD",

      reference_no:
        osd.reference_no ||
        null,

      period_start:
        osd.start_datetime,

      period_end:
        osd.end_datetime,
    };
  }


  /*
  |--------------------------------------------------------------------------
  | 5. SHORT PERMISSION
  |--------------------------------------------------------------------------
  */

  const permission =
    firstMatching(
      osdRows,

      (
        row
      ) =>
        String(
          row.record_type ||
          ""
        ).toUpperCase() ===
        "SHORT_PERMISSION"
    );


  if (
    permission
  ) {
    return {
      category:
        "PERMISSION",

      detail:
        permission.reason ||
        permission.duty_place ||
        "Permission",

      reference_no:
        permission.reference_no ||
        null,

      period_start:
        permission.start_datetime,

      period_end:
        permission.end_datetime,
    };
  }


  /*
  |--------------------------------------------------------------------------
  | 6. HOME REST
  |--------------------------------------------------------------------------
  */

  const homeRest =
    firstMatching(
      outdoorRows,

      (
        row
      ) =>
        Number(
          row.home_rest
        ) ===
          1 &&
        periodContains(
          statementDatetime,

          row.home_rest_start,

          row.home_rest_end
        )
    );


  if (
    homeRest
  ) {
    return {
      category:
        "HOME_REST",

      detail:
        homeRest.doctor_recommendation ||
        homeRest.doctor_name ||
        "Home Rest",

      reference_no:
        homeRest.reference_no ||
        null,

      period_start:
        homeRest.home_rest_start,

      period_end:
        homeRest.home_rest_end,
    };
  }


  /*
  |--------------------------------------------------------------------------
  | 7. MEDICAL REST
  |--------------------------------------------------------------------------
  */

  const medicalRest =
    firstMatching(
      outdoorRows,

      (
        row
      ) =>
        Number(
          row.medical_rest
        ) ===
          1 &&
        periodContains(
          statementDatetime,

          row.medical_rest_start,

          row.medical_rest_end
        )
    );


  if (
    medicalRest
  ) {
    return {
      category:
        "MEDICAL_REST",

      detail:
        medicalRest.doctor_recommendation ||
        medicalRest.doctor_name ||
        "Medical Rest",

      reference_no:
        medicalRest.reference_no ||
        null,

      period_start:
        medicalRest.medical_rest_start,

      period_end:
        medicalRest.medical_rest_end,
    };
  }


  /*
  |--------------------------------------------------------------------------
  | 8. OUTDOOR
  |--------------------------------------------------------------------------
  */

  const outdoor =
    firstMatching(
      outdoorRows,

      (
        row
      ) =>
        periodContains(
          statementDatetime,

          row.start_datetime,

          row.end_datetime
        )
    );


  if (
    outdoor
  ) {
    return {
      category:
        "OUTDOOR",

      detail:
        outdoor.outdoor_purpose ||
        outdoor.location ||
        "Outdoor",

      reference_no:
        outdoor.reference_no ||
        null,

      period_start:
        outdoor.start_datetime,

      period_end:
        outdoor.end_datetime,
    };
  }


  /*
  |--------------------------------------------------------------------------
  | 9. PHYSICAL ABSENT
  |--------------------------------------------------------------------------
  |
  | Manual Absence => General Statement ABSENT.
  |
  |--------------------------------------------------------------------------
  */

  const manual =
    manualRows[0] ||
    null;


  if (
    manual
  ) {
    const detail = [
      manual.absence_category,
      manual.program_class,
      manual.reason,
    ]
      .filter(Boolean)
      .join(
        " - "
      );

    return {
      category:
        "ABSENT",

      detail:
        detail ||
        "Physically Absent",

      reference_no:
        manual.reference_no ||
        null,

      period_start:
        manual.start_datetime,

      period_end:
        manual.end_datetime,
    };
  }


  /*
  |--------------------------------------------------------------------------
  | 10. PHYSICALLY PRESENT
  |--------------------------------------------------------------------------
  |
  | General Statement intentionally does NOT check biometric punch.
  |
  |--------------------------------------------------------------------------
  */

  return {
    category:
      "PRESENT",

    detail:
      null,

    reference_no:
      null,

    period_start:
      null,

    period_end:
      null,
  };
}


/*
|--------------------------------------------------------------------------
| EMPTY SUMMARY ROW
|--------------------------------------------------------------------------
*/

function emptySummaryRow(
  platoonNumber
) {
  return {
    platoon_number:
      platoonNumber,

    platoon_label:
      platoonLabel(
        platoonNumber
      ),

    total_strength:
      0,

    training_drop_repatriate:
      0,

    effective_strength:
      0,

    present:
      0,

    absent:
      0,

    leave:
      0,

    emergency_leave:
      0,

    osd:
      0,

    permission:
      0,

    outdoor:
      0,

    medical_rest:
      0,

    home_rest:
      0,
  };
}


/*
|--------------------------------------------------------------------------
| INCREMENT SUMMARY
|--------------------------------------------------------------------------
*/

function incrementSummary(
  row,
  category
) {
  /*
  |--------------------------------------------------------------------------
  | Every trainee belongs to Total Strength
  |--------------------------------------------------------------------------
  */

  row.total_strength +=
    1;


  /*
  |--------------------------------------------------------------------------
  | Training Drop is deducted from Effective Strength
  |--------------------------------------------------------------------------
  */

  if (
    category ===
    "TRAINING_DROP_REPATRIATE"
  ) {
    row.training_drop_repatriate +=
      1;

    return;
  }


  row.effective_strength +=
    1;


  const mapping = {
    PRESENT:
      "present",

    ABSENT:
      "absent",

    LEAVE:
      "leave",

    EMERGENCY_LEAVE:
      "emergency_leave",

    OSD:
      "osd",

    PERMISSION:
      "permission",

    OUTDOOR:
      "outdoor",

    MEDICAL_REST:
      "medical_rest",

    HOME_REST:
      "home_rest",
  };


  const field =
    mapping[
      category
    ];


  if (
    field
  ) {
    row[field] +=
      1;
  }
}


/*
|--------------------------------------------------------------------------
| DETAIL ROW
|--------------------------------------------------------------------------
*/

function makeDetailRow(
  trainee,
  classification
) {
  return {
    trainee_id:
      Number(
        trainee.trainee_id
      ),

    employee_id:
      trainee.employee_id,

    trainee_name:
      personName(
        trainee
      ) ||
      trainee.employee_id ||
      "-",

    platoon_number:
      trainee.platoon_number,

    category:
      classification.category,

    detail:
      classification.detail,

    reference_no:
      classification.reference_no,

    period_start:
      classification.period_start,

    period_end:
      classification.period_end,
  };
}


/*
|--------------------------------------------------------------------------
| BUILD GENERAL STATEMENT
|--------------------------------------------------------------------------
*/

function buildGeneralStatement({
  course,
  trainees,
  physicalRows,
  statementDatetime,
}) {
  const maps = {
    drops:
      rowsByTrainee(
        physicalRows.drops
      ),

    leaves:
      rowsByTrainee(
        physicalRows.leaves
      ),

    osd:
      rowsByTrainee(
        physicalRows.osd
      ),

    outdoor:
      rowsByTrainee(
        physicalRows.outdoor
      ),

    manualAbsence:
      rowsByTrainee(
        physicalRows.manualAbsence
      ),
  };


  const summaryMap =
    new Map();


  /*
  |--------------------------------------------------------------------------
  | DETAIL LISTS
  |--------------------------------------------------------------------------
  |
  | PRESENT intentionally does not keep a person-name detail list.
  |
  |--------------------------------------------------------------------------
  */

  const details = {
    training_drop_repatriate:
      [],

    absent:
      [],

    leave:
      [],

    emergency_leave:
      [],

    osd:
      [],

    permission:
      [],

    outdoor:
      [],

    medical_rest:
      [],

    home_rest:
      [],
  };


  const detailMapping = {
    TRAINING_DROP_REPATRIATE:
      "training_drop_repatriate",

    ABSENT:
      "absent",

    LEAVE:
      "leave",

    EMERGENCY_LEAVE:
      "emergency_leave",

    OSD:
      "osd",

    PERMISSION:
      "permission",

    OUTDOOR:
      "outdoor",

    MEDICAL_REST:
      "medical_rest",

    HOME_REST:
      "home_rest",
  };


  for (
    const trainee
    of trainees
  ) {
    const platoonKey =
      (
        trainee.platoon_number ===
          null ||
        trainee.platoon_number ===
          undefined
      )
        ? "UNASSIGNED"
        : String(
            trainee.platoon_number
          );


    if (
      !summaryMap.has(
        platoonKey
      )
    ) {
      summaryMap.set(
        platoonKey,

        emptySummaryRow(
          trainee.platoon_number
        )
      );
    }


    const classification =
      classifyTrainee({
        trainee,

        statementDatetime,

        maps,
      });


    incrementSummary(
      summaryMap.get(
        platoonKey
      ),

      classification.category
    );


    const detailKey =
      detailMapping[
        classification.category
      ];


    if (
      detailKey
    ) {
      details[
        detailKey
      ].push(
        makeDetailRow(
          trainee,
          classification
        )
      );
    }
  }


  /*
  |--------------------------------------------------------------------------
  | SORT PLATOONS
  |--------------------------------------------------------------------------
  */

  const summaryRows = [
    ...summaryMap.values(),
  ].sort(
    (
      a,
      b
    ) => {
      if (
        a.platoon_number ===
          null ||
        a.platoon_number ===
          undefined
      ) {
        return 1;
      }

      if (
        b.platoon_number ===
          null ||
        b.platoon_number ===
          undefined
      ) {
        return -1;
      }

      return (
        Number(
          a.platoon_number
        ) -
        Number(
          b.platoon_number
        )
      );
    }
  );


  /*
  |--------------------------------------------------------------------------
  | GRAND TOTAL
  |--------------------------------------------------------------------------
  */

  const total =
    emptySummaryRow(
      null
    );


  total.platoon_label =
    "Grand Total";


  for (
    const row
    of summaryRows
  ) {
    total.total_strength +=
      row.total_strength;

    total.training_drop_repatriate +=
      row.training_drop_repatriate;

    total.effective_strength +=
      row.effective_strength;

    total.present +=
      row.present;

    total.absent +=
      row.absent;

    total.leave +=
      row.leave;

    total.emergency_leave +=
      row.emergency_leave;

    total.osd +=
      row.osd;

    total.permission +=
      row.permission;

    total.outdoor +=
      row.outdoor;

    total.medical_rest +=
      row.medical_rest;

    total.home_rest +=
      row.home_rest;
  }


  return {
    course,

    statement_datetime:
      statementDatetime,

    summary: {
      rows:
        summaryRows,

      total,
    },

    details,
  };
}


/*
|--------------------------------------------------------------------------
| GET GENERAL STATEMENT
|--------------------------------------------------------------------------
*/

async function getGeneralStatement({
  courseId,
  statementDatetime,
}) {
  const statementDate =
    String(
      statementDatetime
    ).slice(
      0,
      10
    );


  /*
  |--------------------------------------------------------------------------
  | SELECTED DATE MUST FALL INSIDE COURSE PERIOD
  |--------------------------------------------------------------------------
  */

  const course =
    await getCourseForStatement(
      courseId,
      statementDate
    );


  if (
    !course
  ) {
    return null;
  }


  /*
  |--------------------------------------------------------------------------
  | COURSE-SPECIFIC TRAINEES
  |--------------------------------------------------------------------------
  */

  const trainees =
    await getCourseTrainees(
      courseId
    );


  /*
  |--------------------------------------------------------------------------
  | PHYSICAL ADMINISTRATIVE STATUS
  |--------------------------------------------------------------------------
  */

  const physicalRows =
    await getPhysicalStatusRows({
      traineeIds:
        trainees.map(
          (
            item
          ) =>
            item.trainee_id
        ),

      statementDatetime,
    });


  return buildGeneralStatement({
    course,

    trainees,

    physicalRows,

    statementDatetime,
  });
}


module.exports = {
  getActiveGeneralStatementCourses,

  getGeneralStatement,
};