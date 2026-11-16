const {
  syncTransactionsByDate,
  listTransactions,
  getTransactionFilters,
  exportTransactions,
  getDeviceStatus,
  getDeviceDetails,
  createManagedDevice,
  updateManagedDevice,
  removeManagedDevice,
  clearManagedDeviceCommands,
  clearManagedDeviceCapture,
  clearManagedDeviceAll,
  uploadManagedDeviceAll,
  uploadManagedDeviceTransactions,
  rebootManagedDevices,
  remoteEnrollManagedDevice,
  searchManagedEmployees,
  resyncManagedEmployeesToDevice,
  deleteManagedBiometricTemplates,
} = require(
  "../services/biometric.service"
);

const {
  syncRecentTransactions,
} = require(
  "../services/biometricLive.service"
);

const {
  processAttendanceDate,
} = require(
  "../services/attendanceEngine.service"
);

const {
  syncContinuousAbsenceForDate,
} = require(
  "../services/absenceEpisode.service"
);

const {
  syncAllEmployees,
} = require(
  "../integrations/zkbiotime/employeeSync.service"
);

const {
  runSingleFlight,
} = require(
  "../integrations/zkbiotime/syncCoordinator"
);


/*
|--------------------------------------------------------------------------
| SINGLE-FLIGHT KEYS
|--------------------------------------------------------------------------
|
| Same backend instance par:
|
| 20 browsers master sync request bhejein
|      → ONE master sync
|
| 20 browsers live transaction sync bhejein
|      → ONE transaction sync
|
| Manual sync aur live sync ek hi waqt aayein
|      → ZKBioTime transaction API parallel hit nahi hogi.
|
|--------------------------------------------------------------------------
*/

const MASTER_SYNC_KEY =
  "zk-employee-master-sync";

const TRANSACTION_SYNC_KEY =
  "zk-current-transaction-sync";

const DEVICE_STATUS_KEY =
  "zk-device-status";


/*
|--------------------------------------------------------------------------
| ATTENDANCE REFRESH STATE
|--------------------------------------------------------------------------
*/

let attendanceRefreshPending =
  true;


/*
|--------------------------------------------------------------------------
| LOCAL DATE
|--------------------------------------------------------------------------
*/

function getLocalDateString() {
  /*
  | ZKBioTime / PTS operational date is Pakistan local date. The production
  | Node process may run in UTC, especially inside Docker, so do not use the
  | server's local Date getters here.
  */

  const parts =
    new Intl.DateTimeFormat(
      "en-US",
      {
        timeZone:
          "Asia/Karachi",
        year:
          "numeric",
        month:
          "2-digit",
        day:
          "2-digit",
      }
    ).formatToParts(
      new Date()
    );

  const values = {};

  parts.forEach((part) => {
    if (
      part.type === "year" ||
      part.type === "month" ||
      part.type === "day"
    ) {
      values[part.type] =
        part.value;
    }
  });

  return `${values.year}-${values.month}-${values.day}`;
}


/*
|--------------------------------------------------------------------------
| PROCESS CURRENT ATTENDANCE
|--------------------------------------------------------------------------
*/

async function processCurrentAttendance(
  date
) {
  const attendance =
    await processAttendanceDate({
      attendanceDate:
        date,

      subjectType:
        null,
    });

  /*
  |------------------------------------------------------------------------
  | IMMEDIATE CONTINUOUS-ABSENCE RECONCILIATION
  |------------------------------------------------------------------------
  |
  | A newly synced biometric punch can close an OPEN continuous absence even
  | when the punch is outside the original attendance window. Reconcile here
  | immediately after attendance refresh instead of waiting for the next
  | scheduler minute. This keeps Dashboard, Reports and Profile aligned.
  |------------------------------------------------------------------------
  */

  try {
    const continuousAbsence =
      await syncContinuousAbsenceForDate(
        date
      );

    return {
      ...attendance,

      continuous_absence:
        continuousAbsence,
    };
  } catch (error) {
    console.error(
      "[ZKBioTime Live Sync] Continuous absence reconciliation failed after attendance refresh.",
      {
        attendance_date:
          date,

        message:
          error?.message ||
          String(error),
      }
    );

    return {
      ...attendance,

      continuous_absence:
        null,

      continuous_absence_error:
        error?.message ||
        String(error),
    };
  }
}


/*
|--------------------------------------------------------------------------
| EMPLOYEE MASTER SYNC
|--------------------------------------------------------------------------
*/

async function executeEmployeeMasterSync() {
  const startedAt =
    new Date();

  console.log(
    "[ZKBioTime Master Sync] Started."
  );

  const result =
    await syncAllEmployees();

  const completedAt =
    new Date();

  const durationMs =
    completedAt.getTime() -
    startedAt.getTime();

  console.log(
    "[ZKBioTime Master Sync] Completed.",
    {
      processed:
        Number(
          result?.processed ||
            0
        ),

      trainee_created:
        Number(
          result
            ?.trainee_created ||
            0
        ),

      trainee_updated:
        Number(
          result
            ?.trainee_updated ||
            0
        ),

      staff_created:
        Number(
          result
            ?.staff_created ||
            0
        ),

      staff_updated:
        Number(
          result
            ?.staff_updated ||
            0
        ),

      conflicts:
        Number(
          result?.conflicts ||
            0
        ),

      failed:
        Number(
          result?.failed ||
            0
        ),

      duration_ms:
        durationMs,
    }
  );

  return {
    ...result,

    started_at:
      startedAt.toISOString(),

    completed_at:
      completedAt.toISOString(),

    duration_ms:
      durationMs,
  };
}


/*
|--------------------------------------------------------------------------
| RUN EMPLOYEE MASTER SINGLE-FLIGHT
|--------------------------------------------------------------------------
*/

function runEmployeeMasterSync() {
  return runSingleFlight(
    MASTER_SYNC_KEY,

    executeEmployeeMasterSync
  );
}


/*
|--------------------------------------------------------------------------
| EMPLOYEE MASTER ENDPOINT
|--------------------------------------------------------------------------
*/

async function syncEmployeeMaster(
  req,
  res,
  next
) {
  try {
    const result =
      await runEmployeeMasterSync();

    const failed =
      Number(
        result?.failed ||
          0
      );

    const conflicts =
      Number(
        result?.conflicts ||
          0
      );

    return res.json({
      success:
        failed === 0 &&
        conflicts === 0,

      message:
        failed === 0 &&
        conflicts === 0
          ? "ZKBioTime employee master sync completed successfully."
          : "ZKBioTime employee master sync completed with warnings.",

      /*
      |--------------------------------------------------------------------------
      | IMPORTANT
      |--------------------------------------------------------------------------
      |
      | Existing syncAllEmployees() ka actual result preserve kar rahe hain.
      | Kisi field ko invent/rebuild nahi kar rahe.
      |
      |--------------------------------------------------------------------------
      */

      data:
        result,
    });
  } catch (
    error
  ) {
    console.error(
      "[ZKBioTime Master Sync] Failed:",
      error?.message ||
        error
    );

    return next(
      error
    );
  }
}


/*
|--------------------------------------------------------------------------
| LIVE TRANSACTION PIPELINE
|--------------------------------------------------------------------------
*/

async function executeLivePipeline() {
  const date =
    getLocalDateString();

  /*
  |--------------------------------------------------------------------------
  | STEP 1
  | ZKBioTime → local transaction database
  |--------------------------------------------------------------------------
  */

  const syncResult =
    await syncRecentTransactions();

  const inserted =
    Number(
      syncResult?.inserted ||
        0
    );

  const failed =
    Number(
      syncResult?.failed ||
        0
    );


  /*
  |--------------------------------------------------------------------------
  | New punch means attendance may be stale
  |--------------------------------------------------------------------------
  */

  if (
    inserted >
    0
  ) {
    attendanceRefreshPending =
      true;
  }


  /*
  |--------------------------------------------------------------------------
  | Partial biometric failure
  |--------------------------------------------------------------------------
  */

  if (
    failed >
    0
  ) {
    attendanceRefreshPending =
      true;

    return {
      ...syncResult,

      sync_mode:
        "LIVE",

      attendance_date:
        date,

      attendance_recalculated:
        false,

      attendance_pending:
        true,

      attendance_summary:
        null,
    };
  }


  /*
  |--------------------------------------------------------------------------
  | Attendance calculation
  |--------------------------------------------------------------------------
  */

  let attendanceSummary =
    null;

  let attendanceRecalculated =
    false;

  if (
    attendanceRefreshPending
  ) {
    attendanceSummary =
      await processCurrentAttendance(
        date
      );

    attendanceRefreshPending =
      false;

    attendanceRecalculated =
      true;
  }


  return {
    ...syncResult,

    sync_mode:
      "LIVE",

    attendance_date:
      date,

    attendance_recalculated:
      attendanceRecalculated,

    attendance_pending:
      attendanceRefreshPending,

    attendance_summary:
      attendanceSummary,
  };
}


/*
|--------------------------------------------------------------------------
| MANUAL FULL CURRENT-DATE PIPELINE
|--------------------------------------------------------------------------
*/

async function executeManualPipeline(
  date
) {
  /*
  |--------------------------------------------------------------------------
  | STEP 1
  | Full current date ZKBioTime transaction sync
  |--------------------------------------------------------------------------
  */

  const result =
    await syncTransactionsByDate(
      date
    );

  const failed =
    Number(
      result?.failed ||
        0
    );

  let attendanceSummary =
    null;

  let attendanceRecalculated =
    false;


  /*
  |--------------------------------------------------------------------------
  | STEP 2
  | Attendance calculation after successful full sync
  |--------------------------------------------------------------------------
  */

  if (
    failed ===
    0
  ) {
    attendanceSummary =
      await processCurrentAttendance(
        date
      );

    attendanceRefreshPending =
      false;

    attendanceRecalculated =
      true;
  } else {
    attendanceRefreshPending =
      true;
  }


  return {
    ...result,

    sync_mode:
      "MANUAL",

    attendance_date:
      date,

    attendance_recalculated:
      attendanceRecalculated,

    attendance_pending:
      attendanceRefreshPending,

    attendance_summary:
      attendanceSummary,
  };
}


/*
|--------------------------------------------------------------------------
| SHARED TRANSACTION SINGLE-FLIGHT
|--------------------------------------------------------------------------
|
| LIVE and MANUAL both use SAME key.
|
| Result:
|
| Browser A → live sync starts
| Browser B → live sync
| Browser C → live sync
|
| B/C same running Promise wait karenge.
|
| Manual sync agar live ke waqt aaye:
| pehle running transaction work complete hoga.
| us ke baad manual full sync chalega.
|
|--------------------------------------------------------------------------
*/

function runLiveTransactionSync() {
  return runSingleFlight(
    TRANSACTION_SYNC_KEY,

    executeLivePipeline
  );
}


/*
|--------------------------------------------------------------------------
| RUN MANUAL TRANSACTION SYNC
|--------------------------------------------------------------------------
|
| Agar current running task LIVE thi to us result ko manual result nahi
| samjhenge. Running live task complete hone ke baad manual full sync start
| karenge.
|
|--------------------------------------------------------------------------
*/

async function runManualTransactionSync(
  date
) {
  while (true) {
    const result =
      await runSingleFlight(
        TRANSACTION_SYNC_KEY,

        () =>
          executeManualPipeline(
            date
          )
      );

    /*
    |--------------------------------------------------------------------------
    | We actually received MANUAL full-sync result
    |--------------------------------------------------------------------------
    */

    if (
      result?.sync_mode ===
      "MANUAL"
    ) {
      return result;
    }


    /*
    |--------------------------------------------------------------------------
    | A LIVE transaction sync was already running.
    |
    | We waited for it.
    | Loop now requests the manual full sync again after lock release.
    |--------------------------------------------------------------------------
    */

    await new Promise(
      (resolve) =>
        setImmediate(
          resolve
        )
    );
  }
}


/*
|--------------------------------------------------------------------------
| MANUAL CURRENT-DATE SYNC ENDPOINT
|--------------------------------------------------------------------------
*/

async function syncTransactions(
  req,
  res,
  next
) {
  try {
    const date =
      req.body?.date;

    if (!date) {
      return res
        .status(400)
        .json({
          success:
            false,

          message:
            "Date is required.",
        });
    }

    const today =
      getLocalDateString();

    if (
      date !==
      today
    ) {
      return res
        .status(400)
        .json({
          success:
            false,

          message:
            "Manual ZKBioTime sync sirf current date ke liye allowed hai. Previous dates local database history se load hoti hain.",
        });
    }


    const result =
      await runManualTransactionSync(
        date
      );

    const failed =
      Number(
        result?.failed ||
          0
      );


    return res.json({
      success:
        failed === 0,

      message:
        failed === 0
          ? `Current-date sync and attendance calculation completed. ${result.synced || 0} transaction(s) processed.`
          : `Current-date biometric sync completed with ${failed} failure(s). Attendance will retry after the next successful sync.`,

      data:
        result,
    });
  } catch (
    error
  ) {
    attendanceRefreshPending =
      true;

    return next(
      error
    );
  }
}


/*
|--------------------------------------------------------------------------
| AUTOMATIC LIVE TRANSACTION SYNC ENDPOINT
|--------------------------------------------------------------------------
*/

async function syncLiveTransactions(
  req,
  res,
  next
) {
  try {
    const result =
      await runLiveTransactionSync();

    const failed =
      Number(
        result?.failed ||
          0
      );


    /*
    |--------------------------------------------------------------------------
    | A manual sync may already have been running.
    |
    | In that case live request safely shares its result instead of hitting
    | ZKBioTime again.
    |--------------------------------------------------------------------------
    */

    let message;

    if (
      result?.sync_mode ===
      "MANUAL"
    ) {
      message =
        "Current-date transaction sync already completed by another active sync request.";
    } else if (
      result
        ?.attendance_recalculated
    ) {
      message =
        `${result.inserted || 0} new transaction(s) synced and attendance updated.`;
    } else {
      message =
        `${result.inserted || 0} new transaction(s), ${result.refreshed || 0} existing transaction(s) refreshed.`;
    }


    return res.json({
      success:
        failed === 0,

      message,

      data:
        result,
    });
  } catch (
    error
  ) {
    attendanceRefreshPending =
      true;

    return next(
      error
    );
  }
}


/*
|--------------------------------------------------------------------------
| TRANSACTIONS FROM LOCAL DATABASE
|--------------------------------------------------------------------------
|
| Is endpoint se ZKBioTime API hit nahi hoti.
|
|--------------------------------------------------------------------------
*/

async function transactions(
  req,
  res,
  next
) {
  try {
    const result =
      await listTransactions({
        date:
          req.query.date ||
          null,

        startTime:
          req.query.start_time ||
          null,

        endTime:
          req.query.end_time ||
          null,

        search:
          req.query.search ||
          "",

        department:
          req.query.department ||
          null,

        position:
          req.query.position ||
          null,

        terminalSn:
          req.query.terminal_sn ||
          null,

        punchState:
          req.query.punch_state ||
          null,

        verifyType:
          req.query.verify_type,

        page:
          req.query.page ||
          1,

        pageSize:
          req.query.page_size ||
          50,
      });


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
| TRANSACTION FILTERS
|--------------------------------------------------------------------------
*/

async function filters(
  req,
  res,
  next
) {
  try {
    const result =
      await getTransactionFilters();

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
| EXPORT
|--------------------------------------------------------------------------
*/

async function exportExcel(
  req,
  res,
  next
) {
  try {
    const result =
      await exportTransactions({
        date:
          req.query.date ||
          null,

        startTime:
          req.query.start_time ||
          null,

        endTime:
          req.query.end_time ||
          null,

        search:
          req.query.search ||
          "",

        department:
          req.query.department ||
          null,

        position:
          req.query.position ||
          null,

        terminalSn:
          req.query.terminal_sn ||
          null,
      });


    const filename =
      req.query.date
        ? `ZKBioTime_Transactions_${req.query.date}.xlsx`
        : "ZKBioTime_Transactions.xlsx";


    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );

    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${filename}"`
    );


    await result
      .workbook
      .xlsx
      .write(
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
| DEVICE STATUS
|--------------------------------------------------------------------------
|
| Dashboard multiple users se ek hi waqt device status request aaye to
| overlapping ZKBioTime device status calls share hongi.
|
| Ye cache nahi hai.
|
| Running request complete hone ke baad next request fresh status fetch
| kar sakti hai.
|--------------------------------------------------------------------------
*/

function runDeviceStatusFetch() {
  return runSingleFlight(
    DEVICE_STATUS_KEY,

    getDeviceStatus
  );
}


async function devices(
  req,
  res,
  next
) {
  try {
    const result =
      await runDeviceStatusFetch();

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
| DEVICE MANAGEMENT
|--------------------------------------------------------------------------
|
| Device Status is the single PTS surface for terminal management. These
| controllers intentionally stay thin: validation and ZKBioTime payload
| shaping live in biometric.service.js, while permissions live in routes.
|
|--------------------------------------------------------------------------
*/

function requestedTerminalIds(
  req
) {
  return (
    req.body?.terminals ??
    req.body?.terminal_ids ??
    req.body?.device_ids ??
    req.body?.device_id ??
    req.params?.id
  );
}

async function deviceDetails(
  req,
  res,
  next
) {
  try {
    const result =
      await getDeviceDetails(
        req.params.id
      );

    return res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    return next(error);
  }
}

async function createDevice(
  req,
  res,
  next
) {
  try {
    const result =
      await createManagedDevice(
        req.body || {}
      );

    return res
      .status(201)
      .json({
        success: true,
        message:
          "Device created in ZKBioTime successfully.",
        data: result,
      });
  } catch (error) {
    return next(error);
  }
}

async function updateDevice(
  req,
  res,
  next
) {
  try {
    const result =
      await updateManagedDevice(
        req.params.id,
        req.body || {}
      );

    return res.json({
      success: true,
      message:
        "Device updated in ZKBioTime successfully.",
      data: result,
    });
  } catch (error) {
    return next(error);
  }
}

async function deleteDevice(
  req,
  res,
  next
) {
  try {
    const result =
      await removeManagedDevice(
        req.params.id
      );

    return res.json({
      success: true,
      message:
        "Device deleted from ZKBioTime successfully.",
      data: result,
    });
  } catch (error) {
    return next(error);
  }
}

async function clearDeviceCommands(
  req,
  res,
  next
) {
  try {
    const result =
      await clearManagedDeviceCommands(
        requestedTerminalIds(req)
      );

    return res.json({
      success: true,
      message:
        "Pending device command queue cleared successfully.",
      data: result,
    });
  } catch (error) {
    return next(error);
  }
}

async function clearDeviceCapture(
  req,
  res,
  next
) {
  try {
    const result =
      await clearManagedDeviceCapture(
        requestedTerminalIds(req)
      );

    return res.json({
      success: true,
      message:
        "Device capture data clear command sent successfully.",
      data: result,
    });
  } catch (error) {
    return next(error);
  }
}

async function clearDeviceAll(
  req,
  res,
  next
) {
  try {
    const result =
      await clearManagedDeviceAll(
        requestedTerminalIds(req)
      );

    return res.json({
      success: true,
      message:
        "Clear-all command sent to selected device(s).",
      data: result,
    });
  } catch (error) {
    return next(error);
  }
}

async function uploadDeviceAll(
  req,
  res,
  next
) {
  try {
    const result =
      await uploadManagedDeviceAll(
        requestedTerminalIds(req)
      );

    return res.json({
      success: true,
      message:
        "Upload-all command sent to selected device(s).",
      data: result,
    });
  } catch (error) {
    return next(error);
  }
}

async function uploadDeviceTransactions(
  req,
  res,
  next
) {
  try {
    const result =
      await uploadManagedDeviceTransactions(
        requestedTerminalIds(req)
      );

    return res.json({
      success: true,
      message:
        "Transaction upload command sent to selected device(s).",
      data: result,
    });
  } catch (error) {
    return next(error);
  }
}

async function rebootDevices(
  req,
  res,
  next
) {
  try {
    const result =
      await rebootManagedDevices(
        requestedTerminalIds(req)
      );

    return res.json({
      success: true,
      message:
        "Reboot command sent to selected device(s).",
      data: result,
    });
  } catch (error) {
    return next(error);
  }
}

async function enrollDeviceRemotely(
  req,
  res,
  next
) {
  try {
    const payload = {
      ...(req.body || {}),
    };

    if (
      req.params?.id &&
      payload.device_id === undefined &&
      payload.deviceId === undefined &&
      payload.device_sn === undefined &&
      payload.deviceSn === undefined
    ) {
      payload.device_id =
        req.params.id;
    }

    const result =
      await remoteEnrollManagedDevice(
        payload
      );

    return res.json({
      success: true,
      message:
        "Remote biometric enrollment command sent to the device.",
      data: result,
    });
  } catch (error) {
    return next(error);
  }
}

async function searchDeviceEmployees(
  req,
  res,
  next
) {
  try {
    const result = await searchManagedEmployees({
      query:
        req.query.q ??
        req.query.search ??
        "",
      pageSize:
        req.query.page_size ??
        25,
    });

    return res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    return next(error);
  }
}

async function resyncEmployeesToDevice(
  req,
  res,
  next
) {
  try {
    const result =
      await resyncManagedEmployeesToDevice(
        req.body
      );

    return res.json({
      success: true,
      message:
        "Employee resync-to-device command sent successfully.",
      data: result,
    });
  } catch (error) {
    return next(error);
  }
}

async function deleteBiometricTemplates(
  req,
  res,
  next
) {
  try {
    const result =
      await deleteManagedBiometricTemplates(
        req.body
      );

    return res.json({
      success: true,
      message:
        "Biometric template delete command sent successfully.",
      data: result,
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
  syncEmployeeMaster,

  syncTransactions,
  syncLiveTransactions,

  transactions,
  filters,
  exportExcel,

  devices,
  deviceDetails,
  createDevice,
  updateDevice,
  deleteDevice,

  clearDeviceCommands,
  clearDeviceCapture,
  clearDeviceAll,
  uploadDeviceAll,
  uploadDeviceTransactions,
  rebootDevices,

  enrollDeviceRemotely,
  searchDeviceEmployees,
  resyncEmployeesToDevice,
  deleteBiometricTemplates,
};