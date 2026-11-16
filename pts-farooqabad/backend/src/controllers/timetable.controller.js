const {
  getTimetables,

  getTimetableById,

  validateCourseAssignments,

  createTimetable,

  updateTimetable,

  deleteTimetable,
} = require("../models/timetable.model");

const {
  logRequestAudit,
} = require("../services/audit.service");

/*
|--------------------------------------------------------------------------
| HELPERS
|--------------------------------------------------------------------------
*/

function validTime(value) {
  return /^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(
    String(
      value || ""
    )
  );
}


function validDate(value) {
  if (!value) {
    return true;
  }

  return /^\d{4}-\d{2}-\d{2}$/.test(
    String(value)
  );
}


function normalizeIds(values) {
  if (!Array.isArray(values)) {
    return [];
  }

  return [
    ...new Set(
      values
        .map(
          (
            value
          ) =>
            Number(
              value
            )
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
}


function normalizePayload(data) {
  return {
    timetable_name:
      String(
        data.timetable_name ||
        ""
      ).trim(),

    morning_start:
      data.morning_start,

    morning_end:
      data.morning_end,

    morning_early_minutes:
      Number(
        data.morning_early_minutes ||
        0
      ),

    morning_late_grace_minutes:
      Number(
        data.morning_late_grace_minutes ||
        0
      ),

    evening_start:
      data.evening_start,

    evening_end:
      data.evening_end,

    evening_early_minutes:
      Number(
        data.evening_early_minutes ||
        0
      ),

    evening_late_grace_minutes:
      Number(
        data.evening_late_grace_minutes ||
        0
      ),

    effective_from:
      data.effective_from ||
      null,

    effective_to:
      data.effective_to ||
      null,

    course_ids:
      normalizeIds(
        data.course_ids
      ),

    staff_category_ids:
      normalizeIds(
        data.staff_category_ids
      ),

    is_active:
      data.is_active !==
      false,
  };
}


/*
|--------------------------------------------------------------------------
| AUDIT HELPERS
|--------------------------------------------------------------------------
*/

function auditTime(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
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


function extractCourseIds(
  record
) {
  if (
    Array.isArray(
      record?.course_ids
    )
  ) {
    return normalizeIds(
      record.course_ids
    ).sort(
      (
        a,
        b
      ) =>
        a - b
    );
  }

  if (
    Array.isArray(
      record?.courses
    )
  ) {
    return normalizeIds(
      record.courses.map(
        (
          item
        ) =>
          typeof item ===
          "object"
            ? item.id
            : item
      )
    ).sort(
      (
        a,
        b
      ) =>
        a - b
    );
  }

  return [];
}


function extractStaffCategoryIds(
  record
) {
  if (
    Array.isArray(
      record
        ?.staff_category_ids
    )
  ) {
    return normalizeIds(
      record
        .staff_category_ids
    ).sort(
      (
        a,
        b
      ) =>
        a - b
    );
  }

  if (
    Array.isArray(
      record
        ?.staff_categories
    )
  ) {
    return normalizeIds(
      record
        .staff_categories
        .map(
          (
            item
          ) =>
            typeof item ===
            "object"
              ? item.id
              : item
        )
    ).sort(
      (
        a,
        b
      ) =>
        a - b
    );
  }

  return [];
}


function buildTimetableAuditState(
  timetable,
  {
    deleted =
      false,
  } = {}
) {
  if (!timetable) {
    return null;
  }

  return {
    timetable_name:
      timetable.timetable_name ||
      null,

    morning_start:
      auditTime(
        timetable.morning_start
      ),

    morning_end:
      auditTime(
        timetable.morning_end
      ),

    morning_early_minutes:
      Number(
        timetable.morning_early_minutes ||
        0
      ),

    morning_late_grace_minutes:
      Number(
        timetable.morning_late_grace_minutes ||
        0
      ),

    evening_start:
      auditTime(
        timetable.evening_start
      ),

    evening_end:
      auditTime(
        timetable.evening_end
      ),

    evening_early_minutes:
      Number(
        timetable.evening_early_minutes ||
        0
      ),

    evening_late_grace_minutes:
      Number(
        timetable.evening_late_grace_minutes ||
        0
      ),

    effective_from:
      timetable.effective_from
        ? String(
            timetable.effective_from
          ).substring(
            0,
            10
          )
        : null,

    effective_to:
      timetable.effective_to
        ? String(
            timetable.effective_to
          ).substring(
            0,
            10
          )
        : null,

    course_ids:
      extractCourseIds(
        timetable
      ),

    staff_category_ids:
      extractStaffCategoryIds(
        timetable
      ),

    is_active:
      Boolean(
        timetable.is_active
      ),

    deleted:
      Boolean(
        deleted
      ),
  };
}


function buildEmptyTimetableAuditState() {
  return {
    timetable_name:
      null,

    morning_start:
      null,

    morning_end:
      null,

    morning_early_minutes:
      null,

    morning_late_grace_minutes:
      null,

    evening_start:
      null,

    evening_end:
      null,

    evening_early_minutes:
      null,

    evening_late_grace_minutes:
      null,

    effective_from:
      null,

    effective_to:
      null,

    course_ids:
      [],

    staff_category_ids:
      [],

    is_active:
      null,

    deleted:
      false,
  };
}


async function writeTimetableAudit({
  req,

  action,

  timetableId,

  description,

  oldData =
    null,

  newData =
    null,

  deleted =
    false,
}) {
  return logRequestAudit(
    req,
    {
      action,

      module:
        "TIMETABLE",

      recordId:
        timetableId,

      description,

      oldData:
        oldData
          ? buildTimetableAuditState(
              oldData,
              {
                deleted:
                  false,
              }
            )
          : buildEmptyTimetableAuditState(),

      newData:
        newData
          ? buildTimetableAuditState(
              newData,
              {
                deleted,
              }
            )
          : null,
    }
  );
}


/*
|--------------------------------------------------------------------------
| VALIDATE
|--------------------------------------------------------------------------
*/

function validateTimetable(data) {
  if (
    !data.timetable_name
  ) {
    return "Timetable Name is required.";
  }

  if (
    !validTime(
      data.morning_start
    ) ||
    !validTime(
      data.morning_end
    )
  ) {
    return "Valid Morning Start and End Time are required.";
  }

  if (
    !validTime(
      data.evening_start
    ) ||
    !validTime(
      data.evening_end
    )
  ) {
    return "Valid Evening Start and End Time are required.";
  }

  if (
    data.morning_start >=
    data.morning_end
  ) {
    return "Morning Start must be earlier than Morning End.";
  }

  if (
    data.evening_start >=
    data.evening_end
  ) {
    return "Evening Start must be earlier than Evening End.";
  }

  const minuteFields = [
    [
      "Morning Early Allowance",
      data.morning_early_minutes,
    ],

    [
      "Morning Late Grace",
      data.morning_late_grace_minutes,
    ],

    [
      "Evening Early Allowance",
      data.evening_early_minutes,
    ],

    [
      "Evening Late Grace",
      data.evening_late_grace_minutes,
    ],
  ];

  for (
    const [
      label,
      value,
    ] of minuteFields
  ) {
    if (
      !Number.isFinite(
        value
      ) ||
      value < 0 ||
      value > 720
    ) {
      return `${label} must be between 0 and 720 minutes.`;
    }
  }

  if (
    !validDate(
      data.effective_from
    )
  ) {
    return "Effective From must be in YYYY-MM-DD format.";
  }

  if (
    !validDate(
      data.effective_to
    )
  ) {
    return "Effective To must be in YYYY-MM-DD format.";
  }

  if (
    data.effective_from &&
    data.effective_to &&
    data.effective_to <
      data.effective_from
  ) {
    return "Effective To cannot be earlier than Effective From.";
  }

  return null;
}


/*
|--------------------------------------------------------------------------
| LIST
|--------------------------------------------------------------------------
*/

async function listTimetables(
  req,
  res,
  next
) {
  try {
    const rows =
      await getTimetables();

    return res.json({
      success:
        true,

      data:
        rows,
    });
  } catch (
    error
  ) {
    return next(
      error
    );
  }
}


/*
|--------------------------------------------------------------------------
| SINGLE
|--------------------------------------------------------------------------
*/

async function getTimetable(
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
      id < 1
    ) {
      return res
        .status(400)
        .json({
          success:
            false,

          message:
            "Invalid Timetable.",
        });
    }

    const timetable =
      await getTimetableById(
        id
      );

    if (!timetable) {
      return res
        .status(404)
        .json({
          success:
            false,

          message:
            "Timetable not found.",
        });
    }

    return res.json({
      success:
        true,

      data:
        timetable,
    });
  } catch (
    error
  ) {
    return next(
      error
    );
  }
}


/*
|--------------------------------------------------------------------------
| CREATE
|--------------------------------------------------------------------------
*/

async function addTimetable(
  req,
  res,
  next
) {
  try {
    const data =
      normalizePayload(
        req.body
      );

    const validationError =
      validateTimetable(
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
    | COURSE / EFFECTIVE PERIOD INTERSECTION
    |--------------------------------------------------------------------------
    */

    const assignmentCheck =
      await validateCourseAssignments({
        courseIds:
          data.course_ids,

        effectiveFrom:
          data.effective_from,

        effectiveTo:
          data.effective_to,
      });

    if (
      !assignmentCheck.valid
    ) {
      return res
        .status(400)
        .json({
          success:
            false,

          message:
            assignmentCheck.message,
        });
    }

    const timetable =
      await createTimetable(
        data,

        req.user?.id ||
        null
      );

    await writeTimetableAudit({
      req,

      action:
        "CREATE",

      timetableId:
        timetable.id,

      description:
        `Timetable ${timetable.timetable_name || data.timetable_name} created.`,

      oldData:
        null,

      newData:
        timetable,
    });

    return res
      .status(201)
      .json({
        success:
          true,

        message:
          "Timetable created successfully.",

        data:
          timetable,
      });
  } catch (
    error
  ) {
    return next(
      error
    );
  }
}


/*
|--------------------------------------------------------------------------
| UPDATE
|--------------------------------------------------------------------------
*/

async function editTimetable(
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
      id < 1
    ) {
      return res
        .status(400)
        .json({
          success:
            false,

          message:
            "Invalid Timetable.",
        });
    }

    const existing =
      await getTimetableById(
        id
      );

    if (!existing) {
      return res
        .status(404)
        .json({
          success:
            false,

          message:
            "Timetable not found.",
        });
    }

    const data =
      normalizePayload(
        req.body
      );

    const validationError =
      validateTimetable(
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

    const assignmentCheck =
      await validateCourseAssignments({
        courseIds:
          data.course_ids,

        effectiveFrom:
          data.effective_from,

        effectiveTo:
          data.effective_to,
      });

    if (
      !assignmentCheck.valid
    ) {
      return res
        .status(400)
        .json({
          success:
            false,

          message:
            assignmentCheck.message,
        });
    }

    const timetable =
      await updateTimetable(
        id,
        data
      );

    if (!timetable) {
      return res
        .status(404)
        .json({
          success:
            false,

          message:
            "Timetable not found.",
        });
    }

    await writeTimetableAudit({
      req,

      action:
        "UPDATE",

      timetableId:
        id,

      description:
        `Timetable ${timetable.timetable_name || existing.timetable_name} updated.`,

      oldData:
        existing,

      newData:
        timetable,
    });

    return res.json({
      success:
        true,

      message:
        "Timetable updated successfully.",

      data:
        timetable,
    });
  } catch (
    error
  ) {
    return next(
      error
    );
  }
}


/*
|--------------------------------------------------------------------------
| DELETE
|--------------------------------------------------------------------------
*/

async function removeTimetable(
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
      id < 1
    ) {
      return res
        .status(400)
        .json({
          success:
            false,

          message:
            "Invalid Timetable.",
        });
    }

    /*
    |--------------------------------------------------------------------------
    | READ BEFORE DELETE FOR AUDIT
    |--------------------------------------------------------------------------
    */

    const existing =
      await getTimetableById(
        id
      );

    if (!existing) {
      return res
        .status(404)
        .json({
          success:
            false,

          message:
            "Timetable not found.",
        });
    }

    const deleted =
      await deleteTimetable(
        id
      );

    if (!deleted) {
      return res
        .status(404)
        .json({
          success:
            false,

          message:
            "Timetable not found.",
        });
    }

    /*
    |--------------------------------------------------------------------------
    | DELETE AUDIT
    |--------------------------------------------------------------------------
    */

    await logRequestAudit(
      req,
      {
        action:
          "DELETE",

        module:
          "TIMETABLE",

        recordId:
          id,

        description:
          `Timetable ${existing.timetable_name} deleted.`,

        oldData:
          buildTimetableAuditState(
            existing,
            {
              deleted:
                false,
            }
          ),

        newData:
          {
            ...buildTimetableAuditState(
              existing,
              {
                deleted:
                  false,
              }
            ),

            deleted:
              true,
          },
      }
    );

    return res.json({
      success:
        true,

      message:
        "Timetable deleted successfully.",
    });
  } catch (
    error
  ) {
    return next(
      error
    );
  }
}


module.exports = {
  listTimetables,

  getTimetable,

  addTimetable,

  editTimetable,

  removeTimetable,
};