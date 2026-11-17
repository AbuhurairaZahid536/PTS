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
  PlusOutlined,
  ReloadOutlined,
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

function fullName(record) {
  return (
    record.subject_name ||
    [record.first_name, record.last_name].filter(Boolean).join(" ") ||
    "-"
  );
}

function recordLabel(type) {
  return type === "OSD" ? "OSD" : "Short Period Permission";
}

function statusColor(status) {
  switch (status) {
    case "APPROVED":
      return "green";

    case "CANCELLED":
      return "default";

    case "COMPLETED":
      return "blue";

    default:
      return "default";
  }
}

function courseStatusColor(status) {
  switch (status) {
    case "ACTIVE":
      return "green";

    case "UPCOMING":
      return "blue";

    case "COMPLETED":
      return "default";

    case "DATE_NOT_SET":
      return "orange";

    default:
      return "default";
  }
}

/*
|--------------------------------------------------------------------------
| COMPONENT
|--------------------------------------------------------------------------
*/

export default function OsdPermissionManagement({
  subjectType = "TRAINEE",
  defaultRecordType = null,
}) {
  const [form] = Form.useForm();

  const { hasPermission } = useAuth();

  const [loading, setLoading] = useState(false);

  const [saving, setSaving] = useState(false);

  const [records, setRecords] = useState([]);

  const [overallTotal, setOverallTotal] = useState(0);

  const [subjectOptions, setSubjectOptions] = useState([]);

  const [selectedSubject, setSelectedSubject] = useState(null);

  const [search, setSearch] = useState("");

  const [recordTypeFilter, setRecordTypeFilter] = useState(defaultRecordType);

  const [statusFilter, setStatusFilter] = useState(null);

  const [dateRange, setDateRange] = useState(null);

  const [drawerOpen, setDrawerOpen] = useState(false);

  const [drawerMode, setDrawerMode] = useState("OSD");

  const [editingRecord, setEditingRecord] = useState(null);

  const [viewingRecord, setViewingRecord] = useState(null);

  const [viewOpen, setViewOpen] = useState(false);

  const [importOpen, setImportOpen] = useState(false);

  const [importing, setImporting] = useState(false);

  const [templateDownloading, setTemplateDownloading] = useState(false);

  const [importFileList, setImportFileList] = useState([]);

  const [importResult, setImportResult] = useState(null);

  const canCreateOsd = hasPermission("osd.create");

  const canEditOsd = hasPermission("osd.edit");

  const canCancel = hasPermission("osd.cancel");

  const canCreateShort = hasPermission("short_permission.create");

  const canEditShort = hasPermission("short_permission.edit");

  /*
  |--------------------------------------------------------------------------
  | LOAD
  |--------------------------------------------------------------------------
  */

  const loadRecords = async () => {
    setLoading(true);

    try {
      const params = {
        subject_type: subjectType,
      };

      if (search.trim()) {
        params.search = search.trim();
      }

      if (recordTypeFilter) {
        params.record_type = recordTypeFilter;
      }

      if (statusFilter) {
        params.status = statusFilter;
      }

      if (dateRange?.[0]) {
        params.date_from = dateRange[0].format("YYYY-MM-DD");
      }

      if (dateRange?.[1]) {
        params.date_to = dateRange[1].format("YYYY-MM-DD");
      }

      const response = await api.get("/osd-permissions", {
        params,
      });

      setRecords(response.data?.data || []);
    } catch (error) {
      message.error(
        error.response?.data?.message ||
          "Could not load OSD / Permission records.",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setSearch("");

    setRecordTypeFilter(defaultRecordType || null);

    setStatusFilter(null);

    setDateRange(null);

    setRecords([]);

    loadRecords();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectType, defaultRecordType]);

  /*
  |--------------------------------------------------------------------------
  | OSD EXCEL TEMPLATE / IMPORT
  |--------------------------------------------------------------------------
  */

  const downloadOsdTemplate = async () => {
    try {
      setTemplateDownloading(true);

      const response = await api.get("/osd-permissions/template", {
        responseType: "blob",
      });

      const blob = new Blob([response.data], {
        type:
          response.headers?.["content-type"] ||
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });

      const disposition = String(
        response.headers?.["content-disposition"] || "",
      );

      const match = disposition.match(/filename\*?=(?:UTF-8''|["']?)([^"';\n]+)/i);

      const filename = match?.[1]
        ? decodeURIComponent(match[1].replace(/["']/g, "").trim())
        : `PTS_${subjectType}_OSD_Import_Template.xlsx`;

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = url;
      link.download = filename;

      document.body.appendChild(link);
      link.click();
      link.remove();

      window.URL.revokeObjectURL(url);
    } catch (error) {
      message.error(
        error.response?.data?.message ||
          "Could not download OSD import template.",
      );
    } finally {
      setTemplateDownloading(false);
    }
  };

  const openImportOsd = () => {
    setImportFileList([]);
    setImportResult(null);
    setImportOpen(true);
  };

  const importOsdExcel = async () => {
    const file = importFileList?.[0]?.originFileObj || importFileList?.[0];

    if (!file) {
      message.warning("Please select an .xlsx OSD import file.");
      return;
    }

    try {
      setImporting(true);
      setImportResult(null);

      const formData = new FormData();
      formData.append("file", file);
      formData.append("subject_type", subjectType);

      const response = await api.post("/osd-permissions/import", formData);

      const result = response.data?.data || {};

      setImportResult(result);

      const imported = Number(result.imported || 0);
      const failed = Number(result.failed || 0);

      if (failed > 0) {
        message.warning(`${imported} OSD record(s) imported; ${failed} failed.`);
      } else {
        message.success(`${imported} OSD record(s) imported successfully.`);
      }

      await loadRecords();
    } catch (error) {
      message.error(
        error.response?.data?.message ||
          "Could not import OSD Excel file.",
      );
    } finally {
      setImporting(false);
    }
  };

  /*
  |--------------------------------------------------------------------------
  | SEARCH PERSON
  |--------------------------------------------------------------------------
  */

  const searchSubjects = async (value) => {
    const query = String(value || "").trim();

    if (!query) {
      setSubjectOptions([]);

      return;
    }

    try {
      /*
        |--------------------------------------------------------------------------
        | Shared subject-search endpoint.
        |--------------------------------------------------------------------------
        */

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

          let extra = "";

          if (subjectType === "TRAINEE") {
            const coursePeriod =
              item.course_start_date && item.course_end_date
                ? `${formatDate(item.course_start_date)} → ${formatDate(
                    item.course_end_date,
                  )}`
                : "";

            extra = [
              item.course_name,

              item.platoon_number ? `Platoon ${item.platoon_number}` : null,

              coursePeriod,
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
  | SUBJECT SELECT
  |--------------------------------------------------------------------------
  */

  const handleSubjectChange = (value, option) => {
    form.setFieldValue("subject_id", value);

    setSelectedSubject(option?.item || null);
  };

  /*
  |--------------------------------------------------------------------------
  | OPEN CREATE
  |--------------------------------------------------------------------------
  */

  const openCreate = (type) => {
    setDrawerMode(type);

    setEditingRecord(null);

    setSelectedSubject(null);

    setSubjectOptions([]);

    form.resetFields();

    setDrawerOpen(true);
  };

  /*
  |--------------------------------------------------------------------------
  | EDIT
  |--------------------------------------------------------------------------
  */

  const openEdit = (record) => {
    setDrawerMode(record.record_type);

    setEditingRecord(record);

    setSelectedSubject(record);

    let context = "";

    if (subjectType === "TRAINEE") {
      context = [
        record.course_name,

        record.platoon_number ? `Platoon ${record.platoon_number}` : null,

        record.course_start_date && record.course_end_date
          ? `${formatDate(record.course_start_date)} → ${formatDate(
              record.course_end_date,
            )}`
          : "Course Dates Not Set",
      ]
        .filter(Boolean)
        .join(" / ");
    } else {
      context = [record.category_name, record.branch_name]
        .filter(Boolean)
        .join(" / ");
    }

    setSubjectOptions([
      {
        value: record.subject_id,

        label: `${record.employee_id} — ${fullName(
          record,
        )}${context ? ` | ${context}` : ""}`,

        item: record,
      },
    ]);

    form.setFieldsValue({
      subject_id: record.subject_id,

      reason: record.reason,

      duty_place: record.duty_place,

      reference_no: record.reference_no,

      period: [dayjs(record.start_datetime), dayjs(record.end_datetime)],

      remarks: record.remarks,
    });

    setDrawerOpen(true);
  };

  /*
  |--------------------------------------------------------------------------
  | SAVE
  |--------------------------------------------------------------------------
  */

  const saveRecord = async () => {
    try {
      const values = await form.validateFields();

      setSaving(true);

      const payload = {
        subject_type: subjectType,

        subject_id: values.subject_id,

        reason: values.reason?.trim(),

        duty_place: values.duty_place?.trim() || null,

        reference_no: values.reference_no?.trim() || null,

        start_datetime: values.period[0].format("YYYY-MM-DD HH:mm:ss"),

        end_datetime: values.period[1].format("YYYY-MM-DD HH:mm:ss"),

        remarks: values.remarks?.trim() || null,
      };

      if (editingRecord) {
        const base = drawerMode === "OSD" ? "osd" : "short-permission";

        await api.put(
          `/osd-permissions/${base}/${subjectType}/${editingRecord.id}`,
          payload,
        );

        message.success(`${recordLabel(drawerMode)} updated successfully.`);
      } else {
        const endpoint =
          drawerMode === "OSD"
            ? "/osd-permissions/osd"
            : "/osd-permissions/short-permission";

        await api.post(endpoint, payload);

        message.success(`${recordLabel(drawerMode)} created successfully.`);
      }

      setDrawerOpen(false);

      setEditingRecord(null);

      setSelectedSubject(null);

      form.resetFields();

      await loadRecords();
    } catch (error) {
      if (error?.errorFields) {
        return;
      }

      message.error(error.response?.data?.message || "Could not save record.");
    } finally {
      setSaving(false);
    }
  };

  /*
  |--------------------------------------------------------------------------
  | CANCEL
  |--------------------------------------------------------------------------
  */

  const cancelRecord = (record) => {
    let reason = "";

    Modal.confirm({
      title: `Cancel ${recordLabel(record.record_type)}?`,

      content: (
        <div>
          <Text>
            {record.employee_id}
            {" — "}
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

      okText: "Cancel Record",

      okType: "danger",

      async onOk() {
        if (!reason.trim()) {
          message.error("Cancellation Reason is required.");

          throw new Error("Reason required");
        }

        await api.put(
          `/osd-permissions/${record.subject_type}/${record.id}/cancel`,
          {
            cancellation_reason: reason.trim(),
          },
        );

        message.success("Record cancelled successfully.");

        await loadRecords();
      },
    });
  };

  /*
  |--------------------------------------------------------------------------
  | TABLE
  |--------------------------------------------------------------------------
  */

  const columns = useMemo(
    () => [
      {
        title: "Employee ID / Cap No.",

        dataIndex: "employee_id",

        width: 155,

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

        width: 270,

        render: (_, record) =>
          subjectType === "TRAINEE" ? (
            <div>
              <div>{record.course_name || "-"}</div>

              <Text type="secondary">
                {record.platoon_number
                  ? `Platoon ${record.platoon_number}`
                  : "No Platoon"}
              </Text>

              <div>
                {record.course_start_date && record.course_end_date ? (
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
                ) : (
                  <Tag
                    color="orange"
                    style={{
                      marginTop: 4,
                    }}
                  >
                    Course Dates Not Set
                  </Tag>
                )}
              </div>
            </div>
          ) : (
            <div>
              <div>{record.category_name || "-"}</div>

              <Text type="secondary">{record.branch_name || "No Branch"}</Text>
            </div>
          ),
      },

      {
        title: "Record Type",

        dataIndex: "record_type",

        width: 185,

        render: (value) => (
          <Tag color={value === "OSD" ? "blue" : "purple"}>
            {recordLabel(value)}
          </Tag>
        ),
      },

      { title: "Starting Date / Time", dataIndex: "start_datetime", width: 210, render: formatDateTime },
      { title: "Ending Date / Time", dataIndex: "end_datetime", width: 210, render: formatDateTime },
      {
        title: "Reason",

        dataIndex: "reason",

        width: 220,

        ellipsis: true,
      },

      {
        title: "Duty Place",

        dataIndex: "duty_place",

        width: 160,

        render: (value) => value || "-",
      },

      {
        title: "Status",

        dataIndex: "workflow_status",

        width: 110,

        render: (value) => <Tag color={statusColor(value)}>{value}</Tag>,
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

        width: 250,

        fixed: "right",

        render: (_, record) => {
          const canEdit =
            record.record_type === "OSD" ? canEditOsd : canEditShort;

          return (
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

              {canEdit && record.workflow_status === "APPROVED" && (
                <Button
                  size="small"
                  icon={<EditOutlined />}
                  onClick={() => openEdit(record)}
                >
                  Edit
                </Button>
              )}

              {canCancel && record.workflow_status === "APPROVED" && (
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
          );
        },
      },
    ],
    [subjectType, canEditOsd, canEditShort, canCancel],
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

          marginBottom: 14,

          gap: 14,

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
              ? "Trainee OSD / Permission"
              : "PTS Staff OSD / Permission"}
          </Title>

          <Text type="secondary">
            Manage OSD and Short Period Permissions with exact date and time
            periods.
          </Text>
        </div>

        <Space wrap>
          <Button icon={<ReloadOutlined />} onClick={loadRecords}>
            Refresh
          </Button>

          <Button
            icon={<DownloadOutlined />}
            loading={templateDownloading}
            onClick={downloadOsdTemplate}
          >
            Download OSD Template
          </Button>

          {canCreateOsd && (
            <Button icon={<UploadOutlined />} onClick={openImportOsd}>
              Import OSD Excel
            </Button>
          )}

          {canCreateShort && (
            <Button
              icon={<PlusOutlined />}
              onClick={() => openCreate("SHORT_PERMISSION")}
            >
              Short Permission
            </Button>
          )}

          {canCreateOsd && (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => openCreate("OSD")}
            >
              Add OSD
            </Button>
          )}
        </Space>
      </div>

      <Card
        style={{
          marginBottom: 14,
        }}
      >
        <Row gutter={[12, 12]}>
          <Col xs={24} md={7}>
            <Input
              allowClear
              placeholder="Employee ID / Name"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onPressEnter={loadRecords}
            />
          </Col>

          <Col xs={24} md={5}>
            <Select
              allowClear
              style={{
                width: "100%",
              }}
              placeholder="Record Type"
              value={recordTypeFilter}
              onChange={setRecordTypeFilter}
              options={[
                {
                  value: "OSD",

                  label: "OSD",
                },

                {
                  value: "SHORT_PERMISSION",

                  label: "Short Permission",
                },
              ]}
            />
          </Col>

          <Col xs={24} md={4}>
            <Select
              allowClear
              style={{
                width: "100%",
              }}
              placeholder="Status"
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                {
                  value: "APPROVED",

                  label: "Approved",
                },

                {
                  value: "COMPLETED",

                  label: "Completed",
                },

                {
                  value: "CANCELLED",

                  label: "Cancelled",
                },
              ]}
            />
          </Col>

          <Col xs={24} md={5}>
            <RangePicker
              style={{
                width: "100%",
              }}
              value={dateRange}
              onChange={setDateRange}
              format="DD-MMM-YYYY"
            />
          </Col>

          <Col xs={24} md={3}>
            <Button type="primary" block onClick={loadRecords}>
              Filter
            </Button>
          </Col>
        </Row>
      </Card>

      <Card>
        <div
          style={{
            marginBottom: 12,
          }}
        >
          <Text>
            Total:{" "}
            <strong>
              {records.length}/{overallTotal}
            </strong>
          </Text>
        </div>

        <Table
          rowKey={(record) => `${record.subject_type}-${record.id}`}
          loading={loading}
          columns={columns}
          dataSource={records}
          scroll={{
            x: 1800,
          }}
          pagination={{
            pageSize: 20,

            showSizeChanger: true,
          }}
        />
      </Card>

      {/* CREATE / EDIT */}

      <Drawer
        title={
          editingRecord
            ? `Edit ${recordLabel(drawerMode)}`
            : `Add ${recordLabel(drawerMode)}`
        }
        width={680}
        open={drawerOpen}
        destroyOnHidden
        onClose={() => {
          setDrawerOpen(false);

          setEditingRecord(null);

          setSelectedSubject(null);

          form.resetFields();
        }}
        extra={
          <Space>
            <Button onClick={() => setDrawerOpen(false)}>Cancel</Button>

            <Button type="primary" loading={saving} onClick={saveRecord}>
              {editingRecord ? "Update" : "Save"}
            </Button>
          </Space>
        }
      >
        {drawerMode === "SHORT_PERMISSION" && (
          <Alert
            type="warning"
            showIcon
            style={{
              marginBottom: 16,
            }}
            message="Short Period Permission"
            description="Exact Start/End time enter karein. Attendance Engine sirf jis biometric session ke sath period overlap karega us session par exemption consider karega."
          />
        )}

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
              onChange={handleSubjectChange}
              options={subjectOptions}
              placeholder="Type Employee ID or Name"
              disabled={Boolean(editingRecord)}
              notFoundContent="Type Employee ID or Name to search"
            />
          </Form.Item>

          {selectedSubject && subjectType === "TRAINEE" && (
            <Card
              size="small"
              style={{
                marginBottom: 18,
              }}
            >
              <Descriptions bordered size="small" column={1}>
                <Descriptions.Item label="Course">
                  {selectedSubject.course_name || "-"}
                </Descriptions.Item>

                <Descriptions.Item label="Platoon">
                  {selectedSubject.platoon_number
                    ? `Platoon ${selectedSubject.platoon_number}`
                    : "-"}
                </Descriptions.Item>

                <Descriptions.Item label="Course Start">
                  {formatDate(selectedSubject.course_start_date)}
                </Descriptions.Item>

                <Descriptions.Item label="Course End">
                  {formatDate(selectedSubject.course_end_date)}
                </Descriptions.Item>

                {selectedSubject.course_status && (
                  <Descriptions.Item label="Current Course Status">
                    <Tag
                      color={courseStatusColor(selectedSubject.course_status)}
                    >
                      {selectedSubject.course_status}
                    </Tag>
                  </Descriptions.Item>
                )}
              </Descriptions>

              {(!selectedSubject.course_start_date ||
                !selectedSubject.course_end_date) && (
                <Alert
                  type="warning"
                  showIcon
                  style={{
                    marginTop: 12,
                  }}
                  message="Course Dates Not Set"
                  description="Is trainee ke liye OSD / Permission save nahi hogi jab tak Courses page se Course Start aur End Date set nahi hoti."
                />
              )}
            </Card>
          )}

          {selectedSubject && subjectType === "STAFF" && (
            <Card
              size="small"
              style={{
                marginBottom: 18,
              }}
            >
              <Descriptions bordered size="small" column={1}>
                <Descriptions.Item label="Category">
                  {selectedSubject.category_name || "-"}
                </Descriptions.Item>

                <Descriptions.Item label="Branch">
                  {selectedSubject.branch_name || "-"}
                </Descriptions.Item>
              </Descriptions>
            </Card>
          )}

          <Form.Item
            name="period"
            label="Start / End Date & Time"
            rules={[
              {
                required: true,

                message: "Period is required.",
              },
            ]}
          >
            <RangePicker
              showTime={{
                format: "hh:mm A",
              }}
              use12Hours
              format="DD-MMM-YYYY hh:mm A"
              style={{
                width: "100%",
              }}
            />
          </Form.Item>

          <Form.Item
            name="reason"
            label="Reason"
            rules={[
              {
                required: true,

                message: "Reason is required.",
              },
            ]}
          >
            <Input.TextArea rows={3} />
          </Form.Item>

          <Form.Item
            name="duty_place"
            label={
              drawerMode === "OSD"
                ? "Duty Place"
                : "Permission Place / Destination"
            }
          >
            <Input />
          </Form.Item>

          <Form.Item name="reference_no" label="Order / Reference No.">
            <Input />
          </Form.Item>

          <Form.Item name="remarks" label="Remarks">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Drawer>

      {/* OSD EXCEL IMPORT */}

      <Modal
        title={`${subjectType === "TRAINEE" ? "Trainee" : "Staff"} OSD Excel Import`}
        width={760}
        open={importOpen}
        destroyOnHidden
        onCancel={() => {
          if (!importing) {
            setImportOpen(false);
            setImportFileList([]);
            setImportResult(null);
          }
        }}
        footer={[
          <Button
            key="template"
            icon={<DownloadOutlined />}
            loading={templateDownloading}
            onClick={downloadOsdTemplate}
          >
            Download Template
          </Button>,
          <Button
            key="cancel"
            disabled={importing}
            onClick={() => {
              setImportOpen(false);
              setImportFileList([]);
              setImportResult(null);
            }}
          >
            Close
          </Button>,
          <Button
            key="import"
            type="primary"
            icon={<UploadOutlined />}
            loading={importing}
            disabled={!importFileList.length}
            onClick={importOsdExcel}
          >
            Import OSD
          </Button>,
        ]}
      >
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message={`Import ${subjectType === "TRAINEE" ? "Trainee" : "Staff"} OSD`}
          description="Use the downloaded .xlsx template. Employee ID/Cap No., Start Date & Time, End Date & Time and Reason are required. Imported records are created as Approved OSD for the exact period."
        />

        <Upload.Dragger
          accept=".xlsx"
          maxCount={1}
          beforeUpload={() => false}
          fileList={importFileList}
          onChange={({ fileList }) => {
            setImportFileList(fileList.slice(-1));
            setImportResult(null);
          }}
          onRemove={() => {
            setImportFileList([]);
            setImportResult(null);
          }}
          disabled={importing}
        >
          <p className="ant-upload-drag-icon">
            <UploadOutlined />
          </p>
          <p className="ant-upload-text">Select or drag OSD .xlsx file here</p>
          <p className="ant-upload-hint">Maximum file size: 10 MB</p>
        </Upload.Dragger>

        {importResult && (
          <div style={{ marginTop: 18 }}>
            <Descriptions bordered size="small" column={2}>
              <Descriptions.Item label="Processed">
                {Number(importResult.processed || 0)}
              </Descriptions.Item>
              <Descriptions.Item label="Imported">
                <Text type="success">{Number(importResult.imported || 0)}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="Failed">
                <Text type={Number(importResult.failed || 0) ? "danger" : undefined}>
                  {Number(importResult.failed || 0)}
                </Text>
              </Descriptions.Item>
              <Descriptions.Item label="Overlap">
                {Number(importResult.overlap || 0)}
              </Descriptions.Item>
              <Descriptions.Item label="Not Found">
                {Number(importResult.not_found || 0)}
              </Descriptions.Item>
              <Descriptions.Item label="Ambiguous">
                {Number(importResult.ambiguous || 0)}
              </Descriptions.Item>
            </Descriptions>

            {Array.isArray(importResult.errors) && importResult.errors.length > 0 && (
              <Table
                size="small"
                style={{ marginTop: 14 }}
                rowKey={(row, index) => `${row.row || "row"}-${index}`}
                pagination={{ pageSize: 8, hideOnSinglePage: true }}
                dataSource={importResult.errors}
                columns={[
                  { title: "Row", dataIndex: "row", width: 70 },
                  {
                    title: "Employee ID / Cap No.",
                    dataIndex: "employee_id",
                    width: 170,
                    render: (value) => value || "-",
                  },
                  { title: "Reason", dataIndex: "message" },
                ]}
              />
            )}
          </div>
        )}
      </Modal>

      {/* VIEW */}

      <Drawer
        title={`${recordLabel(viewingRecord?.record_type)} Details`}
        width={680}
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
                  {viewingRecord.platoon_number
                    ? `Platoon ${viewingRecord.platoon_number}`
                    : "-"}
                </Descriptions.Item>

                <Descriptions.Item label="Course Period">
                  {viewingRecord.course_start_date &&
                  viewingRecord.course_end_date
                    ? `${formatDate(
                        viewingRecord.course_start_date,
                      )} → ${formatDate(viewingRecord.course_end_date)}`
                    : "Dates Not Set"}
                </Descriptions.Item>

                <Descriptions.Item label="Current Course Status">
                  <Tag color={courseStatusColor(viewingRecord.course_status)}>
                    {viewingRecord.course_status || "-"}
                  </Tag>
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

            <Descriptions.Item label="Record Type">
              {recordLabel(viewingRecord.record_type)}
            </Descriptions.Item>

            <Descriptions.Item label="Status">
              <Tag color={statusColor(viewingRecord.workflow_status)}>
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

            <Descriptions.Item label="Duty / Permission Place">
              {viewingRecord.duty_place || "-"}
            </Descriptions.Item>

            <Descriptions.Item label="Reference">
              {viewingRecord.reference_no || "-"}
            </Descriptions.Item>

            <Descriptions.Item label="Authorized By">
              {viewingRecord.authorized_by_name || "-"}
            </Descriptions.Item>

            <Descriptions.Item label="Authorization Time">
              {formatDateTime(viewingRecord.authorization_datetime)}
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
