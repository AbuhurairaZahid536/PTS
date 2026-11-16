const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const src = (name) => fs.readFileSync(path.join(root, name), 'utf8');
function loadService(pool) {
  const sandbox = { module: { exports: {} }, exports: {}, require(name) {
    if (name === '../config/db') return { pool };
    throw new Error(`Unexpected require ${name}`);
  }, Date, Map, Set, String, Math, console };
  vm.runInNewContext(src('backend/src/services/shiftDuty.service.js'), sandbox, { filename: 'shiftDuty.service.js' });
  return sandbox.module.exports;
}
function row(key, start, end, sFrom, sTo, eFrom, eTo, staffId=1) {
  return { shift_key:key, shift_name:key, start_time:start, end_time:end,
    start_punch_from:sFrom,start_punch_to:sTo, end_punch_from:eFrom,end_punch_to:eTo,
    subject_type:'STAFF',subject_id:staffId,staff_id:staffId,
    employee_id:`S${staffId}`,roster_id:9,shift_id:staffId,
    duty_point_id:staffId,assignment_id:staffId };
}
const first = row('FIRST','08:00:00','16:00:00','07:00:00','08:00:00','15:00:00','16:00:00',1);
const second = row('SECOND','16:00:00','00:00:00','15:00:00','16:00:00','23:00:00','00:00:00',2);
const third = row('THIRD','00:00:00','08:00:00','23:00:00','00:00:00','07:00:00','08:00:00',3);
const basePool = { query: async () => [[]] };
const service = loadService(basePool);
const occurrence = (r) => service.buildSecurityRosterOccurrence(r,'2026-10-15');
let d = occurrence(first);
assert.equal(d.shift_start_datetime,'2026-10-15 08:00:00');
assert.equal(d.start_window_from,'2026-10-15 07:00:00');
assert.equal(d.end_window_to,'2026-10-15 16:00:00');
d = occurrence(second);
assert.equal(d.shift_start_datetime,'2026-10-15 16:00:00');
assert.equal(d.shift_end_datetime,'2026-10-16 00:00:00');
assert.equal(d.end_window_from,'2026-10-15 23:00:00');
assert.equal(d.end_window_to,'2026-10-16 00:00:00');
d = occurrence(third);
assert.equal(d.attendance_date,'2026-10-15');
assert.equal(d.shift_start_datetime,'2026-10-16 00:00:00');
assert.equal(d.shift_end_datetime,'2026-10-16 08:00:00');
assert.equal(d.start_window_from,'2026-10-15 23:00:00');
assert.equal(d.start_window_to,'2026-10-16 00:00:00');
assert.equal(d.end_window_from,'2026-10-16 07:00:00');
assert.equal(d.end_window_to,'2026-10-16 08:00:00');
// Custom groups must preserve their existing date convention.
d = service.buildShiftOccurrence(third,'2026-10-15');
assert.equal(d.shift_start_datetime,'2026-10-15 00:00:00');
assert.equal(d.start_window_from,'2026-10-15 23:00:00');
console.log('PASS Security 1st/2nd/3rd calendar date & punch windows, Custom Shift unchanged');

const rosterRows = [first,second,third];
async function runAttendance(now, punches) {
  const recorded = [];
  const pool = { async query(sql,params) {
    if (sql.includes('FROM duty_rosters dr')) return [rosterRows];
    if (sql.includes('AS db_now')) return [[{ db_now: new Date(now) }]];
    if (sql.includes('FROM zkteco_transactions')) return [punches];
    if (sql.includes('INSERT INTO duty_roster_attendance')) { recorded.push(params[0]); return [{affectedRows:3}]; }
    return [[]];
  } };
  const shiftService = loadService(pool);
  const sandbox = { module:{exports:{}}, exports:{}, Date, console, require(name) {
    if(name === '../config/db') return { pool };
    if(name === './attendance.model') return { getExceptionData: async () => ({leaves:[],osd:[],homeRest:[],dutyRest:[]}) };
    if(name === '../services/shiftDuty.service') return shiftService;
    throw new Error(`Unknown require ${name}`);
  }};
  vm.runInNewContext(src('backend/src/models/dutyRoster.model.js'),sandbox,{filename:'dutyRoster.model.js'});
  const result = await sandbox.module.exports.calculateDutyRosterAttendance('2026-10-15');
  assert.equal(recorded.length,1);
  return result;
}
function status(result,id) { return result.rows.find((r) => r.subject_id === id); }
(async () => {
  let res = await runAttendance('2026-10-15T14:00:00', []);
  assert.equal(status(res,3).attendance_status,'PENDING');
  assert.equal(status(res,2).attendance_status,'PENDING');
  assert.equal(status(res,1).attendance_status,'ABSENT');
  assert.equal(res.summary.THIRD.pending,1);
  console.log('PASS Future THIRD is pending, never prematurely Absent');

  res = await runAttendance('2026-10-16T07:30:00', [
    { id:10,emp_code:'S3',punch_time:'2026-10-15 23:45:00' },
    { id:11,emp_code:'S3',punch_time:'2026-10-16 07:15:00' },
    { id:12,emp_code:'S2',punch_time:'2026-10-15 15:20:00' },
    { id:13,emp_code:'S2',punch_time:'2026-10-15 23:30:00' },
  ]);
  assert.equal(status(res,3).attendance_status,'PRESENT');
  assert.equal(status(res,3).checkout_status,'CHECKED_OUT');
  assert.equal(status(res,2).attendance_status,'PRESENT');
  assert.equal(status(res,2).checkout_status,'CHECKED_OUT');
  assert.equal(res.summary.THIRD.present,1);
  console.log('PASS Third-shift next-day punches and second-shift midnight checkout');

  res = await runAttendance('2026-10-16T00:01:00', []);
  assert.equal(status(res,3).attendance_status,'ABSENT');
  assert.equal(status(res,3).checkout_status,'PENDING');
  console.log('PASS True third-shift missed arrival Absent only after window closes');

  const fakeConn={ query: async (sql,params) => {
    if (sql.includes('FROM duty_rosters dr')) return [[{source_type:'SECURITY_ROSTER',source_group_id:8,shift_key:'THIRD',shift_name:'3rd Shift',start_time:'00:00:00',end_time:'08:00:00',effective_from:'2026-10-15',effective_to:'2026-10-15',assignment_id:3}]];
    if (sql.includes('FROM custom_shift_groups csg')) return [[]];
    return [[]];
  }};
  const conflict = await service.findStaffShiftOverlap({staffId:1,startDate:'2026-10-16',endDate:'2026-10-16',startTime:'01:00:00',endTime:'07:00:00',connection:fakeConn});
  assert.ok(conflict);
  const nonConflict = await service.findStaffShiftOverlap({staffId:1,startDate:'2026-10-15',endDate:'2026-10-15',startTime:'01:00:00',endTime:'07:00:00',connection:fakeConn});
  assert.equal(nonConflict,null);
  console.log('PASS Overlap validation respects physical next-day third-shift date');
})().catch((error) => { console.error(error); process.exitCode=1; });
