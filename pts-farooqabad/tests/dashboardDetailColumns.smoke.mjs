import assert from 'node:assert/strict';
import { dashboardDetailVisibility as visibility } from '../frontend/src/utils/dashboardDetailVisibility.js';
import { enrichDashboardOperationalDetails as enrich } from '../frontend/src/utils/dashboardOperationalDetails.js';

const hidden = (v, keys) => keys.forEach(key => assert.equal(v[key], false, `${key} should be hidden`));
for (const subject of ['TRAINEE', 'STAFF']) {
  const leave = visibility(`${subject} - Leave`, subject);
  assert.equal(leave.leaveStart, true);
  assert.equal(leave.leaveEnd, true);
  hidden(leave, ['punch', 'osdStart', 'osdEnd', 'absenceStart', 'absenceEnd', 'absenceDuration']);
  if (subject === 'STAFF') assert.equal(leave.assignedDuty, false);
}
const traineeOsd = visibility('Morning - Recruit Course - OSD', 'TRAINEE');
hidden(traineeOsd, ['dashboardStatus', 'punch']);
assert.equal(traineeOsd.osdStart, true);
assert.equal(traineeOsd.osdEnd, true);
const repatriate = visibility('Trainee - Repatriate', 'TRAINEE');
assert.equal(repatriate.repatriateDate, true);
assert.equal(repatriate.reason, true);
hidden(repatriate, ['attendance', 'punch', 'osdStart', 'osdEnd', 'absenceStart', 'absenceEnd', 'absenceDuration']);
hidden(visibility('Staff - Present', 'STAFF'), ['reason']);
for (const suffix of ['Duty Rest', 'Long Weekend']) {
  hidden(visibility(`Evening - Security - ${suffix}`, 'STAFF'), ['punch', 'osdStart', 'osdEnd', 'absenceStart', 'absenceEnd', 'absenceDuration']);
}
const staffOsd = visibility('Staff - OSD', 'STAFF');
hidden(staffOsd, ['assignedDuty', 'punch', 'absenceStart', 'absenceEnd', 'absenceDuration']);
assert.equal(staffOsd.osdStart, true);
assert.equal(staffOsd.osdEnd, true);
const absent = visibility('Trainee - Absent', 'TRAINEE');
hidden(absent, ['dashboardStatus', 'punch', 'osdStart', 'osdEnd', 'absenceEnd', 'reason']);
assert.equal(absent.absenceStart, true);
assert.equal(absent.absenceDuration, true);
assert.ok(Object.values(visibility('Trainee - Total Enrolled', 'TRAINEE')).every(v => !v));
assert.equal(visibility('Staff - Present', 'STAFF').punch, true);
console.log('PASS dashboard detail columns: seven requested cases and previous status policies');

const support = {
  trainee_leaves: [{ id: 7, subject_type: 'TRAINEE', subject_id: 1, start_datetime: '2026-11-16 08:00:00', end_datetime: '2026-11-19 08:00:00', reason: 'Trainee leave' }],
  staff_leaves: [{ id: 7, subject_type: 'STAFF', subject_id: 1, start_datetime: '2026-11-17 09:00:00', end_datetime: '2026-11-18 09:00:00', reason: 'Staff leave' }],
  trainee_osd: [{ id: 7, subject_type: 'TRAINEE', subject_id: 1, start_datetime: '2026-11-17 09:00:00', end_datetime: '2026-11-17 13:00:00', reason: 'Court duty' }],
};
const row = { subject_type: 'TRAINEE', subject_id: 1, exemption_record_id: 7, exemption_type: 'LEAVE' };
const [trainee, staff, wrongPerson, wrongRecord, nonLeave, osd] = enrich([
  row, { ...row, subject_type: 'STAFF' }, { ...row, subject_id: 2 },
  { ...row, exemption_record_id: 8 }, { ...row, exemption_type: null }, { ...row, exemption_type: 'OSD' },
], support);
assert.equal(trainee.leave_start_datetime, support.trainee_leaves[0].start_datetime);
assert.equal(trainee.leave_end_datetime, support.trainee_leaves[0].end_datetime);
assert.equal(staff.leave_end_datetime, support.staff_leaves[0].end_datetime);
assert.equal(staff.leave_reason, 'Staff leave');
for (const result of [wrongPerson, wrongRecord, nonLeave, osd]) assert.equal(result.leave_start_datetime, null);
assert.equal(osd.osd_end_datetime, '2026-11-17 13:00:00');
assert.equal(row.leave_start_datetime, undefined);
assert.equal(enrich([row], {})[0].leave_start_datetime, null);
assert.equal(enrich([row], { trainee_leaves: support.staff_leaves })[0].leave_start_datetime, null);
console.log('PASS operational dates: typed identity/record matches, leave bounds, OSD Till and missing-record handling');
