const ExcelJS =
  require("exceljs");

const {
  pool,
} = require("../config/db");

const {
  normalizeSubjectType,

  getSubjectById,

  resolveSubjectForLeave,

  validateSubjectLeavePeriod,

  getLeaveById,

  getLeaves,

  hasLeaveOverlap,

  createNormalLeave,

  createEmergencyLeave,

  updateLeave,

  approveEmergencyLeave,

  rejectEmergencyLeave,

  cancelLeave,

  getTraineeApprovedLeaveCapInfo,
} = require("../models/leave.model");

const {
  logRequestAudit,
  logBulkAudit,
} = require("../services/audit.service");

const {
  findIndividualLongWeekendConflict,
  buildReverseConflictMessage,
} = require("../services/longWeekendConflict.service");

/*
|--------------------------------------------------------------------------
| HELPERS
|--------------------------------------------------------------------------
*/

function isValidDateTime(
  value
) {
  if (!value) {
    return false;
  }

  const date =
    new Date(
      value
    );

  return !Number.isNaN(
    date.getTime()
  );
}

function validatePeriod(
  startDatetime,
  endDatetime
) {
  if (
    !isValidDateTime(
      startDatetime
    ) ||
    !isValidDateTime(
      endDatetime
    )
  ) {
    return "Valid Start and End Date/Time are required.";
  }

  if (
    new Date(
      endDatetime
    ) <=
    new Date(
      startDatetime
    )
  ) {
    return "End Date/Time must be later than Start Date/Time.";
  }

  return null;
}


async function individualWeekendConflictMessageForLeave({
  subjectType,
  subjectId,
  startDatetime,
  endDatetime,
}) {
  if (subjectType !== "TRAINEE") {
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
    "Leave"
  );
}


/*
|--------------------------------------------------------------------------
| APPROVED LEAVE CAP
|--------------------------------------------------------------------------
*/

async function enforceApprovedLeaveCap({
  subjectType,
  subjectId,
  excludeLeaveId =
    null,
}) {
  if (
    subjectType !==
    "TRAINEE"
  ) {
    return null;
  }

  const info =
    await getTraineeApprovedLeaveCapInfo({
      traineeId:
        subjectId,

      excludeLeaveId,
    });

  if (
    !info ||
    info.max_approved_leaves ===
      null
  ) {
    return info;
  }

  const nextCount =
    Number(
      info.approved_leave_count ||
      0
    ) +
    1;

  if (
    nextCount >
    Number(
      info.max_approved_leaves
    )
  ) {
    const error =
      new Error(
        "Approved leave limit exceeded for this trainee."
      );

    error.statusCode =
      400;

    throw error;
  }

  return {
    ...info,

    next_approved_leave_count:
      nextCount,
  };
}

function pad(
  value
) {
  return String(
    value
  ).padStart(
    2,
    "0"
  );
}

function toSqlDateTime(
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

function dateOnly(
  value
) {
  if (!value) {
    return null;
  }

  if (
    value instanceof Date
  ) {
    return [
      value.getFullYear(),
      "-",
      pad(
        value.getMonth() +
        1
      ),
      "-",
      pad(
        value.getDate()
      ),
    ].join("");
  }

  return String(
    value
  ).substring(
    0,
    10
  );
}

/*
|--------------------------------------------------------------------------
| EXCEL VALUE
|--------------------------------------------------------------------------
*/

function excelValue(
  value
) {
  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }

  if (
    typeof value ===
      "object" &&
    value.text !==
      undefined
  ) {
    return String(
      value.text
    ).trim();
  }

  if (
    typeof value ===
      "object" &&
    Array.isArray(
      value.richText
    )
  ) {
    return value.richText
      .map(
        (
          item
        ) =>
          item.text
      )
      .join("")
      .trim();
  }

  if (
    typeof value ===
      "object" &&
    value.result !==
      undefined
  ) {
    return excelValue(
      value.result
    );
  }

  return String(
    value
  ).trim();
}

/*
|--------------------------------------------------------------------------
| EXCEL DATE PARSER
|--------------------------------------------------------------------------
*/

function parseExcelDateTime(
  value
) {
  if (!value) {
    return null;
  }

  if (
    value instanceof Date
  ) {
    return Number.isNaN(
      value.getTime()
    )
      ? null
      : new Date(
          value.getTime()
        );
  }

  const text =
    excelValue(
      value
    );

  if (!text) {
    return null;
  }

  /*
  |--------------------------------------------------------------------------
  | YYYY-MM-DD
  |--------------------------------------------------------------------------
  */

  let match =
    text.match(
      /^(\d{4})-(\d{1,2})-(\d{1,2})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i
    );

  if (match) {
    const year =
      Number(
        match[1]
      );

    const month =
      Number(
        match[2]
      ) -
      1;

    const day =
      Number(
        match[3]
      );

    let hour =
      Number(
        match[4]
      );

    const minute =
      Number(
        match[5]
      );

    const second =
      Number(
        match[6] ||
        0
      );

    const meridiem =
      String(
        match[7] ||
        ""
      ).toUpperCase();

    if (
      meridiem ===
        "PM" &&
      hour <
        12
    ) {
      hour +=
        12;
    }

    if (
      meridiem ===
        "AM" &&
      hour ===
        12
    ) {
      hour =
        0;
    }

    return new Date(
      year,
      month,
      day,
      hour,
      minute,
      second
    );
  }

  const monthNames = {
    JAN:
      0,

    FEB:
      1,

    MAR:
      2,

    APR:
      3,

    MAY:
      4,

    JUN:
      5,

    JUL:
      6,

    AUG:
      7,

    SEP:
      8,

    OCT:
      9,

    NOV:
      10,

    DEC:
      11,
  };

  match =
    text.match(
      /^(\d{1,2})[-\/]([A-Za-z]{3})[-\/](\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i
    );

  if (match) {
    const day =
      Number(
        match[1]
      );

    const month =
      monthNames[
        match[2]
          .toUpperCase()
      ];

    const year =
      Number(
        match[3]
      );

    let hour =
      Number(
        match[4]
      );

    const minute =
      Number(
        match[5]
      );

    const second =
      Number(
        match[6] ||
        0
      );

    const meridiem =
      String(
        match[7] ||
        ""
      ).toUpperCase();

    if (
      meridiem ===
        "PM" &&
      hour <
        12
    ) {
      hour +=
        12;
    }

    if (
      meridiem ===
        "AM" &&
      hour ===
        12
    ) {
      hour =
        0;
    }

    return new Date(
      year,
      month,
      day,
      hour,
      minute,
      second
    );
  }

  match =
    text.match(
      /^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i
    );

  if (match) {
    const day =
      Number(
        match[1]
      );

    const month =
      Number(
        match[2]
      ) -
      1;

    const year =
      Number(
        match[3]
      );

    let hour =
      Number(
        match[4]
      );

    const minute =
      Number(
        match[5]
      );

    const second =
      Number(
        match[6] ||
        0
      );

    const meridiem =
      String(
        match[7] ||
        ""
      ).toUpperCase();

    if (
      meridiem ===
        "PM" &&
      hour <
        12
    ) {
      hour +=
        12;
    }

    if (
      meridiem ===
        "AM" &&
      hour ===
        12
    ) {
      hour =
        0;
    }

    return new Date(
      year,
      month,
      day,
      hour,
      minute,
      second
    );
  }

  return null;
}

/*
|--------------------------------------------------------------------------
| AUDIT
|--------------------------------------------------------------------------
|
| Central Audit Service use hoti hai.
| Raw INSERT INTO audit_logs yahan nahi hoga.
|
|--------------------------------------------------------------------------
*/

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
    return Number.isNaN(
      value.getTime()
    )
      ? null
      : toSqlDateTime(
          value
        );
  }

  const text =
    String(
      value
    ).trim();

  if (!text) {
    return null;
  }

  const parsed =
    new Date(
      text
    );

  if (
    Number.isNaN(
      parsed.getTime()
    )
  ) {
    return text;
  }

  return toSqlDateTime(
    parsed
  );
}

function auditBoolean(
  value
) {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return null;
  }

  return (
    value === true ||
    Number(
      value
    ) === 1 ||
    String(
      value
    ).trim()
      .toUpperCase() ===
      "TRUE"
  );
}

function normalizeLeaveAuditData(
  data
) {
  if (!data) {
    return null;
  }

  return {
    subject_id:
      data.subject_id ??
      null,

    employee_id:
      data.employee_id ??
      null,

    leave_category:
      data.leave_category ??
      null,

    leave_type:
      data.leave_type ??
      null,

    workflow_status:
      data.workflow_status ??
      null,

    start_datetime:
      auditDateTime(
        data.start_datetime
      ),

    end_datetime:
      auditDateTime(
        data.end_datetime
      ),

    reason:
      data.reason ??
      null,

    reference_no:
      data.reference_no ??
      null,

    biometric_exempt:
      auditBoolean(
        data.biometric_exempt
      ),

    remarks:
      data.remarks ??
      null,

    submitted_by:
      data.submitted_by ??
      null,

    submitted_at:
      auditDateTime(
        data.submitted_at
      ),

    approved_by:
      data.approved_by ??
      null,

    approval_datetime:
      auditDateTime(
        data.approval_datetime
      ),

    rejected_by:
      data.rejected_by ??
      null,

    rejection_datetime:
      auditDateTime(
        data.rejection_datetime
      ),

    rejection_reason:
      data.rejection_reason ??
      null,

    cancelled_by:
      data.cancelled_by ??
      null,

    cancelled_at:
      auditDateTime(
        data.cancelled_at
      ),

    cancellation_reason:
      data.cancellation_reason ??
      null,
  };
}

async function writeAudit({
  req,
  action,
  recordId,
  description,
  oldData = null,
  newData = null,
}) {
  return logRequestAudit(
    req,
    {
      action,

      module:
        "LEAVE",

      recordId,

      description,

      oldData:
        normalizeLeaveAuditData(
          oldData
        ),

      newData:
        normalizeLeaveAuditData(
          newData
        ),
    }
  );
}

/*
|--------------------------------------------------------------------------
| COMMON SUBJECT PERIOD VALIDATION
|--------------------------------------------------------------------------
*/

async function validateLeaveSubject({
  subjectType,
  subjectId,
  startDatetime,
  endDatetime,
}) {
  const subject =
    await getSubjectById(
      subjectType,
      subjectId
    );

  if (!subject) {
    return {
      valid:
        false,

      subject:
        null,

      message:
        subjectType ===
        "TRAINEE"
          ? "Trainee not found."
          : "PTS Staff member not found.",
    };
  }

  const periodCheck =
    await validateSubjectLeavePeriod({
      subjectType,
      subjectId,
      startDatetime,
      endDatetime,
    });

  if (
    !periodCheck.valid
  ) {
    return {
      valid:
        false,

      subject,

      message:
        periodCheck.message,
    };
  }

  return {
    valid:
      true,

    subject,

    message:
      null,
  };
}

/*
|--------------------------------------------------------------------------
| LIST
|--------------------------------------------------------------------------
*/

async function listLeaves(
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

    const rows =
      await getLeaves({
        subjectType,

        search:
          req.query
            .search ||
          "",

        status:
          req.query
            .status ||
          null,

        category:
          req.query
            .category ||
          null,

        dateFrom:
          req.query
            .date_from ||
          null,

        dateTo:
          req.query
            .date_to ||
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
| GET SINGLE
|--------------------------------------------------------------------------
*/

async function getLeave(
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
            "Invalid Leave record.",
        });
    }

    const leave =
      await getLeaveById(
        subjectType,
        id
      );

    if (!leave) {
      return res
        .status(404)
        .json({
          success:
            false,

          message:
            "Leave record not found.",
        });
    }

    return res.json({
      success:
        true,

      data:
        leave,
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
| NORMAL LEAVE
|--------------------------------------------------------------------------
*/

async function addNormalLeave(
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
            "Valid subject_type and subject_id are required.",
        });
    }

    const leaveType =
      String(
        req.body
          .leave_type ||
          ""
      ).trim();

    if (!leaveType) {
      return res
        .status(400)
        .json({
          success:
            false,

          message:
            "Leave Type is required.",
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

    const subjectCheck =
      await validateLeaveSubject({
        subjectType,
        subjectId,
        startDatetime,
        endDatetime,
      });

    if (
      !subjectCheck.valid
    ) {
      return res
        .status(400)
        .json({
          success:
            false,

          message:
            subjectCheck.message,
        });
    }

    const overlap =
      await hasLeaveOverlap({
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
            "An Approved or Pending Leave already exists for this person during the selected period.",
        });
    }

    const weekendConflictMessage =
      await individualWeekendConflictMessageForLeave({
        subjectType,
        subjectId,
        startDatetime,
        endDatetime,
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

    await enforceApprovedLeaveCap({
      subjectType,
      subjectId,
    });

    const leave =
      await createNormalLeave({
        subjectType,
        subjectId,
        leaveType,

        reason:
          req.body.reason,

        referenceNo:
          req.body
            .reference_no,

        startDatetime,
        endDatetime,

        remarks:
          req.body.remarks,

        userId:
          req.user?.id ||
          null,
      });

    await writeAudit({
      req,

      action:
        "CREATE",

      recordId:
        `${subjectType}:${leave.id}`,

      description:
        `Approved Normal Leave created for ${subjectCheck.subject.employee_id}.`,

      newData:
        leave,
    });

    return res
      .status(201)
      .json({
        success:
          true,

        message:
          "Leave added and approved successfully.",

        data:
          leave,
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
| EMERGENCY LEAVE
|--------------------------------------------------------------------------
*/

async function submitEmergencyLeave(
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
            "Valid subject_type and subject_id are required.",
        });
    }

    const leaveType =
      String(
        req.body
          .leave_type ||
          "Emergency Leave"
      ).trim();

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

    const subjectCheck =
      await validateLeaveSubject({
        subjectType,
        subjectId,
        startDatetime,
        endDatetime,
      });

    if (
      !subjectCheck.valid
    ) {
      return res
        .status(400)
        .json({
          success:
            false,

          message:
            subjectCheck.message,
        });
    }

    const overlap =
      await hasLeaveOverlap({
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
            "An Approved or Pending Leave already exists for this person during the selected period.",
        });
    }

    const weekendConflictMessage =
      await individualWeekendConflictMessageForLeave({
        subjectType,
        subjectId,
        startDatetime,
        endDatetime,
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

    const leave =
      await createEmergencyLeave({
        subjectType,
        subjectId,
        leaveType,

        reason:
          req.body.reason,

        referenceNo:
          req.body
            .reference_no,

        startDatetime,
        endDatetime,

        remarks:
          req.body.remarks,

        userId:
          req.user?.id ||
          null,
      });

    await writeAudit({
      req,

      action:
        "SUBMIT",

      recordId:
        `${subjectType}:${leave.id}`,

      description:
        `Emergency Leave submitted for ${subjectCheck.subject.employee_id} and sent to OSI Branch for approval.`,

      newData:
        leave,
    });

    return res
      .status(201)
      .json({
        success:
          true,

        message:
          "Emergency Leave submitted to OSI Branch for approval.",

        data:
          leave,
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
| TEMPLATE
|--------------------------------------------------------------------------
*/

async function downloadLeaveTemplate(
  req,
  res,
  next
) {
  try {
    const workbook =
      new ExcelJS.Workbook();

    workbook.creator =
      "PTS Farooqabad";

    const sheet =
      workbook.addWorksheet(
        "Leave Import"
      );

    sheet.columns = [
      {
        header:
          "Employee ID/Cap No.",

        key:
          "employee_id",

        width:
          22,
      },

      {
        header:
          "Course",

        key:
          "course",

        width:
          28,
      },

      {
        header:
          "Platoon",

        key:
          "platoon",

        width:
          14,
      },

      {
        header:
          "Staff Category",

        key:
          "staff_category",

        width:
          24,
      },

      {
        header:
          "Staff Branch",

        key:
          "staff_branch",

        width:
          24,
      },

      {
        header:
          "Leave Type",

        key:
          "leave_type",

        width:
          22,
      },

      {
        header:
          "Start Date & Time",

        key:
          "start_datetime",

        width:
          24,
      },

      {
        header:
          "End Date & Time",

        key:
          "end_datetime",

        width:
          24,
      },

      {
        header:
          "Reason",

        key:
          "reason",

        width:
          30,
      },

      {
        header:
          "Order / Reference No.",

        key:
          "reference_no",

        width:
          24,
      },

      {
        header:
          "Remarks",

        key:
          "remarks",

        width:
          30,
      },
    ];

    sheet.getRow(
      1
    ).font = {
      bold:
        true,
    };

    sheet.views = [
      {
        state:
          "frozen",

        ySplit:
          1,
      },
    ];

    sheet.addRow({
      employee_id:
        "12345",

      course:
        "Driver Course 5th",

      platoon:
        "1",

      staff_category:
        "",

      staff_branch:
        "",

      leave_type:
        "Casual Leave",

      start_datetime:
        "03-Sep-2026 08:00 AM",

      end_datetime:
        "04-Sep-2026 06:00 PM",

      reason:
        "Personal",

      reference_no:
        "PTS/Leave/001",

      remarks:
        "",
    });

    const instructionSheet =
      workbook.addWorksheet(
        "Instructions"
      );

    instructionSheet.columns = [
      {
        header:
          "Instructions",

        key:
          "instruction",

        width:
          110,
      },
    ];

    instructionSheet.getRow(
      1
    ).font = {
      bold:
        true,
    };

    [
      "1. Employee ID/Cap No. is required.",
      "2. Leave Type, Start Date & Time and End Date & Time are required.",
      "3. For TRAINEES, Portal resolves the correct trainee record using Employee ID + Leave Date + Course Start/End Date.",
      "4. Course and Platoon columns are optional when Leave Date uniquely identifies one Course.",
      "5. If the same Employee ID has more than one Course active on the same date, Course/Platoon context is required.",
      "6. If a trainee Course has no Start/End Date, Leave import will be rejected until Course dates are set.",
      "7. For STAFF, Category and Branch are optional when Employee ID identifies only one Staff record.",
      "8. If Staff Employee ID maps to multiple records, Staff Category/Branch must be supplied.",
      "9. Normal Leave is imported as APPROVED.",
      "10. Emergency Leave is imported as PENDING until approval.",
      "11. Delete the example row before importing actual records.",
    ].forEach(
      (
        instruction
      ) => {
        instructionSheet.addRow({
          instruction,
        });
      }
    );

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );

    res.setHeader(
      "Content-Disposition",
      'attachment; filename="PTS_Leave_Import_Template.xlsx"'
    );

    await workbook.xlsx.write(
      res
    );

    res.end();
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
| IMPORT
|--------------------------------------------------------------------------
*/

async function importLeavesExcel(
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

    if (!subjectType) {
      return res
        .status(400)
        .json({
          success:
            false,

          message:
            "subject_type must be TRAINEE or STAFF.",
        });
    }

    const mode =
      String(
        req.params.mode ||
        ""
      )
        .trim()
        .toUpperCase();

    if (
      ![
        "NORMAL",
        "EMERGENCY",
      ].includes(
        mode
      )
    ) {
      return res
        .status(400)
        .json({
          success:
            false,

          message:
            "Import mode must be NORMAL or EMERGENCY.",
        });
    }

    if (
      !req.file?.buffer
    ) {
      return res
        .status(400)
        .json({
          success:
            false,

          message:
            "Excel file is required.",
        });
    }

    const workbook =
      new ExcelJS.Workbook();

    await workbook.xlsx.load(
      req.file.buffer
    );

    const worksheet =
      workbook.getWorksheet(
        "Leave Import"
      ) ||
      workbook.worksheets[0];

    if (!worksheet) {
      return res
        .status(400)
        .json({
          success:
            false,

          message:
            "Excel workbook contains no worksheet.",
        });
    }

    const headerMap =
      {};

    worksheet
      .getRow(1)
      .eachCell(
        (
          cell,
          columnNumber
        ) => {
          const heading =
            excelValue(
              cell.value
            )
              .toLowerCase()
              .replace(
                /\s+/g,
                " "
              )
              .trim();

          headerMap[
            heading
          ] =
            columnNumber;
        }
      );

    function col(
      names
    ) {
      for (
        const name
        of names
      ) {
        const index =
          headerMap[
            name.toLowerCase()
          ];

        if (index) {
          return index;
        }
      }

      return null;
    }

    const employeeColumn =
      col([
        "Employee ID/Cap No.",
        "Employee ID / Cap No.",
        "Employee ID",
        "Cap No.",
        "Cap No",
      ]);

    const courseColumn =
      col([
        "Course",
        "Course Name",
      ]);

    const platoonColumn =
      col([
        "Platoon",
        "Platoon Number",
      ]);

    const staffCategoryColumn =
      col([
        "Staff Category",
        "Category",
      ]);

    const staffBranchColumn =
      col([
        "Staff Branch",
        "Branch",
      ]);

    const leaveTypeColumn =
      col([
        "Leave Type",
      ]);

    const startColumn =
      col([
        "Start Date & Time",
        "Start Date/Time",
        "Start Datetime",
      ]);

    const endColumn =
      col([
        "End Date & Time",
        "End Date/Time",
        "End Datetime",
      ]);

    const reasonColumn =
      col([
        "Reason",
      ]);

    const referenceColumn =
      col([
        "Order / Reference No.",
        "Reference No.",
        "Reference No",
        "Order No.",
      ]);

    const remarksColumn =
      col([
        "Remarks",
      ]);

    const missing =
      [];

    if (!employeeColumn) {
      missing.push(
        "Employee ID/Cap No."
      );
    }

    if (!leaveTypeColumn) {
      missing.push(
        "Leave Type"
      );
    }

    if (!startColumn) {
      missing.push(
        "Start Date & Time"
      );
    }

    if (!endColumn) {
      missing.push(
        "End Date & Time"
      );
    }

    if (
      missing.length
    ) {
      return res
        .status(400)
        .json({
          success:
            false,

          message:
            `Missing required Excel column(s): ${missing.join(
              ", "
            )}`,
        });
    }

    const results = {
      mode,

      subject_type:
        subjectType,

      processed:
        0,

      imported:
        0,

      failed:
        0,

      ambiguous:
        0,

      course_date_not_set:
        0,

      no_active_course:
        0,

      errors:
        [],
    };

    for (
      let rowNumber = 2;
      rowNumber <=
      worksheet.rowCount;
      rowNumber += 1
    ) {
      const row =
        worksheet.getRow(
          rowNumber
        );

      const employeeId =
        excelValue(
          row.getCell(
            employeeColumn
          ).value
        );

      const leaveType =
        excelValue(
          row.getCell(
            leaveTypeColumn
          ).value
        );

      const startValue =
        row.getCell(
          startColumn
        ).value;

      const endValue =
        row.getCell(
          endColumn
        ).value;

      if (
        !employeeId &&
        !leaveType &&
        !startValue &&
        !endValue
      ) {
        continue;
      }

      results.processed +=
        1;

      const courseName =
        courseColumn
          ? excelValue(
              row.getCell(
                courseColumn
              ).value
            )
          : "";

      const platoonNumber =
        platoonColumn
          ? excelValue(
              row.getCell(
                platoonColumn
              ).value
            )
          : "";

      const categoryName =
        staffCategoryColumn
          ? excelValue(
              row.getCell(
                staffCategoryColumn
              ).value
            )
          : "";

      const branchName =
        staffBranchColumn
          ? excelValue(
              row.getCell(
                staffBranchColumn
              ).value
            )
          : "";

      const reason =
        reasonColumn
          ? excelValue(
              row.getCell(
                reasonColumn
              ).value
            )
          : "";

      const referenceNo =
        referenceColumn
          ? excelValue(
              row.getCell(
                referenceColumn
              ).value
            )
          : "";

      const remarks =
        remarksColumn
          ? excelValue(
              row.getCell(
                remarksColumn
              ).value
            )
          : "";

      try {
        if (!employeeId) {
          throw new Error(
            "Employee ID/Cap No. is required."
          );
        }

        if (!leaveType) {
          throw new Error(
            "Leave Type is required."
          );
        }

        const startDate =
          parseExcelDateTime(
            startValue
          );

        const endDate =
          parseExcelDateTime(
            endValue
          );

        if (
          !startDate ||
          !endDate
        ) {
          throw new Error(
            "Invalid Start or End Date/Time. Use DD-MMM-YYYY hh:mm AM/PM."
          );
        }

        if (
          endDate <=
          startDate
        ) {
          throw new Error(
            "End Date/Time must be later than Start Date/Time."
          );
        }

        const resolution =
          await resolveSubjectForLeave({
            subjectType,

            employeeId,

            referenceDate:
              dateOnly(
                startDate
              ),

            courseName:
              courseName ||
              null,

            platoonNumber:
              platoonNumber ||
              null,

            categoryName:
              categoryName ||
              null,

            branchName:
              branchName ||
              null,
          });

        if (
          resolution.status !==
          "MATCHED"
        ) {
          if (
            resolution.status ===
            "AMBIGUOUS"
          ) {
            results.ambiguous +=
              1;
          }

          if (
            resolution.status ===
            "COURSE_DATE_NOT_SET"
          ) {
            results.course_date_not_set +=
              1;
          }

          if (
            resolution.status ===
            "NO_ACTIVE_COURSE"
          ) {
            results.no_active_course +=
              1;
          }

          throw new Error(
            resolution.message ||
            "Could not resolve Leave subject."
          );
        }

        const subject =
          resolution.subject;

        const startDatetime =
          toSqlDateTime(
            startDate
          );

        const endDatetime =
          toSqlDateTime(
            endDate
          );

        const periodCheck =
          await validateSubjectLeavePeriod({
            subjectType,

            subjectId:
              subject.id,

            startDatetime,
            endDatetime,
          });

        if (
          !periodCheck.valid
        ) {
          throw new Error(
            periodCheck.message
          );
        }

        const overlap =
          await hasLeaveOverlap({
            subjectType,

            subjectId:
              subject.id,

            startDatetime,
            endDatetime,
          });

        if (overlap) {
          throw new Error(
            "Approved or Pending Leave already overlaps this period."
          );
        }

        const weekendConflictMessage =
          await individualWeekendConflictMessageForLeave({
            subjectType,
            subjectId:
              subject.id,
            startDatetime,
            endDatetime,
          });

        if (weekendConflictMessage) {
          throw new Error(
            weekendConflictMessage
          );
        }

        if (
          mode ===
          "NORMAL"
        ) {
          await enforceApprovedLeaveCap({
            subjectType,

            subjectId:
              subject.id,
          });

          await createNormalLeave({
            subjectType,

            subjectId:
              subject.id,

            leaveType,

            reason:
              reason ||
              null,

            referenceNo:
              referenceNo ||
              null,

            startDatetime,
            endDatetime,

            remarks:
              remarks ||
              null,

            userId:
              req.user?.id ||
              null,
          });
        } else {
          await createEmergencyLeave({
            subjectType,

            subjectId:
              subject.id,

            leaveType:
              leaveType ||
              "Emergency Leave",

            reason:
              reason ||
              null,

            referenceNo:
              referenceNo ||
              null,

            startDatetime,
            endDatetime,

            remarks:
              remarks ||
              null,

            userId:
              req.user?.id ||
              null,
          });
        }

        results.imported +=
          1;
      } catch (
        error
      ) {
        results.failed +=
          1;

        results.errors.push({
          row:
            rowNumber,

          employee_id:
            employeeId ||
            "-",

          course:
            courseName ||
            null,

          platoon:
            platoonNumber ||
            null,

          category:
            categoryName ||
            null,

          branch:
            branchName ||
            null,

          error:
            error.message ||
            "Unknown import error.",
        });
      }
    }

    await logBulkAudit(
      req,
      {
        action:
          "IMPORT",

        module:
          "LEAVE",

        recordId:
          `${subjectType}:${mode}`,

        description:
          `${
            mode ===
            "NORMAL"
              ? "Normal"
              : "Emergency"
          } Leave Excel import completed for ${subjectType}.`,

        summary: {
          file_name:
            req.file?.originalname ||
            null,

          mode,

          subject_type:
            subjectType,

          processed:
            results.processed,

          imported:
            results.imported,

          failed:
            results.failed,

          ambiguous:
            results.ambiguous,

          course_date_not_set:
            results.course_date_not_set,

          no_active_course:
            results.no_active_course,
        },
      }
    );

    return res.json({
      success:
        true,

      message:
        `${results.imported} Leave record(s) imported. ${results.failed} failed.`,

      data:
        results,
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
| EXPORT
|--------------------------------------------------------------------------
*/

async function exportLeavesExcel(
  req,
  res,
  next
) {
  try {
    const subjectType =
      normalizeSubjectType(
        req.query
          .subject_type
      );

    if (!subjectType) {
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
      await getLeaves({
        subjectType,

        search:
          req.query.search ||
          "",

        status:
          req.query.status ||
          null,

        category:
          req.query
            .category ||
          null,

        dateFrom:
          req.query
            .date_from ||
          null,

        dateTo:
          req.query
            .date_to ||
          null,
      });

    const workbook =
      new ExcelJS.Workbook();

    const sheet =
      workbook.addWorksheet(
        subjectType ===
        "TRAINEE"
          ? "Trainee Leave"
          : "Staff Leave"
      );

    sheet.columns = [
      {
        header:
          "Employee ID/Cap No.",

        key:
          "employee_id",

        width:
          20,
      },

      {
        header:
          "Name",

        key:
          "name",

        width:
          25,
      },

      {
        header:
          subjectType ===
          "TRAINEE"
            ? "Course"
            : "Category",

        key:
          "group1",

        width:
          28,
      },

      {
        header:
          subjectType ===
          "TRAINEE"
            ? "Platoon"
            : "Branch",

        key:
          "group2",

        width:
          22,
      },

      {
        header:
          "Leave Category",

        key:
          "leave_category",

        width:
          18,
      },

      {
        header:
          "Leave Type",

        key:
          "leave_type",

        width:
          22,
      },

      {
        header:
          "Start Date & Time",

        key:
          "start_datetime",

        width:
          24,
      },

      {
        header:
          "End Date & Time",

        key:
          "end_datetime",

        width:
          24,
      },

      {
        header:
          "Status",

        key:
          "status",

        width:
          16,
      },

      {
        header:
          "Biometric Exempt",

        key:
          "biometric",

        width:
          18,
      },

      {
        header:
          "Reason",

        key:
          "reason",

        width:
          30,
      },

      {
        header:
          "Reference No.",

        key:
          "reference_no",

        width:
          24,
      },

      {
        header:
          "Remarks",

        key:
          "remarks",

        width:
          30,
      },
    ];

    sheet.getRow(
      1
    ).font = {
      bold:
        true,
    };

    for (
      const row
      of rows
    ) {
      sheet.addRow({
        employee_id:
          row.employee_id,

        name:
          row.subject_name,

        group1:
          subjectType ===
          "TRAINEE"
            ? row.course_name
            : row.category_name,

        group2:
          subjectType ===
          "TRAINEE"
            ? row.platoon_number
            : row.branch_name,

        leave_category:
          row.leave_category,

        leave_type:
          row.leave_type,

        start_datetime:
          row.start_datetime,

        end_datetime:
          row.end_datetime,

        status:
          row.workflow_status,

        biometric:
          Number(
            row.biometric_exempt
          ) === 1
            ? "Yes"
            : "No",

        reason:
          row.reason ||
          "",

        reference_no:
          row.reference_no ||
          "",

        remarks:
          row.remarks ||
          "",
      });
    }

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );

    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${subjectType}_Leave_${new Date()
        .toISOString()
        .substring(
          0,
          10
        )}.xlsx"`
    );

    await workbook.xlsx.write(
      res
    );

    res.end();
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

async function editLeave(
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
            "Invalid Leave record.",
        });
    }

    const existing =
      await getLeaveById(
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
            "Leave record not found.",
        });
    }

    if (
      [
        "REJECTED",
        "CANCELLED",
      ].includes(
        existing.workflow_status
      )
    ) {
      return res
        .status(400)
        .json({
          success:
            false,

          message:
            "Rejected or Cancelled Leave cannot be edited.",
        });
    }

    const leaveType =
      String(
        req.body
          .leave_type ||
          ""
      ).trim();

    if (!leaveType) {
      return res
        .status(400)
        .json({
          success:
            false,

          message:
            "Leave Type is required.",
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

    const periodCheck =
      await validateSubjectLeavePeriod({
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

    const overlap =
      await hasLeaveOverlap({
        subjectType,

        subjectId:
          existing.subject_id,

        startDatetime,
        endDatetime,

        excludeLeaveId:
          id,
      });

    if (overlap) {
      return res
        .status(409)
        .json({
          success:
            false,

          message:
            "Another Approved or Pending Leave overlaps the selected period.",
        });
    }

    const weekendConflictMessage =
      await individualWeekendConflictMessageForLeave({
        subjectType,
        subjectId:
          existing.subject_id,
        startDatetime,
        endDatetime,
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

    if (
      [
        "APPROVED",
        "COMPLETED",
      ].includes(
        existing.workflow_status
      )
    ) {
      await enforceApprovedLeaveCap({
        subjectType,

        subjectId:
          existing.subject_id,

        excludeLeaveId:
          id,
      });
    }

    const leave =
      await updateLeave({
        subjectType,
        id,

        leaveType,

        reason:
          req.body.reason,

        referenceNo:
          req.body
            .reference_no,

        startDatetime,
        endDatetime,

        remarks:
          req.body.remarks,

        updatedBy:
          req.user?.id ||
          null,
      });

    await writeAudit({
      req,

      action:
        "UPDATE",

      recordId:
        `${subjectType}:${id}`,

      description:
        "Leave record updated.",

      oldData:
        existing,

      newData:
        leave,
    });

    return res.json({
      success:
        true,

      message:
        "Leave updated successfully.",

      data:
        leave,
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
| APPROVE
|--------------------------------------------------------------------------
*/

async function approveLeave(
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
            "Invalid Leave record.",
        });
    }

    const existing =
      await getLeaveById(
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
            "Leave record not found.",
        });
    }

    if (
      existing.leave_category !==
        "EMERGENCY" ||
      existing.workflow_status !==
        "PENDING"
    ) {
      return res
        .status(400)
        .json({
          success:
            false,

          message:
            "Only Pending Emergency Leave can be approved.",
        });
    }

    const weekendConflictMessage =
      await individualWeekendConflictMessageForLeave({
        subjectType,
        subjectId:
          existing.subject_id,
        startDatetime:
          existing.start_datetime,
        endDatetime:
          existing.end_datetime,
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

    await enforceApprovedLeaveCap({
      subjectType,

      subjectId:
        existing.subject_id,

      excludeLeaveId:
        id,
    });

    const leave =
      await approveEmergencyLeave({
        subjectType,
        id,

        approvedBy:
          req.user?.id ||
          null,
      });

    if (!leave) {
      return res
        .status(400)
        .json({
          success:
            false,

          message:
            "Emergency Leave could not be approved.",
        });
    }

    await writeAudit({
      req,

      action:
        "APPROVE",

      recordId:
        `${subjectType}:${id}`,

      description:
        "Emergency Leave approved by OSI Branch.",

      oldData:
        existing,

      newData:
        leave,
    });

    return res.json({
      success:
        true,

      message:
        "Emergency Leave approved successfully.",

      data:
        leave,
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
| REJECT
|--------------------------------------------------------------------------
*/

async function rejectLeave(
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
            "Invalid Leave record.",
        });
    }

    const existing =
      await getLeaveById(
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
            "Leave record not found.",
        });
    }

    if (
      existing.leave_category !==
        "EMERGENCY" ||
      existing.workflow_status !==
        "PENDING"
    ) {
      return res
        .status(400)
        .json({
          success:
            false,

          message:
            "Only Pending Emergency Leave can be rejected.",
        });
    }

    const rejectionReason =
      String(
        req.body
          .rejection_reason ||
          ""
      ).trim();

    if (
      !rejectionReason
    ) {
      return res
        .status(400)
        .json({
          success:
            false,

          message:
            "Rejection Reason is required.",
        });
    }

    const leave =
      await rejectEmergencyLeave({
        subjectType,
        id,

        rejectedBy:
          req.user?.id ||
          null,

        rejectionReason,
      });

    await writeAudit({
      req,

      action:
        "REJECT",

      recordId:
        `${subjectType}:${id}`,

      description:
        "Emergency Leave rejected by OSI Branch.",

      oldData:
        existing,

      newData:
        leave,
    });

    return res.json({
      success:
        true,

      message:
        "Emergency Leave rejected.",

      data:
        leave,
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

async function cancelLeaveRecord(
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
            "Invalid Leave record.",
        });
    }

    const existing =
      await getLeaveById(
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
            "Leave record not found.",
        });
    }

    if (
      [
        "CANCELLED",
        "REJECTED",
      ].includes(
        existing.workflow_status
      )
    ) {
      return res
        .status(400)
        .json({
          success:
            false,

          message:
            "Leave is already cancelled or rejected.",
        });
    }

    const cancellationReason =
      String(
        req.body
          .cancellation_reason ||
          ""
      ).trim();

    if (
      !cancellationReason
    ) {
      return res
        .status(400)
        .json({
          success:
            false,

          message:
            "Cancellation Reason is required.",
        });
    }

    const leave =
      await cancelLeave({
        subjectType,
        id,

        cancelledBy:
          req.user?.id ||
          null,

        cancellationReason,
      });

    await writeAudit({
      req,

      action:
        "CANCEL",

      recordId:
        `${subjectType}:${id}`,

      description:
        "Leave record cancelled.",

      oldData:
        existing,

      newData:
        leave,
    });

    return res.json({
      success:
        true,

      message:
        "Leave cancelled successfully.",

      data:
        leave,
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
  listLeaves,

  getLeave,

  addNormalLeave,

  submitEmergencyLeave,

  downloadLeaveTemplate,

  importLeavesExcel,

  exportLeavesExcel,

  editLeave,

  approveLeave,

  rejectLeave,

  cancelLeaveRecord,
};