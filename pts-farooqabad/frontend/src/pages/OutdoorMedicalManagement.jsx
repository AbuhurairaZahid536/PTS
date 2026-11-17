import { useEffect, useMemo, useState } from "react";

import {
  Alert,
  Button,
  Card,
  Col,
  DatePicker,
  Descriptions,
  Divider,
  Drawer,
  Form,
  Input,
  Modal,
  Row,
  Select,
  Space,
  Switch,
  Tag,
  Typography,
  message,
} from "antd";
import Table from "../components/SerialTable";

import {
  CheckCircleOutlined,
  EditOutlined,
  EyeOutlined,
  MedicineBoxOutlined,
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

function formatDate(value) {
  if (!value) return "-";

  return dayjs(value).format("DD-MMM-YYYY");
}

function formatDateTime(value) {
  if (!value) return "-";

  return dayjs(value).format("DD-MMM-YYYY hh:mm A");
}

function fullName(record) {
  return (
    record?.subject_name ||
    [record?.first_name, record?.last_name].filter(Boolean).join(" ") ||
    "-"
  );
}

function statusColor(status) {
  switch (String(status || "").toUpperCase()) {
    case "ACTIVE":
      return "green";

    case "COMPLETED":
      return "blue";

    case "CANCELLED":
      return "default";

    default:
      return "default";
  }
}

function recordOutdoorDate(record) {
  return record?.outdoor_date || record?.start_datetime || null;
}

function traineeCourseContext(record) {
  const parts = [];

  if (record?.course_name) {
    parts.push(
      record.course_code
        ? `${record.course_name} [${record.course_code}]`
        : record.course_name,
    );
  }

  if (record?.platoon_number) {
    parts.push(`Platoon ${record.platoon_number}`);
  }

  if (record?.course_start_date && record?.course_end_date) {
    parts.push(
      `${formatDate(record.course_start_date)} to ${formatDate(
        record.course_end_date,
      )}`,
    );
  } else {
    parts.push("Course dates not set");
  }

  if (record?.course_status) {
    parts.push(record.course_status);
  }

  return parts.filter(Boolean).join(" / ");
}

/*
|--------------------------------------------------------------------------
| COMPONENT
|--------------------------------------------------------------------------
*/

export default function OutdoorMedicalManagement({ subjectType = "TRAINEE" }) {
  const [form] = Form.useForm();

  const { hasPermission } = useAuth();

  const [loading, setLoading] = useState(false);

  const [saving, setSaving] = useState(false);

  const [records, setRecords] = useState([]);

  const [overallTotal, setOverallTotal] = useState(0);

  const [subjectOptions, setSubjectOptions] = useState([]);

  const [search, setSearch] = useState("");

  const [statusFilter, setStatusFilter] = useState(null);

  const [restFilter, setRestFilter] = useState(null);

  const [dateRange, setDateRange] = useState(null);

  const [drawerOpen, setDrawerOpen] = useState(false);

  const [editingRecord, setEditingRecord] = useState(null);

  const [viewOpen, setViewOpen] = useState(false);

  const [viewingRecord, setViewingRecord] = useState(null);

  const [medicalRestEnabled, setMedicalRestEnabled] = useState(false);

  const [homeRestEnabled, setHomeRestEnabled] = useState(false);

  /*
  |--------------------------------------------------------------------------
  | PERMISSIONS
  |--------------------------------------------------------------------------
  */

  const canCreate = hasPermission("outdoor.create");

  const canEdit = hasPermission("outdoor.edit");

  const canCancel = hasPermission("outdoor.cancel");

  /*
  |--------------------------------------------------------------------------
  | LOAD RECORDS
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

      if (statusFilter) {
        params.status = statusFilter;
      }

      if (dateRange?.[0]) {
        params.date_from = dateRange[0].format("YYYY-MM-DD");
      }

      if (dateRange?.[1]) {
        params.date_to = dateRange[1].format("YYYY-MM-DD");
      }

      if (restFilter === "HOME_REST") {
        params.home_rest_only = 1;
      }

      if (restFilter === "MEDICAL_REST") {
        params.medical_rest_only = 1;
      }

      const hasFilters = Object.keys(params).some(
        (key) => key !== "subject_type",
      );

      if (!hasFilters) {
        const response = await api.get("/outdoor", {
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
        api.get("/outdoor", {
          params,
        }),
        api.get("/outdoor", {
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
          "Could not load Outdoor / Medical records.",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setSearch("");
    setStatusFilter(null);
    setRestFilter(null);
    setDateRange(null);
    setRecords([]);

    loadRecords();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectType]);

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

          const context =
            subjectType === "TRAINEE"
              ? traineeCourseContext(item)
              : [item.category_name, item.branch_name]
                  .filter(Boolean)
                  .join(" / ");

          return {
            value: item.subject_id,

            label: `${item.employee_id} - ${name}${
              context ? ` (${context})` : ""
            }`,
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
  | CLOSE FORM
  |--------------------------------------------------------------------------
  */

  const closeFormDrawer = () => {
    setDrawerOpen(false);

    setEditingRecord(null);

    setSubjectOptions([]);

    setMedicalRestEnabled(false);

    setHomeRestEnabled(false);

    form.resetFields();
  };

  /*
  |--------------------------------------------------------------------------
  | CREATE
  |--------------------------------------------------------------------------
  */

  const openCreate = () => {
    setEditingRecord(null);

    setSubjectOptions([]);

    setMedicalRestEnabled(false);

    setHomeRestEnabled(false);

    form.resetFields();

    form.setFieldsValue({
      medical_rest: false,

      home_rest: false,
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

    const medicalRest = Boolean(record.medical_rest);

    const homeRest = Boolean(record.home_rest);

    setMedicalRestEnabled(medicalRest);

    setHomeRestEnabled(homeRest);

    setSubjectOptions([
      {
        value: record.subject_id,

        label: `${record.employee_id} - ${fullName(record)}${
          subjectType === "TRAINEE" && traineeCourseContext(record)
            ? ` (${traineeCourseContext(record)})`
            : ""
        }`,
      },
    ]);

    form.setFieldsValue({
      subject_id: record.subject_id,

      outdoor_purpose: record.outdoor_purpose,

      location: record.location,

      /*
        |--------------------------------------------------------------------------
        | OUTDOOR = SINGLE DATE
        |--------------------------------------------------------------------------
        */

      outdoor_date: recordOutdoorDate(record)
        ? dayjs(recordOutdoorDate(record))
        : null,

      reference_no: record.reference_no,

      doctor_name: record.doctor_name,

      doctor_checked_datetime: record.doctor_checked_datetime
        ? dayjs(record.doctor_checked_datetime)
        : null,

      doctor_recommendation: record.doctor_recommendation,

      /*
        |--------------------------------------------------------------------------
        | MEDICAL REST
        |--------------------------------------------------------------------------
        */

      medical_rest: medicalRest,

      medical_rest_period:
        medicalRest &&
        record.medical_rest_start_datetime &&
        record.medical_rest_end_datetime
          ? [
              dayjs(record.medical_rest_start_datetime),

              dayjs(record.medical_rest_end_datetime),
            ]
          : null,

      /*
        |--------------------------------------------------------------------------
        | HOME REST
        |--------------------------------------------------------------------------
        */

      home_rest: homeRest,

      home_rest_period:
        homeRest &&
        record.home_rest_start_datetime &&
        record.home_rest_end_datetime
          ? [
              dayjs(record.home_rest_start_datetime),

              dayjs(record.home_rest_end_datetime),
            ]
          : null,

      remarks: record.remarks,
    });

    setDrawerOpen(true);
  };

  /*
  |--------------------------------------------------------------------------
  | SAVE
  |--------------------------------------------------------------------------
  |
  | IMPORTANT:
  |
  | Outdoor sirf ONE DATE ka hai.
  |
  | Existing database structure ko safe rakhne ke liye selected Outdoor Date
  | internally same date:
  |
  | 00:00:00 -> 23:59:59
  |
  | ke form mein backend ko bheji jati hai.
  |
  | User interface mein Outdoor From / To nahi hai.
  |
  | Medical Rest aur Home Rest ke exact From / To Date & Time alag rahenge.
  |--------------------------------------------------------------------------
  */

  const saveRecord = async () => {
    try {
      const values = await form.validateFields();

      setSaving(true);

      const outdoorDate = values.outdoor_date.format("YYYY-MM-DD");

      const payload = {
        subject_type: subjectType,

        subject_id: values.subject_id,

        outdoor_purpose: values.outdoor_purpose?.trim(),

        location: values.location?.trim() || null,

        /*
          |--------------------------------------------------------------------------
          | INTERNAL ONE-DAY OUTDOOR BOUNDS
          |--------------------------------------------------------------------------
          */

        start_datetime: `${outdoorDate} 00:00:00`,

        end_datetime: `${outdoorDate} 23:59:59`,

        reference_no: values.reference_no?.trim() || null,

        doctor_name: values.doctor_name?.trim() || null,

        doctor_checked_datetime: values.doctor_checked_datetime
          ? values.doctor_checked_datetime.format("YYYY-MM-DD HH:mm:ss")
          : null,

        doctor_recommendation: values.doctor_recommendation?.trim() || null,

        /*
          |--------------------------------------------------------------------------
          | MEDICAL REST = FROM / TO DATE & TIME
          |--------------------------------------------------------------------------
          */

        medical_rest: Boolean(values.medical_rest),

        medical_rest_start_datetime:
          values.medical_rest && values.medical_rest_period
            ? values.medical_rest_period[0].format("YYYY-MM-DD HH:mm:ss")
            : null,

        medical_rest_end_datetime:
          values.medical_rest && values.medical_rest_period
            ? values.medical_rest_period[1].format("YYYY-MM-DD HH:mm:ss")
            : null,

        /*
          |--------------------------------------------------------------------------
          | HOME REST = FROM / TO DATE & TIME
          |--------------------------------------------------------------------------
          */

        home_rest: Boolean(values.home_rest),

        home_rest_start_datetime:
          values.home_rest && values.home_rest_period
            ? values.home_rest_period[0].format("YYYY-MM-DD HH:mm:ss")
            : null,

        home_rest_end_datetime:
          values.home_rest && values.home_rest_period
            ? values.home_rest_period[1].format("YYYY-MM-DD HH:mm:ss")
            : null,

        remarks: values.remarks?.trim() || null,
      };

      if (editingRecord) {
        await api.put(`/outdoor/${subjectType}/${editingRecord.id}`, payload);

        message.success("Outdoor / Medical record updated successfully.");
      } else {
        await api.post("/outdoor", payload);

        message.success("Outdoor / Medical record created successfully.");
      }

      closeFormDrawer();

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
      title: "Cancel Outdoor / Medical Record?",

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

      okText: "Cancel Record",

      okType: "danger",

      async onOk() {
        if (!reason.trim()) {
          message.error("Cancellation Reason is required.");

          throw new Error("CANCELLATION_REASON_REQUIRED");
        }

        try {
          await api.put(`/outdoor/${record.subject_type}/${record.id}/cancel`, {
            cancellation_reason: reason.trim(),
          });

          message.success("Record cancelled successfully.");

          await loadRecords();
        } catch (error) {
          if (error.message === "CANCELLATION_REASON_REQUIRED") {
            throw error;
          }

          message.error(
            error.response?.data?.message || "Could not cancel record.",
          );

          throw error;
        }
      },
    });
  };

  /*
  |--------------------------------------------------------------------------
  | COMPLETE
  |--------------------------------------------------------------------------
  */

  const completeRecord = (record) => {
    Modal.confirm({
      title: "Mark record as Completed?",

      content: `${record.employee_id} - ${fullName(record)}`,

      okText: "Complete",

      async onOk() {
        try {
          await api.put(
            `/outdoor/${record.subject_type}/${record.id}/complete`,
          );

          message.success("Record marked Completed.");

          await loadRecords();
        } catch (error) {
          message.error(
            error.response?.data?.message || "Could not complete record.",
          );

          throw error;
        }
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
        title: "Employee ID",

        dataIndex: "employee_id",

        width: 130,

        render: (value) => <Text strong>{value || "-"}</Text>,
      },

      {
        title: "Name",

        width: 180,

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

        width: 220,

        render: (_, record) =>
          subjectType === "TRAINEE" ? (
            <div>
              <div>{record.course_name || "-"}</div>

              <Text type="secondary">
                {record.platoon_number
                  ? `Platoon ${record.platoon_number}`
                  : "No Platoon"}
              </Text>
            </div>
          ) : (
            <div>
              <div>{record.category_name || "-"}</div>

              <Text type="secondary">{record.branch_name || "No Branch"}</Text>
            </div>
          ),
      },

      {
        title: "Outdoor Purpose",

        dataIndex: "outdoor_purpose",

        width: 220,

        ellipsis: true,
      },

      /*
        |--------------------------------------------------------------------------
        | SINGLE OUTDOOR DATE
        |--------------------------------------------------------------------------
        */

      {
        title: "Outdoor Date",

        width: 150,

        render: (_, record) => formatDate(recordOutdoorDate(record)),
      },

      {
        title: "Medical / Home Rest",

        width: 190,

        render: (_, record) => (
          <Space direction="vertical" size={2}>
            {record.medical_rest ? (
              <Tag color="orange">Medical Rest</Tag>
            ) : (
              <Tag>No Medical Rest</Tag>
            )}

            {record.home_rest ? (
              <Tag color="green">Home Rest</Tag>
            ) : (
              <Tag>No Home Rest</Tag>
            )}
          </Space>
        ),
      },

      {
        title: "Attendance",

        width: 150,

        render: (_, record) => {
          if (record.workflow_status === "CANCELLED") {
            return <Tag>No Exemption</Tag>;
          }

          if (record.home_rest) {
            return <Tag color="green">Home Rest Exempt</Tag>;
          }

          return <Tag>Not Exempt</Tag>;
        },
      },

      {
        title: "Status",

        dataIndex: "workflow_status",

        width: 110,

        render: (value) => <Tag color={statusColor(value)}>{value}</Tag>,
      },

      {
        title: "Actions",

        key: "actions",

        width: 260,

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

            {canEdit && record.workflow_status === "ACTIVE" && (
              <Button
                size="small"
                icon={<EditOutlined />}
                onClick={() => openEdit(record)}
              >
                Edit
              </Button>
            )}

            {canEdit && record.workflow_status === "ACTIVE" && (
              <Button
                size="small"
                icon={<CheckCircleOutlined />}
                onClick={() => completeRecord(record)}
              >
                Complete
              </Button>
            )}

            {canCancel && record.workflow_status === "ACTIVE" && (
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
              ? "Trainee Outdoor / Medical"
              : "PTS Staff Outdoor / Medical"}
          </Title>

          <Text type="secondary">
            Outdoor movement, doctor recommendation, Medical Rest aur Home Rest
            manage karein.
          </Text>
        </div>

        <Space wrap>
          <Button icon={<ReloadOutlined />} onClick={loadRecords}>
            Refresh
          </Button>

          {canCreate && (
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
              Add Outdoor
            </Button>
          )}
        </Space>
      </div>

      {/* FILTERS */}

      <Card
        style={{
          marginBottom: 16,
        }}
      >
        <Row gutter={[12, 12]}>
          <Col xs={24} md={7}>
            <Input
              allowClear
              placeholder="Employee ID / Name / Purpose"
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
              placeholder="Status"
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                {
                  value: "ACTIVE",

                  label: "Active",
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

          <Col xs={24} md={4}>
            <Select
              allowClear
              style={{
                width: "100%",
              }}
              placeholder="Rest Filter"
              value={restFilter}
              onChange={setRestFilter}
              options={[
                {
                  value: "MEDICAL_REST",

                  label: "Medical Rest",
                },

                {
                  value: "HOME_REST",

                  label: "Home Rest",
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

      {/* TABLE */}

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
            x: 1600,
          }}
          pagination={{
            pageSize: 20,

            showSizeChanger: true,
          }}
        />
      </Card>

      {/* CREATE / EDIT DRAWER */}

      <Drawer
        title={
          editingRecord
            ? "Edit Outdoor / Medical Record"
            : "Add Outdoor / Medical Record"
        }
        width={720}
        open={drawerOpen}
        destroyOnHidden
        onClose={closeFormDrawer}
        extra={
          <Space>
            <Button onClick={closeFormDrawer}>Cancel</Button>

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
              options={subjectOptions}
              placeholder="Type Employee ID or Name"
              disabled={Boolean(editingRecord)}
              notFoundContent="Type Employee ID or Name to search"
            />
          </Form.Item>

          <Divider orientation="left">Outdoor Details</Divider>

          <Form.Item
            name="outdoor_purpose"
            label="Outdoor Purpose"
            rules={[
              {
                required: true,

                message: "Outdoor Purpose is required.",
              },
            ]}
          >
            <Input.TextArea rows={3} />
          </Form.Item>

          <Form.Item name="location" label="Location / Destination">
            <Input />
          </Form.Item>

          {/* OUTDOOR = ONE DATE ONLY */}

          <Form.Item
            name="outdoor_date"
            label="Outdoor Date"
            rules={[
              {
                required: true,

                message: "Outdoor Date is required.",
              },
            ]}
          >
            <DatePicker
              format="DD-MMM-YYYY"
              style={{
                width: "100%",
              }}
            />
          </Form.Item>

          <Form.Item name="reference_no" label="Order / Reference No.">
            <Input />
          </Form.Item>

          {/* DOCTOR */}

          <Divider orientation="left">
            <MedicineBoxOutlined /> Doctor Check
          </Divider>

          <Form.Item name="doctor_name" label="Doctor Name">
            <Input />
          </Form.Item>

          <Form.Item
            name="doctor_checked_datetime"
            label="Doctor Check Date & Time"
          >
            <DatePicker
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

          <Form.Item name="doctor_recommendation" label="Doctor Recommendation">
            <Input.TextArea rows={3} />
          </Form.Item>

          {/* MEDICAL REST */}

          <Divider orientation="left">Medical Rest</Divider>

          <Form.Item
            name="medical_rest"
            label="Medical Rest Recommended?"
            valuePropName="checked"
          >
            <Switch
              onChange={(checked) => {
                setMedicalRestEnabled(checked);

                if (!checked) {
                  form.setFieldValue("medical_rest_period", null);
                }
              }}
            />
          </Form.Item>

          {medicalRestEnabled && (
            <>
              <Alert
                type="warning"
                showIcon
                style={{
                  marginBottom: 16,
                }}
                message="Medical Rest biometric exemption nahi deta."
              />

              <Form.Item
                name="medical_rest_period"
                label="Medical Rest From / To Date & Time"
                rules={[
                  {
                    required: true,

                    message: "Medical Rest period is required.",
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
            </>
          )}

          {/* HOME REST */}

          <Divider orientation="left">Home Rest</Divider>

          <Form.Item
            name="home_rest"
            label="Home Rest Approved?"
            valuePropName="checked"
          >
            <Switch
              onChange={(checked) => {
                setHomeRestEnabled(checked);

                if (!checked) {
                  form.setFieldValue("home_rest_period", null);
                }
              }}
            />
          </Form.Item>

          {homeRestEnabled && (
            <>
              <Alert
                type="success"
                showIcon
                style={{
                  marginBottom: 16,
                }}
                message="Home Rest biometric exemption dega."
                description="Sirf is exact From / To Date & Time period mein attendance exemption apply hogi."
              />

              <Form.Item
                name="home_rest_period"
                label="Home Rest From / To Date & Time"
                rules={[
                  {
                    required: true,

                    message: "Home Rest period is required.",
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
            </>
          )}

          {/* REMARKS */}

          <Divider orientation="left">Remarks</Divider>

          <Form.Item name="remarks" label="Remarks">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Drawer>

      {/* VIEW DRAWER */}

      <Drawer
        title="Outdoor / Medical Details"
        width={720}
        open={viewOpen}
        onClose={() => setViewOpen(false)}
      >
        {viewingRecord && (
          <>
            <Descriptions bordered column={1} size="small">
              <Descriptions.Item label="Employee ID">
                {viewingRecord.employee_id || "-"}
              </Descriptions.Item>

              <Descriptions.Item label="Name">
                {fullName(viewingRecord)}
              </Descriptions.Item>

              <Descriptions.Item label="Status">
                <Tag color={statusColor(viewingRecord.workflow_status)}>
                  {viewingRecord.workflow_status}
                </Tag>
              </Descriptions.Item>

              <Descriptions.Item label="Outdoor Purpose">
                {viewingRecord.outdoor_purpose || "-"}
              </Descriptions.Item>

              <Descriptions.Item label="Location">
                {viewingRecord.location || "-"}
              </Descriptions.Item>

              {/* SINGLE OUTDOOR DATE */}

              <Descriptions.Item label="Outdoor Date">
                {formatDate(recordOutdoorDate(viewingRecord))}
              </Descriptions.Item>

              <Descriptions.Item label="Reference">
                {viewingRecord.reference_no || "-"}
              </Descriptions.Item>
            </Descriptions>

            {/* MEDICAL */}

            <Divider>Doctor / Medical Rest</Divider>

            <Descriptions bordered column={1} size="small">
              <Descriptions.Item label="Doctor">
                {viewingRecord.doctor_name || "-"}
              </Descriptions.Item>

              <Descriptions.Item label="Doctor Check">
                {formatDateTime(viewingRecord.doctor_checked_datetime)}
              </Descriptions.Item>

              <Descriptions.Item label="Doctor Recommendation">
                {viewingRecord.doctor_recommendation || "-"}
              </Descriptions.Item>

              <Descriptions.Item label="Medical Rest">
                {viewingRecord.medical_rest ? "Yes" : "No"}
              </Descriptions.Item>

              <Descriptions.Item label="Medical Rest From">
                {viewingRecord.medical_rest
                  ? formatDateTime(viewingRecord.medical_rest_start_datetime)
                  : "-"}
              </Descriptions.Item>

              <Descriptions.Item label="Medical Rest To">
                {viewingRecord.medical_rest
                  ? formatDateTime(viewingRecord.medical_rest_end_datetime)
                  : "-"}
              </Descriptions.Item>
            </Descriptions>

            {/* HOME REST */}

            <Divider>Home Rest / Attendance</Divider>

            <Descriptions bordered column={1} size="small">
              <Descriptions.Item label="Home Rest">
                {viewingRecord.home_rest ? "Yes" : "No"}
              </Descriptions.Item>

              <Descriptions.Item label="Home Rest From">
                {viewingRecord.home_rest
                  ? formatDateTime(viewingRecord.home_rest_start_datetime)
                  : "-"}
              </Descriptions.Item>

              <Descriptions.Item label="Home Rest To">
                {viewingRecord.home_rest
                  ? formatDateTime(viewingRecord.home_rest_end_datetime)
                  : "-"}
              </Descriptions.Item>

              <Descriptions.Item label="Attendance Exemption">
                {viewingRecord.workflow_status !== "CANCELLED" &&
                viewingRecord.home_rest ? (
                  <Tag color="green">Home Rest Exempt</Tag>
                ) : (
                  <Tag>Not Exempt</Tag>
                )}
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
          </>
        )}
      </Drawer>
    </div>
  );
}
