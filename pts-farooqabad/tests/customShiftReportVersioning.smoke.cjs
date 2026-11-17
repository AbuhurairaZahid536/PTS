const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');

function load(file, dependencies) {
  const sandbox = {
    module: {exports:{}}, exports:{}, require(key) {
      if (!(key in dependencies)) throw new Error(`Missing stub: ${key}`);
      return dependencies[key];
    }, console, Date, Map, Set,
  };
  vm.runInNewContext(fs.readFileSync(path.join(root,file),'utf8'),sandbox,{filename:file});
  return sandbox.module.exports;
}

const queries = [];
const pool = {
  async query(sql, params = {}) {
    queries.push({sql: String(sql).replace(/\s+/g,' ').trim(),params});
    return [[]];
  },
};
const report = load('backend/src/models/report.model.js',{
  '../config/db': {pool},
  './absenceEpisode.model': {getOpenAbsences: async()=>[]},
  './attendanceStatus.sql': require('../backend/src/models/attendanceStatus.sql'),
});
const profile = load('backend/src/models/profile.model.js', {
  '../config/db': {pool},
  './profileAbsence.model': {getProfileContinuousAbsenceHistory: async()=>[]},
});

function assertEffectiveVersionFilter(sql) {
  assert.match(sql,/NOT EXISTS\s*\(\s*SELECT 1 FROM custom_shift_attendance replacement/i);
  assert.match(sql,/replacement\.staff_id = csa\.staff_id/i);
  assert.match(sql,/replacement\.attendance_date = csa\.attendance_date/i);
  assert.match(sql,/replacement_group\.is_active = 1/i);
  assert.match(sql,/csg\.is_active = 0/i);
  assert.match(sql,/replacement_group\.start_date AND replacement_group\.end_date/i);
}
(async () => {
  await report.getCustomShiftReport({attendanceDate:'2026-10-10'});
  assert.equal(queries.length,3);
  for (const {sql} of queries) assertEffectiveVersionFilter(sql);
  console.log('PASS Custom Shift report rows/pagination/totals share version-aware suppression');

  queries.length=0;
  await report.getCustomShiftReportFilters('2026-10-10');
  assert.equal(queries.length,2);
  for (const {sql} of queries) {
    assertEffectiveVersionFilter(sql);
    assert.match(sql,/csa\.attendance_date = :attendanceDate/);
    assert.match(sql,/INNER JOIN custom_shift_groups csg/);
  }
  console.log('PASS Custom Shift report group/shift filters exclude superseded display rows');

  queries.length=0;
  await report.getCustomShiftReportFilters();
  for (const {sql} of queries) assertEffectiveVersionFilter(sql);
  console.log('PASS Undated report filters remain valid SQL');

  queries.length=0;
  await profile.getStaffCustomShiftHistory(7);
  assert.equal(queries.length,1);
  assertEffectiveVersionFilter(queries[0].sql);
  console.log('PASS Staff profile reads only effective attendance rows where replacements exist');

  const model = fs.readFileSync(path.join(root,'backend/src/models/customShift.model.js'),'utf8');
  assert.match(model,/SELECT\s+COUNT\(\*\) AS total,[\s\S]*?FROM custom_shift_attendance\s+WHERE group_id = \?/);
  const versioned = model.slice(model.indexOf('BACKDATED CUSTOM SHIFT REVISION'),model.indexOf('await validateStaffIds(\n      connection,\n      data\n    );',model.indexOf('BACKDATED CUSTOM SHIFT REVISION')));
  assert(!/DELETE FROM custom_shift_attendance/.test(versioned));
  assert(!/DELETE FROM custom_shift_definitions/.test(versioned));
  console.log('PASS Retroactive edits retain every previous attendance/definition row for audit');
  console.log('PASS 5/5 Backdated reporting safety checks');
})().catch(error=>{ console.error(error); process.exitCode=1; });
