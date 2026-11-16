const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");

(async () => {
  const roster = Array.from({ length: 56 }, (_, i) => ({
    id: i + 1, employee_id: `SEC-${i + 1}`, belt_no: `B-${i + 1}`,
    first_name: i === 55 ? "Ghulam" : "Staff", last_name: i === 55 ? "Fareed" : String(i + 1),
    category_id: 1, category_name: "Security Staff",
  }));
  let query;
  const modelContext = { module: { exports: {} }, require: (name) => {
    assert.equal(name, "../config/db");
    return { pool: { query: async (sql) => { query = sql; return [roster]; } } };
  }};
  vm.runInNewContext(fs.readFileSync(path.join(root, "backend/src/models/dashboardRoster.model.js"), "utf8"), modelContext);
  const master = await modelContext.module.exports.getAllStaffForDashboard();
  assert.equal(master.length, 56);
  assert.match(query, /s\.is_deleted = 0/);
  assert.match(query, /LEFT JOIN staff_categories/);
  assert.doesNotMatch(query, /LIMIT|s\.status\s*=/i);
  console.log("PASS Dashboard master includes all non-deleted staff without attendance, status, category or pagination exclusions");

  const source = fs.readFileSync(path.join(root, "frontend/src/utils/staffDashboardDuty.js"), "utf8");
  const { collectStaffDutyAssignments, reconcileStaffCategoryDuty } = await import("data:text/javascript," + encodeURIComponent(source));
  const dash = fs.readFileSync(path.join(root, "frontend/src/pages/Dashboard.jsx"), "utf8");
  function section(start, end) {
    const i = dash.indexOf(start), j = dash.indexOf(end, i + start.length);
    assert.ok(i >= 0 && j > i, start);
    return dash.slice(i, j);
  }
  const ctx = { normalize: (v) => String(v || "").trim().toUpperCase(), manualAbsenceText: () => "" };
  vm.runInNewContext([
    section("const STATUS_CONFIG =", "const CARD_CONFIG ="),
    section("function rowStatusName(row) {", "/*\n|---------------------------------------------------------------------------\n| COMPLETED COURSE EXCLUSION"),
    section("function getStatusCounts(rows) {", "/*\n|--------------------------------------------------------------------------\n| DAILY SNAPSHOT"),
    "this.classify = rowStatusName; this.counts = getStatusCounts; this.pie = buildPieData; this.labels = staffStatusNames; this.groups = buildGroupStatements;",
  ].join("\n"), ctx);
  const duty = roster.slice(0, 36).map((s, i) => ({ subject_type: "STAFF", subject_id: s.id, assignment_id: i + 1, shift_name: "1st Shift" }));
  const traineeAssignment = { subject_type: "TRAINEE", subject_id: 55, assignment_id: 999 };
  const custom = [{ subject_type: "STAFF", subject_id: 37, assignment_id: 100, group_name: "CCTV", shift_name: "Night" }];
  const assignments = collectStaffDutyAssignments([...duty, duty[0], traineeAssignment], custom);
  const reports = [
    ...roster.slice(37, 49).map((s) => ({ subject_type: "STAFF", subject_id: s.id, attendance_status: "NO_TIMETABLE" })),
    ...roster.slice(49, 53).map((s) => ({ subject_type: "STAFF", subject_id: s.id, attendance_status: "EXEMPT", exemption_type: "LEAVE" })),
    ...roster.slice(53, 55).map((s) => ({ subject_type: "STAFF", subject_id: s.id, attendance_status: "ABSENT" })),
  ];
  const rows = reconcileStaffCategoryDuty({ roster: [...master, master[0]], rows: reports,
    dutyAssignmentsByStaffId: assignments, dutyIds: new Set(assignments.keys()) });
  assert.equal(rows.length, 56);
  const fareed = rows.find((row) => row.subject_name === "Ghulam Fareed");
  assert.ok(fareed); assert.equal(fareed.belt_no, "B-56");
  assert.equal(ctx.classify(fareed), "Not Processed");
  const counts = ctx.counts(rows);
  assert.equal(counts.Duty, 37); assert.equal(counts["No Timetable"], 12);
  assert.equal(counts.Leave, 4); assert.equal(counts.Absent, 2); assert.equal(counts["Not Processed"], 1);
  const group = ctx.groups(rows, "STAFF")[0];
  const pie = ctx.pie(group.rows, ctx.labels(group.rows));
  assert.equal(group.total, 56); assert.equal(group.enrolled, 56);
  assert.equal(pie.reduce((sum, slice) => sum + slice.value, 0), group.total);
  assert.equal(pie.find((slice) => slice.name === "Duty").value, group.Duty);
  for (const slice of pie) assert.equal(slice.value, group[slice.name]);
  console.log("PASS Ghulam Fareed remains visible without report rows; security donut, table and headcount agree at 56");

  const sharedCode = reconcileStaffCategoryDuty({ roster: [{ id: 70, employee_id: "SAME" }],
    rows: [{ subject_id: 71, employee_id: "SAME", attendance_status: "PRESENT" }] });
  assert.equal(ctx.classify(sharedCode[0]), "Not Processed");
  assert.equal(ctx.classify({subject_type:"STAFF",attendance_status:"EXEMPT",exemption_type:"DUTY_REST"}), "Long Weekend");
  assert.equal(ctx.classify({subject_type:"TRAINEE",attendance_status:"NO_TIMETABLE"}), null);
  assert.ok(dash.includes('api.get("/dashboard/staff"'));
  assert.ok(dash.includes('api.get("/custom-shifts/attendance-summary"'));
  assert.ok(dash.includes('staffMorning: staffMorningData'));
  console.log("PASS Identity collisions cannot borrow attendance; Duty Rest, trainee behavior and reconciled cache remain consistent");
})().catch((error) => { console.error(error); process.exitCode = 1; });
