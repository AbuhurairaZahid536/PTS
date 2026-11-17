import { useEffect, useState } from "react";

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
  Tag,
  Typography,
  message,
} from "antd";
import Table from "../components/SerialTable";

import {
  CheckCircleOutlined,
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

function statusColor(status) {
  switch (status) {
    case "ACTIVE":
      return "red";

    case "REJOINED":
      return "green";

    case "CANCELLED":
      return "default";

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

export default function TrainingDropManagement() {
  const [dropForm] = Form.useForm();

  const [rejoinForm] = Form.useForm();

  const { hasPermission } = useAuth();

  const [loading, setLoading] = useState(false);

  const [saving, setSaving] = useState(false);

  const [records, setRecords] = useState([]);

  const [overallTotal, setOverallTotal] = useState(0);

  const [traineeOptions, setTraineeOptions] = useState([]);

  const [selectedTrainee, setSelectedTrainee] = useState(null);

  const [search, setSearch] = useState("");

  const [statusFilter, setStatusFilter] = useState(null);

  const [dateRange, setDateRange] = useState(null);

  const [drawerOpen, setDrawerOpen] = useState(false);

  const [editingRecord, setEditingRecord] = useState(null);

  const [rejoinOpen, setRejoinOpen] = useState(false);

  const [selectedRecord, setSelectedRecord] = useState(null);

  const [viewOpen, setViewOpen] = useState(false);

  const canCreate = hasPermission("training_drop.create");

  const canRejoin = hasPermission("training_drop.rejoin");

  const canCancel = hasPermission("training_drop.cancel");

  /*
  |--------------------------------------------------------------------------
  | LOAD
  |--------------------------------------------------------------------------
  */

  const loadRecords = async () => {
    setLoading(true);

    try {
      const params = {};

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

      const hasFilters = Object.keys(params).length > 0;

      if (!hasFilters) {
        const response = await api.get("/training-drops");

        const rows = Array.isArray(response.data?.data)
          ? response.data.data
          : [];

        setRecords(rows);

        setOverallTotal(rows.length);

        return;
      }

      const [filteredResponse, overallResponse] = await Promise.all([
        api.get("/training-drops", {
          params,
        }),

        api.get("/training-drops"),
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
          "Could not load Training Drop records.",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRecords();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /*
  |--------------------------------------------------------------------------
  | SEARCH TRAINEE
  |--------------------------------------------------------------------------
  */

  const searchTrainees = async (value) => {
    const query = String(value || "").trim();

    if (!query) {
      setTraineeOptions([]);

      return;
    }

    try {
      const response = await api.get("/leaves/subjects/search", {
        params: {
          subject_type: "TRAINEE",

          search: query,
        },
      });

      const rows = response.data?.data || [];

      setTraineeOptions(
        rows.map((item) => {
          const name = [item.first_name, item.last_name]
            .filter(Boolean)
            .join(" ");

          const coursePeriod =
            item.course_start_date && item.course_end_date
              ? `${formatDate(item.course_start_date)} → ${formatDate(
                  item.course_end_date,
                )}`
              : "";

          const extra = [
            item.course_name,

            item.platoon_number ? `Platoon ${item.platoon_number}` : null,

            coursePeriod,
          ]
            .filter(Boolean)
            .join(" / ");

          return {
            value: item.subject_id,

            label: `${item.employee_id} — ${name || "-"} | ${extra}`,

            item,
          };
        }),
      );
    } catch (error) {
      message.error(
        error.response?.data?.message || "Could not search trainee.",
      );
    }
  };

  /*
  |--------------------------------------------------------------------------
  | ADD DROP
  |--------------------------------------------------------------------------
  */

  const openDrop = () => {
    setEditingRecord(null);

    dropForm.resetFields();

    setTraineeOptions([]);

    setSelectedTrainee(null);

    setDrawerOpen(true);
  };

  const openEditDrop = (record) => {
    setEditingRecord(record);

    setSelectedTrainee({
      subject_id: record.trainee_id,
      employee_id: record.employee_id,
      first_name: record.trainee_name,
      course_name: record.course_name,
      platoon_number: record.platoon_number,
      course_start_date: record.course_start_date,
      course_end_date: record.course_end_date,
      course_status: record.course_status,
    });

    setTraineeOptions([
      {
        value: record.trainee_id,

        label: `${record.employee_id} — ${record.trainee_name || "-"} | ${record.course_name || "-"}`,

        item: {
          subject_id: record.trainee_id,
          employee_id: record.employee_id,
          first_name: record.trainee_name,
          course_name: record.course_name,
          platoon_number: record.platoon_number,
          course_start_date: record.course_start_date,
          course_end_date: record.course_end_date,
          course_status: record.course_status,
        },
      },
    ]);

    dropForm.setFieldsValue({
      trainee_id: record.trainee_id,

      drop_datetime: record.drop_datetime ? dayjs(record.drop_datetime) : null,

      reason: record.reason || "",

      order_reference: record.order_reference || "",

      remarks: record.remarks || "",
    });

    setDrawerOpen(true);
  };

  const saveDrop = async () => {
    try {
      const values = await dropForm.validateFields();

      setSaving(true);

      const payload = {
        trainee_id: values.trainee_id,

        drop_datetime: values.drop_datetime.format("YYYY-MM-DD HH:mm:ss"),

        reason: values.reason?.trim(),

        order_reference: values.order_reference?.trim() || null,

        remarks: values.remarks?.trim() || null,
      };

      if (editingRecord) {
        await api.put(`/training-drops/${editingRecord.id}`, payload);

        message.success("Training Drop updated successfully.");
      } else {
        await api.post("/training-drops", payload);

        message.success("Trainee dropped from training.");
      }

      setDrawerOpen(false);

      setEditingRecord(null);

      setSelectedTrainee(null);

      dropForm.resetFields();

      await loadRecords();
    } catch (error) {
      if (error?.errorFields) {
        return;
      }

      message.error(
        error.response?.data?.message || "Could not create Training Drop.",
      );
    } finally {
      setSaving(false);
    }
  };

  /*
  |--------------------------------------------------------------------------
  | REJOIN
  |--------------------------------------------------------------------------
  */

  const openRejoin = (record) => {
    setSelectedRecord(record);

    rejoinForm.resetFields();

    setRejoinOpen(true);
  };

  const saveRejoin = async () => {
    try {
      const values = await rejoinForm.validateFields();

      setSaving(true);

      await api.put(`/training-drops/${selectedRecord.id}/rejoin`, {
        rejoin_datetime: values.rejoin_datetime.format("YYYY-MM-DD HH:mm:ss"),

        rejoin_reason: values.rejoin_reason?.trim() || null,

        rejoin_order_reference: values.rejoin_order_reference?.trim() || null,
      });

      message.success("Trainee rejoined successfully.");

      setRejoinOpen(false);

      rejoinForm.resetFields();

      await loadRecords();
    } catch (error) {
      if (error?.errorFields) {
        return;
      }

      message.error(
        error.response?.data?.message || "Could not rejoin trainee.",
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

  const cancelDrop = (record) => {
    let reason = "";

    Modal.confirm({
      title: "Cancel Training Drop?",

      content: (
        <div>
          <Text>
            {record.employee_id}
            {" — "}
            {record.trainee_name}
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

      okText: "Cancel Drop",

      okType: "danger",

      async onOk() {
        if (!reason.trim()) {
          message.error("Cancellation Reason is required.");

          throw new Error("Reason required");
        }

        await api.put(`/training-drops/${record.id}/cancel`, {
          cancellation_reason: reason.trim(),
        });

        message.success("Training Drop cancelled.");

        await loadRecords();
      },
    });
  };

  /*
  |--------------------------------------------------------------------------
  | TABLE
  |--------------------------------------------------------------------------
  */

  const columns = [
    {
      title: "Employee ID / Cap No.",

      dataIndex: "employee_id",

      width: 150,

      render: (value) => <Text strong>{value}</Text>,
    },

    {
      title: "Name",

      dataIndex: "trainee_name",

      width: 180,
    },

    {
      title: "Course / Platoon",

      width: 280,

      render: (_, record) => (
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
              <Tag color="orange">Course Dates Not Set</Tag>
            )}
          </div>
        </div>
      ),
    },

    {
      title: "Drop Date/Time",

      dataIndex: "drop_datetime",

      width: 195,

      render: formatDateTime,
    },

    {
      title: "Reason",

      dataIndex: "reason",

      width: 240,

      ellipsis: true,
    },

    {
      title: "Status",

      dataIndex: "drop_status",

      width: 110,

      render: (value) => <Tag color={statusColor(value)}>{value}</Tag>,
    },

    {
      title: "Rejoin",

      width: 195,

      render: (_, record) =>
        record.drop_status === "REJOINED"
          ? formatDateTime(record.rejoin_datetime)
          : "-",
    },

    {
      title: "Actions",

      width: 270,

      fixed: "right",

      render: (_, record) => (
        <Space wrap>
          <Button
            size="small"
            icon={<EyeOutlined />}
            onClick={() => {
              setSelectedRecord(record);

              setViewOpen(true);
            }}
          >
            View
          </Button>

          {canCreate && record.drop_status === "ACTIVE" && (
            <Button
              size="small"
              icon={<EditOutlined />}
              onClick={() => openEditDrop(record)}
            >
              Edit
            </Button>
          )}

          {canRejoin && record.drop_status === "ACTIVE" && (
            <Button
              size="small"
              type="primary"
              icon={<CheckCircleOutlined />}
              onClick={() => openRejoin(record)}
            >
              Rejoin
            </Button>
          )}

          {canCancel && record.drop_status === "ACTIVE" && (
            <Button
              size="small"
              danger
              icon={<StopOutlined />}
              onClick={() => cancelDrop(record)}
            >
              Cancel
            </Button>
          )}
        </Space>
      ),
    },
  ];

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
            Training Drop
          </Title>

          <Text type="secondary">
            Course-specific Drop, Rejoin aur complete Training Drop history.
          </Text>
        </div>

        <Space wrap>
          <Button icon={<ReloadOutlined />} onClick={loadRecords}>
            Refresh
          </Button>

          {canCreate && (
            <Button type="primary" icon={<PlusOutlined />} onClick={openDrop}>
              Drop Trainee
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
          <Col xs={24} md={8}>
            <Input
              allowClear
              placeholder="Employee ID / Name / Course / Reason"
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
                  value: "REJOINED",
                  label: "Rejoined",
                },

                {
                  value: "CANCELLED",
                  label: "Cancelled",
                },
              ]}
            />
          </Col>

          <Col xs={24} md={8}>
            <RangePicker
              style={{
                width: "100%",
              }}
              value={dateRange}
              onChange={setDateRange}
              format="DD-MMM-YYYY"
            />
          </Col>

          <Col xs={24} md={4}>
            <Button block type="primary" onClick={loadRecords}>
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
          rowKey="id"
          loading={loading}
          dataSource={records}
          columns={columns}
          scroll={{
            x: 1700,
          }}
          pagination={{
            pageSize: 20,

            showSizeChanger: true,
          }}
        />
      </Card>

      {/* DROP DRAWER */}

      <Drawer
        title={editingRecord ? "Edit Training Drop" : "Drop Trainee"}
        width={680}
        open={drawerOpen}
        onClose={() => {
          setDrawerOpen(false);

          setEditingRecord(null);

          setSelectedTrainee(null);

          dropForm.resetFields();
        }}
        extra={
          <Button type="primary" loading={saving} onClick={saveDrop}>
            {editingRecord ? "Update Drop" : "Save Drop"}
          </Button>
        }
      >
        <Alert
          type="info"
          showIcon
          style={{
            marginBottom: 16,
          }}
          message="Select exact Course record"
          description="Same Employee ID multiple Courses mein ho sakti hai. Correct Course aur Course dates dekh kar trainee select karein."
        />

        <Form form={dropForm} layout="vertical">
          <Form.Item
            name="trainee_id"
            label="Trainee"
            rules={[
              {
                required: true,

                message: "Please select trainee.",
              },
            ]}
          >
            <Select
              showSearch
              filterOption={false}
              onSearch={searchTrainees}
              onChange={(value, option) => {
                setSelectedTrainee(option?.item || null);

                dropForm.setFieldValue("trainee_id", value);
              }}
              options={traineeOptions}
              placeholder="Type Employee ID or Name"
              disabled={Boolean(editingRecord)}
              notFoundContent="Type Employee ID or Name to search"
            />
          </Form.Item>

          {selectedTrainee && (
            <Card
              size="small"
              style={{
                marginBottom: 18,
              }}
            >
              <Descriptions bordered size="small" column={1}>
                <Descriptions.Item label="Employee ID">
                  {selectedTrainee.employee_id}
                </Descriptions.Item>

                <Descriptions.Item label="Course">
                  {selectedTrainee.course_name || "-"}
                </Descriptions.Item>

                <Descriptions.Item label="Platoon">
                  {selectedTrainee.platoon_number
                    ? `Platoon ${selectedTrainee.platoon_number}`
                    : "-"}
                </Descriptions.Item>

                <Descriptions.Item label="Course Start">
                  {formatDate(selectedTrainee.course_start_date)}
                </Descriptions.Item>

                <Descriptions.Item label="Course End">
                  {formatDate(selectedTrainee.course_end_date)}
                </Descriptions.Item>

                {selectedTrainee.course_status && (
                  <Descriptions.Item label="Current Course Status">
                    <Tag
                      color={courseStatusColor(selectedTrainee.course_status)}
                    >
                      {selectedTrainee.course_status}
                    </Tag>
                  </Descriptions.Item>
                )}
              </Descriptions>
            </Card>
          )}

          <Form.Item
            name="drop_datetime"
            label="Drop Date & Time"
            rules={[
              {
                required: true,

                message: "Drop Date & Time is required.",
              },
            ]}
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

          <Form.Item
            name="reason"
            label="Drop Reason"
            rules={[
              {
                required: true,

                message: "Drop Reason is required.",
              },
            ]}
          >
            <Input.TextArea rows={3} />
          </Form.Item>

          <Form.Item name="order_reference" label="Order Reference">
            <Input />
          </Form.Item>

          <Form.Item name="remarks" label="Remarks">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Drawer>

      {/* REJOIN */}

      <Modal
        title="Rejoin Trainee"
        open={rejoinOpen}
        onCancel={() => {
          setRejoinOpen(false);

          rejoinForm.resetFields();
        }}
        onOk={saveRejoin}
        confirmLoading={saving}
        okText="Rejoin"
      >
        {selectedRecord && (
          <Alert
            type="info"
            showIcon
            style={{
              marginBottom: 16,
            }}
            message={`${selectedRecord.employee_id} — ${selectedRecord.trainee_name}`}
            description={
              selectedRecord.course_start_date && selectedRecord.course_end_date
                ? `${selectedRecord.course_name || "Course"} | ${formatDate(
                    selectedRecord.course_start_date,
                  )} → ${formatDate(selectedRecord.course_end_date)}`
                : selectedRecord.course_name || "Course dates not set"
            }
          />
        )}

        <Form form={rejoinForm} layout="vertical">
          <Form.Item
            name="rejoin_datetime"
            label="Rejoin Date & Time"
            rules={[
              {
                required: true,

                message: "Rejoin Date & Time is required.",
              },
            ]}
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

          <Form.Item name="rejoin_reason" label="Rejoin Reason">
            <Input.TextArea rows={3} />
          </Form.Item>

          <Form.Item
            name="rejoin_order_reference"
            label="Rejoin Order Reference"
          >
            <Input />
          </Form.Item>
        </Form>
      </Modal>

      {/* VIEW */}

      <Drawer
        title="Training Drop Details"
        width={680}
        open={viewOpen}
        onClose={() => setViewOpen(false)}
      >
        {selectedRecord && (
          <Descriptions bordered column={1} size="small">
            <Descriptions.Item label="Employee ID">
              {selectedRecord.employee_id}
            </Descriptions.Item>

            <Descriptions.Item label="Name">
              {selectedRecord.trainee_name}
            </Descriptions.Item>

            <Descriptions.Item label="Course">
              {selectedRecord.course_name || "-"}
            </Descriptions.Item>

            <Descriptions.Item label="Platoon">
              {selectedRecord.platoon_number
                ? `Platoon ${selectedRecord.platoon_number}`
                : "-"}
            </Descriptions.Item>

            <Descriptions.Item label="Course Period">
              {selectedRecord.course_start_date &&
              selectedRecord.course_end_date
                ? `${formatDate(
                    selectedRecord.course_start_date,
                  )} → ${formatDate(selectedRecord.course_end_date)}`
                : "Dates Not Set"}
            </Descriptions.Item>

            <Descriptions.Item label="Drop Date">
              {formatDateTime(selectedRecord.drop_datetime)}
            </Descriptions.Item>

            <Descriptions.Item label="Drop Reason">
              {selectedRecord.reason || "-"}
            </Descriptions.Item>

            <Descriptions.Item label="Drop Order">
              {selectedRecord.order_reference || "-"}
            </Descriptions.Item>

            <Descriptions.Item label="Status">
              <Tag color={statusColor(selectedRecord.drop_status)}>
                {selectedRecord.drop_status}
              </Tag>
            </Descriptions.Item>

            <Descriptions.Item label="Authorized By">
              {selectedRecord.authorized_by_name || "-"}
            </Descriptions.Item>

            <Descriptions.Item label="Rejoin Date">
              {formatDateTime(selectedRecord.rejoin_datetime)}
            </Descriptions.Item>

            <Descriptions.Item label="Rejoin Reason">
              {selectedRecord.rejoin_reason || "-"}
            </Descriptions.Item>

            <Descriptions.Item label="Rejoin Order">
              {selectedRecord.rejoin_order_reference || "-"}
            </Descriptions.Item>

            <Descriptions.Item label="Rejoined By">
              {selectedRecord.rejoined_by_name || "-"}
            </Descriptions.Item>

            <Descriptions.Item label="Cancelled By">
              {selectedRecord.cancelled_by_name || "-"}
            </Descriptions.Item>

            <Descriptions.Item label="Cancellation Reason">
              {selectedRecord.cancellation_reason || "-"}
            </Descriptions.Item>

            <Descriptions.Item label="Remarks">
              {selectedRecord.remarks || "-"}
            </Descriptions.Item>
          </Descriptions>
        )}
      </Drawer>
    </div>
  );
}
