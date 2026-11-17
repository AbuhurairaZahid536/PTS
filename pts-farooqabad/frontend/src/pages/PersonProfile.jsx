import { useEffect, useMemo, useState } from "react";

import {
  Alert,
  Avatar,
  Button,
  Card,
  Checkbox,
  Col,
  Descriptions,
  Divider,
  Drawer,
  Empty,
  Form,
  Image,
  Input,
  Popconfirm,
  Row,
  Select,
  Space,
  Spin,
  Statistic,
  Tabs,
  Tag,
  Typography,
  Upload,
  message,
} from "antd";
import Table from "../components/SerialTable";

import {
  ArrowLeftOutlined,
  DeleteOutlined,
  EditOutlined,
  IdcardOutlined,
  PrinterOutlined,
  ReloadOutlined,
  SaveOutlined,
  UploadOutlined,
  UserOutlined,
} from "@ant-design/icons";

import api from "../services/api";
import { useAuth } from "../contexts/AuthContext";

const { Title, Text } = Typography;

const { TextArea } = Input;

/*
|--------------------------------------------------------------------------
| PRINT SECTIONS
|--------------------------------------------------------------------------
*/

const PRINT_SECTIONS = {
  profile: "Profile",

  attendance: "Attendance",

  custom_shift_duty: "Custom Shift Duty",

  continuous_absence: "Continuous Absence / Return",

  long_weekend: "Long Weekend / Departure",

  manual_absence: "Manual Absence & Decision",

  leave: "Leave",

  osd_permission: "OSD / Permission",

  outdoor_medical: "Outdoor / Medical / Home Rest",

  training_drop: "Training Drop",

  audit: "Activity / Audit",
};

const DEFAULT_PRINT_SECTIONS = Object.keys(PRINT_SECTIONS).reduce(
  (result, key) => ({
    ...result,

    [key]: true,
  }),
  {},
);

/*
|--------------------------------------------------------------------------
| STATUS OPTIONS
|--------------------------------------------------------------------------
*/

const TRAINEE_STATUS_OPTIONS = [
  {
    value: "ACTIVE",

    label: "Active",
  },

  {
    value: "ON_LEAVE",

    label: "On Leave",
  },

  {
    value: "OSD",

    label: "OSD",
  },

  {
    value: "OUTDOOR",

    label: "Outdoor",
  },

  {
    value: "TRAINING_DROP",

    label: "Training Drop",
  },

  {
    value: "COMPLETED",

    label: "Completed",
  },

  {
    value: "INACTIVE",

    label: "Inactive",
  },
];

const STAFF_STATUS_OPTIONS = [
  {
    value: "ACTIVE",

    label: "Active",
  },

  {
    value: "ON_LEAVE",

    label: "On Leave",
  },

  {
    value: "OSD",

    label: "OSD",
  },

  {
    value: "INACTIVE",

    label: "Inactive",
  },

  {
    value: "RETIRED",

    label: "Retired",
  },

  {
    value: "TRANSFERRED",

    label: "Transferred",
  },
];

/*
|--------------------------------------------------------------------------
| DATE HELPERS
|--------------------------------------------------------------------------
*/

function formatDate(value) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleDateString("en-GB");
}

function formatDateTime(value) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleString("en-GB", {
    year: "numeric",

    month: "2-digit",

    day: "2-digit",

    hour: "2-digit",

    minute: "2-digit",
  });
}

function inputDate(value) {
  if (!value) {
    return "";
  }

  return String(value).slice(0, 10);
}

function formatDurationSeconds(value) {
  const total = Math.max(0, Math.floor(Number(value) || 0));

  const days = Math.floor(total / 86400);

  const hours = Math.floor((total % 86400) / 3600);

  const minutes = Math.floor((total % 3600) / 60);

  const seconds = total % 60;

  const pad = (item) => String(item).padStart(2, "0");

  if (days > 0) {
    return `${days}d ${pad(hours)}h ${pad(minutes)}m ${pad(seconds)}s`;
  }

  return `${pad(hours)}h ${pad(minutes)}m ${pad(seconds)}s`;
}

/*
|--------------------------------------------------------------------------
| STATUS TAG
|--------------------------------------------------------------------------
*/

function StatusTag({ value }) {
  if (!value) {
    return "-";
  }

  const status = String(value).toUpperCase();

  let color = "default";

  if (
    [
      "ACTIVE",
      "APPROVED",
      "PRESENT",
      "COMPLETED",
      "REJOINED",
      "RETURNED",
      "SYNCED",
      "IN_TIME",
      "CHECKED_OUT",
    ].includes(status)
  ) {
    color = "green";
  } else if (
    ["ABSENT", "OPEN", "REJECTED", "FAILED", "CANCELLED", "MISSING"].includes(
      status,
    )
  ) {
    color = "red";
  } else if (
    [
      "EARLY",
      "LATE",
      "PENDING",
      "ON_LEAVE",
      "OSD",
      "OUTDOOR",
      "EXEMPT",
    ].includes(status)
  ) {
    color = "orange";
  } else if (["TRAINING_DROP", "TRANSFERRED"].includes(status)) {
    color = "purple";
  } else if (status === "RETIRED") {
    color = "blue";
  }

  return <Tag color={color}>{status}</Tag>;
}

/*
|--------------------------------------------------------------------------
| FIELD LABELS
|--------------------------------------------------------------------------
*/

function prettyKey(key) {
  const labels = {
    id: "Record ID",

    employee_id: "Employee ID",

    first_name: "First Name",

    last_name: "Last Name",

    father_name: "Father Name",

    cnic: "CNIC",

    phone: "Phone",

    email: "Email",

    address: "Address",

    course_id: "Course ID",

    course_name: "Course",

    platoon_id: "Platoon ID",

    platoon_number: "Platoon",

    position: "Position",

    category_id: "Staff Category ID",

    category_name: "Staff Category",

    branch_id: "Branch ID",

    branch_name: "Branch / Posting",

    designation: "Rank",

    status: "Status",

    joining_date: "Joining Date",

    training_start_date: "Training Start",

    training_end_date: "Training End",

    remarks: "Remarks",

    photo_path: "Profile Photo",

    zkteco_synced: "ZKBioTime Synced",

    zkteco_emp_id: "ZKBioTime Employee ID",

    zkteco_emp_code: "ZKBioTime Employee Code",

    attendance_date: "Date",

    session_type: "Session",

    selected_punch: "Punch",

    attendance_status: "Attendance",

    timing_status: "Timing",

    timing_minutes: "Minutes",

    exemption_type: "Exemption",

    exemption_description: "Exemption Detail",

    leave_type: "Leave Type",

    leave_category: "Leave Category",

    record_type: "Record Type",

    workflow_status: "Status",

    record_status: "Status",

    absence_category: "Absence Category",

    program_class: "Program / Class",

    start_datetime: "From",

    end_datetime: "To",

    reason: "Reason",

    reference_no: "Reference No.",

    outdoor_purpose: "Outdoor Purpose",

    home_rest: "Home Rest",

    home_rest_start: "Home Rest From",

    home_rest_end: "Home Rest To",

    doctor_name: "Doctor",

    doctor_recommendation: "Doctor Recommendation",

    drop_status: "Drop Status",

    drop_datetime: "Drop Date",

    rejoin_datetime: "Rejoin Date",

    order_reference: "Order Reference",

    created_at: "Created",

    updated_at: "Updated",

    user_id: "User ID",

    username: "User",

    action: "Action",

    module: "Module",

    description: "Description",

    ip_address: "IP Address",
  };

  if (labels[key]) {
    return labels[key];
  }

  return String(key)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (value) => value.toUpperCase());
}

/*
|--------------------------------------------------------------------------
| GENERIC VALUE
|--------------------------------------------------------------------------
*/

function renderGenericValue(key, value) {
  if (value === null || value === undefined || value === "") {
    return "-";
  }

  if (
    [
      "status",
      "workflow_status",
      "record_status",
      "drop_status",
      "attendance_status",
      "timing_status",
    ].includes(key)
  ) {
    return <StatusTag value={value} />;
  }

  if (key.includes("date") || key.includes("datetime") || key.endsWith("_at")) {
    return formatDateTime(value);
  }

  if (typeof value === "object") {
    return (
      <pre
        style={{
          margin: 0,

          whiteSpace: "pre-wrap",

          wordBreak: "break-word",

          fontSize: 11,
        }}
      >
        {JSON.stringify(value, null, 2)}
      </pre>
    );
  }

  if (
    typeof value === "number" &&
    ["has_manual_absence", "biometric_exempt", "home_rest"].includes(key)
  ) {
    return value ? "Yes" : "No";
  }

  return String(value);
}

/*
|--------------------------------------------------------------------------
| GENERIC HISTORY
|--------------------------------------------------------------------------
*/

function GenericHistory({ rows = [], emptyText = "No record available." }) {
  if (!rows.length) {
    return <Empty description={emptyText} />;
  }

  const ignored = ["trainee_id", "staff_id"];

  const keys = [
    ...new Set(rows.flatMap((row) => Object.keys(row || {}))),
  ].filter((key) => !ignored.includes(key));

  const columns = keys.map((key) => ({
    title: prettyKey(key),

    dataIndex: key,

    key,

    width: [
      "reason",
      "remarks",
      "description",
      "doctor_recommendation",
    ].includes(key)
      ? 280
      : 150,

    render: (value) => renderGenericValue(key, value),
  }));

  return (
    <Table
      bordered
      size="small"
      rowKey={(row, index) => row.id || index}
      columns={columns}
      dataSource={rows}
      pagination={{
        pageSize: 10,

        showSizeChanger: true,

        pageSizeOptions: ["10", "25", "50", "100"],
      }}
      scroll={{
        x: Math.max(1000, columns.length * 150),
      }}
    />
  );
}

/*
|--------------------------------------------------------------------------
| AUDIT HELPERS
|--------------------------------------------------------------------------
*/

function parseAuditData(value) {
  if (value === null || value === undefined || value === "") {
    return {};
  }

  if (typeof value === "object") {
    return value || {};
  }

  try {
    const parsed = JSON.parse(value);

    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (_) {
    return {};
  }
}

function normalizeAuditAction(value) {
  return String(value || "ACTIVITY")
    .trim()
    .toUpperCase();
}

function auditActionLabel(value) {
  const action = normalizeAuditAction(value);

  const labels = {
    CREATE: "Record Created",

    ADD: "Record Created",

    UPDATE: "Profile Updated",

    EDIT: "Profile Updated",

    UPDATE_PHOTO: "Profile Photo Updated",

    REMOVE_PHOTO: "Profile Photo Removed",

    DELETE: "Record Deleted",

    SOFT_DELETE: "Record Deleted",

    RESTORE: "Record Restored",

    SYNC: "Synchronization",
  };

  return labels[action] || action.replace(/_/g, " ");
}

function auditActionColor(value) {
  const action = normalizeAuditAction(value);

  if (["CREATE", "ADD", "RESTORE"].includes(action)) {
    return "green";
  }

  if (["DELETE", "SOFT_DELETE", "REMOVE_PHOTO"].includes(action)) {
    return "red";
  }

  if (["UPDATE", "EDIT", "UPDATE_PHOTO"].includes(action)) {
    return "blue";
  }

  if (action === "SYNC") {
    return "purple";
  }

  return "default";
}

function isTechnicalAuditField(key) {
  return [
    "id",
    "created_at",
    "updated_at",
    "created_by",
    "updated_by",
    "deleted_at",
  ].includes(key);
}

function comparableAuditValue(value) {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch (_) {
      return String(value);
    }
  }

  return String(value);
}

function formatAuditValue(key, value) {
  if (value === null || value === undefined || value === "") {
    return "-";
  }

  if (key === "photo_path") {
    return "Profile Photo";
  }

  if (
    [
      "zkteco_synced",
      "is_deleted",
      "biometric_exempt",
      "has_manual_absence",
    ].includes(key)
  ) {
    return Number(value) ? "Yes" : "No";
  }

  if (key.includes("date") || key.includes("datetime") || key.endsWith("_at")) {
    return formatDateTime(value);
  }

  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch (_) {
      return String(value);
    }
  }

  return String(value);
}

function getAuditChanges(record) {
  const oldData = parseAuditData(record?.old_data);

  const newData = parseAuditData(record?.new_data);

  const keys = [
    ...new Set([...Object.keys(oldData), ...Object.keys(newData)]),
  ].filter((key) => !isTechnicalAuditField(key));

  return keys
    .filter(
      (key) =>
        comparableAuditValue(oldData[key]) !==
        comparableAuditValue(newData[key]),
    )
    .map((key) => ({
      key,

      field: prettyKey(key),

      previous: formatAuditValue(key, oldData[key]),

      next: formatAuditValue(key, newData[key]),
    }));
}

/*
|--------------------------------------------------------------------------
| AUDIT HISTORY SCREEN
|--------------------------------------------------------------------------
*/

function AuditHistory({ rows = [] }) {
  const [actionFilter, setActionFilter] = useState(null);

  const [fromDate, setFromDate] = useState("");

  const [toDate, setToDate] = useState("");

  const actionOptions = useMemo(
    () =>
      [
        ...new Set(
          rows.map((row) => normalizeAuditAction(row.action)).filter(Boolean),
        ),
      ]
        .sort()
        .map((action) => ({
          value: action,

          label: auditActionLabel(action),
        })),
    [rows],
  );

  const filteredRows = useMemo(() => {
    const from = fromDate ? new Date(`${fromDate}T00:00:00`) : null;

    const to = toDate ? new Date(`${toDate}T23:59:59.999`) : null;

    return rows.filter((row) => {
      if (actionFilter && normalizeAuditAction(row.action) !== actionFilter) {
        return false;
      }

      if (from || to) {
        const rowDate = new Date(row.created_at);

        if (Number.isNaN(rowDate.getTime())) {
          return false;
        }

        if (from && rowDate < from) {
          return false;
        }

        if (to && rowDate > to) {
          return false;
        }
      }

      return true;
    });
  }, [rows, actionFilter, fromDate, toDate]);

  if (!rows.length) {
    return <Empty description="No Activity / Audit record available." />;
  }

  return (
    <>
      <Card
        size="small"
        style={{
          marginBottom: 16,

          background: "#fafcff",
        }}
      >
        <Row gutter={[12, 12]} align="bottom">
          <Col xs={24} sm={12} md={8}>
            <Text strong>Action</Text>

            <Select
              allowClear
              placeholder="All Actions"
              value={actionFilter}
              options={actionOptions}
              style={{
                width: "100%",

                marginTop: 6,
              }}
              onChange={(value) => setActionFilter(value || null)}
            />
          </Col>

          <Col xs={24} sm={12} md={6}>
            <Text strong>From Date</Text>

            <Input
              type="date"
              value={fromDate}
              style={{
                marginTop: 6,
              }}
              onChange={(event) => setFromDate(event.target.value)}
            />
          </Col>

          <Col xs={24} sm={12} md={6}>
            <Text strong>To Date</Text>

            <Input
              type="date"
              value={toDate}
              style={{
                marginTop: 6,
              }}
              onChange={(event) => setToDate(event.target.value)}
            />
          </Col>

          <Col xs={24} sm={12} md={4}>
            <Button
              block
              onClick={() => {
                setActionFilter(null);

                setFromDate("");

                setToDate("");
              }}
            >
              Reset Filters
            </Button>
          </Col>
        </Row>

        <div
          style={{
            marginTop: 10,
          }}
        >
          <Text type="secondary">
            Showing <strong>{filteredRows.length}</strong> of{" "}
            <strong>{rows.length}</strong> activity record(s)
          </Text>
        </div>
      </Card>

      {!filteredRows.length ? (
        <Empty description="No activity matches the selected filters." />
      ) : (
        <Space
          direction="vertical"
          size="middle"
          style={{
            width: "100%",
          }}
        >
          {filteredRows.map((record, index) => {
            const changes = getAuditChanges(record);

            const userName =
              record.username ||
              (record.user_id ? `User ID ${record.user_id}` : "System");

            const changeColumns = [
              {
                title: "Field",

                dataIndex: "field",

                key: "field",

                width: 190,

                render: (value) => <Text strong>{value}</Text>,
              },

              {
                title: "Previous Value",

                dataIndex: "previous",

                key: "previous",

                render: (value) => (
                  <span
                    style={{
                      whiteSpace: "pre-wrap",

                      wordBreak: "break-word",
                    }}
                  >
                    {value}
                  </span>
                ),
              },

              {
                title: "New Value",

                dataIndex: "next",

                key: "next",

                render: (value) => (
                  <span
                    style={{
                      whiteSpace: "pre-wrap",

                      wordBreak: "break-word",
                    }}
                  >
                    {value}
                  </span>
                ),
              },
            ];

            return (
              <Card
                key={record.id || `${record.created_at}-${index}`}
                size="small"
                title={
                  <Space wrap>
                    <Tag color={auditActionColor(record.action)}>
                      {auditActionLabel(record.action)}
                    </Tag>

                    <Text strong>{formatDateTime(record.created_at)}</Text>
                  </Space>
                }
                extra={<Text type="secondary">{userName}</Text>}
              >
                <Descriptions
                  size="small"
                  column={{
                    xs: 1,

                    sm: 2,

                    lg: 4,
                  }}
                >
                  <Descriptions.Item label="Action">
                    {auditActionLabel(record.action)}
                  </Descriptions.Item>

                  <Descriptions.Item label="Performed By">
                    {userName}
                  </Descriptions.Item>

                  <Descriptions.Item label="Module">
                    {record.module || "-"}
                  </Descriptions.Item>

                  <Descriptions.Item label="IP Address">
                    {record.ip_address || "-"}
                  </Descriptions.Item>
                </Descriptions>

                {record.description && (
                  <Alert
                    type="info"
                    showIcon
                    style={{
                      marginTop: 12,

                      marginBottom: changes.length ? 12 : 0,
                    }}
                    message={record.description}
                  />
                )}

                {changes.length > 0 && (
                  <>
                    <Divider
                      orientation="left"
                      style={{
                        margin: "14px 0 10px",
                      }}
                    >
                      Changed Fields
                    </Divider>

                    <Table
                      bordered
                      size="small"
                      rowKey="key"
                      columns={changeColumns}
                      dataSource={changes}
                      pagination={false}
                      scroll={{
                        x: 720,
                      }}
                    />
                  </>
                )}

                {!changes.length && !record.description && (
                  <Text type="secondary">
                    No field-level change details were recorded for this
                    activity.
                  </Text>
                )}
              </Card>
            );
          })}
        </Space>
      )}
    </>
  );
}

/*
|--------------------------------------------------------------------------
| ATTENDANCE
|--------------------------------------------------------------------------
*/

function AttendanceSection({ attendance }) {
  const summary = attendance?.summary || {};

  const records = attendance?.records || [];

  const columns = [
    {
      title: "Date",

      dataIndex: "attendance_date",

      width: 110,

      render: formatDate,
    },

    {
      title: "Session",

      dataIndex: "session_type",

      width: 100,

      render: (value) => <Tag>{value || "-"}</Tag>,
    },

    {
      title: "Punch",

      dataIndex: "selected_punch",

      width: 170,

      render: formatDateTime,
    },

    {
      title: "Attendance",

      dataIndex: "attendance_status",

      width: 120,

      render: (value) => <StatusTag value={value} />,
    },

    {
      title: "Timing",

      dataIndex: "timing_status",

      width: 120,

      render: (value) => <StatusTag value={value} />,
    },

    {
      title: "Minutes",

      dataIndex: "timing_minutes",

      width: 85,

      align: "center",

      render: (value) => value ?? "-",
    },

    {
      title: "Exemption",

      dataIndex: "exemption_type",

      width: 130,

      render: (value) => value || "-",
    },

    {
      title: "Exemption Detail",

      dataIndex: "exemption_description",

      width: 220,

      render: (value) => value || "-",
    },

    {
      title: "Manual Absence",

      dataIndex: "has_manual_absence",

      width: 125,

      align: "center",

      render: (value) => (value ? <Tag color="red">Yes</Tag> : <Tag>No</Tag>),
    },
  ];

  const summaryCards = [
    ["Total Sessions", summary.total_sessions],

    ["Present", summary.present],

    ["Absent", summary.absent],

    ["Exempt", summary.exempt],

    ["Early", summary.early],

    ["In Time", summary.in_time],

    ["Late", summary.late],

    ["Manual Absence", summary.manual_absence],
  ];

  return (
    <>
      <Row
        gutter={[10, 10]}
        style={{
          marginBottom: 18,
        }}
      >
        {summaryCards.map(([title, value]) => (
          <Col xs={12} sm={8} md={6} lg={3} key={title}>
            <Card size="small">
              <Statistic title={title} value={Number(value || 0)} />
            </Card>
          </Col>
        ))}
      </Row>

      <Table
        rowKey="id"
        bordered
        size="small"
        columns={columns}
        dataSource={records}
        pagination={{
          pageSize: 25,

          showSizeChanger: true,

          pageSizeOptions: ["10", "25", "50", "100"],
        }}
        scroll={{
          x: 1200,
        }}
        locale={{
          emptyText: "No attendance records available.",
        }}
      />
    </>
  );
}


/*
|--------------------------------------------------------------------------
| STAFF CUSTOM SHIFT DUTY ATTENDANCE
|--------------------------------------------------------------------------
*/

function CustomShiftDutySection({ shiftDuty }) {
  const summary = shiftDuty?.summary || {};
  const records = shiftDuty?.records || [];

  const columns = [
    {
      title: "Date",
      dataIndex: "attendance_date",
      width: 115,
      fixed: "left",
      render: formatDate,
    },
    {
      title: "Shift Group",
      dataIndex: "group_name",
      width: 210,
      fixed: "left",
      render: (value) => <Tag color="magenta">{value || "-"}</Tag>,
    },
    {
      title: "Shift",
      dataIndex: "shift_name",
      width: 170,
      render: (value) => <Tag color="volcano">{value || "-"}</Tag>,
    },
    {
      title: "Duty Point",
      dataIndex: "duty_point_name",
      width: 190,
      render: (value) => value || "-",
    },
    {
      title: "Scheduled",
      width: 175,
      align: "center",
      render: (_, record) =>
        record.start_time && record.end_time
          ? `${String(record.start_time).slice(0, 5)} - ${String(record.end_time).slice(0, 5)}`
          : "-",
    },
    {
      title: "Arrival Punch",
      dataIndex: "start_punch_time",
      width: 190,
      render: formatDateTime,
    },
    {
      title: "Departure Punch",
      dataIndex: "end_punch_time",
      width: 190,
      render: formatDateTime,
    },
    {
      title: "Attendance",
      dataIndex: "attendance_status",
      width: 125,
      align: "center",
      render: (value) => <StatusTag value={value} />,
    },
    {
      title: "Checkout",
      dataIndex: "checkout_status",
      width: 130,
      align: "center",
      render: (value) => <StatusTag value={value} />,
    },
    {
      title: "Exemption",
      dataIndex: "exemption_type",
      width: 135,
      render: (value) => value || "-",
    },
    {
      title: "Exemption Detail",
      dataIndex: "exemption_description",
      width: 230,
      render: (value) => value || "-",
    },
  ];

  const summaryCards = [
    ["Total Shift Duties", summary.total],
    ["Present", summary.present],
    ["Absent", summary.absent],
    ["Exempt", summary.exempt],
    ["Pending", summary.pending],
    ["Checked Out", summary.checked_out],
    ["Missing Checkout", summary.missing_checkout],
  ];

  return (
    <>
      <Alert
        type="info"
        showIcon
        style={{
          marginBottom: 16,
        }}
        message="Historical Custom Shift Duty Attendance"
        description="This section reads saved Custom Shift attendance history. Opening a profile does not recalculate or rewrite old attendance."
      />

      <Row
        gutter={[10, 10]}
        style={{
          marginBottom: 18,
        }}
      >
        {summaryCards.map(([title, value]) => (
          <Col xs={12} sm={8} md={6} lg={3} key={title}>
            <Card size="small">
              <Statistic title={title} value={Number(value || 0)} />
            </Card>
          </Col>
        ))}
      </Row>

      <Table
        rowKey="id"
        bordered
        size="small"
        columns={columns}
        dataSource={records}
        pagination={{
          pageSize: 25,
          showSizeChanger: true,
          pageSizeOptions: ["10", "25", "50", "100"],
        }}
        scroll={{
          x: 1900,
        }}
        locale={{
          emptyText: "No Custom Shift Duty attendance history available.",
        }}
      />
    </>
  );
}

/*
|--------------------------------------------------------------------------
| CONTINUOUS ABSENCE / RETURN
|--------------------------------------------------------------------------
*/

function ContinuousAbsenceSection({ continuousAbsence }) {
  const summary = continuousAbsence?.summary || {};

  const records = continuousAbsence?.records || [];

  const [statusFilter, setStatusFilter] = useState("ALL");

  const filteredRecords = useMemo(() => {
    if (statusFilter === "ALL") {
      return records;
    }

    return records.filter(
      (record) => String(record.status || "").toUpperCase() === statusFilter,
    );
  }, [records, statusFilter]);

  const columns = [
    {
      title: "Absent From",

      dataIndex: "absent_from",

      width: 190,

      render: formatDateTime,
    },

    {
      title: "Return Punch",

      dataIndex: "return_punch_at",

      width: 190,

      render: (value) =>
        value ? formatDateTime(value) : <Tag color="red">Not Returned</Tag>,
    },

    {
      title: "Period",

      dataIndex: "period_seconds",

      width: 160,

      render: (value) => <Text strong>{formatDurationSeconds(value)}</Text>,
    },

    {
      title: "Missed Sessions",

      dataIndex: "missed_session_count",

      width: 135,

      align: "center",

      render: (value) => Number(value || 0),
    },

    {
      title: "Start Source",

      dataIndex: "start_source_type",

      width: 135,

      render: (value) => <Tag>{value || "-"}</Tag>,
    },

    {
      title: "Context",

      width: 210,

      render: (_, record) =>
        record.start_context_name || record.start_context_type || "-",
    },

    {
      title: "Status",

      dataIndex: "status",

      width: 115,

      fixed: "right",

      render: (value) => <StatusTag value={value} />,
    },
  ];

  const sessionColumns = [
    {
      title: "Date",

      dataIndex: "attendance_date",

      width: 110,

      render: formatDate,
    },

    {
      title: "Session",

      dataIndex: "session_type",

      width: 110,

      render: (value) => <Tag>{value || "-"}</Tag>,
    },

    {
      title: "Source",

      dataIndex: "source_type",

      width: 130,

      render: (value) => value || "-",
    },

    {
      title: "Context",

      width: 210,

      render: (_, record) => record.context_name || record.context_type || "-",
    },

    {
      title: "Required Window Start",

      dataIndex: "window_start",

      width: 190,

      render: formatDateTime,
    },

    {
      title: "Required Window End",

      dataIndex: "window_end",

      width: 190,

      render: formatDateTime,
    },
  ];

  return (
    <>
      <Row
        gutter={[12, 12]}
        style={{
          marginBottom: 16,
        }}
      >
        <Col xs={12} sm={12} lg={6}>
          <Card size="small">
            <Statistic
              title="Total Episodes"
              value={Number(summary.total_episodes || 0)}
            />
          </Card>
        </Col>

        <Col xs={12} sm={12} lg={6}>
          <Card size="small">
            <Statistic
              title="Open / Ongoing"
              value={Number(summary.open || 0)}
              valueStyle={{
                color: "#cf1322",
              }}
            />
          </Card>
        </Col>

        <Col xs={12} sm={12} lg={6}>
          <Card size="small">
            <Statistic
              title="Returned"
              value={Number(summary.returned || 0)}
              valueStyle={{
                color: "#389e0d",
              }}
            />
          </Card>
        </Col>

        <Col xs={12} sm={12} lg={6}>
          <Card size="small">
            <Statistic
              title="Missed Sessions"
              value={Number(summary.missed_sessions || 0)}
            />
          </Card>
        </Col>
      </Row>

      <Card
        size="small"
        style={{
          marginBottom: 16,

          background: "#fafcff",
        }}
      >
        <Space wrap>
          <Text strong>Status:</Text>

          <Select
            value={statusFilter}
            style={{
              width: 180,
            }}
            onChange={setStatusFilter}
            options={[
              {
                value: "ALL",

                label: "All Episodes",
              },

              {
                value: "OPEN",

                label: "Open / Ongoing",
              },

              {
                value: "RETURNED",

                label: "Returned",
              },
            ]}
          />

          <Text type="secondary">
            Showing <strong>{filteredRecords.length}</strong> of{" "}
            <strong>{records.length}</strong> episode(s)
          </Text>
        </Space>
      </Card>

      <Table
        rowKey="id"
        bordered
        size="small"
        columns={columns}
        dataSource={filteredRecords}
        pagination={{
          pageSize: 10,

          showSizeChanger: true,

          pageSizeOptions: ["10", "25", "50", "100"],
        }}
        scroll={{
          x: 1250,
        }}
        locale={{
          emptyText: "No Continuous Absence / Return history available.",
        }}
        expandable={{
          rowExpandable: (record) =>
            Array.isArray(record.sessions) && record.sessions.length > 0,

          expandedRowRender: (record) => {
            const sessions = record.sessions || [];

            if (!sessions.length) {
              return (
                <Empty description="No missed-session details available." />
              );
            }

            return (
              <div
                style={{
                  padding: "4px 8px 12px",
                }}
              >
                <Text strong>Missed Required Sessions</Text>

                <Table
                  rowKey="id"
                  bordered
                  size="small"
                  style={{
                    marginTop: 10,
                  }}
                  columns={sessionColumns}
                  dataSource={sessions}
                  pagination={false}
                  scroll={{
                    x: 1000,
                  }}
                />
              </div>
            );
          },
        }}
      />
    </>
  );
}
/*
|--------------------------------------------------------------------------
| SCREEN PROFILE
|--------------------------------------------------------------------------
*/

function ScreenProfile({ profile }) {
  const person = profile.person || {};

  const isTrainee = profile.subject_type === "TRAINEE";

  return (
    <>
      <Descriptions
        bordered
        size="small"
        column={{
          xs: 1,

          sm: 2,

          lg: 3,
        }}
      >
        <Descriptions.Item label="Employee ID / Cap No.">
          <Text strong>{person.employee_id || "-"}</Text>
        </Descriptions.Item>

        <Descriptions.Item label="Name">
          {[person.first_name, person.last_name].filter(Boolean).join(" ") ||
            "-"}
        </Descriptions.Item>

        <Descriptions.Item label="Father Name">
          {person.father_name || "-"}
        </Descriptions.Item>

        <Descriptions.Item label="CNIC">{person.cnic || "-"}</Descriptions.Item>

        <Descriptions.Item label="Phone">
          {person.phone || "-"}
        </Descriptions.Item>

        <Descriptions.Item label="Email">
          {person.email || "-"}
        </Descriptions.Item>

        <Descriptions.Item label="Address" span={3}>
          {person.address || "-"}
        </Descriptions.Item>

        {isTrainee ? (
          <>
            <Descriptions.Item label="Course">
              {person.course_name || "-"}
            </Descriptions.Item>

            <Descriptions.Item label="Course Code">
              {person.course_code || "-"}
            </Descriptions.Item>

            <Descriptions.Item label="Platoon">
              {person.platoon_number || "-"}
            </Descriptions.Item>

            <Descriptions.Item label="Position">
              {person.position || "-"}
            </Descriptions.Item>

            <Descriptions.Item label="Joining Date">
              {formatDate(person.joining_date)}
            </Descriptions.Item>

            <Descriptions.Item label="Training Start">
              {formatDate(person.training_start_date)}
            </Descriptions.Item>

            <Descriptions.Item label="Training End">
              {formatDate(person.training_end_date)}
            </Descriptions.Item>
          </>
        ) : (
          <>
            <Descriptions.Item label="Staff Category / Duty Type">
              {person.category_name || "-"}
            </Descriptions.Item>

            <Descriptions.Item label="Branch / Posting">
              {person.branch_name || "-"}
            </Descriptions.Item>

            <Descriptions.Item label="Rank">
              {person.designation || "-"}
            </Descriptions.Item>

            <Descriptions.Item label="Joining Date">
              {formatDate(person.joining_date)}
            </Descriptions.Item>
          </>
        )}

        <Descriptions.Item label="Status">
          <StatusTag value={person.status} />
        </Descriptions.Item>

        <Descriptions.Item label="ZKBioTime">
          <StatusTag value={person.zkteco_synced ? "SYNCED" : "PENDING"} />
        </Descriptions.Item>

        <Descriptions.Item label="ZK Employee ID">
          {person.zkteco_emp_id || "-"}
        </Descriptions.Item>

        <Descriptions.Item label="Remarks" span={3}>
          {person.remarks || "-"}
        </Descriptions.Item>
      </Descriptions>

      {isTrainee && profile.course_history?.length > 0 && (
        <>
          <Divider orientation="left">Course History</Divider>

          <Table
            rowKey="id"
            bordered
            size="small"
            pagination={false}
            dataSource={profile.course_history}
            columns={[
              {
                title: "Course",

                dataIndex: "course_name",
              },

              {
                title: "Course Code",

                dataIndex: "course_code",

                width: 130,
              },

              {
                title: "Platoon",

                dataIndex: "platoon_number",

                width: 100,
              },

              {
                title: "Training Start",

                dataIndex: "training_start_date",

                render: formatDate,
              },

              {
                title: "Training End",

                dataIndex: "training_end_date",

                render: formatDate,
              },

              {
                title: "Status",

                dataIndex: "status",

                render: (value) => <StatusTag value={value} />,
              },
            ]}
          />
        </>
      )}
    </>
  );
}

/*
|--------------------------------------------------------------------------
| PRINT HELPERS
|--------------------------------------------------------------------------
*/

function PrintHeader({ title }) {
  return (
    <div className="print-header">
      <div className="print-police">PUNJAB POLICE</div>

      <div className="print-school">POLICE TRAINING SCHOOL FAROOQABAD</div>

      <div className="print-system">
        BIOMETRIC ATTENDANCE &amp; TRAINEE MANAGEMENT SYSTEM
      </div>

      <div className="print-title">{title}</div>
    </div>
  );
}

function PrintFooter() {
  return (
    <>
      <div className="print-signatures">
        <div>
          <div className="signature-line" />
          Prepared By
        </div>

        <div>
          <div className="signature-line" />
          Verified By
        </div>

        <div>
          <div className="signature-line" />
          Principal / Authorized Officer
        </div>
      </div>

      <div className="print-meta">
        <span>Police Training School Farooqabad</span>

        <span>Printed: {new Date().toLocaleString("en-GB")}</span>
      </div>
    </>
  );
}

function PrintTable({ rows = [], preferredKeys = [] }) {
  if (!rows.length) {
    return null;
  }

  const ignored = [
    "trainee_id",
    "staff_id",
    "old_data",
    "new_data",
    "manual_absence_data",
  ];

  const allKeys = [
    ...new Set(rows.flatMap((row) => Object.keys(row || {}))),
  ].filter((key) => !ignored.includes(key));

  const keys = [
    ...preferredKeys.filter((key) => allKeys.includes(key)),

    ...allKeys.filter((key) => !preferredKeys.includes(key)),
  ].slice(0, 9);

  return (
    <table className="official-print-table">
      <thead>
        <tr>
          <th>Sr. No.</th>
          {keys.map((key) => (
            <th key={key}>{prettyKey(key)}</th>
          ))}
        </tr>
      </thead>

      <tbody>
        {rows.map((row, index) => (
          <tr key={row.id || index}>
            <td>{index + 1}</td>
            {keys.map((key) => {
              const value = row[key];

              return (
                <td key={key}>
                  {key.includes("date") ||
                  key.includes("datetime") ||
                  key.endsWith("_at")
                    ? formatDateTime(value)
                    : typeof value === "object"
                      ? JSON.stringify(value)
                      : (value ?? "-")}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function PrintHistoryPage({ title, person, rows = [], preferredKeys = [] }) {
  return (
    <div className="print-page">
      <PrintHeader title={title} />

      <table className="print-info-table">
        <tbody>
          <tr>
            <td className="print-label">Employee ID / Cap No.</td>

            <td>{person.employee_id || "-"}</td>

            <td className="print-label">Name</td>

            <td>
              {[person.first_name, person.last_name]
                .filter(Boolean)
                .join(" ") || "-"}
            </td>
          </tr>
        </tbody>
      </table>

      <div className="print-section-title">RECORD DETAILS</div>

      {rows.length ? (
        <PrintTable rows={rows} preferredKeys={preferredKeys} />
      ) : (
        <div className="print-empty">No record available.</div>
      )}

      <PrintFooter />
    </div>
  );
}

/*
|--------------------------------------------------------------------------
| PRINT AUDIT
|--------------------------------------------------------------------------
*/

function PrintAuditHistoryPage({ person, rows = [] }) {
  return (
    <div className="print-page">
      <PrintHeader title="ACTIVITY / AUDIT" />

      <table className="print-info-table">
        <tbody>
          <tr>
            <td className="print-label">Employee ID / Cap No.</td>

            <td>{person.employee_id || "-"}</td>

            <td className="print-label">Name</td>

            <td>
              {[person.first_name, person.last_name]
                .filter(Boolean)
                .join(" ") || "-"}
            </td>
          </tr>
        </tbody>
      </table>

      <div className="print-section-title">ACTIVITY HISTORY</div>

      {rows.length ? (
        rows.map((record, index) => {
          const changes = getAuditChanges(record);

          const userName =
            record.username ||
            (record.user_id ? `User ID ${record.user_id}` : "System");

          return (
            <div
              className="print-audit-entry"
              key={record.id || `${record.created_at}-${index}`}
            >
              <table className="print-info-table">
                <tbody>
                  <tr>
                    <td className="print-label">Date / Time</td>

                    <td>{formatDateTime(record.created_at)}</td>

                    <td className="print-label">Action</td>

                    <td>{auditActionLabel(record.action)}</td>
                  </tr>

                  <tr>
                    <td className="print-label">Performed By</td>

                    <td>{userName}</td>

                    <td className="print-label">Module</td>

                    <td>{record.module || "-"}</td>
                  </tr>

                  {record.description && (
                    <tr>
                      <td className="print-label">Description</td>

                      <td colSpan={3}>{record.description}</td>
                    </tr>
                  )}
                </tbody>
              </table>

              {changes.length > 0 && (
                <table
                  className="official-print-table"
                  style={{
                    marginTop: 4,
                  }}
                >
                  <thead>
                    <tr>
                      <th>Field</th>

                      <th>Previous Value</th>

                      <th>New Value</th>
                    </tr>
                  </thead>

                  <tbody>
                    {changes.map((change) => (
                      <tr key={change.key}>
                        <td>{change.field}</td>

                        <td>{change.previous}</td>

                        <td>{change.next}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          );
        })
      ) : (
        <div className="print-empty">No Activity / Audit record available.</div>
      )}

      <PrintFooter />
    </div>
  );
}

/*
|--------------------------------------------------------------------------
| PRINT DOCUMENT
|--------------------------------------------------------------------------
*/

function OfficialPrintDocument({
  profile,
  photoUrl,
  printSections,
  includeEmpty,
}) {
  const person = profile.person || {};

  const isTrainee = profile.subject_type === "TRAINEE";

  const shouldShow = (key, rows) => {
    if (!printSections[key]) {
      return false;
    }

    if (includeEmpty) {
      return true;
    }

    if (key === "profile" || key === "attendance") {
      return true;
    }

    return Array.isArray(rows) && rows.length > 0;
  };

  return (
    <div className="official-print-document">
      {printSections.profile && (
        <div className="print-page">
          <PrintHeader
            title={isTrainee ? "TRAINEE PROFILE" : "STAFF PROFILE"}
          />

          <div className="print-profile-main">
            <div>
              <table className="print-info-table">
                <tbody>
                  <tr>
                    <td className="print-label">Employee ID / Cap No.</td>

                    <td>{person.employee_id || "-"}</td>
                  </tr>

                  <tr>
                    <td className="print-label">Name</td>

                    <td>
                      {[person.first_name, person.last_name]
                        .filter(Boolean)
                        .join(" ") || "-"}
                    </td>
                  </tr>

                  <tr>
                    <td className="print-label">Father Name</td>

                    <td>{person.father_name || "-"}</td>
                  </tr>

                  <tr>
                    <td className="print-label">CNIC</td>

                    <td>{person.cnic || "-"}</td>
                  </tr>

                  <tr>
                    <td className="print-label">Status</td>

                    <td>{person.status || "-"}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="print-photo-area">
              {person.photo_path && photoUrl ? (
                <img
                  key={photoUrl}
                  src={photoUrl}
                  alt="Profile"
                  className="print-photo"
                />
              ) : (
                <div className="print-photo-placeholder">
                  PROFILE
                  <br />
                  PHOTO
                </div>
              )}
            </div>
          </div>

          <div className="print-section-title">PERSONAL INFORMATION</div>

          <table className="print-info-table">
            <tbody>
              <tr>
                <td className="print-label">Phone</td>

                <td>{person.phone || "-"}</td>

                <td className="print-label">Email</td>

                <td>{person.email || "-"}</td>
              </tr>

              <tr>
                <td className="print-label">Address</td>

                <td colSpan={3}>{person.address || "-"}</td>
              </tr>
            </tbody>
          </table>

          <div className="print-section-title">
            {isTrainee
              ? "TRAINING INFORMATION"
              : "SERVICE / POSTING INFORMATION"}
          </div>

          {isTrainee ? (
            <table className="print-info-table">
              <tbody>
                <tr>
                  <td className="print-label">Course</td>

                  <td>{person.course_name || "-"}</td>

                  <td className="print-label">Course Code</td>

                  <td>{person.course_code || "-"}</td>
                </tr>

                <tr>
                  <td className="print-label">Platoon</td>

                  <td>{person.platoon_number || "-"}</td>

                  <td className="print-label">Position</td>

                  <td>{person.position || "-"}</td>
                </tr>

                <tr>
                  <td className="print-label">Joining Date</td>

                  <td>{formatDate(person.joining_date)}</td>

                  <td className="print-label">Training Start</td>

                  <td>{formatDate(person.training_start_date)}</td>
                </tr>

                <tr>
                  <td className="print-label">Training End</td>

                  <td>{formatDate(person.training_end_date)}</td>

                  <td className="print-label">Platoon Name</td>

                  <td>{person.platoon_name || "-"}</td>
                </tr>
              </tbody>
            </table>
          ) : (
            <table className="print-info-table">
              <tbody>
                <tr>
                  <td className="print-label">Staff Category</td>

                  <td>{person.category_name || "-"}</td>

                  <td className="print-label">Branch / Posting</td>

                  <td>{person.branch_name || "-"}</td>
                </tr>

                <tr>
                  <td className="print-label">Rank</td>

                  <td>{person.designation || "-"}</td>

                  <td className="print-label">Joining Date</td>

                  <td>{formatDate(person.joining_date)}</td>
                </tr>
              </tbody>
            </table>
          )}

          <div className="print-section-title">SYSTEM INFORMATION</div>

          <table className="print-info-table">
            <tbody>
              <tr>
                <td className="print-label">ZKBioTime</td>

                <td>
                  {person.zkteco_synced ? "SYNCED" : "PENDING / HISTORICAL"}
                </td>

                <td className="print-label">ZK Employee ID</td>

                <td>{person.zkteco_emp_id || "-"}</td>
              </tr>

              <tr>
                <td className="print-label">Remarks</td>

                <td colSpan={3}>{person.remarks || "-"}</td>
              </tr>
            </tbody>
          </table>

          {isTrainee && profile.course_history?.length > 0 && (
            <>
              <div className="print-section-title">COURSE HISTORY</div>

              <PrintTable
                rows={profile.course_history}
                preferredKeys={[
                  "course_name",
                  "course_code",
                  "platoon_number",
                  "training_start_date",
                  "training_end_date",
                  "status",
                ]}
              />
            </>
          )}

          <PrintFooter />
        </div>
      )}

      {shouldShow("attendance", profile.attendance?.records) && (
        <div className="print-page">
          <PrintHeader title="ATTENDANCE HISTORY" />

          <table className="print-info-table">
            <tbody>
              <tr>
                <td className="print-label">Employee ID / Cap No.</td>

                <td>{person.employee_id || "-"}</td>

                <td className="print-label">Name</td>

                <td>
                  {[person.first_name, person.last_name]
                    .filter(Boolean)
                    .join(" ") || "-"}
                </td>
              </tr>
            </tbody>
          </table>

          <div className="print-section-title">ATTENDANCE SUMMARY</div>

          <table className="print-info-table">
            <tbody>
              <tr>
                <td className="print-label">Total Sessions</td>

                <td>{profile.attendance?.summary?.total_sessions || 0}</td>

                <td className="print-label">Present</td>

                <td>{profile.attendance?.summary?.present || 0}</td>
              </tr>

              <tr>
                <td className="print-label">Absent</td>

                <td>{profile.attendance?.summary?.absent || 0}</td>

                <td className="print-label">Exempt</td>

                <td>{profile.attendance?.summary?.exempt || 0}</td>
              </tr>

              <tr>
                <td className="print-label">Early</td>

                <td>{profile.attendance?.summary?.early || 0}</td>

                <td className="print-label">In Time</td>

                <td>{profile.attendance?.summary?.in_time || 0}</td>
              </tr>

              <tr>
                <td className="print-label">Late</td>

                <td>{profile.attendance?.summary?.late || 0}</td>

                <td className="print-label">Manual Absence</td>

                <td>{profile.attendance?.summary?.manual_absence || 0}</td>
              </tr>
            </tbody>
          </table>

          <div className="print-section-title">DETAILED ATTENDANCE</div>

          <PrintTable
            rows={profile.attendance?.records || []}
            preferredKeys={[
              "attendance_date",
              "session_type",
              "selected_punch",
              "attendance_status",
              "timing_status",
              "timing_minutes",
              "exemption_type",
            ]}
          />

          <PrintFooter />
        </div>
      )}


      {!isTrainee &&
        shouldShow("custom_shift_duty", profile.custom_shift_duty?.records) && (
          <div className="print-page">
            <PrintHeader title="CUSTOM SHIFT DUTY ATTENDANCE HISTORY" />

            <table className="print-info-table">
              <tbody>
                <tr>
                  <td className="print-label">Employee ID / Cap No.</td>
                  <td>{person.employee_id || "-"}</td>
                  <td className="print-label">Name</td>
                  <td>
                    {[person.first_name, person.last_name]
                      .filter(Boolean)
                      .join(" ") || "-"}
                  </td>
                </tr>
                <tr>
                  <td className="print-label">Total Shift Duties</td>
                  <td>{profile.custom_shift_duty?.summary?.total || 0}</td>
                  <td className="print-label">Present / Absent</td>
                  <td>
                    {profile.custom_shift_duty?.summary?.present || 0} / {profile.custom_shift_duty?.summary?.absent || 0}
                  </td>
                </tr>
                <tr>
                  <td className="print-label">Exempt / Pending</td>
                  <td>
                    {profile.custom_shift_duty?.summary?.exempt || 0} / {profile.custom_shift_duty?.summary?.pending || 0}
                  </td>
                  <td className="print-label">Checked Out / Missing</td>
                  <td>
                    {profile.custom_shift_duty?.summary?.checked_out || 0} / {profile.custom_shift_duty?.summary?.missing_checkout || 0}
                  </td>
                </tr>
              </tbody>
            </table>

            <div className="print-section-title">SHIFT DUTY HISTORY</div>

            <PrintTable
              rows={profile.custom_shift_duty?.records || []}
              preferredKeys={[
                "attendance_date",
                "group_name",
                "shift_name",
                "duty_point_name",
                "start_time",
                "end_time",
                "start_punch_time",
                "end_punch_time",
                "attendance_status",
                "checkout_status",
                "exemption_type",
              ]}
            />

            <PrintFooter />
          </div>
        )}

      {shouldShow(
        "continuous_absence",
        profile.continuous_absence?.records,
      ) && (
        <PrintHistoryPage
          title="CONTINUOUS ABSENCE / RETURN HISTORY"
          person={person}
          rows={(profile.continuous_absence?.records || []).map((record) => ({
            id: record.id,

            absent_from: record.absent_from,

            return_punch_at: record.return_punch_at,

            period: formatDurationSeconds(record.period_seconds),

            missed_sessions: Number(record.missed_session_count || 0),

            start_source: record.start_source_type || "-",

            context:
              record.start_context_name || record.start_context_type || "-",

            status: record.status,
          }))}
          preferredKeys={[
            "absent_from",
            "return_punch_at",
            "period",
            "missed_sessions",
            "start_source",
            "context",
            "status",
          ]}
        />
      )}

      {isTrainee &&
        shouldShow("long_weekend", profile.long_weekend?.records) && (
          <PrintHistoryPage
            title="LONG WEEKEND / DEPARTURE HISTORY"
            person={person}
            rows={profile.long_weekend?.records || []}
            preferredKeys={[
              "weekend_name",
              "departure_date",
              "window_start",
              "window_end",
              "punch_time",
              "attendance_status",
            ]}
          />
        )}

      {shouldShow("manual_absence", profile.manual_absence) && (
        <PrintHistoryPage
          title="MANUAL ABSENCE & DECISION"
          person={person}
          rows={profile.manual_absence || []}
          preferredKeys={[
            "absence_category",
            "program_class",
            "start_datetime",
            "end_datetime",
            "reason",
            "record_status",
            "remarks",
          ]}
        />
      )}

      {shouldShow("leave", profile.leaves) && (
        <PrintHistoryPage
          title="LEAVE HISTORY"
          person={person}
          rows={profile.leaves || []}
          preferredKeys={[
            "leave_type",
            "leave_category",
            "start_datetime",
            "end_datetime",
            "reason",
            "reference_no",
            "workflow_status",
          ]}
        />
      )}

      {shouldShow("osd_permission", profile.osd_permission) && (
        <PrintHistoryPage
          title="OSD / PERMISSION HISTORY"
          person={person}
          rows={profile.osd_permission || []}
          preferredKeys={[
            "record_type",
            "start_datetime",
            "end_datetime",
            "reason",
            "duty_place",
            "reference_no",
            "workflow_status",
          ]}
        />
      )}

      {shouldShow("outdoor_medical", profile.outdoor_medical) && (
        <PrintHistoryPage
          title="OUTDOOR / MEDICAL / HOME REST"
          person={person}
          rows={profile.outdoor_medical || []}
          preferredKeys={[
            "outdoor_purpose",
            "start_datetime",
            "end_datetime",
            "doctor_name",
            "doctor_recommendation",
            "home_rest",
            "home_rest_start",
            "home_rest_end",
            "workflow_status",
          ]}
        />
      )}

      {isTrainee && shouldShow("training_drop", profile.training_drop) && (
        <PrintHistoryPage
          title="TRAINING DROP HISTORY"
          person={person}
          rows={profile.training_drop || []}
          preferredKeys={[
            "drop_status",
            "drop_datetime",
            "rejoin_datetime",
            "reason",
            "order_reference",
          ]}
        />
      )}

      {shouldShow("audit", profile.audit) && (
        <PrintAuditHistoryPage person={person} rows={profile.audit || []} />
      )}
    </div>
  );
}

/*
|--------------------------------------------------------------------------
| MAIN
|--------------------------------------------------------------------------
*/

export default function PersonProfile({ subjectType, subjectId, onBack }) {
  const [form] = Form.useForm();

  const { hasPermission } = useAuth();

  const canEditProfile = hasPermission("profiles.edit");

  const [loading, setLoading] = useState(false);

  const [saving, setSaving] = useState(false);

  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const [profile, setProfile] = useState(null);

  const [activeTab, setActiveTab] = useState("profile");

  const [editOpen, setEditOpen] = useState(false);

  const [courses, setCourses] = useState([]);

  const [platoons, setPlatoons] = useState([]);

  const [categories, setCategories] = useState([]);

  const [branches, setBranches] = useState([]);

  const [printSections, setPrintSections] = useState(DEFAULT_PRINT_SECTIONS);

  const [profileOnly, setProfileOnly] = useState(false);

  const [includeEmpty, setIncludeEmpty] = useState(false);

  const [photoUrl, setPhotoUrl] = useState(null);

  const isTrainee = String(subjectType).toUpperCase() === "TRAINEE";

  /*
  |--------------------------------------------------------------------------
  | AUTHENTICATED PROFILE PHOTO
  |--------------------------------------------------------------------------
  |
  | Profile photo endpoint ab permission-protected hai.
  | Isliye direct <img src="/api/..."> use nahi karte.
  | Axios Bearer-token request se Blob load hota hai.
  |--------------------------------------------------------------------------
  */

  const loadProfilePhoto = async () => {
    if (!subjectType || !subjectId) {
      setPhotoUrl(null);

      return null;
    }

    try {
      const response = await api.get(
        `/profiles/${String(subjectType).toUpperCase()}/${subjectId}/photo`,
        {
          responseType: "blob",
        },
      );

      const objectUrl = window.URL.createObjectURL(response.data);

      setPhotoUrl(objectUrl);

      return objectUrl;
    } catch (error) {
      setPhotoUrl(null);

      /*
        |--------------------------------------------------------------------------
        | 404 = profile photo not available
        |--------------------------------------------------------------------------
        */

      if (error.response?.status !== 404) {
        console.error("Could not load profile photo:", error.message);
      }

      return null;
    }
  };

  /*
  |--------------------------------------------------------------------------
  | BLOB URL CLEANUP
  |--------------------------------------------------------------------------
  */

  useEffect(() => {
    return () => {
      if (photoUrl) {
        window.URL.revokeObjectURL(photoUrl);
      }
    };
  }, [photoUrl]);

  /*
  |--------------------------------------------------------------------------
  | LOAD PROFILE
  |--------------------------------------------------------------------------
  */

  const loadProfile = async () => {
    if (!subjectType || !subjectId) {
      setProfile(null);

      setPhotoUrl(null);

      return;
    }

    setLoading(true);

    try {
      const response = await api.get(
        `/profiles/${String(subjectType).toUpperCase()}/${subjectId}`,
      );

      const data = response.data?.data || null;

      setProfile(data);

      if (data?.person?.photo_path) {
        await loadProfilePhoto();
      } else {
        setPhotoUrl(null);
      }
    } catch (error) {
      setProfile(null);

      setPhotoUrl(null);

      message.error(
        error.response?.data?.message || "Could not load detailed profile.",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setActiveTab("profile");

    setPrintSections(DEFAULT_PRINT_SECTIONS);

    setProfileOnly(false);

    setIncludeEmpty(false);

    loadProfile();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectType, subjectId]);

  /*
  |--------------------------------------------------------------------------
  | MASTER DATA
  |--------------------------------------------------------------------------
  */

  const loadMasters = async () => {
    try {
      if (isTrainee) {
        const response = await api.get("/courses");

        setCourses(response.data?.data || []);
      } else {
        const [categoryResponse, branchResponse] = await Promise.all([
          api.get("/staff/categories"),

          api.get("/staff/branches"),
        ]);

        setCategories(categoryResponse.data?.data || []);

        setBranches(branchResponse.data?.data || []);
      }
    } catch (error) {
      message.error("Could not load master data.");
    }
  };

  const loadPlatoons = async (courseId) => {
    if (!courseId) {
      setPlatoons([]);

      return;
    }

    try {
      const response = await api.get("/platoons", {
        params: {
          course_id: courseId,
        },
      });

      setPlatoons(response.data?.data || []);
    } catch (_) {
      setPlatoons([]);
    }
  };

  /*
  |--------------------------------------------------------------------------
  | EDIT
  |--------------------------------------------------------------------------
  */

  const openEdit = async () => {
    if (!canEditProfile) {
      message.warning("You do not have permission to edit profiles.");

      return;
    }

    if (!profile?.person) {
      return;
    }

    await loadMasters();

    const person = profile.person;

    if (isTrainee && person.course_id) {
      await loadPlatoons(person.course_id);
    }

    form.setFieldsValue({
      employee_id: person.employee_id || "",

      first_name: person.first_name || "",

      last_name: person.last_name || "",

      father_name: person.father_name || "",

      cnic: person.cnic || "",

      phone: person.phone || "",

      email: person.email || "",

      address: person.address || "",

      status: person.status || "ACTIVE",

      remarks: person.remarks || "",

      course_id: person.course_id || null,

      platoon_id: person.platoon_id || null,

      position: person.position || "",

      joining_date: inputDate(person.joining_date),

      training_start_date: inputDate(person.training_start_date),

      training_end_date: inputDate(person.training_end_date),

      category_id: person.category_id || null,

      branch_id: person.branch_id || null,

      designation: person.designation || "",
    });

    setEditOpen(true);
  };

  /*
  |--------------------------------------------------------------------------
  | SAVE
  |--------------------------------------------------------------------------
  */

  const saveProfile = async () => {
    if (!canEditProfile) {
      message.warning("You do not have permission to edit profiles.");

      return;
    }

    try {
      const values = await form.validateFields();

      setSaving(true);

      if (isTrainee) {
        const selectedCourse = courses.find(
          (item) => Number(item.id) === Number(values.course_id),
        );

        const selectedPlatoon = platoons.find(
          (item) => Number(item.id) === Number(values.platoon_id),
        );

        const payload = {
          employee_id: profile.person.employee_id,

          first_name: values.first_name?.trim() || null,

          last_name: values.last_name?.trim() || null,

          father_name: values.father_name?.trim() || null,

          cnic: values.cnic?.trim() || null,

          phone: values.phone?.trim() || null,

          email: values.email?.trim() || null,

          address: values.address?.trim() || null,

          course_id: values.course_id || null,

          course_name:
            selectedCourse?.course_name || profile.person.course_name || null,

          platoon_id: values.platoon_id || null,

          platoon_number:
            selectedPlatoon?.platoon_number !== undefined
              ? String(selectedPlatoon.platoon_number)
              : null,

          position: values.position?.trim() || null,

          joining_date: values.joining_date || null,

          training_start_date: values.training_start_date || null,

          training_end_date: values.training_end_date || null,

          status: values.status || "ACTIVE",

          remarks: values.remarks?.trim() || null,
        };

        const response = await api.put(`/trainees/${subjectId}`, payload);

        const zk = response.data?.zkbiotime;

        if (zk?.status === "PENDING") {
          message.warning(
            zk.message || "Profile updated. ZKBioTime sync pending.",
          );
        } else {
          message.success("Trainee profile updated successfully.");
        }
      } else {
        const payload = {
          employee_id: profile.person.employee_id,

          first_name: values.first_name?.trim() || null,

          last_name: values.last_name?.trim() || null,

          father_name: values.father_name?.trim() || null,

          cnic: values.cnic?.trim() || null,

          phone: values.phone?.trim() || null,

          email: values.email?.trim() || null,

          address: values.address?.trim() || null,

          category_id: values.category_id,

          branch_id: values.branch_id || null,

          designation: values.designation?.trim() || null,

          joining_date: values.joining_date || null,

          status: values.status || "ACTIVE",

          remarks: values.remarks?.trim() || null,
        };

        const response = await api.put(`/staff/${subjectId}`, payload);

        const zk = response.data?.zkbiotime;

        if (zk?.status === "PENDING") {
          message.warning(
            zk.message || "Profile updated. ZKBioTime sync pending.",
          );
        } else {
          message.success("Staff profile updated successfully.");
        }
      }

      setEditOpen(false);

      await loadProfile();
    } catch (error) {
      if (error?.errorFields) {
        return;
      }

      message.error(
        error.response?.data?.message || "Could not update profile.",
      );
    } finally {
      setSaving(false);
    }
  };

  /*
  |--------------------------------------------------------------------------
  | PHOTO UPLOAD
  |--------------------------------------------------------------------------
  */

  const uploadPhoto = async (file) => {
    if (!canEditProfile) {
      message.warning("You do not have permission to change profile photos.");

      return false;
    }

    setUploadingPhoto(true);

    try {
      const formData = new FormData();

      formData.append("photo", file);

      await api.post(
        `/profiles/${String(subjectType).toUpperCase()}/${subjectId}/photo`,
        formData,
        {
          timeout: 120000,
        },
      );

      message.success("Profile photo updated successfully.");

      await loadProfile();
    } catch (error) {
      message.error(
        error.response?.data?.message || "Could not upload profile photo.",
      );
    } finally {
      setUploadingPhoto(false);
    }

    return false;
  };

  const removePhoto = async () => {
    if (!canEditProfile) {
      message.warning("You do not have permission to remove profile photos.");

      return;
    }

    try {
      await api.delete(
        `/profiles/${String(subjectType).toUpperCase()}/${subjectId}/photo`,
      );

      setPhotoUrl(null);

      message.success("Profile photo removed successfully.");

      await loadProfile();
    } catch (error) {
      message.error(
        error.response?.data?.message || "Could not remove profile photo.",
      );
    }
  };

  /*
  |--------------------------------------------------------------------------
  | PRINT
  |--------------------------------------------------------------------------
  */

  const togglePrintSection = (key, checked) => {
    setPrintSections((previous) => ({
      ...previous,

      [key]: checked,
    }));

    if (key !== "profile" && checked) {
      setProfileOnly(false);
    }
  };

  const toggleProfileOnly = (checked) => {
    setProfileOnly(checked);

    if (checked) {
      setPrintSections({
        profile: true,

        attendance: false,

        custom_shift_duty: false,

        continuous_absence: false,

        manual_absence: false,

        leave: false,

        osd_permission: false,

        outdoor_medical: false,

        training_drop: false,

        audit: false,
      });
    } else {
      setPrintSections(DEFAULT_PRINT_SECTIONS);
    }
  };

  const handlePrint = () => {
    if (!Object.values(printSections).some(Boolean)) {
      message.warning("Print ke liye kam az kam aik section select karein.");

      return;
    }

    window.print();
  };

  /*
  |--------------------------------------------------------------------------
  | TABS
  |--------------------------------------------------------------------------
  */

  const tabItems = useMemo(() => {
    if (!profile) {
      return [];
    }

    return [
      {
        key: "profile",

        label: "Profile",

        children: <ScreenProfile profile={profile} />,
      },

      {
        key: "attendance",

        label: `Attendance (${profile.attendance?.records?.length || 0})`,

        children: <AttendanceSection attendance={profile.attendance} />,
      },

      ...(!isTrainee
        ? [
            {
              key: "custom_shift_duty",

              label: `Custom Shift Duty (${profile.custom_shift_duty?.records?.length || 0})`,

              children: (
                <CustomShiftDutySection
                  shiftDuty={profile.custom_shift_duty}
                />
              ),
            },
          ]
        : []),

      {
        key: "continuous_absence",

        label: `Continuous Absence (${profile.continuous_absence?.summary?.total_episodes || 0})`,

        children: (
          <ContinuousAbsenceSection
            continuousAbsence={profile.continuous_absence}
          />
        ),
      },

      ...(isTrainee
        ? [
            {
              key: "long_weekend",

              label: `Long Weekend (${profile.long_weekend?.summary?.total_long_weekends || 0})`,

              children: (
                <div>
                  <Row
                    gutter={[12, 12]}
                    style={{
                      marginBottom: 16,
                    }}
                  >
                    <Col xs={24} sm={12} lg={6}>
                      <Card>
                        <Statistic
                          title="Total Long Weekends"
                          value={
                            profile.long_weekend?.summary
                              ?.total_long_weekends || 0
                          }
                        />
                      </Card>
                    </Col>

                    <Col xs={24} sm={12} lg={6}>
                      <Card>
                        <Statistic
                          title="Successful Departures"
                          value={
                            profile.long_weekend?.summary?.departure_present ||
                            0
                          }
                        />
                      </Card>
                    </Col>

                    <Col xs={24} sm={12} lg={6}>
                      <Card>
                        <Statistic
                          title="Departure Absences"
                          value={
                            profile.long_weekend?.summary?.departure_absent || 0
                          }
                        />
                      </Card>
                    </Col>

                    <Col xs={24} sm={12} lg={6}>
                      <Card>
                        <Statistic
                          title="Weekend Detain"
                          value={profile.long_weekend?.summary?.detained || 0}
                        />
                      </Card>
                    </Col>
                  </Row>

                  <GenericHistory
                    rows={profile.long_weekend?.records || []}
                    emptyText="No completed Long Weekend departure history available."
                  />
                </div>
              ),
            },
          ]
        : []),

      {
        key: "manual_absence",

        label: `Manual Absence & Decision (${profile.manual_absence?.length || 0})`,

        children: (
          <GenericHistory
            rows={profile.manual_absence || []}
            emptyText="No Manual Absence / Decision record available."
          />
        ),
      },

      {
        key: "leave",

        label: `Leave (${profile.leaves?.length || 0})`,

        children: (
          <GenericHistory
            rows={profile.leaves || []}
            emptyText="No Leave record available."
          />
        ),
      },

      {
        key: "osd_permission",

        label: `OSD / Permission (${profile.osd_permission?.length || 0})`,

        children: (
          <GenericHistory
            rows={profile.osd_permission || []}
            emptyText="No OSD / Permission record available."
          />
        ),
      },

      {
        key: "outdoor_medical",

        label: `Outdoor / Medical / Home Rest (${profile.outdoor_medical?.length || 0})`,

        children: (
          <GenericHistory
            rows={profile.outdoor_medical || []}
            emptyText="No Outdoor / Medical / Home Rest record available."
          />
        ),
      },

      {
        key: "training_drop",

        label: isTrainee
          ? `Training Drop (${profile.training_drop?.length || 0})`
          : "Training Drop",

        children: isTrainee ? (
          <GenericHistory
            rows={profile.training_drop || []}
            emptyText="No Training Drop record available."
          />
        ) : (
          <Alert
            type="info"
            showIcon
            message="Training Drop is not applicable to Staff."
          />
        ),
      },

      {
        key: "audit",

        label: `Activity / Audit (${profile.audit?.length || 0})`,

        children: <AuditHistory rows={profile.audit || []} />,
      },
    ];
  }, [profile, isTrainee]);

  /*
  |--------------------------------------------------------------------------
  | LOADING
  |--------------------------------------------------------------------------
  */

  if (loading && !profile) {
    return (
      <Card>
        <div
          style={{
            minHeight: 420,

            display: "flex",

            alignItems: "center",

            justifyContent: "center",
          }}
        >
          <Spin size="large" tip="Loading Profile..." />
        </div>
      </Card>
    );
  }

  if (!profile) {
    return (
      <Card>
        <Button icon={<ArrowLeftOutlined />} onClick={onBack}>
          Back
        </Button>

        <Alert
          type="warning"
          showIcon
          style={{
            marginTop: 16,
          }}
          message="Profile could not be loaded."
        />
      </Card>
    );
  }

  const person = profile.person || {};

  /*
  |--------------------------------------------------------------------------
  | SCREEN
  |--------------------------------------------------------------------------
  */

  return (
    <>
      <style>
        {`
          .person-profile-hero {
            background: linear-gradient(
              135deg,
              #0b2545 0%,
              #173f6d 100%
            );
            border-radius: 12px;
            padding: 22px;
            color: #fff;
            margin-bottom: 16px;
            box-shadow: 0 4px 14px rgba(0,0,0,.08);
          }

          .person-profile-hero .ant-typography {
            color: #fff;
          }

          .person-photo-box {
            width: 132px;
            height: 154px;
            background: #fff;
            border: 4px solid rgba(255,255,255,.92);
            border-radius: 8px;
            overflow: hidden;
            display: flex;
            align-items: center;
            justify-content: center;
          }

          .official-print-document {
            display: none;
          }

          @media print {

            body * {
              visibility: hidden !important;
            }

            .official-print-document,
            .official-print-document * {
              visibility: visible !important;
            }

            .official-print-document {
              display: block !important;
              position: absolute;
              left: 0;
              top: 0;
              width: 100%;
              background: #fff;
              color: #000;
              font-family: Arial, Helvetica, sans-serif;
            }

            .print-page {
              width: 100%;
              page-break-after: always;
              break-after: page;
            }

            .print-page:last-child {
              page-break-after: auto;
              break-after: auto;
            }

            .print-header {
              text-align: center;
              border-bottom: 3px double #000;
              padding-bottom: 8px;
              margin-bottom: 14px;
            }

            .print-police {
              font-size: 18px;
              font-weight: 800;
              letter-spacing: .5px;
            }

            .print-school {
              font-size: 15px;
              font-weight: 700;
              margin-top: 2px;
            }

            .print-system {
              font-size: 10px;
              margin-top: 3px;
            }

            .print-title {
              font-size: 16px;
              font-weight: 800;
              margin-top: 8px;
            }

            .print-profile-main {
              display: grid;
              grid-template-columns: 1fr 120px;
              gap: 12px;
              border: 1px solid #000;
              padding: 8px;
            }

            .print-photo-area {
              display: flex;
              justify-content: center;
              align-items: flex-start;
            }

            .print-photo {
              width: 108px;
              height: 128px;
              object-fit: cover;
              border: 1px solid #000;
            }

            .print-photo-placeholder {
              width: 108px;
              height: 128px;
              border: 1px solid #000;
              display: flex;
              align-items: center;
              justify-content: center;
              text-align: center;
              font-size: 10px;
              font-weight: 700;
            }

            .print-section-title {
              background: #e8e8e8;
              border: 1px solid #000;
              border-bottom: 0;
              font-size: 10px;
              font-weight: 800;
              padding: 5px 7px;
              margin-top: 11px;
            }

            .print-info-table,
            .official-print-table {
              width: 100%;
              border-collapse: collapse;
              font-size: 9.5px;
            }

            .print-info-table td,
            .official-print-table th,
            .official-print-table td {
              border: 1px solid #000;
              padding: 4px 5px;
              vertical-align: top;
              word-break: break-word;
            }

            .official-print-table th {
              background: #ededed;
              font-weight: 800;
            }

            .print-label {
              width: 18%;
              background: #f5f5f5;
              font-weight: 700;
            }

            .print-empty {
              border: 1px solid #000;
              padding: 8px;
              font-size: 10px;
            }

            .print-audit-entry {
              margin-top: 10px;
              break-inside: avoid;
              page-break-inside: avoid;
            }

            .print-audit-entry + .print-audit-entry {
              padding-top: 8px;
              border-top: 2px solid #000;
            }

            .print-signatures {
              display: grid;
              grid-template-columns: repeat(3, 1fr);
              gap: 32px;
              text-align: center;
              margin-top: 36px;
              font-size: 9.5px;
            }

            .signature-line {
              border-top: 1px solid #000;
              margin-bottom: 4px;
            }

            .print-meta {
              display: flex;
              justify-content: space-between;
              margin-top: 20px;
              padding-top: 5px;
              border-top: 1px solid #aaa;
              font-size: 8.5px;
            }

            @page {
              size: A4 portrait;
              margin: 10mm;
            }
          }
        `}
      </style>

      <div>
        {/* TOP ACTIONS */}

        <div
          style={{
            display: "flex",

            justifyContent: "space-between",

            alignItems: "center",

            gap: 12,

            marginBottom: 14,
          }}
        >
          <Space wrap>
            <Button icon={<ArrowLeftOutlined />} onClick={onBack}>
              Back
            </Button>

            <Button
              icon={<ReloadOutlined />}
              loading={loading}
              onClick={loadProfile}
            >
              Refresh
            </Button>
          </Space>

          <Space wrap>
            {canEditProfile && (
              <Button icon={<EditOutlined />} onClick={openEdit}>
                Edit Profile
              </Button>
            )}

            <Button
              type="primary"
              icon={<PrinterOutlined />}
              onClick={handlePrint}
            >
              Print Profile
            </Button>
          </Space>
        </div>

        {/* PROFILE HERO */}

        <div className="person-profile-hero">
          <Row gutter={[24, 16]} align="middle">
            <Col>
              <div className="person-photo-box">
                {photoUrl ? (
                  <Image
                    key={photoUrl}
                    src={photoUrl}
                    preview
                    width="100%"
                    height="100%"
                    style={{
                      objectFit: "cover",
                    }}
                  />
                ) : (
                  <Avatar size={90} icon={<UserOutlined />} />
                )}
              </div>
            </Col>

            <Col flex="auto">
              <Text
                style={{
                  opacity: 0.82,

                  fontSize: 12,
                }}
              >
                {isTrainee ? "TRAINEE PROFILE" : "STAFF PROFILE"}
              </Text>

              <Title
                level={2}
                style={{
                  margin: "4px 0",
                }}
              >
                {[person.first_name, person.last_name]
                  .filter(Boolean)
                  .join(" ") || "Unnamed Employee"}
              </Title>

              <Space wrap size="middle">
                <Text strong>
                  <IdcardOutlined /> {person.employee_id || "-"}
                </Text>

                <StatusTag value={person.status} />

                {person.zkteco_synced ? (
                  <Tag color="green">ZKBioTime Synced</Tag>
                ) : (
                  <Tag color="orange">ZKBioTime Pending</Tag>
                )}
              </Space>

              <div
                style={{
                  marginTop: 10,
                }}
              >
                <Text>
                  {isTrainee
                    ? `${person.course_name || "No Course"} • Platoon ${person.platoon_number || "-"}`
                    : `${person.category_name || "No Category"} • ${person.branch_name || "No Posting"}`}
                </Text>
              </div>
            </Col>

            {canEditProfile && (
              <Col>
                <Space direction="vertical">
                  <Upload
                    accept=".jpg,.jpeg,.png,.webp"
                    showUploadList={false}
                    beforeUpload={uploadPhoto}
                  >
                    <Button icon={<UploadOutlined />} loading={uploadingPhoto}>
                      {person.photo_path ? "Change Photo" : "Upload Photo"}
                    </Button>
                  </Upload>

                  {person.photo_path && (
                    <Popconfirm
                      title="Remove profile photo?"
                      description="Current profile photo permanently remove ho jayegi."
                      okText="Remove"
                      okType="danger"
                      cancelText="Cancel"
                      onConfirm={removePhoto}
                    >
                      <Button danger icon={<DeleteOutlined />}>
                        Remove Photo
                      </Button>
                    </Popconfirm>
                  )}
                </Space>
              </Col>
            )}
          </Row>
        </div>

        {/* PRINT CONFIGURATION */}

        <Card
          size="small"
          title="Print Configuration"
          style={{
            marginBottom: 16,
          }}
        >
          <Row gutter={[16, 12]}>
            {Object.entries(PRINT_SECTIONS).map(([key, label]) => (
              <Col xs={24} sm={12} md={8} lg={6} key={key}>
                <Checkbox
                  checked={Boolean(printSections[key])}
                  disabled={profileOnly && key !== "profile"}
                  onChange={(event) =>
                    togglePrintSection(key, event.target.checked)
                  }
                >
                  Show <strong>{label}</strong> in Print
                </Checkbox>
              </Col>
            ))}
          </Row>

          <Divider />

          <Space wrap>
            <Checkbox
              checked={profileOnly}
              onChange={(event) => toggleProfileOnly(event.target.checked)}
            >
              <strong>Print Profile Only</strong>
            </Checkbox>

            <Checkbox
              checked={includeEmpty}
              onChange={(event) => setIncludeEmpty(event.target.checked)}
            >
              Include Empty Sections
            </Checkbox>
          </Space>
        </Card>

        {/* TABS */}

        <Card>
          <Tabs
            activeKey={activeTab}
            onChange={setActiveTab}
            items={tabItems}
          />
        </Card>
      </div>

      {/* EDIT DRAWER */}

      <Drawer
        title={isTrainee ? "Edit Trainee Profile" : "Edit Staff Profile"}
        width={760}
        open={canEditProfile && editOpen}
        destroyOnHidden
        onClose={() => setEditOpen(false)}
        extra={
          <Space>
            <Button onClick={() => setEditOpen(false)}>Cancel</Button>

            <Button
              type="primary"
              icon={<SaveOutlined />}
              loading={saving}
              onClick={saveProfile}
            >
              Save Changes
            </Button>
          </Space>
        }
      >
        <Alert
          showIcon
          type="info"
          message="Employee ID / Cap No. cannot be changed."
          style={{
            marginBottom: 18,
          }}
        />

        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="employee_id" label="Employee ID / Cap No.">
                <Input disabled />
              </Form.Item>
            </Col>

            <Col span={12}>
              <Form.Item name="status" label="Status">
                <Select
                  options={
                    isTrainee ? TRAINEE_STATUS_OPTIONS : STAFF_STATUS_OPTIONS
                  }
                />
              </Form.Item>
            </Col>
          </Row>

          <Divider orientation="left">Personal Information</Divider>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="first_name" label="First Name">
                <Input />
              </Form.Item>
            </Col>

            <Col span={12}>
              <Form.Item name="last_name" label="Last Name">
                <Input />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="father_name" label="Father Name">
                <Input />
              </Form.Item>
            </Col>

            <Col span={12}>
              <Form.Item name="cnic" label="CNIC">
                <Input />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="phone" label="Phone">
                <Input />
              </Form.Item>
            </Col>

            <Col span={12}>
              <Form.Item name="email" label="Email">
                <Input />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="address" label="Address">
            <TextArea rows={2} />
          </Form.Item>

          {isTrainee ? (
            <>
              <Divider orientation="left">Training Information</Divider>

              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item
                    name="course_id"
                    label="Course"
                    rules={[
                      {
                        required: true,

                        message: "Course is required.",
                      },
                    ]}
                  >
                    <Select
                      showSearch
                      optionFilterProp="label"
                      options={courses.map((item) => ({
                        value: item.id,

                        label: item.course_name,
                      }))}
                      onChange={(value) => {
                        form.setFieldValue("platoon_id", null);

                        loadPlatoons(value);
                      }}
                    />
                  </Form.Item>
                </Col>

                <Col span={12}>
                  <Form.Item name="platoon_id" label="Platoon">
                    <Select
                      allowClear
                      showSearch
                      optionFilterProp="label"
                      options={platoons.map((item) => ({
                        value: item.id,

                        label: String(item.platoon_number),
                      }))}
                    />
                  </Form.Item>
                </Col>
              </Row>

              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item name="position" label="Position">
                    <Input />
                  </Form.Item>
                </Col>

                <Col span={12}>
                  <Form.Item name="joining_date" label="Joining Date">
                    <Input type="date" />
                  </Form.Item>
                </Col>
              </Row>

              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item
                    name="training_start_date"
                    label="Training Start Date"
                  >
                    <Input type="date" />
                  </Form.Item>
                </Col>

                <Col span={12}>
                  <Form.Item name="training_end_date" label="Training End Date">
                    <Input type="date" />
                  </Form.Item>
                </Col>
              </Row>
            </>
          ) : (
            <>
              <Divider orientation="left">Staff / Posting Information</Divider>

              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item
                    name="category_id"
                    label="Staff Category / Duty Type"
                    rules={[
                      {
                        required: true,

                        message: "Staff Category is required.",
                      },
                    ]}
                  >
                    <Select
                      showSearch
                      optionFilterProp="label"
                      options={categories.map((item) => ({
                        value: item.id,

                        label: item.category_name,
                      }))}
                    />
                  </Form.Item>
                </Col>

                <Col span={12}>
                  <Form.Item name="branch_id" label="Branch / Posting">
                    <Select
                      allowClear
                      showSearch
                      optionFilterProp="label"
                      options={branches.map((item) => ({
                        value: item.id,

                        label: item.branch_name,
                      }))}
                    />
                  </Form.Item>
                </Col>
              </Row>

              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item name="designation" label="Rank">
                    <Input />
                  </Form.Item>
                </Col>

                <Col span={12}>
                  <Form.Item name="joining_date" label="Joining Date">
                    <Input type="date" />
                  </Form.Item>
                </Col>
              </Row>
            </>
          )}

          <Form.Item name="remarks" label="Remarks">
            <TextArea rows={3} />
          </Form.Item>
        </Form>
      </Drawer>

      {/* PRINT */}

      <OfficialPrintDocument
        profile={profile}
        photoUrl={photoUrl}
        printSections={printSections}
        includeEmpty={includeEmpty}
      />
    </>
  );
}
