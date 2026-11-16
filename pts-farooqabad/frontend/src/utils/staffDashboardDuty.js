/*
 * Category headcount is the All Staff roster, not the shift summary.
 * Actual shift attendance is calculated only in Duty Roster / Custom Shift.
 * Dashboard categories classify assigned staff as Duty and attach real
 * assignment details for the Duty modal, without changing punch results.
 */

function staffId(row) {
  const id = Number(row?.subject_id ?? row?.staff_id);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export function collectStaffDutyAssignments(rosterRows = [], customRows = []) {
  const assignments = new Map();
  for (const [source, items] of [
    ["SECURITY_ROSTER", rosterRows],
    ["CUSTOM_SHIFT", customRows],
  ]) {
    for (const row of Array.isArray(items) ? items : []) {
      if (String(row?.subject_type || "STAFF").trim().toUpperCase() !== "STAFF") continue;
      const id = staffId(row);
      if (!id) continue;
      const assignment = {
        source_type: source,
        group_name: String(row?.group_name || row?.source_group_name ||
          (source === "SECURITY_ROSTER" ? "Security Duty Roster" : "Custom Shift Duty")).trim(),
        shift_name: String(row?.shift_name || row?.shift_key || "Shift").trim(),
        shift_key: row?.shift_key || null,
        duty_point_name: row?.duty_point_name || null,
        start_time: row?.start_time || null,
        end_time: row?.end_time || null,
        assignment_id: row?.assignment_id || null,
      };
      if (!assignments.has(id)) assignments.set(id, []);
      const list = assignments.get(id);
      const key = [source, assignment.assignment_id, assignment.shift_name,
        assignment.duty_point_name, assignment.start_time, assignment.end_time].join("|");
      if (!list.some((existing) => existing._identity === key)) {
        list.push({ ...assignment, _identity: key });
      }
    }
  }
  return assignments;
}

export function reconcileStaffCategoryDuty({
  roster = [], rows = [], dutyIds = new Set(), dutyAssignmentsByStaffId = new Map(),
}) {
  const byStaffId = new Map();
  const byEmployeeCode = new Map();
  for (const row of rows || []) {
    const id = staffId(row);
    if (id && !byStaffId.has(id)) byStaffId.set(id, row);
    const code = String(row?.employee_id || "").trim();
    if (code && !byEmployeeCode.has(code)) byEmployeeCode.set(code, row);
  }

  const unique = new Set();
  const result = [];
  for (const staff of roster || []) {
    const id = Number(staff?.id ?? staff?.subject_id);
    if (!Number.isInteger(id) || id <= 0 || unique.has(id)) continue;
    unique.add(id);
    const previous = byStaffId.get(id) || byEmployeeCode.get(String(staff.employee_id || "").trim()) || {};
    const assignments = dutyAssignmentsByStaffId.get(id) || [];
    const assigned = dutyIds.has(id) || assignments.length > 0;
    result.push({
      ...previous,
      subject_type: "STAFF",
      subject_id: id,
      staff_id: id,
      employee_id: staff.employee_id,
      belt_no: staff.belt_no || previous.belt_no || null,
      subject_name: staff.subject_name || [staff.first_name, staff.last_name].filter(Boolean).join(" ") || previous.subject_name,
      category_id: staff.category_id,
      category_name: staff.category_name || "No Category",
      branch_id: staff.branch_id,
      branch_name: staff.branch_name,
      staff_rank: staff.staff_rank || staff.designation || previous.staff_rank,
      attendance_status: assigned ? "DUTY" : (previous.attendance_status || "NOT_PROCESSED"),
      exemption_type: assigned ? null : (previous.exemption_type ?? null),
      exemption_description: assigned ? null : (previous.exemption_description ?? null),
      _dashboard_duty: Boolean(assigned),
      duty_assignments: assigned ? assignments : [],
    });
  }
  return result;
}
