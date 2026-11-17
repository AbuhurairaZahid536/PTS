const ExcelJS =
  require("exceljs");

const {
  getAttendanceReportFilters,

  getAttendanceReport,

  getAttendanceReportExport,

  getLongWeekendReport,
  getLongWeekendReportExport,

  getContinuousAbsenceReport,
  getContinuousAbsenceReportExport,

  getCustomShiftReportFilters,
  getCustomShiftReport,
  getCustomShiftReportExport,
} = require(
  "../models/report.model"
);

/*
|--------------------------------------------------------------------------
| HELPERS
|--------------------------------------------------------------------------
*/

function normalizeUpper(
  value
) {
  if (
    value ===
      null ||
    value ===
      undefined
  ) {
    return "";
  }

  return String(
    value
  )
    .trim()
    .toUpperCase();
}

function normalizeNullableId(
  value
) {
  if (
    value ===
      null ||
    value ===
      undefined ||
    value ===
      ""
  ) {
    return null;
  }

  const parsed =
    Number(
      value
    );

  if (
    !Number.isInteger(
      parsed
    ) ||
    parsed <=
      0
  ) {
    throw new Error(
      "Invalid report filter ID."
    );
  }

  return parsed;
}

function normalizePositiveInteger(
  value,
  fallback,
  maximum = null
) {
  const parsed =
    Number(
      value
    );

  let result =
    Number.isFinite(
      parsed
    )
      ? Math.floor(
          parsed
        )
      : fallback;

  if (
    result <
    1
  ) {
    result =
      fallback;
  }

  if (
    maximum &&
    result >
      maximum
  ) {
    result =
      maximum;
  }

  return result;
}

function isValidDateString(
  value
) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(
      String(
        value ||
          ""
      )
    )
  ) {
    return false;
  }

  const parsed =
    new Date(
      `${value}T00:00:00`
    );

  return !Number.isNaN(
    parsed.getTime()
  );
}

function excelDate(
  value
) {
  if (!value) {
    return "-";
  }

  const parsed =
    new Date(
      value
    );

  if (
    Number.isNaN(
      parsed.getTime()
    )
  ) {
    return String(
      value
    );
  }

  return parsed.toLocaleTimeString(
    "en-US",
    {
      hour:
        "2-digit",

      minute:
        "2-digit",

      second:
        "2-digit",

      hour12:
        true,
    }
  );
}

/*
|--------------------------------------------------------------------------
| NORMALIZE REPORT PARAMS
|--------------------------------------------------------------------------
*/

function normalizeReportParams(
  query
) {
  const subjectType =
    normalizeUpper(
      query.subject_type
    );

  const sessionType =
    normalizeUpper(
      query.session_type
    );

  /*
  |--------------------------------------------------------------------------
  | SUBJECT TYPE
  |--------------------------------------------------------------------------
  */

  if (
    ![
      "TRAINEE",
      "STAFF",
    ].includes(
      subjectType
    )
  ) {
    throw new Error(
      "subject_type must be TRAINEE or STAFF."
    );
  }

  /*
  |--------------------------------------------------------------------------
  | SESSION TYPE
  |--------------------------------------------------------------------------
  */

  if (
    ![
      "MORNING",
      "EVENING",
    ].includes(
      sessionType
    )
  ) {
    throw new Error(
      "session_type must be MORNING or EVENING."
    );
  }

  /*
  |--------------------------------------------------------------------------
  | DATE
  |--------------------------------------------------------------------------
  */

  const attendanceDate =
    String(
      query.attendance_date ||
        ""
    ).trim();

  if (
    !attendanceDate
  ) {
    throw new Error(
      "attendance_date is required."
    );
  }

  if (
    !isValidDateString(
      attendanceDate
    )
  ) {
    throw new Error(
      "attendance_date must be in YYYY-MM-DD format."
    );
  }

  /*
  |--------------------------------------------------------------------------
  | ATTENDANCE STATUS
  |--------------------------------------------------------------------------
  */

  const attendanceStatus =
    query.attendance_status
      ? normalizeUpper(
          query.attendance_status
        )
      : null;

  if (
    attendanceStatus &&
    ![
      "PRESENT",
      "ABSENT",
      "EXEMPT",
      "NO_TIMETABLE",
    ].includes(
      attendanceStatus
    )
  ) {
    throw new Error(
      "Invalid attendance_status."
    );
  }

  /*
  |--------------------------------------------------------------------------
  | TIMING STATUS
  |--------------------------------------------------------------------------
  */

  const timingStatus =
    query.timing_status
      ? normalizeUpper(
          query.timing_status
        )
      : null;

  if (
    timingStatus &&
    ![
      "EARLY",
      "IN_TIME",
      "LATE",
      "NO_PUNCH",
      "EXEMPT",
      "NO_TIMETABLE",
    ].includes(
      timingStatus
    )
  ) {
    throw new Error(
      "Invalid timing_status."
    );
  }

  /*
  |--------------------------------------------------------------------------
  | IDS
  |--------------------------------------------------------------------------
  */

  const courseId =
    normalizeNullableId(
      query.course_id
    );

  const platoonId =
    normalizeNullableId(
      query.platoon_id
    );

  const categoryId =
    normalizeNullableId(
      query.category_id
    );

  const branchId =
    normalizeNullableId(
      query.branch_id
    );

  /*
  |--------------------------------------------------------------------------
  | REMOVE INCOMPATIBLE FILTERS
  |--------------------------------------------------------------------------
  */

  return {
    attendanceDate,

    subjectType,

    sessionType,

    search:
      String(
        query.search ||
          ""
      )
        .trim()
        .slice(
          0,
          150
        ),

    attendanceStatus,

    timingStatus,

    courseId:
      subjectType ===
      "TRAINEE"
        ? courseId
        : null,

    platoonId:
      subjectType ===
      "TRAINEE"
        ? platoonId
        : null,

    categoryId:
      subjectType ===
      "STAFF"
        ? categoryId
        : null,

    branchId:
      subjectType ===
      "STAFF"
        ? branchId
        : null,

    page:
      normalizePositiveInteger(
        query.page,
        1
      ),

    pageSize:
      normalizePositiveInteger(
        query.page_size,
        50,
        500
      ),
  };
}

/*
|--------------------------------------------------------------------------
| FILTERS
|--------------------------------------------------------------------------
*/

async function attendanceFilters(
  req,
  res,
  next
) {
  try {
    const result =
      await getAttendanceReportFilters();

    return res.json({
      success:
        true,

      data:
        result,
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
| REPORT DATA
|--------------------------------------------------------------------------
*/

async function attendanceReport(
  req,
  res,
  next
) {
  try {
    const params =
      normalizeReportParams(
        req.query
      );

    const result =
      await getAttendanceReport(
        params
      );

    return res.json({
      success:
        true,

      data:
        result,
    });
  } catch (
    error
  ) {
    if (
      error.message &&
      (
        error.message.includes(
          "must be"
        ) ||
        error.message.includes(
          "required"
        ) ||
        error.message.includes(
          "Invalid"
        )
      )
    ) {
      return res
        .status(
          400
        )
        .json({
          success:
            false,

          message:
            error.message,
        });
    }

    return next(
      error
    );
  }
}

/*
|--------------------------------------------------------------------------
| EXCEL EXPORT
|--------------------------------------------------------------------------
*/

async function exportAttendanceReport(
  req,
  res,
  next
) {
  try {
    const params =
      normalizeReportParams(
        req.query
      );

    const rows =
      await getAttendanceReportExport(
        params
      );

    const workbook =
      new ExcelJS.Workbook();

    workbook.creator =
      "PTS Farooqabad";

    workbook.created =
      new Date();

    workbook.modified =
      new Date();

    const worksheet =
      workbook.addWorksheet(
        "Attendance Report",
        {
          properties: {
            defaultRowHeight:
              18,
          },

          pageSetup: {
            paperSize:
              9,

            orientation:
              "landscape",

            fitToPage:
              true,

            fitToWidth:
              1,

            fitToHeight:
              0,

            margins: {
              left:
                0.25,

              right:
                0.25,

              top:
                0.5,

              bottom:
                0.5,

              header:
                0.2,

              footer:
                0.2,
            },
          },
        }
      );

    /*
    |--------------------------------------------------------------------------
    | TITLE
    |--------------------------------------------------------------------------
    */

    const reportTitle =
      `${
        params.subjectType ===
        "TRAINEE"
          ? "Trainee"
          : "PTS Staff"
      } ${
        params.sessionType ===
        "MORNING"
          ? "Morning"
          : "Evening"
      } Attendance Report`;

    worksheet.mergeCells(
      "A1:Q1"
    );

    worksheet.getCell(
      "A1"
    ).value =
      "POLICE TRAINING SCHOOL FAROOQABAD";

    worksheet.getCell(
      "A1"
    ).font = {
      bold:
        true,

      size:
        16,
    };

    worksheet.getCell(
      "A1"
    ).alignment = {
      horizontal:
        "center",

      vertical:
        "middle",
    };

    worksheet.getRow(
      1
    ).height =
      25;

    worksheet.mergeCells(
      "A2:Q2"
    );

    worksheet.getCell(
      "A2"
    ).value =
      reportTitle;

    worksheet.getCell(
      "A2"
    ).font = {
      bold:
        true,

      size:
        13,
    };

    worksheet.getCell(
      "A2"
    ).alignment = {
      horizontal:
        "center",

      vertical:
        "middle",
    };

    worksheet.mergeCells(
      "A3:Q3"
    );

    worksheet.getCell(
      "A3"
    ).value =
      `Attendance Date: ${params.attendanceDate}     |     Total Records: ${rows.length}`;

    worksheet.getCell(
      "A3"
    ).alignment = {
      horizontal:
        "center",

      vertical:
        "middle",
    };

    /*
    |--------------------------------------------------------------------------
    | HEADINGS
    |--------------------------------------------------------------------------
    */

    const headerRow =
      worksheet.getRow(
        5
      );

    headerRow.values = [
      "Sr. No.",
      "Employee ID/Cap No.",

      "Name",

      params.subjectType ===
      "TRAINEE"
        ? "Course"
        : "Category",

      params.subjectType ===
      "TRAINEE"
        ? "Platoon"
        : "Branch",

      "Punch Time",

      "Punch State",

      "Attendance",

      "Timing",

      "Exemption",

      "Manual Absence", "Reason", "OSD Starts", "OSD Ends", "Absent From", "Absent Until / Return", "Absent Duration (seconds)",
    ];

    headerRow.font = {
      bold:
        true,

      color: {
        argb:
          "FFFFFFFF",
      },
    };

    headerRow.fill = {
      type:
        "pattern",

      pattern:
        "solid",

      fgColor: {
        argb:
          "FF0B2545",
      },
    };

    headerRow.alignment = {
      horizontal:
        "center",

      vertical:
        "middle",

      wrapText:
        true,
    };

    headerRow.height =
      28;

    /*
    |--------------------------------------------------------------------------
    | WIDTHS
    |--------------------------------------------------------------------------
    */

    const widths = [
      8,
      20,
      30,
      30,
      20,
      18,
      18,
      16,
      22,
      34,
      20,
    ];

    widths.push(32,24,24,24,24,24);
    widths.forEach(
      (
        width,
        index
      ) => {
        worksheet.getColumn(
          index +
            1
        ).width =
          width;
      }
    );

    /*
    |--------------------------------------------------------------------------
    | DATA
    |--------------------------------------------------------------------------
    */

    rows.forEach(
      (
        row, index
      ) => {
        let timing =
          row.timing_status ||
          "-";

        if (
          [
            "EARLY",
            "LATE",
          ].includes(
            row.timing_status
          ) &&
          row.timing_minutes !==
            null &&
          row.timing_minutes !==
            undefined
        ) {
          timing =
            `${
              row.timing_status ===
              "LATE"
                ? "LATE BY"
                : "EARLY BY"
            } ${row.timing_minutes} min`;
        }

        let exemption =
          "-";

        if (
          row.exemption_type
        ) {
          exemption =
            row.exemption_description
              ? `${row.exemption_type} - ${row.exemption_description}`
              : row.exemption_type;
        }

        const groupName =
          params.subjectType ===
          "TRAINEE"
            ? row.course_name ||
              "-"
            : row.category_name ||
              "-";

        const subgroupName =
          params.subjectType ===
          "TRAINEE"
            ? row.platoon_number !==
                null &&
              row.platoon_number !==
                undefined
              ? `Platoon ${row.platoon_number}`
              : "-"
            : row.branch_name ||
              "-";

        const dataRow =
          worksheet.addRow([
            index + 1,
            row.employee_id ||
              "-",

            row.subject_name ||
              "-",

            groupName,

            subgroupName,

            excelDate(
              row.selected_punch
            ),

            row.punch_state ||
              "-",

            row.attendance_status ||
              "-",

            timing,

            exemption,

            Number(
              row.has_manual_absence
            ) ===
            1
              ? "Recorded"
              : "-",
            row.repatriate_reason || row.osd_reason || row.exemption_description || "-",
            excelDate(row.osd_start_datetime),excelDate(row.osd_end_datetime),excelDate(row.absence_start),
            row.absence_end ? excelDate(row.absence_end) : row.absence_start ? "Ongoing at report time" : "-",
            row.absence_duration_seconds == null ? "-" : Number(row.absence_duration_seconds),
          ]);

        dataRow.alignment = {
          vertical:
            "middle",

          wrapText:
            true,
        };
      }
    );

    /*
    |--------------------------------------------------------------------------
    | BORDERS
    |--------------------------------------------------------------------------
    */

    for (
      let rowNumber = 5;
      rowNumber <=
      worksheet.rowCount;
      rowNumber += 1
    ) {
      const row =
        worksheet.getRow(
          rowNumber
        );

      row.eachCell(
        {
          includeEmpty:
            true,
        },
        (
          cell
        ) => {
          cell.border = {
            top: {
              style:
                "thin",

              color: {
                argb:
                  "FFD1D5DB",
              },
            },

            left: {
              style:
                "thin",

              color: {
                argb:
                  "FFD1D5DB",
              },
            },

            bottom: {
              style:
                "thin",

              color: {
                argb:
                  "FFD1D5DB",
              },
            },

            right: {
              style:
                "thin",

              color: {
                argb:
                  "FFD1D5DB",
              },
            },
          };
        }
      );
    }

    /*
    |--------------------------------------------------------------------------
    | FREEZE / FILTER
    |--------------------------------------------------------------------------
    */

    worksheet.views = [
      {
        state:
          "frozen",

        ySplit:
          5,
      },
    ];

    worksheet.autoFilter = {
      from:
        "A5",

      to:
        "Q5",
    };

    /*
    |--------------------------------------------------------------------------
    | FOOTER
    |--------------------------------------------------------------------------
    */

    worksheet.headerFooter.oddFooter =
      `&LPTS Farooqabad Attendance Report&CPage &P of &N&RGenerated ${new Date().toLocaleString(
        "en-GB"
      )}`;

    /*
    |--------------------------------------------------------------------------
    | FILE
    |--------------------------------------------------------------------------
    */

    const filename =
      `${params.subjectType}_${params.sessionType}_Attendance_${params.attendanceDate}.xlsx`;

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );

    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${filename}"`
    );

    await workbook.xlsx.write(
      res
    );

    return res.end();
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
| LONG WEEKEND PARAMS
|--------------------------------------------------------------------------
*/

function normalizeLongWeekendReportParams(
  query
) {
  const attendanceDate =
    String(
      query.attendance_date ||
      ""
    ).trim();

  if (
    !attendanceDate
  ) {
    throw new Error(
      "attendance_date is required."
    );
  }

  if (
    !isValidDateString(
      attendanceDate
    )
  ) {
    throw new Error(
      "attendance_date must be in YYYY-MM-DD format."
    );
  }

  const attendanceStatus =
    query.attendance_status
      ? normalizeUpper(
          query.attendance_status
        )
      : null;

  if (
    attendanceStatus &&
    ![
      "PRESENT",
      "ABSENT",
      "DETAINED",
    ].includes(
      attendanceStatus
    )
  ) {
    throw new Error(
      "Invalid attendance_status."
    );
  }

  return {
    attendanceDate,

    search:
      String(
        query.search ||
        ""
      )
        .trim()
        .slice(
          0,
          150
        ),

    attendanceStatus,

    courseId:
      normalizeNullableId(
        query.course_id
      ),

    platoonId:
      normalizeNullableId(
        query.platoon_id
      ),

    page:
      normalizePositiveInteger(
        query.page,
        1
      ),

    pageSize:
      normalizePositiveInteger(
        query.page_size,
        50,
        500
      ),
  };
}


/*
|--------------------------------------------------------------------------
| LONG WEEKEND REPORT DATA
|--------------------------------------------------------------------------
*/

async function longWeekendReport(
  req,
  res,
  next
) {
  try {
    const params =
      normalizeLongWeekendReportParams(
        req.query
      );

    const result =
      await getLongWeekendReport(
        params
      );

    return res.json({
      success:
        true,

      data:
        result,
    });
  } catch (
    error
  ) {
    if (
      error.message &&
      (
        error.message.includes(
          "must be"
        ) ||
        error.message.includes(
          "required"
        ) ||
        error.message.includes(
          "Invalid"
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

    return next(
      error
    );
  }
}


/*
|--------------------------------------------------------------------------
| LONG WEEKEND EXCEL EXPORT
|--------------------------------------------------------------------------
*/

async function exportLongWeekendReport(
  req,
  res,
  next
) {
  try {
    const params =
      normalizeLongWeekendReportParams(
        req.query
      );

    const rows =
      await getLongWeekendReportExport(
        params
      );

    const workbook =
      new ExcelJS.Workbook();

    workbook.creator =
      "PTS Farooqabad";

    workbook.created =
      new Date();

    const worksheet =
      workbook.addWorksheet(
        "Long Weekend",
        {
          pageSetup: {
            paperSize:
              9,

            orientation:
              "landscape",

            fitToPage:
              true,

            fitToWidth:
              1,

            fitToHeight:
              0,
          },
        }
      );

    worksheet.mergeCells(
      "A1:J1"
    );

    worksheet.getCell(
      "A1"
    ).value =
      "POLICE TRAINING SCHOOL FAROOQABAD";

    worksheet.getCell(
      "A1"
    ).font = {
      bold:
        true,

      size:
        16,
    };

    worksheet.getCell(
      "A1"
    ).alignment = {
      horizontal:
        "center",
    };

    worksheet.mergeCells(
      "A2:J2"
    );

    worksheet.getCell(
      "A2"
    ).value =
      "Long Weekend / Departure Attendance Report";

    worksheet.getCell(
      "A2"
    ).font = {
      bold:
        true,

      size:
        13,
    };

    worksheet.getCell(
      "A2"
    ).alignment = {
      horizontal:
        "center",
    };

    worksheet.mergeCells(
      "A3:J3"
    );

    worksheet.getCell(
      "A3"
    ).value =
      `Departure Date: ${params.attendanceDate} | Total Records: ${rows.length}`;

    worksheet.getCell(
      "A3"
    ).alignment = {
      horizontal:
        "center",
    };

    const headerRow =
      worksheet.getRow(
        5
      );

    headerRow.values = [
      "Sr. No.",
      "Cap No.",
      "Name",
      "Course",
      "Platoon",
      "Weekend",
      "Departure Window",
      "Punch Time",
      "Status",
      "Remarks",
    ];

    headerRow.font = {
      bold:
        true,
    };

    rows.forEach(
      (
        row, index
      ) => {
        worksheet.addRow([
            index + 1,
          row.employee_id ||
          "-",

          row.subject_name ||
          "-",

          row.course_name ||
          "-",

          row.platoon_number !==
            null &&
          row.platoon_number !==
            undefined
            ? `Platoon ${row.platoon_number}`
            : "-",

          row.weekend_name ||
          "-",

          `${
            row.window_start
              ? new Date(
                  row.window_start
                ).toLocaleString(
                  "en-GB"
                )
              : "-"
          } to ${
            row.window_end
              ? new Date(
                  row.window_end
                ).toLocaleString(
                  "en-GB"
                )
              : "-"
          }`,

          row.punch_time
            ? excelDate(
                row.punch_time
              )
            : "-",

          row.attendance_status ||
          "-",

          row.attendance_status ===
            "DETAINED"
            ? "Weekend Detain"
            : "",
        ]);
      }
    );

    worksheet.columns = [
      { width: 8 },
      {
        width:
          18,
      },
      {
        width:
          28,
      },
      {
        width:
          28,
      },
      {
        width:
          18,
      },
      {
        width:
          28,
      },
      {
        width:
          44,
      },
      {
        width:
          20,
      },
      {
        width:
          18,
      },
      {
        width:
          24,
      },
    ];

    const filename =
      `Trainee_Long_Weekend_${params.attendanceDate}.xlsx`;

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );

    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${filename}"`
    );

    await workbook.xlsx.write(
      res
    );

    return res.end();
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
| CONTINUOUS ABSENCE REPORT HELPERS
|--------------------------------------------------------------------------
*/

function continuousAbsenceDateTime(
  value
) {
  if (!value) {
    return null;
  }

  /*
  |--------------------------------------------------------------------------
  | MySQL DATETIME is a wall-clock value.
  |
  | mysql2 returns DATETIME as a JavaScript Date because dateStrings=false.
  | Using local Date components preserves the original database clock value
  | and prevents JSON/ISO timezone conversion from shifting PTS local time.
  |--------------------------------------------------------------------------
  */

  if (
    value instanceof Date &&
    !Number.isNaN(
      value.getTime()
    )
  ) {
    const pad = (
      number
    ) =>
      String(
        number
      ).padStart(
        2,
        "0"
      );

    return `${
      value.getFullYear()
    }-${pad(
      value.getMonth() +
      1
    )}-${pad(
      value.getDate()
    )} ${pad(
      value.getHours()
    )}:${pad(
      value.getMinutes()
    )}:${pad(
      value.getSeconds()
    )}`;
  }

  const text =
    String(
      value
    ).trim();

  const match =
    text.match(
      /^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2}):(\d{2})/
    );

  if (match) {
    return `${match[1]}-${match[2]}-${match[3]} ${match[4]}:${match[5]}:${match[6]}`;
  }

  return text;
}


function continuousAbsenceDuration(
  seconds
) {
  const total =
    Math.max(
      0,
      Math.floor(
        Number(
          seconds
        ) ||
        0
      )
    );

  const days =
    Math.floor(
      total /
      86400
    );

  const hours =
    Math.floor(
      (
        total %
        86400
      ) /
      3600
    );

  const minutes =
    Math.floor(
      (
        total %
        3600
      ) /
      60
    );

  const secs =
    total %
    60;

  const pad = (
    value
  ) =>
    String(
      value
    ).padStart(
      2,
      "0"
    );

  if (days > 0) {
    return `${days}d ${pad(
      hours
    )}h ${pad(
      minutes
    )}m ${pad(
      secs
    )}s`;
  }

  return `${pad(
    hours
  )}h ${pad(
    minutes
  )}m ${pad(
    secs
  )}s`;
}


function serializeContinuousAbsenceRow(
  row
) {
  const periodSeconds =
    Math.max(
      0,
      Number(
        row?.period_seconds
      ) ||
      0
    );

  return {
    ...row,

    absent_from:
      continuousAbsenceDateTime(
        row?.absent_from
      ),

    return_punch_at:
      continuousAbsenceDateTime(
        row?.return_punch_at
      ),

    last_missed_at:
      continuousAbsenceDateTime(
        row?.last_missed_at
      ),

    created_at:
      continuousAbsenceDateTime(
        row?.created_at
      ),

    updated_at:
      continuousAbsenceDateTime(
        row?.updated_at
      ),

    missed_session_count:
      Number(
        row?.missed_session_count ||
        0
      ),

    period_seconds:
      periodSeconds,

    period_label:
      continuousAbsenceDuration(
        periodSeconds
      ),
  };
}


/*
|--------------------------------------------------------------------------
| CONTINUOUS ABSENCE PARAMS
|--------------------------------------------------------------------------
*/

function normalizeContinuousAbsenceReportParams(
  query
) {
  const dateFrom =
    String(
      query.date_from ||
      ""
    ).trim();

  const dateTo =
    String(
      query.date_to ||
      ""
    ).trim();


  if (!dateFrom) {
    throw new Error(
      "date_from is required."
    );
  }


  if (!dateTo) {
    throw new Error(
      "date_to is required."
    );
  }


  if (
    !isValidDateString(
      dateFrom
    )
  ) {
    throw new Error(
      "date_from must be in YYYY-MM-DD format."
    );
  }


  if (
    !isValidDateString(
      dateTo
    )
  ) {
    throw new Error(
      "date_to must be in YYYY-MM-DD format."
    );
  }


  if (
    dateFrom >
    dateTo
  ) {
    throw new Error(
      "Invalid date range. date_from cannot be after date_to."
    );
  }


  const rawSubjectType =
    normalizeUpper(
      query.subject_type
    );

  const subjectType =
    !rawSubjectType ||
    rawSubjectType ===
      "ALL"
      ? null
      : rawSubjectType;


  if (
    subjectType &&
    ![
      "TRAINEE",
      "STAFF",
    ].includes(
      subjectType
    )
  ) {
    throw new Error(
      "subject_type must be TRAINEE, STAFF or ALL."
    );
  }


  const rawStatus =
    normalizeUpper(
      query.status
    );

  const status =
    !rawStatus ||
    rawStatus ===
      "ALL"
      ? null
      : rawStatus;


  if (
    status &&
    ![
      "OPEN",
      "RETURNED",
    ].includes(
      status
    )
  ) {
    throw new Error(
      "Invalid status. Use OPEN, RETURNED or ALL."
    );
  }


  let courseId =
    normalizeNullableId(
      query.course_id
    );

  let platoonId =
    normalizeNullableId(
      query.platoon_id
    );

  let categoryId =
    normalizeNullableId(
      query.category_id
    );

  let branchId =
    normalizeNullableId(
      query.branch_id
    );


  /*
  |--------------------------------------------------------------------------
  | Remove incompatible subject filters
  |--------------------------------------------------------------------------
  */

  if (
    subjectType ===
    "TRAINEE"
  ) {
    categoryId =
      null;

    branchId =
      null;
  }


  if (
    subjectType ===
    "STAFF"
  ) {
    courseId =
      null;

    platoonId =
      null;
  }


  /*
  |--------------------------------------------------------------------------
  | ALL cannot combine Trainee and Staff group filters simultaneously
  |--------------------------------------------------------------------------
  */

  if (
    !subjectType &&
    (
      courseId ||
      platoonId
    ) &&
    (
      categoryId ||
      branchId
    )
  ) {
    throw new Error(
      "Invalid continuous absence filters. Select either Trainee Course/Platoon filters or Staff Category/Branch filters."
    );
  }


  return {
    dateFrom,
    dateTo,

    subjectType,
    status,

    search:
      String(
        query.search ||
        ""
      )
        .trim()
        .slice(
          0,
          150
        ),

    courseId,
    platoonId,

    categoryId,
    branchId,

    page:
      normalizePositiveInteger(
        query.page,
        1
      ),

    pageSize:
      normalizePositiveInteger(
        query.page_size,
        50,
        500
      ),
  };
}


/*
|--------------------------------------------------------------------------
| CONTINUOUS ABSENCE REPORT DATA
|--------------------------------------------------------------------------
*/

async function continuousAbsenceReport(
  req,
  res,
  next
) {
  try {
    const params =
      normalizeContinuousAbsenceReportParams(
        req.query
      );


    const result =
      await getContinuousAbsenceReport(
        params
      );


    return res.json({
      success:
        true,

      data: {
        ...result,

        rows:
          (
            result.rows ||
            []
          ).map(
            serializeContinuousAbsenceRow
          ),
      },
    });
  } catch (
    error
  ) {
    if (
      error.message &&
      (
        error.message.includes(
          "must be"
        ) ||
        error.message.includes(
          "required"
        ) ||
        error.message.includes(
          "Invalid"
        )
      )
    ) {
      return res
        .status(
          400
        )
        .json({
          success:
            false,

          message:
            error.message,
        });
    }


    return next(
      error
    );
  }
}


/*
|--------------------------------------------------------------------------
| CONTINUOUS ABSENCE EXCEL EXPORT
|--------------------------------------------------------------------------
*/

async function exportContinuousAbsenceReport(
  req,
  res,
  next
) {
  try {
    const params =
      normalizeContinuousAbsenceReportParams(
        req.query
      );


    const rawRows =
      await getContinuousAbsenceReportExport(
        params
      );


    const rows =
      (
        rawRows ||
        []
      ).map(
        serializeContinuousAbsenceRow
      );


    const workbook =
      new ExcelJS.Workbook();


    workbook.creator =
      "PTS Farooqabad";

    workbook.created =
      new Date();

    workbook.modified =
      new Date();


    const worksheet =
      workbook.addWorksheet(
        "Continuous Absence",
        {
          properties: {
            defaultRowHeight:
              18,
          },

          pageSetup: {
            paperSize:
              9,

            orientation:
              "landscape",

            fitToPage:
              true,

            fitToWidth:
              1,

            fitToHeight:
              0,

            margins: {
              left:
                0.25,

              right:
                0.25,

              top:
                0.5,

              bottom:
                0.5,

              header:
                0.2,

              footer:
                0.2,
            },
          },
        }
      );


    /*
    |--------------------------------------------------------------------------
    | TITLE
    |--------------------------------------------------------------------------
    */

    worksheet.mergeCells(
      "A1:J1"
    );

    worksheet.getCell(
      "A1"
    ).value =
      "POLICE TRAINING SCHOOL FAROOQABAD";

    worksheet.getCell(
      "A1"
    ).font = {
      bold:
        true,

      size:
        16,
    };

    worksheet.getCell(
      "A1"
    ).alignment = {
      horizontal:
        "center",

      vertical:
        "middle",
    };

    worksheet.getRow(
      1
    ).height =
      25;


    worksheet.mergeCells(
      "A2:J2"
    );

    worksheet.getCell(
      "A2"
    ).value =
      "Continuous Absence / Return Report";

    worksheet.getCell(
      "A2"
    ).font = {
      bold:
        true,

      size:
        13,
    };

    worksheet.getCell(
      "A2"
    ).alignment = {
      horizontal:
        "center",

      vertical:
        "middle",
    };


    worksheet.mergeCells(
      "A3:J3"
    );

    worksheet.getCell(
      "A3"
    ).value =
      `Period: ${params.dateFrom} to ${params.dateTo} | Subject: ${params.subjectType || "ALL"} | Status: ${params.status || "ALL"} | Total Records: ${rows.length}`;

    worksheet.getCell(
      "A3"
    ).alignment = {
      horizontal:
        "center",

      vertical:
        "middle",
    };


    /*
    |--------------------------------------------------------------------------
    | HEADINGS
    |--------------------------------------------------------------------------
    */

    const headerRow =
      worksheet.getRow(
        5
      );

    headerRow.values = [
      "Sr. No.",
      "Employee ID / Cap No.",
      "Name",
      "Course / Category",
      "Platoon / Branch",
      "Absent From",
      "Return Punch",
      "Period",
      "Missed Sessions",
      "Status",
    ];


    headerRow.font = {
      bold:
        true,

      color: {
        argb:
          "FFFFFFFF",
      },
    };


    headerRow.fill = {
      type:
        "pattern",

      pattern:
        "solid",

      fgColor: {
        argb:
          "FF0B2545",
      },
    };


    headerRow.alignment = {
      horizontal:
        "center",

      vertical:
        "middle",

      wrapText:
        true,
    };


    headerRow.height =
      28;


    /*
    |--------------------------------------------------------------------------
    | WIDTHS
    |--------------------------------------------------------------------------
    */

    const widths = [
      8,
      22,
      30,
      30,
      24,
      22,
      22,
      22,
      18,
      16,
    ];


    widths.forEach(
      (
        width,
        index
      ) => {
        worksheet.getColumn(
          index +
          1
        ).width =
          width;
      }
    );


    /*
    |--------------------------------------------------------------------------
    | DATA
    |--------------------------------------------------------------------------
    */

    rows.forEach(
      (
        row, index
      ) => {
        const groupName =
          row.subject_type ===
          "TRAINEE"
            ? row.course_name ||
              "-"
            : row.category_name ||
              "-";


        const subgroupName =
          row.subject_type ===
          "TRAINEE"
            ? row.platoon_number !==
                null &&
              row.platoon_number !==
                undefined
              ? `Platoon ${row.platoon_number}`
              : row.platoon_name ||
                "-"
            : row.branch_name ||
              "-";


        const dataRow =
          worksheet.addRow([
            index + 1,
            row.employee_id ||
              "-",

            row.subject_name ||
              "-",

            groupName,

            subgroupName,

            row.absent_from ||
              "-",

            row.return_punch_at ||
              "-",

            row.period_label ||
              continuousAbsenceDuration(
                row.period_seconds
              ),

            Number(
              row.missed_session_count ||
              0
            ),

            row.status ||
              "-",
          ]);


        dataRow.alignment = {
          vertical:
            "middle",

          wrapText:
            true,
        };
      }
    );


    /*
    |--------------------------------------------------------------------------
    | BORDERS
    |--------------------------------------------------------------------------
    */

    for (
      let rowNumber = 5;

      rowNumber <=
      worksheet.rowCount;

      rowNumber += 1
    ) {
      const row =
        worksheet.getRow(
          rowNumber
        );

      row.eachCell(
        {
          includeEmpty:
            true,
        },
        (
          cell
        ) => {
          cell.border = {
            top: {
              style:
                "thin",

              color: {
                argb:
                  "FFD1D5DB",
              },
            },

            left: {
              style:
                "thin",

              color: {
                argb:
                  "FFD1D5DB",
              },
            },

            bottom: {
              style:
                "thin",

              color: {
                argb:
                  "FFD1D5DB",
              },
            },

            right: {
              style:
                "thin",

              color: {
                argb:
                  "FFD1D5DB",
              },
            },
          };
        }
      );
    }


    worksheet.views = [
      {
        state:
          "frozen",

        ySplit:
          5,
      },
    ];


    worksheet.autoFilter = {
      from:
        "A5",

      to:
        "J5",
    };


    worksheet.headerFooter.oddFooter =
      `&LPTS Farooqabad Continuous Absence Report&CPage &P of &N&RGenerated ${new Date().toLocaleString(
        "en-GB"
      )}`;


    const filename =
      `Continuous_Absence_${params.dateFrom}_to_${params.dateTo}.xlsx`;


    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );


    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${filename}"`
    );


    await workbook.xlsx.write(
      res
    );


    return res.end();
  } catch (
    error
  ) {
    if (
      error.message &&
      (
        error.message.includes(
          "must be"
        ) ||
        error.message.includes(
          "required"
        ) ||
        error.message.includes(
          "Invalid"
        )
      )
    ) {
      return res
        .status(
          400
        )
        .json({
          success:
            false,

          message:
            error.message,
        });
    }


    return next(
      error
    );
  }
}

/*
|--------------------------------------------------------------------------
| CUSTOM SHIFT DUTY REPORT PARAMS
|--------------------------------------------------------------------------
*/

function normalizeCustomShiftReportParams(query) {
  const attendanceDate = String(query.attendance_date || "").trim();

  if (!attendanceDate) {
    throw new Error("attendance_date is required.");
  }

  if (!isValidDateString(attendanceDate)) {
    throw new Error("attendance_date must be in YYYY-MM-DD format.");
  }

  const attendanceStatus = query.attendance_status
    ? normalizeUpper(query.attendance_status)
    : null;

  if (
    attendanceStatus &&
    !["PRESENT", "ABSENT", "EXEMPT", "PENDING"].includes(attendanceStatus)
  ) {
    throw new Error("Invalid attendance_status.");
  }

  return {
    attendanceDate,

    search: String(query.search || "").trim().slice(0, 150),

    attendanceStatus,

    groupId: normalizeNullableId(query.group_id),
    shiftId: normalizeNullableId(query.shift_id),
    categoryId: normalizeNullableId(query.category_id),
    branchId: normalizeNullableId(query.branch_id),

    page: normalizePositiveInteger(query.page, 1),
    pageSize: normalizePositiveInteger(query.page_size, 50, 500),
  };
}

function isReportValidationError(error) {
  return Boolean(
    error?.message &&
      (error.message.includes("must be") ||
        error.message.includes("required") ||
        error.message.includes("Invalid")),
  );
}

async function customShiftFilters(req, res, next) {
  try {
    const rawDate = String(req.query?.attendance_date || "").trim();

    if (rawDate && !isValidDateString(rawDate)) {
      return res.status(400).json({
        success: false,
        message: "attendance_date must be in YYYY-MM-DD format.",
      });
    }

    const data = await getCustomShiftReportFilters(rawDate || null);

    return res.json({
      success: true,
      data,
    });
  } catch (error) {
    return next(error);
  }
}

async function customShiftReport(req, res, next) {
  try {
    const params = normalizeCustomShiftReportParams(req.query);
    const result = await getCustomShiftReport(params);

    return res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    if (isReportValidationError(error)) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    return next(error);
  }
}

async function exportCustomShiftReport(req, res, next) {
  try {
    const params = normalizeCustomShiftReportParams(req.query);
    const rows = await getCustomShiftReportExport(params);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "PTS Farooqabad";
    workbook.created = new Date();
    workbook.modified = new Date();

    const worksheet = workbook.addWorksheet("Custom Shift Duty", {
      properties: {
        defaultRowHeight: 18,
      },
      pageSetup: {
        paperSize: 9,
        orientation: "landscape",
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        margins: {
          left: 0.2,
          right: 0.2,
          top: 0.45,
          bottom: 0.45,
          header: 0.2,
          footer: 0.2,
        },
      },
    });

    worksheet.mergeCells("A1:N1");
    worksheet.getCell("A1").value = "POLICE TRAINING SCHOOL FAROOQABAD";
    worksheet.getCell("A1").font = {
      bold: true,
      size: 16,
    };
    worksheet.getCell("A1").alignment = {
      horizontal: "center",
      vertical: "middle",
    };
    worksheet.getRow(1).height = 25;

    worksheet.mergeCells("A2:N2");
    worksheet.getCell("A2").value = "Custom Shift Duty Attendance Report";
    worksheet.getCell("A2").font = {
      bold: true,
      size: 13,
    };
    worksheet.getCell("A2").alignment = {
      horizontal: "center",
      vertical: "middle",
    };

    worksheet.mergeCells("A3:N3");
    worksheet.getCell("A3").value =
      `Attendance Date: ${params.attendanceDate}     |     Total Records: ${rows.length}`;
    worksheet.getCell("A3").alignment = {
      horizontal: "center",
      vertical: "middle",
    };

    const headerRow = worksheet.getRow(5);
    headerRow.values = [
      "Sr. No.",
      "Employee ID / Cap No.",
      "Name",
      "Category",
      "Branch",
      "Group",
      "Shift",
      "Duty Point",
      "Scheduled Time",
      "Arrival Punch",
      "Departure Punch",
      "Attendance",
      "Checkout",
      "Exemption",
    ];

    headerRow.font = {
      bold: true,
      color: {
        argb: "FFFFFFFF",
      },
    };
    headerRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: {
        argb: "FF0B2545",
      },
    };
    headerRow.alignment = {
      horizontal: "center",
      vertical: "middle",
      wrapText: true,
    };
    headerRow.height = 28;

    [
      8,
      20,
      28,
      24,
      24,
      24,
      20,
      24,
      22,
      21,
      21,
      15,
      16,
      34,
    ].forEach((width, index) => {
      worksheet.getColumn(index + 1).width = width;
    });

    rows.forEach((row, index) => {
      const schedule =
        row.start_time && row.end_time
          ? `${String(row.start_time).slice(0, 8)} - ${String(row.end_time).slice(0, 8)}`
          : "-";

      const exemption = row.exemption_type
        ? row.exemption_description
          ? `${row.exemption_type} - ${row.exemption_description}`
          : row.exemption_type
        : "-";

      const dataRow = worksheet.addRow([
        index + 1,
        row.employee_id || row.belt_no || "-",
        row.subject_name || "-",
        row.category_name || "-",
        row.branch_name || "-",
        row.group_name || "-",
        row.shift_name || "-",
        row.duty_point_name || "-",
        schedule,
        excelDate(row.start_punch_time),
        excelDate(row.end_punch_time),
        row.attendance_status || "-",
        row.checkout_status || "-",
        exemption,
      ]);

      dataRow.alignment = {
        vertical: "middle",
        wrapText: true,
      };
    });

    for (let rowNumber = 5; rowNumber <= worksheet.rowCount; rowNumber += 1) {
      const row = worksheet.getRow(rowNumber);

      row.eachCell(
        {
          includeEmpty: true,
        },
        (cell) => {
          cell.border = {
            top: { style: "thin", color: { argb: "FFD1D5DB" } },
            left: { style: "thin", color: { argb: "FFD1D5DB" } },
            bottom: { style: "thin", color: { argb: "FFD1D5DB" } },
            right: { style: "thin", color: { argb: "FFD1D5DB" } },
          };
        },
      );
    }

    worksheet.views = [
      {
        state: "frozen",
        ySplit: 5,
      },
    ];

    worksheet.autoFilter = {
      from: "A5",
      to: "N5",
    };

    worksheet.headerFooter.oddFooter =
      `&LPTS Farooqabad Custom Shift Duty&CPage &P of &N&RGenerated ${new Date().toLocaleString("en-GB")}`;

    const filename = `Custom_Shift_Duty_${params.attendanceDate}.xlsx`;

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${filename}"`,
    );

    await workbook.xlsx.write(res);
    return res.end();
  } catch (error) {
    if (isReportValidationError(error)) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    return next(error);
  }
}

module.exports = {
  attendanceFilters,

  attendanceReport,

  exportAttendanceReport,

  longWeekendReport,
  exportLongWeekendReport,
  continuousAbsenceReport,
  exportContinuousAbsenceReport,

  customShiftFilters,
  customShiftReport,
  exportCustomShiftReport,
};
