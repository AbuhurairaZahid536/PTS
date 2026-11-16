import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Col,
  DatePicker,
  Empty,
  Form,
  Input,
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
  SaveOutlined,
  StopOutlined,
  TeamOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import api from "../services/api";

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;


const WEEKDAY_OPTIONS = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 7, label: "Sun" },
];

const DUTY_PATTERN_OPTIONS = [
  { value: "DAILY", label: "Every Day" },
  { value: "WEEKDAYS", label: "Selected Weekdays" },
  { value: "SELECTED_DATES", label: "Selected Dates" },
];

function normalizeWeekdays(value) {
  const raw = Array.isArray(value)
    ? value
    : String(value || "")
        .split(",")
        .filter(Boolean);

  return Array.from(
    new Set(
      raw
        .map(Number)
        .filter((day) => Number.isInteger(day) && day >= 1 && day <= 7),
    ),
  ).sort((a, b) => a - b);
}

function normalizeDateList(value) {
  return Array.from(
    new Set(
      (Array.isArray(value) ? value : [])
        .map((item) => {
          const parsed = dayjs(item);
          return parsed.isValid() ? parsed.format("YYYY-MM-DD") : null;
        })
        .filter(Boolean),
    ),
  ).sort();
}

function dutyPatternHelp(item) {
  const type = String(item?.schedule_type || "DAILY").toUpperCase();

  if (type === "WEEKDAYS") {
    const labels = WEEKDAY_OPTIONS
      .filter((option) => (item?.weekdays || []).includes(option.value))
      .map((option) => option.label);

    return labels.length
      ? `Duty: ${labels.join(", ")} • Other days: Duty Rest`
      : "Select duty weekdays. Other days will be Duty Rest.";
  }

  if (type === "SELECTED_DATES") {
    const count = (item?.duty_dates || []).length;
    return count
      ? `${count} duty date${count === 1 ? "" : "s"} selected • Other dates: Duty Rest`
      : "Select duty dates. Other dates will be Duty Rest.";
  }

  return "Duty on every effective date.";
}

function clean(value) {
  return String(value ?? "").trim();
}

function fullName(item) {
  return [item?.first_name, item?.last_name].filter(Boolean).join(" ") || "-";
}

function timeValue(value) {
  if (!value) return null;
  if (dayjs.isDayjs(value)) return value;

  const text = clean(value);
  const parsed = /^\d{1,2}:\d{2}/.test(text)
    ? dayjs(`2000-01-01 ${text}`)
    : dayjs(value);

  return parsed.isValid() ? parsed : null;
}

function displayTime(value) {
  const parsed = timeValue(value);
  return parsed ? parsed.format("hh:mm A") : "-";
}

function dateText(value) {
  const parsed = dayjs(value);
  return parsed.isValid() ? parsed.format("DD-MMM-YYYY") : "-";
}

function localKey(prefix = "row") {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function emptyShift() {
  return {
    local_id: localKey("shift"),
    id: null,
    shift_name: "",
    duty_point_name: "",
    start_time: null,
    end_time: null,
    start_punch_from: null,
    start_punch_to: null,
    end_punch_from: null,
    end_punch_to: null,
    assignments: [],
  };
}

function normalizeAssignment(item) {
  return {
    ...item,
    local_id: item.local_id || localKey("assignment"),
    staff_id: Number(item.staff_id),
    effective_from: item.effective_from || null,
    effective_to: item.effective_to || null,
    schedule_type: String(item.schedule_type || "DAILY").toUpperCase(),
    weekdays: normalizeWeekdays(item.weekdays ?? item.weekdays_csv),
    duty_dates: normalizeDateList(item.duty_dates),
    rest_dates: normalizeDateList(item.rest_dates),
    staff_name: item.staff_name || fullName(item),
  };
}

function normalizeShift(item) {
  return {
    ...item,
    local_id: item.local_id || localKey("shift"),
    start_time: timeValue(item.start_time),
    end_time: timeValue(item.end_time),
    start_punch_from: timeValue(item.start_punch_from),
    start_punch_to: timeValue(item.start_punch_to),
    end_punch_from: timeValue(item.end_punch_from),
    end_punch_to: timeValue(item.end_punch_to),
    assignments: Array.isArray(item.assignments)
      ? item.assignments.map(normalizeAssignment)
      : [],
  };
}

function groupStatus(record) {
  if (!record?.is_active) {
    return { label: "INACTIVE", color: "default" };
  }

  const today = dayjs().startOf("day");
  const start = dayjs(record.start_date).startOf("day");
  const end = dayjs(record.end_date).endOf("day");

  if (start.isValid() && today.isBefore(start)) {
    return { label: "UPCOMING", color: "blue" };
  }

  if (end.isValid() && today.isAfter(end)) {
    return { label: "COMPLETED", color: "default" };
  }

  return { label: "ACTIVE", color: "green" };
}

export default function CustomShiftDutyTab({ canManage }) {
  const [groupForm] = Form.useForm();

  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [shifts, setShifts] = useState([]);
  const [search, setSearch] = useState("");
  const [activeOn, setActiveOn] = useState(null);
  const [staffOptions, setStaffOptions] = useState({});
  const [staffSearching, setStaffSearching] = useState({});
  const staffSearchSeqRef = useRef({});

  const filteredGroups = useMemo(() => {
    const q = clean(search).toLowerCase();

    return groups.filter((record) => {
      if (activeOn) {
        const selected = activeOn.startOf("day").valueOf();
        const start = dayjs(record.start_date).startOf("day").valueOf();
        const end = dayjs(record.end_date).endOf("day").valueOf();

        if (selected < start || selected > end) {
          return false;
        }
      }

      if (!q) return true;

      return [record.group_name, record.description]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q));
    });
  }, [groups, search, activeOn]);

  const loadGroups = async () => {
    setLoading(true);

    try {
      const response = await api.get("/custom-shifts");
      setGroups(Array.isArray(response.data?.data) ? response.data.data : []);
    } catch (error) {
      message.error(
        error.response?.data?.message || "Could not load Custom Shift Duty groups.",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadGroups();
  }, []);

  const openNew = () => {
    setEditingId(null);
    groupForm.resetFields();
    groupForm.setFieldsValue({ is_active: true });
    setShifts([emptyShift()]);
    setStaffOptions({});
    setBuilderOpen(true);
  };

  const openEdit = async (record) => {
    try {
      setLoading(true);
      const response = await api.get(`/custom-shifts/${record.id}`);
      const fresh = response.data?.data || record;

      setEditingId(Number(fresh.id));
      groupForm.setFieldsValue({
        group_name: fresh.group_name || "",
        date_range:
          fresh.start_date && fresh.end_date
            ? [dayjs(fresh.start_date), dayjs(fresh.end_date)]
            : null,
        description: fresh.description || "",
        is_active: Boolean(fresh.is_active),
      });
      setShifts(
        Array.isArray(fresh.shifts) && fresh.shifts.length
          ? fresh.shifts.map(normalizeShift)
          : [emptyShift()],
      );
      setStaffOptions({});
      setBuilderOpen(true);
    } catch (error) {
      message.error(
        error.response?.data?.message || "Could not open Custom Shift Duty group.",
      );
    } finally {
      setLoading(false);
    }
  };

  const closeBuilder = () => {
    setBuilderOpen(false);
    setEditingId(null);
    setShifts([]);
    setStaffOptions({});
    groupForm.resetFields();
  };

  const updateShift = (shiftKey, patch) => {
    setShifts((old) =>
      old.map((item) =>
        item.local_id === shiftKey ? { ...item, ...patch } : item,
      ),
    );
  };

  const removeShift = (shiftKey) => {
    setShifts((old) => old.filter((item) => item.local_id !== shiftKey));
  };

  const searchStaff = async (shiftKey, query) => {
    const q = clean(query);

    const nextSeq = Number(staffSearchSeqRef.current[shiftKey] || 0) + 1;
    staffSearchSeqRef.current[shiftKey] = nextSeq;

    if (!q) {
      setStaffOptions((old) => ({ ...old, [shiftKey]: [] }));
      setStaffSearching((old) => ({ ...old, [shiftKey]: false }));
      return;
    }

    setStaffSearching((old) => ({ ...old, [shiftKey]: true }));

    try {
      const response = await api.get("/leaves/subjects/search", {
        params: {
          subject_type: "STAFF",
          search: q,
          assignment_search: 1,
        },
      });

      if (staffSearchSeqRef.current[shiftKey] !== nextSeq) {
        return;
      }

      const rows = Array.isArray(response.data?.data) ? response.data.data : [];

      setStaffOptions((old) => ({
        ...old,
        [shiftKey]: rows.map((item) => ({
          value: Number(item.subject_id || item.id),
          label: [
            fullName(item),
            item.belt_no || "No Belt No.",
            item.category_name || "Uncategorized",
          ]
            .filter(Boolean)
            .join(" • "),
          raw: {
            staff_id: Number(item.subject_id || item.id),
            employee_id: item.employee_id || "",
            belt_no: item.belt_no || "",
            first_name: item.first_name || "",
            last_name: item.last_name || "",
            staff_name: fullName(item),
            designation: item.designation || "",
            category_id: item.category_id || null,
            category_name: item.category_name || "",
            branch_id: item.branch_id || null,
            branch_name: item.branch_name || "",
          },
        })),
      }));
    } catch (error) {
      if (staffSearchSeqRef.current[shiftKey] === nextSeq) {
        message.error(error.response?.data?.message || "Could not search Staff.");
      }
    } finally {
      if (staffSearchSeqRef.current[shiftKey] === nextSeq) {
        setStaffSearching((old) => ({ ...old, [shiftKey]: false }));
      }
    }
  };

  const addStaff = (shiftKey, staffId) => {
    const option = (staffOptions[shiftKey] || []).find(
      (item) => Number(item.value) === Number(staffId),
    );

    if (!option?.raw) return;

    const dateRange = groupForm.getFieldValue("date_range");
    const effectiveFrom = dateRange?.[0]?.format("YYYY-MM-DD") || null;
    const effectiveTo = dateRange?.[1]?.format("YYYY-MM-DD") || null;

    setShifts((old) =>
      old.map((shift) => {
        if (shift.local_id !== shiftKey) return shift;

        const sameFullRange = (shift.assignments || []).some(
          (item) =>
            Number(item.staff_id) === Number(staffId) &&
            item.effective_from === effectiveFrom &&
            item.effective_to === effectiveTo,
        );

        if (sameFullRange) {
          message.warning("This Staff member is already assigned to this Shift.");
          return shift;
        }

        return {
          ...shift,
          assignments: [
            ...(shift.assignments || []),
            {
              ...option.raw,
              local_id: localKey("assignment"),
              effective_from: effectiveFrom,
              effective_to: effectiveTo,
              schedule_type: "DAILY",
              weekdays: [],
              duty_dates: [],
              rest_dates: [],
            },
          ],
        };
      }),
    );
  };

  const updateAssignmentRange = (shiftKey, assignmentKey, value) => {
    setShifts((old) =>
      old.map((shift) => {
        if (shift.local_id !== shiftKey) return shift;

        return {
          ...shift,
          assignments: (shift.assignments || []).map((assignment) =>
            assignment.local_id === assignmentKey
              ? {
                  ...assignment,
                  effective_from: value?.[0]?.format("YYYY-MM-DD") || null,
                  effective_to: value?.[1]?.format("YYYY-MM-DD") || null,
                }
              : assignment,
          ),
        };
      }),
    );
  };

  const updateAssignment = (shiftKey, assignmentKey, patch) => {
    setShifts((old) =>
      old.map((shift) => {
        if (shift.local_id !== shiftKey) return shift;

        return {
          ...shift,
          assignments: (shift.assignments || []).map((assignment) =>
            assignment.local_id === assignmentKey
              ? { ...assignment, ...patch }
              : assignment,
          ),
        };
      }),
    );
  };

  const changeAssignmentPattern = (shiftKey, assignmentKey, scheduleType) => {
    updateAssignment(shiftKey, assignmentKey, {
      schedule_type: scheduleType,
      weekdays: scheduleType === "WEEKDAYS" ? [] : [],
      duty_dates: scheduleType === "SELECTED_DATES" ? [] : [],
      rest_dates: [],
    });
  };

  const removeAssignment = (shiftKey, assignmentKey) => {
    setShifts((old) =>
      old.map((shift) =>
        shift.local_id === shiftKey
          ? {
              ...shift,
              assignments: (shift.assignments || []).filter(
                (assignment) => assignment.local_id !== assignmentKey,
              ),
            }
          : shift,
      ),
    );
  };

  const applyGroupRangeToAll = () => {
    const dateRange = groupForm.getFieldValue("date_range");

    if (!dateRange?.[0] || !dateRange?.[1]) {
      message.warning("Select Group Start and End Date first.");
      return;
    }

    const effectiveFrom = dateRange[0].format("YYYY-MM-DD");
    const effectiveTo = dateRange[1].format("YYYY-MM-DD");

    setShifts((old) =>
      old.map((shift) => ({
        ...shift,
        assignments: (shift.assignments || []).map((assignment) => ({
          ...assignment,
          effective_from: effectiveFrom,
          effective_to: effectiveTo,
        })),
      })),
    );

    message.success("Group date range applied to all Staff assignments.");
  };

  const validateClient = (values) => {
    if (!shifts.length) return "Add at least one Custom Shift.";

    for (const shift of shifts) {
      if (!clean(shift.shift_name)) return "Every Shift requires a Shift Name.";

      if (
        !shift.start_time ||
        !shift.end_time ||
        !shift.start_punch_from ||
        !shift.start_punch_to ||
        !shift.end_punch_from ||
        !shift.end_punch_to
      ) {
        return `${clean(shift.shift_name) || "Shift"}: Shift time and all biometric windows are required.`;
      }

      if (!(shift.assignments || []).length) {
        return `${clean(shift.shift_name) || "Shift"}: assign at least one Staff member.`;
      }

      for (const assignment of shift.assignments || []) {
        if (!assignment.effective_from || !assignment.effective_to) {
          return `${clean(shift.shift_name)}: every Staff assignment requires an effective date range.`;
        }

        if (
          assignment.schedule_type === "WEEKDAYS" &&
          !(assignment.weekdays || []).length
        ) {
          return `${clean(shift.shift_name)}: select at least one duty weekday for ${assignment.staff_name || "Staff"}.`;
        }

        if (
          assignment.schedule_type === "SELECTED_DATES" &&
          !(assignment.duty_dates || []).length
        ) {
          return `${clean(shift.shift_name)}: select at least one duty date for ${assignment.staff_name || "Staff"}.`;
        }
      }
    }

    if (!values.date_range?.[0] || !values.date_range?.[1]) {
      return "Group date range is required.";
    }

    return null;
  };

  const saveGroup = async () => {
    try {
      const values = await groupForm.validateFields();
      const validation = validateClient(values);

      if (validation) {
        message.error(validation);
        return;
      }

      const payload = {
        group_name: clean(values.group_name),
        start_date: values.date_range[0].format("YYYY-MM-DD"),
        end_date: values.date_range[1].format("YYYY-MM-DD"),
        description: clean(values.description) || null,
        is_active: Boolean(values.is_active),
        shifts: shifts.map((shift, index) => ({
          id: shift.id || null,
          shift_name: clean(shift.shift_name),
          duty_point_name: clean(shift.duty_point_name) || null,
          start_time: shift.start_time.format("HH:mm:ss"),
          end_time: shift.end_time.format("HH:mm:ss"),
          start_punch_from: shift.start_punch_from.format("HH:mm:ss"),
          start_punch_to: shift.start_punch_to.format("HH:mm:ss"),
          end_punch_from: shift.end_punch_from.format("HH:mm:ss"),
          end_punch_to: shift.end_punch_to.format("HH:mm:ss"),
          sort_order: index,
          assignments: (shift.assignments || []).map((assignment) => ({
            id: assignment.id || null,
            staff_id: Number(assignment.staff_id),
            effective_from: assignment.effective_from,
            effective_to: assignment.effective_to,
            schedule_type: assignment.schedule_type || "DAILY",
            weekdays: assignment.weekdays || [],
            duty_dates: assignment.duty_dates || [],
            rest_dates: assignment.rest_dates || [],
          })),
        })),
      };

      setSaving(true);

      if (editingId) {
        await api.put(`/custom-shifts/${editingId}`, payload);
        message.success("Custom Shift Duty Group updated successfully.");
      } else {
        await api.post("/custom-shifts", payload);
        message.success("Custom Shift Duty Group created successfully.");
      }

      closeBuilder();
      await loadGroups();
    } catch (error) {
      if (error?.errorFields) return;

      message.error(
        error.response?.data?.message || "Could not save Custom Shift Duty Group.",
      );
    } finally {
      setSaving(false);
    }
  };

  const deactivateGroup = (record) => {
    Modal.confirm({
      title: "Deactivate Custom Shift Group?",
      content:
        "The group will stop applying to future attendance. Existing historical records will remain preserved.",
      okText: "Deactivate",
      okType: "danger",
      async onOk() {
        try {
          await api.delete(`/custom-shifts/${record.id}`);
          message.success("Custom Shift Duty Group deactivated.");
          await loadGroups();
        } catch (error) {
          message.error(
            error.response?.data?.message || "Could not deactivate Custom Shift Duty Group.",
          );
        }
      },
    });
  };

  const permanentlyDeleteGroup = (record) => {
    Modal.confirm({
      title: "Delete Custom Shift Group Permanently?",
      width: 540,
      content: (
        <Space direction="vertical" size={5}>
          <Text>
            This will permanently remove the group, its shifts, staff assignments,
            selected duty/rest dates, and any non-finalized attendance rows.
          </Text>
          <Text type="danger" strong>
            This action cannot be undone.
          </Text>
          <Text type="secondary">
            If official biometric or exempt attendance exists, permanent deletion
            will be blocked. You can Deactivate the group instead.
          </Text>
        </Space>
      ),
      okText: "Delete Permanently",
      okType: "danger",
      cancelText: "Cancel",
      async onOk() {
        try {
          await api.delete(`/custom-shifts/${record.id}/permanent`);
          message.success("Custom Shift Duty Group permanently deleted.");
          await loadGroups();
        } catch (error) {
          message.error(
            error.response?.data?.message ||
              "Could not permanently delete Custom Shift Duty Group.",
          );
        }
      },
    });
  };

  const columns = [
    {
      title: "Shift Group",
      dataIndex: "group_name",
      width: 230,
      render: (value, record) => (
        <Space direction="vertical" size={1}>
          <Text strong>{value || "Custom Shift Duty"}</Text>
          <Text type="secondary" style={{ fontSize: 11 }}>
            {record.description || "Date-range based Staff Shift Duty"}
          </Text>
        </Space>
      ),
    },
    {
      title: "Effective Period",
      width: 220,
      render: (_, record) => (
        <Text>
          {dateText(record.start_date)} → {dateText(record.end_date)}
        </Text>
      ),
    },
    {
      title: "Shifts",
      dataIndex: "shift_count",
      width: 100,
      align: "center",
      render: (value) => <Tag>{Number(value || 0)}</Tag>,
    },
    {
      title: "Assigned Staff",
      dataIndex: "staff_count",
      width: 130,
      align: "center",
      render: (value) => <Tag color="blue">{Number(value || 0)}</Tag>,
    },
    {
      title: "Status",
      width: 110,
      render: (_, record) => {
        const status = groupStatus(record);
        return <Tag color={status.color}>{status.label}</Tag>;
      },
    },
    {
      title: "Actions",
      width: 330,
      fixed: "right",
      render: (_, record) => (
        <Space>
          {canManage && (
            <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(record)}>
              Edit
            </Button>
          )}

          {canManage && record.is_active && (
            <Button
              size="small"
              icon={<StopOutlined />}
              onClick={() => deactivateGroup(record)}
            >
              Deactivate
            </Button>
          )}

          {canManage && (
            <Button
              size="small"
              danger
              icon={<DeleteOutlined />}
              onClick={() => permanentlyDeleteGroup(record)}
            >
              Delete
            </Button>
          )}
        </Space>
      ),
    },
  ];

  const expandedRow = (record) => (
    <div style={{ padding: "4px 8px 10px" }}>
      <Table
        size="small"
        rowKey="id"
        pagination={false}
        dataSource={record.shifts || []}
        columns={[
          {
            title: "Shift",
            dataIndex: "shift_name",
            width: 180,
            render: (value) => <Text strong>{value}</Text>,
          },
          {
            title: "Duty Point",
            dataIndex: "duty_point_name",
            width: 180,
            render: (value) => value || "-",
          },
          {
            title: "Duty Time",
            width: 190,
            render: (_, shift) =>
              `${displayTime(shift.start_time)} → ${displayTime(shift.end_time)}`,
          },
          {
            title: "Biometric Windows",
            render: (_, shift) => (
              <Space direction="vertical" size={0}>
                <Text style={{ fontSize: 11 }}>
                  Start: {displayTime(shift.start_punch_from)} → {displayTime(shift.start_punch_to)}
                </Text>
                <Text style={{ fontSize: 11 }}>
                  End: {displayTime(shift.end_punch_from)} → {displayTime(shift.end_punch_to)}
                </Text>
              </Space>
            ),
          },
          {
            title: "Staff",
            dataIndex: "staff_count",
            width: 90,
            align: "center",
          },
        ]}
      />
    </div>
  );

  if (builderOpen) {
    return (
      <div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 16,
            flexWrap: "wrap",
            marginBottom: 16,
          }}
        >
          <div>
            <Title level={4} style={{ margin: 0 }}>
              {editingId ? "Edit Custom Shift Duty" : "Add Custom Shift Duty"}
            </Title>
            <Text type="secondary">
              Configure one effective date range, any number of shifts, biometric windows and Staff assignments.
            </Text>
          </div>

          <Space>
            <Button onClick={closeBuilder}>Cancel</Button>
            <Button
              type="primary"
              icon={<SaveOutlined />}
              loading={saving}
              onClick={saveGroup}
            >
              Save Custom Shift Duty
            </Button>
          </Space>
        </div>

        <Alert
          showIcon
          type="info"
          style={{ marginBottom: 16 }}
          message="Attendance Priority"
          description="Custom Shift members remain under this group for their full effective period. Duty days follow the selected Shift biometric window; non-duty pattern days automatically become Duty Rest and do not return to the Regular Staff Timetable. Security/another actual Shift Duty on a Rest day takes priority."
        />

        <Card style={{ marginBottom: 16 }}>
          <Form form={groupForm} layout="vertical">
            <Row gutter={16}>
              <Col xs={24} lg={8}>
                <Form.Item
                  name="group_name"
                  label="Shift Group Name"
                  rules={[{ required: true, message: "Shift Group Name is required." }]}
                >
                  <Input placeholder="e.g. Telephone Exchange / Dispensary" />
                </Form.Item>
              </Col>

              <Col xs={24} lg={10}>
                <Form.Item
                  name="date_range"
                  label="Effective Date Range"
                  rules={[{ required: true, message: "Effective Date Range is required." }]}
                >
                  <RangePicker format="DD-MMM-YYYY" style={{ width: "100%" }} />
                </Form.Item>
              </Col>

              <Col xs={24} lg={6}>
                <Form.Item
                  name="is_active"
                  label="Group Status"
                  valuePropName="checked"
                  initialValue
                >
                  <Switch checkedChildren="Active" unCheckedChildren="Inactive" />
                </Form.Item>
              </Col>
            </Row>

            <Form.Item name="description" label="Description / Remarks">
              <Input.TextArea
                rows={2}
                placeholder="Optional operational description or instructions"
              />
            </Form.Item>
          </Form>
        </Card>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
            marginBottom: 12,
          }}
        >
          <div>
            <Title level={5} style={{ margin: 0 }}>
              Shift Definitions & Staff Assignments
            </Title>
            <Text type="secondary" style={{ fontSize: 12 }}>
              Cross-midnight and unequal-duration shifts are supported.
            </Text>
          </div>

          <Space wrap>
            <Button onClick={applyGroupRangeToAll}>Apply Group Dates to All Staff</Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setShifts((old) => [...old, emptyShift()])}
            >
              Add Shift
            </Button>
          </Space>
        </div>

        {!shifts.length ? (
          <Card>
            <Empty description="No Custom Shift added yet" />
          </Card>
        ) : (
          <Space direction="vertical" size={16} style={{ width: "100%" }}>
            {shifts.map((shift, shiftIndex) => (
              <Card
                key={shift.local_id}
                title={
                  <Space wrap>
                    <Tag color="blue">Shift {shiftIndex + 1}</Tag>
                    <Text strong>{clean(shift.shift_name) || "New Shift"}</Text>
                    {shift.start_time && shift.end_time && (
                      <Tag>
                        {displayTime(shift.start_time)} → {displayTime(shift.end_time)}
                      </Tag>
                    )}
                  </Space>
                }
                extra={
                  shifts.length > 1 ? (
                    <Button
                      danger
                      size="small"
                      icon={<DeleteOutlined />}
                      onClick={() => removeShift(shift.local_id)}
                    >
                      Remove Shift
                    </Button>
                  ) : null
                }
              >
                <Row gutter={[14, 6]}>
                  <Col xs={24} lg={8}>
                    <Text strong>Shift Name</Text>
                    <Input
                      style={{ marginTop: 6 }}
                      placeholder="e.g. Day Shift / Night Shift"
                      value={shift.shift_name}
                      onChange={(event) =>
                        updateShift(shift.local_id, { shift_name: event.target.value })
                      }
                    />
                  </Col>

                  <Col xs={24} lg={8}>
                    <Text strong>Duty Point / Location</Text>
                    <Input
                      style={{ marginTop: 6 }}
                      placeholder="e.g. Telephone Exchange"
                      value={shift.duty_point_name}
                      onChange={(event) =>
                        updateShift(shift.local_id, {
                          duty_point_name: event.target.value,
                        })
                      }
                    />
                  </Col>

                  <Col xs={12} lg={4}>
                    <Text strong>Start Time</Text>
                    <TimePicker
                      format="hh:mm A"
                      use12Hours
                      style={{ width: "100%", marginTop: 6 }}
                      value={shift.start_time}
                      onChange={(value) =>
                        updateShift(shift.local_id, { start_time: value })
                      }
                    />
                  </Col>

                  <Col xs={12} lg={4}>
                    <Text strong>End Time</Text>
                    <TimePicker
                      format="hh:mm A"
                      use12Hours
                      style={{ width: "100%", marginTop: 6 }}
                      value={shift.end_time}
                      onChange={(value) =>
                        updateShift(shift.local_id, { end_time: value })
                      }
                    />
                  </Col>
                </Row>

                <Row gutter={[14, 6]} style={{ marginTop: 14 }}>
                  <Col xs={24} lg={12}>
                    <Card size="small" title="Start Attendance Biometric Window">
                      <Row gutter={10}>
                        <Col span={12}>
                          <TimePicker
                            format="hh:mm A"
                            use12Hours
                            placeholder="From"
                            style={{ width: "100%" }}
                            value={shift.start_punch_from}
                            onChange={(value) =>
                              updateShift(shift.local_id, { start_punch_from: value })
                            }
                          />
                        </Col>
                        <Col span={12}>
                          <TimePicker
                            format="hh:mm A"
                            use12Hours
                            placeholder="To"
                            style={{ width: "100%" }}
                            value={shift.start_punch_to}
                            onChange={(value) =>
                              updateShift(shift.local_id, { start_punch_to: value })
                            }
                          />
                        </Col>
                      </Row>
                    </Card>
                  </Col>

                  <Col xs={24} lg={12}>
                    <Card size="small" title="End Attendance Biometric Window">
                      <Row gutter={10}>
                        <Col span={12}>
                          <TimePicker
                            format="hh:mm A"
                            use12Hours
                            placeholder="From"
                            style={{ width: "100%" }}
                            value={shift.end_punch_from}
                            onChange={(value) =>
                              updateShift(shift.local_id, { end_punch_from: value })
                            }
                          />
                        </Col>
                        <Col span={12}>
                          <TimePicker
                            format="hh:mm A"
                            use12Hours
                            placeholder="To"
                            style={{ width: "100%" }}
                            value={shift.end_punch_to}
                            onChange={(value) =>
                              updateShift(shift.local_id, { end_punch_to: value })
                            }
                          />
                        </Col>
                      </Row>
                    </Card>
                  </Col>
                </Row>

                <div
                  style={{
                    marginTop: 16,
                    padding: 14,
                    border: "1px solid #E7ECF2",
                    borderRadius: 12,
                    background: "#FAFCFE",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 12,
                      flexWrap: "wrap",
                      marginBottom: 10,
                    }}
                  >
                    <Space>
                      <TeamOutlined />
                      <Text strong>Assigned Staff</Text>
                      <Tag>{(shift.assignments || []).length}</Tag>
                    </Space>

                    <Select
                      showSearch
                      allowClear
                      value={undefined}
                      filterOption={false}
                      placeholder="Search by Name or Belt No."
                      style={{ width: 420, maxWidth: "100%" }}
                      loading={Boolean(staffSearching[shift.local_id])}
                      onSearch={(value) => searchStaff(shift.local_id, value)}
                      onSelect={(value) => addStaff(shift.local_id, value)}
                      options={staffOptions[shift.local_id] || []}
                    />
                  </div>

                  {!(shift.assignments || []).length ? (
                    <Empty
                      image={Empty.PRESENTED_IMAGE_SIMPLE}
                      description="No Staff assigned to this Shift"
                    />
                  ) : (
                    <Table
                      size="small"
                      pagination={false}
                      rowKey="local_id"
                      scroll={{ x: 1190 }}
                      dataSource={shift.assignments}
                      columns={[
                        {
                          title: "Staff Member",
                          width: 260,
                          render: (_, item) => (
                            <Space direction="vertical" size={0}>
                              <Text strong>{item.staff_name || fullName(item)}</Text>
                              <Text type="secondary" style={{ fontSize: 11 }}>
                                {item.belt_no ? `Belt No. ${item.belt_no}` : "Belt No. not recorded"}
                              </Text>
                            </Space>
                          ),
                        },
                        {
                          title: "Effective Period",
                          width: 280,
                          render: (_, item) => (
                            <RangePicker
                              format="DD-MMM-YYYY"
                              value={
                                item.effective_from && item.effective_to
                                  ? [dayjs(item.effective_from), dayjs(item.effective_to)]
                                  : null
                              }
                              onChange={(value) =>
                                updateAssignmentRange(
                                  shift.local_id,
                                  item.local_id,
                                  value,
                                )
                              }
                              style={{ width: "100%" }}
                            />
                          ),
                        },
                        {
                          title: "Duty Pattern",
                          width: 210,
                          render: (_, item) => (
                            <Select
                              value={item.schedule_type || "DAILY"}
                              options={DUTY_PATTERN_OPTIONS}
                              style={{ width: "100%" }}
                              onChange={(value) =>
                                changeAssignmentPattern(
                                  shift.local_id,
                                  item.local_id,
                                  value,
                                )
                              }
                            />
                          ),
                        },
                        {
                          title: "Duty Days",
                          width: 380,
                          render: (_, item) => (
                            <Space direction="vertical" size={5} style={{ width: "100%" }}>
                              {item.schedule_type === "WEEKDAYS" ? (
                                <Select
                                  mode="multiple"
                                  placeholder="Select duty weekdays"
                                  value={item.weekdays || []}
                                  options={WEEKDAY_OPTIONS}
                                  maxTagCount="responsive"
                                  style={{ width: "100%" }}
                                  onChange={(value) =>
                                    updateAssignment(
                                      shift.local_id,
                                      item.local_id,
                                      { weekdays: normalizeWeekdays(value) },
                                    )
                                  }
                                />
                              ) : item.schedule_type === "SELECTED_DATES" ? (
                                <DatePicker
                                  multiple
                                  format="DD-MMM-YYYY"
                                  placeholder="Select duty dates"
                                  value={(item.duty_dates || []).map((date) => dayjs(date))}
                                  style={{ width: "100%" }}
                                  onChange={(value) =>
                                    updateAssignment(
                                      shift.local_id,
                                      item.local_id,
                                      { duty_dates: normalizeDateList(value) },
                                    )
                                  }
                                  disabledDate={(current) => {
                                    if (!current || !item.effective_from || !item.effective_to) {
                                      return false;
                                    }

                                    return (
                                      current.startOf("day").isBefore(
                                        dayjs(item.effective_from).startOf("day"),
                                      ) ||
                                      current.startOf("day").isAfter(
                                        dayjs(item.effective_to).startOf("day"),
                                      )
                                    );
                                  }}
                                />
                              ) : (
                                <Text>Every effective date</Text>
                              )}

                              <Text type="secondary" style={{ fontSize: 10.5 }}>
                                {dutyPatternHelp(item)}
                              </Text>
                            </Space>
                          ),
                        },
                        {
                          title: "",
                          width: 60,
                          fixed: "right",
                          render: (_, item) => (
                            <Button
                              danger
                              type="text"
                              icon={<DeleteOutlined />}
                              onClick={() =>
                                removeAssignment(shift.local_id, item.local_id)
                              }
                            />
                          ),
                        },
                      ]}
                    />
                  )}
                </div>
              </Card>
            ))}
          </Space>
        )}
      </div>
    );
  }

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 16,
          flexWrap: "wrap",
          marginBottom: 16,
        }}
      >
        <div>
          <Title level={4} style={{ margin: 0 }}>
            Custom Shift Duty
          </Title>
          <Text type="secondary">
            Date-range based Staff shifts for Telephone Exchange, Dispensary, Control Room and other non-regular duties.
          </Text>
        </div>

        <Space wrap>
          <Button icon={<ReloadOutlined />} loading={loading} onClick={loadGroups}>
            Refresh
          </Button>
          {canManage && (
            <Button type="primary" icon={<PlusOutlined />} onClick={openNew}>
              Add Custom Shift Group
            </Button>
          )}
        </Space>
      </div>

      <Alert
        showIcon
        type="info"
        style={{ marginBottom: 16 }}
        message="Custom Shift Duty is independent from the daily Security Duty Roster"
        description="Create the group once, then choose each Staff member’s duty pattern: Every Day, Selected Weekdays or Selected Dates. Days inside the effective period that are not duty days automatically become Duty Rest instead of Regular Staff Timetable days."
      />

      <Card style={{ marginBottom: 16 }}>
        <Row gutter={[12, 12]}>
          <Col xs={24} md={10}>
            <Input
              allowClear
              placeholder="Search Shift Group"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </Col>
          <Col xs={24} md={8}>
            <DatePicker
              allowClear
              format="DD-MMM-YYYY"
              placeholder="Active on date"
              value={activeOn}
              onChange={setActiveOn}
              style={{ width: "100%" }}
            />
          </Col>
        </Row>
      </Card>

      <Card>
        <Table
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={filteredGroups}
          expandable={{ expandedRowRender: expandedRow }}
          scroll={{ x: 1050 }}
          pagination={{
            pageSize: 20,
            showSizeChanger: true,
            pageSizeOptions: ["10", "20", "50", "100"],
          }}
        />
      </Card>
    </div>
  );
}
