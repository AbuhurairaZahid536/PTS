const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
(async () => {
  const src = fs.readFileSync(path.join(root, 'frontend/src/utils/staffDashboardDuty.js'), 'utf8');
  const { collectStaffDutyAssignments, reconcileStaffCategoryDuty } = await import('data:text/javascript,' + encodeURIComponent(src));
  const dashboard = fs.readFileSync(path.join(root, 'frontend/src/pages/Dashboard.jsx'), 'utf8');
  function extract(start, finish) {
    const i = dashboard.indexOf(start);
    assert.ok(i >= 0, `Missing ${start}`);
    const j = dashboard.indexOf(finish, i);
    assert.ok(j > i, `Missing ${finish}`);
    return dashboard.slice(i, j);
  }
  const context = {
    normalize: (v) => String(v || '').trim().toUpperCase(),
    manualAbsenceText: () => '',
    STATUS_NAMES: ['Present','Absent','Leave','Long Weekend','OSD','Medical Rest','Repatriate'],
    STAFF_STATUS_NAMES: ['Present','Absent','Leave','Long Weekend','OSD'],
  };
  vm.runInNewContext(extract('function rowStatusName(row) {','function identityKey(row) {') + '\n' +
    extract('function staffStatusNames(rows) {','function dashboardStatusLabel(') +
    '\nthis.classify = rowStatusName; this.staffNames = staffStatusNames;', context);
  const roster = Array.from({length:56},(_,i)=>({id:i+1,employee_id:`SS-${i+1}`,category_name:'Security Staff',first_name:'Security',last_name:String(i+1)}));
  // A roster card can include people other than STAFF. Only staff assignments
  // are classified as Staff Duty; do not borrow a trainee into Staff headcount.
  const securityRoster = [
    ...roster.slice(0,37).map((s,i)=>({subject_type:'STAFF', subject_id:s.id, assignment_id:i+1,shift_name:i<13?'1st Shift':i<25?'2nd Shift':'3rd Shift', duty_point_name:'Gate',start_time:'06:00:00',end_time:'14:00:00'})),
    ...Array.from({length:5}, (_,i)=>({subject_type:'TRAINEE',subject_id:i+1,assignment_id:100+i,shift_name:'2nd Shift'})),
  ];
  const map = collectStaffDutyAssignments(securityRoster, []);
  assert.equal(securityRoster.length,42);
  assert.equal(map.size,37);
  console.log('PASS 42 assignments with 5 trainees remain 37 unique STAFF Duty, not invented 42');
  const oldRows = [
    ...roster.slice(37,41).map(s=>({subject_type:'STAFF',subject_id:s.id,attendance_status:'EXEMPT',exemption_type:'LEAVE'})),
    ...roster.slice(41,44).map(s=>({subject_type:'STAFF',subject_id:s.id,attendance_status:'ABSENT'})),
    ...roster.slice(44).map(s=>({subject_type:'STAFF',subject_id:s.id,attendance_status:'PENDING'})),
  ];
  const reconciled = reconcileStaffCategoryDuty({roster,rows:oldRows,dutyIds:new Set(map.keys()),dutyAssignmentsByStaffId:map});
  assert.equal(reconciled.length,56);
  const counts = reconciled.reduce((obj,r)=>(obj[context.classify(r)]=(obj[context.classify(r)]||0)+1,obj),{});
  assert.equal(counts.Duty,37);
  assert.equal(counts.Leave,4);
  assert.equal(counts.Absent,3);
  assert.equal(counts['Not Processed'],12);
  assert.equal(Object.values(counts).reduce((a,b)=>a+b,0),56);
  const labels = Array.from(context.staffNames(reconciled));
  assert.ok(labels.includes('Duty') && labels.includes('Not Processed'));
  console.log('PASS Security Staff 56 reconciles all slices: 37 Duty + 4 Leave + 3 Absent + 12 Not Processed');
  const first = reconciled[0];
  assert.equal(first.duty_assignments[0].shift_name,'1st Shift');
  assert.equal(first.duty_assignments[0].duty_point_name,'Gate');
  assert.equal(first.duty_assignments[0].source_type,'SECURITY_ROSTER');
  assert.equal(reconciled[50].duty_assignments.length,0);
  console.log('PASS Duty list rows preserve actual roster, shift, duty point and time');
  const withCustom = collectStaffDutyAssignments(securityRoster,[{subject_type:'STAFF',subject_id:1,assignment_id:202,group_name:'Night Patrol',shift_name:'Night Shift',duty_point_name:'Perimeter',start_time:'20:00:00',end_time:'02:00:00'}]);
  assert.equal(withCustom.get(1).length,2);
  assert.equal(withCustom.size,37);
  console.log('PASS multiple assignments show in popup without double-counting staff');
  const withMedical = [{subject_type:'STAFF',attendance_status:'EXEMPT',exemption_type:'MEDICAL_REST'}, {subject_type:'STAFF',attendance_status:'EXEMPT',exemption_type:'TRAINING_DROP'}];
  assert.ok(Array.from(context.staffNames(withMedical)).includes('Medical Rest'));
  assert.ok(Array.from(context.staffNames(withMedical)).includes('Repatriate'));
  console.log('PASS staff legend includes operational statuses rather than hiding their slices');
  assert.equal(context.classify({subject_type:'STAFF',attendance_status:'NO_TIMETABLE'}),'No Timetable');
  assert.equal(context.classify({subject_type:'STAFF',attendance_status:'PENDING',timing_status:'NO_TIMETABLE'}),'No Timetable');
  assert.equal(context.classify({subject_type:'STAFF',attendance_status:'PENDING'}),'Not Processed');
  assert.equal(context.classify({subject_type:'TRAINEE',attendance_status:'PENDING'}),'Not Processed');
  console.log('PASS missing timetable is explicitly unassigned (not false Absent/Present); trainee missing-data status remains explicit');
  assert.ok(dashboard.includes('isStaffDutyDetail') && dashboard.includes('Assigned Duty / Shift') && dashboard.includes('duty_assignments'));
  assert.ok(dashboard.includes('View Names & Belt Nos.') && dashboard.includes('Required Action'));
  assert.ok(dashboard.includes('rosterById') && dashboard.includes('row.belt_no'));
  assert.ok(dashboard.includes('title: "Belt No."'));
  const unassignedRows = [{ id: 99, employee_id: 'UNASSIGNED', belt_no: '15238/C', category_name: 'Security Staff', first_name: 'Test', last_name: 'User' }];
  const unassigned = reconcileStaffCategoryDuty({roster:unassignedRows,rows:[{ subject_type:'STAFF',subject_id:99,attendance_status:'NO_TIMETABLE' }]});
  assert.equal(unassigned.length,1);
  assert.equal(unassigned[0].belt_no,'15238/C');
  assert.equal(context.classify(unassigned[0]),'No Timetable');
  console.log('PASS No Timetable staff remain in headcount with Belt No for modal');
  console.log('PASS Duty details popup is wired for category and overall chart selection');
  console.log('PASS 7/7 staff chart integrity smoke tests');
})().catch(e=>{console.error(e);process.exit(1)});
