export function dashboardDetailVisibility(title, subjectType) {
  // Cards, donut slices and statement cells put the selected status last.
  const status = String(title || "").split(" - ").at(-1).trim().toLowerCase();
  const absent = status === "absent";
  const present = status === "present";
  const repatriate = status === "repatriate";
  const totalTrainees = subjectType === "TRAINEE" && status === "total enrolled";
  return {
    attendance: !totalTrainees,
    dashboardStatus: !totalTrainees && !absent,
    punch: !totalTrainees && !absent,
    osdStart: !totalTrainees && !absent && !present && !repatriate,
    osdEnd: !totalTrainees && !absent && !present && !repatriate,
    absenceStart: !totalTrainees && !present && !repatriate,
    absenceEnd: !totalTrainees && !absent && !present && !repatriate,
    absenceDuration: !totalTrainees && !present && !repatriate,
    reason: !totalTrainees && !absent && !present,
  };
}
