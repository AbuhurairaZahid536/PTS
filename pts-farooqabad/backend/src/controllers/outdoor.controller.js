const {
  normalizeSubjectType,

  getSubjectById,
  getOutdoorById,

  getOutdoorRecords,
  hasOutdoorOverlap,
  validateOutdoorCoursePeriods,

  createOutdoor,
  updateOutdoor,

  cancelOutdoor,
  completeOutdoor,
} = require(
  "../models/outdoor.model"
);

const {
  logRequestAudit,
} = require(
  "../services/audit.service"
);

const {
  findIndividualLongWeekendConflict,
  buildReverseConflictMessage,
} = require("../services/longWeekendConflict.service");

/*
|--------------------------------------------------------------------------
| BASIC HELPERS
|--------------------------------------------------------------------------
*/

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


function toBoolean(value) {
  if (
    value === true ||
    value === 1
  ) {
    return true;
  }

  const text =
    String(
      value ?? ""
    )
      .trim()
      .toUpperCase();

  return [
    "1",
    "TRUE",
    "YES",
    "Y",
    "ON",
  ].includes(text);
}


async function individualWeekendConflictMessageForHomeRest({
  subjectType,
  subjectId,
  homeRest,
  startDatetime,
  endDatetime,
}) {
  if (
    subjectType !== "TRAINEE" ||
    !homeRest ||
    !startDatetime ||
    !endDatetime
  ) {
    return null;
  }

  const conflict =
    await findIndividualLongWeekendConflict({
      traineeId:
        subjectId,
      startDatetime,
      endDatetime,
    });

  return buildReverseConflictMessage(
    conflict,
    "Home Rest"
  );
}


function pad(value) {
  return String(value)
    .padStart(
      2,
      "0"
    );
}


function isValidDate(value) {
  if (!value) {
    return false;
  }

  const date =
    new Date(value);

  return !Number.isNaN(
    date.getTime()
  );
}


function dateOnly(value) {
  if (!value) {
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

    return [
      value.getFullYear(),
      pad(
        value.getMonth() + 1
      ),
      pad(
        value.getDate()
      ),
    ].join("-");
  }

  const text =
    String(value).trim();

  if (!text) {
    return null;
  }

  const sqlMatch =
    text.match(
      /^(\d{4}-\d{2}-\d{2})/
    );

  if (sqlMatch) {
    return sqlMatch[1];
  }

  const date =
    new Date(text);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return null;
  }

  return [
    date.getFullYear(),
    pad(
      date.getMonth() + 1
    ),
    pad(
      date.getDate()
    ),
  ].join("-");
}


function auditDateTime(value) {
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
    String(value).trim();

  if (!text) {
    return null;
  }

  if (
    /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/
      .test(text)
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

  const date =
    new Date(text);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return text;
  }

  return [
    date.getFullYear(),
    "-",
    pad(
      date.getMonth() + 1
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


/*
|--------------------------------------------------------------------------
| OUTDOOR RULE
|--------------------------------------------------------------------------
|
| Outdoor sirf ONE DATE ka hota hai.
|
| Frontend compatibility ki wajah se DB abhi:
|
| start_datetime = selected day 00:00:00
| end_datetime   = selected day 23:59:59
|
| use karta rahega.
|
| Lekin backend multi-day Outdoor reject karega.
|
|--------------------------------------------------------------------------
*/

function validateOutdoorPeriod(
  startDatetime,
  endDatetime
) {
  if (
    !isValidDate(
      startDatetime
    ) ||
    !isValidDate(
      endDatetime
    )
  ) {
    return (
      "Valid Outdoor Date is required."
    );
  }

  const startDate =
    dateOnly(
      startDatetime
    );

  const endDate =
    dateOnly(
      endDatetime
    );

  if (
    !startDate ||
    !endDate
  ) {
    return (
      "Valid Outdoor Date is required."
    );
  }

  if (
    startDate !==
    endDate
  ) {
    return (
      "Outdoor can only be recorded for one date. Multi-day Outdoor is not allowed."
    );
  }

  if (
    new Date(
      endDatetime
    ) <=
    new Date(
      startDatetime
    )
  ) {
    return (
      "Invalid Outdoor Date."
    );
  }

  return null;
}


/*
|--------------------------------------------------------------------------
| MEDICAL / HOME REST PERIOD
|--------------------------------------------------------------------------
*/

function validateRestPeriod(
  startDatetime,
  endDatetime,
  label
) {
  if (
    !isValidDate(
      startDatetime
    ) ||
    !isValidDate(
      endDatetime
    )
  ) {
    return (
      `${label}: valid From and To Date/Time are required.`
    );
  }

  if (
    new Date(
      endDatetime
    ) <=
    new Date(
      startDatetime
    )
  ) {
    return (
      `${label}: To Date/Time must be later than From Date/Time.`
    );
  }

  return null;
}


function validateRestPeriods(body) {
  const medicalRest =
    toBoolean(
      body.medical_rest
    );

  const homeRest =
    toBoolean(
      body.home_rest
    );

  if (medicalRest) {
    const error =
      validateRestPeriod(
        body
          .medical_rest_start_datetime,

        body
          .medical_rest_end_datetime,

        "Medical Rest"
      );

    if (error) {
      return error;
    }
  }

  if (homeRest) {
    const error =
      validateRestPeriod(
        body
          .home_rest_start_datetime,

        body
          .home_rest_end_datetime,

        "Home Rest"
      );

    if (error) {
      return error;
    }
  }

  return null;
}


/*
|--------------------------------------------------------------------------
| AUDIT STATE
|--------------------------------------------------------------------------
|
| Outdoor Start/End intentionally Audit UI mein expose nahi karte.
| Sirf Outdoor Date show hogi.
|
|--------------------------------------------------------------------------
*/

function buildAuditState(
  record,
  subject =
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
      context.subject_type ||
      null,

    subject_id:
      record.subject_id ||
      context.id ||
      null,

    employee_id:
      record.employee_id ||
      context.employee_id ||
      null,

    outdoor_date:
      dateOnly(
        record.start_datetime ||
        record.outdoor_date
      ),

    outdoor_purpose:
      record.outdoor_purpose ||
      null,

    location:
      record.location ||
      null,

    reference_no:
      record.reference_no ||
      null,

    doctor_name:
      record.doctor_name ||
      null,

    doctor_checked_datetime:
      auditDateTime(
        record
          .doctor_checked_datetime
      ),

    doctor_recommendation:
      record
        .doctor_recommendation ||
      null,

    medical_rest:
      toBoolean(
        record.medical_rest
      ),

    medical_rest_start_datetime:
      auditDateTime(
        record
          .medical_rest_start_datetime ||
        record
          .medical_rest_start
      ),

    medical_rest_end_datetime:
      auditDateTime(
        record
          .medical_rest_end_datetime ||
        record
          .medical_rest_end
      ),

    home_rest:
      toBoolean(
        record.home_rest
      ),

    home_rest_start_datetime:
      auditDateTime(
        record
          .home_rest_start_datetime ||
        record
          .home_rest_start
      ),

    home_rest_end_datetime:
      auditDateTime(
        record
          .home_rest_end_datetime ||
        record
          .home_rest_end
      ),

    workflow_status:
      record.workflow_status ||
      null,

    remarks:
      record.remarks ||
      null,

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

    cancellation_reason:
      record
        .cancellation_reason ||
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

    outdoor_date:
      null,

    outdoor_purpose:
      null,

    location:
      null,

    reference_no:
      null,

    doctor_name:
      null,

    doctor_checked_datetime:
      null,

    doctor_recommendation:
      null,

    medical_rest:
      null,

    medical_rest_start_datetime:
      null,

    medical_rest_end_datetime:
      null,

    home_rest:
      null,

    home_rest_start_datetime:
      null,

    home_rest_end_datetime:
      null,

    workflow_status:
      null,

    remarks:
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
}) {
  return logRequestAudit(
    req,
    {
      action,

      module:
        "OUTDOOR_MEDICAL",

      recordId,

      description,

      oldData:
        oldData
          ? buildAuditState(
              oldData,
              subject
            )
          : buildEmptyAuditState(),

      newData:
        newData
          ? buildAuditState(
              newData,
              subject
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

async function listOutdoor(
  req,
  res,
  next
) {
  try {
    const subjectType =
      req.query.subject_type
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

    const rows =
      await getOutdoorRecords({
        subjectType,

        search:
          req.query.search ||
          "",

        status:
          req.query.status ||
          null,

        dateFrom:
          req.query.date_from ||
          null,

        dateTo:
          req.query.date_to ||
          null,

        homeRestOnly:
          String(
            req.query
              .home_rest_only ||
            ""
          ) === "1",

        medicalRestOnly:
          String(
            req.query
              .medical_rest_only ||
            ""
          ) === "1",
      });

    return res.json({
      success:
        true,

      data:
        rows,
    });
  } catch (error) {
    return next(error);
  }
}


/*
|--------------------------------------------------------------------------
| SINGLE
|--------------------------------------------------------------------------
*/

async function getOutdoor(
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
            "Invalid record.",
        });
    }

    const record =
      await getOutdoorById(
        subjectType,
        id
      );

    if (!record) {
      return res
        .status(404)
        .json({
          success:
            false,

          message:
            "Outdoor record not found.",
        });
    }

    return res.json({
      success:
        true,

      data:
        record,
    });
  } catch (error) {
    return next(error);
  }
}


/*
|--------------------------------------------------------------------------
| CREATE
|--------------------------------------------------------------------------
*/

async function addOutdoor(
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
      !Number.isInteger(
        subjectId
      ) ||
      subjectId < 1
    ) {
      return res
        .status(400)
        .json({
          success:
            false,

          message:
            "Valid subject_type and subject_id are required.",
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
            "Person not found.",
        });
    }

    const outdoorPurpose =
      cleanText(
        req.body
          .outdoor_purpose
      );

    if (!outdoorPurpose) {
      return res
        .status(400)
        .json({
          success:
            false,

          message:
            "Outdoor Purpose is required.",
        });
    }

    /*
    |--------------------------------------------------------------------------
    | OUTDOOR = ONE DATE
    |--------------------------------------------------------------------------
    */

    const startDatetime =
      req.body
        .start_datetime;

    const endDatetime =
      req.body
        .end_datetime;

    const outdoorError =
      validateOutdoorPeriod(
        startDatetime,
        endDatetime
      );

    if (outdoorError) {
      return res
        .status(400)
        .json({
          success:
            false,

          message:
            outdoorError,
        });
    }

    /*
    |--------------------------------------------------------------------------
    | MEDICAL / HOME REST
    |--------------------------------------------------------------------------
    */

    const restError =
      validateRestPeriods(
        req.body
      );

    if (restError) {
      return res
        .status(400)
        .json({
          success:
            false,

          message:
            restError,
        });
    }

    const medicalRest =
      toBoolean(
        req.body
          .medical_rest
      );

    const homeRest =
      toBoolean(
        req.body
          .home_rest
      );

    /*
    |--------------------------------------------------------------------------
    | TRAINEE COURSE PERIOD VALIDATION
    |--------------------------------------------------------------------------
    |
    | Staff is not limited by Course dates. For a Trainee, Outdoor, Medical
    | Rest and Home Rest must all remain inside that selected trainee record's
    | own Course Start/End Date.
    |--------------------------------------------------------------------------
    */

    const coursePeriodCheck =
      await validateOutdoorCoursePeriods({
        subjectType,
        subjectId,

        startDatetime,
        endDatetime,

        medicalRest,
        medicalRestStartDatetime:
          medicalRest
            ? req.body
                .medical_rest_start_datetime
            : null,
        medicalRestEndDatetime:
          medicalRest
            ? req.body
                .medical_rest_end_datetime
            : null,

        homeRest,
        homeRestStartDatetime:
          homeRest
            ? req.body
                .home_rest_start_datetime
            : null,
        homeRestEndDatetime:
          homeRest
            ? req.body
                .home_rest_end_datetime
            : null,
      });

    if (!coursePeriodCheck.valid) {
      return res
        .status(400)
        .json({
          success:
            false,

          message:
            coursePeriodCheck.message,
        });
    }

    /*
    |--------------------------------------------------------------------------
    | OVERLAP
    |--------------------------------------------------------------------------
    */

    const overlap =
      await hasOutdoorOverlap({
        subjectType,
        subjectId,
        startDatetime,
        endDatetime,
      });

    if (overlap) {
      return res
        .status(409)
        .json({
          success:
            false,

          message:
            "An active Outdoor record already exists for the selected date.",
        });
    }

    const weekendConflictMessage =
      await individualWeekendConflictMessageForHomeRest({
        subjectType,
        subjectId,
        homeRest,
        startDatetime:
          homeRest
            ? req.body.home_rest_start_datetime
            : null,
        endDatetime:
          homeRest
            ? req.body.home_rest_end_datetime
            : null,
      });

    if (weekendConflictMessage) {
      return res
        .status(409)
        .json({
          success:
            false,

          message:
            weekendConflictMessage,
        });
    }

    const record =
      await createOutdoor({
        subjectType,
        subjectId,

        outdoorPurpose,

        location:
          cleanText(
            req.body.location
          ),

        startDatetime,
        endDatetime,

        referenceNo:
          cleanText(
            req.body
              .reference_no
          ),

        doctorName:
          cleanText(
            req.body
              .doctor_name
          ),

        doctorCheckedDatetime:
          req.body
            .doctor_checked_datetime ||
          null,

        doctorRecommendation:
          cleanText(
            req.body
              .doctor_recommendation
          ),

        medicalRest,

        medicalRestStartDatetime:
          medicalRest
            ? req.body
                .medical_rest_start_datetime
            : null,

        medicalRestEndDatetime:
          medicalRest
            ? req.body
                .medical_rest_end_datetime
            : null,

        homeRest,

        homeRestStartDatetime:
          homeRest
            ? req.body
                .home_rest_start_datetime
            : null,

        homeRestEndDatetime:
          homeRest
            ? req.body
                .home_rest_end_datetime
            : null,

        remarks:
          cleanText(
            req.body.remarks
          ),

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
        `Outdoor / Medical record created for ${subject.employee_id} for ${dateOnly(
          startDatetime
        )}.`,

      oldData:
        null,

      newData: {
        ...record,

        subject_type:
          subjectType,

        employee_id:
          subject.employee_id,
      },

      subject: {
        ...subject,

        subject_type:
          subjectType,
      },
    });

    return res
      .status(201)
      .json({
        success:
          true,

        message:
          "Outdoor / Medical record created successfully.",

        data:
          record,
      });
  } catch (error) {
    return next(error);
  }
}


/*
|--------------------------------------------------------------------------
| UPDATE
|--------------------------------------------------------------------------
*/

async function editOutdoor(
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
            "Invalid record.",
        });
    }

    const existing =
      await getOutdoorById(
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
            "Outdoor record not found.",
        });
    }

    if (
      existing.workflow_status !==
      "ACTIVE"
    ) {
      return res
        .status(400)
        .json({
          success:
            false,

          message:
            "Only Active records can be edited.",
        });
    }

    const outdoorPurpose =
      cleanText(
        req.body
          .outdoor_purpose
      );

    if (!outdoorPurpose) {
      return res
        .status(400)
        .json({
          success:
            false,

          message:
            "Outdoor Purpose is required.",
        });
    }

    /*
    |--------------------------------------------------------------------------
    | OUTDOOR = ONE DATE
    |--------------------------------------------------------------------------
    */

    const startDatetime =
      req.body
        .start_datetime;

    const endDatetime =
      req.body
        .end_datetime;

    const outdoorError =
      validateOutdoorPeriod(
        startDatetime,
        endDatetime
      );

    if (outdoorError) {
      return res
        .status(400)
        .json({
          success:
            false,

          message:
            outdoorError,
        });
    }

    /*
    |--------------------------------------------------------------------------
    | MEDICAL / HOME REST
    |--------------------------------------------------------------------------
    */

    const restError =
      validateRestPeriods(
        req.body
      );

    if (restError) {
      return res
        .status(400)
        .json({
          success:
            false,

          message:
            restError,
        });
    }

    const medicalRest =
      toBoolean(
        req.body
          .medical_rest
      );

    const homeRest =
      toBoolean(
        req.body
          .home_rest
      );

    /*
    |--------------------------------------------------------------------------
    | TRAINEE COURSE PERIOD VALIDATION
    |--------------------------------------------------------------------------
    */

    const coursePeriodCheck =
      await validateOutdoorCoursePeriods({
        subjectType,

        subjectId:
          existing.subject_id,

        startDatetime,
        endDatetime,

        medicalRest,
        medicalRestStartDatetime:
          medicalRest
            ? req.body
                .medical_rest_start_datetime
            : null,
        medicalRestEndDatetime:
          medicalRest
            ? req.body
                .medical_rest_end_datetime
            : null,

        homeRest,
        homeRestStartDatetime:
          homeRest
            ? req.body
                .home_rest_start_datetime
            : null,
        homeRestEndDatetime:
          homeRest
            ? req.body
                .home_rest_end_datetime
            : null,
      });

    if (!coursePeriodCheck.valid) {
      return res
        .status(400)
        .json({
          success:
            false,

          message:
            coursePeriodCheck.message,
        });
    }

    /*
    |--------------------------------------------------------------------------
    | OVERLAP
    |--------------------------------------------------------------------------
    */

    const overlap =
      await hasOutdoorOverlap({
        subjectType,

        subjectId:
          existing.subject_id,

        startDatetime,
        endDatetime,

        excludeId:
          id,
      });

    if (overlap) {
      return res
        .status(409)
        .json({
          success:
            false,

          message:
            "Another active Outdoor record already exists for the selected date.",
        });
    }

    const weekendConflictMessage =
      await individualWeekendConflictMessageForHomeRest({
        subjectType,
        subjectId:
          existing.subject_id,
        homeRest,
        startDatetime:
          homeRest
            ? req.body.home_rest_start_datetime
            : null,
        endDatetime:
          homeRest
            ? req.body.home_rest_end_datetime
            : null,
      });

    if (weekendConflictMessage) {
      return res
        .status(409)
        .json({
          success:
            false,

          message:
            weekendConflictMessage,
        });
    }

    const subject =
      await getSubjectById(
        subjectType,
        existing.subject_id
      );

    const record =
      await updateOutdoor({
        subjectType,
        id,

        outdoorPurpose,

        location:
          cleanText(
            req.body.location
          ),

        startDatetime,
        endDatetime,

        referenceNo:
          cleanText(
            req.body
              .reference_no
          ),

        doctorName:
          cleanText(
            req.body
              .doctor_name
          ),

        doctorCheckedDatetime:
          req.body
            .doctor_checked_datetime ||
          null,

        doctorRecommendation:
          cleanText(
            req.body
              .doctor_recommendation
          ),

        medicalRest,

        medicalRestStartDatetime:
          medicalRest
            ? req.body
                .medical_rest_start_datetime
            : null,

        medicalRestEndDatetime:
          medicalRest
            ? req.body
                .medical_rest_end_datetime
            : null,

        homeRest,

        homeRestStartDatetime:
          homeRest
            ? req.body
                .home_rest_start_datetime
            : null,

        homeRestEndDatetime:
          homeRest
            ? req.body
                .home_rest_end_datetime
            : null,

        remarks:
          cleanText(
            req.body.remarks
          ),

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
            "Record could not be updated.",
        });
    }

    await writeAudit({
      req,

      action:
        "UPDATE",

      recordId:
        `${subjectType}:${id}`,

      description:
        `Outdoor / Medical record updated for ${
          subject?.employee_id ||
          existing.employee_id ||
          "employee"
        }.`,

      oldData:
        existing,

      newData:
        record,

      subject:
        subject
          ? {
              ...subject,

              subject_type:
                subjectType,
            }
          : null,
    });

    return res.json({
      success:
        true,

      message:
        "Outdoor / Medical record updated successfully.",

      data:
        record,
    });
  } catch (error) {
    return next(error);
  }
}


/*
|--------------------------------------------------------------------------
| CANCEL
|--------------------------------------------------------------------------
*/

async function cancelOutdoorRecord(
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
            "Invalid record.",
        });
    }

    const existing =
      await getOutdoorById(
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
            "Outdoor record not found.",
        });
    }

    const cancellationReason =
      cleanText(
        req.body
          .cancellation_reason
      );

    if (!cancellationReason) {
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
      await cancelOutdoor({
        subjectType,
        id,

        cancelledBy:
          req.user?.id ||
          null,

        cancellationReason,
      });

    if (!record) {
      return res
        .status(400)
        .json({
          success:
            false,

          message:
            "Only Active records can be cancelled.",
        });
    }

    await writeAudit({
      req,

      action:
        "CANCEL",

      recordId:
        `${subjectType}:${id}`,

      description:
        `Outdoor / Medical record cancelled for ${
          subject?.employee_id ||
          existing.employee_id ||
          "employee"
        }.`,

      oldData:
        existing,

      newData:
        record,

      subject:
        subject
          ? {
              ...subject,

              subject_type:
                subjectType,
            }
          : null,
    });

    return res.json({
      success:
        true,

      message:
        "Record cancelled successfully.",

      data:
        record,
    });
  } catch (error) {
    return next(error);
  }
}


/*
|--------------------------------------------------------------------------
| COMPLETE
|--------------------------------------------------------------------------
*/

async function completeOutdoorRecord(
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
            "Invalid record.",
        });
    }

    const existing =
      await getOutdoorById(
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
            "Outdoor record not found.",
        });
    }

    const subject =
      await getSubjectById(
        subjectType,
        existing.subject_id
      );

    const record =
      await completeOutdoor({
        subjectType,
        id,

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
            "Only Active records can be completed.",
        });
    }

    await writeAudit({
      req,

      action:
        "COMPLETE",

      recordId:
        `${subjectType}:${id}`,

      description:
        `Outdoor / Medical record completed for ${
          subject?.employee_id ||
          existing.employee_id ||
          "employee"
        }.`,

      oldData:
        existing,

      newData:
        record,

      subject:
        subject
          ? {
              ...subject,

              subject_type:
                subjectType,
            }
          : null,
    });

    return res.json({
      success:
        true,

      message:
        "Record marked Completed.",

      data:
        record,
    });
  } catch (error) {
    return next(error);
  }
}


module.exports = {
  listOutdoor,

  getOutdoor,

  addOutdoor,

  editOutdoor,

  cancelOutdoorRecord,

  completeOutdoorRecord,
};