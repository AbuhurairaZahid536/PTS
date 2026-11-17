const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname,'..');
function load(file,mocks={}) {
 const context={module:{exports:{}},exports:{},console,Buffer,process,setTimeout,clearTimeout,setInterval,clearInterval,setImmediate,Date,Intl,URL,URLSearchParams,
  require(name){return Object.hasOwn(mocks,name)?mocks[name]:require(name.startsWith('.')?path.resolve(path.dirname(path.join(root,file)),name):name);}};
 vm.runInNewContext(fs.readFileSync(path.join(root,file),'utf8'),context,{filename:file});
 return context.module.exports;
}
let passed=0;
function pass(text){console.log('PASS',text);passed++;}
(async()=>{
 const pagination=load('backend/src/integrations/zkbiotime/pagination.js');
 const pages=[];
 for await (const page of pagination.apiPages(async({page})=>({count:3,data:[{id:page}]}))) pages.push(page);
 assert.equal(pages.length,3);assert.equal(pages[2].received,3);
 await assert.rejects(async()=>{for await(const p of pagination.apiPages(async()=>({count:3,data:[{id:1}]}))){}},/repeated/);
 await assert.rejects(async()=>{for await(const p of pagination.apiPages(async()=>({count:3,next:null,data:[{id:1}]}))){}},/incomplete/);
 await assert.rejects(async()=>{for await(const p of pagination.apiPages(async()=>({detail:'API error'}))){}},/Unexpected/);
 pass('Server-capped pages are fully read; repeated, truncated and malformed pages fail visibly');
 const stored=new Map(),queue=new Map();let failId='2',upstream=[];
 const db={query:async(sql,args=[])=>{
  if(sql.startsWith('CREATE TABLE'))return [{}];
  if(sql.startsWith('SELECT raw_json'))return [[...queue.values()].map(raw_json=>({raw_json}))];
  if(sql.startsWith('SELECT COUNT(*) AS total FROM biometric_sync_failures'))return [[{total:queue.size}]];
  if(sql.startsWith('SELECT source_id,error_text FROM biometric_sync_failures'))return [[...queue.keys()].map(source_id=>({source_id,error_text:'pending'}))];
  if(sql.startsWith('SELECT id,emp,emp_code,punch_time'))return [stored.has(args[0])?[stored.get(args[0])]:[]];
  if(sql.includes('INSERT INTO zkteco_transactions')){
   if(args[0]===failId){failId=null;throw new Error('Temporary database write failure');}
   stored.set(args[0],{id:args[0],emp_code:args[2],punch_time:args[7]});return [{affectedRows:1}];
  }
  if(sql.includes('INSERT INTO biometric_sync_failures')){queue.set(args[0],args[1]);return [{}];}
  if(sql.startsWith('DELETE FROM biometric_sync_failures')){queue.delete(args[0]);return [{}];}
  throw new Error('Unexpected SQL: '+sql);
 }};
 const mocks={'../config/db':{pool:db},'../integrations/zkbiotime/client':{getTransactions:async({page})=>({count:upstream.length,data:upstream.slice(page-1,page)})},'../integrations/zkbiotime/pagination':pagination};
 let sync=load('backend/src/services/transactionSync.service.js',mocks);
 const mapped=sync.mapTransaction({id:'9007199254740993',emp_code:'CAP-0007',punch_time:'2026-11-16T23:30:00Z',department:{dept_name:'Course'},position:{position_name:'Platoon'},verify_type:'bad',temperature:'bad'});
 assert.equal(mapped.id,'9007199254740993');assert.equal(mapped.emp_code,'CAP-0007');assert.equal(mapped.punch_time,'2026-11-17 04:30:00');assert.equal(mapped.department,'Course');assert.equal(mapped.verify_type,null);assert.equal(mapped.temperature,null);
 assert.equal(sync.dateTime('2026-02-30 09:00:00'),null);
 assert.throws(()=>sync.mapTransaction({id:0,emp_code:'A',punch_time:'2026-11-17 09:00:00'}),/ID/);
 pass('Transaction codes, large IDs and Pakistan time are preserved; optional bad numerics cannot break writes');
 upstream=[{id:1,emp_code:'CAP-0001',punch_time:'2026-11-17 06:00:00'},{id:2,emp_code:'CAP-0002',punch_time:'2026-11-17 06:01:00'}];
 let result=await sync.syncTransactionWindow({startTime:'2026-11-17 00:00:00',endTime:'2026-11-17 23:59:59',batchId:'TEST'});
 assert.equal(result.received,2);assert.equal(result.failed,1);assert.equal(result.complete,false);assert.equal(queue.size,1);
 // Recreate the service instance to simulate a backend restart; retry remains in DB.
 sync=load('backend/src/services/transactionSync.service.js',mocks);upstream=[];
 result=await sync.syncTransactionWindow({startTime:'2026-11-18 00:00:00',endTime:'2026-11-18 23:59:59',batchId:'RETRY'});
 assert.equal(result.retried,1);assert.equal(result.failed,0);assert.equal(queue.size,0);assert.equal(stored.size,2);
 upstream=[{id:1,emp_code:'CAP-0001',punch_time:'2026-11-17 06:05:00'}];
 result=await sync.syncTransactionWindow({startTime:'2026-11-17 00:00:00',endTime:'2026-11-17 23:59:59',batchId:'CORRECTION'});
 assert.equal(result.inserted,0);assert.equal(result.refreshed,1);assert.equal(stored.get('1').punch_time,'2026-11-17 06:05:00');assert.ok(result.attendance_dates.includes('2026-11-17'));
 pass('Failed writes survive process restart; successful retries and corrected rows update instead of duplicating transactions');
 const coordinator=load('backend/src/integrations/zkbiotime/syncCoordinator.js');const order=[];
 const first=coordinator.runExclusive('attendance',async()=>{order.push(1);await new Promise(resolve=>setTimeout(resolve,5));order.push(2);throw Error('test');});
 const second=coordinator.runExclusive('attendance',()=>order.push(3));
 await Promise.allSettled([first,second]);assert.deepEqual(order,[1,2,3]);
 pass('Concurrent attendance recalculations are serialized and a failed run does not poison the next run');
 const ui=await import('data:text/javascript,'+encodeURIComponent(fs.readFileSync(path.join(root,'frontend/src/utils/dashboardRecords.js'),'utf8')));
 assert.equal(ui.employeeCode({biotime_emp_code:'RTC-00042',employee_id:42}),'RTC-00042');assert.equal(ui.employeeCode({biotime_emp_code:'',employee_id:'00042'}),'00042');
 assert.equal(ui.repatriateMatches({trainee_id:12,employee_id:'999'},{subject_type:'TRAINEE',subject_id:99,employee_id:'12'}),false);
 assert.equal(ui.repatriateMatches({trainee_id:12},{subject_type:'STAFF',subject_id:12}),false);
 assert.equal(ui.repatriateMatches({trainee_id:12},{subject_type:'TRAINEE',subject_id:12,employee_id:'NEW-12'}),true);
 assert.equal(ui.repatriateMatches({employee_id:'7',course_id:1},{subject_type:'TRAINEE',employee_id:'7',course_id:2}),false);
 const now=new Date('2026-11-17T07:00:00Z');
 const drops=[{trainee_id:1,drop_datetime:'2026-11-17 09:00:00',drop_status:'ACTIVE'},
  {trainee_id:2,drop_datetime:'2026-11-17 13:00:00',drop_status:'ACTIVE'},
  {trainee_id:3,drop_datetime:'2026-11-16 09:00:00',drop_status:'REJOINED',rejoin_datetime:'2026-11-17 10:00:00'}];
 assert.deepEqual(ui.activeRepatriates(drops,'2026-11-17',now).map(row=>row.trainee_id),[1]);
 assert.deepEqual(ui.activeRepatriates(drops,'2026-11-16',now).map(row=>row.trainee_id),[3]);
 pass('Repatriation cannot match an unrelated cap/row ID or reused course code; future and rejoined records are excluded');
 const dashboard=fs.readFileSync(path.join(root,'frontend/src/pages/Dashboard.jsx'),'utf8');
 const section=(start,end)=>{const a=dashboard.indexOf(start),b=dashboard.indexOf(end,a+start.length);assert.ok(a>=0&&b>a,start);return dashboard.slice(a,b);};
 const ctx={normalize:value=>String(value||'').trim().toUpperCase(),employeeCode:ui.employeeCode,repatriateMatches:ui.repatriateMatches,filterCompletedCourseRows:rows=>rows||[],manualAbsenceText:()=>'',identityKey:row=>String(row.subject_id??row.employee_id),uniqueRows:rows=>[...new Map(rows.map(row=>[row.subject_id,row])).values()]};
 vm.runInNewContext(section('function traineeRosterDashboardRow(record) {','function repatriateRecordKeys(record) {')+'\n'+section('function repatriateMatchesRow(','function medicalRestRecordApplies(')+'\nthis.merge=mergeTraineeRosterIntoRows;this.overlay=applyRepatriatesToRows;',ctx);
 const roster=[{id:1,employee_id:'RTC-00001'},{id:2,employee_id:'RTC-00002'},{id:3,employee_id:'RTC-00003'}];
 const merged=ctx.merge([{subject_id:1,employee_id:'1',attendance_status:'PRESENT',selected_punch:'2026-11-17 06:00:00'},{subject_id:2,employee_id:'1',attendance_status:'PRESENT'},{subject_id:999,attendance_status:'PRESENT'}],roster);
 assert.equal(merged.length,3);assert.equal(merged[0].employee_id,'RTC-00001');assert.equal(merged[2].attendance_status,'NOT_PROCESSED');
 const overlay=ctx.overlay(merged,[{id:44,trainee_id:1,reason:'Medical board',drop_datetime:'2026-11-17 09:00:00'}]);
 assert.equal(overlay.find(row=>row.subject_id===1).repatriate_reason,'Medical board');assert.equal(overlay.find(row=>row.subject_id===1).selected_punch,null);assert.equal(overlay.find(row=>row.subject_id===2).attendance_status,'PRESENT');
 pass('Roster headcount excludes orphan rows; missing data is not fabricated absence; repatriate lists clear stale Present punches and retain reasons');
 const processed=[];let processingFailure=false,absenceFailure=false;
 const controller=load('backend/src/controllers/biometric.controller.js',{
  '../services/biometric.service':{syncTransactionsByDate:async()=>({failed:0,attendance_dates:['2026-11-16'],synced:1})},
  '../services/biometricLive.service':{syncRecentTransactions:async()=>({failed:0,inserted:0,refreshed:1,changed:1,attendance_dates:['2026-11-16']})},
  '../services/attendanceEngine.service':{processAttendanceDate:async({attendanceDate})=>{processed.push(attendanceDate);return {attendance_date:attendanceDate,failed:processingFailure?1:0};}},
  '../services/absenceEpisode.service':{syncContinuousAbsenceForDate:async()=>({failed:absenceFailure?1:0})},
  '../integrations/zkbiotime/employeeSync.service':{syncAllEmployees:async()=>({failed:0,conflicts:0,complete:false})},
  '../integrations/zkbiotime/syncCoordinator':coordinator,
 });
 let live=await controller.runLiveTransactionSync();assert.equal(live.attendance_recalculated,true);assert.ok(processed.includes('2026-11-16'));
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Karachi',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 let response;
 await controller.syncTransactions({body:{date:today}},{json:data=>{response=data;return data;},status:()=>{throw Error('unexpected validation failure');}},error=>{throw error;});
 assert.equal(response.success,true);
 await controller.syncEmployeeMaster({},{json:data=>{response=data;return data;}},error=>{throw error;});assert.equal(response.success,false);
 pass('Corrected and late punches refresh all affected attendance dates; manual pipeline and partial master responses remain truthful');
 absenceFailure=true;
 const pending=await controller.runLiveTransactionSync();assert.equal(pending.attendance_pending,true);assert.equal(pending.attendance_recalculated,false);
 await controller.syncLiveTransactions({},{json:data=>{response=data;return data;}},error=>{throw error;});assert.equal(response.success,false);
 absenceFailure=false;processingFailure=true;
 await assert.rejects(()=>controller.runLiveTransactionSync(),/unresolved identity/);
 pass('Attendance and absence-processing failures remain pending and cannot produce a false successful synchronization');


 let supportFailure=false,snapshotResponse,snapshotError;
 const snapshot=load('backend/src/controllers/dashboardRoster.controller.js',{
  '../models/dashboardRoster.model':{getAllTraineesForDashboard:async()=>[{id:1}],getAllStaffForDashboard:async()=>[{id:2}]},
  '../models/absenceEpisode.model':{getOpenAbsences:async()=>[]},
  '../models/report.model':{getAttendanceReportAllRows:async p=>[{subject_type:p.subjectType,session_type:p.sessionType}]},
  '../models/trainingDrop.model':{getDrops:async()=>{if(supportFailure)throw Error('source unavailable');return [{id:44,trainee_id:1,reason:'Medical board'}];}},
  '../models/weekend.model':{getWeekends:async()=>[]},'../models/outdoor.model':{getOutdoorRecords:async()=>[]},
  '../models/leave.model':{getLeaves:async()=>[]},'../models/osd.model':{getRecords:async()=>[]},
  '../models/dutyRoster.model':{calculateDutyRosterAttendance:async()=>({rows:[{subject_id:2,source_type:'SECURITY_ROSTER'}]})},
  '../models/customShift.model':{calculateCustomShiftAttendance:async()=>({rows:[{subject_id:3,source_type:'CUSTOM_SHIFT'}]})},
 });
 const responseSink={set(){return this;},json(data){snapshotResponse=data;return data;},status(){return this;}};
 const request={query:{attendance_date:'2026-11-17',include_support:'1'},user:{permissions:['dashboard.view']}};
 await snapshot.dashboardSnapshot(request,responseSink,error=>{snapshotError=error;});
 assert.equal(snapshotError,undefined);assert.equal(snapshotResponse.data.supporting_data.custom_shift_rows[0].source_type,'CUSTOM_SHIFT');
 assert.equal(snapshotResponse.data.supporting_data.training_drops[0].reason,'Medical board');
 supportFailure=true;snapshotResponse=null;
 await snapshot.dashboardSnapshot(request,responseSink,error=>{snapshotError=error;});
 assert.match(snapshotError.message,/training-drops/);assert.equal(snapshotResponse,null);
 pass('Dashboard snapshot keeps all support sources together; a failed source cannot silently become a zero count');
 const auditQueries=[];
 const audit=load('backend/src/services/biometricReconciliation.service.js',{
  '../config/db':{pool:{query:async sql=>{
   auditQueries.push(sql);
   if(sql.startsWith('SELECT id,emp_code,first_name'))return [[{id:1,emp_code:'1',first_name:'Test',last_name:null,department_id:null,position_id:null},{id:9,emp_code:'OLD'}]];
   if(sql.startsWith("SELECT 'TRAINEE'"))return [[{subject_type:'TRAINEE',id:1,employee_id:'1',zkteco_emp_id:1,zkteco_emp_code:'1'}]];
   if(sql.startsWith('SELECT COUNT(*) AS pending'))return [[{pending:0}]];
   if(sql.startsWith('SELECT source_id'))return [[]];
   if(sql.startsWith('SELECT id,emp_code,punch_time'))return [[{id:10,emp_code:'RTC-01',punch_time:'2026-01-02 06:05:00'},{id:99,emp_code:'OLD',punch_time:'2026-01-02 06:00:00'}]];
   throw Error('Unexpected audit SQL');
  }}},
  '../integrations/zkbiotime/client':{getEmployees:async()=>({count:2,data:[{id:1,emp_code:'RTC-01',first_name:'Test'},{id:2,emp_code:'RTC-02'}]}),getTransactions:async()=>({count:1,data:[{id:10,emp_code:'RTC-01',punch_time:'2026-01-02 06:00:00'}]})},
  '../integrations/zkbiotime/pagination':pagination,'./transactionSync.service':sync,
 });
 const report=await audit.auditBiometricReconciliation('2026-01-02');
 assert.equal(report.in_sync,false);assert.equal(report.missing_local.length,1);assert.equal(report.local_only.length,1);assert.equal(report.changed_fields.length,1);
 assert.equal(report.transactions.changed.length,1);assert.equal(report.transactions.local_only.length,1);
 assert.ok(auditQueries.every(sql=>sql.startsWith('SELECT')));
 pass('Reconciliation detects missing/stale identities and corrected/extra transactions using read-only queries');
 console.log(`PASS ${passed}/${passed} synchronization audit regression groups`);
})().catch(error=>{console.error(error);process.exitCode=1;});
