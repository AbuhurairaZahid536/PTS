export function dashboardDetailVisibility(title) {
  // Cards, donut slices and statement cells put the selected status last.
  const status = String(title || "").split(" - ").at(-1).trim().toLowerCase();
  const absent = status === "absent";
  const present = status === "present";
  const repatriate = status === "repatriate";
  return {
    dashboardStatus: !absent,
    punch: !absent,
    osdStart: !absent && !present && !repatriate,
    osdEnd: !absent && !present && !repatriate,
    absenceStart: !present && !repatriate,
    absenceEnd: !absent && !present && !repatriate,
    absenceDuration: !present && !repatriate,
    reason: !absent && !present,
  };
}
