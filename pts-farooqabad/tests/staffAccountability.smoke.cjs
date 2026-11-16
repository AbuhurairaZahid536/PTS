const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root=path.resolve(__dirname,'..');
let done=0;
const pass=(label)=>{done++;console.log('PASS',label)};
(async()=>{
 const moduleText=fs.readFileSync(path.join(root,'frontend/src/utils/staffDashboardDuty.js'),'utf8');
 const {reconcileStaffCategoryDuty,collectStaffDutyAssignments}=await import('data:text/javascript,'+encodeURIComponent(moduleText));
 const dash=fs.readFileSync(path.join(root,'frontend/src/pages/Dashboard.jsx'),'utf8');
 const extract=(start,stop)=>{let i=dash.indexOf(start);assert.ok(i>=0,start);let j=dash.indexOf(stop,i);assert.ok(j>i,stop);return dash.slice(i,j)};
 const context={normalize:v=>String(v||'').trim().toUpperCase(),manualAbsenceText:()=>'',STATUS_NAMES:['Present','Absent','Leave','Long Weekend','OSD','Medical Rest','Repatriate'],STAFF_STATUS_NAMES:['Present','Absent','Leave','Long Weekend','OSD']};
 vm.runInNewContext(extract('function rowStatusName(row) {','function identityKey(row) {')+'\n'+extract('function staffStatusNames(rows) {','function dashboardStatusLabel(')+'\nthis.classify=rowStatusName;this.labels=staffStatusNames;',context);
 const security=Array.from({length:56},(_,i)=>({id:i+1,employee_id:`SEC-${i+1}`,belt_no:`B-${i+1}`,first_name:'Staff',last_name:String(i+1),category_name:'Security Staff',category_id:1}));
 const rosterAssignments=security.slice(0,36).map((x,i)=>({subject_id:x.id,subject_type:'STAFF',assignment_id:i+1,group_name:'Security Duty Roster',shift_name:`${Math.floor(i/12)+1} Shift`,duty_point_name:'Main Gate',start_time:'06:00:00',end_time:'14:00:00'}));
 rosterAssignments.push(...Array.from({length:2},(_,i)=>({subject_id:100+i,subject_type:'STAFF',assignment_id:100+i,group_name:'Admin Duty',shift_name:'1st Shift'})));
 rosterAssignments.push(...Array.from({length:4},(_,i)=>({subject_id:200+i,subject_type:'STAFF',assignment_id:200+i,group_name:'Line Duty',shift_name:'2nd Shift'})));
 assert.equal(rosterAssignments.length,42);pass('Live roster fixture preserves 42 assignments (36 security + 2 admin + 4 line)');
 const custom=[{subject_id:37,subject_type:'STAFF',assignment_id:300,group_name:'CCTV ROOM DUTY ROSTER',shift_name:'3RD SHIFT',start_time:'22:00:00',end_time:'06:00:00'}];
 const allAssignments=collectStaffDutyAssignments(rosterAssignments,custom);
 assert.equal(allAssignments.size,43);pass('Live fixture has 43 total distinct duty people across all staff categories');
 const securityDutyIds=new Set([...allAssignments.keys()].filter(id=>id>=1&&id<=56));
 assert.equal(securityDutyIds.size,37);assert.equal(allAssignments.get(37)[0].group_name,'CCTV ROOM DUTY ROSTER');pass('Security Duty exactly 36 roster + 1 CCTV custom shift');
 const rows=[...security.slice(37,49).map(x=>({subject_type:'STAFF',subject_id:x.id,attendance_status:'NO_TIMETABLE',timing_status:'NO_TIMETABLE'})),
 ...security.slice(49,53).map(x=>({subject_type:'STAFF',subject_id:x.id,attendance_status:'EXEMPT',exemption_type:'LEAVE'})),
 ...security.slice(53,56).map(x=>({subject_type:'STAFF',subject_id:x.id,attendance_status:'ABSENT'}))];
 const reconciled=reconcileStaffCategoryDuty({roster:security,rows,dutyIds:securityDutyIds,dutyAssignmentsByStaffId:allAssignments});
 assert.equal(reconciled.length,56);pass('56 master staff remain 56 after duty/leave/absence/no-timetable reconciliation');
 const totals={};for(const r of reconciled){const name=context.classify(r);totals[name]=(totals[name]||0)+1;}
 assert.equal(totals.Duty,37);assert.equal(totals['No Timetable'],12);assert.equal(totals.Leave,4);assert.equal(totals.Absent,3);
 assert.equal(Object.values(totals).reduce((x,y)=>x+y,0),56);pass('All 56 classified: 37 Duty + 12 No Timetable + 4 Leave + 3 Absent');
 assert.ok(context.labels(reconciled).includes('No Timetable'));assert.ok(context.labels(reconciled).includes('Duty'));pass('Category/overall charts expose red No Timetable and Duty');
 assert.ok(reconciled.every(r=>r.belt_no===`B-${r.subject_id}`));pass('All staff carry Belt No. from master roster, even unprocessed');
 assert.equal(context.classify({subject_type:'STAFF',attendance_status:'NO_TIMETABLE'}),'No Timetable');pass('No Timetable is not a fabricated Present or Absent');
 assert.equal(context.classify({subject_type:'STAFF',attendance_status:'PENDING'}),'Not Processed');pass('Pending processing remains separately visible');
 assert.equal(context.classify({subject_type:'STAFF',attendance_status:'DUTY',timing_status:'NO_TIMETABLE'}),'Duty');pass('Valid duty assignment takes precedence over standard timetable');
 assert.equal(context.classify({subject_type:'TRAINEE',attendance_status:'NO_TIMETABLE'}),null);pass('Trainee attendance classifications remain unchanged');
 assert.ok(dash.includes('summaryCounts["No Timetable"]')&&dash.includes('View Names & Belt Nos.')&&dash.includes('Assign staff timetable / duty shift'));pass('Missing timetable banner and clickable action popup wired');
 assert.ok(dash.includes('Assigned Duty / Shift')&&dash.includes('staffDutyDescription(assignment)'));pass('Duty popup retains real roster/custom shift/point/time details');
 assert.ok(dash.includes('rosterById')&&dash.includes('staff_belt_no')&&dash.includes('title: "Belt No."'));pass('Duty and all Dashboard Staff popups enrich belt from master roster');
 const staff=fs.readFileSync(path.join(root,'frontend/src/pages/Staff.jsx'),'utf8');assert.ok(staff.includes('Belt No. not recorded'));pass('Staff master list shows Belt Number adjacent to name');
 for(const fname of ['LeaveManagement.jsx','OsdPermissionManagement.jsx','OutdoorMedicalManagement.jsx','Reports.jsx','ShiftDutyManagement.jsx','CustomShiftDutyTab.jsx']){
  assert.match(fs.readFileSync(path.join(root,'frontend/src/pages',fname),'utf8'),/Belt No\./,fname);
 }
 pass('Staff identity with Belt No. available in Leave/OSD/Outdoor/Reports/Shift views');
 console.log(`PASS ${done}/${done} Staff accountability regression checks`);
})().catch(e=>{console.error(e);process.exit(1)});
