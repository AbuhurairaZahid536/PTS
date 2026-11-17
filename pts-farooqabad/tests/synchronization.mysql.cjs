const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const credentialsFile=process.argv[2];
if(!credentialsFile){console.log('SKIP MySQL integration: pass the isolated local credentials JSON file.');process.exit(0);}
const c=JSON.parse(fs.readFileSync(credentialsFile,'utf8'));
if(c.host!=='127.0.0.1'||c.port!==3307||!c.rootPassword)throw Error('Integration test is restricted to the isolated localhost:3307 MySQL runtime.');
const mysql=require('../backend/node_modules/mysql2/promise');
function moduleWith(file,mocks){const context={module:{exports:{}},console,process,Buffer,setTimeout,Date,require:name=>Object.hasOwn(mocks,name)?mocks[name]:require(name)};vm.runInNewContext(fs.readFileSync(path.join(root,file),'utf8'),context,{filename:file});return context.module.exports;}
(async()=>{
 const admin=await mysql.createConnection({host:c.host,port:c.port,user:'root',password:c.rootPassword});
 const name=`pts_sync_test_${process.pid}_${Date.now()}`;
  assert.match(name,/^pts_sync_test_[0-9]+_[0-9]+$/);
 let pool;
 try{
  await admin.query('CREATE DATABASE '+mysql.escapeId(name)+' CHARACTER SET utf8mb4');
  pool=mysql.createPool({host:c.host,port:c.port,user:'root',password:c.rootPassword,database:name,namedPlaceholders:true,dateStrings:true,timezone:'+05:00',connectionLimit:3});
  const ddl=[
   'courses (id INT PRIMARY KEY,course_name VARCHAR(100),course_code VARCHAR(30),start_date DATE,end_date DATE)',
   'platoons (id INT PRIMARY KEY,platoon_number INT,platoon_name VARCHAR(100))',
   'trainees (id INT PRIMARY KEY,employee_id VARCHAR(100),zkteco_emp_code VARCHAR(100),first_name VARCHAR(100),last_name VARCHAR(100),course_id INT,platoon_id INT,is_staff_exempt INT DEFAULT 0,is_deleted INT DEFAULT 0)',
   'staff (id INT PRIMARY KEY,employee_id VARCHAR(100),zkteco_emp_code VARCHAR(100),first_name VARCHAR(100),last_name VARCHAR(100),category_id INT,branch_id INT,designation VARCHAR(100),belt_no VARCHAR(100),is_deleted INT DEFAULT 0)',
   'staff_categories (id INT PRIMARY KEY,category_name VARCHAR(100))','staff_branches (id INT PRIMARY KEY,branch_name VARCHAR(100))',
   'trainee_training_drop (id INT PRIMARY KEY,trainee_id INT,reason TEXT,drop_datetime DATETIME)',
   'trainee_osd (id INT PRIMARY KEY,trainee_id INT,start_datetime DATETIME,end_datetime DATETIME,reason TEXT)',
   'staff_osd (id INT PRIMARY KEY,staff_id INT,start_datetime DATETIME,end_datetime DATETIME,reason TEXT)',
   'absence_episodes (id INT PRIMARY KEY,subject_type VARCHAR(20),subject_id INT,absent_from DATETIME,return_punch_at DATETIME,status VARCHAR(20))',
   `zkteco_transactions (id BIGINT PRIMARY KEY,emp BIGINT,emp_code VARCHAR(100),first_name VARCHAR(100),last_name VARCHAR(100),department VARCHAR(100),position VARCHAR(100),punch_time DATETIME,punch_state VARCHAR(40),punch_state_display VARCHAR(100),verify_type INT,verify_type_display VARCHAR(100),work_code VARCHAR(100),gps_location VARCHAR(100),area_alias VARCHAR(100),terminal_sn VARCHAR(100),temperature DOUBLE,is_mask VARCHAR(30),terminal_alias VARCHAR(100),upload_time DATETIME,longitude DOUBLE,latitude DOUBLE,synced_at DATETIME,sync_batch_id VARCHAR(100),sync_status VARCHAR(20),sync_error TEXT)`,
   `attendance_records (id INT PRIMARY KEY,attendance_date DATE,subject_type VARCHAR(20),subject_id INT,employee_id VARCHAR(100),session_type VARCHAR(20),selected_punch DATETIME,transaction_id BIGINT,attendance_status VARCHAR(30),timing_status VARCHAR(30),timing_minutes INT,exemption_type VARCHAR(50),exemption_record_id INT,exemption_description TEXT,has_manual_absence INT,manual_absence_data TEXT,timetable_name VARCHAR(100),window_start DATETIME,window_end DATETIME,early_window_start DATETIME,late_window_end DATETIME,processed_at DATETIME)`
  ];
  for(const table of ddl)await pool.query('CREATE TABLE '+table);
  await pool.query("INSERT INTO courses VALUES (1,'Recruit Course','RTC','2026-01-01','2026-12-31')");
  await pool.query("INSERT INTO platoons VALUES (1,1,'First')");
  for(let id=1;id<=3;id++)await pool.query('INSERT INTO trainees (id,employee_id,zkteco_emp_code,first_name,course_id,platoon_id) VALUES (?,?,?,?,1,1)',[id,String(id),'RTC-0000'+id,'Test '+id]);
  await pool.query("INSERT INTO trainee_osd VALUES (7,1,'2026-01-02 08:00:00','2026-01-02 12:00:00','Court duty')");
  await pool.query("INSERT INTO staff_osd VALUES (7,99,'2026-01-02 09:00:00','2026-01-02 13:00:00','Wrong subject reason')");
  await pool.query("INSERT INTO trainee_training_drop VALUES (8,2,'Medical board','2026-01-02 09:00:00')");
  await pool.query("INSERT INTO absence_episodes VALUES (10,'TRAINEE',3,'2026-01-01 06:00:00','2026-01-03 09:00:00','RETURNED')");
  for(const [id,subject,status,type,record] of [[1,1,'EXEMPT','OSD',7],[2,2,'EXEMPT','TRAINING_DROP',8],[3,3,'ABSENT',null,null]])
   await pool.query(`INSERT INTO attendance_records (id,attendance_date,subject_type,subject_id,employee_id,session_type,attendance_status,timing_status,exemption_type,exemption_record_id,window_start,window_end,early_window_start,late_window_end)
    VALUES (?,'2026-01-02','TRAINEE',?,?,'MORNING',?,'NO_PUNCH',?,?,'2026-01-02 06:00:00','2026-01-02 07:00:00','2026-01-02 05:00:00','2026-01-02 08:00:00')`,[id,subject,String(subject),status,type,record]);
  const model=moduleWith('backend/src/models/report.model.js',{'../config/db':{pool},'./absenceEpisode.model':{getOpenAbsences:async()=>[]},'./attendanceStatus.sql':require('../backend/src/models/attendanceStatus.sql')});
  const params={attendanceDate:'2026-01-02',subjectType:'TRAINEE',sessionType:'MORNING'};
  const result=await model.getAttendanceReport(params);
  assert.equal(result.pagination.total,3);assert.equal(result.rows.length,3);
  const osd=result.rows.find(row=>row.subject_id===1),drop=result.rows.find(row=>row.subject_id===2),absent=result.rows.find(row=>row.subject_id===3);
  assert.equal(osd.employee_id,'RTC-00001');assert.equal(osd.osd_reason,'Court duty');assert.equal(osd.osd_start_datetime,'2026-01-02 08:00:00');assert.equal(osd.osd_end_datetime,'2026-01-02 12:00:00');
  assert.equal(drop.repatriate_reason,'Medical board');assert.equal(drop.exemption_description,'Medical board');
  assert.equal(absent.absence_start,'2026-01-01 06:00:00');assert.equal(absent.absence_end,null);assert.equal(absent.absence_duration_seconds,151199);
  assert.equal((await model.getAttendanceReportAllRows(params)).length,3);assert.equal((await model.getAttendanceReportExport(params))[0].employee_id,'RTC-00001');
  console.log('PASS Real MySQL: exact cap codes, typed OSD/repatriate reasons, historical absence boundaries, report counts and export rows');
  await pool.query("INSERT INTO trainees (id,employee_id,zkteco_emp_code,first_name,course_id,platoon_id) VALUES (4,'4','RTC-00004','Pending trainee',1,1)");
  await pool.query(`INSERT INTO attendance_records (id,attendance_date,subject_type,subject_id,employee_id,session_type,attendance_status,timing_status,late_window_end)
    VALUES (4,DATE(DATE_ADD(UTC_TIMESTAMP(),INTERVAL 5 HOUR)),'TRAINEE',4,'4','MORNING','ABSENT','NO_PUNCH',DATE_ADD(UTC_TIMESTAMP(),INTERVAL 7 HOUR))`);
  const [[clock]]=await pool.query("SELECT DATE_FORMAT(DATE_ADD(UTC_TIMESTAMP(),INTERVAL 5 HOUR),'%Y-%m-%d') AS today");
  const liveParams={...params,attendanceDate:clock.today};
  const liveReport=await model.getAttendanceReport(liveParams);
  assert.equal(liveReport.rows[0].attendance_status,'PENDING');assert.equal(liveReport.summary.pending,1);assert.equal(liveReport.summary.absent,0);
  const attendance=moduleWith('backend/src/models/attendance.model.js',{'../config/db':{pool},'./attendanceStatus.sql':require('../backend/src/models/attendanceStatus.sql')});
  const liveAttendance=await attendance.getAttendanceRecords(liveParams);
  assert.equal(liveAttendance[0].attendance_status,'PENDING');assert.equal(liveAttendance[0].employee_id,'RTC-00004');
  const liveSummary=await attendance.getSummary(clock.today,'TRAINEE');assert.equal(liveSummary.pending,1);assert.equal(liveSummary.absent,0);
  console.log('PASS Real MySQL: open punch windows stay Pending consistently in attendance rows, reports and both summaries');

  const pagination=require('../backend/src/integrations/zkbiotime/pagination');
  let source=[{id:1,emp_code:'RTC-00001',punch_time:'2026-01-02 06:00:00',verify_type:'bad',temperature:'bad'},{id:2,emp_code:'RTC-00002',punch_time:'bad'}];
  const sync=moduleWith('backend/src/services/transactionSync.service.js',{'../config/db':{pool},'../integrations/zkbiotime/pagination':pagination,'../integrations/zkbiotime/client':{getTransactions:async()=>({count:source.length,data:source})}});
  const window={startTime:'2026-01-02 00:00:00',endTime:'2026-01-02 23:59:59',batchId:'INTEGRATION'};
  let saved=await sync.syncTransactionWindow(window);assert.equal(saved.failed,1);assert.equal(saved.inserted,1);
  source=[{id:2,emp_code:'RTC-00002',punch_time:'2026-01-02 06:05:00'},{id:1,emp_code:'RTC-00001',punch_time:'2026-01-02 06:01:00'}];
  saved=await sync.syncTransactionWindow(window);assert.equal(saved.failed,0);assert.equal(saved.failures.length,0);assert.equal(saved.complete,true);
  const [[count]]=await pool.query('SELECT COUNT(*) AS total FROM zkteco_transactions');assert.equal(count.total,2);
  const [[corrected]]=await pool.query('SELECT punch_time FROM zkteco_transactions WHERE id=1');assert.equal(corrected.punch_time,'2026-01-02 06:01:00');

  source=[{id:1,emp_code:'RTC-00001',punch_time:'2026-01-03 06:01:00'}];
  saved=await sync.syncTransactionWindow(window);assert.ok(saved.attendance_dates.includes('2026-01-02'));assert.ok(saved.attendance_dates.includes('2026-01-03'));assert.equal(saved.changed,1);
  saved=await sync.syncTransactionWindow(window);assert.equal(saved.changed,0);assert.equal(saved.unchanged,1);assert.equal(saved.attendance_dates.length,0);
  console.log('PASS Real MySQL: shared upsert, numeric normalization, durable failure queue, recovery, correction and duplicate protection');
 } finally {
  if(pool)await pool.end();
  assert.match(name,/^pts_sync_test_[0-9]+_[0-9]+$/);
  await admin.query('DROP DATABASE '+mysql.escapeId(name));
  await admin.end();
 }
})().catch(error=>{console.error(error.message);process.exitCode=1;});
