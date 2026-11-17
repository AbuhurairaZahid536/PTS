import { useEffect, useMemo, useState } from "react";

import {
  Alert,
  Button,
  Card,
  Checkbox,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Tag,
  Typography,
  message,
} from "antd";
import Table from "../components/SerialTable";

import {
  DeleteOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  WarningOutlined,
} from "@ant-design/icons";

import api from "../services/api";

import { useAuth } from "../contexts/AuthContext";

const { Title, Text } = Typography;

export default function Platoons() {
  const [form] = Form.useForm();

  const { hasPermission } = useAuth();

  const canEdit = hasPermission("platoons.edit");

  const canPermanentDelete =
    hasPermission("data_management.manage") ||
    hasPermission("users.manage");

  const [loading, setLoading] = useState(false);

  const [courseLoading, setCourseLoading] = useState(false);

  const [saving, setSaving] = useState(false);

  const [deleting, setDeleting] = useState(false);

  const [platoons, setPlatoons] = useState([]);

  const [courses, setCourses] = useState([]);

  const [search, setSearch] = useState("");

  const [courseId, setCourseId] = useState(null);

  const [currentPage, setCurrentPage] = useState(1);

  const [pageSize, setPageSize] = useState(25);

  const [selectedRowKeys, setSelectedRowKeys] = useState([]);

  const [addOpen, setAddOpen] = useState(false);

  const [confirmOpen, setConfirmOpen] = useState(false);

  const [confirmText, setConfirmText] = useState("");

  const [deleteTrainees, setDeleteTrainees] = useState(false);

  const [deleteRawTransactions, setDeleteRawTransactions] = useState(false);

  const loadCourses = async () => {
    setCourseLoading(true);

    try {
      const response = await api.get("/courses");

      setCourses(response.data?.data || []);
    } catch (error) {
      message.error(error.response?.data?.message || "Could not load courses.");
    } finally {
      setCourseLoading(false);
    }
  };

  const loadPlatoons = async (overrideCourseId = courseId) => {
    setLoading(true);

    try {
      const params = {};

      if (overrideCourseId) {
        params.course_id = overrideCourseId;
      }

      const response = await api.get("/platoons", {
        params,
      });

      setPlatoons(response.data?.data || []);

      setSelectedRowKeys([]);
    } catch (error) {
      message.error(
        error.response?.data?.message || "Could not load platoons.",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCourses();
  }, []);

  useEffect(() => {
    loadPlatoons(courseId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId]);

  const courseOptions = courses.map((course) => ({
    value: course.id,

    label: course.course_name,
  }));

  const filteredPlatoons = useMemo(() => {
    const q = search.trim().toLowerCase();

    if (!q) {
      return platoons;
    }

    return platoons.filter((platoon) =>
      [platoon.platoon_number, platoon.platoon_name]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q)),
    );
  }, [platoons, search]);

  const selectedPlatoons = useMemo(() => {
    const selected = new Set(selectedRowKeys.map(Number));

    return platoons.filter((platoon) => selected.has(Number(platoon.id)));
  }, [platoons, selectedRowKeys]);

  const openAddPlatoon = async () => {
    await loadCourses();

    form.resetFields();

    form.setFieldsValue({
      course_id: courseId || null,
    });

    setAddOpen(true);
  };

  const savePlatoon = async () => {
    try {
      const values = await form.validateFields();

      setSaving(true);

      await api.post("/platoons", {
        course_id: values.course_id,

        platoon_number: String(values.platoon_number).trim(),

        platoon_name: values.platoon_name?.trim() || null,
      });

      message.success("Platoon created successfully.");

      setAddOpen(false);

      form.resetFields();

      await loadPlatoons(courseId);
    } catch (error) {
      if (error?.errorFields) {
        return;
      }

      message.error(
        error.response?.data?.message || "Could not create Platoon.",
      );
    } finally {
      setSaving(false);
    }
  };

  const openBulkDelete = () => {
    if (!selectedRowKeys.length) {
      message.warning("Select at least one platoon.");

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
      for (const platoon of selectedPlatoons) {
        try {
          const response = await api.post(
            `/data-management/platoons/${platoon.id}/permanent-delete`,
            {
              delete_trainees: deleteTrainees,

              delete_raw_transactions: deleteRawTransactions,
            },
          );

          results.push({
            id: platoon.id,

            name: platoon.platoon_number,

            success: true,

            data: response.data?.data,
          });
        } catch (error) {
          results.push({
            id: platoon.id,

            name: platoon.platoon_number,

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
                    message={`Platoon ${item.name || item.id}`}
                    description={item.error}
                  />
                ))}
              </div>
            )}
          </div>
        ),
      });

      await loadPlatoons(courseId);
    } finally {
      setDeleting(false);
    }
  };

  const columns = [
    {
      title: "Course",

      dataIndex: "course_name",

      width: 260,

      render: (value) => value || "-",
    },

    {
      title: "Platoon No.",

      dataIndex: "platoon_number",

      width: 130,

      align: "center",

      render: (value) => <Text strong>{value || "-"}</Text>,
    },

    {
      title: "Platoon Name",

      dataIndex: "platoon_name",

      width: 190,

      render: (value) => value || "-",
    },

    {
      title: "Trainees",

      dataIndex: "trainee_count",

      width: 110,

      align: "center",

      render: (value) => (
        <Tag color={Number(value || 0) > 0 ? "blue" : "default"}>
          {Number(value || 0)}
        </Tag>
      ),
    },

    {
      title: "Active",

      dataIndex: "active_trainee_count",

      width: 100,

      align: "center",

      render: (value) => <Tag color="green">{Number(value || 0)}</Tag>,
    },

    {
      title: "ZKBioTime Position",

      dataIndex: "zkbiotime_position_id",

      width: 160,

      align: "center",

      render: (value) =>
        value ? (
          <Tag color="blue">ID {value}</Tag>
        ) : (
          <Tag color="orange">Not Linked</Tag>
        ),
    },

    {
      title: "Status",

      dataIndex: "is_active",

      width: 100,

      align: "center",

      render: (value) => (
        <Tag color={Number(value) === 1 ? "green" : "default"}>
          {Number(value) === 1 ? "Active" : "Inactive"}
        </Tag>
      ),
    },
  ];

  const resetFilters = () => {
    setSearch("");

    setCourseId(null);

    setSelectedRowKeys([]);

    setCurrentPage(1);
  };

  const selectAllFiltered = () => {
    setSelectedRowKeys(filteredPlatoons.map((item) => item.id));
  };

  return (
    <div>
      <div
        style={{
          display: "flex",

          justifyContent: "space-between",

          alignItems: "center",

          gap: 16,

          marginBottom: 16,
        }}
      >
        <div>
          <Title
            level={3}
            style={{
              margin: 0,
            }}
          >
            Platoons
          </Title>

          <Text type="secondary">
            Course-wise Platoon list, trainee count aur ZKBioTime Position
            mapping.
          </Text>
        </div>

        <Space>
          <Button
            icon={<ReloadOutlined />}
            onClick={() => loadPlatoons(courseId)}
            loading={loading}
          >
            Refresh
          </Button>

          {canEdit && (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={openAddPlatoon}
            >
              Add Platoon
            </Button>
          )}
        </Space>
      </div>

      <Card
        style={{
          marginBottom: 16,
        }}
      >
        <Space wrap>
          <Input
            allowClear
            value={search}
            prefix={<SearchOutlined />}
            placeholder="Search Platoon No. / Name"
            style={{
              width: 260,
            }}
            onChange={(event) => {
              setSearch(event.target.value);

              setCurrentPage(1);
            }}
          />

          <Select
            allowClear
            showSearch
            loading={courseLoading}
            value={courseId}
            options={courseOptions}
            optionFilterProp="label"
            placeholder="Course"
            style={{
              width: 240,
            }}
            onOpenChange={(open) => {
              if (open) {
                loadCourses();
              }
            }}
            onChange={(value) => {
              setCourseId(value ?? null);

              setSelectedRowKeys([]);

              setCurrentPage(1);
            }}
          />

          {canPermanentDelete && (
            <>
              <Button
                disabled={!filteredPlatoons.length}
                onClick={selectAllFiltered}
              >
                Select All Filtered ({filteredPlatoons.length})
              </Button>

              <Button onClick={resetFilters} disabled={!search && !courseId}>
                Reset Filters
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
                Permanent Delete Selected ({selectedRowKeys.length})
              </Button>
            </>
          )}
        </Space>
      </Card>

      <Card>
        <Table
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={filteredPlatoons}
          scroll={{
            x: 1100,
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
            current: currentPage,

            pageSize: pageSize,

            showSizeChanger: true,

            pageSizeOptions: ["10", "25", "50", "100"],

            showTotal: (total) => `Total ${total} platoons`,

            onChange: (page, size) => {
              setCurrentPage(page);

              setPageSize(size);
            },
          }}
        />
      </Card>

      <Modal
        title="Add Platoon"
        open={addOpen}
        onCancel={() => setAddOpen(false)}
        onOk={savePlatoon}
        confirmLoading={saving}
        okText="Create Platoon"
        destroyOnHidden
      >
        <Alert
          type="info"
          showIcon
          style={{
            marginBottom: 16,
          }}
          message="Platoon Number selected Course ke andar unique hoga."
        />

        <Form form={form} layout="vertical">
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
              loading={courseLoading}
              options={courseOptions}
              optionFilterProp="label"
              placeholder="Select Course"
            />
          </Form.Item>

          <Form.Item
            name="platoon_number"
            label="Platoon Number"
            rules={[
              {
                required: true,

                message: "Platoon Number is required.",
              },
            ]}
          >
            <Input placeholder="e.g. 1" />
          </Form.Item>

          <Form.Item name="platoon_name" label="Platoon Name">
            <Input placeholder="Optional" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Permanent Platoon Delete"
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
          message={`${selectedRowKeys.length} platoon(s) selected`}
          description="Agar selected platoon mein trainees hain aur Delete trainees select nahi kiya to backend deletion rok dega."
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
            Selected Platoons ke tamam Trainees bhi permanently delete karein
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
