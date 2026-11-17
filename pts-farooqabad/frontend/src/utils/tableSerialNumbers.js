const serialTitles = new Set(["#", "sr", "sr#", "srno", "sno", "serial", "serialno", "serialnumber"]);
const serialKeys = new Set(["serial_number", "serial_no", "serialNumber", "serialNo", "sr_no", "sno", "__serial"]);
function titleText(title) {
  if (typeof title === "string") return title;
  const children = title?.props?.children;
  return Array.isArray(children) ? children.map(titleText).join("") : titleTextValue(children);
}
function titleTextValue(value) { return typeof value === "string" ? value : ""; }
export function isSerialColumn(column) {
  const title = titleText(column.title).toLowerCase().replace(/[.\s/]/g, "");
  return serialTitles.has(title) || serialKeys.has(column.key) || serialKeys.has(column.dataIndex);
}
export function serialPagination(pagination, local, dataLength) {
  if (pagination === false) return { current: 1, pageSize: Math.max(1, dataLength) };
  const options = pagination || {};
  const pageSize = Math.max(1, Number(options.pageSize ?? local.pageSize) || 10);
  const total = Math.max(0, Number(options.total ?? dataLength) || 0);
  const current = Math.min(Math.max(1, Number(options.current ?? local.current) || 1), Math.max(1, Math.ceil(total / pageSize)));
  return { current, pageSize };
}
export function withSerialNumbers(columns, pagination) {
  const serial = columns.find(isSerialColumn);
  const remaining = columns.filter(column => !isSerialColumn(column));
  return [{
    ...(serial || {}),
    key: "__serial", title: "Sr. No.", width: serial?.width || 76, align: "center",
    hidden: false,
    fixed: columns.some(column => column.fixed === "left" || column.fixed === true) ? "left" : undefined,
    render: (_, record, index) => record?.key === "__grand_total__" ? "" :
      (pagination.current - 1) * pagination.pageSize + index + 1,
  }, ...remaining];
}
