import { useCallback, useEffect, useMemo, useState } from "react";

import {
  Alert,
  AutoComplete,
  Button,
  Card,
  Checkbox,
  Col,
  Descriptions,
  Divider,
  Drawer,
  Form,
  Input,
  Modal,
  Row,
  Select,
  Space,
  Tag,
  Typography,
  Upload,
  message,
} from "antd";
import Table from "../components/SerialTable";

import {
  DeleteOutlined,
  DownloadOutlined,
  EditOutlined,
  EyeOutlined,
  FileExcelOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  UploadOutlined,
} from "@ant-design/icons";

import dayjs from "dayjs";

import api from "../services/api";

import { useAuth } from "../contexts/AuthContext";

const { Title, Text } = Typography;

const { TextArea } = Input;

/*
|--------------------------------------------------------------------------
| OPTIONS
|--------------------------------------------------------------------------
*/

const OPERATIONAL_STATUS_OPTIONS = [
  {
    value: "ACTIVE",

    label: "Active",
  },

  {
    value: "ON_LEAVE",

    label: "On Leave",
  },

  {
    value: "OSD",

    label: "OSD",
  },

  {
    value: "OUTDOOR",

    label: "Outdoor",
  },

  {
    value: "TRAINING_DROP",

    label: "Training Drop",
  },

  {
    value: "INACTIVE",

    label: "Inactive",
  },
];

const COURSE_STATUS_OPTIONS = [
  {
    value: "ACTIVE",

    label: "Active Course",
  },

  {
    value: "UPCOMING",

    label: "Upcoming Course",
  },

  {
    value: "COMPLETED",

    label: "Completed Course",
  },

  {
    value: "DATE_NOT_SET",

    label: "Course Date Not Set",
  },
];

/*
|--------------------------------------------------------------------------
| HELPERS
|--------------------------------------------------------------------------
*/

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
      return status || "Unknown";
  }
}

function operationalStatusColor(status) {
  switch (status) {
    case "ACTIVE":
      return "green";

    case "TRAINING_DROP":
      return "purple";

    case "INACTIVE":
      return "default";

    case "ON_LEAVE":
    case "OSD":
    case "OUTDOOR":
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

export default function Trainees({ onOpenProfile }) {
  const [form] = Form.useForm();

  const { hasPermission } = useAuth();

  const canEdit = hasPermission("trainees.edit");

  const canPermanentDelete =
    hasPermission("data_management.manage") ||
    hasPermission("users.manage");

  /*
  |--------------------------------------------------------------------------
  | STATE
  |--------------------------------------------------------------------------
  */

  const [loading, setLoading] = useState(false);

  const [saving, setSaving] = useState(false);

  const [importing, setImporting] = useState(false);

  const [exporting, setExporting] = useState(false);

  const [bulkDeleting, setBulkDeleting] = useState(false);

  const [courseLoading, setCourseLoading] = useState(false);

  const [platoonLoading, setPlatoonLoading] = useState(false);

  const [trainees, setTrainees] = useState([]);

  const [courses, setCourses] = useState([]);

  const [platoons, setPlatoons] = useState([]);

  const [formPlatoons, setFormPlatoons] = useState([]);

  const [search, setSearch] = useState("");

  const [courseId, setCourseId] = useState(null);

  const [platoonId, setPlatoonId] = useState(null);

  const [status, setStatus] = useState(null);

  const [courseStatus, setCourseStatus] = useState(null);

  const [selectedRowKeys, setSelectedRowKeys] = useState([]);

  const [formOpen, setFormOpen] = useState(false);

  const [formMode, setFormMode] = useState("add");

  const [editingTrainee, setEditingTrainee] = useState(null);

  const [selectedFormCourse, setSelectedFormCourse] = useState(null);

  const [pagination, setPagination] = useState({
    current: 1,

    pageSize: 25,

    total: 0,
  });

  const [overallTotal, setOverallTotal] = useState(0);

  /*
  |--------------------------------------------------------------------------
  | DOWNLOAD
  |--------------------------------------------------------------------------
  */

  const downloadBlob = (blob, filename) => {
    const url = window.URL.createObjectURL(blob);

    const link = document.createElement("a");

    link.href = url;

    link.download = filename;

    document.body.appendChild(link);

    link.click();

    link.remove();

    window.URL.revokeObjectURL(url);
  };

  /*
  |--------------------------------------------------------------------------
  | COURSES
  |--------------------------------------------------------------------------
  */

  const loadCourses = useCallback(async () => {
    setCourseLoading(true);

    try {
      const response = await api.get("/courses");

      const rows = response.data?.data || [];

      setCourses(rows);

      return rows;
    } catch (error) {
      message.error(error.response?.data?.message || "Could not load courses.");

      return [];
    } finally {
      setCourseLoading(false);
    }
  }, []);

  /*
  |--------------------------------------------------------------------------
  | PLATOONS
  |--------------------------------------------------------------------------
  */

  const loadPlatoons = useCallback(
    async (
      selectedCourseId = null,

      target = "filter",
    ) => {
      setPlatoonLoading(true);

      try {
        const params = {};

        if (selectedCourseId) {
          params.course_id = selectedCourseId;
        }

        const response = await api.get("/platoons", {
          params,
        });

        const rows = response.data?.data || [];

        if (target === "form") {
          setFormPlatoons(rows);
        } else {
          setPlatoons(rows);
        }

        return rows;
      } catch (error) {
        message.error(
          error.response?.data?.message || "Could not load platoons.",
        );

        if (target === "form") {
          setFormPlatoons([]);
        }

        return [];
      } finally {
        setPlatoonLoading(false);
      }
    },
    [],
  );

  /*
  |--------------------------------------------------------------------------
  | TRAINEES
  |--------------------------------------------------------------------------
  */

  const loadTrainees = useCallback(
    async (
      page = 1,

      pageSize = pagination.pageSize,

      overrides = {},
    ) => {
      setLoading(true);

      try {
        const currentSearch =
          overrides.search !== undefined ? overrides.search : search;

        const currentCourseId =
          overrides.courseId !== undefined ? overrides.courseId : courseId;

        const currentPlatoonId =
          overrides.platoonId !== undefined ? overrides.platoonId : platoonId;

        const currentStatus =
          overrides.status !== undefined ? overrides.status : status;

        const currentCourseStatus =
          overrides.courseStatus !== undefined
            ? overrides.courseStatus
            : courseStatus;

        const params = {
          page,

          page_size: pageSize,
        };

        if (currentSearch?.trim()) {
          params.search = currentSearch.trim();
        }

        if (currentCourseId) {
          params.course_id = currentCourseId;
        }

        if (currentPlatoonId) {
          params.platoon_id = currentPlatoonId;
        }

        if (currentCourseStatus) {
          params.course_status = currentCourseStatus;
        }

        const response = await api.get("/trainees", {
          params,
        });

        const data = response.data?.data || {};

        setTrainees(data.rows || []);

        setPagination({
          current: Number(data.pagination?.page) || page,

          pageSize: Number(data.pagination?.pageSize) || pageSize,

          total: Number(data.pagination?.total) || 0,
        });
      } catch (error) {
        message.error(
          error.response?.data?.message || "Could not load trainees.",
        );
      } finally {
        setLoading(false);
      }
    },
    [search, courseId, platoonId, status, courseStatus, pagination.pageSize],
  );

  /*
  |--------------------------------------------------------------------------
  | OVERALL TOTAL
  |--------------------------------------------------------------------------
  */

  const loadOverallTotal = useCallback(async () => {
    try {
      const response = await api.get("/trainees", {
        params: {
          page: 1,

          page_size: 1,
        },
      });

      const total = Number(response.data?.data?.pagination?.total) || 0;

      setOverallTotal(total);

      return total;
    } catch (error) {
      console.error("Could not load overall trainee total.", error);

      return 0;
    }
  }, []);

  /*
  |--------------------------------------------------------------------------
  | INITIAL
  |--------------------------------------------------------------------------
  */

  useEffect(() => {
    loadCourses();

    loadPlatoons();

    loadOverallTotal();

    loadTrainees(1, 25);

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /*
  |--------------------------------------------------------------------------
  | OPTIONS
  |--------------------------------------------------------------------------
  */

  const courseOptions = useMemo(
    () =>
      courses.map((course) => ({
        value: course.id,

        label: `${course.course_name} (${courseStatusLabel(
          course.course_status,
        )})`,
      })),
    [courses],
  );

  const formCourseOptions = useMemo(
    () =>
      courses.map((course) => ({
        value: course.course_name,

        label: `${course.course_name} — ${courseStatusLabel(
          course.course_status,
        )}`,
      })),
    [courses],
  );

  const platoonOptions = useMemo(
    () =>
      platoons.map((platoon) => ({
        value: platoon.id,

        label: String(platoon.platoon_number),
      })),
    [platoons],
  );

  const formPlatoonOptions = useMemo(
    () =>
      formPlatoons.map((platoon) => ({
        value: String(platoon.platoon_number),

        label: String(platoon.platoon_number),
      })),
    [formPlatoons],
  );

  /*
  |--------------------------------------------------------------------------
  | FILTER COURSE
  |--------------------------------------------------------------------------
  */

  const handleFilterCourseChange = async (value) => {
    const selected = value || null;

    setSelectedRowKeys([]);

    setCourseId(selected);

    setPlatoonId(null);

    await loadPlatoons(selected);
  };

  /*
  |--------------------------------------------------------------------------
  | SEARCH / RESET
  |--------------------------------------------------------------------------
  */

  const handleSearch = () => {
    setSelectedRowKeys([]);

    loadTrainees(1, pagination.pageSize);
  };

  const handleReset = async () => {
    setSelectedRowKeys([]);

    setSearch("");

    setCourseId(null);

    setPlatoonId(null);

    setStatus(null);

    setCourseStatus(null);

    await Promise.all([loadCourses(), loadPlatoons()]);

    await loadTrainees(1, pagination.pageSize, {
      search: "",

      courseId: null,

      platoonId: null,

      status: null,

      courseStatus: null,
    });
  };

  /*
  |--------------------------------------------------------------------------
  | TEMPLATE
  |--------------------------------------------------------------------------
  */

  const handleDownloadTemplate = async () => {
    try {
      const response = await api.get("/trainees/import-template", {
        responseType: "blob",
      });

      downloadBlob(response.data, "PTS_Trainees_Import_Template.xlsx");

      message.success("Excel import template downloaded.");
    } catch (error) {
      message.error("Could not download import template.");
    }
  };

  /*
  |--------------------------------------------------------------------------
  | EXPORT
  |--------------------------------------------------------------------------
  */

  const handleExportExcel = async () => {
    setExporting(true);

    try {
      const params = {};

      if (search.trim()) {
        params.search = search.trim();
      }

      if (courseId) {
        params.course_id = courseId;
      }

      if (platoonId) {
        params.platoon_id = platoonId;
      }

      if (courseStatus) {
        params.course_status = courseStatus;
      }

      const response = await api.get("/trainees/export", {
        params,

        responseType: "blob",

        timeout: 120000,
      });

      downloadBlob(
        response.data,

        Object.keys(params).length
          ? "PTS_Filtered_Trainees.xlsx"
          : "PTS_All_Trainees.xlsx",
      );

      message.success("Trainees exported successfully.");
    } catch (error) {
      message.error("Could not export trainees.");
    } finally {
      setExporting(false);
    }
  };

  /*
  |--------------------------------------------------------------------------
  | IMPORT
  |--------------------------------------------------------------------------
  */

  const handleImportExcel = async (file) => {
    setImporting(true);

    try {
      const formData = new FormData();

      formData.append("file", file);

      const response = await api.post("/trainees/import", formData, {
        timeout: 120000,
      });

      const result = response.data?.data || {};

      const failedRows = result.failed_rows || [];

      Modal[Number(result.failed || 0) > 0 ? "warning" : "success"]({
        title: "Excel Import Completed",

        width: 760,

        content: (
          <div
            style={{
              marginTop: 16,
            }}
          >
            <Descriptions bordered column={1} size="small">
              <Descriptions.Item label="Total Rows">
                {result.total_rows || 0}
              </Descriptions.Item>

              <Descriptions.Item label="New Trainee Course Records">
                <Tag color="green">{result.created || 0}</Tag>
              </Descriptions.Item>

              <Descriptions.Item label="Same-Course Records Updated">
                <Tag color="blue">{result.updated || 0}</Tag>
              </Descriptions.Item>

              <Descriptions.Item label="New Courses Created">
                <Tag color="purple">{result.courses_created || 0}</Tag>
              </Descriptions.Item>

              <Descriptions.Item label="New Platoons Created">
                <Tag color="cyan">{result.platoons_created || 0}</Tag>
              </Descriptions.Item>

              <Descriptions.Item label="ZKBioTime Synced">
                <Tag color="green">{result.zk_synced || 0}</Tag>
              </Descriptions.Item>

              <Descriptions.Item label="Course Dates Not Set">
                <Tag color="orange">{result.zk_course_date_not_set || 0}</Tag>
              </Descriptions.Item>

              <Descriptions.Item label="Historical / Upcoming">
                {result.zk_historical || 0}
              </Descriptions.Item>

              <Descriptions.Item label="Ambiguous Active Course">
                <Tag
                  color={
                    Number(result.zk_ambiguous || 0) > 0 ? "red" : "default"
                  }
                >
                  {result.zk_ambiguous || 0}
                </Tag>
              </Descriptions.Item>

              <Descriptions.Item label="ZKBioTime Pending">
                <Tag color="orange">{result.zk_pending || 0}</Tag>
              </Descriptions.Item>

              <Descriptions.Item label="Failed">
                <Tag color={Number(result.failed || 0) > 0 ? "red" : "green"}>
                  {result.failed || 0}
                </Tag>
              </Descriptions.Item>
            </Descriptions>

            {Number(result.courses_created || 0) > 0 && (
              <Alert
                type="info"
                showIcon
                style={{
                  marginTop: 16,
                }}
                message="New Courses were created."
                description="Courses page open karke new Courses ki Start Date aur End Date set karein. Us ke baad un Courses ke trainees automatically attendance lifecycle follow karenge."
              />
            )}

            {failedRows.length > 0 && (
              <>
                <Divider orientation="left">Failed Rows</Divider>

                <div
                  style={{
                    maxHeight: 250,

                    overflowY: "auto",
                  }}
                >
                  {failedRows.map((item, index) => (
                    <Alert
                      key={`${item.row}-${index}`}
                      type="error"
                      showIcon
                      style={{
                        marginBottom: 8,
                      }}
                      message={`Row ${item.row} - ${item.employee_id || "-"}`}
                      description={item.reason || "Unknown error"}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        ),
      });

      await Promise.all([
        loadCourses(),

        loadPlatoons(courseId || null),

        loadTrainees(1, pagination.pageSize),

        loadOverallTotal(),
      ]);
    } catch (error) {
      message.error(
        error.response?.data?.message || "Could not import Excel file.",
      );
    } finally {
      setImporting(false);
    }

    return false;
  };

  /*
  |--------------------------------------------------------------------------
  | ADD
  |--------------------------------------------------------------------------
  */

  const openAddTrainee = async () => {
    setFormMode("add");

    setEditingTrainee(null);

    setSelectedFormCourse(null);

    setFormPlatoons([]);

    form.resetFields();

    await loadCourses();

    form.setFieldsValue({
      course_name: "",

      platoon_number: "",
    });

    setFormOpen(true);
  };

  /*
  |--------------------------------------------------------------------------
  | EDIT
  |--------------------------------------------------------------------------
  */

  const openEditTrainee = async (record) => {
    try {
      setSaving(true);

      const loadedCourses = await loadCourses();

      const response = await api.get(`/trainees/${record.id}`);

      const trainee = response.data?.data || record;

      setFormMode("edit");

      setEditingTrainee(trainee);

      const matchedCourse = loadedCourses.find(
        (item) => Number(item.id) === Number(trainee.course_id),
      ) || {
        id: trainee.course_id,

        course_name: trainee.course_name,

        start_date: trainee.course_start_date,

        end_date: trainee.course_end_date,

        course_status: trainee.course_status,
      };

      setSelectedFormCourse(matchedCourse);

      if (trainee.course_id) {
        await loadPlatoons(trainee.course_id, "form");
      } else {
        setFormPlatoons([]);
      }

      form.setFieldsValue({
        employee_id: trainee.employee_id || "",

        first_name: trainee.first_name || "",

        last_name: trainee.last_name || "",

        father_name: trainee.father_name || "",

        belt_no: trainee.belt_no || "",

        cnic: trainee.cnic || "",

        phone: trainee.phone || "",

        email: trainee.email || "",

        address: trainee.address || "",

        course_name: trainee.course_name || "",

        platoon_number:
          trainee.platoon_number !== null &&
          trainee.platoon_number !== undefined
            ? String(trainee.platoon_number)
            : "",

        position: trainee.position || "",

        joining_date: trainee.joining_date
          ? String(trainee.joining_date).slice(0, 10)
          : "",

        remarks: trainee.remarks || "",
      });

      setFormOpen(true);
    } catch (error) {
      message.error(error.response?.data?.message || "Could not load trainee.");
    } finally {
      setSaving(false);
    }
  };

  /*
  |--------------------------------------------------------------------------
  | FORM COURSE CHANGE
  |--------------------------------------------------------------------------
  */

  const handleFormCourseChange = async (value) => {
    form.setFieldValue("course_name", value);

    form.setFieldValue("platoon_number", "");

    const matched = courses.find(
      (course) =>
        String(course.course_name || "")
          .trim()
          .toLowerCase() ===
        String(value || "")
          .trim()
          .toLowerCase(),
    );

    if (matched) {
      setSelectedFormCourse(matched);

      await loadPlatoons(matched.id, "form");
    } else {
      setSelectedFormCourse(
        value?.trim()
          ? {
              course_name: value.trim(),

              course_status: "DATE_NOT_SET",

              start_date: null,

              end_date: null,

              is_new: true,
            }
          : null,
      );

      setFormPlatoons([]);
    }
  };

  /*
  |--------------------------------------------------------------------------
  | SAVE
  |--------------------------------------------------------------------------
  */

  const handleSaveTrainee = async () => {
    try {
      const values = await form.validateFields();

      setSaving(true);

      const selectedCourse = courses.find(
        (course) =>
          String(course.course_name || "")
            .trim()
            .toLowerCase() ===
          String(values.course_name || "")
            .trim()
            .toLowerCase(),
      );

      const selectedPlatoon = formPlatoons.find(
        (platoon) =>
          String(platoon.platoon_number).trim() ===
          String(values.platoon_number || "").trim(),
      );

      const payload = {
        employee_id: values.employee_id?.trim(),

        first_name: values.first_name?.trim() || null,

        last_name: values.last_name?.trim() || null,

        father_name: values.father_name?.trim() || null,

        belt_no: values.belt_no?.trim() || null,

        cnic: values.cnic?.trim() || null,

        phone: values.phone?.trim() || null,

        email: values.email?.trim() || null,

        address: values.address?.trim() || null,

        course_id: selectedCourse?.id || null,

        course_name: values.course_name?.trim(),

        platoon_id: selectedPlatoon?.id || null,

        platoon_number: values.platoon_number?.trim() || null,

        position: values.position?.trim() || null,

        joining_date: values.joining_date || null,

        remarks: values.remarks?.trim() || null,
      };

      let response;

      if (formMode === "edit" && editingTrainee?.id) {
        response = await api.put(`/trainees/${editingTrainee.id}`, payload);
      } else {
        response = await api.post("/trainees", payload);
      }

      const master = response.data?.master_data || {};

      const zk = response.data?.zkbiotime || {};

      if (master.course_created) {
        message.success(
          `New Course "${master.course?.course_name}" automatically created.`,
        );

        message.info(
          "Courses page par ja kar is Course ki Start Date aur End Date set karein.",
        );
      }

      if (master.platoon_created) {
        message.success(
          `New Platoon "${master.platoon?.platoon_number}" automatically created.`,
        );
      }

      if (zk.status === "SYNCED") {
        message.success(
          formMode === "edit"
            ? "Trainee updated successfully."
            : "Trainee added successfully.",
        );
      } else if (zk.status === "COURSE_DATE_NOT_SET") {
        message.warning(
          "Trainee saved. Course dates set hone ke baad attendance aur current-course lifecycle active hoga.",
        );
      } else if (zk.status === "AMBIGUOUS") {
        message.warning(
          "Trainee saved, lekin same Employee ID ke multiple active Courses hain. ZKBioTime ownership assign nahi ki gayi.",
        );
      } else if (zk.status === "HISTORICAL") {
        message.success(
          zk.message || "Historical / upcoming Course record saved.",
        );
      } else {
        message.warning(zk.message || "Trainee saved, ZKBioTime sync pending.");
      }

      setFormOpen(false);

      setEditingTrainee(null);

      setSelectedFormCourse(null);

      form.resetFields();

      await Promise.all([
        loadCourses(),

        loadPlatoons(courseId || null),

        loadTrainees(pagination.current, pagination.pageSize),

        loadOverallTotal(),
      ]);
    } catch (error) {
      if (error?.errorFields) {
        return;
      }

      message.error(error.response?.data?.message || "Could not save trainee.");
    } finally {
      setSaving(false);
    }
  };

  /*
  |--------------------------------------------------------------------------
  | PROFILE
  |--------------------------------------------------------------------------
  */

  const openProfile = (record) => {
    if (typeof onOpenProfile !== "function") {
      message.error("Profile navigation is not available.");

      return;
    }

    onOpenProfile(record);
  };

  /*
  |--------------------------------------------------------------------------
  | PERMANENT DELETE
  |--------------------------------------------------------------------------
  */

  const showDeleteResult = (result) => {
    Modal[Number(result?.failed || 0) > 0 ? "warning" : "success"]({
      title: "Permanent Delete Completed",

      width: 650,

      content: (
        <Descriptions
          bordered
          column={1}
          size="small"
          style={{
            marginTop: 16,
          }}
        >
          <Descriptions.Item label="Selected">
            {result?.selected || 0}
          </Descriptions.Item>

          <Descriptions.Item label="Deleted">
            {result?.deleted || 0}
          </Descriptions.Item>

          <Descriptions.Item label="ZKBioTime Deleted">
            {result?.zk_deleted || 0}
          </Descriptions.Item>

          <Descriptions.Item label="ZKBioTime Protected">
            {result?.zk_protected || 0}
          </Descriptions.Item>

          <Descriptions.Item label="Raw Transactions Deleted">
            {result?.raw_transactions_deleted || 0}
          </Descriptions.Item>

          <Descriptions.Item label="Raw Transactions Protected">
            {result?.raw_transactions_protected || 0}
          </Descriptions.Item>

          <Descriptions.Item label="Failed">
            <Tag color={Number(result?.failed || 0) > 0 ? "red" : "green"}>
              {result?.failed || 0}
            </Tag>
          </Descriptions.Item>
        </Descriptions>
      ),
    });
  };

  const executePermanentDelete = async (ids, deleteRawTransactions) => {
    setBulkDeleting(true);

    try {
      const response = await api.post(
        "/data-management/trainees/permanent-delete",
        {
          ids,

          delete_raw_transactions: Boolean(deleteRawTransactions),
        },
      );

      showDeleteResult(response.data?.data || {});

      setSelectedRowKeys([]);

      await Promise.all([
        loadTrainees(1, pagination.pageSize),

        loadOverallTotal(),
      ]);
    } catch (error) {
      message.error(
        error.response?.data?.message || "Permanent trainee delete failed.",
      );

      throw error;
    } finally {
      setBulkDeleting(false);
    }
  };

  const confirmPermanentDelete = (ids, label) => {
    if (!ids.length) {
      message.warning("Please select at least one trainee.");

      return;
    }

    let confirmationText = "";

    let deleteRawTransactions = false;

    Modal.confirm({
      title: `Permanently Delete ${label}?`,

      width: 680,

      okText: "Permanently Delete",

      okType: "danger",

      content: (
        <div>
          <Alert
            type="error"
            showIcon
            message="This action cannot be undone."
            style={{
              marginBottom: 16,
            }}
          />

          <Alert
            type="info"
            showIcon
            message="Same Employee ID in another Course or Staff record is protected."
            description="ZKBioTime identity aur raw transactions tabhi delete honge jab same Employee ID kisi aur protected record mein use na ho."
            style={{
              marginBottom: 16,
            }}
          />

          <p>
            Selected trainee record(s): <strong>{ids.length}</strong>
          </p>

          <Checkbox
            onChange={(event) => {
              deleteRawTransactions = event.target.checked;
            }}
          >
            Also delete raw biometric transactions when safe
          </Checkbox>

          <div
            style={{
              marginTop: 16,
            }}
          >
            <Text>
              Type <Text code>DELETE</Text> to confirm:
            </Text>

            <Input
              style={{
                marginTop: 8,
              }}
              placeholder="DELETE"
              onChange={(event) => {
                confirmationText = event.target.value;
              }}
            />
          </div>
        </div>
      ),

      async onOk() {
        if (confirmationText.trim().toUpperCase() !== "DELETE") {
          message.error('Type "DELETE" exactly.');

          throw new Error("DELETE_CONFIRMATION_REQUIRED");
        }

        await executePermanentDelete(ids, deleteRawTransactions);
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
      title: "Sr.#",

      key: "serial_number",

      width: 72,

      align: "center",

      fixed: "left",

      render: (_, __, index) =>
        (pagination.current - 1) * pagination.pageSize + index + 1,
    },

    {
      title: "Employee ID / Cap No.",

      dataIndex: "employee_id",

      width: 175,

      fixed: "left",

      render: (value, record) => (
        <Button
          type="link"
          size="small"
          style={{
            padding: 0,

            height: "auto",

            fontWeight: 600,
          }}
          onClick={() => openProfile(record)}
        >
          {value || "-"}
        </Button>
      ),
    },

    {
      title: "Name",

      width: 210,

      render: (_, record) =>
        [record.first_name, record.last_name].filter(Boolean).join(" ") || "-",
    },

    {
      title: "Course",

      dataIndex: "course_name",

      width: 230,

      render: (value) => value || "-",
    },

    {
      title: "Course Period",

      width: 235,

      render: (_, record) =>
        record.course_start_date && record.course_end_date ? (
          `${formatDate(record.course_start_date)} → ${formatDate(
            record.course_end_date,
          )}`
        ) : (
          <Tag color="orange">Dates Not Set</Tag>
        ),
    },

    {
      title: "Course Status",

      dataIndex: "course_status",

      width: 135,

      align: "center",

      render: (value) => (
        <Tag color={courseStatusColor(value)}>{courseStatusLabel(value)}</Tag>
      ),
    },

    {
      title: "Platoon",

      dataIndex: "platoon_number",

      width: 100,

      align: "center",

      render: (value) => value ?? "-",
    },


    {
      title: "ZKBioTime",

      width: 145,

      align: "center",

      render: (_, record) => (
        <Tag color={record.zkteco_synced ? "green" : "default"}>
          {record.zkteco_synced ? "Synced" : "Not Current"}
        </Tag>
      ),
    },

    {
      title: "Actions",

      width: 145,

      fixed: "right",

      render: (_, record) => (
        <Space>
          <Button
            type="text"
            icon={<EyeOutlined />}
            title="Open Profile"
            onClick={() => openProfile(record)}
          />

          {canEdit && (
            <Button
              type="text"
              icon={<EditOutlined />}
              title="Edit Trainee"
              onClick={() => openEditTrainee(record)}
            />
          )}

          {canPermanentDelete && (
            <Button
              type="text"
              danger
              icon={<DeleteOutlined />}
              title="Permanent Delete"
              onClick={() =>
                confirmPermanentDelete(
                  [record.id],

                  `${record.employee_id} / ${record.course_name || "No Course"}`,
                )
              }
            />
          )}
        </Space>
      ),
    },
  ];

  const rowSelection = canPermanentDelete
    ? {
        selectedRowKeys,

        preserveSelectedRowKeys: true,

        onChange: (keys) => setSelectedRowKeys(keys),
      }
    : undefined;

  /*
  |--------------------------------------------------------------------------
  | UI
  |--------------------------------------------------------------------------
  */

  return (
    <div
      style={{
        marginTop: -8,
      }}
    >
      <div
        style={{
          display: "flex",

          justifyContent: "space-between",

          alignItems: "center",

          gap: 10,

          marginBottom: 8,

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
            Trainees
          </Title>

          <Text type="secondary">
            Employee ID / Cap No. par click karke detailed Trainee Profile open
            karein.
          </Text>
        </div>

        <Space wrap size={8}>
          <Button icon={<DownloadOutlined />} onClick={handleDownloadTemplate}>
            Download Template
          </Button>

          {canEdit && (
            <Upload
              accept=".xlsx,.xls"
              maxCount={1}
              showUploadList={false}
              beforeUpload={handleImportExcel}
            >
              <Button icon={<UploadOutlined />} loading={importing}>
                Import Excel
              </Button>
            </Upload>
          )}

          <Button
            icon={<FileExcelOutlined />}
            loading={exporting}
            onClick={handleExportExcel}
          >
            Export Excel
          </Button>

          {canEdit && (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={openAddTrainee}
            >
              Add Trainee
            </Button>
          )}
        </Space>
      </div>

      <Card
        style={{
          marginBottom: 10,
        }}
      >
        <Space wrap>
          <Input
            allowClear
            value={search}
            prefix={<SearchOutlined />}
            placeholder="Employee ID / Cap No. or Name"
            style={{
              width: 260,
            }}
            onChange={(event) => setSearch(event.target.value)}
            onPressEnter={handleSearch}
          />

          <Select
            allowClear
            showSearch
            loading={courseLoading}
            placeholder="Course"
            value={courseId}
            style={{
              width: 260,
            }}
            options={courseOptions}
            optionFilterProp="label"
            onChange={handleFilterCourseChange}
          />

          <Select
            allowClear
            showSearch
            loading={platoonLoading}
            placeholder="Platoon"
            value={platoonId}
            style={{
              width: 130,
            }}
            options={platoonOptions}
            optionFilterProp="label"
            onChange={(value) => setPlatoonId(value || null)}
          />

          <Select
            allowClear
            placeholder="Course Status"
            value={courseStatus}
            style={{
              width: 180,
            }}
            options={COURSE_STATUS_OPTIONS}
            onChange={(value) => setCourseStatus(value || null)}
          />


          <Button
            type="primary"
            icon={<SearchOutlined />}
            onClick={handleSearch}
          >
            Search
          </Button>

          <Button icon={<ReloadOutlined />} onClick={handleReset}>
            Reset
          </Button>
        </Space>
      </Card>

      <Card
        styles={{
          body: {
            paddingTop: 12,
          },
        }}
      >
        <div
          style={{
            display: "flex",

            justifyContent: "flex-start",

            alignItems: "center",

            gap: 10,

            minHeight: 36,

            marginBottom: 6,
          }}
        >
          <Text>
            Total:{" "}
            <strong>
              {pagination.total}/{overallTotal}
            </strong>
          </Text>

          {canPermanentDelete && (
            <Button
              danger
              icon={<DeleteOutlined />}
              loading={bulkDeleting}
              disabled={!selectedRowKeys.length}
              onClick={() =>
                confirmPermanentDelete(
                  selectedRowKeys,

                  `${selectedRowKeys.length} Trainee(s)`,
                )
              }
            >
              Delete Selected
              {selectedRowKeys.length ? ` (${selectedRowKeys.length})` : ""}
            </Button>
          )}
        </div>

        <Table
          rowKey="id"
          rowSelection={rowSelection}
          loading={loading}
          columns={columns}
          dataSource={trainees}
          scroll={{
            x: 1680,
          }}
          pagination={{
            current: pagination.current,

            pageSize: pagination.pageSize,

            total: pagination.total,

            position: ["bottomRight"],

            showSizeChanger: true,

            showQuickJumper: true,

            showLessItems: true,

            pageSizeOptions: ["10", "25", "50", "100"],

            showTotal: (total, range) => `${range[0]}-${range[1]} of ${total}`,
          }}
          onChange={(tablePagination) =>
            loadTrainees(tablePagination.current, tablePagination.pageSize)
          }
        />
      </Card>

      <Drawer
        title={formMode === "edit" ? "Edit Trainee" : "Add Trainee"}
        width={720}
        open={formOpen}
        destroyOnHidden
        onClose={() => {
          setFormOpen(false);

          setEditingTrainee(null);

          setSelectedFormCourse(null);

          form.resetFields();
        }}
        extra={
          <Space>
            <Button onClick={() => setFormOpen(false)}>Cancel</Button>

            <Button type="primary" loading={saving} onClick={handleSaveTrainee}>
              {formMode === "edit" ? "Update Trainee" : "Save Trainee"}
            </Button>
          </Space>
        }
      >
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="employee_id"
                label="Employee ID / Cap No."
                rules={[
                  {
                    required: true,

                    message: "Employee ID / Cap No. is required.",
                  },
                ]}
              >
                <Input disabled={formMode === "edit"} />
              </Form.Item>
            </Col>
          </Row>

          <Divider orientation="left">Personal Information</Divider>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="first_name" label="First Name">
                <Input />
              </Form.Item>
            </Col>

            <Col span={12}>
              <Form.Item name="last_name" label="Last Name">
                <Input />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="father_name" label="Father Name">
                <Input />
              </Form.Item>
            </Col>

            <Col span={12}>
              <Form.Item name="belt_no" label="Belt #">
                <Input />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="cnic" label="CNIC">
                <Input />
              </Form.Item>
            </Col>

            <Col span={12}>
              <Form.Item name="phone" label="Phone">
                <Input />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="email" label="Email">
                <Input />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="address" label="Address">
            <TextArea rows={2} />
          </Form.Item>

          <Divider orientation="left">Course & Training Assignment</Divider>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="course_name"
                label="Course"
                rules={[
                  {
                    required: true,

                    message: "Course is required.",
                  },
                ]}
              >
                <AutoComplete
                  options={formCourseOptions}
                  placeholder="Select or type new Course"
                  filterOption={(inputValue, option) =>
                    String(option?.value || "")
                      .toLowerCase()
                      .includes(inputValue.toLowerCase())
                  }
                  onChange={handleFormCourseChange}
                />
              </Form.Item>
            </Col>

            <Col span={12}>
              <Form.Item name="platoon_number" label="Platoon">
                <AutoComplete
                  options={formPlatoonOptions}
                  placeholder="Select or type new Platoon No."
                  filterOption={(inputValue, option) =>
                    String(option?.value || "")
                      .toLowerCase()
                      .includes(inputValue.toLowerCase())
                  }
                />
              </Form.Item>
            </Col>
          </Row>

          {selectedFormCourse && (
            <Card
              size="small"
              style={{
                marginBottom: 20,
              }}
            >
              <Descriptions size="small" bordered column={1}>
                <Descriptions.Item label="Course">
                  {selectedFormCourse.course_name || "-"}
                </Descriptions.Item>

                <Descriptions.Item label="Start Date">
                  {formatDate(selectedFormCourse.start_date)}
                </Descriptions.Item>

                <Descriptions.Item label="End Date">
                  {formatDate(selectedFormCourse.end_date)}
                </Descriptions.Item>

                <Descriptions.Item label="Course Status">
                  <Tag
                    color={courseStatusColor(selectedFormCourse.course_status)}
                  >
                    {courseStatusLabel(selectedFormCourse.course_status)}
                  </Tag>
                </Descriptions.Item>
              </Descriptions>

              {selectedFormCourse.is_new && (
                <Alert
                  type="warning"
                  showIcon
                  style={{
                    marginTop: 12,
                  }}
                  message="This is a new Course."
                  description="Course save ho jayega lekin Start/End Date initially blank honge. Courses page se dates set karna zaroori hoga."
                />
              )}
            </Card>
          )}

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="joining_date" label="Joining Date">
                <Input type="date" />
              </Form.Item>
            </Col>

            <Col span={12}>
              <Form.Item name="position" label="Position / Source Position">
                <Input />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="remarks" label="Remarks">
            <TextArea rows={3} />
          </Form.Item>
        </Form>
      </Drawer>
    </div>
  );
}
