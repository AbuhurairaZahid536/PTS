import { forwardRef, useState } from "react";
import { Table as AntTable } from "antd";
import { isSerialColumn, serialPagination, withSerialNumbers } from "../utils/tableSerialNumbers";

const SerialTable = forwardRef(function SerialTable({ columns = [], pagination, onChange, scroll, dataSource = [], ...props }, ref) {
  const [localPage, setLocalPage] = useState(() => ({
    current: pagination?.defaultCurrent || 1,
    pageSize: pagination?.defaultPageSize || pagination?.pageSize || 10,
  }));
  const page = serialPagination(pagination, localPage, Array.isArray(dataSource) ? dataSource.length : 0);
  const addedColumn = !columns.some(isSerialColumn);
  const tableScroll = addedColumn && typeof scroll?.x === "number"
    ? { ...scroll, x: scroll.x + 76 } : scroll;
  const handleChange = (nextPage, filters, sorter, extra) => {
    if (nextPage.current && nextPage.pageSize) {
      setLocalPage({ current: nextPage.current, pageSize: nextPage.pageSize });
    }
    onChange?.(nextPage, filters, sorter, extra);
  };
  return <AntTable {...props} ref={ref} dataSource={dataSource}
    columns={withSerialNumbers(columns, page)} pagination={pagination}
    onChange={handleChange} scroll={tableScroll} />;
});
SerialTable.Summary = AntTable.Summary;
SerialTable.SELECTION_COLUMN = AntTable.SELECTION_COLUMN;
SerialTable.EXPAND_COLUMN = AntTable.EXPAND_COLUMN;
export default SerialTable;
