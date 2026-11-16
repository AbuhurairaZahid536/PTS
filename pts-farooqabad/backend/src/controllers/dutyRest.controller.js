const ExcelJS =
  require("exceljs");

const {
  pool,
} = require(
  "../config/db"
);

const {
  normalizeSelectionMode,
  listDutyRest,
  getDutyRestById,
  createDutyRest,
  updateDutyRest,
  cancelDutyRest,
} = require(
  "../models/dutyRest.model"
);

const {
  logRequestAudit,
  logBulkAudit,
} = require(
  "../services/audit.service"
);


function validatePeriod(
  start,
  end
) {
  if (
    !start ||
    !end
  ) {
    return "Duty Rest Start and End Date/Time are required.";
  }

  const startDate =
    new Date(start);

  const endDate =
    new Date(end);

  if (
    Number.isNaN(
      startDate.getTime()
    ) ||
    Number.isNaN(
      endDate.getTime()
    )
  ) {
    return "Invalid Duty Rest Date/Time.";
  }

  if (
    endDate <=
    startDate
  ) {
    return "Duty Rest End Date/Time must be later than Start Date/Time.";
  }

  return null;
}


function normalizeIdList(
  value
) {
  return Array.from(
    new Set(
      (
        Array.isArray(value)
          ? value
          : []
      )
        .map(Number)
        .filter(
          (item) =>
            Number.isInteger(item) &&
            item > 0
        )
    )
  );
}


function validateSelection(
  body
) {
  const mode =
    normalizeSelectionMode(
      body.selection_mode
    );

  if (!mode) {
    return {
      error:
        "Select a valid Duty Rest scope.",
    };
  }

  const categoryIds =
    normalizeIdList(
      body.category_ids
    );

  const staffIds =
    normalizeIdList(
      body.staff_ids
    );

  if (
    mode ===
      "CATEGORIES" &&
    !categoryIds.length
  ) {
    return {
      error:
        "Select at least one Staff Category.",
    };
  }

  if (
    mode ===
      "STAFF" &&
    !staffIds.length
  ) {
    return {
      error:
        "Select at least one Staff member.",
    };
  }

  return {
    mode,
    categoryIds,
    staffIds,
  };
}


async function listRecords(
  req,
  res,
  next
) {
  try {
    const records =
      await listDutyRest({
        search:
          req.query.search,

        dateFrom:
          req.query.date_from,

        dateTo:
          req.query.date_to,

        status:
          req.query.status,
      });

    return res.json({
      success:
        true,

      data:
        records,

      total:
        records.length,
    });
  } catch (error) {
    return next(error);
  }
}


async function getRecord(
  req,
  res,
  next
) {
  try {
    const record =
      await getDutyRestById(
        req.params.id
      );

    if (!record) {
      return res
        .status(404)
        .json({
          success:
            false,

          message:
            "Duty Rest record not found.",
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


async function addRecord(
  req,
  res,
  next
) {
  try {
    const selection =
      validateSelection(
        req.body || {}
      );

    if (selection.error) {
      return res
        .status(400)
        .json({
          success:
            false,

          message:
            selection.error,
        });
    }

    const periodError =
      validatePeriod(
        req.body
          ?.start_datetime,

        req.body
          ?.end_datetime
      );

    if (periodError) {
      return res
        .status(400)
        .json({
          success:
            false,

          message:
            periodError,
        });
    }


    const record =
      await createDutyRest({
        title:
          req.body?.title,

        selectionMode:
          selection.mode,

        categoryIds:
          selection.categoryIds,

        staffIds:
          selection.staffIds,

        startDatetime:
          req.body
            .start_datetime,

        endDatetime:
          req.body
            .end_datetime,

        reason:
          req.body?.reason,

        referenceNo:
          req.body
            ?.reference_no,

        remarks:
          req.body?.remarks,

        userId:
          req.user?.id ||
          null,
      });


    await logRequestAudit(
      req,
      {
        action:
          "CREATE",

        module:
          "DUTY_REST",

        recordId:
          record.id,

        description:
          "Staff Duty Rest created.",

        oldData:
          null,

        newData:
          record,
      }
    );


    return res
      .status(201)
      .json({
        success:
          true,

        message:
          "Duty Rest saved successfully.",

        data:
          record,
      });
  } catch (error) {
    if (
      /selected Staff|selected Staff Categor|selection mode/i
        .test(
          String(
            error.message ||
            ""
          )
        )
    ) {
      return res
        .status(400)
        .json({
          success:
            false,

          message:
            error.message,
        });
    }

    return next(error);
  }
}


async function editRecord(
  req,
  res,
  next
) {
  try {
    const existing =
      await getDutyRestById(
        req.params.id
      );

    if (!existing) {
      return res
        .status(404)
        .json({
          success:
            false,

          message:
            "Duty Rest record not found.",
        });
    }


    const selection =
      validateSelection(
        req.body || {}
      );

    if (selection.error) {
      return res
        .status(400)
        .json({
          success:
            false,

          message:
            selection.error,
        });
    }


    const periodError =
      validatePeriod(
        req.body
          ?.start_datetime,

        req.body
          ?.end_datetime
      );

    if (periodError) {
      return res
        .status(400)
        .json({
          success:
            false,

          message:
            periodError,
        });
    }


    const record =
      await updateDutyRest({
        id:
          req.params.id,

        title:
          req.body?.title,

        selectionMode:
          selection.mode,

        categoryIds:
          selection.categoryIds,

        staffIds:
          selection.staffIds,

        startDatetime:
          req.body
            .start_datetime,

        endDatetime:
          req.body
            .end_datetime,

        reason:
          req.body?.reason,

        referenceNo:
          req.body
            ?.reference_no,

        remarks:
          req.body?.remarks,

        userId:
          req.user?.id ||
          null,
      });


    await logRequestAudit(
      req,
      {
        action:
          "UPDATE",

        module:
          "DUTY_REST",

        recordId:
          record.id,

        description:
          "Staff Duty Rest updated.",

        oldData:
          existing,

        newData:
          record,
      }
    );


    return res.json({
      success:
        true,

      message:
        "Duty Rest updated successfully.",

      data:
        record,
    });
  } catch (error) {
    if (
      /Cancelled Duty Rest|selected Staff|selected Staff Categor|selection mode/i
        .test(
          String(
            error.message ||
            ""
          )
        )
    ) {
      return res
        .status(400)
        .json({
          success:
            false,

          message:
            error.message,
        });
    }

    return next(error);
  }
}


async function cancelRecord(
  req,
  res,
  next
) {
  try {
    const existing =
      await getDutyRestById(
        req.params.id
      );

    if (!existing) {
      return res
        .status(404)
        .json({
          success:
            false,

          message:
            "Duty Rest record not found.",
        });
    }


    const record =
      await cancelDutyRest({
        id:
          req.params.id,

        cancellationReason:
          req.body
            ?.cancellation_reason,

        userId:
          req.user?.id ||
          null,
      });


    await logRequestAudit(
      req,
      {
        action:
          "CANCEL",

        module:
          "DUTY_REST",

        recordId:
          record.id,

        description:
          "Staff Duty Rest cancelled.",

        oldData:
          existing,

        newData:
          record,
      }
    );


    return res.json({
      success:
        true,

      message:
        "Duty Rest cancelled successfully.",

      data:
        record,
    });
  } catch (error) {
    return next(error);
  }
}


/*
|--------------------------------------------------------------------------
| DUTY REST EXCEL HELPERS
|--------------------------------------------------------------------------
*/

function excelValue(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }

  if (
    typeof value === "object" &&
    value.text !== undefined
  ) {
    return String(value.text).trim();
  }

  if (
    typeof value === "object" &&
    Array.isArray(value.richText)
  ) {
    return value.richText
      .map((item) => item.text)
      .join("")
      .trim();
  }

  if (
    typeof value === "object" &&
    value.result !== undefined
  ) {
    return excelValue(value.result);
  }

  return String(value).trim();
}


function parseExcelDateTime(value) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime())
      ? null
      : new Date(value.getTime());
  }

  const text = excelValue(value);

  if (!text) {
    return null;
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

  let match = text.match(
    /^(\d{4})-(\d{1,2})-(\d{1,2})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i
  );

  if (match) {
    return buildExcelDateTime({
      year: Number(match[1]),
      month: Number(match[2]) - 1,
      day: Number(match[3]),
      hour: Number(match[4]),
      minute: Number(match[5]),
      second: Number(match[6] || 0),
      meridiem: match[7],
    });
  }

  match = text.match(
    /^(\d{1,2})[-\/]([A-Za-z]{3})[-\/](\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i
  );

  if (match) {
    const month = monthNames[String(match[2]).toUpperCase()];

    if (month === undefined) {
      return null;
    }

    return buildExcelDateTime({
      year: Number(match[3]),
      month,
      day: Number(match[1]),
      hour: Number(match[4]),
      minute: Number(match[5]),
      second: Number(match[6] || 0),
      meridiem: match[7],
    });
  }

  match = text.match(
    /^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i
  );

  if (match) {
    return buildExcelDateTime({
      year: Number(match[3]),
      month: Number(match[2]) - 1,
      day: Number(match[1]),
      hour: Number(match[4]),
      minute: Number(match[5]),
      second: Number(match[6] || 0),
      meridiem: match[7],
    });
  }

  return null;
}


function buildExcelDateTime({
  year,
  month,
  day,
  hour,
  minute,
  second,
  meridiem,
}) {
  let safeHour = Number(hour);
  const safeMeridiem = String(meridiem || "").toUpperCase();

  if (safeMeridiem === "PM" && safeHour < 12) {
    safeHour += 12;
  }

  if (safeMeridiem === "AM" && safeHour === 12) {
    safeHour = 0;
  }

  const date = new Date(
    Number(year),
    Number(month),
    Number(day),
    safeHour,
    Number(minute),
    Number(second || 0)
  );

  return Number.isNaN(date.getTime())
    ? null
    : date;
}


function pad(value) {
  return String(value).padStart(2, "0");
}


function toSqlDateTime(value) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    return null;
  }

  return [
    value.getFullYear(),
    "-",
    pad(value.getMonth() + 1),
    "-",
    pad(value.getDate()),
    " ",
    pad(value.getHours()),
    ":",
    pad(value.getMinutes()),
    ":",
    pad(value.getSeconds()),
  ].join("");
}


function normalizedText(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}


async function resolveStaffForDutyRest({
  employeeCode,
  categoryName = "",
  branchName = "",
}) {
  const code = String(employeeCode || "").trim();

  if (!code) {
    return {
      status: "NOT_FOUND",
      message: "Employee ID/Cap No. is required.",
      staff: null,
    };
  }

  const [rows] = await pool.query(
    `
      SELECT
        s.id,
        s.employee_id,
        s.belt_no,
        s.first_name,
        s.last_name,
        s.category_id,
        s.branch_id,
        sc.category_name,
        sb.branch_name
      FROM staff s
      LEFT JOIN staff_categories sc
        ON sc.id = s.category_id
      LEFT JOIN staff_branches sb
        ON sb.id = s.branch_id
      WHERE s.is_deleted = 0
        AND (
          TRIM(COALESCE(s.employee_id, '')) = :code
          OR TRIM(COALESCE(s.belt_no, '')) = :code
        )
      ORDER BY
        CASE
          WHEN TRIM(COALESCE(s.belt_no, '')) = :code THEN 0
          WHEN TRIM(COALESCE(s.employee_id, '')) = :code THEN 1
          ELSE 2
        END,
        s.id
    `,
    { code }
  );

  if (!rows.length) {
    return {
      status: "NOT_FOUND",
      message: `No active Staff record found for ${code}.`,
      staff: null,
    };
  }

  let matches = rows;
  const wantedCategory = normalizedText(categoryName);
  const wantedBranch = normalizedText(branchName);

  if (wantedCategory) {
    matches = matches.filter(
      (row) => normalizedText(row.category_name) === wantedCategory
    );
  }

  if (wantedBranch) {
    matches = matches.filter(
      (row) => normalizedText(row.branch_name) === wantedBranch
    );
  }

  if (matches.length === 1) {
    return {
      status: "FOUND",
      message: null,
      staff: matches[0],
    };
  }

  if (!matches.length) {
    return {
      status: "NOT_FOUND",
      message: `Staff ${code} does not match the supplied Category/Branch.`,
      staff: null,
    };
  }

  return {
    status: "AMBIGUOUS",
    message:
      `More than one Staff record matches ${code}. ` +
      "Provide Staff Category and/or Staff Branch in the Excel row.",
    staff: null,
  };
}


async function hasDutyRestOverlap({
  staffId,
  categoryId,
  startDatetime,
  endDatetime,
}) {
  const [rows] = await pool.query(
    `
      SELECT dr.id
      FROM staff_duty_rest dr
      WHERE dr.record_status IN ('ACTIVE', 'COMPLETED')
        AND dr.start_datetime < :endDatetime
        AND dr.end_datetime > :startDatetime
        AND (
          dr.selection_mode = 'ALL'
          OR (
            dr.selection_mode = 'CATEGORIES'
            AND EXISTS (
              SELECT 1
              FROM staff_duty_rest_categories drc
              WHERE drc.duty_rest_id = dr.id
                AND drc.category_id = :categoryId
            )
          )
          OR (
            dr.selection_mode = 'STAFF'
            AND EXISTS (
              SELECT 1
              FROM staff_duty_rest_members drm
              WHERE drm.duty_rest_id = dr.id
                AND drm.staff_id = :staffId
            )
          )
        )
      LIMIT 1
    `,
    {
      staffId: Number(staffId),
      categoryId: Number(categoryId) || 0,
      startDatetime,
      endDatetime,
    }
  );

  return rows.length > 0;
}


/*
|--------------------------------------------------------------------------
| DUTY REST TEMPLATE
|--------------------------------------------------------------------------
*/

async function downloadDutyRestTemplate(
  req,
  res,
  next
) {
  try {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "PTS Farooqabad";

    const sheet = workbook.addWorksheet("Duty Rest Import");

    sheet.columns = [
      {
        header: "Employee ID/Cap No.",
        key: "employee_id",
        width: 22,
      },
      {
        header: "Staff Category",
        key: "staff_category",
        width: 24,
      },
      {
        header: "Staff Branch",
        key: "staff_branch",
        width: 24,
      },
      {
        header: "Start Date & Time",
        key: "start_datetime",
        width: 24,
      },
      {
        header: "End Date & Time",
        key: "end_datetime",
        width: 24,
      },
      {
        header: "Title",
        key: "title",
        width: 26,
      },
      {
        header: "Reason",
        key: "reason",
        width: 30,
      },
      {
        header: "Reference No.",
        key: "reference_no",
        width: 24,
      },
      {
        header: "Remarks",
        key: "remarks",
        width: 30,
      },
    ];

    sheet.getRow(1).font = {
      bold: true,
    };

    sheet.views = [
      {
        state: "frozen",
        ySplit: 1,
      },
    ];

    sheet.addRow({
      employee_id: "12345",
      staff_category: "",
      staff_branch: "",
      start_datetime: "08-Oct-2026 08:00 AM",
      end_datetime: "08-Oct-2026 06:00 PM",
      title: "Duty Rest",
      reason: "Official Duty Rest",
      reference_no: "PTS/DR/001",
      remarks: "",
    });

    const instructions = workbook.addWorksheet("Instructions");

    instructions.columns = [
      {
        header: "Instructions",
        key: "instruction",
        width: 110,
      },
    ];

    instructions.getRow(1).font = {
      bold: true,
    };

    [
      "1. Duty Rest import is for STAFF only.",
      "2. Employee ID/Cap No., Start Date & Time and End Date & Time are required.",
      "3. Exact Cap No./Belt No. match is preferred; Employee ID is accepted as fallback.",
      "4. Staff Category and Staff Branch are optional when Employee ID/Cap No. identifies one Staff record.",
      "5. If the same Employee ID/Cap No. matches multiple active Staff records, provide Category and/or Branch.",
      "6. Each Excel row creates an individual STAFF-scope Duty Rest record for that employee.",
      "7. Rows overlapping an existing active/completed Duty Rest applicable to the same employee are rejected.",
      "8. Delete the example row before importing actual records.",
    ].forEach((instruction) => {
      instructions.addRow({ instruction });
    });

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );

    res.setHeader(
      "Content-Disposition",
      'attachment; filename="PTS_Duty_Rest_Import_Template.xlsx"'
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    return next(error);
  }
}


/*
|--------------------------------------------------------------------------
| DUTY REST IMPORT
|--------------------------------------------------------------------------
*/

async function importDutyRestExcel(
  req,
  res,
  next
) {
  try {
    if (!req.file?.buffer) {
      return res.status(400).json({
        success: false,
        message: "Excel file is required.",
      });
    }

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(req.file.buffer);

    const worksheet =
      workbook.getWorksheet("Duty Rest Import") ||
      workbook.worksheets[0];

    if (!worksheet) {
      return res.status(400).json({
        success: false,
        message: "Excel workbook contains no worksheet.",
      });
    }

    const headerMap = {};

    worksheet.getRow(1).eachCell((cell, columnNumber) => {
      const heading = excelValue(cell.value)
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();

      headerMap[heading] = columnNumber;
    });

    function col(names) {
      for (const name of names) {
        const index = headerMap[String(name).toLowerCase()];
        if (index) {
          return index;
        }
      }
      return null;
    }

    const employeeColumn = col([
      "Employee ID/Cap No.",
      "Employee ID / Cap No.",
      "Employee ID",
      "Cap No.",
      "Cap No",
      "Belt No.",
      "Belt No",
    ]);

    const categoryColumn = col([
      "Staff Category",
      "Category",
    ]);

    const branchColumn = col([
      "Staff Branch",
      "Branch",
    ]);

    const startColumn = col([
      "Start Date & Time",
      "Start Date Time",
      "Start Datetime",
      "Start",
    ]);

    const endColumn = col([
      "End Date & Time",
      "End Date Time",
      "End Datetime",
      "End",
    ]);

    const titleColumn = col(["Title"]);
    const reasonColumn = col(["Reason"]);
    const referenceColumn = col([
      "Reference No.",
      "Reference No",
      "Order / Reference No.",
      "Order / Reference No",
    ]);
    const remarksColumn = col(["Remarks"]);

    if (!employeeColumn || !startColumn || !endColumn) {
      return res.status(400).json({
        success: false,
        message:
          "Template must contain Employee ID/Cap No., Start Date & Time and End Date & Time columns.",
      });
    }

    const result = {
      processed: 0,
      imported: 0,
      failed: 0,
      overlap: 0,
      not_found: 0,
      ambiguous: 0,
      errors: [],
    };

    for (
      let rowNumber = 2;
      rowNumber <= worksheet.rowCount;
      rowNumber += 1
    ) {
      const row = worksheet.getRow(rowNumber);

      const employeeCode = excelValue(
        row.getCell(employeeColumn).value
      );

      const startRaw = row.getCell(startColumn).value;
      const endRaw = row.getCell(endColumn).value;

      const categoryName = categoryColumn
        ? excelValue(row.getCell(categoryColumn).value)
        : "";

      const branchName = branchColumn
        ? excelValue(row.getCell(branchColumn).value)
        : "";

      const title = titleColumn
        ? excelValue(row.getCell(titleColumn).value)
        : "";

      const reason = reasonColumn
        ? excelValue(row.getCell(reasonColumn).value)
        : "";

      const referenceNo = referenceColumn
        ? excelValue(row.getCell(referenceColumn).value)
        : "";

      const remarks = remarksColumn
        ? excelValue(row.getCell(remarksColumn).value)
        : "";

      const rowHasAnyData = [
        employeeCode,
        excelValue(startRaw),
        excelValue(endRaw),
        categoryName,
        branchName,
        title,
        reason,
        referenceNo,
        remarks,
      ].some(Boolean);

      if (!rowHasAnyData) {
        continue;
      }

      result.processed += 1;

      try {
        if (!employeeCode) {
          throw new Error("Employee ID/Cap No. is required.");
        }

        const startDate = parseExcelDateTime(startRaw);
        const endDate = parseExcelDateTime(endRaw);

        if (!startDate || !endDate) {
          throw new Error(
            "Valid Start Date & Time and End Date & Time are required."
          );
        }

        if (endDate <= startDate) {
          throw new Error(
            "Duty Rest End Date/Time must be later than Start Date/Time."
          );
        }

        const resolved = await resolveStaffForDutyRest({
          employeeCode,
          categoryName,
          branchName,
        });

        if (resolved.status !== "FOUND") {
          if (resolved.status === "NOT_FOUND") {
            result.not_found += 1;
          }

          if (resolved.status === "AMBIGUOUS") {
            result.ambiguous += 1;
          }

          throw new Error(resolved.message);
        }

        const staff = resolved.staff;
        const startDatetime = toSqlDateTime(startDate);
        const endDatetime = toSqlDateTime(endDate);

        const overlap = await hasDutyRestOverlap({
          staffId: staff.id,
          categoryId: staff.category_id,
          startDatetime,
          endDatetime,
        });

        if (overlap) {
          result.overlap += 1;
          throw new Error(
            "An overlapping Duty Rest already applies to this Staff member."
          );
        }

        const record = await createDutyRest({
          title: title || "Duty Rest",
          selectionMode: "STAFF",
          categoryIds: [],
          staffIds: [staff.id],
          startDatetime,
          endDatetime,
          reason: reason || null,
          referenceNo: referenceNo || null,
          remarks: remarks || null,
          userId: req.user?.id || null,
        });

        result.imported += 1;

        await logRequestAudit(req, {
          action: "IMPORT_CREATE",
          module: "DUTY_REST",
          recordId: record.id,
          description:
            `Duty Rest imported for ${staff.employee_id || staff.belt_no}.`,
          oldData: null,
          newData: record,
        });
      } catch (error) {
        result.failed += 1;

        result.errors.push({
          row: rowNumber,
          employee_id: employeeCode || null,
          message: String(error.message || "Import failed."),
        });
      }
    }

    await logBulkAudit(req, {
      action: "IMPORT",
      module: "DUTY_REST",
      description: "Staff Duty Rest Excel import completed.",
      summary: {
        processed: result.processed,
        imported: result.imported,
        failed: result.failed,
        overlap: result.overlap,
        not_found: result.not_found,
        ambiguous: result.ambiguous,
      },
    });

    return res.json({
      success: true,
      message:
        `Duty Rest import completed. ${result.imported} imported, ` +
        `${result.failed} failed.`,
      data: result,
    });
  } catch (error) {
    return next(error);
  }
}


module.exports = {
  listRecords,
  getRecord,
  addRecord,
  editRecord,
  cancelRecord,
  downloadDutyRestTemplate,
  importDutyRestExcel,
};
