import assert from 'node:assert/strict';
import fs from 'node:fs';
import { isSerialColumn, serialPagination, withSerialNumbers } from '../frontend/src/utils/tableSerialNumbers.js';

const basic = [{ title: 'Employee No.', dataIndex: 'employee_id' }, { title: 'Name' }];
let page = serialPagination({current:3,pageSize:25,total:126},{current:1,pageSize:10},25);
let cols = withSerialNumbers(basic,page);
assert.equal(cols[0].render(null,{},0),51);
assert.equal(cols[0].render(null,{},24),75);
assert.equal(cols[1].dataIndex,'employee_id');
page=serialPagination({defaultPageSize:25},{current:2,pageSize:25},80);
assert.equal(withSerialNumbers(basic,page)[0].render(null,{},0),26);
page=serialPagination(false,{current:8,pageSize:10},3);
assert.equal(withSerialNumbers(basic,page)[0].render(null,{},2),3);
assert.equal(serialPagination(undefined,{current:5,pageSize:10},7).current,1);
assert.equal(serialPagination({current:1,pageSize:50,total:100},{current:7,pageSize:10},50).pageSize,50);
for(const title of ['#','Sr.#','Sr. No.','S.No.','Serial Number']){
  cols=withSerialNumbers([{title,render:()=>999},...basic],{current:2,pageSize:10});
  assert.equal(cols.length,3);assert.equal(cols[0].render(null,{},0),11);
}
assert.ok(!isSerialColumn({title:'Platoon No.'}));
assert.ok(!isSerialColumn({title:'Reference No.'}));
cols=withSerialNumbers([{title:'#'},...basic,{key:'serial_number'}],{current:1,pageSize:10});
assert.equal(cols.filter(c=>c.key==='__serial').length,1);
assert.equal(cols[0].render(null,{key:'__grand_total__'},10),'');
assert.equal(withSerialNumbers([{title:'Name',fixed:'left'}],page)[0].fixed,'left');
assert.equal(basic.length,2);
console.log('PASS serial numbering: client/server pages, no pagination, filtering clamp, existing serial reuse, totals and fixed columns');

const pages=fs.readdirSync(new URL('../frontend/src/pages/',import.meta.url)).filter(n=>n.endsWith('.jsx'));
let migrated=0;
for(const page of pages){const source=fs.readFileSync(new URL('../frontend/src/pages/'+page,import.meta.url),'utf8');if(source.includes('<Table')){assert.match(source,/import Table from "\.\.\/components\/SerialTable"/);migrated++;}}
assert.equal(migrated,24);
console.log('PASS all 24 table modules use the shared numbering component');
