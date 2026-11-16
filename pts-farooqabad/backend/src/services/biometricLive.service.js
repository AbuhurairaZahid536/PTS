const { pool } = require("../config/db");
const { getTransactions } = require("../integrations/zkbiotime/client");

const LIVE_PAGE_SIZE = 500;

/*
|--------------------------------------------------------------------------
| LIVE WINDOW
|--------------------------------------------------------------------------
|
| ZKBioTime and PTS attendance use Pakistan local wall-clock time.
| Production containers commonly run in UTC, so JavaScript Date#getHours()
| must never be used to build the ZKBioTime start_time/end_time values.
|
| A five-minute overlap safely catches slightly delayed device uploads.
| Transaction IDs are upserted, so the overlap does not create duplicates.
|--------------------------------------------------------------------------
*/

const LIVE_OVERLAP_MINUTES = 5;

function extractRows(data) {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.data)) return data.data;
  if (Array.isArray(data.results)) return data.results;
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
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value === "object") {
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
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value === "object") {
    return (
      value.id ||
      value.pk ||
      value.emp ||
      null
    );
  }

  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : null;
}

function normalizeDateTime(value) {
  if (!value) return null;

  return String(value)
    .replace("T", " ")
    .replace("Z", "")
    .slice(0, 19);
}

function mapTransaction(item) {
  const employee =
    item.employee ||
    item.emp ||
    {};

  const terminal =
    item.terminal ||
    {};

  const transactionId =
    item.id ||
    item.pk ||
    item.transaction_id ||
    null;

  if (!transactionId) {
    return null;
  }

  const verifyValue =
    typeof item.verify_type === "object"
      ? item.verify_type?.id
      : item.verify_type;

  return {
    id: Number(transactionId),

    emp: normalizeId(
      item.emp ||
        employee.id
    ),

    emp_code: normalizeText(
      item.emp_code ||
        employee.emp_code
    ),

    first_name: normalizeText(
      item.first_name ||
        employee.first_name
    ),

    last_name: normalizeText(
      item.last_name ||
        employee.last_name
    ),

    department: normalizeText(
      item.department_name ||
        item.department ||
        employee.department
    ),

    position: normalizeText(
      item.position_name ||
        item.position ||
        employee.position
    ),

    punch_time: normalizeDateTime(
      item.punch_time
    ),

    punch_state: normalizeText(
      item.punch_state
    ),

    punch_state_display: normalizeText(
      item.punch_state_display ||
        item.punch_state_name
    ),

    verify_type:
      verifyValue !== undefined &&
      verifyValue !== null &&
      Number.isFinite(Number(verifyValue))
        ? Number(verifyValue)
        : null,

    verify_type_display: normalizeText(
      item.verify_type_display ||
        item.verify_type_name
    ),

    work_code: normalizeText(
      item.work_code
    ),

    gps_location: normalizeText(
      item.gps_location
    ),

    area_alias: normalizeText(
      item.area_alias ||
        item.area
    ),

    terminal_sn: normalizeText(
      item.terminal_sn ||
        terminal.sn
    ),

    temperature:
      item.temperature ?? null,

    is_mask: normalizeText(
      item.is_mask
    ),

    terminal_alias: normalizeText(
      item.terminal_alias ||
        terminal.alias
    ),

    upload_time: normalizeDateTime(
      item.upload_time
    ),

    longitude:
      item.longitude ?? null,

    latitude:
      item.latitude ?? null,
  };
}

async function upsertTransaction(
  item,
  batchId
) {
  const t =
    mapTransaction(item);

  if (!t) {
    return {
      saved: false,
      inserted: false,
      updated: false,
    };
  }

  const [result] =
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
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
        NOW(), ?, 'SYNCED', NULL
      )

      ON DUPLICATE KEY UPDATE
        emp = VALUES(emp),
        emp_code = VALUES(emp_code),
        first_name = VALUES(first_name),
        last_name = VALUES(last_name),
        department = VALUES(department),
        position = VALUES(position),
        punch_time = VALUES(punch_time),
        punch_state = VALUES(punch_state),
        punch_state_display = VALUES(punch_state_display),
        verify_type = VALUES(verify_type),
        verify_type_display = VALUES(verify_type_display),
        work_code = VALUES(work_code),
        gps_location = VALUES(gps_location),
        area_alias = VALUES(area_alias),
        terminal_sn = VALUES(terminal_sn),
        temperature = VALUES(temperature),
        is_mask = VALUES(is_mask),
        terminal_alias = VALUES(terminal_alias),
        upload_time = VALUES(upload_time),
        longitude = VALUES(longitude),
        latitude = VALUES(latitude),
        synced_at = NOW(),
        sync_batch_id = VALUES(sync_batch_id),
        sync_status = 'SYNCED',
        sync_error = NULL
      `,
      [
        t.id,
        t.emp,
        t.emp_code,
        t.first_name,
        t.last_name,
        t.department,
        t.position,
        t.punch_time,
        t.punch_state,
        t.punch_state_display,
        t.verify_type,
        t.verify_type_display,
        t.work_code,
        t.gps_location,
        t.area_alias,
        t.terminal_sn,
        t.temperature,
        t.is_mask,
        t.terminal_alias,
        t.upload_time,
        t.longitude,
        t.latitude,
        batchId,
      ]
    );

  return {
    saved: true,

    inserted:
      result.affectedRows === 1,

    updated:
      result.affectedRows === 2 ||
      result.affectedRows === 0,
  };
}

async function getLiveStartPoint() {
  /*
  |--------------------------------------------------------------------------
  | IMPORTANT: KEEP THE WHOLE WINDOW IN PAKISTAN WALL-CLOCK TIME
  |--------------------------------------------------------------------------
  |
  | mysql2 is configured with dateStrings for DATETIME values, while the VPS
  | process may run in UTC. Converting a local MySQL punch_time through
  | new Date(...) shifts/interprets that wall-clock value incorrectly and can
  | produce a start_time later than end_time.
  |
  | Build both ends of the live window inside MySQL using UTC +05:00 so the
  | ZKBioTime API always receives one consistent local time basis.
  |--------------------------------------------------------------------------
  */

  const [clockRows] =
    await pool.query(
      `
      SELECT
        DATE_FORMAT(
          CONVERT_TZ(
            UTC_TIMESTAMP(),
            '+00:00',
            '+05:00'
          ),
          '%Y-%m-%d %H:%i:%s'
        ) AS pakistan_now,

        DATE_FORMAT(
          DATE(
            CONVERT_TZ(
              UTC_TIMESTAMP(),
              '+00:00',
              '+05:00'
            )
          ),
          '%Y-%m-%d 00:00:00'
        ) AS today_start
      `
    );

  const currentTime =
    clockRows?.[0]?.pakistan_now;

  const todayStart =
    clockRows?.[0]?.today_start;

  if (!currentTime || !todayStart) {
    throw new Error(
      "Could not resolve Pakistan local time for ZKBioTime live sync."
    );
  }

  const [rows] =
    await pool.query(
      `
      SELECT
        id,

        DATE_FORMAT(
          punch_time,
          '%Y-%m-%d %H:%i:%s'
        ) AS punch_time,

        DATE_FORMAT(
          GREATEST(
            DATE_SUB(
              punch_time,
              INTERVAL ${LIVE_OVERLAP_MINUTES} MINUTE
            ),
            ?
          ),
          '%Y-%m-%d %H:%i:%s'
        ) AS live_start_time

      FROM zkteco_transactions

      WHERE punch_time >= ?
        AND punch_time < DATE_ADD(
          ?,
          INTERVAL 1 DAY
        )

      ORDER BY
        punch_time DESC,
        id DESC

      LIMIT 1
      `,
      [
        todayStart,
        todayStart,
        todayStart,
      ]
    );

  const latest =
    rows[0];

  if (
    !latest ||
    !latest.punch_time
  ) {
    return {
      latestId: null,
      latestPunch: null,
      startTime: todayStart,
      endTime: currentTime,
    };
  }

  return {
    latestId:
      latest.id,

    latestPunch:
      latest.punch_time,

    startTime:
      latest.live_start_time ||
      todayStart,

    endTime:
      currentTime,
  };
}

async function syncRecentTransactions() {
  const {
    latestId,
    latestPunch,
    startTime,
    endTime,
  } =
    await getLiveStartPoint();

  const batchId =
    `LIVE-${Date.now()}`;

  let page = 1;
  let received = 0;
  let inserted = 0;
  let refreshed = 0;
  let failed = 0;

  const failures = [];

  while (true) {
    let response;

    try {
      response =
        await getTransactions({
          start_time:
            startTime,

          end_time:
            endTime,

          page,

          page_size:
            LIVE_PAGE_SIZE,
        });
    } catch (error) {
      console.error(
        "[ZKBioTime Live Sync] Transaction API request failed.",
        {
          page,
          page_size:
            LIVE_PAGE_SIZE,

          start_time:
            startTime,

          end_time:
            endTime,

          message:
            error?.message ||
            String(error),

          status:
            error?.response
              ?.status ||
            null,

          response:
            error?.response
              ?.data ||
            null,
        }
      );

      throw error;
    }

    const rows =
      extractRows(
        response
      );

    const total =
      extractCount(
        response
      );

    if (!rows.length) {
      break;
    }

    received +=
      rows.length;

    for (
      const item
      of rows
    ) {
      try {
        const result =
          await upsertTransaction(
            item,
            batchId
          );

        if (!result.saved) {
          failed += 1;

          if (
            failures.length <
            20
          ) {
            failures.push({
              id:
                item?.id ||
                item?.pk ||
                item
                  ?.transaction_id ||
                null,

              error:
                "Transaction could not be mapped or saved.",
            });
          }

          continue;
        }

        if (result.inserted) {
          inserted += 1;
        } else {
          refreshed += 1;
        }
      } catch (error) {
        failed += 1;

        if (
          failures.length <
          20
        ) {
          failures.push({
            id:
              item?.id ||
              item?.pk ||
              item
                ?.transaction_id ||
              null,

            emp_code:
              item?.emp_code ||
              item?.employee
                ?.emp_code ||
              null,

            error:
              error?.message ||
              String(error),
          });
        }

        console.error(
          "[ZKBioTime Live Sync] Transaction save failed.",
          {
            transaction_id:
              item?.id ||
              item?.pk ||
              item
                ?.transaction_id ||
              null,

            emp_code:
              item?.emp_code ||
              item?.employee
                ?.emp_code ||
              null,

            message:
              error?.message ||
              String(error),
          }
        );
      }
    }

    console.log(
      "[ZKBioTime Live Sync]",
      {
        page,

        fetched:
          rows.length,

        total,

        received,

        inserted,

        refreshed,

        failed,
      }
    );

    if (
      rows.length <
      LIVE_PAGE_SIZE
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
    mode:
      "CURRENT_DATE_LIVE",

    start_time:
      startTime,

    end_time:
      endTime,

    previous_latest_id:
      latestId,

    previous_latest_punch:
      latestPunch ||
      null,

    window_timezone:
      "Asia/Karachi",

    overlap_minutes:
      LIVE_OVERLAP_MINUTES,

    received,

    inserted,

    refreshed,

    failed,

    failures,

    database_rows_added:
      inserted,

    batch_id:
      batchId,
  };
}

module.exports = {
  syncRecentTransactions,
};