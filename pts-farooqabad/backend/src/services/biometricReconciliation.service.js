const { pool } = require("../config/db");
const { getEmployees, getTransactions } = require("../integrations/zkbiotime/client");
const { apiPages } = require("../integrations/zkbiotime/pagination");
async function auditBiometricReconciliation(attendanceDate) {
  const now = new Date(Date.now()+5*3600000).toISOString().slice(0,19).replace('T',' ');
  const date = attendanceDate || now.slice(0,10);
  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(date) || !Number.isFinite(Date.parse(date+'T00:00:00Z')) || new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date || date>now.slice(0,10)) {
    const error = new Error('Select a valid current or previous reconciliation date.'); error.statusCode=400;throw error;
  }
  const remote = [];
  for await (const page of apiPages(getEmployees)) remote.push(...page.rows);
  const [mirror] = await pool.query("SELECT id,emp_code,first_name,last_name,department_id,position_id,last_synced_at FROM zkteco_employees");
  const [mapped] = await pool.query(`SELECT 'TRAINEE' AS subject_type,id,employee_id,zkteco_emp_id,zkteco_emp_code FROM trainees WHERE is_deleted=0 AND zkteco_emp_id IS NOT NULL
    UNION ALL SELECT 'STAFF',id,employee_id,zkteco_emp_id,zkteco_emp_code FROM staff WHERE is_deleted=0 AND zkteco_emp_id IS NOT NULL`);
  const remoteById = new Map(remote.map(row => [String(row.id),row]));
  const mirrorById = new Map(mirror.map(row => [String(row.id),row]));
  const missing = remote.filter(row => !mirrorById.has(String(row.id))).map(row => ({id:row.id,emp_code:String(row.emp_code)}));
  const stale = mirror.filter(row => !remoteById.has(String(row.id))).map(row => ({id:row.id,emp_code:row.emp_code}));
  const differences = [];
  for (const row of remote) {
    const saved = mirrorById.get(String(row.id));
    if (!saved) continue;
    const checks = {emp_code:row.emp_code,first_name:row.first_name,last_name:row.last_name,
      department_id:row.department?.id ?? null,position_id:row.position?.id ?? null};
    const fields = Object.keys(checks).filter(key => String(checks[key] ?? '') !== String(saved[key] ?? ''));
    if (fields.length) differences.push({id:row.id,emp_code:String(row.emp_code),fields});
  }
  const mappedIds = new Set(mapped.map(row => String(row.zkteco_emp_id)));
  const unmapped = remote.filter(row => !mappedIds.has(String(row.id))).map(row => ({id:row.id,emp_code:String(row.emp_code)}));
  const invalidMappings = mapped.filter(row => !remoteById.has(String(row.zkteco_emp_id)) || String(row.zkteco_emp_code) !== String(remoteById.get(String(row.zkteco_emp_id))?.emp_code));
  const duplicateMappings = [...new Set(mapped.filter((row,index) => mapped.findIndex(other => String(other.zkteco_emp_id)===String(row.zkteco_emp_id))!==index).map(row => String(row.zkteco_emp_id)))];
  let queue;
  try { const [[result]] = await pool.query('SELECT COUNT(*) AS pending,MIN(first_failed_at) AS oldest_failure FROM biometric_sync_failures'); const [rows] = await pool.query('SELECT source_id,error_text,attempts,first_failed_at,last_failed_at FROM biometric_sync_failures ORDER BY first_failed_at LIMIT 100'); queue={...result,rows}; }
  catch(error) { if(error.code!=='ER_NO_SUCH_TABLE') throw error; queue={pending:null,status:'NOT_INITIALIZED'}; }
  const startTime = `${date} 00:00:00`, endTime = date===now.slice(0,10)?now:`${date} 23:59:59`;
  const { mapTransaction } = require('./transactionSync.service');
  const transactionSource = new Map(), invalidSource=[];
  for await (const page of apiPages(getTransactions,{start_time:startTime,end_time:endTime})) {
    for (const item of page.rows) {
      try { const mapped=mapTransaction(item);transactionSource.set(mapped.id,mapped); }
      catch(error) { invalidSource.push({id:item.id??null,error:error.message}); }
    }
  }
  const [localTransactions] = await pool.query('SELECT id,emp_code,punch_time,punch_state,verify_type FROM zkteco_transactions WHERE punch_time>=? AND punch_time<=?',[startTime,endTime]);
  const localTransactionMap = new Map(localTransactions.map(row=>[String(row.id),row]));
  const transactionMissing = [...transactionSource.keys()].filter(id=>!localTransactionMap.has(id));
  const transactionLocalOnly = [...localTransactionMap.keys()].filter(id=>!transactionSource.has(id));
  const transactionChanged = [...transactionSource].filter(([id,row])=>{
    const local=localTransactionMap.get(id);return local && ['emp_code','punch_time','punch_state','verify_type'].some(key=>String(row[key]??'')!==String(local[key]??''));
  }).map(([id])=>id);
  const transactions={date,start_time:startTime,end_time:endTime,biotime:transactionSource.size,local:localTransactions.length,
    missing_local:transactionMissing,local_only:transactionLocalOnly,changed:transactionChanged,invalid_source:invalidSource};
  return {checked_at:new Date().toISOString(),source:'ZKBioTime',complete:true,transactions,
    counts:{biotime:remote.length,local_mirror:mirror.length,current_mappings:mapped.length},
    in_sync:!missing.length&&!stale.length&&!differences.length&&!unmapped.length&&!invalidMappings.length&&!duplicateMappings.length&&queue.pending===0&&!transactionMissing.length&&!transactionLocalOnly.length&&!transactionChanged.length&&!invalidSource.length,
    missing_local:missing,local_only:stale,changed_fields:differences,unmapped,invalid_mappings:invalidMappings,duplicate_mappings:duplicateMappings,failed_transactions:queue,
    scope_note:'BioTime owns current identities and punches. PTS retains historical courses, leave, OSD and repatriation records; total historical PTS headcount is not the BioTime employee count.'};
}
module.exports={auditBiometricReconciliation};
