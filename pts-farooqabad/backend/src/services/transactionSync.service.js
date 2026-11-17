const crypto = require("node:crypto");
const { pool } = require("../config/db");
const { getTransactions } = require("../integrations/zkbiotime/client");
const { apiPages } = require("../integrations/zkbiotime/pagination");
function text(value) {
  if (value == null) return null;
  if (typeof value === "object") value = value.emp_code ?? value.dept_name ?? value.position_name ?? value.alias ?? value.name ?? value.sn ?? value.label;
  return value == null || String(value).trim() === "" ? null : String(value).trim();
}
function number(value) {
  if (typeof value === "object" && value) value = value.id ?? value.pk;
  return value == null || value === "" || !Number.isFinite(Number(value)) ? null : Number(value);
}
function dateTime(value) {
  if (!value) return null;
  const input = String(value).trim();
  if (/([zZ]|[+-]\d{2}:?\d{2})$/.test(input)) {
    const instant = Date.parse(input);
    if (!Number.isFinite(instant)) return null;
    return new Date(instant + 5 * 3600000).toISOString().slice(0,19).replace("T", " ");
  }
  const match = input.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})/);
  if (!match || !Number.isFinite(Date.parse(`${match[1]}T${match[2]}+05:00`))) return null;
  const normalized = new Date(Date.parse(`${match[1]}T${match[2]}+05:00`) + 5 * 3600000).toISOString().slice(0,19).replace("T"," ");
  return normalized === `${match[1]} ${match[2]}` ? normalized : null;
}
function mapTransaction(item) {
  const id = text(item?.id ?? item?.pk ?? item?.transaction_id);
  if (!id || !/^\d+$/.test(id) || /^0+$/.test(id)) throw new Error("Missing/invalid BioTime transaction ID.");
  const employee = typeof item.employee === "object" && item.employee || typeof item.emp === "object" && item.emp || {};
  const terminal = typeof item.terminal === "object" && item.terminal || {};
  const empCode = text(item.emp_code ?? employee.emp_code), punch = dateTime(item.punch_time);
  if (!empCode || !punch) throw new Error("BioTime transaction requires an exact employee code and valid punch_time.");
  return { id, emp: number(item.emp ?? employee.id), emp_code: empCode,
    first_name: text(item.first_name ?? employee.first_name), last_name: text(item.last_name ?? employee.last_name),
    department: text(item.department_name ?? item.department ?? employee.department),
    position: text(item.position_name ?? item.position ?? employee.position), punch_time: punch,
    punch_state: text(item.punch_state), punch_state_display: text(item.punch_state_display ?? item.punch_state_name),
    verify_type: number(item.verify_type), verify_type_display: text(item.verify_type_display ?? item.verify_type_name),
    work_code: text(item.work_code), gps_location: text(item.gps_location), area_alias: text(item.area_alias ?? item.area),
    terminal_sn: text(item.terminal_sn ?? terminal.sn), terminal_alias: text(item.terminal_alias ?? terminal.alias),
    temperature: number(item.temperature), is_mask: text(item.is_mask), upload_time: dateTime(item.upload_time),
    longitude: number(item.longitude), latitude: number(item.latitude) };
}
let schema;
function ensureFailureQueue() {
  if (!schema) schema = pool.query(`CREATE TABLE IF NOT EXISTS biometric_sync_failures (
    source_id VARCHAR(64) NOT NULL PRIMARY KEY, raw_json LONGTEXT NOT NULL,
    error_text TEXT NOT NULL, attempts INT NOT NULL DEFAULT 1,
    first_failed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_failed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`).catch(error => { schema = null; throw error; });
  return schema;
}
function sourceId(item) {
  const id = text(item?.id ?? item?.pk ?? item?.transaction_id);
  return id && id.length <= 64 ? id : crypto.createHash("sha256").update(JSON.stringify(item)).digest("hex");
}
async function saveTransaction(item, batchId) {
  const data = mapTransaction(item), columns = Object.keys(data);
  const [existing] = await pool.query("SELECT id,emp,emp_code,punch_time,punch_state,verify_type FROM zkteco_transactions WHERE id=? LIMIT 1",[data.id]);
  await pool.query(`INSERT INTO zkteco_transactions
    (${columns.map(c => `\`${c}\``).join(",")},synced_at,sync_batch_id,sync_status,sync_error)
    VALUES (${columns.map(() => "?").join(",")},NOW(),?,'SYNCED',NULL)
    ON DUPLICATE KEY UPDATE ${columns.filter(c => c !== "id").map(c => `\`${c}\`=VALUES(\`${c}\`)`).join(",")},
      synced_at=NOW(),sync_batch_id=VALUES(sync_batch_id),sync_status='SYNCED',sync_error=NULL`,
    [...columns.map(c => data[c]), batchId]);
  await pool.query("DELETE FROM biometric_sync_failures WHERE source_id=?", [sourceId(item)]);
  const previous = existing[0];
  const changed = !previous || ['emp','emp_code','punch_time','punch_state','verify_type']
    .some(key => String(previous[key] ?? '') !== String(data[key] ?? ''));
  return { data, inserted: !previous, changed, previousDate: previous?.punch_time ? String(previous.punch_time).slice(0,10) : null };
}
async function syncTransactionWindow({ startTime, endTime, batchId }) {
  await ensureFailureQueue();
  const summary = { received: 0, inserted: 0, refreshed: 0, retried: 0, changed: 0, unchanged: 0, failed: 0, failures: [], attendance_dates: [] };
  const dates = new Set();
  async function save(item, retry = false) {
    try {
      const result = await saveTransaction(item, batchId);
      summary[result.inserted ? "inserted" : "refreshed"]++;
      if (retry) summary.retried++;
      if (result.changed && !result.inserted) summary.changed++;
      if (!result.changed) summary.unchanged++;
      if (result.changed || retry) {
        dates.add(result.data.punch_time.slice(0,10));
        if (result.previousDate) dates.add(result.previousDate);
      }
    } catch (error) {
      const id = sourceId(item);
      await pool.query(`INSERT INTO biometric_sync_failures (source_id,raw_json,error_text)
        VALUES (?,?,?) ON DUPLICATE KEY UPDATE raw_json=VALUES(raw_json),error_text=VALUES(error_text),
        attempts=attempts+1,last_failed_at=NOW()`, [id,JSON.stringify(item),error.message]);
      if (summary.failures.length < 20) summary.failures.push({ id, error: error.message });
    }
  }
  const [pending] = await pool.query("SELECT raw_json FROM biometric_sync_failures ORDER BY first_failed_at LIMIT 500");
  for (const row of pending) await save(typeof row.raw_json === "string" ? JSON.parse(row.raw_json) : row.raw_json, true);
  for await (const page of apiPages(getTransactions, { start_time: startTime, end_time: endTime }, 100)) {
    summary.received += page.rows.length;
    for (const item of page.rows) await save(item);
  }
  const [[pendingCount]] = await pool.query("SELECT COUNT(*) AS total FROM biometric_sync_failures");
  summary.failed = Number(pendingCount.total);
  const [unresolved] = await pool.query("SELECT source_id,error_text FROM biometric_sync_failures ORDER BY first_failed_at LIMIT 20");
  summary.failures = unresolved.map(row => ({id:row.source_id,error:row.error_text}));
  summary.attendance_dates = [...dates].sort();
  summary.complete = summary.failed === 0;
  return summary;
}
module.exports = { mapTransaction, dateTime, syncTransactionWindow, ensureFailureQueue };
