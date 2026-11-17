const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ExcelJS=require('../backend/node_modules/exceljs');
const root=path.resolve(__dirname,'..');
const rows=[1,2].map(id=>({id,employee_id:'RTC-000'+id,emp_code:'RTC-000'+id,subject_type:'TRAINEE',subject_name:'Test '+id,first_name:'Test',last_name:String(id),attendance_status:'PRESENT',punch_time:'2026-11-17 07:00:00',selected_punch:'2026-11-17 07:00:00',absent_from:'2026-11-16 07:00:00',period_seconds:86400,status:'OPEN',workflow_status:'APPROVED'}));
class CapturingWorkbook extends ExcelJS.Workbook {
  constructor(){super();const write=this.xlsx.write.bind(this.xlsx);this.xlsx.write=async (res,...args)=>{if(res.captureWorkbook)res.workbook=this;else return write(res,...args);};}
}
function load(file,mocks={}){const Module=require('node:module');const filename=path.join(root,file);const loaded=new Module(filename,module);loaded.filename=filename;loaded.require=name=>name==='exceljs'?{...ExcelJS,Workbook:CapturingWorkbook}:Object.hasOwn(mocks,name)?mocks[name]:name.startsWith('.')?{}:require(name);loaded._compile(fs.readFileSync(filename,'utf8'),filename);return loaded.exports;}
const reportModel={};for(const name of ['getAttendanceReportExport','getLongWeekendReportExport','getContinuousAbsenceReportExport','getCustomShiftReportExport'])reportModel[name]=async()=>rows;
const reports=load('backend/src/controllers/report.controller.js',{'../models/report.model':reportModel});
const pool={query:async()=>[rows],execute:async()=>[rows]};
const trainee=load('backend/src/controllers/trainee.controller.js',{'../config/db':{pool}});
const leave=load('backend/src/controllers/leave.controller.js',{'../config/db':{pool},'../models/leave.model':{normalizeSubjectType:v=>String(v).toUpperCase(),getLeaves:async()=>rows}});
const biometric=load('backend/src/services/biometric.service.js',{'../config/db':{pool}});
const query={subject_type:'TRAINEE',session_type:'MORNING',attendance_date:'2026-11-17',date_from:'2026-11-16',date_to:'2026-11-17'};
async function check(workbook,headerRow,label,identifierColumn=2){
 const bytes=await workbook.xlsx.writeBuffer();const decoded=new ExcelJS.Workbook();await decoded.xlsx.load(bytes);const sheet=decoded.worksheets[0];
 assert.equal(sheet.getCell(headerRow,1).value,'Sr. No.',label+' header');
 assert.equal(sheet.getCell(headerRow+1,1).value,1,label+' first serial');
 assert.equal(sheet.getCell(headerRow+2,1).value,2,label+' second serial');
 assert.equal(sheet.getCell(headerRow+1,identifierColumn).value,'RTC-0001',label+' exact identifier');
 assert.equal(sheet.getColumn(1).width,8,label+' serial width');
 console.log('PASS Excel '+label+': serials, identifier strings and readable workbook');
}
(async()=>{
 for(const [name,fn,header]of [
 ['Attendance',reports.exportAttendanceReport,5],['Long Weekend',reports.exportLongWeekendReport,5],
 ['Continuous Absence',reports.exportContinuousAbsenceReport,5],['Custom Shift',reports.exportCustomShiftReport,5],
 ['Trainees',trainee.exportTraineesExcel,1],['Leave',leave.exportLeavesExcel,1]]){
  const res={captureWorkbook:true,setHeader(){},end(){},status(code){throw Error(name+' status '+code)},json(body){throw Error(JSON.stringify(body))}};
  let failure;await fn({query},res,error=>{failure=error});if(failure)throw failure;assert.ok(res.workbook,name+' workbook');await check(res.workbook,header,name);
 }
 const result=await biometric.exportTransactions({});await check(result.workbook,1,'BioTime Transactions',3);
})().catch(error=>{console.error(error.stack);process.exitCode=1});
