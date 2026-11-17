import { useEffect, useMemo, useState } from "react";

import {
  Button,
  Card,
  Col,
  DatePicker,
  Descriptions,
  Divider,
  Drawer,
  Form,
  Input,
  InputNumber,
  Modal,
  Radio,
  Row,
  Select,
  Space,
  Switch,
  Tag,
  Typography,
  Upload,
  message,
} from "antd";
import Table from "../components/SerialTable";

import {
  CalendarOutlined,
  DeleteOutlined,
  DownloadOutlined,
  EditOutlined,
  ReloadOutlined,
  SearchOutlined,
  UploadOutlined,
} from "@ant-design/icons";

import dayjs from "dayjs";

import api from "../services/api";
import { useAuth } from "../contexts/AuthContext";

const { Title, Text } = Typography;

function formatDate(value) {
  if (!value) {
    return "-";
  }

  const parsed = dayjs(value);

  return parsed.isValid() ? parsed.format("DD-MMM-YYYY") : value;
}

function formatDateTime(value) {
  if (!value) {
    return "-";
  }

  const parsed = dayjs(value);

  return parsed.isValid() ? parsed.format("DD-MMM-YYYY hh:mm A") : value;
}

function weekendStatusColor(status) {
  switch (status) {
    case "ACTIVE":
      return "green";

    case "UPCOMING":
      return "blue";

    case "COMPLETED":
      return "default";

    case "INACTIVE":
      return "red";

    default:
      return "default";
  }
}

function fullName(item) {
  return [item?.first_name, item?.last_name].filter(Boolean).join(" ") || "-";
}

function getPunchWindow({ departureDatetime, earlyMinutes, lateMinutes }) {
  if (!departureDatetime) {
    return null;
  }

  const departure = dayjs(departureDatetime);

  if (!departure.isValid()) {
    return null;
  }

  return {
    start: departure.subtract(Number(earlyMinutes || 0), "minute"),

    end: departure.add(Number(lateMinutes || 0), "minute"),
  };
}

function departureValidationCounts(record) {
  const biometric = Number(
    record?.departure_present_count || 0,
  );

  const authorizedLeave = Number(
    record?.departure_authorized_leave_count || 0,
  );

  const authorizedHomeRest = Number(
    record?.departure_authorized_home_rest_count || 0,
  );

  const authorizedOsd = Number(
    record?.departure_authorized_osd_count || 0,
  );

  const valid = Number(
    record?.departure_valid_count ??
      biometric + authorizedLeave + authorizedHomeRest + authorizedOsd,
  );

  const absent = Number(
    record?.departure_absent_count || 0,
  );

  const pending = Number(
    record?.departure_pending_count || 0,
  );

  return {
    biometric,
    authorizedLeave,
    authorizedHomeRest,
    authorizedOsd,
    valid,
    absent,
    pending,
  };
}

export default function WeekendManagement() {
  const [form] = Form.useForm();

  const { hasPermission } = useAuth();

  const canManage =
    hasPermission("weekend.manage") ||
    hasPermission("timetable.edit");

  const [loading, setLoading] = useState(false);

  const [saving, setSaving] = useState(false);

  const [importingDetain, setImportingDetain] = useState(false);

  const [weekends, setWeekends] = useState([]);

  const [courses, setCourses] = useState([]);

  const [individualTraineeOptions, setIndividualTraineeOptions] = useState([]);

  const [detainedTraineeOptions, setDetainedTraineeOptions] = useState([]);

  const [drawerOpen, setDrawerOpen] = useState(false);

  const [mode, setMode] = useState("add");

  const [editingWeekend, setEditingWeekend] = useState(null);

  const [search, setSearch] = useState("");

  const [statusFilter, setStatusFilter] = useState(null);

  const [tablePagination, setTablePagination] = useState({
    current: 1,

    pageSize: 20,
  });

  const scopeMode = Form.useWatch("scope_mode", form) || "COURSES";

  const selectedCourseIds = Form.useWatch("course_ids", form) || [];

  const selectedIndividualTraineeIds = Form.useWatch("trainee_ids", form) || [];

  const departureDatetime = Form.useWatch("start_datetime", form);

  const departureEarlyMinutes =
    Form.useWatch("departure_early_minutes", form) ?? 60;

  const departureLateMinutes =
    Form.useWatch("departure_late_minutes", form) ?? 30;

  const departureWindow = useMemo(
    () =>
      getPunchWindow({
        departureDatetime,

        earlyMinutes: departureEarlyMinutes,

        lateMinutes: departureLateMinutes,
      }),
    [departureDatetime, departureEarlyMinutes, departureLateMinutes],
  );

  const loadWeekends = async () => {
    setLoading(true);

    try {
      const response = await api.get("/weekends");

      const rows = Array.isArray(response.data?.data) ? response.data.data : [];

      /*
       * Weekend Management is now Trainee-only.
       * Historical Staff-only weekend rows are not shown on this page.
       */
      setWeekends(
        rows.filter(
          (item) =>
            Boolean(item.apply_all_trainees) ||
            Number(item.course_count || (item.courses || []).length || 0) > 0 ||
            Number(item.trainee_count || (item.trainees || []).length || 0) > 0,
        ),
      );
    } catch (error) {
      message.error(
        error.response?.data?.message || "Could not load Long Weekend records.",
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

  useEffect(() => {
    loadWeekends();
    loadCourses();
  }, []);

  const courseOptions = useMemo(
    () =>
      courses.map((item) => {
        const period =
          item.start_date && item.end_date
            ? `${formatDate(item.start_date)} → ${formatDate(item.end_date)}`
            : "Dates Not Set";

        return {
          value: item.id,

          label: `${item.course_name} | ${period} | ${item.course_status || "DATE_NOT_SET"}`,
        };
      }),
    [courses],
  );

  const filteredWeekends = useMemo(() => {
    const q = search.trim().toLowerCase();

    return weekends.filter((item) => {
      if (statusFilter && item.weekend_status !== statusFilter) {
        return false;
      }

      if (!q) {
        return true;
      }

      const courseNames = (item.courses || [])
        .map((course) => course.course_name)
        .join(" ");

      const traineeNames = (item.trainees || [])
        .map((trainee) =>
          [trainee.employee_id, fullName(trainee), trainee.course_name]
            .filter(Boolean)
            .join(" "),
        )
        .join(" ");

      return [item.weekend_name, item.remarks, courseNames, traineeNames]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q));
    });
  }, [weekends, search, statusFilter]);

  const openAddWeekend = () => {
    setMode("add");

    setEditingWeekend(null);

    setIndividualTraineeOptions([]);

    setDetainedTraineeOptions([]);

    form.resetFields();

    form.setFieldsValue({
      weekend_name: "",

      start_datetime: null,

      end_datetime: null,

      departure_early_minutes: 60,

      departure_late_minutes: 30,

      scope_mode: "COURSES",

      course_ids: [],

      trainee_ids: [],

      detained_trainee_ids: [],

      remarks: null,

      is_active: true,
    });

    setDrawerOpen(true);
  };

  const openEditWeekend = async (record) => {
    try {
      setSaving(true);

      const response = await api.get(`/weekends/${record.id}`);

      const item = response.data?.data;

      if (!item) {
        throw new Error("Long Weekend record not found.");
      }

      setMode("edit");

      setEditingWeekend(item);

      const assignedOptions = (item.trainees || []).map((trainee) => ({
        value: Number(trainee.id || trainee.trainee_id),

        label: `${trainee.employee_id || "-"} — ${fullName(trainee)}${
          trainee.course_name ? ` | ${trainee.course_name}` : ""
        }`,

        course_id: trainee.course_id != null ? Number(trainee.course_id) : null,
      }));

      const detainedOptions = (item.detained_trainees || []).map((trainee) => ({
        value: Number(trainee.id || trainee.trainee_id),

        label: `${trainee.employee_id || "-"} — ${fullName(trainee)}${
          trainee.course_name ? ` | ${trainee.course_name}` : ""
        }`,

        course_id: trainee.course_id != null ? Number(trainee.course_id) : null,
      }));

      setIndividualTraineeOptions(assignedOptions);

      setDetainedTraineeOptions(detainedOptions);

      form.setFieldsValue({
        weekend_name: item.weekend_name,

        start_datetime: item.start_datetime ? dayjs(item.start_datetime) : null,

        end_datetime: item.end_datetime ? dayjs(item.end_datetime) : null,

        departure_early_minutes: Number(item.departure_early_minutes ?? 60),

        departure_late_minutes: Number(item.departure_late_minutes ?? 30),

        scope_mode: item.apply_all_trainees
          ? "ALL"
          : (item.trainee_ids || item.trainees || []).length &&
              !(item.course_ids || item.courses || []).length
            ? "TRAINEES"
            : "COURSES",

        course_ids: (item.course_ids || item.courses || []).map((value) =>
          Number(typeof value === "object" ? value.id : value),
        ),

        trainee_ids: (item.trainee_ids || item.trainees || []).map((value) =>
          Number(
            typeof value === "object" ? value.id || value.trainee_id : value,
          ),
        ),

        detained_trainee_ids: (
          item.detained_trainee_ids ||
          item.detained_trainees ||
          []
        ).map((value) =>
          Number(
            typeof value === "object" ? value.id || value.trainee_id : value,
          ),
        ),

        remarks: item.remarks || null,

        is_active: Boolean(item.is_active),
      });

      setDrawerOpen(true);
    } catch (error) {
      message.error(
        error.response?.data?.message ||
          error.message ||
          "Could not load Long Weekend.",
      );
    } finally {
      setSaving(false);
    }
  };

  const mergeTraineeOptions = (current, incoming) => {
    const map = new Map();

    [...(current || []), ...(incoming || [])].forEach((option) => {
      const id = Number(option?.value);

      if (Number.isFinite(id) && id > 0) {
        map.set(id, option);
      }
    });

    return [...map.values()];
  };

  const fetchTraineeOptions = async (value) => {
    const query = String(value || "").trim();

    if (!query) {
      return [];
    }

    const response = await api.get("/leaves/subjects/search", {
      params: {
        subject_type: "TRAINEE",

        search: query,
      },
    });

    const rows = Array.isArray(response.data?.data) ? response.data.data : [];
    const normalizedQuery = query.toUpperCase();

    const rank = (item) => {
      const employeeId = String(item?.employee_id || "").trim().toUpperCase();
      const beltNo = String(item?.belt_no || "").trim().toUpperCase();
      const name = fullName(item).toUpperCase();

      if (employeeId === normalizedQuery || beltNo === normalizedQuery) {
        return 0;
      }

      if (employeeId.startsWith(normalizedQuery) || beltNo.startsWith(normalizedQuery)) {
        return 1;
      }

      if (employeeId.includes(normalizedQuery) || beltNo.includes(normalizedQuery)) {
        return 2;
      }

      if (name.includes(normalizedQuery)) {
        return 3;
      }

      return 4;
    };

    return [...rows]
      .sort((a, b) => {
        const score = rank(a) - rank(b);

        if (score !== 0) {
          return score;
        }

        return String(a?.employee_id || "").localeCompare(
          String(b?.employee_id || ""),
          undefined,
          { numeric: true },
        );
      })
      .map((item) => {
        const beltNo = String(item?.belt_no || "").trim();
        const employeeId = String(item?.employee_id || "").trim();
        const beltLabel =
          beltNo && beltNo.toUpperCase() !== employeeId.toUpperCase()
            ? ` | Cap No. ${beltNo}`
            : "";

        return {
          value: Number(item.subject_id),

          label: `${employeeId || "-"}${beltLabel} — ${fullName(item)}${
            item.course_name ? ` | ${item.course_name}` : ""
          }${item.platoon_number ? ` / Platoon ${item.platoon_number}` : ""}`,

          employee_id: employeeId,
          belt_no: beltNo,
          course_id: item.course_id != null ? Number(item.course_id) : null,
        };
      });
  };

  const searchIndividualTrainees = async (value) => {
    try {
      const options = await fetchTraineeOptions(value);

      setIndividualTraineeOptions((current) =>
        mergeTraineeOptions(current, options),
      );
    } catch (error) {
      message.error(
        error.response?.data?.message || "Could not search trainee.",
      );
    }
  };

  const searchDetainedTrainees = async (value) => {
    try {
      let options = await fetchTraineeOptions(value);

      if (scopeMode === "COURSES" && selectedCourseIds.length) {
        const allowed = new Set(selectedCourseIds.map(Number));

        options = options.filter((item) => allowed.has(Number(item.course_id)));
      }

      if (scopeMode === "TRAINEES") {
        const allowed = new Set(selectedIndividualTraineeIds.map(Number));

        options = options.filter((item) => allowed.has(Number(item.value)));
      }

      setDetainedTraineeOptions((current) =>
        mergeTraineeOptions(current, options),
      );
    } catch (error) {
      message.error(
        error.response?.data?.message || "Could not search trainee.",
      );
    }
  };

  const downloadDetainTemplate = async () => {
    try {
      const response = await api.get("/weekends/tools/detained-template", {
        responseType: "blob",
      });

      const blob = new Blob([response.data], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });

      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "Weekend_Detain_Import_Template.xlsx";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      message.error(
        error.response?.data?.message || "Could not download Weekend Detain template.",
      );
    }
  };

  const importDetainedTrainees = async (file) => {
    if (scopeMode === "COURSES" && !selectedCourseIds.length) {
      message.warning("Select Trainee Courses before importing a Detain list.");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    try {
      setImportingDetain(true);

      const response = await api.post("/weekends/tools/detained-import", formData);
      const data = response.data?.data || {};
      const sourceRows = Array.isArray(data.rows) ? data.rows : [];

      let allowedRows = sourceRows;
      let outsideCourseCount = 0;

      if (scopeMode === "COURSES") {
        const allowedCourses = new Set(selectedCourseIds.map(Number));
        allowedRows = sourceRows.filter((item) =>
          allowedCourses.has(Number(item.course_id)),
        );
        outsideCourseCount = sourceRows.length - allowedRows.length;
      }

      const importedOptions = allowedRows.map((item) => {
        const employeeId = String(item.employee_id || "").trim();
        const beltNo = String(item.belt_no || "").trim();
        const beltLabel =
          beltNo && beltNo.toUpperCase() !== employeeId.toUpperCase()
            ? ` | Cap No. ${beltNo}`
            : "";

        return {
          value: Number(item.subject_id || item.id),
          label: `${employeeId || "-"}${beltLabel} — ${fullName(item)}${
            item.course_name ? ` | ${item.course_name}` : ""
          }${item.platoon_number ? ` / Platoon ${item.platoon_number}` : ""}`,
          employee_id: employeeId,
          belt_no: beltNo,
          course_id: item.course_id != null ? Number(item.course_id) : null,
        };
      });

      setDetainedTraineeOptions((current) =>
        mergeTraineeOptions(current, importedOptions),
      );

      const existingIds = form.getFieldValue("detained_trainee_ids") || [];
      const nextIds = [
        ...new Set([
          ...existingIds.map(Number),
          ...importedOptions.map((item) => Number(item.value)),
        ]),
      ];

      form.setFieldValue("detained_trainee_ids", nextIds);

      const unmatched = Array.isArray(data.unmatched) ? data.unmatched : [];
      const ambiguous = Array.isArray(data.ambiguous) ? data.ambiguous : [];
      const duplicateInputs = Array.isArray(data.duplicate_inputs)
        ? data.duplicate_inputs
        : [];

      Modal.info({
        title: "Weekend Detain Import Result",
        width: 560,
        content: (
          <Space direction="vertical" size={6}>
            <Text>Imported: {importedOptions.length}</Text>
            {outsideCourseCount > 0 && (
              <Text type="warning">
                Skipped outside selected Courses: {outsideCourseCount}
              </Text>
            )}
            {unmatched.length > 0 && (
              <Text type="warning">
                Not found: {unmatched.slice(0, 12).join(", ")}
                {unmatched.length > 12 ? ` +${unmatched.length - 12}` : ""}
              </Text>
            )}
            {ambiguous.length > 0 && (
              <Text type="warning">
                Ambiguous IDs skipped: {ambiguous.slice(0, 12).join(", ")}
                {ambiguous.length > 12 ? ` +${ambiguous.length - 12}` : ""}
              </Text>
            )}
            {duplicateInputs.length > 0 && (
              <Text type="secondary">
                Duplicate rows ignored: {duplicateInputs.length}
              </Text>
            )}
          </Space>
        ),
      });
    } catch (error) {
      message.error(
        error.response?.data?.message || "Could not import Weekend Detain list.",
      );
    } finally {
      setImportingDetain(false);
    }
  };

  const handleSaveWeekend = async () => {
    try {
      const values = await form.validateFields();

      const selectedScope = values.scope_mode || "COURSES";

      if (selectedScope === "COURSES" && !(values.course_ids || []).length) {
        message.error("Select at least one Trainee Course.");

        return;
      }

      if (selectedScope === "TRAINEES" && !(values.trainee_ids || []).length) {
        message.error("Select at least one Individual Trainee.");

        return;
      }

      setSaving(true);

      /*
       * Frontend final contract:
       * - Weekend is Trainee-only.
       * - start_datetime is the departure date/time.
       * - departure_early_minutes / departure_late_minutes define the
       *   attendance punch window around departure.
       * - scope can be All Trainees, Selected Courses, or Selected Trainees.
       * - detained_trainee_ids are excluded from broad Weekend departure attendance.
       */
      const payload = {
        weekend_name: values.weekend_name.trim(),

        start_datetime: values.start_datetime.format("YYYY-MM-DD HH:mm:ss"),

        end_datetime: values.end_datetime.format("YYYY-MM-DD HH:mm:ss"),

        departure_early_minutes: Number(values.departure_early_minutes || 0),

        departure_late_minutes: Number(values.departure_late_minutes || 0),

        apply_all_trainees: selectedScope === "ALL",

        course_ids: selectedScope === "COURSES" ? values.course_ids || [] : [],

        trainee_ids:
          selectedScope === "TRAINEES" ? values.trainee_ids || [] : [],

        detained_trainee_ids:
          selectedScope === "TRAINEES" ? [] : values.detained_trainee_ids || [],

        /*
         * Explicitly keep Staff scope OFF.
         * Existing backend fields are preserved until backend cleanup.
         */
        apply_all_staff: false,

        staff_category_ids: [],

        remarks: values.remarks ? values.remarks.trim() : null,

        is_active: values.is_active !== false,
      };

      if (mode === "edit" && editingWeekend?.id) {
        await api.put(`/weekends/${editingWeekend.id}`, payload);

        message.success("Long Weekend updated successfully.");
      } else {
        await api.post("/weekends", payload);

        message.success("Long Weekend created successfully.");
      }

      setDrawerOpen(false);

      setEditingWeekend(null);

      setIndividualTraineeOptions([]);

      setDetainedTraineeOptions([]);

      form.resetFields();

      await loadWeekends();
    } catch (error) {
      if (error?.errorFields) {
        return;
      }

      message.error(
        error.response?.data?.message || "Could not save Long Weekend.",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteWeekend = (record) => {
    Modal.confirm({
      title: "Delete Long Weekend?",

      content: (
        <div>
          <p>
            <strong>{record.weekend_name}</strong>
          </p>

          <p>
            Is Long Weekend ki Course assignments aur detention mapping backend
            cleanup ke waqt bhi isi record ke sath manage hongi.
          </p>
        </div>
      ),

      okText: "Delete",

      okType: "danger",

      cancelText: "Cancel",

      async onOk() {
        try {
          await api.delete(`/weekends/${record.id}`);

          message.success("Long Weekend deleted successfully.");

          await loadWeekends();
        } catch (error) {
          message.error(
            error.response?.data?.message || "Could not delete Long Weekend.",
          );
        }
      },
    });
  };

  const columns = [
    {
      title: "Long Weekend",

      dataIndex: "weekend_name",

      width: 220,

      render: (value) => <Text strong>{value}</Text>,
    },

    {
      title: "Departure",

      dataIndex: "start_datetime",

      width: 185,

      render: formatDateTime,
    },

    {
      title: "Return / End",

      dataIndex: "end_datetime",

      width: 185,

      render: formatDateTime,
    },

    {
      title: "Departure Punch Window",

      width: 245,

      render: (_, record) => {
        const window = getPunchWindow({
          departureDatetime: record.start_datetime,

          earlyMinutes: record.departure_early_minutes ?? 60,

          lateMinutes: record.departure_late_minutes ?? 30,
        });

        if (!window) {
          return "-";
        }

        return (
          <div>
            <div>{window.start.format("DD-MMM-YYYY hh:mm A")}</div>

            <Text type="secondary">
              to {window.end.format("DD-MMM-YYYY hh:mm A")}
            </Text>
          </div>
        );
      },
    },

    {
      title: "Trainee Scope",

      width: 230,

      render: (_, record) => {
        if (record.apply_all_trainees) {
          return <Tag color="blue">All Trainees</Tag>;
        }

        const courseRows = record.courses || [];
        const traineeRows = record.trainees || [];

        const courseCount = Number(
          record.course_count || courseRows.length || 0,
        );

        const traineeCount = Number(
          record.trainee_count || traineeRows.length || 0,
        );

        if (!courseCount && !traineeCount) {
          return <Tag>Not Applied</Tag>;
        }

        return (
          <Space direction="vertical" size={3}>
            {courseCount > 0 && (
              <>
                <Tag color="blue">
                  {courseCount} Course
                  {courseCount === 1 ? "" : "s"}
                </Tag>

                <Text type="secondary" style={{ fontSize: 11 }}>
                  {courseRows.map((item) => item.course_name).join(", ")}
                </Text>
              </>
            )}

            {traineeCount > 0 && (
              <>
                <Tag color="purple">
                  {traineeCount} Individual Trainee
                  {traineeCount === 1 ? "" : "s"}
                </Tag>

                <Text type="secondary" style={{ fontSize: 11 }}>
                  {traineeRows
                    .slice(0, 4)
                    .map((item) => item.employee_id || fullName(item))
                    .join(", ")}
                  {traineeRows.length > 4 ? ` +${traineeRows.length - 4}` : ""}
                </Text>
              </>
            )}
          </Space>
        );
      },
    },

    {
      title: "Weekend Detain",

      width: 140,

      align: "center",

      render: (_, record) => (
        <Tag
          color={
            Number(
              record.detained_trainee_count ||
                (record.detained_trainees || []).length ||
                0,
            ) > 0
              ? "orange"
              : "default"
          }
        >
          {Number(
            record.detained_trainee_count ||
              (record.detained_trainees || []).length ||
              0,
          )}
        </Tag>
      ),
    },

    {
      title: "Departure Validation",

      width: 285,

      render: (_, record) => {
        const counts =
          departureValidationCounts(
            record,
          );

        const windowClosed =
          record.departure_window_status ===
          "CLOSED";

        return (
          <Space
            size={[4, 4]}
            wrap
          >
            <Tag color="green">
              Biometric {counts.biometric}
            </Tag>

            <Tag color="blue">
              Authorized Leave {counts.authorizedLeave}
            </Tag>

            <Tag color="geekblue">
              Home Rest {counts.authorizedHomeRest}
            </Tag>

            <Tag color="purple">
              OSD {counts.authorizedOsd}
            </Tag>

            <Tag color="cyan">
              Valid Total {counts.valid}
            </Tag>

            {windowClosed ? (
              <Tag color={counts.absent ? "red" : "default"}>
                No Valid Departure {counts.absent}
              </Tag>
            ) : (
              <Tag color={counts.pending ? "gold" : "default"}>
                Pending {counts.pending}
              </Tag>
            )}
          </Space>
        );
      },
    },

    {
      title: "Status",

      dataIndex: "weekend_status",

      width: 110,

      align: "center",

      render: (value) => (
        <Tag color={weekendStatusColor(value)}>{value || "INACTIVE"}</Tag>
      ),
    },

    {
      title: "Enabled",

      dataIndex: "is_active",

      width: 95,

      align: "center",

      render: (value) => (
        <Tag color={value ? "green" : "red"}>{value ? "Yes" : "No"}</Tag>
      ),
    },

    {
      title: "Actions",

      width: 120,

      fixed: "right",

      render: (_, record) =>
        canManage ? (
          <Space>
            <Button
              type="text"
              icon={<EditOutlined />}
              onClick={() => openEditWeekend(record)}
            />

            <Button
              type="text"
              danger
              icon={<DeleteOutlined />}
              onClick={() => handleDeleteWeekend(record)}
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
            Long Weekend Management
          </Title>

          <Text type="secondary">
            Trainee-only Long Weekend for all trainees, selected courses, or
            individual trainees, with biometric departure, approved Leave /
            Home Rest / OSD authorization and Weekend Detain management.
          </Text>
        </div>

        <Space wrap>
          <Button
            icon={<ReloadOutlined />}
            onClick={() => {
              loadWeekends();
              loadCourses();
            }}
            loading={loading}
          >
            Refresh
          </Button>

          {canManage && (
            <Button
              type="primary"
              icon={<CalendarOutlined />}
              onClick={openAddWeekend}
            >
              Add Long Weekend
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
          <Col xs={24} md={12} lg={10}>
            <Input
              allowClear
              prefix={<SearchOutlined />}
              value={search}
              placeholder="Search Weekend, Course or Trainee"
              onChange={(event) => setSearch(event.target.value)}
            />
          </Col>

          <Col xs={24} md={8} lg={5}>
            <Select
              allowClear
              value={statusFilter}
              placeholder="All Status"
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
                  value: "INACTIVE",

                  label: "Inactive",
                },
              ]}
            />
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
              {filteredWeekends.length}/{weekends.length}
            </strong>
          </Text>
        </div>

        <Table
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={filteredWeekends}
          scroll={{
            x: 1840,
          }}
          pagination={{
            current: tablePagination.current,

            pageSize: tablePagination.pageSize,

            total: filteredWeekends.length,

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
        title={mode === "edit" ? "Edit Long Weekend" : "Add Long Weekend"}
        width={780}
        open={drawerOpen}
        destroyOnHidden
        onClose={() => {
          setDrawerOpen(false);
          setEditingWeekend(null);
          setIndividualTraineeOptions([]);
          setDetainedTraineeOptions([]);
          form.resetFields();
        }}
        extra={
          <Space>
            <Button onClick={() => setDrawerOpen(false)}>Cancel</Button>

            <Button type="primary" loading={saving} onClick={handleSaveWeekend}>
              {mode === "edit" ? "Update Long Weekend" : "Save Long Weekend"}
            </Button>
          </Space>
        }
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="weekend_name"
            label="Long Weekend Name"
            rules={[
              {
                required: true,

                whitespace: true,

                message: "Long Weekend Name is required.",
              },
            ]}
          >
            <Input
              maxLength={150}
              placeholder="e.g. Weekly Weekend, Eid Weekend"
            />
          </Form.Item>

          <Divider orientation="left">Weekend Period</Divider>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="start_datetime"
                label="Departure Date & Time"
                rules={[
                  {
                    required: true,

                    message: "Departure Date & Time is required.",
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
            </Col>

            <Col span={12}>
              <Form.Item
                name="end_datetime"
                label="Weekend Return / End"
                dependencies={["start_datetime"]}
                rules={[
                  {
                    required: true,

                    message: "Weekend End Date/Time is required.",
                  },

                  ({ getFieldValue }) => ({
                    validator(_, value) {
                      const start = getFieldValue("start_datetime");

                      if (!start || !value || value.isAfter(start)) {
                        return Promise.resolve();
                      }

                      return Promise.reject(
                        new Error("Weekend End must be later than Departure."),
                      );
                    },
                  }),
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
            </Col>
          </Row>

          <Divider orientation="left">Departure Attendance Window</Divider>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="departure_early_minutes"
                label="Punch Window Before Departure (Minutes)"
                rules={[
                  {
                    required: true,
                  },
                ]}
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
                name="departure_late_minutes"
                label="Punch Window After Departure (Minutes)"
                rules={[
                  {
                    required: true,
                  },
                ]}
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

          {departureWindow && (
            <Card
              size="small"
              style={{
                marginBottom: 18,
              }}
            >
              <Descriptions size="small" column={1}>
                <Descriptions.Item label="Departure">
                  {formatDateTime(departureDatetime)}
                </Descriptions.Item>

                <Descriptions.Item label="Valid Punch Window">
                  {departureWindow.start.format("DD-MMM-YYYY hh:mm A")}
                  {" → "}
                  {departureWindow.end.format("DD-MMM-YYYY hh:mm A")}
                </Descriptions.Item>
              </Descriptions>
            </Card>
          )}

          <Divider orientation="left">Trainee Weekend Scope</Divider>

          <Form.Item
            name="scope_mode"
            label="Apply Long Weekend To"
            rules={[
              {
                required: true,
                message: "Select a Trainee Weekend Scope.",
              },
            ]}
          >
            <Radio.Group
              onChange={(event) => {
                const nextMode = event.target.value;

                form.setFieldValue("course_ids", []);
                form.setFieldValue("trainee_ids", []);
                form.setFieldValue("detained_trainee_ids", []);

                setIndividualTraineeOptions([]);
                setDetainedTraineeOptions([]);

                if (nextMode === "ALL") {
                  form.setFieldValue("course_ids", []);
                  form.setFieldValue("trainee_ids", []);
                }
              }}
            >
              <Space direction="vertical" size={8}>
                <Radio value="ALL">All Trainees</Radio>
                <Radio value="COURSES">Selected Courses</Radio>
                <Radio value="TRAINEES">Selected / Individual Trainees</Radio>
              </Space>
            </Radio.Group>
          </Form.Item>

          {scopeMode === "COURSES" && (
            <Form.Item
              name="course_ids"
              label="Select Trainee Courses"
              rules={[
                {
                  validator: (_, value) =>
                    scopeMode !== "COURSES" || (value || []).length
                      ? Promise.resolve()
                      : Promise.reject(
                          new Error("Select at least one Trainee Course."),
                        ),
                },
              ]}
            >
              <Select
                mode="multiple"
                allowClear
                showSearch
                optionFilterProp="label"
                options={courseOptions}
                placeholder="Select one or multiple Courses"
                maxTagCount="responsive"
                onChange={() => {
                  form.setFieldValue("detained_trainee_ids", []);

                  setDetainedTraineeOptions([]);
                }}
              />
            </Form.Item>
          )}

          {scopeMode === "TRAINEES" && (
            <>
              <Form.Item
                name="trainee_ids"
                label="Select Individual Trainees"
                rules={[
                  {
                    validator: (_, value) =>
                      scopeMode !== "TRAINEES" || (value || []).length
                        ? Promise.resolve()
                        : Promise.reject(
                            new Error("Select at least one Individual Trainee."),
                          ),
                  },
                ]}
                extra="Search by Employee ID / Cap No. / Name. You can select one or multiple trainees from any course."
              >
                <Select
                  mode="multiple"
                  showSearch
                  allowClear
                  filterOption={false}
                  onSearch={searchIndividualTrainees}
                  options={individualTraineeOptions}
                  placeholder="Type Employee ID / Cap No. / Name"
                  maxTagCount="responsive"
                  notFoundContent="Type Employee ID / Cap No. / Name to search"
                  onChange={(values) => {
                    const allowed = new Set((values || []).map(Number));

                    const detained = form.getFieldValue("detained_trainee_ids") || [];

                    form.setFieldValue(
                      "detained_trainee_ids",
                      detained.filter((id) => allowed.has(Number(id))),
                    );
                  }}
                />
              </Form.Item>

              <Card size="small" style={{ marginBottom: 18 }}>
                <Text type="secondary">
                  Individual Weekend is useful when one or more trainees need
                  to depart before the general/course Weekend. Their own valid
                  departure punch will authorize the Long Weekend.
                </Text>
              </Card>
            </>
          )}

          <Divider orientation="left">Weekend Detain</Divider>

          {scopeMode === "TRAINEES" ? (
            <Card size="small" style={{ marginBottom: 18 }}>
              <Text type="secondary">
                Weekend Detain is not required for Individual Weekend. To keep
                an individual trainee at PTS, simply remove that trainee from
                the Selected Trainees list.
              </Text>
            </Card>
          ) : (
            <Form.Item
              label="Detained Trainees"
              extra={
                scopeMode === "COURSES"
                  ? "Only trainees from the selected Courses can be detained. Search individually or import an Excel list."
                  : "Search any trainee or import an Excel list to exclude them from this Weekend."
              }
            >
              <div>
                <Space wrap style={{ marginBottom: 8 }}>
                  <Button
                    type="default"
                    icon={<DownloadOutlined />}
                    onClick={downloadDetainTemplate}
                  >
                    Download Template
                  </Button>

                  <Upload
                    accept=".xlsx"
                    showUploadList={false}
                    beforeUpload={async (file) => {
                      await importDetainedTrainees(file);
                      return Upload.LIST_IGNORE;
                    }}
                  >
                    <Button
                      type="default"
                      icon={<UploadOutlined />}
                      loading={importingDetain}
                    >
                      Import Detain List
                    </Button>
                  </Upload>
                </Space>

                <Form.Item name="detained_trainee_ids" noStyle>
                  <Select
                    mode="multiple"
                    showSearch
                    allowClear
                    filterOption={false}
                    onSearch={searchDetainedTrainees}
                    options={detainedTraineeOptions}
                    placeholder="Type exact Employee ID / Cap No. / Name to add Weekend Detain"
                    maxTagCount="responsive"
                    notFoundContent="Type Employee ID / Cap No. / Name to search"
                    style={{ width: "100%" }}
                  />
                </Form.Item>
              </div>
            </Form.Item>
          )}

          <Form.Item name="remarks" label="Remarks">
            <Input.TextArea rows={3} />
          </Form.Item>

          <Form.Item
            name="is_active"
            label="Long Weekend Enabled"
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>
        </Form>
      </Drawer>
    </div>
  );
}
