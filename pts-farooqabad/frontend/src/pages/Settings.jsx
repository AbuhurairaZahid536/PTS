import { useCallback, useEffect, useState } from "react";

import {
  Alert,
  Button,
  Card,
  Col,
  Form,
  InputNumber,
  Modal,
  Select,
  Tag,
  Result,
  Row,
  Space,
  Spin,
  Typography,
  message,
} from "antd";
import Table from "../components/SerialTable";

import {
  PlusOutlined,
  ReloadOutlined,
  SaveOutlined,
  SettingOutlined,
  UndoOutlined,
} from "@ant-design/icons";

import api from "../services/api";

import { useAuth } from "../contexts/AuthContext";

const { Title, Text, Paragraph } = Typography;

function InputNumberWithUnit({ unit, value, onChange, ...inputProps }) {
  return (
    <Space.Compact
      block
      style={{
        width: "100%",
      }}
    >
      <InputNumber
        {...inputProps}
        value={value}
        onChange={onChange}
        style={{
          flex: 1,
          width: "100%",
        }}
      />

      <Button
        disabled
        tabIndex={-1}
        style={{
          minWidth: 88,
          pointerEvents: "none",
        }}
      >
        {unit}
      </Button>
    </Space.Compact>
  );
}

const DEFAULT_VALUES = {
  idle_logout_minutes: 5,

  biometric_auto_sync_seconds: 10,

  dashboard_refresh_seconds: 60,

  general_statement_refresh_seconds: 60,
};

function normalizeSettings(data) {
  return {
    idle_logout_minutes: Number(
      data?.idle_logout_minutes ?? DEFAULT_VALUES.idle_logout_minutes,
    ),

    biometric_auto_sync_seconds: Number(
      data?.biometric_auto_sync_seconds ??
        DEFAULT_VALUES.biometric_auto_sync_seconds,
    ),

    dashboard_refresh_seconds: Number(
      data?.dashboard_refresh_seconds ??
        DEFAULT_VALUES.dashboard_refresh_seconds,
    ),

    general_statement_refresh_seconds: Number(
      data?.general_statement_refresh_seconds ??
        DEFAULT_VALUES.general_statement_refresh_seconds,
    ),
  };
}

export default function Settings() {
  const [form] = Form.useForm();

  const [leaveCapForm] = Form.useForm();

  const { hasPermission } = useAuth();

  const [loading, setLoading] = useState(false);

  const [saving, setSaving] = useState(false);

  const [defaults, setDefaults] = useState(DEFAULT_VALUES);

  const [courses, setCourses] = useState([]);

  const [coursesLoading, setCoursesLoading] = useState(false);

  const [leaveCapModalOpen, setLeaveCapModalOpen] = useState(false);

  const [leaveCaps, setLeaveCaps] = useState([]);

  const [leaveCapsLoading, setLeaveCapsLoading] = useState(false);

  const [leaveCapSaving, setLeaveCapSaving] = useState(false);

  const [editingLeaveCap, setEditingLeaveCap] = useState(null);

  const canView =
    hasPermission("settings.view") ||
    hasPermission("settings.manage");

  const canManage = hasPermission("settings.manage");

  /*
  |--------------------------------------------------------------------------
  | LOAD SETTINGS
  |--------------------------------------------------------------------------
  */

  const loadSettings = useCallback(async () => {
    if (!canView) {
      return;
    }

    setLoading(true);

    try {
      const response = await api.get("/settings");

      const data = normalizeSettings(response.data?.data);

      const defaultData = normalizeSettings(
        response.data?.defaults || DEFAULT_VALUES,
      );

      setDefaults(defaultData);

      form.setFieldsValue(data);
    } catch (error) {
      message.error(
        error.response?.data?.message || "Could not load system settings.",
      );
    } finally {
      setLoading(false);
    }
  }, [canView, form]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  /*
  |--------------------------------------------------------------------------
  | SAVE
  |--------------------------------------------------------------------------
  */

  const saveSettings = async (values) => {
    setSaving(true);

    try {
      const payload = normalizeSettings(values);

      const response = await api.put("/settings", payload);

      const updated = normalizeSettings(response.data?.data);

      form.setFieldsValue(updated);

      /*
        |--------------------------------------------------------------------------
        | UPDATE RUNNING APP IMMEDIATELY
        |--------------------------------------------------------------------------
        */

      window.dispatchEvent(
        new CustomEvent("pts-runtime-settings-updated", {
          detail: updated,
        }),
      );

      message.success(
        response.data?.message || "System settings updated successfully.",
      );
    } catch (error) {
      message.error(
        error.response?.data?.message || "Could not update system settings.",
      );
    } finally {
      setSaving(false);
    }
  };

  /*
  |--------------------------------------------------------------------------
  | LOAD DEFAULTS INTO FORM
  |--------------------------------------------------------------------------
  */

  const loadDefaults = () => {
    form.setFieldsValue(defaults);

    message.info("Default values loaded. Click Save Settings to apply them.");
  };

  /*
  |--------------------------------------------------------------------------
  | COURSE-WISE APPROVED LEAVE CAPS
  |--------------------------------------------------------------------------
  */

  const loadCourses = useCallback(async () => {
    setCoursesLoading(true);

    try {
      const response = await api.get("/courses");

      setCourses(Array.isArray(response.data?.data) ? response.data.data : []);
    } catch (error) {
      message.error(
        error.response?.data?.message ||
          error.response?.data?.error?.message ||
          "Could not load Courses for Leave Cap.",
      );
    } finally {
      setCoursesLoading(false);
    }
  }, []);

  const loadLeaveCaps = useCallback(async () => {
    if (!canView) {
      return;
    }

    setLeaveCapsLoading(true);

    try {
      const response = await api.get("/settings/leave-caps");

      setLeaveCaps(
        Array.isArray(response.data?.data) ? response.data.data : [],
      );
    } catch (error) {
      message.error(
        error.response?.data?.message ||
          error.response?.data?.error?.message ||
          "Could not load Course Leave Caps.",
      );
    } finally {
      setLeaveCapsLoading(false);
    }
  }, [canView]);

  useEffect(() => {
    loadLeaveCaps();
  }, [loadLeaveCaps]);

  const openLeaveCapModal = async () => {
    setEditingLeaveCap(null);

    leaveCapForm.resetFields();

    setLeaveCapModalOpen(true);

    if (!courses.length) {
      await loadCourses();
    }
  };

  const openEditLeaveCap = async (record) => {
    setEditingLeaveCap(record);

    if (!courses.length) {
      await loadCourses();
    }

    leaveCapForm.setFieldsValue({
      course_id: Number(record.course_id),

      max_approved_leaves: Number(record.max_approved_leaves),
    });

    setLeaveCapModalOpen(true);
  };

  const saveLeaveCap = async () => {
    try {
      const values = await leaveCapForm.validateFields();

      setLeaveCapSaving(true);

      const courseId = Number(values.course_id);

      const response = await api.put(`/settings/leave-caps/${courseId}`, {
        max_approved_leaves: Number(values.max_approved_leaves),
      });

      message.success(
        response.data?.message || "Course Leave Cap saved successfully.",
      );

      setLeaveCapModalOpen(false);

      setEditingLeaveCap(null);

      leaveCapForm.resetFields();

      await loadLeaveCaps();
    } catch (error) {
      if (error?.errorFields) {
        return;
      }

      message.error(
        error.response?.data?.message ||
          error.response?.data?.error?.message ||
          "Could not save Course Leave Cap.",
      );
    } finally {
      setLeaveCapSaving(false);
    }
  };

  const deleteLeaveCap = (record) => {
    Modal.confirm({
      title: "Remove Leave Cap?",

      content: `Remove the approved Leave limit for ${record.course_name}?`,

      okText: "Remove",

      okButtonProps: {
        danger: true,
      },

      onOk: async () => {
        try {
          const response = await api.delete(
            `/settings/leave-caps/${record.course_id}`,
          );

          message.success(
            response.data?.message || "Course Leave Cap removed successfully.",
          );

          await loadLeaveCaps();
        } catch (error) {
          message.error(
            error.response?.data?.message ||
              error.response?.data?.error?.message ||
              "Could not remove Course Leave Cap.",
          );
        }
      },
    });
  };

  const leaveCapColumns = [
    {
      title: "Course",

      dataIndex: "course_name",

      key: "course_name",
    },

    {
      title: "Maximum Approved Leaves",

      dataIndex: "max_approved_leaves",

      key: "max_approved_leaves",

      width: 220,

      align: "center",
    },

    {
      title: "Status",

      key: "status",

      width: 120,

      align: "center",

      render: () => <Tag color="green">Active</Tag>,
    },

    {
      title: "Actions",

      key: "actions",

      width: 170,

      align: "center",

      render: (_, record) =>
        canManage ? (
          <Space>
            <Button size="small" onClick={() => openEditLeaveCap(record)}>
              Edit
            </Button>

            <Button size="small" danger onClick={() => deleteLeaveCap(record)}>
              Delete
            </Button>
          </Space>
        ) : (
          "-"
        ),
    },
  ];

  /*
  |--------------------------------------------------------------------------
  | PERMISSION
  |--------------------------------------------------------------------------
  */

  if (!canView) {
    return (
      <Result
        status="403"
        title="Access Denied"
        subTitle="You do not have permission to view system settings."
      />
    );
  }

  return (
    <div>
      <Space
        align="center"
        style={{
          marginBottom: 18,
        }}
      >
        <SettingOutlined
          style={{
            fontSize: 24,
          }}
        />

        <div>
          <Title
            level={3}
            style={{
              margin: 0,
            }}
          >
            System Settings
          </Title>

          <Text type="secondary">
            Runtime behavior and automatic refresh intervals
          </Text>
        </div>
      </Space>

      <Alert
        type="info"
        showIcon
        style={{
          marginBottom: 18,
        }}
        message="Runtime Settings"
        description="Changes take effect immediately for the current portal session and will also apply after future logins. Every saved change is recorded in the central Audit Log."
      />

      <Spin spinning={loading}>
        <Form
          form={form}
          layout="vertical"
          initialValues={DEFAULT_VALUES}
          onFinish={saveSettings}
          disabled={!canManage}
        >
          <Row gutter={[16, 16]}>
            <Col xs={24} xl={12}>
              <Card title="Session Security">
                <Form.Item
                  name="idle_logout_minutes"
                  label="Idle Logout"
                  rules={[
                    {
                      required: true,

                      message: "Idle Logout is required.",
                    },
                  ]}
                  extra="Automatically signs out an inactive logged-in user."
                >
                  <InputNumberWithUnit
                    min={1}
                    max={240}
                    precision={0}
                    unit="minutes"
                  />
                </Form.Item>

                <Paragraph
                  type="secondary"
                  style={{
                    marginBottom: 0,
                  }}
                >
                  Recommended default: 5 minutes.
                </Paragraph>
              </Card>
            </Col>

            <Col xs={24} xl={12}>
              <Card title="Biometric Synchronization">
                <Form.Item
                  name="biometric_auto_sync_seconds"
                  label="Biometric Auto Sync"
                  rules={[
                    {
                      required: true,

                      message: "Biometric Auto Sync interval is required.",
                    },
                  ]}
                  extra="Controls how often current-date ZKBioTime transactions are automatically synchronized while the user remains logged in."
                >
                  <InputNumberWithUnit
                    min={5}
                    max={300}
                    precision={0}
                    unit="seconds"
                  />
                </Form.Item>

                <Paragraph
                  type="secondary"
                  style={{
                    marginBottom: 0,
                  }}
                >
                  Recommended default: 10 seconds.
                </Paragraph>
              </Card>
            </Col>

            <Col xs={24} xl={12}>
              <Card title="Dashboard">
                <Form.Item
                  name="dashboard_refresh_seconds"
                  label="Dashboard Auto Refresh"
                  rules={[
                    {
                      required: true,

                      message: "Dashboard Refresh interval is required.",
                    },
                  ]}
                  extra="Refreshes Dashboard data while the Dashboard page is open."
                >
                  <InputNumberWithUnit
                    min={60}
                    max={600}
                    precision={0}
                    unit="seconds"
                  />
                </Form.Item>

                <Paragraph
                  type="secondary"
                  style={{
                    marginBottom: 0,
                  }}
                >
                  Recommended default: 60 seconds.
                </Paragraph>
              </Card>
            </Col>

            <Col xs={24} xl={12}>
              <Card title="General Statement">
                <Form.Item
                  name="general_statement_refresh_seconds"
                  label="General Statement Refresh"
                  rules={[
                    {
                      required: true,

                      message:
                        "General Statement Refresh interval is required.",
                    },
                  ]}
                  extra="Controls how often the list of currently relevant General Statement courses is refreshed."
                >
                  <InputNumberWithUnit
                    min={10}
                    max={3600}
                    precision={0}
                    unit="seconds"
                  />
                </Form.Item>

                <Paragraph
                  type="secondary"
                  style={{
                    marginBottom: 0,
                  }}
                >
                  Recommended default: 60 seconds.
                </Paragraph>
              </Card>
            </Col>
          </Row>

          <Card
            title="Leave Management"
            style={{
              marginTop: 18,
            }}
            extra={
              canManage ? (
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={openLeaveCapModal}
                >
                  Add Leave Cap
                </Button>
              ) : null
            }
          >
            <Text type="secondary">
              Course-wise maximum approved Leave limit. This limit will apply
              individually to every trainee of the selected Course.
            </Text>

            <Table
              style={{
                marginTop: 16,
              }}
              rowKey="course_id"
              size="small"
              columns={leaveCapColumns}
              dataSource={leaveCaps}
              loading={leaveCapsLoading}
              pagination={false}
              locale={{
                emptyText: "No Course Leave Cap configured.",
              }}
            />
          </Card>

          <Card
            style={{
              marginTop: 18,
            }}
          >
            <Space wrap>
              {canManage && (
                <Button
                  type="primary"
                  htmlType="submit"
                  icon={<SaveOutlined />}
                  loading={saving}
                >
                  Save Settings
                </Button>
              )}

              <Button
                icon={<ReloadOutlined />}
                onClick={loadSettings}
                disabled={saving}
              >
                Reload Saved Values
              </Button>

              {canManage && (
                <Button
                  icon={<UndoOutlined />}
                  onClick={loadDefaults}
                  disabled={saving}
                >
                  Load Defaults
                </Button>
              )}
            </Space>
          </Card>
        </Form>
      </Spin>

      <Modal
        title={editingLeaveCap ? "Edit Leave Cap" : "Add Leave Cap"}
        open={leaveCapModalOpen}
        onCancel={() => {
          setLeaveCapModalOpen(false);

          setEditingLeaveCap(null);

          leaveCapForm.resetFields();
        }}
        onOk={saveLeaveCap}
        okText="Save Leave Cap"
        confirmLoading={leaveCapSaving}
        width={560}
        destroyOnHidden
      >
        <Alert
          type="info"
          showIcon
          style={{
            marginBottom: 16,
          }}
          message="Course Leave Cap"
          description="This approved Leave limit applies individually to each trainee of the selected Course. Staff Leave is not affected."
        />

        <Form form={leaveCapForm} layout="vertical">
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
              loading={coursesLoading}
              optionFilterProp="label"
              placeholder="Select Course"
              disabled={Boolean(editingLeaveCap)}
              options={courses.map((course) => ({
                value: course.id,

                label: course.course_name,
              }))}
            />
          </Form.Item>

          <Form.Item
            name="max_approved_leaves"
            label="Maximum Approved Leaves"
            rules={[
              {
                required: true,

                message: "Maximum Approved Leaves is required.",
              },
            ]}
          >
            <InputNumber
              min={0}
              precision={0}
              style={{
                width: "100%",
              }}
              placeholder="e.g. 10"
            />
          </Form.Item>

          <Text type="secondary">
            Example: if the cap is 10, every trainee in this Course can have a
            maximum of 10 approved Leave records for that Course.
          </Text>
        </Form>
      </Modal>
    </div>
  );
}
