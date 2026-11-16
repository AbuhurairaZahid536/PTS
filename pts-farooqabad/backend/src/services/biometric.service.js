const ExcelJS = require("exceljs");

const {
  pool,
} = require("../config/db");

const {
  getTransactions,
  getEmployees,
  getDevices,
  getDevice,
  createDevice,
  updateDevice,
  deleteDevice,
  clearDeviceCommands,
  clearDeviceCapture,
  clearDeviceAll,
  uploadDeviceAll,
  uploadDeviceTransactions,
  rebootDevices,
  enrollRemotely,
  resyncEmployeesToDevice,
  deleteBiometricTemplates,
} = require(
  "../integrations/zkbiotime/client"
);

/*
|--------------------------------------------------------------------------
| HELPERS
|--------------------------------------------------------------------------
*/

function extractRows(data) {
  if (!data) {
    return [];
  }

  if (Array.isArray(data)) {
    return data;
  }

  if (Array.isArray(data.data)) {
    return data.data;
  }

  if (Array.isArray(data.results)) {
    return data.results;
  }

  return [];
}

function extractCount(data) {
  return Number(
    data?.count ||
      data?.total ||
      data?.data?.count ||
      0
  );
}

function normalizeText(value) {
  if (
    value === undefined ||
    value === null
  ) {
    return null;
  }

  if (
    typeof value === "object"
  ) {
    return (
      value.alias ||
      value.name ||
      value.label ||
      value.emp_code ||
      value.sn ||
      null
    );
  }

  return String(value);
}

function normalizeId(value) {
  if (
    value === undefined ||
    value === null
  ) {
    return null;
  }

  if (
    typeof value === "object"
  ) {
    return (
      value.id ||
      value.pk ||
      value.emp ||
      null
    );
  }

  const number =
    Number(value);

  return Number.isFinite(number)
    ? number
    : null;
}

function normalizeDateTime(value) {
  if (!value) {
    return null;
  }

  return String(value)
    .replace("T", " ")
    .replace("Z", "")
    .slice(0, 19);
}

function getTransactionId(item) {
  return (
    item.id ||
    item.pk ||
    item.transaction_id ||
    null
  );
}

/*
|--------------------------------------------------------------------------
| MAP ZK TRANSACTION
|--------------------------------------------------------------------------
*/

function mapTransaction(item) {
  const employee =
    item.employee ||
    item.emp ||
    {};

  const department =
    item.department ||
    employee.department ||
    {};

  const position =
    item.position ||
    employee.position ||
    {};

  const terminal =
    item.terminal ||
    {};

  const transactionId =
    getTransactionId(item);

  if (!transactionId) {
    return null;
  }

  return {
    id:
      Number(transactionId),

    emp:
      normalizeId(
        item.emp ||
          employee.id
      ),

    emp_code:
      normalizeText(
        item.emp_code ||
          employee.emp_code
      ),

    first_name:
      normalizeText(
        item.first_name ||
          employee.first_name
      ),

    last_name:
      normalizeText(
        item.last_name ||
          employee.last_name
      ),

    department:
      normalizeText(
        item.department_name ||
          item.department ||
          employee.department
      ),

    position:
      normalizeText(
        item.position_name ||
          item.position ||
          employee.position
      ),

    punch_time:
      normalizeDateTime(
        item.punch_time
      ),

    punch_state:
      normalizeText(
        item.punch_state
      ),

    punch_state_display:
      normalizeText(
        item.punch_state_display ||
          item.punch_state_name
      ),

    verify_type:
      item.verify_type !==
        undefined &&
      item.verify_type !== null
        ? Number(
            typeof item.verify_type ===
              "object"
              ? item.verify_type.id
              : item.verify_type
          )
        : null,

    verify_type_display:
      normalizeText(
        item.verify_type_display ||
          item.verify_type_name
      ),

    work_code:
      normalizeText(
        item.work_code
      ),

    gps_location:
      normalizeText(
        item.gps_location
      ),

    area_alias:
      normalizeText(
        item.area_alias ||
          item.area
      ),

    terminal_sn:
      normalizeText(
        item.terminal_sn ||
          terminal.sn
      ),

    temperature:
      item.temperature ??
      null,

    is_mask:
      normalizeText(
        item.is_mask
      ),

    terminal_alias:
      normalizeText(
        item.terminal_alias ||
          terminal.alias
      ),

    upload_time:
      normalizeDateTime(
        item.upload_time
      ),

    longitude:
      item.longitude ??
      null,

    latitude:
      item.latitude ??
      null,
  };
}

/*
|--------------------------------------------------------------------------
| SAVE TRANSACTION
|--------------------------------------------------------------------------
*/

async function upsertTransaction(
  item,
  batchId
) {
  const transaction =
    mapTransaction(item);

  if (!transaction) {
    return false;
  }

  await pool.query(
    `
    INSERT INTO zkteco_transactions
    (
      id,
      emp,
      emp_code,
      first_name,
      last_name,
      department,
      position,
      punch_time,
      punch_state,
      punch_state_display,
      verify_type,
      verify_type_display,
      work_code,
      gps_location,
      area_alias,
      terminal_sn,
      temperature,
      is_mask,
      terminal_alias,
      upload_time,
      longitude,
      latitude,
      synced_at,
      sync_batch_id,
      sync_status,
      sync_error
    )
    VALUES
    (
      :id,
      :emp,
      :empCode,
      :firstName,
      :lastName,
      :department,
      :position,
      :punchTime,
      :punchState,
      :punchStateDisplay,
      :verifyType,
      :verifyTypeDisplay,
      :workCode,
      :gpsLocation,
      :areaAlias,
      :terminalSn,
      :temperature,
      :isMask,
      :terminalAlias,
      :uploadTime,
      :longitude,
      :latitude,
      NOW(),
      :batchId,
      'SYNCED',
      NULL
    )

    ON DUPLICATE KEY UPDATE

      emp =
        VALUES(emp),

      emp_code =
        VALUES(emp_code),

      first_name =
        VALUES(first_name),

      last_name =
        VALUES(last_name),

      department =
        VALUES(department),

      position =
        VALUES(position),

      punch_time =
        VALUES(punch_time),

      punch_state =
        VALUES(punch_state),

      punch_state_display =
        VALUES(punch_state_display),

      verify_type =
        VALUES(verify_type),

      verify_type_display =
        VALUES(verify_type_display),

      work_code =
        VALUES(work_code),

      gps_location =
        VALUES(gps_location),

      area_alias =
        VALUES(area_alias),

      terminal_sn =
        VALUES(terminal_sn),

      temperature =
        VALUES(temperature),

      is_mask =
        VALUES(is_mask),

      terminal_alias =
        VALUES(terminal_alias),

      upload_time =
        VALUES(upload_time),

      longitude =
        VALUES(longitude),

      latitude =
        VALUES(latitude),

      synced_at =
        NOW(),

      sync_batch_id =
        VALUES(sync_batch_id),

      sync_status =
        'SYNCED',

      sync_error =
        NULL
    `,
    {
      id:
        transaction.id,

      emp:
        transaction.emp,

      empCode:
        transaction.emp_code,

      firstName:
        transaction.first_name,

      lastName:
        transaction.last_name,

      department:
        transaction.department,

      position:
        transaction.position,

      punchTime:
        transaction.punch_time,

      punchState:
        transaction.punch_state,

      punchStateDisplay:
        transaction.punch_state_display,

      verifyType:
        Number.isFinite(
          transaction.verify_type
        )
          ? transaction.verify_type
          : null,

      verifyTypeDisplay:
        transaction.verify_type_display,

      workCode:
        transaction.work_code,

      gpsLocation:
        transaction.gps_location,

      areaAlias:
        transaction.area_alias,

      terminalSn:
        transaction.terminal_sn,

      temperature:
        transaction.temperature,

      isMask:
        transaction.is_mask,

      terminalAlias:
        transaction.terminal_alias,

      uploadTime:
        transaction.upload_time,

      longitude:
        transaction.longitude,

      latitude:
        transaction.latitude,

      batchId,
    }
  );

  return true;
}

/*
|--------------------------------------------------------------------------
| SYNC EXACT DATE
|--------------------------------------------------------------------------
*/

async function syncTransactionsByDate(
  date
) {
  const datePattern =
    /^\d{4}-\d{2}-\d{2}$/;

  if (!datePattern.test(date)) {
    throw new Error(
      "Date must be YYYY-MM-DD."
    );
  }

  const startTime =
    `${date} 00:00:00`;

  const endTime =
    `${date} 23:59:59`;

  const batchId =
    `TX-${date}-${Date.now()}`;

  let page = 1;
  const pageSize = 1000;

  let received = 0;
  let synced = 0;
  let failed = 0;

  const failures = [];

  while (true) {
    const response =
      await getTransactions({
        start_time:
          startTime,

        end_time:
          endTime,

        page,

        page_size:
          pageSize,
      });

    const rows =
      extractRows(response);

    const total =
      extractCount(response);

    if (!rows.length) {
      break;
    }

    received +=
      rows.length;

    for (
      const item of rows
    ) {
      try {
        const saved =
          await upsertTransaction(
            item,
            batchId
          );

        if (saved) {
          synced += 1;
        } else {
          failed += 1;

          failures.push({
            id:
              getTransactionId(
                item
              ),

            error:
              "Transaction ID missing.",
          });
        }
      } catch (error) {
        failed += 1;

        failures.push({
          id:
            getTransactionId(
              item
            ),

          error:
            error.message,
        });
      }
    }

    if (
      rows.length <
      pageSize
    ) {
      break;
    }

    if (
      total > 0 &&
      received >= total
    ) {
      break;
    }

    page += 1;
  }

  return {
    date,
    batch_id:
      batchId,

    received,
    synced,
    failed,
    failures,
  };
}

/*
|--------------------------------------------------------------------------
| LIST LOCAL TRANSACTIONS
|--------------------------------------------------------------------------
*/

async function listTransactions({
  date,
  startTime,
  endTime,
  search,
  department,
  position,
  terminalSn,
  punchState,
  verifyType,
  page = 1,
  pageSize = 50,
}) {
  const conditions = [];
  const params = {};

  if (date) {
    conditions.push(
      "DATE(punch_time) = :date"
    );

    params.date =
      date;
  }

  if (startTime) {
    conditions.push(
      "TIME(punch_time) >= :startTime"
    );

    params.startTime =
      startTime;
  }

  if (endTime) {
    conditions.push(
      "TIME(punch_time) <= :endTime"
    );

    params.endTime =
      endTime;
  }

  if (search) {
    conditions.push(`
      (
        emp_code LIKE :search
        OR first_name LIKE :search
        OR last_name LIKE :search
      )
    `);

    params.search =
      `%${search}%`;
  }

  if (department) {
    conditions.push(
      "department = :department"
    );

    params.department =
      department;
  }

  if (position) {
    conditions.push(
      "position = :position"
    );

    params.position =
      position;
  }

  if (terminalSn) {
    conditions.push(
      "terminal_sn = :terminalSn"
    );

    params.terminalSn =
      terminalSn;
  }

  if (punchState) {
    conditions.push(
      "punch_state = :punchState"
    );

    params.punchState =
      punchState;
  }

  if (
    verifyType !==
      undefined &&
    verifyType !== null &&
    verifyType !== ""
  ) {
    conditions.push(
      "verify_type = :verifyType"
    );

    params.verifyType =
      Number(verifyType);
  }

  const where =
    conditions.length
      ? `WHERE ${conditions.join(
          " AND "
        )}`
      : "";

  const safePage =
    Math.max(
      1,
      Number(page) || 1
    );

  const safePageSize =
    Math.min(
      500,
      Math.max(
        10,
        Number(pageSize) ||
          50
      )
    );

  const offset =
    (safePage - 1) *
    safePageSize;

  const [countRows] =
    await pool.query(
      `
      SELECT COUNT(*) AS total
      FROM zkteco_transactions
      ${where}
      `,
      params
    );

  const [rows] =
    await pool.query(
      `
      SELECT
        id,
        emp,
        emp_code,
        first_name,
        last_name,
        department,
        position,
        punch_time,
        punch_state,
        punch_state_display,
        verify_type,
        verify_type_display,
        work_code,
        area_alias,
        terminal_sn,
        terminal_alias,
        upload_time,
        synced_at,
        sync_batch_id,
        sync_status

      FROM zkteco_transactions

      ${where}

      ORDER BY
        punch_time DESC,
        id DESC

      LIMIT ${safePageSize}
      OFFSET ${offset}
      `,
      params
    );

  return {
    rows,

    pagination: {
      page:
        safePage,

      pageSize:
        safePageSize,

      total:
        Number(
          countRows[0]
            ?.total || 0
        ),
    },
  };
}

/*
|--------------------------------------------------------------------------
| FILTER OPTIONS
|--------------------------------------------------------------------------
*/

async function getTransactionFilters() {
  const [
    departments,
    positions,
    terminals,
    punchStates,
    verifyTypes,
  ] =
    await Promise.all([
      pool.query(`
        SELECT DISTINCT department AS value
        FROM zkteco_transactions
        WHERE department IS NOT NULL
          AND department <> ''
        ORDER BY department
      `),

      pool.query(`
        SELECT DISTINCT position AS value
        FROM zkteco_transactions
        WHERE position IS NOT NULL
          AND position <> ''
        ORDER BY position
      `),

      pool.query(`
        SELECT DISTINCT
          terminal_sn,
          terminal_alias
        FROM zkteco_transactions
        WHERE terminal_sn IS NOT NULL
          AND terminal_sn <> ''
        ORDER BY terminal_alias, terminal_sn
      `),

      pool.query(`
        SELECT DISTINCT
          punch_state,
          punch_state_display
        FROM zkteco_transactions
        WHERE punch_state IS NOT NULL
        ORDER BY punch_state
      `),

      pool.query(`
        SELECT DISTINCT
          verify_type,
          verify_type_display
        FROM zkteco_transactions
        WHERE verify_type IS NOT NULL
        ORDER BY verify_type
      `),
    ]);

  return {
    departments:
      departments[0],

    positions:
      positions[0],

    terminals:
      terminals[0],

    punch_states:
      punchStates[0],

    verify_types:
      verifyTypes[0],
  };
}

/*
|--------------------------------------------------------------------------
| EXCEL EXPORT
|--------------------------------------------------------------------------
*/

async function exportTransactions(
  filters
) {
  const conditions = [];
  const params = {};

  if (filters.date) {
    conditions.push(
      "DATE(punch_time) = :date"
    );

    params.date =
      filters.date;
  }

  if (filters.startTime) {
    conditions.push(
      "TIME(punch_time) >= :startTime"
    );

    params.startTime =
      filters.startTime;
  }

  if (filters.endTime) {
    conditions.push(
      "TIME(punch_time) <= :endTime"
    );

    params.endTime =
      filters.endTime;
  }

  if (filters.search) {
    conditions.push(`
      (
        emp_code LIKE :search
        OR first_name LIKE :search
        OR last_name LIKE :search
      )
    `);

    params.search =
      `%${filters.search}%`;
  }

  if (filters.department) {
    conditions.push(
      "department = :department"
    );

    params.department =
      filters.department;
  }

  if (filters.position) {
    conditions.push(
      "position = :position"
    );

    params.position =
      filters.position;
  }

  if (filters.terminalSn) {
    conditions.push(
      "terminal_sn = :terminalSn"
    );

    params.terminalSn =
      filters.terminalSn;
  }

  const where =
    conditions.length
      ? `WHERE ${conditions.join(
          " AND "
        )}`
      : "";

  const [rows] =
    await pool.query(
      `
      SELECT
        id,
        emp_code,
        first_name,
        last_name,
        department,
        position,
        punch_time,
        punch_state_display,
        verify_type_display,
        terminal_sn,
        terminal_alias,
        area_alias

      FROM zkteco_transactions

      ${where}

      ORDER BY
        punch_time ASC,
        id ASC
      `,
      params
    );

  const workbook =
    new ExcelJS.Workbook();

  const sheet =
    workbook.addWorksheet(
      "Transactions"
    );

  sheet.columns = [
    {
      header:
        "Transaction ID",
      key: "id",
      width: 16,
    },

    {
      header:
        "Employee ID",
      key: "emp_code",
      width: 18,
    },

    {
      header:
        "First Name",
      key: "first_name",
      width: 20,
    },

    {
      header:
        "Last Name",
      key: "last_name",
      width: 20,
    },

    {
      header:
        "Department",
      key: "department",
      width: 28,
    },

    {
      header:
        "Position",
      key: "position",
      width: 20,
    },

    {
      header:
        "Punch Time",
      key: "punch_time",
      width: 24,
    },

    {
      header:
        "Punch State",
      key:
        "punch_state_display",
      width: 18,
    },

    {
      header:
        "Verify Type",
      key:
        "verify_type_display",
      width: 20,
    },

    {
      header:
        "Device SN",
      key: "terminal_sn",
      width: 20,
    },

    {
      header:
        "Device",
      key:
        "terminal_alias",
      width: 24,
    },

    {
      header:
        "Area",
      key: "area_alias",
      width: 20,
    },
  ];

  rows.forEach((row) => {
    sheet.addRow(row);
  });

  sheet.getRow(1).font = {
    bold: true,
  };

  sheet.views = [
    {
      state:
        "frozen",
      ySplit:
        1,
    },
  ];

  sheet.autoFilter = {
    from:
      "A1",

    to:
      "L1",
  };

  return {
    workbook,
    total:
      rows.length,
  };
}

/*
|--------------------------------------------------------------------------
| DEVICE MANAGEMENT HELPERS
|--------------------------------------------------------------------------
|
| Device management stays inside the existing Biometric service so the
| Device Status page can act as the single PTS device-management surface.
|
| Only fields documented by the installed ZKBioTime terminal API are sent
| when creating/updating a terminal. This avoids accidentally forwarding
| UI-only fields or read-only response fields back to ZKBioTime.
|--------------------------------------------------------------------------
*/

function cleanDeviceText(value) {
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

function requireDeviceId(value) {
  const id = Number(value);

  if (
    !Number.isInteger(id) ||
    id <= 0
  ) {
    throw new Error(
      "A valid ZKBioTime device ID is required."
    );
  }

  return id;
}

function normalizeOptionalInteger(
  value,
  fieldName,
  {
    minimum = 0,
    maximum = null,
  } = {}
) {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return null;
  }

  const number = Number(value);

  if (
    !Number.isInteger(number) ||
    number < minimum ||
    (maximum !== null && number > maximum)
  ) {
    const rangeText =
      maximum !== null
        ? ` between ${minimum} and ${maximum}`
        : ` greater than or equal to ${minimum}`;

    throw new Error(
      `${fieldName} must be an integer${rangeText}.`
    );
  }

  return number;
}

function normalizeDeviceArea(value) {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return null;
  }

  const source =
    typeof value === "object"
      ? value.id ?? value.pk
      : value;

  const areaId = Number(source);

  if (
    !Number.isInteger(areaId) ||
    areaId <= 0
  ) {
    throw new Error(
      "Device area must be a valid ZKBioTime area ID."
    );
  }

  return areaId;
}

function buildDevicePayload(
  input = {}
) {
  const payload = {};

  const sn =
    cleanDeviceText(input.sn);

  const alias =
    cleanDeviceText(input.alias);

  const ipAddress =
    cleanDeviceText(
      input.ip_address ??
        input.ipAddress
    );

  if (!sn) {
    throw new Error(
      "Device serial number is required."
    );
  }

  if (!alias) {
    throw new Error(
      "Device name/alias is required."
    );
  }

  if (!ipAddress) {
    throw new Error(
      "Device IP address is required."
    );
  }

  payload.sn = sn;
  payload.alias = alias;
  payload.ip_address =
    ipAddress;

  const terminalTz =
    normalizeOptionalInteger(
      input.terminal_tz ??
        input.terminalTz,
      "terminal_tz"
    );

  if (terminalTz !== null) {
    payload.terminal_tz =
      terminalTz;
  }

  const heartbeat =
    normalizeOptionalInteger(
      input.heartbeat,
      "heartbeat",
      {
        minimum: 1,
      }
    );

  if (heartbeat !== null) {
    payload.heartbeat =
      heartbeat;
  }

  const area =
    normalizeDeviceArea(
      input.area ??
        input.area_id ??
        input.areaId
    );

  if (area !== null) {
    payload.area = area;
  }

  return payload;
}

function normalizeTerminalIds(
  values
) {
  const source =
    Array.isArray(values)
      ? values
      : [values];

  const ids =
    source
      .map((value) =>
        Number(
          typeof value === "object"
            ? value?.id ?? value?.pk
            : value
        )
      )
      .filter(
        (value) =>
          Number.isInteger(value) &&
          value > 0
      );

  const unique = [
    ...new Set(ids),
  ];

  if (!unique.length) {
    throw new Error(
      "At least one valid ZKBioTime device ID is required."
    );
  }

  return unique;
}

function requireObjectPayload(
  payload,
  operationName
) {
  if (
    !payload ||
    typeof payload !== "object" ||
    Array.isArray(payload)
  ) {
    throw new Error(
      `${operationName} requires a valid request payload.`
    );
  }

  return payload;
}

/*
|--------------------------------------------------------------------------
| DEVICE CRUD
|--------------------------------------------------------------------------
*/

async function getDeviceDetails(
  deviceId
) {
  return getDevice(
    requireDeviceId(deviceId)
  );
}

async function createManagedDevice(
  input
) {
  const payload =
    buildDevicePayload(input);

  return createDevice(
    payload
  );
}

async function updateManagedDevice(
  deviceId,
  input
) {
  const id =
    requireDeviceId(deviceId);

  const payload =
    buildDevicePayload(input);

  return updateDevice(
    id,
    payload
  );
}

async function removeManagedDevice(
  deviceId
) {
  const id =
    requireDeviceId(deviceId);

  await deleteDevice(id);

  return {
    deleted: true,
    device_id: id,
  };
}

/*
|--------------------------------------------------------------------------
| DEVICE COMMANDS
|--------------------------------------------------------------------------
*/

async function clearManagedDeviceCommands(
  terminalIds
) {
  return clearDeviceCommands(
    normalizeTerminalIds(
      terminalIds
    )
  );
}

async function clearManagedDeviceCapture(
  terminalIds
) {
  return clearDeviceCapture(
    normalizeTerminalIds(
      terminalIds
    )
  );
}

async function clearManagedDeviceAll(
  terminalIds
) {
  return clearDeviceAll(
    normalizeTerminalIds(
      terminalIds
    )
  );
}

async function uploadManagedDeviceAll(
  terminalIds
) {
  return uploadDeviceAll(
    normalizeTerminalIds(
      terminalIds
    )
  );
}

async function uploadManagedDeviceTransactions(
  terminalIds
) {
  return uploadDeviceTransactions(
    normalizeTerminalIds(
      terminalIds
    )
  );
}

async function rebootManagedDevices(
  terminalIds
) {
  return rebootDevices(
    normalizeTerminalIds(
      terminalIds
    )
  );
}

/*
|--------------------------------------------------------------------------
| REMOTE BIOMETRIC ENROLLMENT
|--------------------------------------------------------------------------
|
| ZKBioTime remote enrollment uses terminal serial number(s), unlike the
| normal device commands which use terminal database IDs. The frontend may
| send a device ID only; in that case resolve the serial from ZKBioTime here
| so the browser does not need to construct or guess the command payload.
|--------------------------------------------------------------------------
*/

async function remoteEnrollManagedDevice({
  device_id,
  deviceId,
  device_sn,
  deviceSn,
  emp_code,
  empCode,
  bio_type,
  bioType,
  finger = 0,
} = {}) {
  const terminalId =
    requireDeviceId(
      device_id ??
      deviceId
    );

  const serial =
    cleanDeviceText(
      device_sn ??
      deviceSn
    );

  const employeeCode =
    cleanDeviceText(
      emp_code ??
      empCode
    );

  if (!employeeCode) {
    const error = new Error(
      "Employee ID/code is required for remote enrollment."
    );
    error.statusCode = 400;
    error.code =
      "REMOTE_ENROLL_EMPLOYEE_REQUIRED";
    throw error;
  }

  const biometricType =
    String(
      bio_type ??
      bioType ??
      ""
    ).trim();

  if (
    ![
      "1",
      "2",
    ].includes(
      biometricType
    )
  ) {
    const error = new Error(
      "Remote enrollment biometric type must be 1 (Fingerprint) or 2 (VL Face)."
    );
    error.statusCode = 400;
    error.code =
      "REMOTE_ENROLL_BIO_TYPE_INVALID";
    throw error;
  }

  const fingerIndex =
    biometricType === "1"
      ? normalizeOptionalInteger(
          finger,
          "finger",
          {
            minimum: 0,
            maximum: 9,
          }
        )
      : 0;

  if (
    biometricType === "1" &&
    fingerIndex === null
  ) {
    const error = new Error(
      "Finger is required for fingerprint remote enrollment."
    );
    error.statusCode = 400;
    error.code =
      "REMOTE_ENROLL_FINGER_REQUIRED";
    throw error;
  }

  /*
  |--------------------------------------------------------------------------
  | EXACT NATIVE ZKBIOTIME 9.0.6 REMOTE-ENROLL FLOW
  |--------------------------------------------------------------------------
  |
  | Captured from the installed ZKBioTime UI:
  |
  | POST /iclock/terminal/action/
  | form-data:
  |   bio_type
  |   emp_code
  |   finger
  |   action_name = hex("TerminalEnrollRemotely")
  |   id          = terminal database ID
  |
  | The client wrapper handles authenticated web-session cookies + CSRF.
  | No EasyTimePro/public-API endpoint or serial-number fallback is used.
  |--------------------------------------------------------------------------
  */

  try {
    return await enrollRemotely({
      device_id:
        terminalId,

      bio_type:
        biometricType,

      emp_code:
        employeeCode,

      finger:
        biometricType === "1"
          ? fingerIndex
          : 0,
    });
  } catch (error) {
    const wrapped =
      new Error(
        `ZKBioTime remote enrollment failed for device ${terminalId}` +
        `${serial ? ` (${serial})` : ""}: ${error?.message || "Unknown ZKBioTime error."}`
      );

    wrapped.statusCode =
      424;

    wrapped.code =
      "ZKBIOTIME_REMOTE_ENROLL_FAILED";

    throw wrapped;
  }
}


/*
|--------------------------------------------------------------------------
| DEVICE-PAGE EMPLOYEE SEARCH
|--------------------------------------------------------------------------
|
| Device Management needs ZKBioTime internal numeric employee IDs for
| resync/template commands, while remote enrollment uses emp_code. Search
| ZKBioTime here so the browser never has to ask the operator for numeric
| internal IDs.
|--------------------------------------------------------------------------
*/

function normalizeEmployeeSearchPageSize(value) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return 25;
  }

  return Math.min(parsed, 50);
}

function employeeSearchRow(employee) {
  const department =
    employee?.department &&
    typeof employee.department === "object"
      ? employee.department
      : null;

  const position =
    employee?.position &&
    typeof employee.position === "object"
      ? employee.position
      : null;

  const firstName =
    cleanDeviceText(employee?.first_name) || "";

  const lastName =
    cleanDeviceText(employee?.last_name) || "";

  const fullName =
    cleanDeviceText(employee?.full_name) ||
    [firstName, lastName].filter(Boolean).join(" ") ||
    cleanDeviceText(employee?.nickname) ||
    "";

  return {
    id: Number(employee?.id) || employee?.id || null,
    emp_code:
      cleanDeviceText(employee?.emp_code) || "",
    first_name: firstName,
    last_name: lastName,
    name: fullName,
    department_id:
      Number(
        department?.id ??
        employee?.department_id
      ) || null,
    department_name:
      cleanDeviceText(
        department?.dept_name ??
        department?.name ??
        employee?.department_name
      ) || "",
    position_id:
      Number(
        position?.id ??
        employee?.position_id
      ) || null,
    position_name:
      cleanDeviceText(
        position?.position_name ??
        position?.name ??
        employee?.position_name ??
        employee?.position
      ) || "",
    enroll_sn:
      cleanDeviceText(employee?.enroll_sn) || "",
    fingerprint: employee?.fingerprint ?? "-",
    face: employee?.face ?? "-",
    vl_face: employee?.vl_face ?? "-",
    palm: employee?.palm ?? "-",
  };
}

async function searchLocalManagedEmployees({
  search,
  limit,
}) {
  const normalized =
    String(search || "").trim();

  const params = [];
  let where = "";

  if (normalized) {
    const like = `%${normalized}%`;

    where = `
      WHERE (
        emp_code LIKE ?
        OR first_name LIKE ?
        OR last_name LIKE ?
        OR full_name LIKE ?
        OR CONCAT_WS(' ', first_name, last_name) LIKE ?
      )
    `;

    params.push(
      like,
      like,
      like,
      like,
      like
    );
  }

  const rankSql = normalized
    ? `
      CASE
        WHEN LOWER(emp_code) = LOWER(?) THEN 0
        WHEN LOWER(emp_code) LIKE LOWER(?) THEN 1
        WHEN LOWER(CONCAT_WS(' ', first_name, last_name)) LIKE LOWER(?) THEN 2
        ELSE 3
      END,
    `
    : "";

  if (normalized) {
    params.push(
      normalized,
      `${normalized}%`,
      `${normalized}%`
    );
  }

  params.push(limit);

  const [rows] =
    await pool.execute(
      `
        SELECT
          id,
          emp_code,
          first_name,
          last_name,
          nickname,
          full_name,
          department_id,
          department_name,
          position_id,
          position_name,
          position,
          enroll_sn,
          fingerprint,
          face,
          vl_face,
          palm,
          last_synced_at
        FROM zkteco_employees
        ${where}
        ORDER BY
          ${rankSql}
          emp_code ASC
        LIMIT ?
      `,
      params
    );

  return (rows || []).map(
    employeeSearchRow
  );
}

async function searchManagedEmployees({
  query = "",
  pageSize = 25,
} = {}) {
  const search = String(query || "").trim();
  const limit = normalizeEmployeeSearchPageSize(pageSize);

  /*
  | FAST PATH
  | ---------
  | PTS already mirrors ZKBioTime employees in `zkteco_employees`. Searching
  | ~2k local rows is dramatically faster than issuing 3-5 remote HTTP calls
  | for every key stroke. Live ZKBioTime remains the fallback if the mirror
  | is unavailable or has no match.
  */
  try {
    const localRows =
      await searchLocalManagedEmployees({
        search,
        limit,
      });

    if (
      localRows.length ||
      !search
    ) {
      return localRows;
    }
  } catch (_localSearchError) {
    /* Fall through to live ZKBioTime search. */
  }

  let responses = [];

  if (!search) {
    responses = [
      await getEmployees({
        page: 1,
        page_size: limit,
      }),
    ];
  } else {
    const terms = search
      .split(/\s+/)
      .map((term) => term.trim())
      .filter(Boolean);

    const codeLike =
      /\d/.test(search) ||
      /[-_/]/.test(search);

    if (codeLike) {
      /* Cap No./Employee ID searches need only one upstream request. */
      responses = [
        await getEmployees({
          page: 1,
          page_size: limit,
          emp_code_icontains: search,
        }),
      ];
    } else if (terms.length > 1) {
      responses = await Promise.all([
        getEmployees({
          page: 1,
          page_size: limit,
          first_name_icontains: terms[0],
        }),
        getEmployees({
          page: 1,
          page_size: limit,
          last_name_icontains:
            terms[terms.length - 1],
        }),
      ]);
    } else {
      /* One word can be a code or either half of a name. */
      responses = await Promise.all([
        getEmployees({
          page: 1,
          page_size: limit,
          emp_code_icontains: search,
        }),
        getEmployees({
          page: 1,
          page_size: limit,
          first_name_icontains: search,
        }),
        getEmployees({
          page: 1,
          page_size: limit,
          last_name_icontains: search,
        }),
      ]);
    }
  }

  const unique = new Map();

  responses.forEach((response) => {
    extractRows(response).forEach((employee) => {
      const id = Number(employee?.id);
      const code = cleanDeviceText(employee?.emp_code);
      const key =
        Number.isInteger(id) && id > 0
          ? `ID:${id}`
          : code
          ? `CODE:${code}`
          : null;

      if (key && !unique.has(key)) {
        unique.set(key, employeeSearchRow(employee));
      }
    });
  });

  const normalizedSearch = search.toLowerCase();

  const rank = (record) => {
    if (!normalizedSearch) return 0;

    const code = String(record?.emp_code || "").toLowerCase();
    const name = String(record?.name || "").toLowerCase();

    if (code === normalizedSearch) return 0;
    if (code.startsWith(normalizedSearch)) return 1;
    if (name.startsWith(normalizedSearch)) return 2;
    if (code.includes(normalizedSearch)) return 3;
    if (name.includes(normalizedSearch)) return 4;
    return 5;
  };

  const searchTerms = normalizedSearch
    .split(/\s+/)
    .filter(Boolean);

  return [...unique.values()]
    .filter((record) => {
      if (!searchTerms.length) return true;

      const haystack = [
        record?.emp_code,
        record?.name,
        record?.department_name,
        record?.position_name,
      ]
        .filter(Boolean)
        .join(" " )
        .toLowerCase();

      return searchTerms.every(
        (term) => haystack.includes(term)
      );
    })
    .sort((a, b) => {
      const rankDiff = rank(a) - rank(b);
      if (rankDiff) return rankDiff;

      return String(a?.emp_code || "").localeCompare(
        String(b?.emp_code || ""),
        undefined,
        { numeric: true }
      );
    })
    .slice(0, limit);
}

/*
|--------------------------------------------------------------------------
| EMPLOYEE / TEMPLATE DEVICE ACTIONS
|--------------------------------------------------------------------------
|
| These two ZKBioTime endpoints differ slightly across releases. Do not
| invent or reshape their version-specific body here. The controller will
| pass only the payload verified for the installed 9.0.6 build.
|--------------------------------------------------------------------------
*/

async function resyncManagedEmployeesToDevice(
  payload
) {
  return resyncEmployeesToDevice(
    requireObjectPayload(
      payload,
      "Employee resync"
    )
  );
}

async function deleteManagedBiometricTemplates(
  payload
) {
  return deleteBiometricTemplates(
    requireObjectPayload(
      payload,
      "Biometric template delete"
    )
  );
}

/*
|--------------------------------------------------------------------------
| LIVE DEVICE STATUS
|--------------------------------------------------------------------------
*/

async function getDeviceStatus() {
  let page = 1;
  const pageSize = 500;

  const devices = [];

  while (true) {
    const response =
      await getDevices({
        page,
        page_size:
          pageSize,
      });

    const rows =
      extractRows(response);

    if (!rows.length) {
      break;
    }

    devices.push(
      ...rows
    );

    const total =
      extractCount(response);

    if (
      rows.length <
      pageSize
    ) {
      break;
    }

    if (
      total &&
      devices.length >= total
    ) {
      break;
    }

    page += 1;
  }

  return devices;
}

module.exports = {
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
};