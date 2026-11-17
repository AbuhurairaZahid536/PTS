function recordMap(records, subjectType) {
  return new Map((Array.isArray(records) ? records : [])
    .filter(record => record.id != null && record.subject_id != null &&
      String(record.subject_type || subjectType).toUpperCase() === subjectType)
    .map(record => [`${subjectType}:${record.subject_id}:${record.id}`, record]));
}

export function enrichDashboardOperationalDetails(rows, support = {}) {
  const leaves = new Map([
    ...recordMap(support.trainee_leaves, "TRAINEE"),
    ...recordMap(support.staff_leaves, "STAFF"),
  ]);
  const osd = new Map([
    ...recordMap(support.trainee_osd, "TRAINEE"),
    ...recordMap(support.staff_osd, "STAFF"),
  ]);
  return rows.map(row => {
    const type = String(row.subject_type || "").toUpperCase();
    const key = `${type}:${row.subject_id}:${row.exemption_record_id}`;
    const exemption = String(row.exemption_type || "").toUpperCase();
    const leave = exemption === "LEAVE" ? leaves.get(key) : null;
    const permission = ["OSD", "SHORT_PERMISSION"].includes(exemption) ? osd.get(key) : null;
    return {
      ...row,
      leave_start_datetime: leave?.start_datetime ?? null,
      leave_end_datetime: leave?.end_datetime ?? null,
      leave_reason: leave?.reason ?? null,
      ...(permission ? {
        osd_start_datetime: permission.start_datetime,
        osd_end_datetime: permission.end_datetime,
        osd_reason: permission.reason,
      } : {}),
    };
  });
}
