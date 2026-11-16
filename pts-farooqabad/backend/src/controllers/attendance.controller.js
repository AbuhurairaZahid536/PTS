const {
  processAttendanceDate,
} = require(
  "../services/attendanceEngine.service"
);

const {
  getAttendanceRecords,
  getSummary,
} = require(
  "../models/attendance.model"
);

/*
|--------------------------------------------------------------------------
| PROCESS
|--------------------------------------------------------------------------
*/

async function processAttendance(
  req,
  res,
  next
) {
  try {
    const attendanceDate =
      req.body.attendance_date;

    if (!attendanceDate) {
      return res
        .status(400)
        .json({
          success: false,

          message:
            "attendance_date is required.",
        });
    }

    /*
    |--------------------------------------------------------------------------
    | No direct ZKBioTime call here.
    |
    | Attendance Engine processes local:
    |
    | zkteco_transactions
    |--------------------------------------------------------------------------
    */

    const result =
      await processAttendanceDate({
        attendanceDate,

        subjectType:
          req.body.subject_type ||
          null,
      });

    return res.json({
      success: true,

      message:
        result.failed > 0
          ? "Attendance processed with some ambiguous/failed records."
          : "Attendance processed successfully.",

      data: result,
    });
  } catch (error) {
    return next(error);
  }
}

/*
|--------------------------------------------------------------------------
| LIST
|--------------------------------------------------------------------------
*/

async function listAttendance(
  req,
  res,
  next
) {
  try {
    const attendanceDate =
      req.query.attendance_date;

    if (!attendanceDate) {
      return res
        .status(400)
        .json({
          success: false,

          message:
            "attendance_date is required.",
        });
    }

    const rows =
      await getAttendanceRecords({
        attendanceDate,

        subjectType:
          req.query.subject_type ||
          null,

        sessionType:
          req.query.session_type ||
          null,

        status:
          req.query.status ||
          null,

        timingStatus:
          req.query.timing_status ||
          null,

        manualOnly:
          req.query.manual_only ===
          "1",

        search:
          req.query.search ||
          "",

        courseId:
          req.query.course_id ||
          null,

        platoonId:
          req.query.platoon_id ||
          null,

        categoryId:
          req.query.category_id ||
          null,

        branchId:
          req.query.branch_id ||
          null,
      });

    return res.json({
      success: true,
      data: rows,
    });
  } catch (error) {
    return next(error);
  }
}

/*
|--------------------------------------------------------------------------
| SUMMARY
|--------------------------------------------------------------------------
*/

async function attendanceSummary(
  req,
  res,
  next
) {
  try {
    const attendanceDate =
      req.query.attendance_date;

    if (!attendanceDate) {
      return res
        .status(400)
        .json({
          success: false,

          message:
            "attendance_date is required.",
        });
    }

    const result =
      await getSummary(
        attendanceDate,

        req.query.subject_type ||
          null
      );

    return res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  processAttendance,

  listAttendance,

  attendanceSummary,
};