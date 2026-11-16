const ExcelJS = require("exceljs");

const {
  findIndividualWeekendOperationalConflicts,
  buildIndividualWeekendConflictMessage,
} = require("../services/longWeekendConflict.service");

const {
  pool,
} = require("../config/db");

const {
  getWeekends,

  getWeekendById,

  validateWeekendTargets,

  getOverlappingWeekends,

  createWeekend,

  updateWeekend,

  deleteWeekend,
} = require(
  "../models/weekend.model"
);

/*
|--------------------------------------------------------------------------
| HELPERS
|--------------------------------------------------------------------------
*/

function cleanText(
  value,
  maxLength = null
) {
  if (
    value === undefined ||
    value === null
  ) {
    return null;
  }

  let text =
    String(value)
      .trim();

  if (!text) {
    return null;
  }

  if (
    maxLength &&
    text.length >
      maxLength
  ) {
    text =
      text.slice(
        0,
        maxLength
      );
  }

  return text;
}

function normalizeBoolean(
  value,
  fallback = false
) {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return fallback;
  }

  if (
    typeof value ===
    "boolean"
  ) {
    return value;
  }

  if (
    typeof value ===
    "number"
  ) {
    return value === 1;
  }

  const normalized =
    String(value)
      .trim()
      .toLowerCase();

  if (
    [
      "1",
      "true",
      "yes",
      "on",
      "active",
    ].includes(
      normalized
    )
  ) {
    return true;
  }

  if (
    [
      "0",
      "false",
      "no",
      "off",
      "inactive",
    ].includes(
      normalized
    )
  ) {
    return false;
  }

  return fallback;
}

function normalizeIds(
  values
) {
  if (
    !Array.isArray(values)
  ) {
    return [];
  }

  return [
    ...new Set(
      values
        .map(Number)
        .filter(
          (value) =>
            Number.isInteger(
              value
            ) &&
            value > 0
        )
    ),
  ];
}

/*
|--------------------------------------------------------------------------
| DATETIME
|--------------------------------------------------------------------------
|
| Accepted:
|
| 2026-09-20 08:00
| 2026-09-20 08:00:00
| 2026-09-20T08:00
| 2026-09-20T08:00:00
|
|--------------------------------------------------------------------------
*/

function normalizeDateTime(
  value
) {
  if (!value) {
    return null;
  }

  let text =
    String(value)
      .trim()
      .replace(
        "T",
        " "
      );

  if (
    /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(
      text
    )
  ) {
    text =
      `${text}:00`;
  }

  if (
    !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(
      text
    )
  ) {
    return null;
  }

  const [
    datePart,
    timePart,
  ] =
    text.split(" ");

  const [
    year,
    month,
    day,
  ] =
    datePart
      .split("-")
      .map(Number);

  const [
    hour,
    minute,
    second,
  ] =
    timePart
      .split(":")
      .map(Number);

  const date =
    new Date(
      year,
      month - 1,
      day,
      hour,
      minute,
      second
    );

  /*
  |--------------------------------------------------------------------------
  | Reject invalid dates like 2026-02-31
  |--------------------------------------------------------------------------
  */

  if (
    date.getFullYear() !==
      year ||
    date.getMonth() !==
      month - 1 ||
    date.getDate() !==
      day ||
    date.getHours() !==
      hour ||
    date.getMinutes() !==
      minute ||
    date.getSeconds() !==
      second
  ) {
    return null;
  }

  return text;
}

/*
|--------------------------------------------------------------------------
| NORMALIZE REQUEST
|--------------------------------------------------------------------------
*/

function normalizePayload(
  body = {}
) {
  const applyAllTrainees =
    normalizeBoolean(
      body.apply_all_trainees,
      false
    );

  const earlyMinutes =
    Math.max(
      0,
      Math.min(
        720,
        Number(
          body.departure_early_minutes ??
          60
        ) ||
        0
      )
    );

  const lateMinutes =
    Math.max(
      0,
      Math.min(
        720,
        Number(
          body.departure_late_minutes ??
          30
        ) ||
        0
      )
    );

  return {
    weekend_name:
      cleanText(
        body.weekend_name,
        150
      ),

    start_datetime:
      normalizeDateTime(
        body.start_datetime
      ),

    end_datetime:
      normalizeDateTime(
        body.end_datetime
      ),

    departure_early_minutes:
      Math.trunc(
        earlyMinutes
      ),

    departure_late_minutes:
      Math.trunc(
        lateMinutes
      ),

    apply_all_trainees:
      applyAllTrainees,

    course_ids:
      applyAllTrainees
        ? []
        : normalizeIds(
            body.course_ids
          ),

    trainee_ids:
      applyAllTrainees
        ? []
        : normalizeIds(
            body.trainee_ids
          ),

    detained_trainee_ids:
      normalizeIds(
        body.detained_trainee_ids
      ),

    /*
    |--------------------------------------------------------------------------
    | New Long Weekend flow is Trainee-only.
    | Historical Staff-weekend rows remain readable in DB, but new/edited
    | records no longer create Staff scope.
    |--------------------------------------------------------------------------
    */

    apply_all_staff:
      false,

    staff_category_ids:
      [],

    remarks:
      cleanText(
        body.remarks,
        2000
      ),

    is_active:
      normalizeBoolean(
        body.is_active,
        true
      ),
  };
}

/*
|--------------------------------------------------------------------------
| BASIC VALIDATION
|--------------------------------------------------------------------------
*/

function validatePayload(
  data
) {
  if (
    !data.weekend_name
  ) {
    return (
      "Weekend Name is required."
    );
  }

  if (
    !data.start_datetime
  ) {
    return (
      "Valid Departure Date/Time is required."
    );
  }

  if (
    !data.end_datetime
  ) {
    return (
      "Valid Weekend End Date/Time is required."
    );
  }

  if (
    data.end_datetime <=
    data.start_datetime
  ) {
    return (
      "Weekend End Date/Time must be later than Departure Date/Time."
    );
  }

  if (
    !data.apply_all_trainees &&
    !data.course_ids.length &&
    !data.trainee_ids.length
  ) {
    return (
      "Select All Trainees, one or more Trainee Courses, or one or more Individual Trainees."
    );
  }

  return null;
}

/*
|--------------------------------------------------------------------------
| ARRAY INTERSECTION
|--------------------------------------------------------------------------
*/

function arraysIntersect(
  left,
  right
) {
  const set =
    new Set(
      (
        left ||
        []
      ).map(Number)
    );

  return (
    (
      right ||
      []
    ).some(
      (value) =>
        set.has(
          Number(value)
        )
    )
  );
}

/*
|--------------------------------------------------------------------------
| CHECK IF TWO WEEKEND SCOPES CONFLICT
|--------------------------------------------------------------------------
|
| Examples:
|
| Weekend A = All Trainees
| Weekend B = Recruit Course
| => Conflict
|
| Weekend A = Recruit Course
| Weekend B = Traffic Course
| => No Conflict
|
| Weekend A = Staff Category 1
| Weekend B = Staff Category 1
| => Conflict
|
|--------------------------------------------------------------------------
*/

function weekendScopesConflict(
  incoming,
  existing
) {
  /*
  |--------------------------------------------------------------------------
  | TRAINEE SCOPE RULES
  |--------------------------------------------------------------------------
  |
  | Broad scopes:
  | - All Trainees
  | - Selected Courses
  |
  | Individual scope:
  | - Selected Trainees only
  |
  | Important business rule:
  | An Individual Weekend is allowed to overlap a broader All/Course weekend.
  | This supports an authorised early departure for selected trainees before
  | the general weekend begins. Two overlapping Individual Weekends for the
  | same trainee are still rejected. Broad-vs-broad overlaps are rejected as
  | before.
  |--------------------------------------------------------------------------
  */

  const incomingCourses =
    incoming.course_ids ||
    [];

  const existingCourses =
    existing.course_ids ||
    [];

  const incomingTrainees =
    incoming.trainee_ids ||
    [];

  const existingTrainees =
    existing.trainee_ids ||
    [];

  const incomingHasBroadScope =
    Boolean(
      incoming.apply_all_trainees
    ) ||
    incomingCourses.length >
      0;

  const existingHasBroadScope =
    Boolean(
      existing.apply_all_trainees
    ) ||
    existingCourses.length >
      0;

  let traineeConflict =
    false;

  /*
  | Broad scope against broad scope keeps existing overlap protection.
  */

  if (
    incomingHasBroadScope &&
    existingHasBroadScope
  ) {
    if (
      incoming.apply_all_trainees ||
      existing.apply_all_trainees
    ) {
      traineeConflict =
        true;
    } else {
      traineeConflict =
        arraysIntersect(
          incomingCourses,
          existingCourses
        );
    }
  }

  /*
  | Explicit trainee against explicit trainee: same trainee cannot have two
  | overlapping Individual Weekend assignments.
  |
  | Cross-mode Individual-vs-Broad overlap is intentionally allowed.
  */

  if (
    !traineeConflict &&
    incomingTrainees.length &&
    existingTrainees.length &&
    arraysIntersect(
      incomingTrainees,
      existingTrainees
    )
  ) {
    traineeConflict =
      true;
  }

  /*
  |--------------------------------------------------------------------------
  | STAFF
  |--------------------------------------------------------------------------
  |
  | Historical compatibility only. New Long Weekend flow is Trainee-only.
  |--------------------------------------------------------------------------
  */

  const incomingStaff =
    incoming.staff_category_ids ||
    [];

  const existingStaff =
    existing.staff_category_ids ||
    [];

  const incomingHasStaff =
    incoming.apply_all_staff ||
    incomingStaff.length >
      0;

  const existingHasStaff =
    Boolean(
      existing.apply_all_staff
    ) ||
    existingStaff.length >
      0;

  let staffConflict =
    false;

  if (
    incomingHasStaff &&
    existingHasStaff
  ) {
    if (
      incoming.apply_all_staff ||
      existing.apply_all_staff
    ) {
      staffConflict =
        true;
    } else {
      staffConflict =
        arraysIntersect(
          incomingStaff,
          existingStaff
        );
    }
  }

  return (
    traineeConflict ||
    staffConflict
  );
}

/*
|--------------------------------------------------------------------------
| BUSINESS VALIDATION
|--------------------------------------------------------------------------
*/

async function validateBusinessRules(
  data,
  excludeId = null
) {
  /*
  |--------------------------------------------------------------------------
  | CHECK COURSE / CATEGORY IDs EXIST
  |--------------------------------------------------------------------------
  */

  const targetCheck =
    await validateWeekendTargets({
      courseIds:
        data.course_ids,

      staffCategoryIds:
        [],

      traineeIds:
        data.trainee_ids,

      detainedTraineeIds:
        data.detained_trainee_ids,

      applyAllTrainees:
        data.apply_all_trainees,
    });

  if (
    !targetCheck.valid
  ) {
    if (
      targetCheck
        .invalidCourseIds
        .length
    ) {
      return (
        `Invalid Course ID(s): ${targetCheck.invalidCourseIds.join(
          ", "
        )}`
      );
    }

    if (
      targetCheck
        .invalidStaffCategoryIds
        .length
    ) {
      return (
        `Invalid Staff Category ID(s): ${targetCheck.invalidStaffCategoryIds.join(
          ", "
        )}`
      );
    }

    if (
      targetCheck
        .invalidTraineeIds
        ?.length
    ) {
      return (
        `Invalid Trainee ID(s): ${targetCheck.invalidTraineeIds.join(
          ", "
        )}`
      );
    }

    if (
      targetCheck
        .invalidDetainedTraineeIds
        ?.length
    ) {
      return (
        "One or more Weekend Detain trainees are not valid for the selected Long Weekend scope."
      );
    }

    return (
      "Invalid Weekend assignment."
    );
  }

  /*
  |--------------------------------------------------------------------------
  | Inactive Weekend does not affect attendance, therefore overlap allowed.
  |--------------------------------------------------------------------------
  */

  if (
    !data.is_active
  ) {
    return null;
  }

  /*
  |--------------------------------------------------------------------------
  | INDIVIDUAL TRAINEE OPERATIONAL CONFLICT
  |--------------------------------------------------------------------------
  |
  | Only explicitly selected Individual Trainees are blocked here.
  | All-Trainees and Selected-Course Long Weekends remain saveable; their
  | Leave / Home Rest / OSD / Repatriate cases are resolved by the existing
  | operational-status rules instead of blocking the whole Weekend.
  |--------------------------------------------------------------------------
  */

  if (data.trainee_ids.length) {
    const operationalConflicts =
      await findIndividualWeekendOperationalConflicts({
        traineeIds:
          data.trainee_ids,
        startDatetime:
          data.start_datetime,
        endDatetime:
          data.end_datetime,
      });

    const operationalConflictMessage =
      buildIndividualWeekendConflictMessage(
        operationalConflicts
      );

    if (operationalConflictMessage) {
      return operationalConflictMessage;
    }
  }

  /*
  |--------------------------------------------------------------------------
  | GET TIME-OVERLAPPING WEEKENDS
  |--------------------------------------------------------------------------
  */

  const overlapping =
    await getOverlappingWeekends({
      startDatetime:
        data.start_datetime,

      endDatetime:
        data.end_datetime,

      excludeId,
    });

  /*
  |--------------------------------------------------------------------------
  | FIND SAME SCOPE CONFLICT
  |--------------------------------------------------------------------------
  */

  const conflict =
    overlapping.find(
      (weekend) =>
        weekendScopesConflict(
          data,
          weekend
        )
    );

  if (conflict) {
    return (
      `This Long Weekend overlaps with "${conflict.weekend_name}" for one or more of the same trainee assignments.`
    );
  }

  return null;
}

/*
|--------------------------------------------------------------------------
| LIST WEEKENDS
|--------------------------------------------------------------------------
*/

async function listWeekends(
  req,
  res,
  next
) {
  try {
    const rows =
      await getWeekends();

    return res.json({
      success:
        true,

      data:
        rows,
    });
  } catch (error) {
    return next(
      error
    );
  }
}

/*
|--------------------------------------------------------------------------
| GET SINGLE WEEKEND
|--------------------------------------------------------------------------
*/

async function getWeekend(
  req,
  res,
  next
) {
  try {
    const id =
      Number(
        req.params.id
      );

    if (
      !Number.isInteger(
        id
      ) ||
      id <= 0
    ) {
      return res
        .status(400)
        .json({
          success:
            false,

          message:
            "Invalid Weekend ID.",
        });
    }

    const weekend =
      await getWeekendById(
        id
      );

    if (
      !weekend
    ) {
      return res
        .status(404)
        .json({
          success:
            false,

          message:
            "Weekend not found.",
        });
    }

    return res.json({
      success:
        true,

      data:
        weekend,
    });
  } catch (error) {
    return next(
      error
    );
  }
}

/*
|--------------------------------------------------------------------------
| CREATE WEEKEND
|--------------------------------------------------------------------------
*/

async function addWeekend(
  req,
  res,
  next
) {
  try {
    const data =
      normalizePayload(
        req.body
      );

    /*
    |--------------------------------------------------------------------------
    | BASIC VALIDATION
    |--------------------------------------------------------------------------
    */

    const validationError =
      validatePayload(
        data
      );

    if (
      validationError
    ) {
      return res
        .status(400)
        .json({
          success:
            false,

          message:
            validationError,
        });
    }

    /*
    |--------------------------------------------------------------------------
    | DATABASE / OVERLAP VALIDATION
    |--------------------------------------------------------------------------
    */

    const businessError =
      await validateBusinessRules(
        data
      );

    if (
      businessError
    ) {
      return res
        .status(409)
        .json({
          success:
            false,

          message:
            businessError,
        });
    }

    /*
    |--------------------------------------------------------------------------
    | CREATE
    |--------------------------------------------------------------------------
    */

    const weekend =
      await createWeekend(
        data,
        req.user?.id ||
          null
      );

    return res
      .status(201)
      .json({
        success:
          true,

        message:
          "Weekend created successfully.",

        data:
          weekend,
      });
  } catch (error) {
    return next(
      error
    );
  }
}

/*
|--------------------------------------------------------------------------
| UPDATE WEEKEND
|--------------------------------------------------------------------------
*/

async function editWeekend(
  req,
  res,
  next
) {
  try {
    const id =
      Number(
        req.params.id
      );

    if (
      !Number.isInteger(
        id
      ) ||
      id <= 0
    ) {
      return res
        .status(400)
        .json({
          success:
            false,

          message:
            "Invalid Weekend ID.",
        });
    }

    /*
    |--------------------------------------------------------------------------
    | CHECK RECORD EXISTS
    |--------------------------------------------------------------------------
    */

    const existing =
      await getWeekendById(
        id
      );

    if (
      !existing
    ) {
      return res
        .status(404)
        .json({
          success:
            false,

          message:
            "Weekend not found.",
        });
    }

    /*
    |--------------------------------------------------------------------------
    | NORMALIZE
    |--------------------------------------------------------------------------
    */

    const data =
      normalizePayload(
        req.body
      );

    /*
    |--------------------------------------------------------------------------
    | BASIC VALIDATION
    |--------------------------------------------------------------------------
    */

    const validationError =
      validatePayload(
        data
      );

    if (
      validationError
    ) {
      return res
        .status(400)
        .json({
          success:
            false,

          message:
            validationError,
        });
    }

    /*
    |--------------------------------------------------------------------------
    | BUSINESS VALIDATION
    |--------------------------------------------------------------------------
    |
    | Current record excluded from overlap check.
    |--------------------------------------------------------------------------
    */

    const businessError =
      await validateBusinessRules(
        data,
        id
      );

    if (
      businessError
    ) {
      return res
        .status(409)
        .json({
          success:
            false,

          message:
            businessError,
        });
    }

    /*
    |--------------------------------------------------------------------------
    | UPDATE
    |--------------------------------------------------------------------------
    */

    const weekend =
      await updateWeekend(
        id,
        data,
        req.user?.id ||
          null
      );

    if (
      !weekend
    ) {
      return res
        .status(404)
        .json({
          success:
            false,

          message:
            "Weekend not found.",
        });
    }

    return res.json({
      success:
        true,

      message:
        "Weekend updated successfully.",

      data:
        weekend,
    });
  } catch (error) {
    return next(
      error
    );
  }
}

/*
|--------------------------------------------------------------------------
| DELETE WEEKEND
|--------------------------------------------------------------------------
*/

async function removeWeekend(
  req,
  res,
  next
) {
  try {
    const id =
      Number(
        req.params.id
      );

    if (
      !Number.isInteger(
        id
      ) ||
      id <= 0
    ) {
      return res
        .status(400)
        .json({
          success:
            false,

          message:
            "Invalid Weekend ID.",
        });
    }

    /*
    |--------------------------------------------------------------------------
    | CHECK EXISTS
    |--------------------------------------------------------------------------
    */

    const existing =
      await getWeekendById(
        id
      );

    if (
      !existing
    ) {
      return res
        .status(404)
        .json({
          success:
            false,

          message:
            "Weekend not found.",
        });
    }

    /*
    |--------------------------------------------------------------------------
    | DELETE
    |--------------------------------------------------------------------------
    */

    const deleted =
      await deleteWeekend(
        id
      );

    if (
      !deleted
    ) {
      return res
        .status(404)
        .json({
          success:
            false,

          message:
            "Weekend not found.",
        });
    }

    return res.json({
      success:
        true,

      message:
        "Weekend deleted successfully.",
    });
  } catch (error) {
    return next(
      error
    );
  }
}


/*
|--------------------------------------------------------------------------
| WEEKEND DETAIN EXCEL TEMPLATE / IMPORT RESOLVER
|--------------------------------------------------------------------------
|
| Import does NOT save a Weekend directly. It only resolves exact Trainee
| Employee ID / Cap No values from the uploaded workbook and returns the
| matching trainee IDs to WeekendManagement.jsx. The normal Weekend save
| flow remains the single source of truth.
|
|--------------------------------------------------------------------------
*/

function normalizeLookupValue(value) {
  return String(value ?? "")
    .trim()
    .toUpperCase();
}

async function downloadWeekendDetainTemplate(req, res, next) {
  try {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "PTS Farooqabad";
    workbook.created = new Date();

    const sheet = workbook.addWorksheet("Weekend Detain Import");
    sheet.columns = [
      {
        header: "Employee ID / Cap No",
        key: "identifier",
        width: 28,
      },
    ];

    const header = sheet.getRow(1);
    header.font = {
      bold: true,
      color: { argb: "FFFFFFFF" },
    };
    header.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF1F4E78" },
    };
    header.alignment = {
      horizontal: "center",
      vertical: "middle",
    };
    header.height = 24;

    sheet.views = [
      {
        state: "frozen",
        ySplit: 1,
      },
    ];

    const instructions = workbook.addWorksheet("Instructions");
    instructions.getColumn(1).width = 110;
    instructions.getCell("A1").value = "Weekend Detain Import Instructions";
    instructions.getCell("A1").font = {
      bold: true,
      size: 14,
    };
    instructions.getCell("A3").value =
      "Enter one trainee Employee ID or Cap No per row in Column A of the 'Weekend Detain Import' sheet.";
    instructions.getCell("A4").value =
      "Do not change the header. Duplicate IDs are ignored automatically.";
    instructions.getCell("A5").value =
      "When Selected Courses scope is used, trainees outside those courses will be skipped by the portal.";

    const buffer = await workbook.xlsx.writeBuffer();

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="Weekend_Detain_Import_Template.xlsx"'
    );

    return res.send(Buffer.from(buffer));
  } catch (error) {
    return next(error);
  }
}

async function importWeekendDetainTrainees(req, res, next) {
  try {
    if (!req.file?.buffer) {
      return res.status(400).json({
        success: false,
        message: "Select a valid .xlsx Weekend Detain list.",
      });
    }

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(req.file.buffer);

    const sheet = workbook.worksheets[0];

    if (!sheet) {
      return res.status(400).json({
        success: false,
        message: "Uploaded workbook has no worksheet.",
      });
    }

    const acceptedHeaders = new Set([
      "EMPLOYEE ID / CAP NO",
      "EMPLOYEE ID",
      "EMPLOYEE_ID",
      "CAP NO",
      "CAP_NO",
      "BELT NO",
      "BELT_NO",
    ]);

    let identifierColumn = 1;

    sheet.getRow(1).eachCell((cell, columnNumber) => {
      const headerText = normalizeLookupValue(cell.text);

      if (acceptedHeaders.has(headerText)) {
        identifierColumn = columnNumber;
      }
    });

    const identifiers = [];
    const seen = new Set();
    const duplicateInputs = [];

    for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
      const raw = String(
        sheet.getRow(rowNumber).getCell(identifierColumn).text || ""
      ).trim();

      if (!raw) {
        continue;
      }

      const key = normalizeLookupValue(raw);

      if (seen.has(key)) {
        duplicateInputs.push(raw);
        continue;
      }

      seen.add(key);
      identifiers.push({
        raw,
        key,
      });
    }

    if (!identifiers.length) {
      return res.status(400).json({
        success: false,
        message: "No Employee ID / Cap No values found in the uploaded file.",
      });
    }

    if (identifiers.length > 1000) {
      return res.status(400).json({
        success: false,
        message: "A maximum of 1000 trainees can be imported at one time.",
      });
    }

    const values = identifiers.map((item) => item.raw);
    const placeholders = values.map(() => "?").join(", ");

    const [rows] = await pool.execute(
      `
        SELECT
          t.id,
          t.employee_id,
          t.belt_no,
          t.first_name,
          t.last_name,
          t.father_name,
          t.course_id,
          c.course_name,
          t.platoon_id,
          p.platoon_number,
          p.platoon_name
        FROM trainees t
        LEFT JOIN courses c
          ON c.id = t.course_id
        LEFT JOIN platoons p
          ON p.id = t.platoon_id
        WHERE t.is_deleted = 0
          AND t.is_staff_exempt = 0
          AND (
            TRIM(t.employee_id) IN (${placeholders})
            OR TRIM(COALESCE(t.belt_no, '')) IN (${placeholders})
          )
        ORDER BY t.id DESC
      `,
      [
        ...values,
        ...values,
      ]
    );

    const employeeMatches = new Map();
    const beltMatches = new Map();

    const pushMatch = (map, key, row) => {
      if (!key) {
        return;
      }

      const existing = map.get(key) || [];
      existing.push(row);
      map.set(key, existing);
    };

    rows.forEach((row) => {
      pushMatch(
        employeeMatches,
        normalizeLookupValue(row.employee_id),
        row
      );
      pushMatch(
        beltMatches,
        normalizeLookupValue(row.belt_no),
        row
      );
    });

    const matched = [];
    const unmatched = [];
    const ambiguous = [];
    const selectedTraineeIds = new Set();

    identifiers.forEach((identifier) => {
      const byEmployee = employeeMatches.get(identifier.key) || [];
      const byBelt = beltMatches.get(identifier.key) || [];

      let candidates = byEmployee.length ? byEmployee : byBelt;

      const uniqueById = new Map();
      candidates.forEach((row) => uniqueById.set(Number(row.id), row));
      candidates = [...uniqueById.values()];

      if (!candidates.length) {
        unmatched.push(identifier.raw);
        return;
      }

      if (candidates.length > 1) {
        ambiguous.push(identifier.raw);
        return;
      }

      const row = candidates[0];
      const traineeId = Number(row.id);

      if (selectedTraineeIds.has(traineeId)) {
        return;
      }

      selectedTraineeIds.add(traineeId);

      matched.push({
        ...row,
        subject_type: "TRAINEE",
        subject_id: traineeId,
      });
    });

    return res.json({
      success: true,
      data: {
        rows: matched,
        total_input: identifiers.length,
        matched_count: matched.length,
        unmatched,
        ambiguous,
        duplicate_inputs: duplicateInputs,
      },
    });
  } catch (error) {
    return next(error);
  }
}

/*
|--------------------------------------------------------------------------
| EXPORTS
|--------------------------------------------------------------------------
*/

module.exports = {
  listWeekends,

  getWeekend,

  addWeekend,

  editWeekend,

  removeWeekend,

  downloadWeekendDetainTemplate,

  importWeekendDetainTrainees,
};