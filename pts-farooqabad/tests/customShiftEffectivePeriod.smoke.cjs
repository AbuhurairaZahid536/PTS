const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
function load(name, dependencies) {
  const sandbox = { module:{exports:{}}, exports:{}, Date, Set, Map, console,
    require(spec) {
      if (!(spec in dependencies)) throw new Error(`Unmocked dependency: ${spec}`);
      return dependencies[spec];
    }
  };
  vm.runInNewContext(fs.readFileSync(path.join(root,name),'utf8'),sandbox,{filename:name});
  return sandbox.module.exports;
}
function makeHarness({lastOfficial='2026-10-15', originalStart='2026-10-01', originalEnd='2026-10-31',
  originalShiftStart='09:00:00', originalShiftEnd='17:00:00', failInsert=false,
  attendanceDates=['2026-10-14','2026-10-15']}={}) {
  const statements = [], dates = [...attendanceDates], groups = new Map([[9,{
    id:9,group_name:'KOT',start_date:originalStart,end_date:originalEnd,
    description:null,is_active:1
  }]]);
  let nextId=100, committed=0, rolledBack=0;
  const connection={
    async beginTransaction(){statements.push(['BEGIN']);},
    async commit(){committed++;statements.push(['COMMIT']);},
    async rollback(){rolledBack++;statements.push(['ROLLBACK']);},
    release(){},
    async query(sql, params=[]) {
      const q=sql.replace(/\s+/g,' ').trim();
      statements.push([q,params]);
      if(q.includes('SELECT id FROM custom_shift_groups') && q.includes('FOR UPDATE')) return [[{id:9}]];
      if(q.includes('SELECT * FROM custom_shift_groups')) return [[groups.get(Number(params[0]))].filter(Boolean)];
      if(q.includes('FROM custom_shift_definitions') && q.includes('WHERE group_id IN')) {
        return [[{id:51,group_id:9,shift_name:'Old Shift',start_time:originalShiftStart,
          end_time:originalShiftEnd,start_punch_from:originalShiftStart,
          start_punch_to:originalShiftStart,end_punch_from:originalShiftEnd,
          end_punch_to:originalShiftEnd,sort_order:0}]];
      }
      if(q.includes('FROM custom_shift_assignments csa') && q.includes('JOIN staff')) {
        return [[{id:61,group_id:9,shift_id:51,staff_id:7,employee_id:'7',
          effective_from:originalStart,effective_to:originalEnd,
          schedule_type:'DAILY', weekdays_csv:null}]];
      }
      if(q.includes('FROM custom_shift_assignment_dates')) return [[]];
      if(q.includes('FROM custom_shift_attendance') && q.includes('COUNT(*)')) return [[{
        total:lastOfficial?1:0,oldest_date:lastOfficial,latest_date:lastOfficial
      }]];
      if(q.includes('FROM staff') && q.includes('is_deleted')) return [[{id:7}]];
      if(q.startsWith('DELETE FROM custom_shift_attendance')) {
        for(let i=dates.length-1;i>=0;i--) {
          if(dates[i]>=params[1] && dates[i]<=params[2] && dates[i]!==lastOfficial) dates.splice(i,1);
        }
        return [{affectedRows:1}];
      }
      if(q.startsWith('INSERT INTO custom_shift_groups')) {
        if(failInsert) throw new Error('Simulated database failure');
        const id=++nextId;
        groups.set(id,{id,group_name:params[0],start_date:params[1],end_date:params[2],is_active:params[4]});
        return [{insertId:id}];
      }
      if(q.startsWith('INSERT INTO custom_shift_definitions')) return [{insertId:201}];
      if(q.startsWith('INSERT INTO custom_shift_assignments')) return [{insertId:301}];
      if(q.startsWith('UPDATE custom_shift_groups')) {
        const id=Number(params[params.length-1]);
        if(q.includes('SET is_active = 0')) groups.get(id).is_active=0;
        else if(q.includes('SET end_date =')) groups.get(id).end_date=params[0];
        return [{affectedRows:1}];
      }
      return [[]];
    },
  };
  const pool={getConnection:async()=>connection, query:connection.query.bind(connection)};
  const service=load('backend/src/services/shiftDuty.service.js', {'../config/db':{pool}});
  const model=load('backend/src/models/customShift.model.js',{
    '../config/db':{pool},'./attendance.model':{getExceptionData:async()=>({})},
    '../services/shiftDuty.service.js':service,
    '../services/shiftDuty.service':{...service,findStaffShiftOverlap:async()=>null}
  });
  return {model,statements,dates,groups,commits:()=>committed,rollbacks:()=>rolledBack};
}
function payload(start='2026-10-15',end='2026-10-31',shiftStart='09:00:00',shiftEnd='17:00:00') {
  return {group_name:'KOT',start_date:start,end_date:end,is_active:true,description:'New period',
    shifts:[{shift_name:'New Shift',start_time:shiftStart,end_time:shiftEnd,
      start_punch_from:shiftStart,start_punch_to:shiftStart,
      end_punch_from:shiftEnd,end_punch_to:shiftEnd,
      assignments:[{staff_id:7,effective_from:start,effective_to:end,schedule_type:'DAILY'}]
    }]
  };
}
const mentions=(h,text)=>h.statements.some(([sql])=>sql.includes(text));
const indexOf=(h,text)=>h.statements.findIndex(([sql])=>sql.includes(text));
(async()=>{
  let h=makeHarness({lastOfficial:'2026-10-14'});
  let updated=await h.model.updateCustomShiftGroup(9,payload(),77);
  assert.equal(updated.effective_period_created,true);
  assert.equal(updated.previous_group_id,9);
  assert.equal(updated.previous_group_end_date,'2026-10-14');
  assert.equal(h.groups.get(9).end_date,'2026-10-14');
  assert.deepEqual(h.dates,['2026-10-14','2026-10-15']);
  assert(!mentions(h,'DELETE FROM custom_shift_attendance'));
  assert(!mentions(h,'DELETE FROM custom_shift_definitions'));
  assert(!mentions(h,'DELETE FROM custom_shift_assignments'));
  assert(!mentions(h,'UPDATE custom_shift_assignments'));
  assert(indexOf(h,'FOR UPDATE') < indexOf(h,'FROM custom_shift_attendance'));
  assert(h.statements.some(([sql]) => sql.includes('FROM custom_shift_attendance') && sql.includes('COUNT(*)') && !sql.includes('attendance_status IN')));
  assert.equal(h.commits(),1);
  console.log('PASS Future effective period: previous group closed without deleting official graph');

  h=makeHarness({lastOfficial:'2026-10-15'});
  updated=await h.model.updateCustomShiftGroup(9,payload(),77);
  assert.equal(updated.effective_period_created,true);
  assert.equal(updated.historical_reprocessing_required,true);
  assert.equal(h.groups.get(9).end_date,'2026-10-14');
  assert(h.dates.includes('2026-10-15'));
  assert(!mentions(h,'DELETE FROM custom_shift_attendance'));
  assert.equal(h.commits(),1);
  console.log('PASS Same-day official attendance allows save while preserving biometric history');

  h=makeHarness({lastOfficial:'2026-10-16',attendanceDates:['2026-10-16']});
  updated=await h.model.updateCustomShiftGroup(9,payload(),77);
  assert.equal(updated.backdated_revision,true);
  assert(h.dates.includes('2026-10-16'));
  console.log('PASS Past start date before latest official attendance accepted; existing evidence retained');

  h=makeHarness({lastOfficial:'2026-10-15',originalStart:'2026-10-15'});
  updated=await h.model.updateCustomShiftGroup(9,payload('2026-10-10'),77);
  assert.equal(updated.start_date,'2026-10-10');
  assert.equal(updated.previous_group_end_date,null);
  assert.equal(h.groups.get(9).is_active,0);
  assert(h.dates.includes('2026-10-15'));
  assert(!mentions(h,'DELETE FROM custom_shift_definitions'));
  assert.equal(h.commits(),1);
  console.log('PASS Backdated start before original group: old archived; requested start saved');

  h=makeHarness({lastOfficial:'2026-10-15',originalStart:'2026-10-10'});
  updated=await h.model.updateCustomShiftGroup(9,payload('2026-10-12'),77);
  assert.equal(h.groups.get(9).end_date,'2026-10-11');
  assert(h.dates.includes('2026-10-15'));
  console.log('PASS Backdated split within old period: official attendance preserved after split');

  h=makeHarness({lastOfficial:null});
  updated=await h.model.updateCustomShiftGroup(9,payload(),77);
  assert.equal(updated.effective_period_created,undefined);
  assert(mentions(h,'DELETE FROM custom_shift_definitions'));
  assert.equal(h.commits(),1);
  console.log('PASS Group with no official history retains normal update path');

  h=makeHarness({lastOfficial:'2026-10-14',originalEnd:'2026-10-14'});
  updated=await h.model.updateCustomShiftGroup(9,payload('2026-10-18'),77);
  assert.equal(updated.previous_group_end_date,'2026-10-14');
  assert(!mentions(h,'DELETE FROM custom_shift_definitions'));
  assert(h.dates.includes('2026-10-14'));
  console.log('PASS Nonoverlapping historical dates retained');

  h=makeHarness({lastOfficial:'2026-10-14',originalShiftStart:'22:00:00',originalShiftEnd:'06:00:00'});
  await assert.rejects(()=>h.model.updateCustomShiftGroup(9,payload('2026-10-15','2026-10-31','04:00:00','12:00:00'),77),/overlapping overnight duty/);
  assert.equal(h.commits(),0);
  console.log('PASS Genuine double-booked overnight duty still prohibited');

  h=makeHarness({lastOfficial:'2026-10-14',failInsert:true});
  await assert.rejects(()=>h.model.updateCustomShiftGroup(9,payload(),77),/Simulated database failure/);
  assert.equal(h.commits(),0);
  assert.equal(h.rollbacks(),1);
  console.log('PASS Database failure rolls back new version transaction');

  console.log('PASS 9/9 Backdated Custom Shift regression checks');
})().catch(error=>{console.error(error);process.exitCode=1;});
