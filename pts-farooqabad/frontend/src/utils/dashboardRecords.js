export function employeeCode(row) {
  const value = [row?.biotime_emp_code,row?.zkteco_emp_code,row?.employee_id,row?.cap_no]
    .find(value => value != null && String(value).trim() !== "");
  return value == null ? "—" : String(value).trim();
}
export function pakistanNow(now = new Date()) {
  return new Date(now.getTime() + 5 * 3600000).toISOString().slice(0,19).replace("T"," ");
}
export function activeRepatriates(rows, date, now = new Date()) {
  const clock = pakistanNow(now), asOf = date === clock.slice(0,10) ? clock : `${date} 23:59:59`;
  return (rows || []).filter(row => {
    const start = row.drop_datetime, end = row.rejoin_datetime;
    if (!start || start > asOf) return false;
    if (String(row.drop_status || "").toUpperCase() === "CANCELLED" && (!row.cancelled_at || row.cancelled_at <= asOf)) return false;
    if (end && end <= asOf) return false;
    if (String(row.drop_status || "").toUpperCase() === "REJOINED" && !end) return false;
    return true;
  });
}
export function repatriateMatches(record, row) {
  if (row?.subject_type && row.subject_type !== "TRAINEE") return false;
  const recordId = record?.trainee_id ?? record?.subject_id;
  const rowId = row?.subject_id ?? row?.trainee_id;
  if (recordId != null && rowId != null) return String(recordId) === String(rowId);
  // Legacy code-only data is safe only within the same known course.
  return record?.course_id != null && row?.course_id != null && String(record.course_id) === String(row.course_id)
    && employeeCode(record) !== "—" && employeeCode(record) === employeeCode(row);
}
export function formatAbsenceDuration(seconds) {
  if (seconds == null || !Number.isFinite(Number(seconds))) return "Not recorded";
  let value = Math.max(0, Math.floor(Number(seconds)));
  const days = Math.floor(value / 86400); value %= 86400;
  const hours = Math.floor(value / 3600), minutes = Math.floor(value % 3600 / 60);
  return `${days ? days + "d " : ""}${hours}h ${minutes}m ${value % 60}s`;
}
