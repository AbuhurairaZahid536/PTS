const {
  pool,
} = require("../config/db");

const {
  reconcileCourseLifecycle,
  todayDate,
} = require(
  "../services/courseZkLifecycle.service"
);

/*
|--------------------------------------------------------------------------
| CONFIG
|--------------------------------------------------------------------------
*/

const COURSE_LIFECYCLE_INTERVAL_MS =
  Math.max(
    Number(
      process.env
        .COURSE_LIFECYCLE_INTERVAL_SECONDS ||
        300
    ),
    60
  ) * 1000;

const COURSE_LIFECYCLE_INITIAL_DELAY_MS =
  Math.max(
    Number(
      process.env
        .COURSE_LIFECYCLE_INITIAL_DELAY_SECONDS ||
        15
    ),
    5
  ) * 1000;

/*
|--------------------------------------------------------------------------
| STATE
|--------------------------------------------------------------------------
*/

let lifecycleIntervalId =
  null;

let lifecycleInitialTimeoutId =
  null;

let lifecycleJobRunning =
  false;

const pendingCourseIds =
  new Set();

/*
|--------------------------------------------------------------------------
| HELPERS
|--------------------------------------------------------------------------
*/

function normalizeCourseId(
  value
) {
  const id =
    Number(value);

  return (
    Number.isInteger(id) &&
    id > 0
      ? id
      : null
  );
}

/*
|--------------------------------------------------------------------------
| FIND COURSES WHICH NEED RECONCILIATION
|--------------------------------------------------------------------------
|
| We do NOT process every Course every few minutes.
|
| Candidates:
|
| 1. ACTIVE Course
| 2. Non-active Course which still has ZK trainee mapping
| 3. Non-active Course which still has ZK Department/Position mapping
|
|--------------------------------------------------------------------------
*/

async function findLifecycleCandidateIds(
  referenceDate =
    todayDate()
) {
  const [rows] =
    await pool.query(
      `
        SELECT DISTINCT
          c.id

        FROM courses c

        WHERE
          (
            c.start_date IS NOT NULL

            AND

            c.end_date IS NOT NULL

            AND

            :referenceDateActive
            BETWEEN
              c.start_date
            AND
              c.end_date
          )

          OR

          (
            (
              c.start_date IS NULL

              OR

              c.end_date IS NULL

              OR

              :referenceDateUpcoming
              <
              c.start_date

              OR

              :referenceDateCompleted
              >
              c.end_date
            )

            AND

            (
              c.zkbiotime_department_id
              IS NOT NULL

              OR

              EXISTS
              (
                SELECT 1

                FROM platoons p

                WHERE
                  p.course_id =
                  c.id

                  AND

                  p.zkbiotime_position_id
                  IS NOT NULL

                LIMIT 1
              )

              OR

              EXISTS
              (
                SELECT 1

                FROM trainees t

                WHERE
                  t.course_id =
                  c.id

                  AND

                  t.is_deleted = 0

                  AND

                  (
                    t.zkteco_emp_id
                    IS NOT NULL

                    OR

                    t.zkteco_emp_code
                    IS NOT NULL

                    OR

                    COALESCE(
                      t.zkteco_synced,
                      0
                    ) = 1
                  )

                LIMIT 1
              )
            )
          )

        ORDER BY
          c.id ASC
      `,
      {
        referenceDateActive:
          referenceDate,

        referenceDateUpcoming:
          referenceDate,

        referenceDateCompleted:
          referenceDate,
      }
    );

  return rows
    .map(
      (row) =>
        normalizeCourseId(
          row.id
        )
    )
    .filter(Boolean);
}

/*
|--------------------------------------------------------------------------
| RUN ONE COURSE
|--------------------------------------------------------------------------
*/

async function reconcileOneCourse({
  courseId,
  referenceDate,
  reason,
}) {
  const startedAt =
    Date.now();

  try {
    const result =
      await reconcileCourseLifecycle({
        referenceDate,

        dryRun:
          false,

        courseId,
      });

    const item =
      result?.results?.[0] ||
      null;

    const failedEmployees =
      Array.isArray(
        item?.employees
      )
        ? item.employees.filter(
            (employee) =>
              employee?.status ===
              "FAILED"
          ).length
        : 0;

    console.log(
      `[CourseLifecycle] Completed | ` +
        `Course=${courseId} | ` +
        `Reason=${reason} | ` +
        `Status=${item?.course_status || "-"} | ` +
        `Action=${item?.action || "-"} | ` +
        `EmployeeFailures=${failedEmployees} | ` +
        `DurationMs=${Date.now() - startedAt}`
    );

    return result;
  } catch (error) {
    console.error(
      `[CourseLifecycle] Failed | ` +
        `Course=${courseId} | ` +
        `Reason=${reason} | ` +
        `Error=${error.message}`
    );

    return null;
  }
}

/*
|--------------------------------------------------------------------------
| MAIN RUNNER
|--------------------------------------------------------------------------
*/

async function runCourseLifecycle({
  includeCandidates =
    true,

  reason =
    "SCHEDULED",
} = {}) {
  if (
    lifecycleJobRunning
  ) {
    console.log(
      "[CourseLifecycle] Previous run still active. Skipping overlapping run."
    );

    return {
      skipped:
        true,

      reason:
        "ALREADY_RUNNING",
    };
  }

  lifecycleJobRunning =
    true;

  const referenceDate =
    todayDate();

  try {
    const courseIds =
      new Set();

    /*
    |--------------------------------------------------------------------------
    | AUTOMATIC CANDIDATES
    |--------------------------------------------------------------------------
    */

    if (
      includeCandidates
    ) {
      const candidates =
        await findLifecycleCandidateIds(
          referenceDate
        );

      for (
        const id
        of candidates
      ) {
        courseIds.add(
          id
        );
      }
    }

    /*
    |--------------------------------------------------------------------------
    | IMMEDIATELY QUEUED COURSES
    |--------------------------------------------------------------------------
    */

    for (
      const id
      of pendingCourseIds
    ) {
      courseIds.add(
        id
      );
    }

    pendingCourseIds.clear();

    if (
      courseIds.size ===
      0
    ) {
      return {
        reference_date:
          referenceDate,

        processed:
          0,
      };
    }

    console.log(
      `[CourseLifecycle] Starting | ` +
        `Reason=${reason} | ` +
        `Courses=${courseIds.size} | ` +
        `Date=${referenceDate}`
    );

    const results =
      [];

    /*
    |--------------------------------------------------------------------------
    | SEQUENTIAL ON PURPOSE
    |--------------------------------------------------------------------------
    |
    | Avoid racing the same ZKBioTime employee ID across Courses.
    |--------------------------------------------------------------------------
    */

    for (
      const courseId
      of courseIds
    ) {
      const result =
        await reconcileOneCourse({
          courseId,

          referenceDate,

          reason,
        });

      results.push({
        course_id:
          courseId,

        success:
          Boolean(result),
      });
    }

    return {
      reference_date:
        referenceDate,

      processed:
        courseIds.size,

      results,
    };
  } catch (error) {
    console.error(
      "[CourseLifecycle] Scheduler run failed:",
      error.message
    );

    return {
      reference_date:
        referenceDate,

      processed:
        0,

      error:
        error.message,
    };
  } finally {
    lifecycleJobRunning =
      false;

    /*
    |--------------------------------------------------------------------------
    | COURSE MAY HAVE BEEN QUEUED WHILE JOB WAS RUNNING
    |--------------------------------------------------------------------------
    */

    if (
      pendingCourseIds.size >
      0
    ) {
      setImmediate(
        () => {
          runCourseLifecycle({
            includeCandidates:
              false,

            reason:
              "QUEUED",
          });
        }
      );
    }
  }
}

/*
|--------------------------------------------------------------------------
| IMMEDIATE COURSE TRIGGER
|--------------------------------------------------------------------------
*/

function queueCourseLifecycleReconcile(
  courseId
) {
  const id =
    normalizeCourseId(
      courseId
    );

  if (!id) {
    return false;
  }

  pendingCourseIds.add(
    id
  );

  setImmediate(
    () => {
      runCourseLifecycle({
        includeCandidates:
          false,

        reason:
          "COURSE_CHANGE",
      });
    }
  );

  return true;
}

/*
|--------------------------------------------------------------------------
| START
|--------------------------------------------------------------------------
*/

function startCourseLifecycleScheduler() {
  if (
    lifecycleIntervalId ||
    lifecycleInitialTimeoutId
  ) {
    return;
  }

  lifecycleInitialTimeoutId =
    setTimeout(
      () => {
        lifecycleInitialTimeoutId =
          null;

        runCourseLifecycle({
          includeCandidates:
            true,

          reason:
            "STARTUP",
        });
      },
      COURSE_LIFECYCLE_INITIAL_DELAY_MS
    );

  lifecycleIntervalId =
    setInterval(
      () => {
        runCourseLifecycle({
          includeCandidates:
            true,

          reason:
            "SCHEDULED",
        });
      },
      COURSE_LIFECYCLE_INTERVAL_MS
    );

  console.log(
    `[CourseLifecycle] Automatic scheduler enabled | ` +
      `IntervalSeconds=${COURSE_LIFECYCLE_INTERVAL_MS / 1000} | ` +
      `InitialDelaySeconds=${COURSE_LIFECYCLE_INITIAL_DELAY_MS / 1000}`
  );
}

/*
|--------------------------------------------------------------------------
| STOP
|--------------------------------------------------------------------------
*/

function stopCourseLifecycleScheduler() {
  if (
    lifecycleInitialTimeoutId
  ) {
    clearTimeout(
      lifecycleInitialTimeoutId
    );

    lifecycleInitialTimeoutId =
      null;
  }

  if (
    lifecycleIntervalId
  ) {
    clearInterval(
      lifecycleIntervalId
    );

    lifecycleIntervalId =
      null;
  }

  pendingCourseIds.clear();

  console.log(
    "[CourseLifecycle] Automatic scheduler stopped."
  );
}

/*
|--------------------------------------------------------------------------
| EXPORTS
|--------------------------------------------------------------------------
*/

module.exports = {
  findLifecycleCandidateIds,

  queueCourseLifecycleReconcile,

  runCourseLifecycle,

  startCourseLifecycleScheduler,

  stopCourseLifecycleScheduler,
};