import { employeeCode, formatAbsenceDuration } from "../utils/dashboardRecords";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  Alert,
  Badge,
  Button,
  Card,
  Col,
  DatePicker,
  Input,
  Row,
  Select,
  Space,
  Statistic,
  Tag,
  Typography,
  message,
} from "antd";
import Table from "../components/SerialTable";

import {
  CalendarOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  DownloadOutlined,
  FilePdfOutlined,
  ReloadOutlined,
  SearchOutlined,
  TeamOutlined,
  ThunderboltOutlined,
  UserOutlined,
} from "@ant-design/icons";

import dayjs from "dayjs";

import api from "../services/api";

import { useAuth } from "../contexts/AuthContext";

const { Title, Text } = Typography;

const DEFAULT_PAGE_SIZE = 50;

const SEARCH_DEBOUNCE_MS = 450;

const PRINT_PAGE_SIZE = 200;

const EMPTY_ATTENDANCE_SUMMARY = {
  total: 0,
  present: 0,
  absent: 0,
  exempt: 0,
  no_timetable: 0,
  in_time: 0,
  early: 0,
  late: 0,
  manual_absence: 0,
  detained: 0,
  pending: 0,
  checked_out: 0,
  missing_checkout: 0,
  pending_checkout: 0,
};

const EMPTY_CONTINUOUS_SUMMARY = {
  total: 0,
  open: 0,
  returned: 0,
};

function statusColor(value) {
  if (["PRESENT", "RETURNED"].includes(value)) {
    return "green";
  }

  if (["ABSENT", "OPEN"].includes(value)) {
    return "red";
  }

  if (value === "EXEMPT") {
    return "blue";
  }

  if (value === "NO_TIMETABLE") {
    return "orange";
  }

  if (value === "DETAINED") {
    return "purple";
  }

  if (value === "PENDING") {
    return "gold";
  }

  if (value === "MISSING") {
    return "red";
  }

  if (value === "CHECKED_OUT") {
    return "green";
  }

  return "default";
}

function timingColor(value) {
  if (value === "IN_TIME") {
    return "green";
  }

  if (value === "EARLY") {
    return "cyan";
  }

  if (value === "LATE") {
    return "orange";
  }

  if (value === "NO_PUNCH") {
    return "red";
  }

  if (value === "EXEMPT") {
    return "blue";
  }

  return "default";
}

function formatPunch(value) {
  if (!value) {
    return "-";
  }

  const parsed = dayjs(value);

  return parsed.isValid() ? parsed.format("hh:mm:ss A") : String(value);
}

function formatClock(value) {
  if (!value) {
    return "-";
  }

  const text = String(value).slice(0, 8);
  const parsed = dayjs(`2000-01-01T${text}`);

  return parsed.isValid() ? parsed.format("hh:mm A") : String(value);
}

function formatDateTime(value) {
  if (!value) {
    return "-";
  }

  const parsed = dayjs(value);

  return parsed.isValid()
    ? parsed.format("DD-MMM-YYYY hh:mm:ss A")
    : String(value);
}

function formatDuration(seconds, label) {
  if (label) {
    return label;
  }

  const total = Math.max(0, Math.floor(Number(seconds) || 0));

  const days = Math.floor(total / 86400);

  const hours = Math.floor((total % 86400) / 3600);

  const minutes = Math.floor((total % 3600) / 60);

  const secs = total % 60;

  const pad = (value) => String(value).padStart(2, "0");

  if (days > 0) {
    return `${days}d ${pad(hours)}h ${pad(minutes)}m ${pad(secs)}s`;
  }

  return `${pad(hours)}h ${pad(minutes)}m ${pad(secs)}s`;
}

function downloadBlob(blob, filename) {
  const url = window.URL.createObjectURL(blob);

  const anchor = document.createElement("a");

  anchor.href = url;

  anchor.download = filename;

  document.body.appendChild(anchor);

  anchor.click();

  anchor.remove();

  window.URL.revokeObjectURL(url);
}

function resolveSubjectId(record) {
  return record?.subject_id || record?.trainee_id || record?.staff_id || null;
}

function getPlatoonLabel(record) {
  if (record?.platoon_number !== null && record?.platoon_number !== undefined) {
    return record.platoon_name
      ? `Platoon ${record.platoon_number} - ${record.platoon_name}`
      : `Platoon ${record.platoon_number}`;
  }

  return record?.platoon_name || "-";
}

function FieldLabel({ children }) {
  return (
    <Text
      type="secondary"
      style={{
        display: "block",

        marginBottom: 4,

        fontSize: 11,
      }}
    >
      {children}
    </Text>
  );
}

function SummaryCard({
  title,
  value,
  icon,
  accent,
  soft,
  active = false,
  onClick,
}) {
  return (
    <Card
      hoverable={Boolean(onClick)}
      onClick={onClick}
      style={{
        height: "100%",

        borderRadius: 12,

        border: active ? `2px solid ${accent}` : `1px solid ${accent}25`,

        background: `linear-gradient(135deg,#ffffff,${soft})`,

        boxShadow: active
          ? `0 5px 18px ${accent}25`
          : "0 4px 16px rgba(15,23,42,.045)",

        cursor: onClick ? "pointer" : "default",
      }}
      styles={{
        body: {
          padding: "14px 15px",
        },
      }}
    >
      <Statistic
        title={title}
        value={value || 0}
        prefix={icon}
        valueStyle={{
          color: accent,

          fontWeight: 800,
        }}
      />
    </Card>
  );
}

export default function Reports({ onOpenProfile }) {
  const { hasPermission } = useAuth();

  const canExport = hasPermission("reports.export");

  /*
  |--------------------------------------------------------------------------
  | REPORT TYPE / DATE
  |--------------------------------------------------------------------------
  */

  const [reportType, setReportType] = useState("TRAINEE_MORNING");

  const [attendanceDate, setAttendanceDate] = useState(dayjs());

  const [absenceDateFrom, setAbsenceDateFrom] = useState(dayjs());

  const [absenceDateTo, setAbsenceDateTo] = useState(dayjs());

  const [continuousSubjectType, setContinuousSubjectType] = useState("ALL");

  const [continuousStatus, setContinuousStatus] = useState("ALL");

  /*
  |--------------------------------------------------------------------------
  | FILTERS
  |--------------------------------------------------------------------------
  */

  const [search, setSearch] = useState("");

  const [debouncedSearch, setDebouncedSearch] = useState("");

  const [attendanceStatus, setAttendanceStatus] = useState(null);

  const [timingStatus, setTimingStatus] = useState(null);

  const [courseId, setCourseId] = useState(null);

  const [platoonId, setPlatoonId] = useState(null);

  const [categoryId, setCategoryId] = useState(null);

  const [branchId, setBranchId] = useState(null);

  const [customGroupId, setCustomGroupId] = useState(null);

  const [customShiftId, setCustomShiftId] = useState(null);

  const [customShiftFilters, setCustomShiftFilters] = useState({
    groups: [],
    shifts: [],
  });

  /*
  |--------------------------------------------------------------------------
  | LOOKUPS
  |--------------------------------------------------------------------------
  */

  const [filters, setFilters] = useState({
    courses: [],
    platoons: [],
    categories: [],
    branches: [],
  });

  /*
  |--------------------------------------------------------------------------
  | REPORT DATA
  |--------------------------------------------------------------------------
  */

  const [rows, setRows] = useState([]);

  const [summary, setSummary] = useState(EMPTY_ATTENDANCE_SUMMARY);

  const [pagination, setPagination] = useState({
    current: 1,

    pageSize: DEFAULT_PAGE_SIZE,

    total: 0,
  });

  const [loading, setLoading] = useState(false);

  const [exporting, setExporting] = useState(false);

  const [printing, setPrinting] = useState(false);

  const [printRows, setPrintRows] = useState([]);

  /*
  |--------------------------------------------------------------------------
  | REQUEST PROTECTION
  |--------------------------------------------------------------------------
  */

  const requestIdRef = useRef(0);

  /*
  |--------------------------------------------------------------------------
  | REPORT MODE
  |--------------------------------------------------------------------------
  */

  const isLongWeekendReport = reportType === "LONG_WEEKEND";

  const isContinuousAbsenceReport = reportType === "CONTINUOUS_ABSENCE";

  const isCustomShiftReport = reportType === "CUSTOM_SHIFT";

  const attendanceSubjectType =
    isLongWeekendReport || reportType.startsWith("TRAINEE")
      ? "TRAINEE"
      : "STAFF";

  const subjectType = isContinuousAbsenceReport
    ? continuousSubjectType === "ALL"
      ? null
      : continuousSubjectType
    : attendanceSubjectType;

  const sessionType = reportType.endsWith("MORNING") ? "MORNING" : "EVENING";

  const isTrainee = subjectType === "TRAINEE";

  const isStaff = subjectType === "STAFF";

  const showTraineeFilters = isContinuousAbsenceReport
    ? continuousSubjectType !== "STAFF"
    : isTrainee;

  const showStaffFilters = isContinuousAbsenceReport
    ? continuousSubjectType !== "TRAINEE"
    : isStaff;

  /*
  |--------------------------------------------------------------------------
  | SEARCH DEBOUNCE
  |--------------------------------------------------------------------------
  */

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search.trim());
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
    };
  }, [search]);

  /*
  |--------------------------------------------------------------------------
  | LOAD LOOKUPS
  |--------------------------------------------------------------------------
  */

  const loadFilters = useCallback(async () => {
    try {
      const response = await api.get("/reports/attendance/filters");

      setFilters(
        response.data?.data || {
          courses: [],
          platoons: [],
          categories: [],
          branches: [],
        },
      );
    } catch (error) {
      message.error(
        error.response?.data?.message || "Could not load report filters.",
      );
    }
  }, []);

  useEffect(() => {
    loadFilters();
  }, [loadFilters]);

  const loadCustomShiftFilters = useCallback(async () => {
    if (!isCustomShiftReport || !attendanceDate) {
      setCustomShiftFilters({
        groups: [],
        shifts: [],
      });
      return;
    }

    try {
      const response = await api.get("/reports/custom-shifts/filters", {
        params: {
          attendance_date: attendanceDate.format("YYYY-MM-DD"),
        },
      });

      setCustomShiftFilters(
        response.data?.data || {
          groups: [],
          shifts: [],
        },
      );
    } catch (error) {
      setCustomShiftFilters({
        groups: [],
        shifts: [],
      });

      message.error(
        error.response?.data?.message ||
          "Could not load Custom Shift report filters.",
      );
    }
  }, [isCustomShiftReport, attendanceDate]);

  useEffect(() => {
    loadCustomShiftFilters();
  }, [loadCustomShiftFilters]);

  useEffect(() => {
    if (!isCustomShiftReport) {
      return;
    }

    if (
      customGroupId &&
      !(customShiftFilters.groups || []).some(
        (item) => Number(item.id) === Number(customGroupId),
      )
    ) {
      setCustomGroupId(null);
      setCustomShiftId(null);
      return;
    }

    if (
      customShiftId &&
      !(customShiftFilters.shifts || []).some(
        (item) => Number(item.id) === Number(customShiftId),
      )
    ) {
      setCustomShiftId(null);
    }
  }, [
    isCustomShiftReport,
    customShiftFilters.groups,
    customShiftFilters.shifts,
    customGroupId,
    customShiftId,
  ]);

  /*
  |--------------------------------------------------------------------------
  | LOOKUP OPTIONS
  |--------------------------------------------------------------------------
  */

  const platoonOptions = useMemo(
    () =>
      (filters.platoons || [])
        .filter(
          (item) => !courseId || Number(item.course_id) === Number(courseId),
        )
        .map((item) => ({
          value: item.id,

          label: item.platoon_name
            ? `Platoon ${item.platoon_number} - ${item.platoon_name}`
            : `Platoon ${item.platoon_number}`,
        })),
    [filters.platoons, courseId],
  );

  const branchOptions = useMemo(
    () =>
      (filters.branches || [])
        .filter(
          (item) =>
            !categoryId || Number(item.category_id) === Number(categoryId),
        )
        .map((item) => ({
          value: item.id,

          label: item.branch_name,
        })),
    [filters.branches, categoryId],
  );

  const customGroupOptions = useMemo(
    () =>
      (customShiftFilters.groups || []).map((item) => ({
        value: item.id,
        label: item.group_name,
      })),
    [customShiftFilters.groups],
  );

  const customShiftOptions = useMemo(
    () =>
      (customShiftFilters.shifts || [])
        .filter(
          (item) =>
            !customGroupId || Number(item.group_id) === Number(customGroupId),
        )
        .map((item) => ({
          value: item.id,
          label: item.duty_point_name
            ? `${item.shift_name} - ${item.duty_point_name}`
            : item.shift_name,
        })),
    [customShiftFilters.shifts, customGroupId],
  );

  /*
  |--------------------------------------------------------------------------
  | SELECTED LOOKUPS
  |--------------------------------------------------------------------------
  */

  const selectedCourse = useMemo(
    () =>
      (filters.courses || []).find(
        (item) => Number(item.id) === Number(courseId),
      ),
    [filters.courses, courseId],
  );

  const selectedPlatoon = useMemo(
    () =>
      (filters.platoons || []).find(
        (item) => Number(item.id) === Number(platoonId),
      ),
    [filters.platoons, platoonId],
  );

  const selectedCategory = useMemo(
    () =>
      (filters.categories || []).find(
        (item) => Number(item.id) === Number(categoryId),
      ),
    [filters.categories, categoryId],
  );

  const selectedBranch = useMemo(
    () =>
      (filters.branches || []).find(
        (item) => Number(item.id) === Number(branchId),
      ),
    [filters.branches, branchId],
  );

  const selectedCustomGroup = useMemo(
    () =>
      (customShiftFilters.groups || []).find(
        (item) => Number(item.id) === Number(customGroupId),
      ),
    [customShiftFilters.groups, customGroupId],
  );

  const selectedCustomShift = useMemo(
    () =>
      (customShiftFilters.shifts || []).find(
        (item) => Number(item.id) === Number(customShiftId),
      ),
    [customShiftFilters.shifts, customShiftId],
  );

  /*
  |--------------------------------------------------------------------------
  | PARAM BUILDER
  |--------------------------------------------------------------------------
  */

  const buildParams = useCallback(
    (page = 1, pageSize = DEFAULT_PAGE_SIZE) => {
      /*
        |--------------------------------------------------------------------------
        | CONTINUOUS ABSENCE
        |--------------------------------------------------------------------------
        */

      if (isContinuousAbsenceReport) {
        if (!absenceDateFrom || !absenceDateTo) {
          return null;
        }

        const params = {
          date_from: absenceDateFrom.format("YYYY-MM-DD"),

          date_to: absenceDateTo.format("YYYY-MM-DD"),

          page,

          page_size: pageSize,
        };

        if (continuousSubjectType !== "ALL") {
          params.subject_type = continuousSubjectType;
        }

        if (continuousStatus !== "ALL") {
          params.status = continuousStatus;
        }

        if (debouncedSearch) {
          params.search = debouncedSearch;
        }

        if (courseId) {
          params.course_id = courseId;
        }

        if (platoonId) {
          params.platoon_id = platoonId;
        }

        if (categoryId) {
          params.category_id = categoryId;
        }

        if (branchId) {
          params.branch_id = branchId;
        }

        return params;
      }

      /*
        |--------------------------------------------------------------------------
        | CUSTOM SHIFT DUTY
        |--------------------------------------------------------------------------
        */

      if (isCustomShiftReport) {
        if (!attendanceDate) {
          return null;
        }

        const params = {
          attendance_date: attendanceDate.format("YYYY-MM-DD"),
          page,
          page_size: pageSize,
        };

        if (debouncedSearch) {
          params.search = debouncedSearch;
        }

        if (attendanceStatus) {
          params.attendance_status = attendanceStatus;
        }

        if (customGroupId) {
          params.group_id = customGroupId;
        }

        if (customShiftId) {
          params.shift_id = customShiftId;
        }

        if (categoryId) {
          params.category_id = categoryId;
        }

        if (branchId) {
          params.branch_id = branchId;
        }

        return params;
      }

      /*
        |--------------------------------------------------------------------------
        | ATTENDANCE / LONG WEEKEND
        |--------------------------------------------------------------------------
        */

      if (!attendanceDate) {
        return null;
      }

      const params = {
        attendance_date: attendanceDate.format("YYYY-MM-DD"),

        page,

        page_size: pageSize,
      };

      if (!isLongWeekendReport) {
        params.subject_type = attendanceSubjectType;

        params.session_type = sessionType;
      }

      if (debouncedSearch) {
        params.search = debouncedSearch;
      }

      if (attendanceStatus) {
        params.attendance_status = attendanceStatus;
      }

      if (timingStatus) {
        params.timing_status = timingStatus;
      }

      if (isTrainee) {
        if (courseId) {
          params.course_id = courseId;
        }

        if (platoonId) {
          params.platoon_id = platoonId;
        }
      } else {
        if (categoryId) {
          params.category_id = categoryId;
        }

        if (branchId) {
          params.branch_id = branchId;
        }
      }

      return params;
    },
    [
      isContinuousAbsenceReport,
      isCustomShiftReport,
      absenceDateFrom,
      absenceDateTo,
      continuousSubjectType,
      continuousStatus,
      debouncedSearch,
      courseId,
      platoonId,
      categoryId,
      branchId,
      customGroupId,
      customShiftId,
      attendanceDate,
      isLongWeekendReport,
      attendanceSubjectType,
      sessionType,
      attendanceStatus,
      timingStatus,
      isTrainee,
    ],
  );

  /*
  |--------------------------------------------------------------------------
  | ENDPOINTS
  |--------------------------------------------------------------------------
  */

  const reportEndpoint = useMemo(() => {
    if (isContinuousAbsenceReport) {
      return "/reports/continuous-absence";
    }

    if (isLongWeekendReport) {
      return "/reports/long-weekend";
    }

    if (isCustomShiftReport) {
      return "/reports/custom-shifts";
    }

    return "/reports/attendance";
  }, [isContinuousAbsenceReport, isLongWeekendReport, isCustomShiftReport]);

  const exportEndpoint = useMemo(() => {
    if (isContinuousAbsenceReport) {
      return "/reports/continuous-absence/export";
    }

    if (isLongWeekendReport) {
      return "/reports/long-weekend/export";
    }

    if (isCustomShiftReport) {
      return "/reports/custom-shifts/export";
    }

    return "/reports/attendance/export";
  }, [isContinuousAbsenceReport, isLongWeekendReport, isCustomShiftReport]);

  /*
  |--------------------------------------------------------------------------
  | LOAD REPORT
  |--------------------------------------------------------------------------
  */

  const loadReport = useCallback(
    async (page = 1, pageSize = DEFAULT_PAGE_SIZE) => {
      const params = buildParams(page, pageSize);

      if (!params) {
        return;
      }

      const requestId = requestIdRef.current + 1;

      requestIdRef.current = requestId;

      setLoading(true);

      try {
        const response = await api.get(reportEndpoint, {
          params,
        });

        if (requestId !== requestIdRef.current) {
          return;
        }

        const data = response.data?.data || {};

        setRows(data.rows || []);

        if (isContinuousAbsenceReport) {
          setSummary({
            ...EMPTY_CONTINUOUS_SUMMARY,

            ...(data.summary || {}),
          });
        } else {
          setSummary({
            ...EMPTY_ATTENDANCE_SUMMARY,

            ...(data.summary || {}),
          });
        }

        setPagination({
          current: Number(data.pagination?.page) || page,

          pageSize: Number(data.pagination?.pageSize) || pageSize,

          total: Number(data.pagination?.total) || 0,
        });
      } catch (error) {
        if (requestId !== requestIdRef.current) {
          return;
        }

        let fallbackMessage = "Could not load attendance report.";

        if (isLongWeekendReport) {
          fallbackMessage = "Could not load Long Weekend report.";
        }

        if (isContinuousAbsenceReport) {
          fallbackMessage = "Could not load Continuous Absence report.";
        }

        if (isCustomShiftReport) {
          fallbackMessage = "Could not load Custom Shift Duty report.";
        }

        message.error(error.response?.data?.message || fallbackMessage);

        setRows([]);

        setSummary(
          isContinuousAbsenceReport
            ? EMPTY_CONTINUOUS_SUMMARY
            : EMPTY_ATTENDANCE_SUMMARY,
        );
      } finally {
        if (requestId === requestIdRef.current) {
          setLoading(false);
        }
      }
    },
    [
      buildParams,
      reportEndpoint,
      isContinuousAbsenceReport,
      isLongWeekendReport,
      isCustomShiftReport,
    ],
  );

  /*
  |--------------------------------------------------------------------------
  | AUTO LOAD
  |--------------------------------------------------------------------------
  */

  useEffect(() => {
    const timer = setTimeout(() => {
      loadReport(1, pagination.pageSize || DEFAULT_PAGE_SIZE);
    }, 80);

    return () => {
      clearTimeout(timer);
    };
  }, [
    reportType,
    attendanceDate,
    absenceDateFrom,
    absenceDateTo,
    continuousSubjectType,
    continuousStatus,
    debouncedSearch,
    attendanceStatus,
    timingStatus,
    courseId,
    platoonId,
    categoryId,
    branchId,
    customGroupId,
    customShiftId,
    loadReport,
    pagination.pageSize,
  ]);

  /*
  |--------------------------------------------------------------------------
  | REPORT TYPE CHANGE
  |--------------------------------------------------------------------------
  */

  const handleReportTypeChange = (value) => {
    setReportType(value);

    setSearch("");

    setDebouncedSearch("");

    setAttendanceStatus(null);

    setTimingStatus(null);

    setContinuousStatus("ALL");

    setContinuousSubjectType("ALL");

    setCourseId(null);

    setPlatoonId(null);

    setCategoryId(null);

    setBranchId(null);

    setCustomGroupId(null);

    setCustomShiftId(null);

    setRows([]);

    setPagination((previous) => ({
      ...previous,

      current: 1,

      total: 0,
    }));
  };

  const handleContinuousSubjectChange = (value) => {
    setContinuousSubjectType(value);

    if (value === "TRAINEE") {
      setCategoryId(null);

      setBranchId(null);
    } else if (value === "STAFF") {
      setCourseId(null);

      setPlatoonId(null);
    }
  };

  /*
  |--------------------------------------------------------------------------
  | RESET FILTERS
  |--------------------------------------------------------------------------
  */

  const resetFilters = () => {
    setSearch("");

    setDebouncedSearch("");

    setAttendanceStatus(null);

    setTimingStatus(null);

    setContinuousStatus("ALL");

    setCourseId(null);

    setPlatoonId(null);

    setCategoryId(null);

    setBranchId(null);

    setCustomGroupId(null);

    setCustomShiftId(null);
  };

  /*
  |--------------------------------------------------------------------------
  | QUICK FILTERS
  |--------------------------------------------------------------------------
  */

  const toggleAttendanceStatus = (value) => {
    setAttendanceStatus((previous) => (previous === value ? null : value));
  };

  const toggleTimingStatus = (value) => {
    setTimingStatus((previous) => (previous === value ? null : value));
  };

  const toggleContinuousStatus = (value) => {
    setContinuousStatus((previous) => (previous === value ? "ALL" : value));
  };

  /*
  |--------------------------------------------------------------------------
  | PROFILE
  |--------------------------------------------------------------------------
  */

  const openProfile = (record) => {
    const subjectId = resolveSubjectId(record);

    if (!subjectId) {
      message.error("Profile record ID report data mein available nahi hai.");

      return;
    }

    if (typeof onOpenProfile !== "function") {
      message.warning(
        "Profile navigation abhi Reports page ke sath connect nahi hai.",
      );

      return;
    }

    const recordSubjectType =
      record?.subject_type || subjectType || attendanceSubjectType;

    onOpenProfile({
      subjectType: recordSubjectType,

      subjectId,
    });
  };

  /*
  |--------------------------------------------------------------------------
  | EXCEL EXPORT
  |--------------------------------------------------------------------------
  */

  const exportExcel = async () => {
    const params = buildParams(1, 500);

    if (!params) {
      return;
    }

    setExporting(true);

    try {
      delete params.page;

      delete params.page_size;

      const response = await api.get(exportEndpoint, {
        params,

        responseType: "blob",

        timeout: 120000,
      });

      let filename;

      let successMessage;

      if (isContinuousAbsenceReport) {
        filename = `Continuous_Absence_${absenceDateFrom.format(
          "YYYY-MM-DD",
        )}_to_${absenceDateTo.format("YYYY-MM-DD")}.xlsx`;

        successMessage = "Continuous Absence report exported successfully.";
      } else if (isLongWeekendReport) {
        filename = `Trainee_Long_Weekend_${attendanceDate.format(
          "YYYY-MM-DD",
        )}.xlsx`;

        successMessage = "Long Weekend report exported successfully.";
      } else if (isCustomShiftReport) {
        filename = `Custom_Shift_Duty_${attendanceDate.format(
          "YYYY-MM-DD",
        )}.xlsx`;

        successMessage = "Custom Shift Duty report exported successfully.";
      } else {
        filename = `${attendanceSubjectType}_${sessionType}_Attendance_${attendanceDate.format(
          "YYYY-MM-DD",
        )}.xlsx`;

        successMessage = "Attendance report exported successfully.";
      }

      downloadBlob(response.data, filename);

      message.success(successMessage);
    } catch (error) {
      let fallbackMessage = "Could not export attendance report.";

      if (isLongWeekendReport) {
        fallbackMessage = "Could not export Long Weekend report.";
      }

      if (isContinuousAbsenceReport) {
        fallbackMessage = "Could not export Continuous Absence report.";
      }

      if (isCustomShiftReport) {
        fallbackMessage = "Could not export Custom Shift Duty report.";
      }

      message.error(error.response?.data?.message || fallbackMessage);
    } finally {
      setExporting(false);
    }
  };

  /*
  |--------------------------------------------------------------------------
  | FETCH ALL FOR PRINT
  |--------------------------------------------------------------------------
  */

  const fetchAllRows = async () => {
    const firstParams = buildParams(1, PRINT_PAGE_SIZE);

    if (!firstParams) {
      return [];
    }

    const firstResponse = await api.get(reportEndpoint, {
      params: firstParams,
    });

    const firstData = firstResponse.data?.data || {};

    let allRows = firstData.rows || [];

    const total = Number(firstData.pagination?.total) || allRows.length;

    const actualPageSize =
      Number(firstData.pagination?.pageSize) || PRINT_PAGE_SIZE;

    const totalPages = Math.ceil(total / actualPageSize);

    for (let page = 2; page <= totalPages; page += 1) {
      const response = await api.get(reportEndpoint, {
        params: buildParams(page, actualPageSize),
      });

      allRows = [...allRows, ...(response.data?.data?.rows || [])];
    }

    return allRows;
  };

  /*
  |--------------------------------------------------------------------------
  | PRINT
  |--------------------------------------------------------------------------
  */

  const printReport = async () => {
    setPrinting(true);

    try {
      const allRows = await fetchAllRows();

      if (!allRows.length) {
        message.warning("Print ke liye koi report record available nahi hai.");

        return;
      }

      setPrintRows(allRows);

      setTimeout(() => {
        window.print();
      }, 250);
    } catch (error) {
      message.error(
        error.response?.data?.message || "Could not prepare printable report.",
      );
    } finally {
      setPrinting(false);
    }
  };

  /*
  |--------------------------------------------------------------------------
  | ACTIVE FILTER COUNT
  |--------------------------------------------------------------------------
  */

  const activeFilterCount = useMemo(() => {
    const values = [
      debouncedSearch,
      courseId,
      platoonId,
      categoryId,
      branchId,
      customGroupId,
      customShiftId,
    ];

    if (isContinuousAbsenceReport) {
      if (continuousSubjectType !== "ALL") {
        values.push(continuousSubjectType);
      }

      if (continuousStatus !== "ALL") {
        values.push(continuousStatus);
      }
    } else {
      values.push(attendanceStatus, timingStatus);
    }

    return values.filter(Boolean).length;
  }, [
    debouncedSearch,
    courseId,
    platoonId,
    categoryId,
    branchId,
    customGroupId,
    customShiftId,
    isContinuousAbsenceReport,
    continuousSubjectType,
    continuousStatus,
    attendanceStatus,
    timingStatus,
  ]);

  /*
  |--------------------------------------------------------------------------
  | ATTENDANCE COLUMNS
  |--------------------------------------------------------------------------
  */

  const attendanceColumns = useMemo(
    () => [
      {
        title: "#",

        width: 70,

        fixed: "left",

        align: "center",

        render: (_, __, index) =>
          (pagination.current - 1) * pagination.pageSize + index + 1,
      },

      {
        title: "Employee ID/Cap No.",

        dataIndex: "employee_id",

        width: 170,

        fixed: "left",

        render: (value, record) => (
          <Button
            type="link"
            size="small"
            style={{
              padding: 0,

              height: "auto",

              fontWeight: 700,
            }}
            onClick={() => openProfile(record)}
          >
            {employeeCode(record)}
          </Button>
        ),
      },

      {
        title: "Name",

        dataIndex: "subject_name",

        width: 220,

        fixed: "left",

        render: (value, record) => (
          <Space direction="vertical" size={0}>
            <Text>{value || "-"}</Text>
            {String(record.subject_type || "").toUpperCase() === "STAFF" && (
              <Text type="secondary" style={{ fontSize: 11 }}>
                {record.belt_no ? `Belt No. ${record.belt_no}` : "Belt No. not recorded"}
              </Text>
            )}
          </Space>
        ),
      },

      {
        title: isTrainee ? "Course" : "Category",

        width: 240,

        render: (_, record) =>
          isTrainee ? record.course_name || "-" : record.category_name || "-",
      },

      {
        title: isTrainee ? "Platoon" : "Branch",

        width: 190,

        render: (_, record) =>
          isTrainee ? getPlatoonLabel(record) : record.branch_name || "-",
      },

      {
        title: "Punch",

        dataIndex: "selected_punch",

        width: 145,

        align: "center",

        render: (value, record) => formatPunch(value || record.punch_time),
      },

      {
        title: "Punch State",

        dataIndex: "punch_state",

        width: 150,

        align: "center",

        render: (value) => (value ? <Tag>{value}</Tag> : "-"),
      },

      {
        title: "Attendance",

        dataIndex: "attendance_status",

        width: 140,

        align: "center",

        render: (value) => <Tag color={statusColor(value)}>{value || "-"}</Tag>,
      },

      {
        title: "Timing",

        width: 180,

        align: "center",

        render: (_, record) => (
          <Space direction="vertical" size={0}>
            <Tag color={timingColor(record.timing_status)}>
              {record.timing_status || "-"}
            </Tag>

            {["EARLY", "LATE"].includes(record.timing_status) &&
              record.timing_minutes !== null &&
              record.timing_minutes !== undefined && (
                <Text
                  type="secondary"
                  style={{
                    fontSize: 11,
                  }}
                >
                  {record.timing_status === "LATE" ? "Late by" : "Early by"}{" "}
                  {record.timing_minutes} min
                </Text>
              )}
          </Space>
        ),
      },

      {
        title: "Late (min)",
        dataIndex: "timing_minutes",
        width: 110,
        align: "center",
        render: (value, record) =>
          record.timing_status === "LATE" && value !== null && value !== undefined
            ? `${value} min`
            : "-",
      },

      {
        title: "Exemption",

        width: 240,

        render: (_, record) =>
          record.exemption_type ? (
            <Space direction="vertical" size={0}>
              <Tag color="blue">{record.exemption_type}</Tag>

              {record.exemption_description && (
                <Text
                  type="secondary"
                  ellipsis={{
                    tooltip: record.exemption_description,
                  }}
                  style={{
                    fontSize: 11,

                    maxWidth: 200,
                  }}
                >
                  {record.exemption_description}
                </Text>
              )}
            </Space>
          ) : (
            "-"
          ),
      },

      { title: "Reason", width: 230, render: (_, row) => row.repatriate_reason || row.osd_reason || row.exemption_description || "—" },
      { title: "OSD Starts", dataIndex: "osd_start_datetime", width: 190, render: formatDateTime },
      { title: "OSD Ends", dataIndex: "osd_end_datetime", width: 190, render: formatDateTime },
      { title: "Absent From", dataIndex: "absence_start", width: 190, render: formatDateTime },
      { title: "Absent Until / Return", width: 190, render: (_, row) => row.absence_end ? formatDateTime(row.absence_end) : row.absence_start ? "Ongoing at report time" : "—" },
      { title: "Absent Duration", width: 160, defaultSortOrder: "ascend", sorter: (a, b) => {
        const durationA = a.absence_start ? Number(a.absence_duration_seconds || 0) : Number.POSITIVE_INFINITY;
        const durationB = b.absence_start ? Number(b.absence_duration_seconds || 0) : Number.POSITIVE_INFINITY;
        return durationA - durationB;
      }, render: (_, row) => row.absence_start ? formatAbsenceDuration(row.absence_duration_seconds) : "—" },
      {
        title: "Manual Absence",

        dataIndex: "has_manual_absence",

        width: 160,

        align: "center",

        render: (value) =>
          Number(value) === 1 ? <Tag color="red">Recorded</Tag> : "-",
      },
    ],
    [pagination.current, pagination.pageSize, isTrainee],
  );

  /*
  |--------------------------------------------------------------------------
  | CONTINUOUS ABSENCE COLUMNS
  |--------------------------------------------------------------------------
  */

  const continuousColumns = useMemo(
    () => [
      {
        title: "#",

        width: 70,

        fixed: "left",

        align: "center",

        render: (_, __, index) =>
          (pagination.current - 1) * pagination.pageSize + index + 1,
      },

      {
        title: "Employee ID/Cap No.",

        dataIndex: "employee_id",

        width: 180,

        fixed: "left",

        render: (value, record) => (
          <Button
            type="link"
            size="small"
            style={{
              padding: 0,

              height: "auto",

              fontWeight: 700,
            }}
            onClick={() => openProfile(record)}
          >
            {value || "-"}
          </Button>
        ),
      },

      {
        title: "Name",

        dataIndex: "subject_name",

        width: 220,

        fixed: "left",

        render: (value, record) => (
          <Space direction="vertical" size={0}>
            <Text>{value || "-"}</Text>
            {String(record.subject_type || "").toUpperCase() === "STAFF" && (
              <Text type="secondary" style={{ fontSize: 11 }}>
                {record.belt_no ? `Belt No. ${record.belt_no}` : "Belt No. not recorded"}
              </Text>
            )}
          </Space>
        ),
      },

      {
        title: "Type",

        dataIndex: "subject_type",

        width: 110,

        align: "center",

        render: (value) => (
          <Tag color={value === "TRAINEE" ? "blue" : "purple"}>
            {value || "-"}
          </Tag>
        ),
      },

      {
        title: "Course / Category",

        width: 240,

        render: (_, record) =>
          record.subject_type === "TRAINEE"
            ? record.course_name || "-"
            : record.category_name || "-",
      },

      {
        title: "Platoon / Branch",

        width: 220,

        render: (_, record) =>
          record.subject_type === "TRAINEE"
            ? getPlatoonLabel(record)
            : record.branch_name || "-",
      },

      {
        title: "Absent From",

        dataIndex: "absent_from",

        width: 205,

        render: formatDateTime,
      },

      {
        title: "Return Punch",

        dataIndex: "return_punch_at",

        width: 205,

        render: formatDateTime,
      },

      {
        title: "Period",

        dataIndex: "period_label",

        width: 170,

        align: "center",

        render: (value, record) => formatDuration(record.period_seconds, value),
      },

      {
        title: "Missed Sessions",

        dataIndex: "missed_session_count",

        width: 150,

        align: "center",

        render: (value) => Number(value || 0),
      },

      {
        title: "Status",

        dataIndex: "status",

        width: 120,

        align: "center",

        render: (value) => <Tag color={statusColor(value)}>{value || "-"}</Tag>,
      },
    ],
    [pagination.current, pagination.pageSize],
  );


  /*
  |--------------------------------------------------------------------------
  | CUSTOM SHIFT DUTY COLUMNS
  |--------------------------------------------------------------------------
  */

  const customShiftColumns = useMemo(
    () => [
      {
        title: "#",
        width: 70,
        fixed: "left",
        align: "center",
        render: (_, __, index) =>
          (pagination.current - 1) * pagination.pageSize + index + 1,
      },
      {
        title: "Employee ID/Cap No.",
        dataIndex: "employee_id",
        width: 180,
        fixed: "left",
        render: (value, record) => (
          <Button
            type="link"
            size="small"
            style={{
              padding: 0,
              height: "auto",
              fontWeight: 700,
            }}
            onClick={() => openProfile(record)}
          >
            {value || record.belt_no || "-"}
          </Button>
        ),
      },
      {
        title: "Name",
        dataIndex: "subject_name",
        width: 220,
        fixed: "left",
        render: (value, record) => (
          <Space direction="vertical" size={0}>
            <Text>{value || "-"}</Text>
            {String(record.subject_type || "").toUpperCase() === "STAFF" && (
              <Text type="secondary" style={{ fontSize: 11 }}>
                {record.belt_no ? `Belt No. ${record.belt_no}` : "Belt No. not recorded"}
              </Text>
            )}
          </Space>
        ),
      },
      {
        title: "Category",
        dataIndex: "category_name",
        width: 190,
        render: (value) => value || "-",
      },
      {
        title: "Branch",
        dataIndex: "branch_name",
        width: 190,
        render: (value) => value || "-",
      },
      {
        title: "Shift Group",
        dataIndex: "group_name",
        width: 220,
        render: (value) => <Tag color="magenta">{value || "-"}</Tag>,
      },
      {
        title: "Shift",
        dataIndex: "shift_name",
        width: 170,
        render: (value) => <Tag color="volcano">{value || "-"}</Tag>,
      },
      {
        title: "Duty Point",
        dataIndex: "duty_point_name",
        width: 200,
        render: (value) => value || "-",
      },
      {
        title: "Scheduled",
        width: 175,
        align: "center",
        render: (_, record) => (
          <Text>
            {formatClock(record.start_time)} - {formatClock(record.end_time)}
          </Text>
        ),
      },
      {
        title: "Arrival Punch",
        dataIndex: "start_punch_time",
        width: 185,
        align: "center",
        render: formatDateTime,
      },
      {
        title: "Departure Punch",
        dataIndex: "end_punch_time",
        width: 185,
        align: "center",
        render: formatDateTime,
      },
      {
        title: "Attendance",
        dataIndex: "attendance_status",
        width: 130,
        align: "center",
        render: (value) => <Tag color={statusColor(value)}>{value || "-"}</Tag>,
      },
      {
        title: "Checkout",
        dataIndex: "checkout_status",
        width: 140,
        align: "center",
        render: (value) => <Tag color={statusColor(value)}>{value || "-"}</Tag>,
      },
      {
        title: "Exemption",
        width: 240,
        render: (_, record) =>
          record.exemption_type ? (
            <Space direction="vertical" size={0}>
              <Tag color="blue">{record.exemption_type}</Tag>
              {record.exemption_description && (
                <Text
                  type="secondary"
                  ellipsis={{
                    tooltip: record.exemption_description,
                  }}
                  style={{
                    maxWidth: 210,
                    fontSize: 11,
                  }}
                >
                  {record.exemption_description}
                </Text>
              )}
            </Space>
          ) : (
            "-"
          ),
      },
    ],
    [pagination.current, pagination.pageSize],
  );

  const columns = isContinuousAbsenceReport
    ? continuousColumns
    : isCustomShiftReport
      ? customShiftColumns
      : attendanceColumns;

  /*
  |--------------------------------------------------------------------------
  | TITLES
  |--------------------------------------------------------------------------
  */

  const reportTitle = useMemo(() => {
    if (isContinuousAbsenceReport) {
      return "Continuous Absence / Return Report";
    }

    if (isLongWeekendReport) {
      return "Trainee Long Weekend / Departure Report";
    }

    if (isCustomShiftReport) {
      return "Custom Shift Duty Attendance Report";
    }

    return `${isTrainee ? "Trainee" : "PTS Staff"} ${
      sessionType === "MORNING" ? "Morning" : "Evening"
    } Attendance Report`;
  }, [
    isContinuousAbsenceReport,
    isLongWeekendReport,
    isCustomShiftReport,
    isTrainee,
    sessionType,
  ]);

  const dateLabel = isContinuousAbsenceReport
    ? `${absenceDateFrom.format("DD-MMM-YYYY")} to ${absenceDateTo.format(
        "DD-MMM-YYYY",
      )}`
    : attendanceDate.format("DD-MMM-YYYY");

  /*
  |--------------------------------------------------------------------------
  | PREVENT MIXED ALL FILTERS
  |--------------------------------------------------------------------------
  */

  const clearOppositeStaffFilters = (value) => {
    if (isContinuousAbsenceReport && continuousSubjectType === "ALL" && value) {
      setCategoryId(null);

      setBranchId(null);
    }
  };

  const clearOppositeTraineeFilters = (value) => {
    if (isContinuousAbsenceReport && continuousSubjectType === "ALL" && value) {
      setCourseId(null);

      setPlatoonId(null);
    }
  };

  /*
  |--------------------------------------------------------------------------
  | UI
  |--------------------------------------------------------------------------
  */

  return (
    <>
      <style>
        {`
          .reports-print-root {
            display: none;
          }

          @media print {
            body * {
              visibility: hidden !important;
            }

            .reports-print-root,
            .reports-print-root * {
              visibility: visible !important;
            }

            .reports-print-root {
              display: block !important;
              position: absolute;
              left: 0;
              top: 0;
              width: 100%;
              background: #fff;
              color: #000;
              font-family: Arial, Helvetica, sans-serif;
            }

            .reports-print-header {
              text-align: center;
              border-bottom: 3px double #000;
              padding-bottom: 8px;
              margin-bottom: 10px;
            }

            .reports-print-main-title {
              font-size: 17px;
              font-weight: 800;
            }

            .reports-print-school {
              font-size: 13px;
              font-weight: 700;
              margin-top: 2px;
            }

            .reports-print-report-title {
              font-size: 12px;
              margin-top: 3px;
            }

            .reports-print-meta {
              width: 100%;
              border-collapse: collapse;
              font-size: 9px;
              margin-bottom: 8px;
            }

            .reports-print-meta td,
            .reports-print-table th,
            .reports-print-table td {
              border: 1px solid #000;
              padding: 3px;
            }

            .reports-print-table {
              width: 100%;
              border-collapse: collapse;
              font-size: 7.5px;
            }

            .reports-print-table th {
              font-weight: 800;
              background: #eaeaea;
            }

            .reports-print-footer {
              display: flex;
              justify-content: space-between;
              margin-top: 14px;
              font-size: 8px;
            }

            @page {
              size: A4 landscape;
              margin: 8mm;
            }
          }
        `}
      </style>

      <div>
        {/* HEADER */}

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
              Attendance & Absence Reports
            </Title>

            <Space size={8} wrap>
              <Text type="secondary">
                Trainee / Staff attendance, Custom Shift Duty, Long Weekend aur
                Continuous Absence reporting center.
              </Text>

              <Tag color="green" icon={<ThunderboltOutlined />}>
                Auto Load
              </Tag>

              {activeFilterCount > 0 && (
                <Tag color="orange">{activeFilterCount} Active Filter(s)</Tag>
              )}
            </Space>
          </div>

          <Space wrap>
            <Button
              icon={<ReloadOutlined />}
              loading={loading}
              onClick={() =>
                loadReport(pagination.current, pagination.pageSize)
              }
            >
              Refresh
            </Button>

            <Button
              icon={<FilePdfOutlined />}
              loading={printing}
              onClick={printReport}
            >
              Print / PDF
            </Button>

            {canExport && (
              <Button
                type="primary"
                icon={<DownloadOutlined />}
                loading={exporting}
                onClick={exportExcel}
              >
                Export Excel
              </Button>
            )}
          </Space>
        </div>

        {/* REPORT INFORMATION */}

        <Alert
          type="info"
          showIcon
          icon={<CalendarOutlined />}
          style={{
            marginBottom: 16,
          }}
          message={`${reportTitle} — ${dateLabel}`}
          description="Reports reload automatically upon changing filters. Active filters are preserved in Excel exports and Print/PDF views."
        />

        {/* FILTERS */}

        <Card
          style={{
            marginBottom: 16,

            borderRadius: 14,

            boxShadow: "0 5px 18px rgba(15,23,42,.05)",
          }}
        >
          <Row gutter={[12, 12]}>
            <Col xs={24} md={6}>
              <FieldLabel>Report Type</FieldLabel>

              <Select
                value={reportType}
                style={{
                  width: "100%",
                }}
                onChange={handleReportTypeChange}
                options={[
                  {
                    value: "TRAINEE_MORNING",

                    label: "Trainee Morning Report",
                  },

                  {
                    value: "TRAINEE_EVENING",

                    label: "Trainee Evening Report",
                  },

                  {
                    value: "STAFF_MORNING",

                    label: "Staff Morning Report",
                  },

                  {
                    value: "STAFF_EVENING",

                    label: "Staff Evening Report",
                  },

                  {
                    value: "CUSTOM_SHIFT",

                    label: "Custom Shift Duty Attendance Report",
                  },

                  {
                    value: "LONG_WEEKEND",

                    label: "Trainee Long Weekend / Departure Report",
                  },

                  {
                    value: "CONTINUOUS_ABSENCE",

                    label: "Continuous Absence / Return Report",
                  },
                ]}
              />
            </Col>

            {/* CONTINUOUS ABSENCE DATE / TYPE / STATUS */}

            {isContinuousAbsenceReport ? (
              <>
                <Col xs={24} md={4}>
                  <FieldLabel>Date From</FieldLabel>

                  <DatePicker
                    value={absenceDateFrom}
                    allowClear={false}
                    format="DD-MMM-YYYY"
                    style={{
                      width: "100%",
                    }}
                    onChange={(value) => {
                      if (!value) {
                        return;
                      }

                      setAbsenceDateFrom(value);

                      if (
                        absenceDateTo &&
                        value.isAfter(absenceDateTo, "day")
                      ) {
                        setAbsenceDateTo(value);
                      }
                    }}
                  />
                </Col>

                <Col xs={24} md={4}>
                  <FieldLabel>Date To</FieldLabel>

                  <DatePicker
                    value={absenceDateTo}
                    allowClear={false}
                    format="DD-MMM-YYYY"
                    style={{
                      width: "100%",
                    }}
                    disabledDate={(current) =>
                      Boolean(
                        absenceDateFrom &&
                        current &&
                        current.isBefore(absenceDateFrom, "day"),
                      )
                    }
                    onChange={(value) => {
                      if (value) {
                        setAbsenceDateTo(value);
                      }
                    }}
                  />
                </Col>

                <Col xs={24} md={4}>
                  <FieldLabel>Subject Type</FieldLabel>

                  <Select
                    value={continuousSubjectType}
                    style={{
                      width: "100%",
                    }}
                    onChange={handleContinuousSubjectChange}
                    options={[
                      {
                        value: "ALL",

                        label: "All",
                      },

                      {
                        value: "TRAINEE",

                        label: "Trainee",
                      },

                      {
                        value: "STAFF",

                        label: "Staff",
                      },
                    ]}
                  />
                </Col>

                <Col xs={24} md={4}>
                  <FieldLabel>Absence Status</FieldLabel>

                  <Select
                    value={continuousStatus}
                    style={{
                      width: "100%",
                    }}
                    onChange={setContinuousStatus}
                    options={[
                      {
                        value: "ALL",

                        label: "All",
                      },

                      {
                        value: "OPEN",

                        label: "Open / Ongoing",
                      },

                      {
                        value: "RETURNED",

                        label: "Returned",
                      },
                    ]}
                  />
                </Col>
              </>
            ) : (
              <Col xs={24} md={4}>
                <FieldLabel>
                  {isLongWeekendReport
                    ? "Departure Date"
                    : isCustomShiftReport
                      ? "Shift Duty Date"
                      : "Attendance Date"}
                </FieldLabel>

                <DatePicker
                  value={attendanceDate}
                  allowClear={false}
                  format="DD-MMM-YYYY"
                  style={{
                    width: "100%",
                  }}
                  onChange={setAttendanceDate}
                />
              </Col>
            )}

            {/* CUSTOM SHIFT FILTERS */}

            {isCustomShiftReport && (
              <>
                <Col xs={24} md={5}>
                  <FieldLabel>Shift Group</FieldLabel>

                  <Select
                    allowClear
                    showSearch
                    value={customGroupId}
                    placeholder="All Shift Groups"
                    optionFilterProp="label"
                    style={{
                      width: "100%",
                    }}
                    options={customGroupOptions}
                    onChange={(value) => {
                      setCustomGroupId(value);
                      setCustomShiftId(null);
                    }}
                  />
                </Col>

                <Col xs={24} md={5}>
                  <FieldLabel>Shift</FieldLabel>

                  <Select
                    allowClear
                    showSearch
                    value={customShiftId}
                    placeholder="All Shifts"
                    optionFilterProp="label"
                    style={{
                      width: "100%",
                    }}
                    options={customShiftOptions}
                    onChange={setCustomShiftId}
                  />
                </Col>
              </>
            )}

            {/* TRAINEE FILTERS */}

            {showTraineeFilters && (
              <>
                <Col xs={24} md={5}>
                  <FieldLabel>Course</FieldLabel>

                  <Select
                    allowClear
                    showSearch
                    value={courseId}
                    placeholder="All Courses"
                    optionFilterProp="label"
                    style={{
                      width: "100%",
                    }}
                    options={(filters.courses || []).map((item) => ({
                      value: item.id,

                      label: item.course_name,
                    }))}
                    onChange={(value) => {
                      setCourseId(value);

                      setPlatoonId(null);

                      clearOppositeStaffFilters(value);
                    }}
                  />
                </Col>

                <Col xs={24} md={5}>
                  <FieldLabel>Platoon</FieldLabel>

                  <Select
                    allowClear
                    showSearch
                    value={platoonId}
                    placeholder="All Platoons"
                    optionFilterProp="label"
                    style={{
                      width: "100%",
                    }}
                    options={platoonOptions}
                    onChange={(value) => {
                      setPlatoonId(value);

                      clearOppositeStaffFilters(value);
                    }}
                  />
                </Col>
              </>
            )}

            {/* STAFF FILTERS */}

            {showStaffFilters && (
              <>
                <Col xs={24} md={5}>
                  <FieldLabel>Staff Category</FieldLabel>

                  <Select
                    allowClear
                    showSearch
                    value={categoryId}
                    placeholder="All Categories"
                    optionFilterProp="label"
                    style={{
                      width: "100%",
                    }}
                    options={(filters.categories || []).map((item) => ({
                      value: item.id,

                      label: item.category_name,
                    }))}
                    onChange={(value) => {
                      setCategoryId(value);

                      setBranchId(null);

                      clearOppositeTraineeFilters(value);
                    }}
                  />
                </Col>

                <Col xs={24} md={5}>
                  <FieldLabel>Branch</FieldLabel>

                  <Select
                    allowClear
                    showSearch
                    value={branchId}
                    placeholder="All Branches"
                    optionFilterProp="label"
                    style={{
                      width: "100%",
                    }}
                    options={branchOptions}
                    onChange={(value) => {
                      setBranchId(value);

                      clearOppositeTraineeFilters(value);
                    }}
                  />
                </Col>
              </>
            )}

            {/* ATTENDANCE STATUS */}

            {!isContinuousAbsenceReport && (
              <Col xs={24} md={4}>
                <FieldLabel>
                  {isLongWeekendReport
                    ? "Departure Status"
                    : isCustomShiftReport
                      ? "Shift Attendance"
                      : "Attendance"}
                </FieldLabel>

                <Select
                  allowClear
                  value={attendanceStatus}
                  placeholder="All Status"
                  style={{
                    width: "100%",
                  }}
                  onChange={setAttendanceStatus}
                  options={
                    isLongWeekendReport
                      ? [
                          {
                            value: "PRESENT",

                            label: "Successful Departure",
                          },

                          {
                            value: "ABSENT",

                            label: "Departure Absence",
                          },

                          {
                            value: "DETAINED",

                            label: "Weekend Detain",
                          },
                        ]
                      : isCustomShiftReport
                        ? [
                            {
                              value: "PRESENT",
                              label: "Present",
                            },
                            {
                              value: "ABSENT",
                              label: "Absent",
                            },
                            {
                              value: "EXEMPT",
                              label: "Exempt",
                            },
                            {
                              value: "PENDING",
                              label: "Pending",
                            },
                          ]
                        : [
                            {
                              value: "PRESENT",

                              label: "Present",
                            },

                            {
                              value: "ABSENT",

                              label: "Absent",
                            },

                            {
                              value: "EXEMPT",

                              label: "Exempt",
                            },

                            {
                              value: "NO_TIMETABLE",

                              label: "No Timetable",
                            },
                          ]
                  }
                />
              </Col>
            )}

            {/* TIMING */}

            {!isLongWeekendReport &&
              !isContinuousAbsenceReport &&
              !isCustomShiftReport && (
              <Col xs={24} md={4}>
                <FieldLabel>Timing</FieldLabel>

                <Select
                  allowClear
                  value={timingStatus}
                  placeholder="All Timing"
                  style={{
                    width: "100%",
                  }}
                  onChange={setTimingStatus}
                  options={[
                    {
                      value: "IN_TIME",

                      label: "In Time",
                    },

                    {
                      value: "EARLY",

                      label: "Early",
                    },

                    {
                      value: "LATE",

                      label: "Late",
                    },

                    {
                      value: "NO_PUNCH",

                      label: "No Punch",
                    },

                    {
                      value: "EXEMPT",

                      label: "Exempt",
                    },

                    {
                      value: "NO_TIMETABLE",

                      label: "No Timetable",
                    },
                  ]}
                />
              </Col>
            )}

            {/* SEARCH */}

            <Col xs={24} md={12}>
              <FieldLabel>Employee Search</FieldLabel>

              <Input
                allowClear
                value={search}
                prefix={<SearchOutlined />}
                placeholder="Employee ID/Cap No. or Name"
                onChange={(event) => setSearch(event.target.value)}
              />
            </Col>

            {/* RESET */}

            <Col xs={24} md={4}>
              <FieldLabel>Filters</FieldLabel>

              <Button block icon={<ReloadOutlined />} onClick={resetFilters}>
                Reset Filters
              </Button>
            </Col>

            {/* MODE */}

            <Col xs={24} md={4}>
              <FieldLabel>Loading Mode</FieldLabel>

              <div
                style={{
                  height: 32,

                  display: "flex",

                  alignItems: "center",

                  padding: "0 11px",

                  borderRadius: 6,

                  background: "#f0fdf4",

                  border: "1px solid #bbf7d0",
                }}
              >
                <Badge
                  status={loading ? "processing" : "success"}
                  text={loading ? "Updating..." : "Automatic"}
                />
              </div>
            </Col>
          </Row>
        </Card>

        {/* ACTIVE FILTER SUMMARY */}

        <Card
          size="small"
          style={{
            marginBottom: 16,
          }}
        >
          <Space wrap>
            <Text strong>Report:</Text>

            {isContinuousAbsenceReport ? (
              <>
                <Tag color="red">Continuous Absence</Tag>

                <Tag>{continuousSubjectType}</Tag>

                <Tag
                  color={
                    continuousStatus === "OPEN"
                      ? "red"
                      : continuousStatus === "RETURNED"
                        ? "green"
                        : "default"
                  }
                >
                  {continuousStatus}
                </Tag>

                <Tag>{dateLabel}</Tag>
              </>
            ) : (
              <>
                <Tag color={isTrainee ? "blue" : "purple"}>
                  {isCustomShiftReport
                    ? "CUSTOM SHIFT DUTY"
                    : isTrainee
                      ? "Trainees"
                      : "PTS Staff"}
                </Tag>

                <Tag color={sessionType === "MORNING" ? "gold" : "purple"}>
                  {isLongWeekendReport
                    ? "DEPARTURE"
                    : isCustomShiftReport
                      ? "SHIFT ATTENDANCE"
                      : sessionType}
                </Tag>

                <Tag>{attendanceDate.format("DD-MMM-YYYY")}</Tag>
              </>
            )}

            {selectedCourse && (
              <Tag color="blue">{selectedCourse.course_name}</Tag>
            )}

            {selectedPlatoon && (
              <Tag color="cyan">Platoon {selectedPlatoon.platoon_number}</Tag>
            )}

            {selectedCategory && (
              <Tag color="purple">{selectedCategory.category_name}</Tag>
            )}

            {selectedBranch && (
              <Tag color="geekblue">{selectedBranch.branch_name}</Tag>
            )}

            {selectedCustomGroup && (
              <Tag color="magenta">{selectedCustomGroup.group_name}</Tag>
            )}

            {selectedCustomShift && (
              <Tag color="volcano">{selectedCustomShift.shift_name}</Tag>
            )}

            {!isContinuousAbsenceReport && attendanceStatus && (
              <Tag color={statusColor(attendanceStatus)}>
                {attendanceStatus}
              </Tag>
            )}

            {!isContinuousAbsenceReport && !isCustomShiftReport && timingStatus && (
              <Tag color={timingColor(timingStatus)}>{timingStatus}</Tag>
            )}

            {debouncedSearch && <Tag>Search: {debouncedSearch}</Tag>}
          </Space>
        </Card>

        {/* SUMMARY */}

        {isContinuousAbsenceReport ? (
          <Row
            gutter={[12, 12]}
            style={{
              marginBottom: 16,
            }}
          >
            <Col xs={24} md={8}>
              <SummaryCard
                title="Total Episodes"
                value={summary.total}
                icon={<TeamOutlined />}
                accent="#2563EB"
                soft="#EFF6FF"
              />
            </Col>

            <Col xs={24} md={8}>
              <SummaryCard
                title="Open / Ongoing"
                value={summary.open}
                icon={<CloseCircleOutlined />}
                accent="#EF4444"
                soft="#FEF2F2"
                active={continuousStatus === "OPEN"}
                onClick={() => toggleContinuousStatus("OPEN")}
              />
            </Col>

            <Col xs={24} md={8}>
              <SummaryCard
                title="Returned"
                value={summary.returned}
                icon={<CheckCircleOutlined />}
                accent="#10B981"
                soft="#ECFDF5"
                active={continuousStatus === "RETURNED"}
                onClick={() => toggleContinuousStatus("RETURNED")}
              />
            </Col>
          </Row>
        ) : (
          <Row
            gutter={[12, 12]}
            style={{
              marginBottom: 16,
            }}
          >
            <Col xs={12} md={6} xl={3}>
              <SummaryCard
                title="Total"
                value={summary.total}
                icon={<TeamOutlined />}
                accent="#2563EB"
                soft="#EFF6FF"
              />
            </Col>

            <Col xs={12} md={6} xl={3}>
              <SummaryCard
                title={
                  isLongWeekendReport ? "Successful Departures" : "Present"
                }
                value={summary.present}
                icon={<CheckCircleOutlined />}
                accent="#10B981"
                soft="#ECFDF5"
                active={attendanceStatus === "PRESENT"}
                onClick={() => toggleAttendanceStatus("PRESENT")}
              />
            </Col>

            <Col xs={12} md={6} xl={3}>
              <SummaryCard
                title={isLongWeekendReport ? "Departure Absences" : "Absent"}
                value={summary.absent}
                icon={<CloseCircleOutlined />}
                accent="#EF4444"
                soft="#FEF2F2"
                active={attendanceStatus === "ABSENT"}
                onClick={() => toggleAttendanceStatus("ABSENT")}
              />
            </Col>

            <Col xs={12} md={6} xl={3}>
              <SummaryCard
                title={isLongWeekendReport ? "Weekend Detain" : "Exempt"}
                value={
                  isLongWeekendReport
                    ? summary.detained || summary.exempt
                    : summary.exempt
                }
                icon={<UserOutlined />}
                accent="#8B5CF6"
                soft="#F5F3FF"
                active={
                  attendanceStatus ===
                  (isLongWeekendReport ? "DETAINED" : "EXEMPT")
                }
                onClick={() =>
                  toggleAttendanceStatus(
                    isLongWeekendReport ? "DETAINED" : "EXEMPT",
                  )
                }
              />
            </Col>

            {isCustomShiftReport && (
              <Col xs={12} md={6} xl={3}>
                <SummaryCard
                  title="Pending"
                  value={summary.pending}
                  accent="#D97706"
                  soft="#FFFBEB"
                  active={attendanceStatus === "PENDING"}
                  onClick={() => toggleAttendanceStatus("PENDING")}
                />
              </Col>
            )}

            {!isLongWeekendReport && !isCustomShiftReport && (
              <>
                <Col xs={12} md={6} xl={3}>
                  <SummaryCard
                    title="In Time"
                    value={summary.in_time}
                    accent="#059669"
                    soft="#ECFDF5"
                    active={timingStatus === "IN_TIME"}
                    onClick={() => toggleTimingStatus("IN_TIME")}
                  />
                </Col>

                <Col xs={12} md={6} xl={3}>
                  <SummaryCard
                    title="Early"
                    value={summary.early}
                    accent="#06B6D4"
                    soft="#ECFEFF"
                    active={timingStatus === "EARLY"}
                    onClick={() => toggleTimingStatus("EARLY")}
                  />
                </Col>

                <Col xs={12} md={6} xl={3}>
                  <SummaryCard
                    title="Late"
                    value={summary.late}
                    accent="#F59E0B"
                    soft="#FFFBEB"
                    active={timingStatus === "LATE"}
                    onClick={() => toggleTimingStatus("LATE")}
                  />
                </Col>

                <Col xs={12} md={6} xl={3}>
                  <SummaryCard
                    title="No Timetable"
                    value={summary.no_timetable}
                    accent="#F97316"
                    soft="#FFF7ED"
                    active={attendanceStatus === "NO_TIMETABLE"}
                    onClick={() => toggleAttendanceStatus("NO_TIMETABLE")}
                  />
                </Col>
              </>
            )}
          </Row>
        )}

        {/* EXTRA SUMMARY */}

        <Card
          size="small"
          style={{
            marginBottom: 16,
          }}
        >
          <Space wrap size="large">
            <Text>
              Total Records: <strong>{summary.total}</strong>
            </Text>

            {isContinuousAbsenceReport ? (
              <>
                <Text>
                  Open: <strong>{summary.open || 0}</strong>
                </Text>

                <Text>
                  Returned: <strong>{summary.returned || 0}</strong>
                </Text>
              </>
            ) : (
              isCustomShiftReport ? (
                <>
                  <Text>
                    Checked Out: <strong>{summary.checked_out || 0}</strong>
                  </Text>
                  <Text>
                    Missing Checkout: <strong>{summary.missing_checkout || 0}</strong>
                  </Text>
                </>
              ) : (
                !isLongWeekendReport && (
                  <Text>
                    Manual Absence: <strong>{summary.manual_absence || 0}</strong>
                  </Text>
                )
              )
            )}

            <Text>
              Current Page: <strong>{pagination.current}</strong>
            </Text>

            <Text>
              Records Per Page: <strong>{pagination.pageSize}</strong>
            </Text>
          </Space>
        </Card>

        {/* TABLE */}

        <Card
          style={{
            borderRadius: 14,

            boxShadow: "0 5px 18px rgba(15,23,42,.05)",
          }}
          title={
            <Space wrap>
              <span>{reportTitle}</span>

              <Tag color="blue">{dateLabel}</Tag>

              <Tag>{pagination.total} Records</Tag>
            </Space>
          }
        >
          <Table
            rowKey={(record) =>
              record.id ||
              `${record.employee_id}-${record.attendance_date || record.absent_from}-${record.session_type || record.status}`
            }
            loading={loading}
            columns={columns}
            dataSource={rows}
            bordered
            scroll={{
              x: isContinuousAbsenceReport
                ? 1950
                : isCustomShiftReport
                  ? 2450
                  : 1900,
            }}
            pagination={{
              current: pagination.current,

              pageSize: pagination.pageSize,

              total: pagination.total,

              showSizeChanger: true,

              pageSizeOptions: [25, 50, 100, 200],

              showTotal: (total, range) =>
                `${range[0]}-${range[1]} of ${total} records`,
            }}
            onChange={(tablePagination) => {
              loadReport(
                tablePagination.current || 1,

                tablePagination.pageSize || DEFAULT_PAGE_SIZE,
              );
            }}
          />
        </Card>
      </div>

      {/* PRINT REPORT */}

      <div className="reports-print-root">
        <div className="reports-print-header">
          <div className="reports-print-main-title">PUNJAB POLICE</div>

          <div className="reports-print-school">
            POLICE TRAINING SCHOOL FAROOQABAD
          </div>

          <div className="reports-print-report-title">
            {reportTitle.toUpperCase()}
          </div>
        </div>

        {/* PRINT META */}

        <table className="reports-print-meta">
          <tbody>
            <tr>
              <td>
                <strong>Date / Period</strong>
              </td>

              <td>{dateLabel}</td>

              <td>
                <strong>Type</strong>
              </td>

              <td>
                {isContinuousAbsenceReport
                  ? continuousSubjectType
                  : isLongWeekendReport
                    ? "TRAINEES - LONG WEEKEND"
                    : isCustomShiftReport
                      ? "PTS STAFF - CUSTOM SHIFT DUTY"
                      : isTrainee
                      ? "TRAINEES"
                      : "PTS STAFF"}
              </td>

              <td>
                <strong>Status / Session</strong>
              </td>

              <td>
                {isContinuousAbsenceReport
                  ? continuousStatus
                  : isLongWeekendReport
                    ? "DEPARTURE"
                    : isCustomShiftReport
                      ? "SHIFT ATTENDANCE"
                      : sessionType}
              </td>
            </tr>

            <tr>
              <td>
                <strong>{isCustomShiftReport ? "Shift Group" : "Course"}</strong>
              </td>

              <td>
                {isCustomShiftReport
                  ? selectedCustomGroup?.group_name || "All"
                  : selectedCourse?.course_name || "All"}
              </td>

              <td>
                <strong>{isCustomShiftReport ? "Shift" : "Platoon"}</strong>
              </td>

              <td>
                {isCustomShiftReport
                  ? selectedCustomShift?.shift_name || "All"
                  : selectedPlatoon
                    ? `Platoon ${selectedPlatoon.platoon_number}`
                    : "All"}
              </td>

              <td>
                <strong>Total</strong>
              </td>

              <td>{summary.total}</td>
            </tr>

            <tr>
              <td>
                <strong>Category</strong>
              </td>

              <td>{selectedCategory?.category_name || "All"}</td>

              <td>
                <strong>Branch</strong>
              </td>

              <td>{selectedBranch?.branch_name || "All"}</td>

              <td>
                <strong>
                  {isContinuousAbsenceReport
                    ? "Open / Returned"
                    : "Present / Absent"}
                </strong>
              </td>

              <td>
                {isContinuousAbsenceReport
                  ? `${summary.open || 0} / ${summary.returned || 0}`
                  : `${summary.present || 0} / ${summary.absent || 0}`}
              </td>
            </tr>
          </tbody>
        </table>

        {/* CONTINUOUS ABSENCE PRINT TABLE */}

        {isContinuousAbsenceReport ? (
          <table className="reports-print-table">
            <thead>
              <tr>
                <th>#</th>

                <th>Employee ID / Cap No.</th>

                <th>Name</th>

                <th>Type</th>

                <th>Course / Category</th>

                <th>Platoon / Branch</th>

                <th>Absent From</th>

                <th>Return Punch</th>

                <th>Period</th>

                <th>Missed Sessions</th>

                <th>Status</th>
              </tr>
            </thead>

            <tbody>
              {printRows.map((record, index) => (
                <tr key={record.id || index}>
                  <td>{index + 1}</td>

                  <td>{record.employee_id || "-"}</td>

                  <td>{record.subject_name || "-"}</td>

                  <td>{record.subject_type || "-"}</td>

                  <td>
                    {record.subject_type === "TRAINEE"
                      ? record.course_name || "-"
                      : record.category_name || "-"}
                  </td>

                  <td>
                    {record.subject_type === "TRAINEE"
                      ? getPlatoonLabel(record)
                      : record.branch_name || "-"}
                  </td>

                  <td>{formatDateTime(record.absent_from)}</td>

                  <td>{formatDateTime(record.return_punch_at)}</td>

                  <td>
                    {formatDuration(record.period_seconds, record.period_label)}
                  </td>

                  <td>{Number(record.missed_session_count || 0)}</td>

                  <td>{record.status || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : isCustomShiftReport ? (
          <table className="reports-print-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Employee ID / Cap No.</th>
                <th>Name</th>
                <th>Category</th>
                <th>Branch</th>
                <th>Shift Group</th>
                <th>Shift</th>
                <th>Duty Point</th>
                <th>Scheduled</th>
                <th>Arrival Punch</th>
                <th>Departure Punch</th>
                <th>Attendance</th>
                <th>Checkout</th>
                <th>Exemption</th>
              </tr>
            </thead>

            <tbody>
              {printRows.map((record, index) => (
                <tr key={record.id || index}>
                  <td>{index + 1}</td>
                  <td>{record.employee_id || record.belt_no || "-"}</td>
                  <td>{record.subject_name || "-"}</td>
                  <td>{record.category_name || "-"}</td>
                  <td>{record.branch_name || "-"}</td>
                  <td>{record.group_name || "-"}</td>
                  <td>{record.shift_name || "-"}</td>
                  <td>{record.duty_point_name || "-"}</td>
                  <td>
                    {formatClock(record.start_time)} - {formatClock(record.end_time)}
                  </td>
                  <td>{formatDateTime(record.start_punch_time)}</td>
                  <td>{formatDateTime(record.end_punch_time)}</td>
                  <td>{record.attendance_status || "-"}</td>
                  <td>{record.checkout_status || "-"}</td>
                  <td>
                    {record.exemption_type
                      ? record.exemption_description
                        ? `${record.exemption_type} - ${record.exemption_description}`
                        : record.exemption_type
                      : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          /*
          |--------------------------------------------------------------------------
          | ATTENDANCE PRINT TABLE
          |--------------------------------------------------------------------------
          */

          <table className="reports-print-table">
            <thead>
              <tr>
                <th>#</th>

                <th>Employee ID / Cap No.</th>

                <th>Name</th>

                <th>{isTrainee ? "Course" : "Category"}</th>

                <th>{isTrainee ? "Platoon" : "Branch"}</th>

                <th>Punch</th>

                <th>Punch State</th>

                <th>Attendance</th>

                <th>Timing</th>

                <th>Late (min)</th>

                <th>Exemption</th>

                <th>Manual Absence</th>
              </tr>
            </thead>

            <tbody>
              {printRows.map((record, index) => (
                <tr key={record.id || index}>
                  <td>{index + 1}</td>

                  <td>{record.employee_id || "-"}</td>

                  <td>{record.subject_name || "-"}</td>

                  <td>
                    {isTrainee
                      ? record.course_name || "-"
                      : record.category_name || "-"}
                  </td>

                  <td>
                    {isTrainee
                      ? getPlatoonLabel(record)
                      : record.branch_name || "-"}
                  </td>

                  <td>
                    {formatPunch(record.selected_punch || record.punch_time)}
                  </td>

                  <td>{record.punch_state || "-"}</td>

                  <td>{record.attendance_status || "-"}</td>

                  <td>
                    {record.timing_status || "-"}

                    {["EARLY", "LATE"].includes(record.timing_status) &&
                    record.timing_minutes !== null &&
                    record.timing_minutes !== undefined
                      ? ` (${record.timing_minutes} min)`
                      : ""}
                  </td>

                  <td>
                    {record.timing_status === "LATE" && record.timing_minutes !== null && record.timing_minutes !== undefined
                      ? `${record.timing_minutes} min`
                      : "-"}
                  </td>

                  <td>{record.exemption_type || "-"}</td>

                  <td>
                    {Number(record.has_manual_absence) === 1 ? "Yes" : "No"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* PRINT FOOTER */}

        <div className="reports-print-footer">
          <span>Generated: {dayjs().format("DD-MMM-YYYY hh:mm A")}</span>

          <span>Police Training School Farooqabad</span>
        </div>
      </div>
    </>
  );
}
