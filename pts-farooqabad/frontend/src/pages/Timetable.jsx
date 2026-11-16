import { useEffect, useMemo, useState } from "react";

import {
  Alert,
  Button,
  Card,
  Col,
  DatePicker,
  Divider,
  Drawer,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  TimePicker,
  Typography,
  message,
} from "antd";

import {
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  ReloadOutlined,
} from "@ant-design/icons";

import dayjs from "dayjs";

import api from "../services/api";
import { useAuth } from "../contexts/AuthContext";

const { Title, Text } = Typography;

function formatTime(value) {
  if (!value) {
    return "-";
  }

  const parsed = dayjs(value, ["HH:mm:ss", "HH:mm"]);

  return parsed.isValid() ? parsed.format("hh:mm A") : value;
}

function formatDate(value) {
  if (!value) {
    return "-";
  }

  const parsed = dayjs(value);

  return parsed.isValid() ? parsed.format("DD-MMM-YYYY") : value;
}

function timetableStatusColor(status) {
  switch (status) {
    case "ACTIVE":
      return "green";

    case "UPCOMING":
      return "blue";

    case "EXPIRED":
      return "default";

    case "INACTIVE":
      return "red";

    default:
      return "default";
  }
}

export default function Timetable() {
  const [form] = Form.useForm();

  const { hasPermission } = useAuth();

  const canEdit = hasPermission("timetable.edit");

  const [loading, setLoading] = useState(false);

  const [saving, setSaving] = useState(false);

  const [timetables, setTimetables] = useState([]);

  const [courses, setCourses] = useState([]);

  const [staffCategories, setStaffCategories] = useState([]);

  const [drawerOpen, setDrawerOpen] = useState(false);

  const [formMode, setFormMode] = useState("add");

  const [editingTimetable, setEditingTimetable] = useState(null);

  const [tablePagination, setTablePagination] = useState({
    current: 1,

    pageSize: 20,
  });

  const loadTimetables = async () => {
    setLoading(true);

    try {
      const response = await api.get("/timetables");

      setTimetables(
        Array.isArray(response.data?.data) ? response.data.data : [],
      );
    } catch (error) {
      message.error(
        error.response?.data?.message || "Could not load timetables.",
      );
    } finally {
      setLoading(false);
    }
  };

  const loadCourses = async () => {
    try {
      const response = await api.get("/courses");

      setCourses(Array.isArray(response.data?.data) ? response.data.data : []);
    } catch (error) {
      message.error(error.response?.data?.message || "Could not load courses.");
    }
  };

  const loadStaffCategories = async () => {
    try {
      const response = await api.get("/staff/categories");

      setStaffCategories(
        Array.isArray(response.data?.data) ? response.data.data : [],
      );
    } catch (error) {
      message.error(
        error.response?.data?.message || "Could not load Staff Categories.",
      );
    }
  };

  useEffect(() => {
    loadTimetables();
    loadCourses();
    loadStaffCategories();
  }, []);

  const courseOptions = useMemo(
    () =>
      courses.map((item) => {
        const status = item.course_status || "DATE_NOT_SET";

        const period =
          item.start_date && item.end_date
            ? `${formatDate(item.start_date)} → ${formatDate(item.end_date)}`
            : "Dates Not Set";

        return {
          value: item.id,

          label: `${item.course_name} | ${period} | ${status}`,
        };
      }),
    [courses],
  );

  const staffCategoryOptions = useMemo(
    () =>
      staffCategories.map((item) => ({
        value: item.id,

        label: item.category_name,
      })),
    [staffCategories],
  );

  const handleRefresh = async () => {
    await Promise.all([loadTimetables(), loadCourses(), loadStaffCategories()]);
  };

  const openAddTimetable = () => {
    setFormMode("add");

    setEditingTimetable(null);

    form.resetFields();

    form.setFieldsValue({
      morning_early_minutes: 0,

      morning_late_grace_minutes: 0,

      evening_early_minutes: 0,

      evening_late_grace_minutes: 0,

      effective_from: null,

      effective_to: null,

      course_ids: [],

      staff_category_ids: [],

      is_active: true,
    });

    setDrawerOpen(true);
  };

  const openEditTimetable = async (record) => {
    try {
      setSaving(true);

      const response = await api.get(`/timetables/${record.id}`);

      const item = response.data?.data;

      if (!item) {
        throw new Error("Timetable not found.");
      }

      setEditingTimetable(item);

      setFormMode("edit");

      form.setFieldsValue({
        timetable_name: item.timetable_name,

        morning_start: item.morning_start
          ? dayjs(item.morning_start, "HH:mm:ss")
          : null,

        morning_end: item.morning_end
          ? dayjs(item.morning_end, "HH:mm:ss")
          : null,

        morning_early_minutes: Number(item.morning_early_minutes || 0),

        morning_late_grace_minutes: Number(
          item.morning_late_grace_minutes || 0,
        ),

        evening_start: item.evening_start
          ? dayjs(item.evening_start, "HH:mm:ss")
          : null,

        evening_end: item.evening_end
          ? dayjs(item.evening_end, "HH:mm:ss")
          : null,

        evening_early_minutes: Number(item.evening_early_minutes || 0),

        evening_late_grace_minutes: Number(
          item.evening_late_grace_minutes || 0,
        ),

        effective_from: item.effective_from
          ? dayjs(String(item.effective_from).slice(0, 10))
          : null,

        effective_to: item.effective_to
          ? dayjs(String(item.effective_to).slice(0, 10))
          : null,

        course_ids: (item.courses || []).map((course) => course.id),

        staff_category_ids: (item.staff_categories || []).map(
          (category) => category.id,
        ),

        is_active: Boolean(item.is_active),
      });

      setDrawerOpen(true);
    } catch (error) {
      message.error(
        error.response?.data?.message ||
          error.message ||
          "Could not load timetable.",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleSaveTimetable = async () => {
    try {
      const values = await form.validateFields();

      setSaving(true);

      const payload = {
        timetable_name: values.timetable_name.trim(),

        morning_start: values.morning_start.format("HH:mm:ss"),

        morning_end: values.morning_end.format("HH:mm:ss"),

        morning_early_minutes: Number(values.morning_early_minutes || 0),

        morning_late_grace_minutes: Number(
          values.morning_late_grace_minutes || 0,
        ),

        evening_start: values.evening_start.format("HH:mm:ss"),

        evening_end: values.evening_end.format("HH:mm:ss"),

        evening_early_minutes: Number(values.evening_early_minutes || 0),

        evening_late_grace_minutes: Number(
          values.evening_late_grace_minutes || 0,
        ),

        effective_from: values.effective_from
          ? values.effective_from.format("YYYY-MM-DD")
          : null,

        effective_to: values.effective_to
          ? values.effective_to.format("YYYY-MM-DD")
          : null,

        course_ids: values.course_ids || [],

        staff_category_ids: values.staff_category_ids || [],

        is_active: values.is_active !== false,
      };

      if (formMode === "edit" && editingTimetable?.id) {
        await api.put(`/timetables/${editingTimetable.id}`, payload);

        message.success("Timetable updated successfully.");
      } else {
        await api.post("/timetables", payload);

        message.success("Timetable created successfully.");
      }

      setDrawerOpen(false);
      setEditingTimetable(null);
      form.resetFields();

      await loadTimetables();
    } catch (error) {
      if (error?.errorFields) {
        return;
      }

      message.error(
        error.response?.data?.message || "Could not save timetable.",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTimetable = (record) => {
    Modal.confirm({
      title: "Delete Timetable?",

      content: (
        <div>
          <p>
            <strong>{record.timetable_name}</strong>
          </p>

          <p>
            Is timetable ki Course aur Staff assignments bhi remove ho jayengi.
          </p>
        </div>
      ),

      okText: "Delete",

      okType: "danger",

      cancelText: "Cancel",

      async onOk() {
        try {
          await api.delete(`/timetables/${record.id}`);

          message.success("Timetable deleted successfully.");

          await loadTimetables();
        } catch (error) {
          message.error(
            error.response?.data?.message || "Could not delete timetable.",
          );
        }
      },
    });
  };

  const columns = [
    {
      title: "Timetable Name",

      dataIndex: "timetable_name",

      width: 220,

      render: (value) => <Text strong>{value}</Text>,
    },

    {
      title: "Morning Window",

      width: 240,

      render: (_, record) => (
        <div>
          <div>
            {formatTime(record.morning_start)}
            {" - "}
            {formatTime(record.morning_end)}
          </div>

          <Text
            type="secondary"
            style={{
              fontSize: 12,
            }}
          >
            Early: {record.morning_early_minutes} min
            {" | "}
            Late: {record.morning_late_grace_minutes} min
          </Text>
        </div>
      ),
    },

    {
      title: "Evening Window",

      width: 240,

      render: (_, record) => (
        <div>
          <div>
            {formatTime(record.evening_start)}
            {" - "}
            {formatTime(record.evening_end)}
          </div>

          <Text
            type="secondary"
            style={{
              fontSize: 12,
            }}
          >
            Early: {record.evening_early_minutes} min
            {" | "}
            Late: {record.evening_late_grace_minutes} min
          </Text>
        </div>
      ),
    },

    {
      title: "Effective Period",

      width: 220,

      render: (_, record) => (
        <div>
          <div>{formatDate(record.effective_from)}</div>

          <Text type="secondary">to {formatDate(record.effective_to)}</Text>
        </div>
      ),
    },

    {
      title: "Courses",

      dataIndex: "course_count",

      width: 100,

      align: "center",

      render: (value) => <Tag color="blue">{Number(value || 0)}</Tag>,
    },

    {
      title: "Current Courses",

      dataIndex: "current_course_count",

      width: 125,

      align: "center",

      render: (value) => <Tag color="green">{Number(value || 0)}</Tag>,
    },

    {
      title: "Staff Categories",

      dataIndex: "staff_category_count",

      width: 140,

      align: "center",

      render: (value) => <Tag color="purple">{Number(value || 0)}</Tag>,
    },

    {
      title: "Status",

      dataIndex: "rule_status",

      width: 110,

      align: "center",

      render: (value) => (
        <Tag color={timetableStatusColor(value)}>{value || "ACTIVE"}</Tag>
      ),
    },

    {
      title: "Actions",

      width: 120,

      fixed: "right",

      render: (_, record) =>
        canEdit ? (
          <Space>
            <Button
              type="text"
              icon={<EditOutlined />}
              onClick={() => openEditTimetable(record)}
            />

            <Button
              type="text"
              danger
              icon={<DeleteOutlined />}
              onClick={() => handleDeleteTimetable(record)}
            />
          </Space>
        ) : (
          "-"
        ),
    },
  ];

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
            Attendance Timetable, Weekend and Shift Management
          </Title>

          <Text type="secondary">
            Manage attendance windows for Trainee Courses and PTS Staff
            Categories.
          </Text>
        </div>

        <Space wrap>
          <Button
            icon={<ReloadOutlined />}
            onClick={handleRefresh}
            loading={loading}
          >
            Refresh
          </Button>

          {canEdit && (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={openAddTimetable}
            >
              Add Timetable
            </Button>
          )}
        </Space>
      </div>

      <Card>
        <div
          style={{
            marginBottom: 12,
          }}
        >
          <Text>
            Total:{" "}
            <strong>
              {timetables.length}/{timetables.length}
            </strong>
          </Text>
        </div>

        <Table
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={timetables}
          scroll={{
            x: 1500,
          }}
          pagination={{
            current: tablePagination.current,

            pageSize: tablePagination.pageSize,

            total: timetables.length,

            showSizeChanger: true,

            showQuickJumper: true,

            pageSizeOptions: ["10", "20", "50", "100"],

            onChange: (page, pageSize) => {
              const changed = pageSize !== tablePagination.pageSize;

              setTablePagination({
                current: changed ? 1 : page,

                pageSize,
              });
            },
          }}
        />
      </Card>

      <Drawer
        title={formMode === "edit" ? "Edit Timetable" : "Add Timetable"}
        width={780}
        open={drawerOpen}
        destroyOnHidden
        onClose={() => {
          setDrawerOpen(false);
          setEditingTimetable(null);
          form.resetFields();
        }}
        extra={
          <Space>
            <Button onClick={() => setDrawerOpen(false)}>Cancel</Button>

            <Button
              type="primary"
              loading={saving}
              onClick={handleSaveTimetable}
            >
              {formMode === "edit" ? "Update Timetable" : "Save Timetable"}
            </Button>
          </Space>
        }
      >
        <Alert
          type="info"
          showIcon
          style={{
            marginBottom: 20,
          }}
          message="Attendance Window"
          description="Window ke andar punch milne par attendance configured timetable ke mutabiq process hogi."
        />

        <Form form={form} layout="vertical">
          <Form.Item
            name="timetable_name"
            label="Timetable Name"
            rules={[
              {
                required: true,

                message: "Timetable Name is required.",
              },
            ]}
          >
            <Input placeholder="e.g. Recruit Summer Schedule" />
          </Form.Item>

          <Divider orientation="left">Morning Attendance</Divider>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="morning_start"
                label="Morning Window Start"
                rules={[
                  {
                    required: true,

                    message: "Morning Start is required.",
                  },
                ]}
              >
                <TimePicker
                  format="hh:mm A"
                  use12Hours
                  style={{
                    width: "100%",
                  }}
                />
              </Form.Item>
            </Col>

            <Col span={12}>
              <Form.Item
                name="morning_end"
                label="Morning Window End"
                rules={[
                  {
                    required: true,

                    message: "Morning End is required.",
                  },
                ]}
              >
                <TimePicker
                  format="hh:mm A"
                  use12Hours
                  style={{
                    width: "100%",
                  }}
                />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="morning_early_minutes"
                label="Morning Early Allowance (Minutes)"
              >
                <InputNumber
                  min={0}
                  max={720}
                  style={{
                    width: "100%",
                  }}
                />
              </Form.Item>
            </Col>

            <Col span={12}>
              <Form.Item
                name="morning_late_grace_minutes"
                label="Morning Late Grace (Minutes)"
              >
                <InputNumber
                  min={0}
                  max={720}
                  style={{
                    width: "100%",
                  }}
                />
              </Form.Item>
            </Col>
          </Row>

          <Divider orientation="left">Evening Attendance</Divider>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="evening_start"
                label="Evening Window Start"
                rules={[
                  {
                    required: true,

                    message: "Evening Start is required.",
                  },
                ]}
              >
                <TimePicker
                  format="hh:mm A"
                  use12Hours
                  style={{
                    width: "100%",
                  }}
                />
              </Form.Item>
            </Col>

            <Col span={12}>
              <Form.Item
                name="evening_end"
                label="Evening Window End"
                rules={[
                  {
                    required: true,

                    message: "Evening End is required.",
                  },
                ]}
              >
                <TimePicker
                  format="hh:mm A"
                  use12Hours
                  style={{
                    width: "100%",
                  }}
                />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="evening_early_minutes"
                label="Evening Early Allowance (Minutes)"
              >
                <InputNumber
                  min={0}
                  max={720}
                  style={{
                    width: "100%",
                  }}
                />
              </Form.Item>
            </Col>

            <Col span={12}>
              <Form.Item
                name="evening_late_grace_minutes"
                label="Evening Late Grace (Minutes)"
              >
                <InputNumber
                  min={0}
                  max={720}
                  style={{
                    width: "100%",
                  }}
                />
              </Form.Item>
            </Col>
          </Row>

          <Divider orientation="left">Assign Timetable</Divider>

          <Form.Item name="course_ids" label="Assign to Trainee Courses">
            <Select
              mode="multiple"
              allowClear
              showSearch
              optionFilterProp="label"
              options={courseOptions}
              placeholder="Select one or multiple Courses"
            />
          </Form.Item>

          <Form.Item
            name="staff_category_ids"
            label="Assign to PTS Staff Categories"
          >
            <Select
              mode="multiple"
              allowClear
              showSearch
              optionFilterProp="label"
              options={staffCategoryOptions}
              placeholder="Select one or multiple Staff Categories"
            />
          </Form.Item>

          <Divider orientation="left">Effective Period</Divider>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="effective_from" label="Effective From">
                <DatePicker
                  format="DD-MMM-YYYY"
                  style={{
                    width: "100%",
                  }}
                />
              </Form.Item>
            </Col>

            <Col span={12}>
              <Form.Item
                name="effective_to"
                label="Effective To"
                dependencies={["effective_from"]}
                rules={[
                  ({ getFieldValue }) => ({
                    validator(_, value) {
                      const from = getFieldValue("effective_from");

                      if (!from || !value || !value.isBefore(from, "day")) {
                        return Promise.resolve();
                      }

                      return Promise.reject(
                        new Error(
                          "Effective To cannot be earlier than Effective From.",
                        ),
                      );
                    },
                  }),
                ]}
              >
                <DatePicker
                  format="DD-MMM-YYYY"
                  style={{
                    width: "100%",
                  }}
                />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            name="is_active"
            label="Timetable Enabled"
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>
        </Form>
      </Drawer>
    </div>
  );
}
