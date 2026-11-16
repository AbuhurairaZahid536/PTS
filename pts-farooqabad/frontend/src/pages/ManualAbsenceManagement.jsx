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
  message,
} from "antd";

import {
  EditOutlined,
  EyeOutlined,
  PlusOutlined,
  ReloadOutlined,
  StopOutlined,
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

function categoryColor(value) {
  switch (value) {
    case "PROGRAM":
      return "orange";

    case "SECURITY_DUTY":
      return "blue";

    default:
      return "default";
  }
}

function categoryLabel(value) {
  switch (value) {
    case "PROGRAM":
      return "Program";

    case "SECURITY_DUTY":
      return "Security Duty";

    default:
      return value || "-";
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

export default function ManualAbsenceManagement({ subjectType = "TRAINEE" }) {
  const [form] = Form.useForm();

  const { hasPermission } = useAuth();

  const [loading, setLoading] = useState(false);

  const [saving, setSaving] = useState(false);

  const [records, setRecords] = useState([]);

  const [overallTotal, setOverallTotal] = useState(0);

  const [subjectOptions, setSubjectOptions] = useState([]);

  const [selectedSubject, setSelectedSubject] = useState(null);

  const [search, setSearch] = useState("");

  const [categoryFilter, setCategoryFilter] = useState(null);

  const [statusFilter, setStatusFilter] = useState(null);

  const [dateRange, setDateRange] = useState(null);

  const [drawerOpen, setDrawerOpen] = useState(false);

  const [editingRecord, setEditingRecord] = useState(null);

  const [viewingRecord, setViewingRecord] = useState(null);

  const [viewOpen, setViewOpen] = useState(false);

  const canCreate = hasPermission("manual_absence.create");

  const canEdit = hasPermission("manual_absence.edit");

  const canCancel = hasPermission("manual_absence.cancel");

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

      if (categoryFilter) {
        params.category = categoryFilter;
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

      const hasFilters = Object.keys(params).some(
        (key) => key !== "subject_type",
      );

      if (!hasFilters) {
        const response = await api.get("/manual-absence", {
          params,
        });

        const rows = Array.isArray(response.data?.data)
          ? response.data.data
          : [];

        setRecords(rows);

        setOverallTotal(rows.length);

        return;
      }

      const [filteredResponse, overallResponse] = await Promise.all([
        api.get("/manual-absence", {
          params,
        }),
        api.get("/manual-absence", {
          params: {
            subject_type: subjectType,
          },
        }),
      ]);

      const filteredRows = Array.isArray(filteredResponse.data?.data)
        ? filteredResponse.data.data
        : [];

      const overallRows = Array.isArray(overallResponse.data?.data)
        ? overallResponse.data.data
        : [];

      setRecords(filteredRows);

      setOverallTotal(overallRows.length);
    } catch (error) {
      message.error(
        error.response?.data?.message ||
          "Could not load Manual Absence records.",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setSearch("");

    setCategoryFilter(null);

    setStatusFilter(null);

    setDateRange(null);

    setRecords([]);

    loadRecords();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectType]);

  /*
  |--------------------------------------------------------------------------
  | PERSON SEARCH
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

          let extra = "";

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

  const handleSubjectChange = (value, option) => {
    form.setFieldValue("subject_id", value);

    setSelectedSubject(option?.item || null);
  };

  /*
  |--------------------------------------------------------------------------
  | CREATE
  |--------------------------------------------------------------------------
  */

  const openCreate = () => {
    setEditingRecord(null);

    setSelectedSubject(null);

    setSubjectOptions([]);

    form.resetFields();

    form.setFieldsValue({
      absence_category: "PROGRAM",
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

      absence_category: record.absence_category,

      program_class: record.program_class,

      period: [dayjs(record.start_datetime), dayjs(record.end_datetime)],

      reason: record.reason,

      reference_no: record.reference_no,

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

        absence_category: values.absence_category,

        program_class: values.program_class?.trim() || null,

        start_datetime: values.period[0].format("YYYY-MM-DD HH:mm:ss"),

        end_datetime: values.period[1].format("YYYY-MM-DD HH:mm:ss"),

        reason: values.reason?.trim() || null,

        reference_no: values.reference_no?.trim() || null,

        remarks: values.remarks?.trim() || null,
      };

      if (editingRecord) {
        await api.put(
          `/manual-absence/${subjectType}/${editingRecord.id}`,
          payload,
        );

        message.success("Manual Absence updated.");
      } else {
        await api.post("/manual-absence", payload);

        message.success("Manual Absence marked successfully.");
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

      message.error(
        error.response?.data?.message || "Could not save Manual Absence.",
      );
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
      title: "Cancel Manual Absence?",

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
          `/manual-absence/${record.subject_type}/${record.id}/cancel`,
          {
            cancellation_reason: reason.trim(),
          },
        );

        message.success("Manual Absence cancelled.");

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

        width: 150,

        render: (value) => <Text strong>{value}</Text>,
      },

      {
        title: "Name",

        width: 180,

        render: (_, record) => fullName(record),
      },

      {
        title:
          subjectType === "TRAINEE" ? "Course / Platoon" : "Category / Branch",

        width: 280,

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
        title: "Category",

        dataIndex: "absence_category",

        width: 110,

        render: (value) => (
          <Tag color={categoryColor(value)}>{categoryLabel(value)}</Tag>
        ),
      },

      {
        title: "Program / Security Duty",

        dataIndex: "program_class",

        width: 190,

        render: (value) => value || "-",
      },

      {
        title: "Period",

        width: 235,

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
        title: "Reason",

        dataIndex: "reason",

        width: 220,

        ellipsis: true,
      },

      {
        title: "Marked By",

        dataIndex: "marked_by_name",

        width: 160,

        render: (value) => value || "-",
      },

      {
        title: "Status",

        dataIndex: "record_status",

        width: 110,

        render: (value) => (
          <Tag color={value === "ACTIVE" ? "green" : "default"}>{value}</Tag>
        ),
      },

      {
        title: "Actions",

        fixed: "right",

        width: 230,

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

            {canEdit && record.record_status === "ACTIVE" && (
              <Button
                size="small"
                icon={<EditOutlined />}
                onClick={() => openEdit(record)}
              >
                Edit
              </Button>
            )}

            {canCancel && record.record_status === "ACTIVE" && (
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
              ? "Trainee Manual Absence"
              : "PTS Staff Manual Absence"}
          </Title>

          <Text type="secondary">
            Program aur Security Duty manual absence records.
          </Text>
        </div>

        <Space wrap>
          <Button icon={<ReloadOutlined />} onClick={loadRecords}>
            Refresh
          </Button>

          {canCreate && (
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
              Mark Absence
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
          <Col xs={24} md={7}>
            <Input
              allowClear
              placeholder="Employee ID / Name / Program / Security Duty"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onPressEnter={loadRecords}
            />
          </Col>

          <Col xs={24} md={4}>
            <Select
              allowClear
              style={{
                width: "100%",
              }}
              placeholder="Category"
              value={categoryFilter}
              onChange={setCategoryFilter}
              options={[
                {
                  value: "PROGRAM",

                  label: "Program",
                },

                {
                  value: "SECURITY_DUTY",

                  label: "Security Duty",
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
                  value: "ACTIVE",

                  label: "Active",
                },

                {
                  value: "CANCELLED",

                  label: "Cancelled",
                },
              ]}
            />
          </Col>

          <Col xs={24} md={6}>
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
          <Text type="secondary">
            Total:{" "}
            <Text strong>
              {records.length}/{overallTotal}
            </Text>
          </Text>
        </div>

        <Table
          rowKey={(record) => `${record.subject_type}-${record.id}`}
          loading={loading}
          dataSource={records}
          columns={columns}
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
        title={editingRecord ? "Edit Manual Absence" : "Mark Manual Absence"}
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
              <Descriptions bordered column={1} size="small">
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
                  description="Is trainee ki Manual Absence save nahi hogi jab tak Course Start aur End Date set nahi hoti."
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
              <Descriptions bordered column={1} size="small">
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
            name="absence_category"
            label="Absence Category"
            rules={[
              {
                required: true,

                message: "Absence Category is required.",
              },
            ]}
          >
            <Select
              options={[
                {
                  value: "PROGRAM",

                  label: "Program",
                },

                {
                  value: "SECURITY_DUTY",

                  label: "Security Duty",
                },
              ]}
            />
          </Form.Item>

          <Form.Item name="program_class" label="Program / Security Duty Name">
            <Input />
          </Form.Item>

          <Form.Item
            name="period"
            label="Absence Start / End Date & Time"
            rules={[
              {
                required: true,

                message: "Absence period is required.",
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

          <Form.Item name="reason" label="Reason">
            <Input.TextArea rows={3} />
          </Form.Item>

          <Form.Item name="reference_no" label="Reference No.">
            <Input />
          </Form.Item>

          <Form.Item name="remarks" label="Remarks">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Drawer>

      {/* VIEW */}

      <Drawer
        title="Manual Absence Details"
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
                <Descriptions.Item label="Category / Branch">
                  {[viewingRecord.category_name, viewingRecord.branch_name]
                    .filter(Boolean)
                    .join(" / ") || "-"}
                </Descriptions.Item>
              </>
            )}

            <Descriptions.Item label="Category">
              <Tag color={categoryColor(viewingRecord.absence_category)}>
                {categoryLabel(viewingRecord.absence_category)}
              </Tag>
            </Descriptions.Item>

            <Descriptions.Item label="Program / Security Duty">
              {viewingRecord.program_class || "-"}
            </Descriptions.Item>

            <Descriptions.Item label="Start">
              {formatDateTime(viewingRecord.start_datetime)}
            </Descriptions.Item>

            <Descriptions.Item label="End">
              {formatDateTime(viewingRecord.end_datetime)}
            </Descriptions.Item>

            <Descriptions.Item label="Reason">
              {viewingRecord.reason || "-"}
            </Descriptions.Item>

            <Descriptions.Item label="Reference">
              {viewingRecord.reference_no || "-"}
            </Descriptions.Item>

            <Descriptions.Item label="Marked By">
              {viewingRecord.marked_by_name || "-"}
            </Descriptions.Item>

            <Descriptions.Item label="Status">
              <Tag
                color={
                  viewingRecord.record_status === "ACTIVE" ? "green" : "default"
                }
              >
                {viewingRecord.record_status}
              </Tag>
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
