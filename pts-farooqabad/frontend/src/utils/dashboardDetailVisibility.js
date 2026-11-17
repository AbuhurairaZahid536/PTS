export function dashboardDetailVisibility(title, subjectType) {
  // Cards, donut slices and statement cells put the selected status last.
  const status = String(title || "").split(" - ").at(-1).trim().toLowerCase();
  const absent = status === "absent";
  const present = status === "present";
  const repatriate = status === "repatriate";
  const leave = status === "leave";
  const totalTrainees = subjectType === "TRAINEE" && status === "total enrolled";
  return {
    attendance: !totalTrainees && !repatriate,
    dashboardStatus: !totalTrainees && !absent,
    punch: !leave && !totalTrainees && !absent && !repatriate,
    osdStart: !leave && !totalTrainees && !absent && !present && !repatriate,
    osdEnd: !leave && !totalTrainees && !absent && !present && !repatriate,
    absenceStart: !leave && !totalTrainees && !present && !repatriate,
    absenceEnd: !leave && !totalTrainees && !absent && !present && !repatriate,
    absenceDuration: !leave && !totalTrainees && !present && !repatriate,
    reason: !totalTrainees && !absent && !present,
  };
}
