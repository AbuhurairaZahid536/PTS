import { useEffect, useMemo, useState } from "react";

import {
  Alert,
  Button,
  Card,
  Checkbox,
  Col,
  DatePicker,
  Form,
  Input,
  Modal,
  Row,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
  message,
} from "antd";

import {
  CalendarOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  TeamOutlined,
  WarningOutlined,
} from "@ant-design/icons";

import dayjs from "dayjs";

import api from "../services/api";

import { useAuth } from "../contexts/AuthContext";

const { Title, Text } = Typography;

/*
|--------------------------------------------------------------------------
| STAFF / NON-TRAINEE RECORDS
|--------------------------------------------------------------------------
|
| These must NEVER appear inside Trainee Management.
|
|--------------------------------------------------------------------------
*/

const NON_TRAINEE_COURSES = [
  "Admin",
  "Dhobi Khana",
  "Class 4 Staff",
  "Line Staff",
  "Drill Instructors",
  "Law Instructor",
  "Menial Staff",
  "Ministerial Staff",
  "Security Staff",
  "Band Staff",
  "CL Staff",
  "Weapon Staff",
];

function normalizeCourseName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\bstaff\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isNonTraineeCourseName(value) {
  const normalized = normalizeCourseName(value);

  return NON_TRAINEE_COURSES.some(
    (item) => {
      const key = normalizeCourseName(item);

      return (
        normalized === key ||
        normalized.startsWith(`${key} `) ||
        key.startsWith(`${normalized} `)
      );
    },
  );
}

/*
|--------------------------------------------------------------------------
| STATUS HELPERS
|--------------------------------------------------------------------------
*/

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

function courseStatusLabel(status) {
  switch (status) {
    case "ACTIVE":
      return "Active";

    case "UPCOMING":
      return "Upcoming";

    case "COMPLETED":
      return "Completed";

    case "DATE_NOT_SET":
      return "Date Not Set";

    default:
      return status || "-";
  }
}

function formatDate(value) {
  if (!value) {
    return "-";
  }

  const parsed = dayjs(value);

  if (!parsed.isValid()) {
    return "-";
  }

  return parsed.format("DD-MMM-YYYY");
}

/*
|--------------------------------------------------------------------------
| COMPONENT
|--------------------------------------------------------------------------
*/

export default function Courses() {
  const [form] = Form.useForm();

  const { hasPermission } = useAuth();

  const canEdit = hasPermission("courses.edit");

  const canPermanentDelete =
    hasPermission("data_management.manage") ||
    hasPermission("users.manage");

  /*
  |--------------------------------------------------------------------------
  | DATA STATE
  |--------------------------------------------------------------------------
  */

  const [loading, setLoading] = useState(false);

  const [saving, setSaving] = useState(false);

  const [deleting, setDeleting] = useState(false);

  const [courses, setCourses] = useState([]);

  /*
  |--------------------------------------------------------------------------
  | FILTERS
  |--------------------------------------------------------------------------
  */

  const [search, setSearch] = useState("");

  const [statusFilter, setStatusFilter] = useState(null);

  /*
  |--------------------------------------------------------------------------
  | COURSE MODAL
  |--------------------------------------------------------------------------
  */

  const [courseModalOpen, setCourseModalOpen] = useState(false);

  const [editingCourse, setEditingCourse] = useState(null);

  /*
  |--------------------------------------------------------------------------
  | PERMANENT DELETE
  |--------------------------------------------------------------------------
  */

  const [selectedRowKeys, setSelectedRowKeys] = useState([]);

  const [confirmOpen, setConfirmOpen] = useState(false);

  const [confirmText, setConfirmText] = useState("");

  const [deleteTrainees, setDeleteTrainees] = useState(false);

  const [deleteRawTransactions, setDeleteRawTransactions] = useState(false);

  /*
  |--------------------------------------------------------------------------
  | LOAD COURSES
  |--------------------------------------------------------------------------
  |
  | Backend already excludes PTS Staff pseudo-courses.
  |
  | Frontend also filters them defensively.
  |
  |--------------------------------------------------------------------------
  */

  const loadCourses = async () => {
    setLoading(true);

    try {
      const response = await api.get("/courses");

      const rows = Array.isArray(response.data?.data) ? response.data.data : [];

      const traineeCourses = rows.filter(
        (course) => !isNonTraineeCourseName(course.course_name),
      );

      setCourses(traineeCourses);

      setSelectedRowKeys([]);
    } catch (error) {
      message.error(error.response?.data?.message || "Could not load courses.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCourses();
  }, []);

  /*
  |--------------------------------------------------------------------------
  | SUMMARY
  |--------------------------------------------------------------------------
  */

  const summary = useMemo(() => {
    const result = {
      total: courses.length,

      active: 0,

      upcoming: 0,

      completed: 0,

      dateNotSet: 0,

      currentTrainees: 0,
    };

    courses.forEach((course) => {
      switch (course.course_status) {
        case "ACTIVE":
          result.active += 1;

          break;

        case "UPCOMING":
          result.upcoming += 1;

          break;

        case "COMPLETED":
          result.completed += 1;

          break;

        case "DATE_NOT_SET":
          result.dateNotSet += 1;

          break;

        default:
          break;
      }

      if (course.course_status === "ACTIVE") {
        result.currentTrainees += Number(course.active_trainees || 0);
      }
    });

    return result;
  }, [courses]);

  /*
  |--------------------------------------------------------------------------
  | FILTERED COURSES
  |--------------------------------------------------------------------------
  */

  const filteredCourses = useMemo(() => {
    const q = search.trim().toLowerCase();

    return courses.filter((course) => {
      if (statusFilter && course.course_status !== statusFilter) {
        return false;
      }

      if (!q) {
        return true;
      }

      return [
        course.course_name,

        course.course_code,

        course.course_status,

        course.zkbiotime_dept_code,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q));
    });
  }, [courses, search, statusFilter]);

  /*
  |--------------------------------------------------------------------------
  | SELECTED COURSES
  |--------------------------------------------------------------------------
  */

  const selectedCourses = useMemo(() => {
    const selected = new Set(selectedRowKeys.map(Number));

    return courses.filter((course) => selected.has(Number(course.id)));
  }, [courses, selectedRowKeys]);

  /*
  |--------------------------------------------------------------------------
  | ADD COURSE
  |--------------------------------------------------------------------------
  */

  const openAddCourse = () => {
    setEditingCourse(null);

    form.resetFields();

    setCourseModalOpen(true);
  };

  /*
  |--------------------------------------------------------------------------
  | EDIT COURSE
  |--------------------------------------------------------------------------
  */

  const openEditCourse = (course) => {
    setEditingCourse(course);

    form.setFieldsValue({
      course_name: course.course_name || "",

      course_code: course.course_code || "",

      period:
        course.start_date && course.end_date
          ? [dayjs(course.start_date), dayjs(course.end_date)]
          : null,
    });

    setCourseModalOpen(true);
  };

  /*
  |--------------------------------------------------------------------------
  | SAVE COURSE
  |--------------------------------------------------------------------------
  |
  | IMPORTANT:
  |
  | Course WITHOUT dates is intentionally allowed.
  |
  | No Period:
  |   start_date = null
  |   end_date   = null
  |   status     = DATE_NOT_SET
  |
  |--------------------------------------------------------------------------
  */

  const saveCourse = async () => {
    try {
      const values = await form.validateFields();

      const courseName = values.course_name?.trim();

      /*
        |--------------------------------------------------------------------------
        | STAFF / NON-TRAINEE NAME PROTECTION
        |--------------------------------------------------------------------------
        */

      if (isNonTraineeCourseName(courseName)) {
        message.error(
          "PTS Staff categories cannot be created as Trainee Courses.",
        );

        return;
      }

      /*
        |--------------------------------------------------------------------------
        | DATE-LESS COURSE IS ALLOWED
        |--------------------------------------------------------------------------
        */

      const startDate = values.period?.[0]
        ? values.period[0].format("YYYY-MM-DD")
        : null;

      const endDate = values.period?.[1]
        ? values.period[1].format("YYYY-MM-DD")
        : null;

      /*
        |--------------------------------------------------------------------------
        | RANGE VALIDATION
        |--------------------------------------------------------------------------
        |
        | RangePicker normally returns both dates together.
        | This is an extra defensive check.
        |
        |--------------------------------------------------------------------------
        */

      if ((startDate && !endDate) || (!startDate && endDate)) {
        message.error(
          "When setting Course dates, both Start Date and End Date are required.",
        );

        return;
      }

      if (startDate && endDate && endDate < startDate) {
        message.error(
          "Course End Date cannot be earlier than Course Start Date.",
        );

        return;
      }

      setSaving(true);

      const payload = {
        course_name: courseName,

        course_code: values.course_code?.trim() || null,

        start_date: startDate,

        end_date: endDate,
      };

      if (editingCourse) {
        await api.put(`/courses/${editingCourse.id}`, payload);

        message.success("Course updated successfully.");
      } else {
        await api.post("/courses", payload);

        message.success(
          startDate && endDate
            ? "Course created successfully."
            : "Course created successfully without dates.",
        );
      }

      setCourseModalOpen(false);

      setEditingCourse(null);

      form.resetFields();

      await loadCourses();
    } catch (error) {
      if (error?.errorFields) {
        return;
      }

      message.error(
        error.response?.data?.message ||
          (editingCourse
            ? "Could not update Course."
            : "Could not create Course."),
      );
    } finally {
      setSaving(false);
    }
  };

  /*
  |--------------------------------------------------------------------------
  | DELETE
  |--------------------------------------------------------------------------
  */

  const openBulkDelete = () => {
    if (!selectedRowKeys.length) {
      message.warning("Select at least one course.");

      return;
    }

    setConfirmText("");

    setDeleteTrainees(false);

    setDeleteRawTransactions(false);

    setConfirmOpen(true);
  };

  const runPermanentDelete = async () => {
    if (confirmText !== "DELETE") {
      message.error("Type DELETE to confirm.");

      return;
    }

    setDeleting(true);

    const results = [];

    try {
      for (const course of selectedCourses) {
        try {
          const response = await api.post(
            `/data-management/courses/${course.id}/permanent-delete`,
            {
              delete_trainees: deleteTrainees,

              delete_raw_transactions: deleteRawTransactions,
            },
          );

          results.push({
            id: course.id,

            name: course.course_name,

            success: true,

            data: response.data?.data,
          });
        } catch (error) {
          results.push({
            id: course.id,

            name: course.course_name,

            success: false,

            error: error.response?.data?.message || error.message,
          });
        }
      }

      const success = results.filter((item) => item.success);

      const failed = results.filter((item) => !item.success);

      setConfirmOpen(false);

      setSelectedRowKeys([]);

      Modal.info({
        title: "Permanent Delete Result",

        width: 650,

        content: (
          <div
            style={{
              marginTop: 16,
            }}
          >
            <p>
              Deleted: <strong>{success.length}</strong>
            </p>

            <p>
              Failed: <strong>{failed.length}</strong>
            </p>

            {failed.length > 0 && (
              <div>
                {failed.map((item) => (
                  <Alert
                    key={item.id}
                    style={{
                      marginBottom: 8,
                    }}
                    type="error"
                    showIcon
                    message={item.name || `Course ${item.id}`}
                    description={item.error}
                  />
                ))}
              </div>
            )}
          </div>
        ),
      });

      await loadCourses();
    } finally {
      setDeleting(false);
    }
  };

  /*
  |--------------------------------------------------------------------------
  | TABLE COLUMNS
  |--------------------------------------------------------------------------
  */

  const columns = [
    {
      title: "Course",

      dataIndex: "course_name",

      width: 250,

      fixed: "left",

      render: (value, record) => (
        <Space direction="vertical" size={0}>
          <Text strong>{value || "-"}</Text>

          {record.course_code && (
            <Text
              type="secondary"
              style={{
                fontSize: 11,
              }}
            >
              {record.course_code}
            </Text>
          )}
        </Space>
      ),
    },

    {
      title: "Start Date",

      dataIndex: "start_date",

      width: 140,

      align: "center",

      render: formatDate,
    },

    {
      title: "End Date",

      dataIndex: "end_date",

      width: 140,

      align: "center",

      render: formatDate,
    },

    {
      title: "Course Status",

      dataIndex: "course_status",

      width: 150,

      align: "center",

      render: (value) => (
        <Tag color={courseStatusColor(value)}>{courseStatusLabel(value)}</Tag>
      ),
    },

    {
      title: "Total Trainees",

      dataIndex: "trainee_count",

      width: 125,

      align: "center",

      render: (value) => Number(value || 0),
    },

    {
      title: "Current Trainees",

      dataIndex: "active_trainees",

      width: 140,

      align: "center",

      render: (value, record) => (
        <Tag color={record.course_status === "ACTIVE" ? "green" : "default"}>
          {Number(value || 0)}
        </Tag>
      ),
    },

    {
      title: "Dropped",

      dataIndex: "dropped_trainees",

      width: 100,

      align: "center",

      render: (value) => (
        <Tag color={Number(value || 0) > 0 ? "red" : "default"}>
          {Number(value || 0)}
        </Tag>
      ),
    },

    {
      title: "Platoons",

      dataIndex: "platoon_count",

      width: 100,

      align: "center",

      render: (value) => Number(value || 0),
    },

    {
      title: "ZKBioTime Dept",

      dataIndex: "zkbiotime_department_id",

      width: 155,

      align: "center",

      render: (value, record) =>
        value ? (
          <Space direction="vertical" size={0}>
            <Tag color="blue">ID {value}</Tag>

            {record.zkbiotime_dept_code && (
              <Text
                type="secondary"
                style={{
                  fontSize: 10,
                }}
              >
                {record.zkbiotime_dept_code}
              </Text>
            )}
          </Space>
        ) : (
          <Tag color="orange">Not Linked</Tag>
        ),
    },

    {
      title: "Action",

      width: 100,

      fixed: "right",

      align: "center",

      render: (_, record) =>
        canEdit ? (
          <Button
            size="small"
            icon={<EditOutlined />}
            onClick={() => openEditCourse(record)}
          >
            Edit
          </Button>
        ) : (
          "-"
        ),
    },
  ];

  /*
  |--------------------------------------------------------------------------
  | SELECT ALL
  |--------------------------------------------------------------------------
  */

  const selectAllFiltered = () => {
    setSelectedRowKeys(filteredCourses.map((item) => item.id));
  };

  /*
  |--------------------------------------------------------------------------
  | UI
  |--------------------------------------------------------------------------
  */

  return (
    <div>
      {/* HEADER */}

      <div
        style={{
          display: "flex",

          justifyContent: "space-between",

          alignItems: "center",

          gap: 16,

          marginBottom: 16,

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
            Courses
          </Title>

          <Text type="secondary">
            Trainee training courses, lifecycle, trainee strength and ZKBioTime
            department mapping.
          </Text>
        </div>

        <Space wrap>
          <Button
            icon={<ReloadOutlined />}
            onClick={loadCourses}
            loading={loading}
          >
            Refresh
          </Button>

          {canEdit && (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={openAddCourse}
            >
              Add Course
            </Button>
          )}
        </Space>
      </div>

      {/* INFORMATION */}

      <Alert
        type="info"
        showIcon
        style={{
          marginBottom: 16,
        }}
        message="Course lifecycle Start Date aur End Date se automatically manage hota hai."
        description="Course dates optional hain. Agar dates set na hon to Course Status 'Date Not Set' rahega. Dates set karne ke baad status Course period ke mutabiq automatically Upcoming, Active ya Completed update hota rahega."
      />

      {/* SUMMARY */}

      <Row
        gutter={[12, 12]}
        style={{
          marginBottom: 16,
        }}
      >
        <Col xs={12} md={6} xl={4}>
          <Card>
            <Statistic
              title="Total Courses"
              value={summary.total}
              prefix={<TeamOutlined />}
            />
          </Card>
        </Col>

        <Col xs={12} md={6} xl={4}>
          <Card>
            <Statistic
              title="Active Courses"
              value={summary.active}
              prefix={<CheckCircleOutlined />}
              valueStyle={{
                color: "#389e0d",
              }}
            />
          </Card>
        </Col>

        <Col xs={12} md={6} xl={4}>
          <Card>
            <Statistic
              title="Upcoming"
              value={summary.upcoming}
              prefix={<ClockCircleOutlined />}
              valueStyle={{
                color: "#1677ff",
              }}
            />
          </Card>
        </Col>

        <Col xs={12} md={6} xl={4}>
          <Card>
            <Statistic
              title="Completed"
              value={summary.completed}
              prefix={<CalendarOutlined />}
            />
          </Card>
        </Col>

        <Col xs={12} md={6} xl={4}>
          <Card>
            <Statistic
              title="Date Not Set"
              value={summary.dateNotSet}
              prefix={<WarningOutlined />}
              valueStyle={{
                color: summary.dateNotSet > 0 ? "#d46b08" : undefined,
              }}
            />
          </Card>
        </Col>

        <Col xs={12} md={6} xl={4}>
          <Card>
            <Statistic
              title="Current Trainees"
              value={summary.currentTrainees}
              prefix={<TeamOutlined />}
            />
          </Card>
        </Col>
      </Row>

      {/* FILTERS */}

      <Card
        style={{
          marginBottom: 16,
        }}
      >
        <Row gutter={[12, 12]}>
          <Col xs={24} md={12} lg={10}>
            <Input
              allowClear
              value={search}
              prefix={<SearchOutlined />}
              placeholder="Search course name or code"
              onChange={(event) => setSearch(event.target.value)}
            />
          </Col>

          <Col xs={24} md={8} lg={5}>
            <Select
              allowClear
              value={statusFilter}
              placeholder="All Course Status"
              style={{
                width: "100%",
              }}
              onChange={setStatusFilter}
              options={[
                {
                  value: "ACTIVE",

                  label: "Active",
                },

                {
                  value: "UPCOMING",

                  label: "Upcoming",
                },

                {
                  value: "COMPLETED",

                  label: "Completed",
                },

                {
                  value: "DATE_NOT_SET",

                  label: "Date Not Set",
                },
              ]}
            />
          </Col>

          <Col xs={24} lg={9}>
            {canPermanentDelete && (
              <Space wrap>
                <Button
                  disabled={!filteredCourses.length}
                  onClick={selectAllFiltered}
                >
                  Select All Filtered ( {filteredCourses.length} )
                </Button>

                <Button
                  disabled={!selectedRowKeys.length}
                  onClick={() => setSelectedRowKeys([])}
                >
                  Clear Selection
                </Button>

                <Button
                  danger
                  type="primary"
                  icon={<DeleteOutlined />}
                  disabled={!selectedRowKeys.length}
                  onClick={openBulkDelete}
                >
                  Permanent Delete ( {selectedRowKeys.length} )
                </Button>
              </Space>
            )}
          </Col>
        </Row>
      </Card>

      {/* COURSE TABLE */}

      <Card>
        <Table
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={filteredCourses}
          bordered
          scroll={{
            x: 1500,
          }}
          rowSelection={
            canPermanentDelete
              ? {
                  selectedRowKeys,

                  preserveSelectedRowKeys: true,

                  onChange: (keys) => setSelectedRowKeys(keys),
                }
              : undefined
          }
          pagination={{
            defaultPageSize: 25,

            showSizeChanger: true,

            pageSizeOptions: ["10", "25", "50", "100"],

            showTotal: (total) => `Total ${total} courses`,
          }}
        />
      </Card>

      {/* ADD / EDIT COURSE */}

      <Modal
        title={editingCourse ? "Edit Course" : "Add Course"}
        open={courseModalOpen}
        onCancel={() => {
          if (saving) {
            return;
          }

          setCourseModalOpen(false);

          setEditingCourse(null);

          form.resetFields();
        }}
        onOk={saveCourse}
        confirmLoading={saving}
        okText={editingCourse ? "Update Course" : "Create Course"}
        width={620}
        destroyOnHidden
      >
        <Alert
          type="info"
          showIcon
          style={{
            marginBottom: 16,
          }}
          message="Training Period optional hai."
          description="Course without dates create kiya ja sakta hai. Aise Course ka status Date Not Set rahega aur woh temporal Attendance / General Statement mein tab tak include nahi hoga jab tak Start aur End Date set na ki jayein."
        />

        {editingCourse && (
          <Card
            size="small"
            style={{
              marginBottom: 16,
            }}
          >
            <Space wrap>
              <Text strong>Current Status:</Text>

              <Tag color={courseStatusColor(editingCourse.course_status)}>
                {courseStatusLabel(editingCourse.course_status)}
              </Tag>

              <Text type="secondary">
                {formatDate(editingCourse.start_date)}
                {" → "}
                {formatDate(editingCourse.end_date)}
              </Text>
            </Space>
          </Card>
        )}

        <Form form={form} layout="vertical">
          <Form.Item
            name="course_name"
            label="Course Name"
            rules={[
              {
                required: true,

                message: "Course Name is required.",
              },

              {
                whitespace: true,

                message: "Course Name is required.",
              },

              {
                validator: (_, value) => {
                  if (!value) {
                    return Promise.resolve();
                  }

                  if (isNonTraineeCourseName(value)) {
                    return Promise.reject(
                      new Error(
                        "PTS Staff category cannot be used as a Trainee Course.",
                      ),
                    );
                  }

                  return Promise.resolve();
                },
              },
            ]}
          >
            <Input placeholder="e.g. Recruit Course 67th" />
          </Form.Item>

          <Form.Item name="course_code" label="Course Code">
            <Input placeholder="Optional" />
          </Form.Item>

          <Form.Item name="period" label="Training Period (Optional)">
            <DatePicker.RangePicker
              allowClear
              style={{
                width: "100%",
              }}
              format="DD-MMM-YYYY"
              placeholder={["Course Start Date", "Course End Date"]}
            />
          </Form.Item>

          <Alert
            type="success"
            showIcon
            message="Automatic Course Status"
            description={
              <div>
                <div>
                  No Dates = <strong>DATE_NOT_SET</strong>
                </div>

                <div>
                  Before Start Date = <strong>UPCOMING</strong>
                </div>

                <div>
                  Start Date to End Date = <strong>ACTIVE</strong>
                </div>

                <div>
                  After End Date = <strong>COMPLETED</strong>
                </div>
              </div>
            }
          />
        </Form>
      </Modal>

      {/* PERMANENT DELETE */}

      <Modal
        title="Permanent Course Delete"
        open={confirmOpen}
        onCancel={() => !deleting && setConfirmOpen(false)}
        onOk={runPermanentDelete}
        okText="Permanently Delete"
        okType="danger"
        confirmLoading={deleting}
        okButtonProps={{
          disabled: confirmText !== "DELETE",
        }}
        width={680}
        destroyOnHidden
      >
        <Alert
          type="error"
          showIcon
          icon={<WarningOutlined />}
          message={`${selectedRowKeys.length} course(s) selected`}
          description="Historical course ko normally delete karne ki zarurat nahi. Completed course portal mein historical record ke taur par rehna chahiye."
          style={{
            marginBottom: 18,
          }}
        />

        <Space
          direction="vertical"
          size="middle"
          style={{
            width: "100%",
          }}
        >
          <Checkbox
            checked={deleteTrainees}
            onChange={(event) => setDeleteTrainees(event.target.checked)}
          >
            Course ke tamam Trainees bhi permanently delete karein
          </Checkbox>

          <Checkbox
            checked={deleteRawTransactions}
            disabled={!deleteTrainees}
            onChange={(event) => setDeleteRawTransactions(event.target.checked)}
          >
            Raw biometric transactions bhi delete karein jab Employee ID kisi
            aur Course/Staff record mein use na ho
          </Checkbox>

          <div>
            <Text>
              Confirmation ke liye <strong>DELETE</strong> type karein:
            </Text>

            <Input
              value={confirmText}
              onChange={(event) => setConfirmText(event.target.value)}
              placeholder="DELETE"
              style={{
                marginTop: 8,
              }}
            />
          </div>
        </Space>
      </Modal>
    </div>
  );
}
