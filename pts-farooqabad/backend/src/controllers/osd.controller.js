const ExcelJS =
  require("exceljs");

const {
  normalizeSubjectType,

  getSubjectById,

  resolveSubjectForOsd,

  validateSubjectPeriod,

  getRecordById,

  getRecords,

  hasOverlap,

  createRecord,

  updateRecord,

  cancelRecord,
} = require("../models/osd.model");

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

function validDate(
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
    !validDate(
      startDatetime
    ) ||
    !validDate(
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


async function individualWeekendConflictMessageForOsd({
  subjectType,
  subjectId,
  startDatetime,
  endDatetime,
  recordType = "OSD",
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

  const label =
    recordType === "SHORT_PERMISSION"
      ? "Short Permission"
      : "OSD";

  return buildReverseConflictMessage(
    conflict,
    label
  );
}


/*
|--------------------------------------------------------------------------
| EXCEL HELPERS
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
      hour < 12
    ) {
      hour += 12;
    }

    if (
      meridiem ===
        "AM" &&
      hour === 12
    ) {
      hour = 0;
    }

    const parsed =
      new Date(
        year,
        month,
        day,
        hour,
        minute,
        second
      );

    return Number.isNaN(
      parsed.getTime()
    )
      ? null
      : parsed;
  }

  const monthNames = {
    JAN: 0,
    FEB: 1,
    MAR: 2,
    APR: 3,
    MAY: 4,
    JUN: 5,
    JUL: 6,
    AUG: 7,
    SEP: 8,
    OCT: 9,
    NOV: 10,
    DEC: 11,
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
      hour < 12
    ) {
      hour += 12;
    }

    if (
      meridiem ===
        "AM" &&
      hour === 12
    ) {
      hour = 0;
    }

    const parsed =
      new Date(
        year,
        month,
        day,
        hour,
        minute,
        second
      );

    return Number.isNaN(
      parsed.getTime()
    )
      ? null
      : parsed;
  }

  const parsed =
    new Date(
      text
    );

  return Number.isNaN(
    parsed.getTime()
  )
    ? null
    : parsed;
}

function excelDateTimeText(
  value
) {
  if (
    !(value instanceof Date) ||
    Number.isNaN(
      value.getTime()
    )
  ) {
    return null;
  }

  const pad2 =
    (part) =>
      String(part).padStart(
        2,
        "0"
      );

  return [
    value.getFullYear(),
    "-",
    pad2(
      value.getMonth() +
        1
    ),
    "-",
    pad2(
      value.getDate()
    ),
    " ",
    pad2(
      value.getHours()
    ),
    ":",
    pad2(
      value.getMinutes()
    ),
    ":",
    pad2(
      value.getSeconds()
    ),
  ].join("");
}


/*
|--------------------------------------------------------------------------
| DATETIME FOR AUDIT
|--------------------------------------------------------------------------
|
| Audit comparison ke liye date/time ko same format mein normalize karte hain.
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
    if (
      Number.isNaN(
        value.getTime()
      )
    ) {
      return null;
    }

    return value
      .toISOString()
      .replace(
        "T",
        " "
      )
      .substring(
        0,
        19
      );
  }

  const text =
    String(
      value
    ).trim();

  if (!text) {
    return null;
  }

  /*
   * Agar database already
   * YYYY-MM-DD HH:mm:ss return kare,
   * usay unnecessarily timezone convert nahi karna.
   */
  if (
    /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}/.test(
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

  return parsed
    .toISOString()
    .replace(
      "T",
      " "
    )
    .substring(
      0,
      19
    );
}


/*
|--------------------------------------------------------------------------
| AUDIT SNAPSHOT
|--------------------------------------------------------------------------
|
| Old aur New dono mein exact same fields save honge.
|
| Is se Audit Logs mein raw JSON ke bajaye:
|
| Field              Previous Value       New Value
| Duty Place         Farooqabad           Lahore
| Reason             Old Reason           New Reason
| Workflow Status    APPROVED             CANCELLED
|
| show hoga.
|
|--------------------------------------------------------------------------
*/

function buildAuditState(
  record,
  subjectContext =
    null
) {
  if (!record) {
    return null;
  }

  const context =
    subjectContext ||
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

    record_type:
      record.record_type ||
      null,

    reason:
      record.reason ||
      null,

    duty_place:
      record.duty_place ||
      null,

    reference_no:
      record.reference_no ||
      null,

    start_datetime:
      auditDateTime(
        record.start_datetime
      ),

    end_datetime:
      auditDateTime(
        record.end_datetime
      ),

    workflow_status:
      record.workflow_status ||
      null,

    remarks:
      record.remarks ||
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

    cancelled_by:
      record.cancelled_by ||
      null,

    cancelled_at:
      auditDateTime(
        record.cancelled_at
      ),

    cancellation_reason:
      record.cancellation_reason ||
      null,
  };
}


/*
|--------------------------------------------------------------------------
| EMPTY AUDIT STATE
|--------------------------------------------------------------------------
|
| CREATE action par bhi fields individually show hon,
| aik poora JSON object "Record" ke naam se na aaye.
|
|--------------------------------------------------------------------------
*/

function buildEmptyAuditState() {
  return {
    subject_type:
      null,

    subject_id:
      null,

    employee_id:
      null,

    record_type:
      null,

    reason:
      null,

    duty_place:
      null,

    reference_no:
      null,

    start_datetime:
      null,

    end_datetime:
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

    cancelled_by:
      null,

    cancelled_at:
      null,

    cancellation_reason:
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

  subjectContext =
    null,
}) {
  return logRequestAudit(
    req,
    {
      action,

      module:
        "OSD_PERMISSION",

      recordId,

      description,

      oldData:
        oldData
          ? buildAuditState(
              oldData,
              subjectContext
            )
          : buildEmptyAuditState(),

      newData:
        newData
          ? buildAuditState(
              newData,
              subjectContext
            )
          : null,
    }
  );
}


/*
|--------------------------------------------------------------------------
| OSD EXCEL TEMPLATE
|--------------------------------------------------------------------------
*/

async function downloadOsdTemplate(
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
        "OSD Import"
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
          34,
      },
      {
        header:
          "Duty Place",
        key:
          "duty_place",
        width:
          28,
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
          32,
      },
    ];

    const headerRow =
      sheet.getRow(1);

    headerRow.font = {
      bold: true,
    };

    headerRow.alignment = {
      vertical: "middle",
      horizontal: "center",
    };

    sheet.views = [
      {
        state: "frozen",
        ySplit: 1,
      },
    ];

    sheet.addRow({
      employee_id:
        "LC-0313",
      course:
        "Lower Course 20th",
      platoon:
        "10",
      staff_category:
        "",
      staff_branch:
        "",
      start_datetime:
        "08-Oct-2026 08:00 AM",
      end_datetime:
        "08-Oct-2026 06:00 PM",
      reason:
        "Official duty",
      duty_place:
        "Lahore",
      reference_no:
        "PTS/OSD/001",
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
          115,
      },
    ];

    instructionSheet.getRow(
      1
    ).font = {
      bold: true,
    };

    [
      "1. Use this template from the relevant Trainee OSD or Staff OSD page; Subject Type is selected by the portal during import.",
      "2. Employee ID/Cap No., Start Date & Time, End Date & Time and Reason are required.",
      "3. For trainees, Portal resolves the correct trainee record using Employee ID + OSD date + Course Start/End Date.",
      "4. Course and Platoon are optional when the date uniquely identifies one trainee Course assignment.",
      "5. If the same trainee Employee ID covers multiple Courses on the same date, provide Course and/or Platoon context.",
      "6. A trainee Course must have valid Start and End Dates and the OSD period must fall within the Course period.",
      "7. For staff, Staff Category and Staff Branch are optional when Employee ID identifies exactly one Staff record.",
      "8. If a Staff Employee ID maps to multiple records, provide Staff Category and/or Staff Branch context.",
      "9. Imported records are created as APPROVED OSD and remain biometric-exempt for the exact imported period.",
      "10. An import row is rejected if an active OSD or Short Permission already overlaps the same period.",
      "11. Duty Place, Reference No. and Remarks are optional.",
      "12. Delete the example row before importing actual records.",
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
      'attachment; filename="PTS_OSD_Import_Template.xlsx"'
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
| OSD EXCEL IMPORT
|--------------------------------------------------------------------------
*/

async function importOsdExcel(
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
          success: false,
          message:
            "subject_type must be TRAINEE or STAFF.",
        });
    }

    if (
      !req.file?.buffer
    ) {
      return res
        .status(400)
        .json({
          success: false,
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
        "OSD Import"
      ) ||
      workbook.worksheets[0];

    if (!worksheet) {
      return res
        .status(400)
        .json({
          success: false,
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

    const dutyPlaceColumn =
      col([
        "Duty Place",
        "Place of Duty",
      ]);

    const referenceColumn =
      col([
        "Reference No.",
        "Reference No",
        "Order / Reference No.",
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

    if (!reasonColumn) {
      missing.push(
        "Reason"
      );
    }

    if (
      missing.length
    ) {
      return res
        .status(400)
        .json({
          success: false,
          message:
            `Missing required Excel column(s): ${missing.join(
              ", "
            )}`,
        });
    }

    const results = {
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
      not_found:
        0,
      overlap:
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

      const rawStart =
        row.getCell(
          startColumn
        ).value;

      const rawEnd =
        row.getCell(
          endColumn
        ).value;

      const reason =
        excelValue(
          row.getCell(
            reasonColumn
          ).value
        );

      const course =
        courseColumn
          ? excelValue(
              row.getCell(
                courseColumn
              ).value
            )
          : "";

      const platoon =
        platoonColumn
          ? excelValue(
              row.getCell(
                platoonColumn
              ).value
            )
          : "";

      const staffCategory =
        staffCategoryColumn
          ? excelValue(
              row.getCell(
                staffCategoryColumn
              ).value
            )
          : "";

      const staffBranch =
        staffBranchColumn
          ? excelValue(
              row.getCell(
                staffBranchColumn
              ).value
            )
          : "";

      const dutyPlace =
        dutyPlaceColumn
          ? excelValue(
              row.getCell(
                dutyPlaceColumn
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

      const rowHasData =
        Boolean(
          employeeId ||
          excelValue(
            rawStart
          ) ||
          excelValue(
            rawEnd
          ) ||
          reason ||
          dutyPlace ||
          referenceNo ||
          remarks
        );

      if (!rowHasData) {
        continue;
      }

      results.processed += 1;

      const fail =
        (
          message,
          category = null
        ) => {
          results.failed += 1;

          if (
            category &&
            Object.prototype.hasOwnProperty.call(
              results,
              category
            )
          ) {
            results[
              category
            ] += 1;
          }

          results.errors.push({
            row: rowNumber,
            employee_id:
              employeeId ||
              null,
            message,
          });
        };

      if (!employeeId) {
        fail(
          "Employee ID/Cap No. is required."
        );
        continue;
      }

      if (!reason) {
        fail(
          "Reason is required."
        );
        continue;
      }

      const startDate =
        parseExcelDateTime(
          rawStart
        );

      const endDate =
        parseExcelDateTime(
          rawEnd
        );

      if (
        !startDate ||
        !endDate
      ) {
        fail(
          "Valid Start Date & Time and End Date & Time are required."
        );
        continue;
      }

      if (
        endDate <=
        startDate
      ) {
        fail(
          "End Date & Time must be later than Start Date & Time."
        );
        continue;
      }

      const resolved =
        await resolveSubjectForOsd({
          subjectType,
          employeeId,
          referenceDate:
            startDate,
          courseName:
            course ||
            null,
          platoonNumber:
            platoon ||
            null,
          categoryName:
            staffCategory ||
            null,
          branchName:
            staffBranch ||
            null,
        });

      if (
        resolved.status !==
        "MATCHED" ||
        !resolved.subject
      ) {
        const categoryMap = {
          AMBIGUOUS:
            "ambiguous",
          COURSE_DATE_NOT_SET:
            "course_date_not_set",
          NO_ACTIVE_COURSE:
            "no_active_course",
          NOT_FOUND:
            "not_found",
        };

        fail(
          resolved.message ||
          "Employee could not be resolved.",
          categoryMap[
            resolved.status
          ] ||
          null
        );
        continue;
      }

      const subject =
        resolved.subject;

      const startDatetime =
        excelDateTimeText(
          startDate
        );

      const endDatetime =
        excelDateTimeText(
          endDate
        );

      const subjectPeriod =
        await validateSubjectPeriod({
          subjectType,
          subjectId:
            subject.id,
          startDatetime,
          endDatetime,
        });

      if (
        !subjectPeriod.valid
      ) {
        const lowerMessage =
          String(
            subjectPeriod.message ||
            ""
          ).toLowerCase();

        let category =
          null;

        if (
          lowerMessage.includes(
            "start/end date"
          )
        ) {
          category =
            "course_date_not_set";
        } else if (
          lowerMessage.includes(
            "course"
          )
        ) {
          category =
            "no_active_course";
        }

        fail(
          subjectPeriod.message ||
          "OSD period is not valid for this subject.",
          category
        );
        continue;
      }

      const overlap =
        await hasOverlap({
          subjectType,
          subjectId:
            subject.id,
          startDatetime,
          endDatetime,
        });

      if (overlap) {
        fail(
          "An active OSD or Short Permission already overlaps this period.",
          "overlap"
        );
        continue;
      }

      const weekendConflictMessage =
        await individualWeekendConflictMessageForOsd({
          subjectType,
          subjectId:
            subject.id,
          startDatetime,
          endDatetime,
          recordType:
            "OSD",
        });

      if (weekendConflictMessage) {
        fail(
          weekendConflictMessage,
          "long_weekend_overlap"
        );
        continue;
      }

      try {
        await createRecord({
          subjectType,
          subjectId:
            subject.id,
          recordType:
            "OSD",
          reason,
          dutyPlace:
            dutyPlace ||
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

        results.imported += 1;
      } catch (
        rowError
      ) {
        fail(
          rowError.message ||
          "Unknown OSD import error."
        );
      }
    }

    await logBulkAudit(
      req,
      {
        action:
          "IMPORT_OSD",
        module:
          "OSD_PERMISSION",
        description:
          `${results.imported} OSD record(s) imported for ${subjectType}; ${results.failed} failed.`,
        summary: {
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
          not_found:
            results.not_found,
          overlap:
            results.overlap,
        },
      }
    );

    return res.json({
      success:
        true,
      message:
        `${results.imported} OSD record(s) imported. ${results.failed} failed.`,
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

    let recordType =
      null;

    if (
      req.query
        .record_type
    ) {
      recordType =
        String(
          req.query
            .record_type
        )
          .trim()
          .toUpperCase();

      if (
        ![
          "OSD",
          "SHORT_PERMISSION",
        ].includes(
          recordType
        )
      ) {
        return res
          .status(400)
          .json({
            success:
              false,

            message:
              "Invalid record_type.",
          });
      }
    }

    const rows =
      await getRecords({
        subjectType,

        recordType,

        status:
          req.query
            .status ||
          null,

        search:
          req.query
            .search ||
          "",

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
| CREATE COMMON
|--------------------------------------------------------------------------
*/

async function createCommon(
  req,
  res,
  next,
  recordType
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

    const subjectPeriod =
      await validateSubjectPeriod({
        subjectType,
        subjectId,
        startDatetime,
        endDatetime,
      });

    if (
      !subjectPeriod.valid
    ) {
      return res
        .status(400)
        .json({
          success:
            false,

          message:
            subjectPeriod.message,
        });
    }

    const reason =
      cleanText(
        req.body.reason
      );

    if (!reason) {
      return res
        .status(400)
        .json({
          success:
            false,

          message:
            "Reason is required.",
        });
    }

    const overlap =
      await hasOverlap({
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
            "An active OSD or Short Permission already overlaps this period.",
        });
    }

    const weekendConflictMessage =
      await individualWeekendConflictMessageForOsd({
        subjectType,
        subjectId,
        startDatetime,
        endDatetime,
        recordType,
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
      await createRecord({
        subjectType,
        subjectId,

        recordType,

        reason,

        dutyPlace:
          cleanText(
            req.body
              .duty_place
          ),

        referenceNo:
          cleanText(
            req.body
              .reference_no
          ),

        startDatetime,
        endDatetime,

        remarks:
          cleanText(
            req.body
              .remarks
          ),

        userId:
          req.user?.id ||
          null,
      });

    /*
    |--------------------------------------------------------------------------
    | CENTRAL AUDIT
    |--------------------------------------------------------------------------
    */

    await writeAudit({
      req,

      action:
        recordType ===
        "OSD"
          ? "CREATE_OSD"
          : "CREATE_PERMISSION",

      recordId:
        `${subjectType}:${record.id}`,

      description:
        recordType ===
        "OSD"
          ? `OSD created for ${subject.employee_id}.`
          : `Short Period Permission created for ${subject.employee_id}.`,

      oldData:
        null,

      newData: {
        ...record,

        subject_type:
          subjectType,

        employee_id:
          subject.employee_id,
      },

      subjectContext: {
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
          recordType ===
          "OSD"
            ? "OSD record created successfully."
            : "Short Period Permission created successfully.",

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
| CREATE OSD
|--------------------------------------------------------------------------
*/

async function addOsd(
  req,
  res,
  next
) {
  return createCommon(
    req,
    res,
    next,
    "OSD"
  );
}


/*
|--------------------------------------------------------------------------
| CREATE SHORT PERMISSION
|--------------------------------------------------------------------------
*/

async function addShortPermission(
  req,
  res,
  next
) {
  return createCommon(
    req,
    res,
    next,
    "SHORT_PERMISSION"
  );
}


/*
|--------------------------------------------------------------------------
| UPDATE COMMON
|--------------------------------------------------------------------------
*/

async function updateCommon(
  req,
  res,
  next,
  expectedType
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
            "Invalid record.",
        });
    }

    const existing =
      await getRecordById(
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
      existing.record_type !==
      expectedType
    ) {
      return res
        .status(400)
        .json({
          success:
            false,

          message:
            "Record type does not match this endpoint.",
        });
    }

    if (
      existing.workflow_status !==
      "APPROVED"
    ) {
      return res
        .status(400)
        .json({
          success:
            false,

          message:
            "Cancelled or completed record cannot be edited.",
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

    const subjectPeriod =
      await validateSubjectPeriod({
        subjectType,

        subjectId:
          existing.subject_id,

        startDatetime,
        endDatetime,
      });

    if (
      !subjectPeriod.valid
    ) {
      return res
        .status(400)
        .json({
          success:
            false,

          message:
            subjectPeriod.message,
        });
    }

    const reason =
      cleanText(
        req.body.reason
      );

    if (!reason) {
      return res
        .status(400)
        .json({
          success:
            false,

          message:
            "Reason is required.",
        });
    }

    const overlap =
      await hasOverlap({
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
            "Another active OSD or Short Permission overlaps the selected period.",
        });
    }

    const weekendConflictMessage =
      await individualWeekendConflictMessageForOsd({
        subjectType,
        subjectId:
          existing.subject_id,
        startDatetime,
        endDatetime,
        recordType:
          expectedType,
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

    /*
    |--------------------------------------------------------------------------
    | SUBJECT CONTEXT
    |--------------------------------------------------------------------------
    */

    const subject =
      await getSubjectById(
        subjectType,
        existing.subject_id
      );

    const record =
      await updateRecord({
        subjectType,
        id,

        recordType:
          expectedType,

        reason,

        dutyPlace:
          cleanText(
            req.body
              .duty_place
          ),

        referenceNo:
          cleanText(
            req.body
              .reference_no
          ),

        startDatetime,
        endDatetime,

        remarks:
          cleanText(
            req.body
              .remarks
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

    /*
    |--------------------------------------------------------------------------
    | CENTRAL AUDIT
    |--------------------------------------------------------------------------
    */

    await writeAudit({
      req,

      action:
        expectedType ===
        "OSD"
          ? "UPDATE_OSD"
          : "UPDATE_PERMISSION",

      recordId:
        `${subjectType}:${id}`,

      description:
        expectedType ===
        "OSD"
          ? `OSD updated for ${subject?.employee_id || existing.employee_id || "employee"}.`
          : `Short Period Permission updated for ${subject?.employee_id || existing.employee_id || "employee"}.`,

      oldData:
        existing,

      newData:
        record,

      subjectContext:
        subject
          ? {
              ...subject,

              subject_type:
                subjectType,
            }
          : {
              subject_type:
                subjectType,

              id:
                existing.subject_id,

              employee_id:
                existing.employee_id ||
                null,
            },
    });

    return res.json({
      success:
        true,

      message:
        expectedType ===
        "OSD"
          ? "OSD updated successfully."
          : "Short Period Permission updated successfully.",

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
| EDIT OSD
|--------------------------------------------------------------------------
*/

async function editOsd(
  req,
  res,
  next
) {
  return updateCommon(
    req,
    res,
    next,
    "OSD"
  );
}


/*
|--------------------------------------------------------------------------
| EDIT SHORT PERMISSION
|--------------------------------------------------------------------------
*/

async function editShortPermission(
  req,
  res,
  next
) {
  return updateCommon(
    req,
    res,
    next,
    "SHORT_PERMISSION"
  );
}


/*
|--------------------------------------------------------------------------
| CANCEL
|--------------------------------------------------------------------------
*/

async function cancelOsdPermission(
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
            "Invalid record.",
        });
    }

    const existing =
      await getRecordById(
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
      cleanText(
        req.body
          .cancellation_reason
      );

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
            "Only active records can be cancelled.",
        });
    }

    /*
    |--------------------------------------------------------------------------
    | CENTRAL AUDIT
    |--------------------------------------------------------------------------
    */

    await writeAudit({
      req,

      action:
        "CANCEL",

      recordId:
        `${subjectType}:${id}`,

      description:
        existing.record_type ===
        "OSD"
          ? `OSD cancelled for ${subject?.employee_id || existing.employee_id || "employee"}.`
          : `Short Period Permission cancelled for ${subject?.employee_id || existing.employee_id || "employee"}.`,

      oldData:
        existing,

      newData:
        record,

      subjectContext:
        subject
          ? {
              ...subject,

              subject_type:
                subjectType,
            }
          : {
              subject_type:
                subjectType,

              id:
                existing.subject_id,

              employee_id:
                existing.employee_id ||
                null,
            },
    });

    return res.json({
      success:
        true,

      message:
        existing.record_type ===
        "OSD"
          ? "OSD cancelled successfully."
          : "Short Period Permission cancelled successfully.",

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
  downloadOsdTemplate,

  importOsdExcel,

  listRecords,

  addOsd,

  addShortPermission,

  editOsd,

  editShortPermission,

  cancelOsdPermission,
};