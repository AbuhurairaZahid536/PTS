const {
  normalizeSubjectType,

  getSubjectById,

  validateSubjectPeriod,

  getById,

  createRecord,

  updateRecord,

  cancelRecord,

  getRecords,
} = require(
  "../models/manualAbsence.model"
);

const {
  logRequestAudit,
} = require(
  "../services/audit.service"
);

const VALID_CATEGORIES = [
  "PROGRAM",
  "SECURITY_DUTY",
];

/*
|--------------------------------------------------------------------------
| HELPERS
|--------------------------------------------------------------------------
*/

function validatePeriod(
  start,
  end
) {
  if (
    !start ||
    !end
  ) {
    return "Start and End Date/Time are required.";
  }

  const startDate =
    new Date(
      start
    );

  const endDate =
    new Date(
      end
    );

  if (
    Number.isNaN(
      startDate.getTime()
    ) ||
    Number.isNaN(
      endDate.getTime()
    )
  ) {
    return "Invalid Date/Time.";
  }

  if (
    endDate <=
    startDate
  ) {
    return "End Date/Time must be later than Start Date/Time.";
  }

  return null;
}


function auditDateTime(
  value
) {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return null;
  }

  if (
    value instanceof Date
  ) {
    if (
      Number.isNaN(
        value.getTime()
      )
    ) {
      return null;
    }

    const pad = (
      number
    ) =>
      String(
        number
      ).padStart(
        2,
        "0"
      );

    return [
      value.getFullYear(),
      "-",
      pad(
        value.getMonth() + 1
      ),
      "-",
      pad(
        value.getDate()
      ),
      " ",
      pad(
        value.getHours()
      ),
      ":",
      pad(
        value.getMinutes()
      ),
      ":",
      pad(
        value.getSeconds()
      ),
    ].join("");
  }

  const text =
    String(
      value
    ).trim();

  if (!text) {
    return null;
  }

  if (
    /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/
      .test(
        text
      )
  ) {
    return text
      .replace(
        "T",
        " "
      )
      .substring(
        0,
        19
      );
  }

  return text;
}


/*
|--------------------------------------------------------------------------
| AUDIT STATE
|--------------------------------------------------------------------------
*/

function buildAuditState(
  record,
  subject =
    null,
  subjectType =
    null
) {
  if (!record) {
    return null;
  }

  const context =
    subject ||
    {};

  return {
    subject_type:
      record.subject_type ||
      subjectType ||
      null,

    subject_id:
      record.subject_id ||
      context.id ||
      null,

    employee_id:
      record.employee_id ||
      context.employee_id ||
      null,

    absence_category:
      record.absence_category ||
      record.category ||
      null,

    program_class:
      record.program_class ||
      null,

    start_datetime:
      auditDateTime(
        record.start_datetime
      ),

    end_datetime:
      auditDateTime(
        record.end_datetime
      ),

    reason:
      record.reason ||
      null,

    reference_no:
      record.reference_no ||
      null,

    remarks:
      record.remarks ||
      null,

    record_status:
      record.record_status ||
      null,

    /*
    |--------------------------------------------------------------------------
    | TRAINEE CONTEXT
    |--------------------------------------------------------------------------
    */

    course_id:
      record.course_id ||
      context.course_id ||
      null,

    course_name:
      record.course_name ||
      context.course_name ||
      null,

    platoon_id:
      record.platoon_id ||
      context.platoon_id ||
      null,

    platoon_number:
      record.platoon_number ??
      context.platoon_number ??
      null,

    /*
    |--------------------------------------------------------------------------
    | STAFF CONTEXT
    |--------------------------------------------------------------------------
    */

    category_id:
      record.category_id ||
      context.category_id ||
      null,

    category_name:
      record.category_name ||
      context.category_name ||
      null,

    branch_id:
      record.branch_id ||
      context.branch_id ||
      null,

    branch_name:
      record.branch_name ||
      context.branch_name ||
      null,

    /*
    |--------------------------------------------------------------------------
    | CANCELLATION
    |--------------------------------------------------------------------------
    */

    cancellation_reason:
      record.cancellation_reason ||
      null,

    cancelled_by:
      record.cancelled_by ||
      null,

    cancelled_at:
      auditDateTime(
        record.cancelled_at
      ),
  };
}


function buildEmptyAuditState() {
  return {
    subject_type:
      null,

    subject_id:
      null,

    employee_id:
      null,

    absence_category:
      null,

    program_class:
      null,

    start_datetime:
      null,

    end_datetime:
      null,

    reason:
      null,

    reference_no:
      null,

    remarks:
      null,

    record_status:
      null,

    course_id:
      null,

    course_name:
      null,

    platoon_id:
      null,

    platoon_number:
      null,

    category_id:
      null,

    category_name:
      null,

    branch_id:
      null,

    branch_name:
      null,

    cancellation_reason:
      null,

    cancelled_by:
      null,

    cancelled_at:
      null,
  };
}


/*
|--------------------------------------------------------------------------
| CENTRAL AUDIT
|--------------------------------------------------------------------------
*/

async function writeAudit({
  req,

  action,

  recordId,

  description,

  oldData =
    null,

  newData =
    null,

  subject =
    null,

  subjectType =
    null,
}) {
  return logRequestAudit(
    req,
    {
      action,

      module:
        "MANUAL_ABSENCE",

      recordId,

      description,

      oldData:
        oldData
          ? buildAuditState(
              oldData,
              subject,
              subjectType
            )
          : buildEmptyAuditState(),

      newData:
        newData
          ? buildAuditState(
              newData,
              subject,
              subjectType
            )
          : null,
    }
  );
}


/*
|--------------------------------------------------------------------------
| LIST
|--------------------------------------------------------------------------
*/

async function listRecords(
  req,
  res,
  next
) {
  try {
    const subjectType =
      req.query
        .subject_type
        ? normalizeSubjectType(
            req.query
              .subject_type
          )
        : null;

    if (
      req.query
        .subject_type &&
      !subjectType
    ) {
      return res
        .status(400)
        .json({
          success:
            false,

          message:
            "subject_type must be TRAINEE or STAFF.",
        });
    }

    const category =
      req.query
        .category
        ? String(
            req.query
              .category
          )
            .trim()
            .toUpperCase()
        : null;

    if (
      category &&
      !VALID_CATEGORIES.includes(
        category
      )
    ) {
      return res
        .status(400)
        .json({
          success:
            false,

          message:
            "Invalid absence category.",
        });
    }

    const rows =
      await getRecords({
        subjectType,

        search:
          req.query.search ||
          "",

        category,

        status:
          req.query.status ||
          null,

        dateFrom:
          req.query.date_from ||
          null,

        dateTo:
          req.query.date_to ||
          null,
      });

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
| CREATE
|--------------------------------------------------------------------------
*/

async function addRecord(
  req,
  res,
  next
) {
  try {
    const subjectType =
      normalizeSubjectType(
        req.body
          .subject_type
      );

    const subjectId =
      Number(
        req.body
          .subject_id
      );

    if (
      !subjectType ||
      !subjectId
    ) {
      return res
        .status(400)
        .json({
          success:
            false,

          message:
            "Valid person is required.",
        });
    }

    const subject =
      await getSubjectById(
        subjectType,
        subjectId
      );

    if (!subject) {
      return res
        .status(404)
        .json({
          success:
            false,

          message:
            subjectType ===
            "TRAINEE"
              ? "Trainee not found."
              : "PTS Staff member not found.",
        });
    }

    const category =
      String(
        req.body
          .absence_category ||
        ""
      )
        .trim()
        .toUpperCase();

    if (
      !VALID_CATEGORIES.includes(
        category
      )
    ) {
      return res
        .status(400)
        .json({
          success:
            false,

          message:
            "Invalid absence category.",
        });
    }

    const startDatetime =
      req.body
        .start_datetime;

    const endDatetime =
      req.body
        .end_datetime;

    const periodError =
      validatePeriod(
        startDatetime,
        endDatetime
      );

    if (
      periodError
    ) {
      return res
        .status(400)
        .json({
          success:
            false,

          message:
            periodError,
        });
    }

    /*
    |--------------------------------------------------------------------------
    | COURSE-DATE VALIDATION
    |--------------------------------------------------------------------------
    */

    const periodCheck =
      await validateSubjectPeriod({
        subjectType,
        subjectId,
        startDatetime,
        endDatetime,
      });

    if (
      !periodCheck.valid
    ) {
      return res
        .status(400)
        .json({
          success:
            false,

          message:
            periodCheck.message,
        });
    }

    const record =
      await createRecord({
        subjectType,
        subjectId,

        category,

        programClass:
          req.body
            .program_class,

        startDatetime,
        endDatetime,

        reason:
          req.body
            .reason,

        referenceNo:
          req.body
            .reference_no,

        remarks:
          req.body
            .remarks,

        userId:
          req.user?.id ||
          null,
      });

    await writeAudit({
      req,

      action:
        "CREATE",

      recordId:
        `${subjectType}:${record.id}`,

      description:
        `Manual Absence marked for ${subject.employee_id}.`,

      oldData:
        null,

      newData: {
        ...record,

        subject_type:
          subjectType,

        subject_id:
          subject.id,

        employee_id:
          subject.employee_id,
      },

      subject,

      subjectType,
    });

    return res
      .status(201)
      .json({
        success:
          true,

        message:
          "Manual Absence marked successfully.",

        data:
          record,
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
| EDIT
|--------------------------------------------------------------------------
*/

async function editRecord(
  req,
  res,
  next
) {
  try {
    const subjectType =
      normalizeSubjectType(
        req.params
          .subjectType
      );

    const id =
      Number(
        req.params.id
      );

    if (
      !subjectType ||
      !id
    ) {
      return res
        .status(400)
        .json({
          success:
            false,

          message:
            "Invalid Manual Absence record.",
        });
    }

    const existing =
      await getById(
        subjectType,
        id
      );

    if (!existing) {
      return res
        .status(404)
        .json({
          success:
            false,

          message:
            "Record not found.",
        });
    }

    if (
      existing.record_status !==
      "ACTIVE"
    ) {
      return res
        .status(400)
        .json({
          success:
            false,

          message:
            "Cancelled record cannot be edited.",
        });
    }

    const category =
      String(
        req.body
          .absence_category ||
        ""
      )
        .trim()
        .toUpperCase();

    if (
      !VALID_CATEGORIES.includes(
        category
      )
    ) {
      return res
        .status(400)
        .json({
          success:
            false,

          message:
            "Invalid category.",
        });
    }

    const startDatetime =
      req.body
        .start_datetime;

    const endDatetime =
      req.body
        .end_datetime;

    const periodError =
      validatePeriod(
        startDatetime,
        endDatetime
      );

    if (
      periodError
    ) {
      return res
        .status(400)
        .json({
          success:
            false,

          message:
            periodError,
        });
    }

    /*
    |--------------------------------------------------------------------------
    | COURSE-DATE VALIDATION
    |--------------------------------------------------------------------------
    */

    const periodCheck =
      await validateSubjectPeriod({
        subjectType,

        subjectId:
          existing.subject_id,

        startDatetime,
        endDatetime,
      });

    if (
      !periodCheck.valid
    ) {
      return res
        .status(400)
        .json({
          success:
            false,

          message:
            periodCheck.message,
        });
    }

    const subject =
      await getSubjectById(
        subjectType,
        existing.subject_id
      );

    const record =
      await updateRecord({
        subjectType,
        id,

        category,

        programClass:
          req.body
            .program_class,

        startDatetime,
        endDatetime,

        reason:
          req.body
            .reason,

        referenceNo:
          req.body
            .reference_no,

        remarks:
          req.body
            .remarks,

        updatedBy:
          req.user?.id ||
          null,
      });

    if (!record) {
      return res
        .status(400)
        .json({
          success:
            false,

          message:
            "Manual Absence could not be updated.",
        });
    }

    await writeAudit({
      req,

      action:
        "UPDATE",

      recordId:
        `${subjectType}:${id}`,

      description:
        `Manual Absence updated for ${
          subject?.employee_id ||
          existing.employee_id ||
          "employee"
        }.`,

      oldData:
        existing,

      newData:
        record,

      subject,

      subjectType,
    });

    return res.json({
      success:
        true,

      message:
        "Manual Absence updated.",

      data:
        record,
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
| CANCEL
|--------------------------------------------------------------------------
*/

async function cancelRecordController(
  req,
  res,
  next
) {
  try {
    const subjectType =
      normalizeSubjectType(
        req.params
          .subjectType
      );

    const id =
      Number(
        req.params.id
      );

    if (
      !subjectType ||
      !id
    ) {
      return res
        .status(400)
        .json({
          success:
            false,

          message:
            "Invalid Manual Absence record.",
        });
    }

    const existing =
      await getById(
        subjectType,
        id
      );

    if (!existing) {
      return res
        .status(404)
        .json({
          success:
            false,

          message:
            "Record not found.",
        });
    }

    const reason =
      String(
        req.body
          .cancellation_reason ||
        ""
      ).trim();

    if (!reason) {
      return res
        .status(400)
        .json({
          success:
            false,

          message:
            "Cancellation Reason is required.",
        });
    }

    const subject =
      await getSubjectById(
        subjectType,
        existing.subject_id
      );

    const record =
      await cancelRecord({
        subjectType,
        id,

        cancelledBy:
          req.user?.id ||
          null,

        cancellationReason:
          reason,
      });

    if (!record) {
      return res
        .status(400)
        .json({
          success:
            false,

          message:
            "Only Active record can be cancelled.",
        });
    }

    await writeAudit({
      req,

      action:
        "CANCEL",

      recordId:
        `${subjectType}:${id}`,

      description:
        `Manual Absence cancelled for ${
          subject?.employee_id ||
          existing.employee_id ||
          "employee"
        }.`,

      oldData:
        existing,

      newData:
        record,

      subject,

      subjectType,
    });

    return res.json({
      success:
        true,

      message:
        "Manual Absence cancelled.",

      data:
        record,
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
  listRecords,

  addRecord,

  editRecord,

  cancelRecordController,
};