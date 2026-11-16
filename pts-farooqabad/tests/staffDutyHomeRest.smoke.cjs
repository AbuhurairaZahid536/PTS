const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { pathToFileURL } = require('node:url');
const root = path.resolve(__dirname, '..');
let passed = 0;
function ok(name) { passed++; console.log('PASS',name); }
(async () => {
  const filename = path.join(root,'frontend/src/utils/staffDashboardDuty.js');
  const {reconcileStaffCategoryDuty} = await import('data:text/javascript,'+encodeURIComponent(fs.readFileSync(filename,'utf8')));
  const roster = Array.from({length:56},(_,i)=>({id:i+1, employee_id:`SS-${i+1}`, category_name:'Security Staff', first_name:'Staff', last_name:String(i+1)}));
  const sessionRows = roster.slice(0,34).map(s=>({subject_type:'STAFF', subject_id:s.id, category_name:s.category_name, attendance_status: 'PRESENT'}));
  const dutySet = new Set(roster.slice(34).map(s=>s.id));
  const rows = reconcileStaffCategoryDuty({roster,rows:sessionRows,dutyIds:dutySet});
  assert.equal(rows.length,56);
  assert.equal(rows.filter(x=>x.attendance_status==='PRESENT').length,34);
  assert.equal(rows.filter(x=>x.attendance_status==='DUTY').length,22);
  ok('Security Staff 56 = 34 regular + 22 Duty');
  assert.ok(rows.every(x=>x.category_name==='Security Staff' && x.subject_type==='STAFF')); ok('Duty staff remain in master category');
  const duplicated = reconcileStaffCategoryDuty({roster:[...roster,roster[45]], rows: [...sessionRows,...sessionRows],dutyIds:dutySet});
  assert.equal(duplicated.length,56); ok('Duplicated roster and shift assignments never increase headcount');
  assert.ok(rows.every(x=>x.employee_id.startsWith('SS-')&&x.subject_id>0)); ok('Roster identity and employee ID preserved');
  const missing = reconcileStaffCategoryDuty({roster,rows:sessionRows.slice(0,33),dutyIds:dutySet});
  assert.equal(missing.filter(x=>x.attendance_status==='NOT_PROCESSED').length,1); ok('Missing attendance never creates false Present/Absent');
  const other = [{id:100,employee_id:'O-1',category_name:'Admin Staff'}];
  assert.equal(reconcileStaffCategoryDuty({roster:[...roster,...other],rows:sessionRows,dutyIds:dutySet}).length,57); ok('Other categories preserved');
  // Mock only model/controller dependencies. No DB, no request, no writes.
  const bridgePath=path.join(root,'backend/src/controllers/homeRestLeaveBridge.controller.js');
  const original=Module._load;
  let record = {id:17,subject_id:5,home_rest:1,medical_rest:1, workflow_status:'ACTIVE', outdoor_purpose:'Hospital',remarks:'Original',start_datetime:'2026-10-14 00:00:00',end_datetime:'2026-10-14 23:59:59', medical_rest_start_datetime:'2026-10-14 13:00:00', medical_rest_end_datetime:'2026-10-15 13:00:00',home_rest_start_datetime:'2026-10-14 18:00:00',home_rest_end_datetime:'2026-10-16 08:00:00'};
  let captured;
  try {
    Module._load = function(request,parent,isMain){
      if(parent?.filename===bridgePath && request==='../models/outdoor.model') return {normalizeSubjectType:t=>['STAFF','TRAINEE'].includes(t)?t:null,getOutdoorById:async()=>record};
      if(parent?.filename===bridgePath && request==='./outdoor.controller') return {editOutdoor:(req,res)=>{captured=req.body;res.statusCode=200;res.called=true;}};
      return original.apply(this,arguments);
    };
    const {updateHomeRestFromLeave} = require(bridgePath);
    const makeReq=(reqPath,body={})=>({params:{subjectType:'TRAINEE',id:'17'},path:reqPath,body});
    const res=()=>({status(n){this.statusCode=n;return this},json(v){this.body=v;return this}});
    let response=res();
    await updateHomeRestFromLeave(makeReq('/TRAINEE/17/home-rest',{home_rest_start_datetime:'2026-10-14 19:00:00',home_rest_end_datetime:'2026-10-16 09:00:00',outdoor_purpose:'HACK',medical_rest:false}),response,e=>{throw e});
    assert.equal(captured.home_rest_start_datetime,'2026-10-14 19:00:00');
    assert.equal(captured.outdoor_purpose,'Hospital');assert.equal(captured.medical_rest,true);ok('Home Rest edit changes only Home Rest period; forged fields ignored');
    response=res();await updateHomeRestFromLeave(makeReq('/TRAINEE/17/home-rest/cancel',{cancellation_reason:'Correction required'}),response,e=>{throw e});
    assert.equal(captured.home_rest,false);assert.equal(captured.medical_rest,true);assert.equal(captured.outdoor_purpose,'Hospital');assert.match(captured.remarks,/Correction required/); ok('Cancel preserves Medical Rest/Outdoor and audits cancellation reason');
    response=res();await updateHomeRestFromLeave(makeReq('/TRAINEE/17/home-rest/cancel',{}),response,e=>{throw e});assert.equal(response.statusCode,400);ok('Cancellation requires reason');
    record={...record,home_rest:0};response=res();await updateHomeRestFromLeave(makeReq('/TRAINEE/17/home-rest',{home_rest_start_datetime:'2026-10-14 19:00:00'}),response,e=>{throw e});assert.equal(response.statusCode,404);ok('Leave-only route rejects non-Home-Rest Outdoor records');
    record={...record,home_rest:1,workflow_status:'CANCELLED'};response=res();await updateHomeRestFromLeave(makeReq('/TRAINEE/17/home-rest/cancel',{cancellation_reason:'x'}),response,e=>{throw e});assert.equal(response.statusCode,409);ok('Closed Outdoor record cannot be modified');
    const routes=fs.readFileSync(path.join(root,'backend/src/routes/outdoor.routes.js'),'utf8');
    assert.match(routes,/"\/:subjectType\/:id\/home-rest"\s*,\s*requirePermission\("leave\.edit"\)/);assert.match(routes,/"\/:subjectType\/:id\/home-rest\/cancel"\s*,\s*requirePermission\("leave\.cancel"\)/);ok('Home Rest endpoints require Leave-specific permissions');
  } finally {Module._load=original;}
  const dash=fs.readFileSync(path.join(root,'frontend/src/pages/Dashboard.jsx'),'utf8');
  assert.match(dash,/reconcileStaffCategoryDuty\(\{/);assert.match(dash,/shiftDutyStaffIds/);assert.match(dash,/staffStatusNames\(statement\.rows\)/); ok('Category and overall Dashboard wired to roster reconciliation');
  console.log(`PASS ${passed}/${passed} targeted staff Duty & Home Rest tests`);
})().catch(e=>{console.error(e);process.exit(1)});
