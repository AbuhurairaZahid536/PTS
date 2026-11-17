const { pool } = require("../config/db");
const { syncTransactionWindow } = require("./transactionSync.service");
let lastFullReconciliation = 0;
async function syncRecentTransactions() {
  const [[clock]] = await pool.query(`SELECT DATE_FORMAT(DATE_ADD(UTC_TIMESTAMP(),INTERVAL 5 HOUR),'%Y-%m-%d %H:%i:%s') AS pakistan_now,
    DATE_FORMAT(DATE_SUB(DATE(DATE_ADD(UTC_TIMESTAMP(),INTERVAL 5 HOUR)),INTERVAL 1 DAY),'%Y-%m-%d 00:00:00') AS reconciliation_start`);
  const full = Date.now() - lastFullReconciliation >= 10 * 60 * 1000;
  const [[latest]] = await pool.query("SELECT MAX(punch_time) AS punch_time FROM zkteco_transactions WHERE punch_time<=?",[clock.pakistan_now]);
  // Periodically replay yesterday/today for late device uploads and overnight duty.
  // Failed rows additionally remain in a durable queue until saved successfully.
  let startTime = clock.reconciliation_start;
  if (!full && latest?.punch_time) {
    const [[overlap]] = await pool.query("SELECT DATE_FORMAT(DATE_SUB(?,INTERVAL 5 MINUTE),'%Y-%m-%d %H:%i:%s') AS start_time",[latest.punch_time]);
    startTime = overlap.start_time < clock.reconciliation_start ? clock.reconciliation_start : overlap.start_time;
  }
  const result = await syncTransactionWindow({startTime,endTime:clock.pakistan_now,batchId:`LIVE-${Date.now()}`});
  if (full && result.complete) lastFullReconciliation = Date.now();
  return {...result,mode:full?'LATE_UPLOAD_RECONCILIATION':'CURRENT_DATE_LIVE',start_time:startTime,
    end_time:clock.pakistan_now,window_timezone:'Asia/Karachi',database_rows_added:result.inserted};
}
module.exports = { syncRecentTransactions };
