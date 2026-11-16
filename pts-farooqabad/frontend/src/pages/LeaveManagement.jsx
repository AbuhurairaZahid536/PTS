import { useEffect, useMemo, useState } from "react";

import {
  Alert,
  Button,
  Card,
  Col,
  DatePicker,
  Descriptions,
  Drawer,
  Form,
  Input,
  Modal,
  Row,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  Upload,
  message,
} from "antd";

import {
  DownloadOutlined,
  EditOutlined,
  EyeOutlined,
  FileExcelOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  StopOutlined,
  UploadOutlined,
} from "@ant-design/icons";

import dayjs from "dayjs";

import api from "../services/api";

import { useAuth } from "../contexts/AuthContext";

const { Title, Text } = Typography;

const { RangePicker } = DatePicker;

/*
|--------------------------------------------------------------------------
| HELPERS
|--------------------------------------------------------------------------
*/

function formatDateTime(value) {
  if (!value) {
    return "-";
  }

  return dayjs(value).format("DD-MMM-YYYY hh:mm A");
}

function formatDate(value) {
  if (!value) {
    return "-";
  }

  return dayjs(value).format("DD-MMM-YYYY");
}

function getStatusColor(status) {
  switch (status) {
    case "APPROVED":
      return "green";

    case "PENDING":
      return "gold";

    case "REJECTED":
      return "red";

    case "CANCELLED":
      return "default";

    case "COMPLETED":
      return "blue";

    default:
      return "default";
  }
}

function fullName(record) {
  return (
    record.subject_name ||
    [record.first_name, record.last_name].filter(Boolean).join(" ") ||
    "-"
  );
}

function downloadBlob(blob, filename) {
  const url = window.URL.createObjectURL(blob);

  const anchor = document.createElement("a");

  anchor.href = url;

  anchor.download = filename;

  document.body.appendChild(anchor);

  anchor.click();

  anchor.remove();

  window.URL.revokeObjectURL(url);
}

/*
|--------------------------------------------------------------------------
| COMPONENT
|--------------------------------------------------------------------------
*/

export default function LeaveManagement({
  subjectType = "TRAINEE",
  defaultCategory = null,
}) {
  const [form] = Form.useForm();
  const [homeRestForm] = Form.useForm();
  const [homeRestEditing, setHomeRestEditing] = useState(null);
  const [homeRestSaving, setHomeRestSaving] = useState(false);

  const { hasPermission } = useAuth();

  const [loading, setLoading] = useState(false);

  const [saving, setSaving] = useState(false);

  const [exporting, setExporting] = useState(false);

  const [templateLoading, setTemplateLoading] = useState(false);

  const [importing, setImporting] = useState(false);

  const [leaves, setLeaves] = useState([]);

  const [overallTotal, setOverallTotal] = useState(0);

  const [subjectOptions, setSubjectOptions] = useState([]);

  const [search, setSearch] = useState("");

  const [dateRange, setDateRange] = useState(null);

  const [courseFilter, setCourseFilter] = useState(null);

  const [staffCategoryFilter, setStaffCategoryFilter] = useState(null);

  const [branchFilter, setBranchFilter] = useState(null);

  const [drawerOpen, setDrawerOpen] = useState(false);

  const [editingRecord, setEditingRecord] = useState(null);

  const [viewOpen, setViewOpen] = useState(false);

  const [viewingRecord, setViewingRecord] = useState(null);

  const [importOpen, setImportOpen] = useState(false);

  const [importFile, setImportFile] = useState(null);

  const [importResult, setImportResult] = useState(null);

  const canNormalLeave = hasPermission("leave.create");

  const canEdit = hasPermission("leave.edit");

  const canCancel = hasPermission("leave.cancel");

  /*
  |--------------------------------------------------------------------------
  | FILTER PARAMS
  |--------------------------------------------------------------------------
  */

  const buildFilterParams = (overrides = {}) => {
    const effectiveSearch =
      overrides.search !== undefined ? overrides.search : search;

    const effectiveDateRange =
      overrides.dateRange !== undefined ? overrides.dateRange : dateRange;

    const params = {
      subject_type: subjectType,
    };

    if (String(effectiveSearch || "").trim()) {
      params.search = String(effectiveSearch).trim();
    }

    if (effectiveDateRange?.[0]) {
      params.date_from = effectiveDateRange[0].format("YYYY-MM-DD");
    }

    if (effectiveDateRange?.[1]) {
      params.date_to = effectiveDateRange[1].format("YYYY-MM-DD");
    }

    return params;
  };

  /*
  |--------------------------------------------------------------------------
  | HOME REST -> LEAVE LIST
  |--------------------------------------------------------------------------
  |
  | Home Rest remains owned by Outdoor / Medical Management.
  | Leave Management only reads those records so the user sees one combined
  | approved-leave view. Home Rest-only editing/cancellation uses its
  | original Outdoor source, never a forged normal Leave record.
  |--------------------------------------------------------------------------
  */

  const mapHomeRestToLeaveRow = (record) => ({
    ...record,

    id: `home-rest-${record.id}`,

    source_record_id: record.id,

    _source: "HOME_REST",

    _source_workflow_status: String(record.workflow_status || "").toUpperCase(),

    leave_type: "Home Rest",

    workflow_status:
      String(record.workflow_status || "").toUpperCase() === "CANCELLED"
        ? "CANCELLED"
        : "APPROVED",

    biometric_exempt:
      String(record.workflow_status || "").toUpperCase() !== "CANCELLED",

    start_datetime: record.home_rest_start_datetime,

    end_datetime: record.home_rest_end_datetime,

    reason:
      record.doctor_recommendation || record.outdoor_purpose || "Home Rest",

    approved_by_name: record.authorized_by_name || null,
  });

  const filterHomeRestRows = (rows, overrides = {}) => {
    const effectiveSearch =
      overrides.search !== undefined ? overrides.search : search;

    const effectiveDateRange =
      overrides.dateRange !== undefined ? overrides.dateRange : dateRange;

    const query = String(effectiveSearch || "")
      .trim()
      .toLowerCase();

    const from = effectiveDateRange?.[0]
      ? effectiveDateRange[0].startOf("day")
      : null;

    const to = effectiveDateRange?.[1]
      ? effectiveDateRange[1].endOf("day")
      : null;

    return (Array.isArray(rows) ? rows : []).filter((record) => {
      if (
        !record.home_rest ||
        !record.home_rest_start_datetime ||
        !record.home_rest_end_datetime
      ) {
        return false;
      }

      if (query) {
        const searchable = [
          record.employee_id,
          record.subject_name,
          record.first_name,
          record.last_name,
          record.course_name,
          record.platoon_number,
          record.category_name,
          record.branch_name,
          record.doctor_recommendation,
          record.outdoor_purpose,
          record.reference_no,
        ]
          .filter((value) => value !== undefined && value !== null)
          .join(" ")
          .toLowerCase();

        if (!searchable.includes(query)) {
          return false;
        }
      }

      if (from || to) {
        const start = dayjs(record.home_rest_start_datetime);
        const end = dayjs(record.home_rest_end_datetime);

        if (!start.isValid() || !end.isValid()) {
          return false;
        }

        if (from && end.valueOf() < from.valueOf()) {
          return false;
        }

        if (to && start.valueOf() > to.valueOf()) {
          return false;
        }
      }

      return true;
    });
  };

  /*
  |--------------------------------------------------------------------------
  | LOAD
  |--------------------------------------------------------------------------
  */

  const loadLeaves = async (overrides = {}) => {
    setLoading(true);

    try {
      const filterParams = buildFilterParams(overrides);

      const hasFilters = Object.keys(filterParams).some(
        (key) => key !== "subject_type",
      );

      const [filteredLeaveResponse, overallLeaveResponse, homeRestResponse] =
        await Promise.all([
          api.get("/leaves", {
            params: filterParams,
          }),

          hasFilters
            ? api.get("/leaves", {
                params: {
                  subject_type: subjectType,
                },
              })
            : Promise.resolve(null),

          api.get("/outdoor", {
            params: {
              subject_type: subjectType,
              home_rest_only: 1,
            },
          }),
        ]);

      const filteredLeaveRows = Array.isArray(filteredLeaveResponse.data?.data)
        ? filteredLeaveResponse.data.data
        : [];

      const overallLeaveRows = hasFilters
        ? Array.isArray(overallLeaveResponse?.data?.data)
          ? overallLeaveResponse.data.data
          : []
        : filteredLeaveRows;

      const allHomeRestRows = Array.isArray(homeRestResponse.data?.data)
        ? homeRestResponse.data.data
        : [];

      const filteredHomeRestRows = filterHomeRestRows(
        allHomeRestRows,
        overrides,
      ).map(mapHomeRestToLeaveRow);

      const overallHomeRestRows = allHomeRestRows
        .filter(
          (record) =>
            Boolean(record.home_rest) &&
            Boolean(record.home_rest_start_datetime) &&
            Boolean(record.home_rest_end_datetime),
        )
        .map(mapHomeRestToLeaveRow);

      setLeaves([...filteredLeaveRows, ...filteredHomeRestRows]);

      setOverallTotal(overallLeaveRows.length + overallHomeRestRows.length);
    } catch (error) {
      message.error(
        error.response?.data?.message || "Could not load Leave records.",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setSearch("");

    setDateRange(null);

    setLeaves([]);

    loadLeaves({
      search: "",

      dateRange: null,
    });

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectType, defaultCategory]);

  /*
  |--------------------------------------------------------------------------
  | SUBJECT SEARCH
  |--------------------------------------------------------------------------
  */

  const searchSubjects = async (value) => {
    const query = String(value || "").trim();

    if (!query) {
      setSubjectOptions([]);

      return;
    }

    try {
      const response = await api.get("/leaves/subjects/search", {
        params: {
          subject_type: subjectType,

          search: query,
        },
      });

      const rows = response.data?.data || [];

      setSubjectOptions(
        rows.map((item) => {
          const name = [item.first_name, item.last_name]
            .filter(Boolean)
            .join(" ");

          let extra;

          if (subjectType === "TRAINEE") {
            const period =
              item.course_start_date && item.course_end_date
                ? `${formatDate(item.course_start_date)} → ${formatDate(
                    item.course_end_date,
                  )}`
                : "";

            extra = [
              item.course_name,

              item.platoon_number ? `Platoon ${item.platoon_number}` : null,

              period,
            ]
              .filter(Boolean)
              .join(" / ");
          } else {
            extra = [item.category_name, item.branch_name]
              .filter(Boolean)
              .join(" / ");
          }

          return {
            value: item.subject_id,

            label: `${item.employee_id} — ${name || "-"}${extra ? ` | ${extra}` : ""}`,

            item,
          };
        }),
      );
    } catch (error) {
      message.error(
        error.response?.data?.message || "Could not search person.",
      );
    }
  };

  /*
  |--------------------------------------------------------------------------
  | OPEN
  |--------------------------------------------------------------------------
  */

  const openNormalLeave = () => {
    setEditingRecord(null);

    setSubjectOptions([]);

    form.resetFields();

    form.setFieldsValue({
      leave_type: "Casual Leave",
    });

    setDrawerOpen(true);
  };

  /*
  |--------------------------------------------------------------------------
  | EDIT
  |--------------------------------------------------------------------------
  */

  const openEdit = (record) => {
    setEditingRecord(record);

    const context =
      subjectType === "TRAINEE"
        ? [
            record.course_name,

            record.platoon_number ? `Platoon ${record.platoon_number}` : null,
          ]
            .filter(Boolean)
            .join(" / ")
        : [record.category_name, record.branch_name]
            .filter(Boolean)
            .join(" / ");

    setSubjectOptions([
      {
        value: record.subject_id,

        label: `${record.employee_id} — ${fullName(
          record,
        )}${context ? ` | ${context}` : ""}`,
      },
    ]);

    form.setFieldsValue({
      subject_id: record.subject_id,

      leave_type: record.leave_type,

      reason: record.reason,

      reference_no: record.reference_no,

      period: [dayjs(record.start_datetime), dayjs(record.end_datetime)],

      remarks: record.remarks,
    });

    setDrawerOpen(true);
  };

  const openHomeRestEdit = (record) => {
    setHomeRestEditing(record);
    homeRestForm.setFieldsValue({
      period: [dayjs(record.start_datetime), dayjs(record.end_datetime)],
    });
  };

  const saveHomeRestEdit = async () => {
    try {
      const values = await homeRestForm.validateFields();
      setHomeRestSaving(true);
      await api.put(
        `/outdoor/${subjectType}/${homeRestEditing.source_record_id}/home-rest`,
        {
          home_rest_start_datetime: values.period[0].format("YYYY-MM-DD HH:mm:ss"),
          home_rest_end_datetime: values.period[1].format("YYYY-MM-DD HH:mm:ss"),
        },
      );
      message.success("Home Rest period updated.");
      setHomeRestEditing(null);
      homeRestForm.resetFields();
      await loadLeaves();
    } catch (error) {
      if (error?.errorFields) return;
      message.error(error.response?.data?.message || "Could not update Home Rest.");
    } finally {
      setHomeRestSaving(false);
    }
  };

  /*
  |--------------------------------------------------------------------------
  | SAVE
  |--------------------------------------------------------------------------
  */

  const saveLeave = async () => {
    try {
      const values = await form.validateFields();

      setSaving(true);

      const payload = {
        subject_type: subjectType,

        subject_id: values.subject_id,

        leave_type: values.leave_type,

        reason: values.reason || null,

        reference_no: values.reference_no || null,

        start_datetime: values.period[0].format("YYYY-MM-DD HH:mm:ss"),

        end_datetime: values.period[1].format("YYYY-MM-DD HH:mm:ss"),

        remarks: values.remarks || null,
      };

      if (editingRecord) {
        await api.put(`/leaves/${subjectType}/${editingRecord.id}`, payload);

        message.success("Leave updated successfully.");
      } else {
        await api.post("/leaves/normal", payload);

        message.success("Leave added successfully.");
      }

      setDrawerOpen(false);

      form.resetFields();

      await loadLeaves();
    } catch (error) {
      if (error?.errorFields) {
        return;
      }

      message.error(
        error.response?.data?.message ||
          error.response?.data?.error?.message ||
          "Could not save Leave.",
      );
    } finally {
      setSaving(false);
    }
  };

  /*
  |--------------------------------------------------------------------------
  | TEMPLATE / EXPORT
  |--------------------------------------------------------------------------
  */

  const downloadTemplate = async () => {
    setTemplateLoading(true);

    try {
      const response = await api.get("/leaves/template", {
        responseType: "blob",

        timeout: 120000,
      });

      downloadBlob(response.data, "PTS_Leave_Import_Template.xlsx");

      message.success("Leave import template downloaded.");
    } catch (error) {
      message.error("Could not download Leave template.");
    } finally {
      setTemplateLoading(false);
    }
  };

  const exportExcel = async () => {
    setExporting(true);

    try {
      const response = await api.get("/leaves/export", {
        params: buildFilterParams(),

        responseType: "blob",

        timeout: 120000,
      });

      downloadBlob(
        response.data,

        `${subjectType}_Leave_${dayjs().format("YYYY-MM-DD")}.xlsx`,
      );

      message.success("Leave records exported successfully.");
    } catch (error) {
      message.error("Could not export Leave records.");
    } finally {
      setExporting(false);
    }
  };

  /*
  |--------------------------------------------------------------------------
  | IMPORT
  |--------------------------------------------------------------------------
  */

  const openImport = () => {
    setImportFile(null);

    setImportResult(null);

    setImportOpen(true);
  };

  const runImport = async () => {
    if (!importFile) {
      message.error("Please select an Excel file.");

      return;
    }

    setImporting(true);

    setImportResult(null);

    try {
      const formData = new FormData();

      formData.append("file", importFile);

      formData.append("subject_type", subjectType);

      const endpoint = "/leaves/import/normal";

      const response = await api.post(endpoint, formData, {
        timeout: 120000,
      });

      const result = response.data?.data || null;

      setImportResult(result);

      if (result?.failed) {
        message.warning(
          `${result.imported} imported, ${result.failed} failed.`,
        );
      } else {
        message.success(
          `${result?.imported || 0} Leave record(s) imported successfully.`,
        );
      }

      await loadLeaves();
    } catch (error) {
      message.error(
        error.response?.data?.message ||
          error.response?.data?.error?.message ||
          "Could not import Leave Excel file.",
      );
    } finally {
      setImporting(false);
    }
  };

  /*
  |--------------------------------------------------------------------------
  | CANCEL
  |--------------------------------------------------------------------------
  */

  const cancelRecord = (record) => {
    let reason = "";

    const isHomeRest = record._source === "HOME_REST";
    Modal.confirm({
      title: isHomeRest ? "Cancel Home Rest?" : "Cancel Leave?",

      content: (
        <div>
          <Text>
            {record.employee_id}
            {" - "}
            {fullName(record)}
          </Text>

          <Input.TextArea
            rows={4}
            style={{
              marginTop: 16,
            }}
            placeholder="Cancellation Reason"
            onChange={(event) => {
              reason = event.target.value;
            }}
          />
        </div>
      ),

      okText: isHomeRest ? "Cancel Home Rest" : "Cancel Leave",

      okType: "danger",

      async onOk() {
        if (!reason.trim()) {
          message.error("Cancellation Reason is required.");

          throw new Error("Reason required");
        }

        const url = isHomeRest
          ? `/outdoor/${subjectType}/${record.source_record_id}/home-rest/cancel`
          : `/leaves/${record.subject_type}/${record.id}/cancel`;
        await api.put(url, { cancellation_reason: reason.trim() });

        message.success(isHomeRest ? "Home Rest cancelled." : "Leave cancelled.");

        await loadLeaves();
      },
    });
  };

  const courseOptions = useMemo(() => {
    const map = new Map();

    leaves.forEach((record) => {
      if (!record.course_name) {
        return;
      }

      const value = String(record.course_id || record.course_name);

      map.set(value, {
        value,
        label: record.course_name,
      });
    });

    return Array.from(map.values());
  }, [leaves]);

  const staffCategoryOptions = useMemo(() => {
    const values = new Set(
      leaves.map((record) => record.category_name).filter(Boolean),
    );

    return Array.from(values).map((value) => ({
      value,
      label: value,
    }));
  }, [leaves]);

  const branchOptions = useMemo(() => {
    const values = new Set(
      leaves.map((record) => record.branch_name).filter(Boolean),
    );

    return Array.from(values).map((value) => ({
      value,
      label: value,
    }));
  }, [leaves]);

  const visibleLeaves = useMemo(
    () =>
      leaves.filter((record) => {
        if (subjectType === "TRAINEE" && courseFilter) {
          const recordValue = String(
            record.course_id || record.course_name || "",
          );

          if (recordValue !== String(courseFilter)) {
            return false;
          }
        }

        if (
          subjectType === "STAFF" &&
          staffCategoryFilter &&
          record.category_name !== staffCategoryFilter
        ) {
          return false;
        }

        if (
          subjectType === "STAFF" &&
          branchFilter &&
          record.branch_name !== branchFilter
        ) {
          return false;
        }

        return true;
      }),
    [leaves, subjectType, courseFilter, staffCategoryFilter, branchFilter],
  );

  const activeNowLeaveCount = useMemo(() => {
    const now = dayjs();

    return visibleLeaves.filter((record) => {
      const workflow = String(
        record.workflow_status || ""
      )
        .trim()
        .toUpperCase();

      if (
        ![
          "APPROVED",
          "COMPLETED",
        ].includes(workflow)
      ) {
        return false;
      }

      if (
        record.biometric_exempt != null &&
        !(
          record.biometric_exempt === true ||
          Number(record.biometric_exempt) === 1
        )
      ) {
        return false;
      }

      const start = dayjs(
        record.start_datetime
      );
      const end = dayjs(
        record.end_datetime
      );

      return Boolean(
        start.isValid() &&
        end.isValid() &&
        start.valueOf() <= now.valueOf() &&
        end.valueOf() >= now.valueOf()
      );
    }).length;
  }, [visibleLeaves]);

  const resetFilters = async () => {
    setSearch("");
    setDateRange(null);

    setCourseFilter(null);
    setStaffCategoryFilter(null);
    setBranchFilter(null);

    await loadLeaves({
      search: "",

      dateRange: null,
    });
  };
  /*
  |--------------------------------------------------------------------------
  | COLUMNS
  |--------------------------------------------------------------------------
  */

  const columns = useMemo(
    () => [
      {
        title: "Employee ID / Cap No.",

        dataIndex: "employee_id",

        width: 150,

        render: (value) => <Text strong>{value}</Text>,
      },

      {
        title: "Name",

        width: 190,

        render: (_, record) => (
          <Space direction="vertical" size={0}>
            <Text>{fullName(record)}</Text>
            {(String(record.subject_type || subjectType || "").toUpperCase() === "STAFF") && (
              <Text type="secondary" style={{ fontSize: 11 }}>
                {record.belt_no ? `Belt No. ${record.belt_no}` : "Belt No. not recorded"}
              </Text>
            )}
          </Space>
        ),
      },

      {
        title:
          subjectType === "TRAINEE" ? "Course / Platoon" : "Category / Branch",

        width: 260,

        render: (_, record) =>
          subjectType === "TRAINEE" ? (
            <div>
              <div>{record.course_name || "-"}</div>

              <Text type="secondary">
                {record.platoon_number
                  ? `Platoon ${record.platoon_number}`
                  : "No Platoon"}
              </Text>

              {record.course_start_date && record.course_end_date && (
                <div>
                  <Text
                    type="secondary"
                    style={{
                      fontSize: 11,
                    }}
                  >
                    {formatDate(record.course_start_date)}
                    {" → "}
                    {formatDate(record.course_end_date)}
                  </Text>
                </div>
              )}
            </div>
          ) : (
            <div>
              <div>{record.category_name || "-"}</div>

              <Text type="secondary">{record.branch_name || "No Branch"}</Text>
            </div>
          ),
      },

      {
        title: "Leave",

        width: 170,

        render: (_, record) => (
          <div>
            <Tag color={record._source === "HOME_REST" ? "green" : "blue"}>
              {record._source === "HOME_REST" ? "Home Rest" : "Leave"}
            </Tag>

            <div>{record.leave_type}</div>
          </div>
        ),
      },

      {
        title: "Period",

        width: 230,

        render: (_, record) => (
          <div>
            <div>{formatDateTime(record.start_datetime)}</div>

            <Text type="secondary">
              to {formatDateTime(record.end_datetime)}
            </Text>
          </div>
        ),
      },

      {
        title: "Status",

        dataIndex: "workflow_status",

        width: 110,

        render: (value) => <Tag color={getStatusColor(value)}>{value}</Tag>,
      },

      {
        title: "Biometric",

        dataIndex: "biometric_exempt",

        width: 110,

        render: (value) => (
          <Tag color={value ? "green" : "default"}>
            {value ? "Exempt" : "Not Exempt"}
          </Tag>
        ),
      },

      {
        title: "Actions",

        width: 300,

        fixed: "right",

        render: (_, record) => (
          <Space wrap>
            <Button
              size="small"
              icon={<EyeOutlined />}
              onClick={() => {
                setViewingRecord(record);

                setViewOpen(true);
              }}
            >
              View
            </Button>

            {canEdit &&
              (record._source === "HOME_REST"
                ? record._source_workflow_status === "ACTIVE"
                : !["REJECTED", "CANCELLED"].includes(record.workflow_status)) && (
                <Button
                  size="small"
                  icon={<EditOutlined />}
                  onClick={() => record._source === "HOME_REST"
                    ? openHomeRestEdit(record)
                    : openEdit(record)}
                >
                  Edit
                </Button>
              )}

            {canCancel &&
              (record._source === "HOME_REST"
                ? record._source_workflow_status === "ACTIVE"
                : !["REJECTED", "CANCELLED"].includes(record.workflow_status)) && (
                <Button
                  size="small"
                  danger
                  icon={<StopOutlined />}
                  onClick={() => cancelRecord(record)}
                >
                  Cancel
                </Button>
              )}
          </Space>
        ),
      },
    ],
    [subjectType, canEdit, canCancel],
  );

  /*
  |--------------------------------------------------------------------------
  | UI
  |--------------------------------------------------------------------------
  */

  return (
    <div>
      <div
        style={{
          display: "flex",

          justifyContent: "space-between",

          alignItems: "center",

          marginBottom: 16,

          gap: 16,

          flexWrap: "wrap",
        }}
      >
        <div>
          <Title
            level={3}
            style={{
              margin: 0,
            }}
          >
            {subjectType === "TRAINEE"
              ? "Trainee Leave Management"
              : "PTS Staff Leave Management"}
          </Title>

          <Text type="secondary">
            Leave records, biometric exemption aur Excel Import / Export.
          </Text>
        </div>

        <Space wrap>
          <Button icon={<ReloadOutlined />} onClick={loadLeaves}>
            Refresh
          </Button>

          <Button
            icon={<FileExcelOutlined />}
            loading={templateLoading}
            onClick={downloadTemplate}
          >
            Template
          </Button>

          {canNormalLeave && (
            <Button icon={<UploadOutlined />} onClick={openImport}>
              Import Excel
            </Button>
          )}

          <Button
            icon={<DownloadOutlined />}
            loading={exporting}
            onClick={exportExcel}
          >
            Export Excel
          </Button>

          {canNormalLeave && (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={openNormalLeave}
            >
              Add Leave
            </Button>
          )}
        </Space>
      </div>

      <Card
        style={{
          marginBottom: 16,
        }}
      >
        <Row gutter={[12, 12]}>
          <Col xs={24} md={10}>
            <RangePicker
              style={{
                width: "100%",
              }}
              value={dateRange}
              onChange={setDateRange}
              format="DD-MMM-YYYY"
            />
          </Col>

          <Col xs={24} md={10}>
            <Input
              allowClear
              prefix={<SearchOutlined />}
              placeholder={
                subjectType === "TRAINEE"
                  ? "Search by Cap No. or Name"
                  : "Search by Employee ID or Name"
              }
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onPressEnter={() => loadLeaves()}
              style={{ width: "100%" }}
            />
          </Col>

          <Col xs={24} md={4}>
            <Button type="primary" block onClick={() => loadLeaves()}>
              Filter
            </Button>
          </Col>
        </Row>
      </Card>

      <Card>
        <div
          style={{
            display: "flex",

            justifyContent: "flex-start",

            alignItems: "center",

            marginBottom: 10,
          }}
        >
          <Space size={18} wrap>
            <Text type="secondary">
              Filtered Records:{" "}
              <Text strong>
                {visibleLeaves.length}/{overallTotal}
              </Text>
            </Text>

            <Text type="secondary">
              Active Now:{" "}
              <Text strong>
                {activeNowLeaveCount}
              </Text>
            </Text>
          </Space>
        </div>

        <Table
          rowKey={(record) =>
            `${record._source || "LEAVE"}-${record.subject_type}-${record.id}`
          }
          loading={loading}
          columns={columns}
          dataSource={visibleLeaves}
          scroll={{
            x: 1700,
          }}
          pagination={{
            pageSize: 20,

            showSizeChanger: true,
          }}
        />
      </Card>

      {/* Home Rest is owned by Outdoor/Medical. Only its own period is editable here. */}
      <Modal
        title="Edit Home Rest Period"
        open={Boolean(homeRestEditing)}
        confirmLoading={homeRestSaving}
        okText="Update Home Rest"
        onOk={saveHomeRestEdit}
        onCancel={() => {
          setHomeRestEditing(null);
          homeRestForm.resetFields();
        }}
        destroyOnHidden
      >
        <Form layout="vertical" form={homeRestForm}>
          <Form.Item
            name="period"
            label="Home Rest Start / End Date & Time"
            rules={[{ required: true, message: "Select a valid Home Rest period." }]}
          >
            <RangePicker
              showTime={{ format: "hh:mm A" }}
              format="DD-MMM-YYYY hh:mm A"
              use12Hours
              style={{ width: "100%" }}
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* CREATE / EDIT */}

      <Drawer
        title={editingRecord ? "Edit Leave" : "Add Leave"}
        width={650}
        open={drawerOpen}
        destroyOnHidden
        onClose={() => {
          setDrawerOpen(false);

          setEditingRecord(null);

          form.resetFields();
        }}
        extra={
          <Space>
            <Button onClick={() => setDrawerOpen(false)}>Cancel</Button>

            <Button type="primary" loading={saving} onClick={saveLeave}>
              {editingRecord ? "Update Leave" : "Save Leave"}
            </Button>
          </Space>
        }
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="subject_id"
            label={subjectType === "TRAINEE" ? "Trainee" : "PTS Staff"}
            rules={[
              {
                required: true,

                message: "Please select a person.",
              },
            ]}
          >
            <Select
              showSearch
              filterOption={false}
              onSearch={searchSubjects}
              options={subjectOptions}
              placeholder="Type Employee ID or Name"
              disabled={Boolean(editingRecord)}
              notFoundContent="Type Employee ID or Name to search"
            />
          </Form.Item>

          <Form.Item
            name="leave_type"
            label="Leave Type"
            rules={[
              {
                required: true,

                message: "Leave Type is required.",
              },
            ]}
          >
            <Select
              showSearch
              options={[
                {
                  value: "Casual Leave",

                  label: "Casual Leave",
                },

                {
                  value: "Sick Leave",

                  label: "Earned Leave",
                },

                {
                  value: "Special Leave",

                  label: "Long Leave",
                },

                {
                  value: "Other",

                  label: "Other",
                },
              ]}
            />
          </Form.Item>

          <Form.Item
            name="period"
            label="Leave Start / End Date & Time"
            rules={[
              {
                required: true,

                message: "Leave period is required.",
              },
            ]}
          >
            <RangePicker
              showTime={{
                format: "hh:mm A",
              }}
              format="DD-MMM-YYYY hh:mm A"
              style={{
                width: "100%",
              }}
              use12Hours
            />
          </Form.Item>

          <Form.Item name="reason" label="Reason">
            <Input.TextArea rows={3} />
          </Form.Item>

          <Form.Item name="reference_no" label="Order / Reference No.">
            <Input />
          </Form.Item>

          <Form.Item name="remarks" label="Remarks">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Drawer>

      {/* IMPORT */}

      <Modal
        title={
          <Space>
            <FileExcelOutlined />
            Import Leave from Excel
          </Space>
        }
        open={importOpen}
        width={820}
        okText="Import Leave"
        confirmLoading={importing}
        onOk={runImport}
        onCancel={() => {
          if (!importing) {
            setImportOpen(false);
          }
        }}
      >
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="Normal Leave Import"
          description="Imported Leave automatically Approved hogi."
        />

        <Row gutter={[12, 12]}>
          <Col xs={24} md={24}>
            <Text strong>Excel File</Text>

            <div
              style={{
                marginTop: 6,
              }}
            >
              <Upload
                accept=".xlsx"
                maxCount={1}
                beforeUpload={(file) => {
                  setImportFile(file);

                  setImportResult(null);

                  return false;
                }}
                onRemove={() => {
                  setImportFile(null);

                  setImportResult(null);
                }}
                fileList={importFile ? [importFile] : []}
              >
                <Button icon={<UploadOutlined />}>Select Excel File</Button>
              </Upload>
            </div>
          </Col>
        </Row>

        <Alert
          style={{
            marginTop: 16,
          }}
          type="info"
          showIcon
          message="Identity Resolution"
          description={
            subjectType === "TRAINEE"
              ? "Required: Employee ID, Leave Type, Start/End Date. Course/Platoon optional hain, lekin overlapping Course records ki surat mein disambiguation ke liye use honge."
              : "Required: Employee ID, Leave Type, Start/End Date. Staff Category/Branch optional hain lekin duplicate Staff identity ki surat mein required honge."
          }
        />

        {importResult && (
          <div
            style={{
              marginTop: 18,
            }}
          >
            <Row gutter={[8, 8]}>
              {[
                ["Processed", importResult.processed],

                ["Imported", importResult.imported],

                ["Failed", importResult.failed],

                ["Ambiguous", importResult.ambiguous],

                ["Course Date Not Set", importResult.course_date_not_set],

                ["No Active Course", importResult.no_active_course],
              ].map(([label, value]) => (
                <Col xs={12} md={8} key={label}>
                  <Card size="small">
                    <Text type="secondary">{label}</Text>

                    <div
                      style={{
                        fontSize: 22,

                        fontWeight: 700,
                      }}
                    >
                      {Number(value || 0)}
                    </div>
                  </Card>
                </Col>
              ))}
            </Row>

            {importResult.errors?.length > 0 && (
              <Card
                size="small"
                title="Import Errors"
                style={{
                  marginTop: 12,
                }}
              >
                <Table
                  size="small"
                  rowKey={(record, index) => `${record.row}-${index}`}
                  pagination={{
                    pageSize: 10,
                  }}
                  columns={[
                    {
                      title: "Row",

                      dataIndex: "row",

                      width: 70,
                    },

                    {
                      title: "Employee ID",

                      dataIndex: "employee_id",

                      width: 130,
                    },

                    {
                      title: "Context",

                      width: 190,

                      render: (_, record) =>
                        [
                          record.course,
                          record.platoon,
                          record.category,
                          record.branch,
                        ]
                          .filter(Boolean)
                          .join(" / ") || "-",
                    },

                    {
                      title: "Error",

                      dataIndex: "error",
                    },
                  ]}
                  dataSource={importResult.errors}
                />
              </Card>
            )}
          </div>
        )}
      </Modal>

      {/* VIEW */}

      <Drawer
        title="Leave Details"
        width={650}
        open={viewOpen}
        onClose={() => setViewOpen(false)}
      >
        {viewingRecord && (
          <Descriptions bordered column={1} size="small">
            <Descriptions.Item label="Employee ID">
              {viewingRecord.employee_id}
            </Descriptions.Item>

            <Descriptions.Item label="Name">
              {fullName(viewingRecord)}
            </Descriptions.Item>

            {subjectType === "TRAINEE" && (
              <>
                <Descriptions.Item label="Course">
                  {viewingRecord.course_name || "-"}
                </Descriptions.Item>

                <Descriptions.Item label="Platoon">
                  {viewingRecord.platoon_number || "-"}
                </Descriptions.Item>

                <Descriptions.Item label="Course Period">
                  {viewingRecord.course_start_date &&
                  viewingRecord.course_end_date
                    ? `${formatDate(
                        viewingRecord.course_start_date,
                      )} → ${formatDate(viewingRecord.course_end_date)}`
                    : "Dates Not Set"}
                </Descriptions.Item>
              </>
            )}

            {subjectType === "STAFF" && (
              <>
                <Descriptions.Item label="Category">
                  {viewingRecord.category_name || "-"}
                </Descriptions.Item>

                <Descriptions.Item label="Branch">
                  {viewingRecord.branch_name || "-"}
                </Descriptions.Item>
              </>
            )}

            {viewingRecord._source === "HOME_REST" && (
              <Descriptions.Item label="Source">
                <Tag color="green">Outdoor / Medical — Home Rest</Tag>
              </Descriptions.Item>
            )}

            <Descriptions.Item label="Leave Type">
              {viewingRecord.leave_type}
            </Descriptions.Item>

            <Descriptions.Item label="Status">
              <Tag color={getStatusColor(viewingRecord.workflow_status)}>
                {viewingRecord.workflow_status}
              </Tag>
            </Descriptions.Item>

            <Descriptions.Item label="Start">
              {formatDateTime(viewingRecord.start_datetime)}
            </Descriptions.Item>

            <Descriptions.Item label="End">
              {formatDateTime(viewingRecord.end_datetime)}
            </Descriptions.Item>

            <Descriptions.Item label="Biometric">
              {viewingRecord.biometric_exempt ? "Exempt" : "Not Exempt"}
            </Descriptions.Item>

            <Descriptions.Item label="Reason">
              {viewingRecord.reason || "-"}
            </Descriptions.Item>

            <Descriptions.Item label="Reference">
              {viewingRecord.reference_no || "-"}
            </Descriptions.Item>

            <Descriptions.Item label="Submitted By">
              {viewingRecord.submitted_by_name || "-"}
            </Descriptions.Item>

            <Descriptions.Item label="Approved By">
              {viewingRecord.approved_by_name || "-"}
            </Descriptions.Item>

            <Descriptions.Item label="Rejected By">
              {viewingRecord.rejected_by_name || "-"}
            </Descriptions.Item>

            <Descriptions.Item label="Rejection Reason">
              {viewingRecord.rejection_reason || "-"}
            </Descriptions.Item>

            <Descriptions.Item label="Cancelled By">
              {viewingRecord.cancelled_by_name || "-"}
            </Descriptions.Item>

            <Descriptions.Item label="Cancellation Reason">
              {viewingRecord.cancellation_reason || "-"}
            </Descriptions.Item>

            <Descriptions.Item label="Remarks">
              {viewingRecord.remarks || "-"}
            </Descriptions.Item>
          </Descriptions>
        )}
      </Drawer>
    </div>
  );
}
