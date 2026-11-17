export function dashboardDetailVisibility(title, subjectType) {
  // Cards, donut slices and statement cells put the selected status last.
  const status = String(title || "").split(" - ").at(-1).trim().toLowerCase();
  const absent = status === "absent";
  const present = status === "present";
  const repatriate = status === "repatriate";
  const leave = status === "leave";
  const osd = status === "osd" || status === "short permission";
  const staff = subjectType === "STAFF";
  const dutyRest = staff && ["duty rest", "long weekend"].includes(status);
  const totalTrainees = subjectType === "TRAINEE" && status === "total enrolled";
  return {
    attendance: !totalTrainees && !repatriate,
    dashboardStatus: !totalTrainees && !absent && !(osd && !staff),
    assignedDuty: staff && !leave && !osd,
    leaveStart: leave,
    leaveEnd: leave,
    repatriateDate: repatriate && !staff,
    punch: !leave && !totalTrainees && !absent && !repatriate && !osd && !dutyRest,
    osdStart: !leave && !totalTrainees && !absent && !present && !repatriate && !dutyRest,
    osdEnd: !leave && !totalTrainees && !absent && !present && !repatriate && !dutyRest,
    absenceStart: !leave && !totalTrainees && !present && !repatriate && !dutyRest && !(staff && osd),
    absenceEnd: !leave && !totalTrainees && !absent && !present && !repatriate && !dutyRest && !(staff && osd),
    absenceDuration: !leave && !totalTrainees && !present && !repatriate && !dutyRest && !(staff && osd),
    reason: !totalTrainees && !absent && !present,
  };
}
