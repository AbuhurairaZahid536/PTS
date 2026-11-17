const http = require("http");

const app = require("./app");
const { startBiometricSyncScheduler, stopBiometricSyncScheduler } = require("./jobs/biometricSync.job");
const config = require("./config/env");
const logger = require("./utils/logger");

const {
  checkConnection,
} = require("./config/db");

const {
  processAttendanceDate,
} = require(
  "./services/attendanceEngine.service"
);

const {
  syncContinuousAbsenceForDate,
} = require(
  "./services/absenceEpisode.service"
);

const {
  startCourseLifecycleScheduler,
  stopCourseLifecycleScheduler,
} = require(
  "./jobs/courseLifecycle.job"
);

/*
|--------------------------------------------------------------------------
| SERVER
|--------------------------------------------------------------------------
*/

const server =
  http.createServer(app);

/*
|--------------------------------------------------------------------------
| AUTOMATIC ATTENDANCE
|--------------------------------------------------------------------------
*/

const AUTO_ATTENDANCE_INTERVAL_MS =
  60 * 1000;

const AUTO_ATTENDANCE_INITIAL_DELAY_MS =
  8 * 1000;

let attendanceJobRunning =
  false;

let attendanceIntervalId =
  null;

let attendanceInitialTimeoutId =
  null;

/*
|--------------------------------------------------------------------------
| LOCAL DATE
|--------------------------------------------------------------------------
*/

function pad(value) {
  return String(value).padStart(
    2,
    "0"
  );
}

function getLocalToday() {
  const now =
    new Date();

  return [
    now.getFullYear(),
    "-",
    pad(
      now.getMonth() + 1
    ),
    "-",
    pad(
      now.getDate()
    ),
  ].join("");
}

/*
|--------------------------------------------------------------------------
| RUN AUTOMATIC ATTENDANCE
|--------------------------------------------------------------------------
*/

async function runAutomaticAttendance() {
  if (
    attendanceJobRunning
  ) {
    logger.warn(
      "Automatic attendance skipped because previous attendance job is still running."
    );

    return;
  }

  attendanceJobRunning =
    true;

  const attendanceDate =
    getLocalToday();

  const startedAt =
    Date.now();

  try {
    logger.info(
      {
        attendanceDate,
      },
      "Automatic attendance processing started."
    );

    // A failed/incomplete upstream fetch must not manufacture fresh absence.
    const { runLiveTransactionSync } = require("./controllers/biometric.controller");
    const sourceSync = await runLiveTransactionSync();
    if (sourceSync.failed || sourceSync.complete === false) {
      logger.warn({failed:sourceSync.failed}, "Attendance deferred until BioTime transaction reconciliation completes");
      return;
    }
    const result =
      await processAttendanceDate({
        attendanceDate,
        subjectType: null,
      });

    /*
    |--------------------------------------------------------------------------
    | CONTINUOUS ABSENCE / RETURN
    |--------------------------------------------------------------------------
    |
    | Current-date attendance is saved first.
    |
    | Then:
    | - missed Timetable windows open / continue absence
    | - missed Duty Roster arrival windows open / continue absence
    | - later genuine biometric punch closes OPEN absence as RETURNED
    |
    | Failure here must NOT stop the existing attendance scheduler.
    |
    |--------------------------------------------------------------------------
    */

    try {
      const absenceResult =
        await syncContinuousAbsenceForDate(
          attendanceDate
        );

      const absenceLogData = {
        attendanceDate,

        reconciledSessionsRemoved:
          absenceResult
            ?.source_reconciliation
            ?.removed_sessions ||
          0,

        reconciledEpisodesRepaired:
          absenceResult
            ?.source_reconciliation
            ?.repaired_episodes ||
          0,

        reconciledEpisodesDeleted:
          absenceResult
            ?.source_reconciliation
            ?.deleted_episodes ||
          0,

        timetableOpened:
          absenceResult
            ?.timetable
            ?.opened ||
          0,

        timetableContinued:
          absenceResult
            ?.timetable
            ?.continued ||
          0,

        dutyRosterOpened:
          absenceResult
            ?.duty_roster
            ?.opened ||
          0,

        dutyRosterContinued:
          absenceResult
            ?.duty_roster
            ?.continued ||
          0,

        returned:
          absenceResult
            ?.returns
            ?.returned ||
          0,

        failed:
          absenceResult
            ?.failed ||
          0,

        durationMs:
          absenceResult
            ?.duration_ms ||
          0,
      };


      logger.info(
        absenceLogData,
        "Continuous absence processing completed."
      );


      if (
        Number(
          absenceResult?.failed ||
          0
        ) > 0
      ) {
        logger.warn(
          {
            attendanceDate,

            timetableFailures:
              (
                absenceResult
                  ?.timetable
                  ?.failures ||
                []
              ).slice(
                0,
                10
              ),

            dutyRosterFailures:
              (
                absenceResult
                  ?.duty_roster
                  ?.failures ||
                []
              ).slice(
                0,
                10
              ),

            returnFailures:
              (
                absenceResult
                  ?.returns
                  ?.failures ||
                []
              ).slice(
                0,
                10
              ),
          },
          "Continuous absence processing completed with row-level failures."
        );
      }
    } catch (absenceError) {
      logger.error(
        {
          err:
            absenceError,

          attendanceDate,
        },
        "Continuous absence processing failed; normal attendance remains available."
      );
    }

    logger.info(
      {
        attendanceDate,

        subjects:
          result.subjects,

        records:
          result.records,

        present:
          result.present,

        absent:
          result.absent,

        exempt:
          result.exempt,

        noTimetable:
          result.no_timetable,

        failed:
          result.failed,

        engineDurationMs:
          result.duration_ms,

        totalDurationMs:
          Date.now() -
          startedAt,
      },
      "Automatic attendance processing completed."
    );
  } catch (error) {
    logger.error(
      {
        err: error,
        attendanceDate,
      },
      "Automatic attendance processing failed."
    );
  } finally {
    attendanceJobRunning =
      false;
  }
}

/*
|--------------------------------------------------------------------------
| START AUTOMATIC ATTENDANCE
|--------------------------------------------------------------------------
*/

function startAutomaticAttendanceScheduler() {
  if (
    attendanceIntervalId ||
    attendanceInitialTimeoutId
  ) {
    return;
  }

  attendanceInitialTimeoutId =
    setTimeout(
      () => {
        attendanceInitialTimeoutId =
          null;

        runAutomaticAttendance();
      },
      AUTO_ATTENDANCE_INITIAL_DELAY_MS
    );

  attendanceIntervalId =
    setInterval(
      () => {
        runAutomaticAttendance();
      },
      AUTO_ATTENDANCE_INTERVAL_MS
    );

  logger.info(
    {
      intervalSeconds:
        AUTO_ATTENDANCE_INTERVAL_MS /
        1000,

      initialDelaySeconds:
        AUTO_ATTENDANCE_INITIAL_DELAY_MS /
        1000,
    },
    "Automatic current-date attendance scheduler enabled."
  );
}

/*
|--------------------------------------------------------------------------
| STOP AUTOMATIC ATTENDANCE
|--------------------------------------------------------------------------
*/

function stopAutomaticAttendanceScheduler() {
  if (
    attendanceInitialTimeoutId
  ) {
    clearTimeout(
      attendanceInitialTimeoutId
    );

    attendanceInitialTimeoutId =
      null;
  }

  if (
    attendanceIntervalId
  ) {
    clearInterval(
      attendanceIntervalId
    );

    attendanceIntervalId =
      null;
  }
}

/*
|--------------------------------------------------------------------------
| START HTTP SERVER
|--------------------------------------------------------------------------
*/

server.listen(
  config.port,
  async () => {
    logger.info(
      `PTS Farooqabad API listening on port ${config.port} [${config.env}]`
    );

    logger.info(
      `API base path: ${config.apiPrefix}`
    );

    const db =
      await checkConnection();

    if (
      db.connected
    ) {
      logger.info(
        "MySQL connection verified."
      );

      /*
      |--------------------------------------------------------------------------
      | ATTENDANCE SCHEDULER
      |--------------------------------------------------------------------------
      */

      startBiometricSyncScheduler();
      startAutomaticAttendanceScheduler();

      /*
      |--------------------------------------------------------------------------
      | COURSE -> ZKBIOTIME LIFECYCLE
      |--------------------------------------------------------------------------
      |
      | Handles:
      |
      | ACTIVE Course
      |   -> Department / Position / Trainee ZK sync
      |
      | COMPLETED Course
      |   -> trainee removed from ZKBioTime
      |   -> PTS history preserved
      |
      | UPCOMING / DATE_NOT_SET
      |   -> trainee must not own trainee ZK identity
      |
      |--------------------------------------------------------------------------
      */

      startCourseLifecycleScheduler();
    } else {
      logger.warn(
        {
          reason:
            db.error,
        },
        "MySQL is not reachable yet — automatic schedulers were not started."
      );
    }
  }
);

/*
|--------------------------------------------------------------------------
| UNHANDLED REJECTION
|--------------------------------------------------------------------------
*/

process.on(
  "unhandledRejection",
  (err) => {
    logger.error(
      {
        err,
      },
      "Unhandled promise rejection"
    );
  }
);

/*
|--------------------------------------------------------------------------
| GRACEFUL SHUTDOWN
|--------------------------------------------------------------------------
*/

function shutdown(
  signal
) {
  logger.info(
    {
      signal,
    },
    "Server shutdown requested."
  );

  stopBiometricSyncScheduler();
  stopAutomaticAttendanceScheduler();

  stopCourseLifecycleScheduler();

  server.close(
    () => {
      logger.info(
        "HTTP server closed."
      );

      process.exit(0);
    }
  );

  setTimeout(
    () => {
      logger.warn(
        "Forced server shutdown."
      );

      process.exit(1);
    },
    10000
  ).unref();
}

process.on(
  "SIGINT",
  () => {
    shutdown(
      "SIGINT"
    );
  }
);

process.on(
  "SIGTERM",
  () => {
    shutdown(
      "SIGTERM"
    );
  }
);

module.exports = server;