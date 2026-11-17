const {
  getAllTraineesForDashboard,
  getAllStaffForDashboard,
} = require("../models/dashboardRoster.model");

const { getOpenAbsences } = require("../models/absenceEpisode.model");

const { getAttendanceReportAllRows } = require("../models/report.model");

const { getDrops } = require("../models/trainingDrop.model");

const { getWeekends } = require("../models/weekend.model");

const { getOutdoorRecords } = require("../models/outdoor.model");

const { getLeaves } = require("../models/leave.model");

const { getRecords: getOsdRecords } = require("../models/osd.model");

const { calculateDutyRosterAttendance } = require("../models/dutyRoster.model");
const { calculateCustomShiftAttendance } = require("../models/customShift.model");

/*
|--------------------------------------------------------------------------
| HELPERS
|--------------------------------------------------------------------------
*/

function hasAnyPermission(req, ...requiredPermissions) {
  const permissions = Array.isArray(req.user?.permissions)
    ? req.user.permissions
    : [];

  return requiredPermissions.some((permission) =>
    permissions.includes(permission),
  );
}

function shouldIncludeSupportData(req) {
  const value = String(req.query?.include_support || "")
    .trim()
    .toLowerCase();

  return value === "1" || value === "true";
}

async function safeSupportLoad(label, loader) {
  try {
    return await loader();
  } catch (error) {
    console.error(`Dashboard support data failed (${label}):`, error);

    error.message = `Dashboard source ${label} failed: ${error.message}`;
    throw error;
  }
}

function isValidDateString(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) {
    return false;
  }

  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0,10) === value;
}

/*
|--------------------------------------------------------------------------
| TRAINEE ROSTER
|--------------------------------------------------------------------------
*/

async function traineeRoster(req, res, next) {
  try {
    const rows = await getAllTraineesForDashboard();

    return res.json({
      success: true,
      data: rows,
      total: rows.length,
    });
  } catch (error) {
    return next(error);
  }
}

/*
|--------------------------------------------------------------------------
| STAFF ROSTER
|--------------------------------------------------------------------------
*/

async function staffRoster(req, res, next) {
  try {
    const rows = await getAllStaffForDashboard();

    return res.json({
      success: true,
      data: rows,
      total: rows.length,
    });
  } catch (error) {
    return next(error);
  }
}


/*
|--------------------------------------------------------------------------
| LIVE OPEN CONTINUOUS ABSENCE
|--------------------------------------------------------------------------
|
| Lightweight current-state endpoint used by Dashboard live cards.
| This deliberately shares getOpenAbsences() with the consolidated snapshot,
| so an occasional snapshot fallback can never make the Dashboard revert to
| raw session ABSENT counts.
|
| Historical attendance is not rewritten here. Returned people disappear
| from this OPEN source as soon as their genuine return punch closes the
| episode, which lets the live Dashboard move them back to Present.
|--------------------------------------------------------------------------
*/

async function openContinuousAbsences(req, res, next) {
  try {
    const rows = await getOpenAbsences();

    const stableRows = rows.map((row) => {
      const {
        duration_seconds_current,
        ...stableRow
      } = row;

      return stableRow;
    });

    res.set(
      "Cache-Control",
      "private, no-cache, max-age=0, must-revalidate",
    );

    return res.json({
      success: true,
      data: {
        rows: stableRows,
        total: stableRows.length,
        trainee_total: stableRows.filter(
          (row) => row.subject_type === "TRAINEE",
        ).length,
        staff_total: stableRows.filter(
          (row) => row.subject_type === "STAFF",
        ).length,
      },
    });
  } catch (error) {
    return next(error);
  }
}

/*
|--------------------------------------------------------------------------
| DASHBOARD SNAPSHOT
|--------------------------------------------------------------------------
|
| Normal request:
|
|   /dashboard/snapshot?attendance_date=YYYY-MM-DD
|
| Existing Dashboard snapshot response remains unchanged.
|
|
| Optimized request:
|
|   /dashboard/snapshot
|     ?attendance_date=YYYY-MM-DD
|     &include_support=1
|
| In optimized mode the same response can additionally contain:
|
| - Training Drop / Repatriate rows
| - Weekend rows
| - Trainee Medical Rest rows
| - Staff Medical Rest rows
| - Duty Roster Attendance rows
|
| This allows Dashboard frontend to avoid several separate HTTP requests.
|
| Existing attendance calculations, roster queries and individual module
| endpoints remain unchanged.
|
|--------------------------------------------------------------------------
*/

async function dashboardSnapshot(req, res, next) {
  try {
    const attendanceDate = String(req.query?.attendance_date || "").trim();

    /*
    |--------------------------------------------------------------------------
    | VALIDATE DATE
    |--------------------------------------------------------------------------
    */

    if (!isValidDateString(attendanceDate)) {
      return res.status(400).json({
        success: false,

        message: "attendance_date must be a valid YYYY-MM-DD date.",
      });
    }

    /*
    |--------------------------------------------------------------------------
    | OPTIONAL SUPPORT MODE
    |--------------------------------------------------------------------------
    |
    | IMPORTANT:
    |
    | Support queries are NOT executed for normal existing snapshot calls.
    |
    | They are only executed when:
    |
    | include_support=1
    |
    |--------------------------------------------------------------------------
    */

    const includeSupport = shouldIncludeSupportData(req);

    /*
    |--------------------------------------------------------------------------
    | PERMISSION CHECKS
    |--------------------------------------------------------------------------
    |
    | Dashboard support data is loaded under Dashboard access itself.
    | This is intentional: summary cards must remain accurate even when a
    | Dashboard viewer does not have permission to open the source module.
    | Source-module CRUD permissions remain unchanged.
    |
    |--------------------------------------------------------------------------
    */

    const canViewDashboard = hasAnyPermission(req, "dashboard.view");

    if (includeSupport && !canViewDashboard) {
      return res.status(403).json({
        success: false,

        message: "You do not have permission to view Dashboard data.",

        requiredPermission: "dashboard.view",
      });
    }

    /*
    |--------------------------------------------------------------------------
    | SUPPORT DATA
    |--------------------------------------------------------------------------
    |
    | All independent support queries run in parallel.
    |
    | A failed support source rejects the snapshot; the browser keeps its
    | last complete snapshot and warns instead of silently showing zero.
    |
    |--------------------------------------------------------------------------
    */

    const supportPromise = includeSupport
      ? Promise.all([
          safeSupportLoad(
            "training-drops",
            () => getDrops({}),
          ),

          safeSupportLoad(
            "weekends",
            () => getWeekends(),
          ),

          safeSupportLoad(
            "trainee-leaves",
            () =>
              getLeaves({
                subjectType: "TRAINEE",
                dateFrom: attendanceDate,
                dateTo: attendanceDate,
              }),
          ),

          safeSupportLoad(
            "staff-leaves",
            () =>
              getLeaves({
                subjectType: "STAFF",
                dateFrom: attendanceDate,
                dateTo: attendanceDate,
              }),
          ),

          safeSupportLoad(
            "trainee-osd",
            () =>
              getOsdRecords({
                subjectType: "TRAINEE",
                dateFrom: attendanceDate,
                dateTo: attendanceDate,
              }),
          ),

          safeSupportLoad(
            "staff-osd",
            () =>
              getOsdRecords({
                subjectType: "STAFF",
                dateFrom: attendanceDate,
                dateTo: attendanceDate,
              }),
          ),

          safeSupportLoad(
            "trainee-home-rest",
            () =>
              getOutdoorRecords({
                subjectType: "TRAINEE",
                homeRestOnly: true,
              }),
          ),

          safeSupportLoad(
            "staff-home-rest",
            () =>
              getOutdoorRecords({
                subjectType: "STAFF",
                homeRestOnly: true,
              }),
          ),

          safeSupportLoad(
            "trainee-medical-rest",
            () =>
              getOutdoorRecords({
                subjectType: "TRAINEE",
                medicalRestOnly: true,
              }),
          ),

          safeSupportLoad(
            "staff-medical-rest",
            () =>
              getOutdoorRecords({
                subjectType: "STAFF",
                medicalRestOnly: true,
              }),
          ),

          safeSupportLoad("custom-shift-attendance", async () => (await calculateCustomShiftAttendance(attendanceDate)).rows || []),
          safeSupportLoad(
            "duty-roster-attendance",
            async () => {
              const data = await calculateDutyRosterAttendance(attendanceDate);
              return Array.isArray(data?.rows) ? data.rows : [];
            },
          ),
        ]).then(
          ([
            trainingDrops,
            weekends,
            traineeLeaves,
            staffLeaves,
            traineeOsd,
            staffOsd,
            traineeHomeRest,
            staffHomeRest,
            traineeMedicalRest,
            staffMedicalRest,
            customShiftRows,
            shiftAttendanceRows,
          ]) => ({
            training_drops: trainingDrops,
            weekends,
            trainee_leaves: traineeLeaves,
            staff_leaves: staffLeaves,
            trainee_osd: traineeOsd,
            staff_osd: staffOsd,
            trainee_home_rest: traineeHomeRest,
            staff_home_rest: staffHomeRest,
            trainee_medical_rest: traineeMedicalRest,
            staff_medical_rest: staffMedicalRest,
            shift_attendance_rows: shiftAttendanceRows,
            custom_shift_rows: customShiftRows,
          }),
        )
      : Promise.resolve(null);

    /*
    |--------------------------------------------------------------------------
    | CORE DASHBOARD DATA
    |--------------------------------------------------------------------------
    |
    | Existing Dashboard data sources remain exactly the same.
    |
    |--------------------------------------------------------------------------
    */

    const [
      traineeRosterRows,
      staffRosterRows,

      traineeMorning,
      traineeEvening,

      staffMorning,
      staffEvening,

      openAbsences,

      supportingData,
    ] = await Promise.all([
      /*
        |--------------------------------------------------------------------------
        | TRAINEE MASTER ROSTER
        |--------------------------------------------------------------------------
        */

      getAllTraineesForDashboard(),

      /*
        |--------------------------------------------------------------------------
        | STAFF MASTER ROSTER
        |--------------------------------------------------------------------------
        */

      getAllStaffForDashboard(),

      /*
        |--------------------------------------------------------------------------
        | TRAINEE MORNING
        |--------------------------------------------------------------------------
        */

      getAttendanceReportAllRows({
        attendanceDate,

        subjectType: "TRAINEE",

        sessionType: "MORNING",
      }),

      /*
        |--------------------------------------------------------------------------
        | TRAINEE EVENING
        |--------------------------------------------------------------------------
        */

      getAttendanceReportAllRows({
        attendanceDate,

        subjectType: "TRAINEE",

        sessionType: "EVENING",
      }),

      /*
        |--------------------------------------------------------------------------
        | STAFF MORNING
        |--------------------------------------------------------------------------
        */

      getAttendanceReportAllRows({
        attendanceDate,

        subjectType: "STAFF",

        sessionType: "MORNING",
      }),

      /*
        |--------------------------------------------------------------------------
        | STAFF EVENING
        |--------------------------------------------------------------------------
        */

      getAttendanceReportAllRows({
        attendanceDate,

        subjectType: "STAFF",

        sessionType: "EVENING",
      }),

      /*
|--------------------------------------------------------------------------
| CURRENT OPEN CONTINUOUS ABSENCES
|--------------------------------------------------------------------------
|
| Central absence_episodes source-of-truth.
|
| Returned people are not included because getOpenAbsences()
| only returns status = OPEN.
|
|--------------------------------------------------------------------------
*/

      getOpenAbsences(),

      /*
        |--------------------------------------------------------------------------
        | OPTIONAL SUPPORTING DATA
        |--------------------------------------------------------------------------
        */

      supportPromise,
    ]);

    /*
    |--------------------------------------------------------------------------
    | RESPONSE
    |--------------------------------------------------------------------------
    */

    /*
    |--------------------------------------------------------------------------
    | CONDITIONAL BROWSER REVALIDATION
    |--------------------------------------------------------------------------
    |
    | Dashboard snapshots are large. `private, no-cache` allows the browser to
    | retain a private copy but requires revalidation before reuse. Express can
    | then answer `304 Not Modified` when the actual snapshot has not changed.
    |
    | Do not use `no-store` here: that would force the full multi-MB payload to
    | cross the network on every refresh.
    |--------------------------------------------------------------------------
    */

    res.set(
      "Cache-Control",
      "private, no-cache, max-age=0, must-revalidate",
    );

    return res.json({
      success: true,

      data: {
        /*
        |--------------------------------------------------------------------------
        | META
        |--------------------------------------------------------------------------
        */

        attendance_date: attendanceDate,
        generated_at: new Date().toISOString(),
        timezone: "Asia/Karachi",
        source_authority: { identities: "ZKBioTime", punches: "ZKBioTime", operational_records: "PTS" },

        /*
        |--------------------------------------------------------------------------
        | TRAINEE ROSTER
        |--------------------------------------------------------------------------
        */

        trainee_roster: traineeRosterRows,

        trainee_roster_total: traineeRosterRows.length,

        /*
        |--------------------------------------------------------------------------
        | STAFF ROSTER
        |--------------------------------------------------------------------------
        */

        staff_roster: staffRosterRows,

        staff_roster_total: staffRosterRows.length,

        /*
        |--------------------------------------------------------------------------
        | TRAINEE MORNING
        |--------------------------------------------------------------------------
        */

        trainee_morning: {
          rows: traineeMorning,

          total: traineeMorning.length,
        },

        /*
        |--------------------------------------------------------------------------
        | TRAINEE EVENING
        |--------------------------------------------------------------------------
        */

        trainee_evening: {
          rows: traineeEvening,

          total: traineeEvening.length,
        },

        /*
        |--------------------------------------------------------------------------
        | STAFF MORNING
        |--------------------------------------------------------------------------
        */

        staff_morning: {
          rows: staffMorning,

          total: staffMorning.length,
        },

        /*
        |--------------------------------------------------------------------------
        | STAFF EVENING
        |--------------------------------------------------------------------------
        */

        staff_evening: {
          rows: staffEvening,

          total: staffEvening.length,
        },

        /*
|--------------------------------------------------------------------------
| CURRENT CONTINUOUS ABSENCE
|--------------------------------------------------------------------------
*/

        continuous_absence: {
          rows: openAbsences.map((row) => {
            const {
              duration_seconds_current,
              ...stableRow
            } = row;

            return stableRow;
          }),

          total: openAbsences.length,

          trainee_total: openAbsences.filter(
            (row) => row.subject_type === "TRAINEE",
          ).length,

          staff_total: openAbsences.filter(
            (row) => row.subject_type === "STAFF",
          ).length,
        },

        /*
        |--------------------------------------------------------------------------
        | OPTIONAL SUPPORT DATA
        |--------------------------------------------------------------------------
        |
        | Normal legacy request mein property add nahi hogi.
        |
        |--------------------------------------------------------------------------
        */

        ...(supportingData
          ? {
              supporting_data: supportingData,
            }
          : {}),
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
  traineeRoster,

  staffRoster,

  openContinuousAbsences,

  dashboardSnapshot,
};
