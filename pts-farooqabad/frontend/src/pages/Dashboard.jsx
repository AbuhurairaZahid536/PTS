import { useBiometricSyncStatus } from "../utils/biometricSyncStatus";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  Alert,
  Button,
  Card,
  Checkbox,
  Col,
  DatePicker,
  Empty,
  Modal,
  Popover,
  Row,
  Space,
  Spin,
  Table,
  Tag,
  Typography,
  message,
} from "antd";

import {
  CalendarOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  ControlOutlined,
  TeamOutlined,
  UserOutlined,
  WarningOutlined,
  PrinterOutlined,
  BarChartOutlined,
} from "@ant-design/icons";

import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
} from "recharts";

import dayjs from "dayjs";

import api from "../services/api";
import { employeeCode, activeRepatriates, repatriateMatches, formatAbsenceDuration, pakistanNow } from "../utils/dashboardRecords";
import { collectStaffDutyAssignments, reconcileStaffCategoryDuty } from "../utils/staffDashboardDuty";
import { useAuth } from "../contexts/AuthContext";

const { Title, Text } = Typography;

const PAGE_SIZE = 500;

const DASHBOARD_CACHE_PREFIX =
  "pts_dashboard_snapshot_v3_";

const DASHBOARD_RETRY_DELAY_MS =
  900;

function dashboardSleep(ms) {
  return new Promise((resolve) =>
    setTimeout(resolve, ms)
  );
}

function createDashboardCacheKey({
  user,
  date,
}) {
  const userId =
    getDashboardUserStorageId(user);

  return (
    `${DASHBOARD_CACHE_PREFIX}` +
    `${userId}_${date}`
  );
}

function normalizeCachedAttendance(value) {
  if (
    !value ||
    !Array.isArray(value.rows)
  ) {
    return null;
  }

  return {
    rows: value.rows,
    total: Number(
      value.total ??
        value.rows.length
    ),
  };
}

function readDashboardSnapshot({
  user,
  date,
}) {
  try {
    const storageKey =
      createDashboardCacheKey({
        user,
        date,
      });

    const raw =
      sessionStorage.getItem(
        storageKey
      );

    if (!raw) {
      return null;
    }

    const parsed =
      JSON.parse(raw);

    if (
      parsed?.date !== date
    ) {
      return null;
    }

    const traineeMorning =
      normalizeCachedAttendance(
        parsed.traineeMorning
      );

    const traineeEvening =
      normalizeCachedAttendance(
        parsed.traineeEvening
      );

    const staffMorning =
      normalizeCachedAttendance(
        parsed.staffMorning
      );

    const staffEvening =
      normalizeCachedAttendance(
        parsed.staffEvening
      );

    if (
      !traineeMorning ||
      !traineeEvening ||
      !staffMorning ||
      !staffEvening
    ) {
      return null;
    }

    return {
      date,
      savedAt:
        parsed.savedAt || null,
      traineeMorning,
      traineeEvening,
      staffMorning,
      staffEvening,
      supportingData: parsed.supportingData || {},
      traineeRoster: parsed.traineeRoster || [],
    };
  } catch {
    return null;
  }
}

function saveDashboardSnapshot({
  user,
  date,
  traineeMorning,
  traineeEvening,
  staffMorning,
  staffEvening,
  supportingData,
  traineeRoster,
}) {
  try {
    const storageKey =
      createDashboardCacheKey({
        user,
        date,
      });

    const payload =
      JSON.stringify({
        date,

        savedAt:
          new Date().toISOString(),

        traineeMorning,
        traineeEvening,
        staffMorning,
        staffEvening,
        supportingData,
        traineeRoster,
      });

    /*
    |--------------------------------------------------------------------------
    | SESSION STORAGE SAFETY
    |--------------------------------------------------------------------------
    |
    | Dashboard attendance datasets can become several MB because four full
    | reports are loaded:
    |
    | - Trainee Morning
    | - Trainee Evening
    | - Staff Morning
    | - Staff Evening
    |
    | Browser sessionStorage commonly has a small quota. A large dashboard
    | snapshot must therefore never repeatedly trigger QuotaExceededError.
    |
    |--------------------------------------------------------------------------
    */

    const MAX_CACHE_BYTES =
      3 * 1024 * 1024;

    const payloadBytes =
      new Blob([
        payload,
      ]).size;

    if (
      payloadBytes >
      MAX_CACHE_BYTES
    ) {
      /*
      | Remove this key in case an older snapshot exists.
      | Dashboard will simply use fresh API data instead.
      */

      sessionStorage.removeItem(
        storageKey
      );

      return false;
    }

    /*
    |--------------------------------------------------------------------------
    | CLEAN OLD DASHBOARD SNAPSHOTS
    |--------------------------------------------------------------------------
    |
    | Keep only the current dashboard snapshot key in this browser tab.
    | Hidden course/category preferences use localStorage and are NOT touched.
    |
    |--------------------------------------------------------------------------
    */

    const oldKeys = [];

    for (
      let index = 0;
      index <
      sessionStorage.length;
      index += 1
    ) {
      const key =
        sessionStorage.key(
          index
        );

      if (
        key &&
        key.startsWith(
          DASHBOARD_CACHE_PREFIX
        ) &&
        key !== storageKey
      ) {
        oldKeys.push(key);
      }
    }

    oldKeys.forEach(
      (key) => {
        sessionStorage.removeItem(
          key
        );
      }
    );

    sessionStorage.setItem(
      storageKey,
      payload
    );

    return true;
  } catch (error) {
    /*
    | Quota/cache failure must never affect Dashboard functionality.
    | Fresh API data has already loaded successfully.
    */

    return false;
  }
}

const EMPTY_ATTENDANCE = {
  rows: [],
  total: 0,
};

const CARD_STYLE = {
  borderRadius: 18,
  border: "1px solid rgba(255,255,255,.82)",
  boxShadow:
    "0 12px 34px rgba(44,78,110,.10), inset 0 1px 0 rgba(255,255,255,.75)",
  overflow: "hidden",
  background:
    "linear-gradient(145deg,rgba(255,255,255,.90) 0%,rgba(245,250,255,.78) 100%)",
  backdropFilter: "blur(16px) saturate(135%)",
  WebkitBackdropFilter: "blur(16px) saturate(135%)",
};

const DASHBOARD_HIDDEN_PREFIX =
  "pts_dashboard_hidden_v3_";

/*
|--------------------------------------------------------------------------
| DASHBOARD STATUS HEADS
|--------------------------------------------------------------------------
|
| NOTE:
| BioTime owns biometric identities/punches; PTS owns operational records.
| Long Weekend is overlaid from the Weekend Management API.
| Medical Rest card is sourced directly from Outdoor / Medical records
| because Medical Rest is operational and is not a biometric exemption.
| Home Rest remains an attendance exemption and is shown under Leave.
| Repatriate continues to use trainee_training_drop operational records.
|
| Leave includes Home Rest.
| OSD includes Short Permission.
| Training Drop is represented as Repatriate on Dashboard.
|
|--------------------------------------------------------------------------
*/

const STATUS_CONFIG = {
  Present: {
    color: "#10B981",
    soft: "#ECFDF5",
  },
  Absent: {
    color: "#EF4444",
    soft: "#FEF2F2",
  },
  Leave: {
    color: "#0EA5E9",
    soft: "#F0F9FF",
  },
  "Long Weekend": {
    color: "#64748B",
    soft: "#F8FAFC",
  },
  OSD: {
    color: "#7C3AED",
    soft: "#F5F3FF",
  },
  "Medical Rest": {
    color: "#F59E0B",
    soft: "#FFFBEB",
  },
  Duty: { color: "#2563EB", soft: "#EFF6FF" },
  "No Timetable": { color: "#DC2626", soft: "#FEF2F2" },
  "Not Processed": { color: "#94A3B8", soft: "#F8FAFC" },
  Repatriate: {
    color: "#EC4899",
    soft: "#FDF2F8",
  },
};

const STATUS_NAMES = [
  "Present", "Absent", "Leave", "Long Weekend", "OSD", "Medical Rest", "Repatriate",
];

const STAFF_STATUS_NAMES = [
  "Present",
  "Absent",
  "Leave",
  "Long Weekend",
  "OSD",
];

function staffStatusNames(rows) {
  const names = [...STAFF_STATUS_NAMES];
  for (const name of ["Duty", "No Timetable", "Not Processed", "Medical Rest", "Repatriate"]) {
    if ((rows || []).some((row) => rowStatusName(row) === name)) names.push(name);
  }
  return names;
}

function staffDutyDescription(assignment) {
  return [assignment.group_name, assignment.shift_name, assignment.duty_point_name,
    assignment.start_time && assignment.end_time
      ? `${assignment.start_time} – ${assignment.end_time}` : null].filter(Boolean).join(" • ");
}

function traineeStatusNames(rows) {
  return [...STATUS_NAMES, ...["No Timetable", "Not Processed"].filter(name => (rows || []).some(row => rowStatusName(row) === name))];
}

function dashboardStatusLabel(
  statusName,
  subjectType
) {
  if (
    subjectType === "STAFF" &&
    statusName === "Long Weekend"
  ) {
    return "Duty Rest";
  }

  return statusName;
}

const CARD_CONFIG = [
  {
    key: "ENROLLED",
    title: "Total Enrolled",
    color: "#4F46E5",
    soft: "#EEF2FF",
    icon: <TeamOutlined />,
  },
  {
    key: "Present",
    title: "Present",
    ...STATUS_CONFIG.Present,
    icon: <CheckCircleOutlined />,
  },
  {
    key: "Absent",
    title: "Absent",
    ...STATUS_CONFIG.Absent,
    icon: <WarningOutlined />,
  },
  {
    key: "Leave",
    title: "Leave",
    ...STATUS_CONFIG.Leave,
    icon: <CalendarOutlined />,
  },
  {
    key: "Long Weekend",
    title: "Long Weekend",
    ...STATUS_CONFIG["Long Weekend"],
    icon: <CalendarOutlined />,
  },
  {
    key: "OSD",
    title: "OSD",
    ...STATUS_CONFIG.OSD,
    icon: <UserOutlined />,
  },
  {
    key: "Medical Rest",
    title: "Medical Rest",
    ...STATUS_CONFIG["Medical Rest"],
    icon: <WarningOutlined />,
  },
  {
    key: "Repatriate",
    title: "Repatriate",
    ...STATUS_CONFIG.Repatriate,
    icon: <TeamOutlined />,
  },
];

const STAFF_CARD_CONFIG = [
  {
    key: "STAFF_TOTAL",
    title: "Total Staff",
    color: "#4F46E5",
    soft: "#EEF2FF",
    icon: <TeamOutlined />,
  },
  {
    key: "Present",
    title: "Present",
    ...STATUS_CONFIG.Present,
    icon: <CheckCircleOutlined />,
  },
  {
    key: "Absent",
    title: "Absent",
    ...STATUS_CONFIG.Absent,
    icon: <WarningOutlined />,
  },
  {
    key: "Leave",
    title: "Leave",
    ...STATUS_CONFIG.Leave,
    icon: <CalendarOutlined />,
  },
  {
    key: "Long Weekend",
    title: "Duty Rest",
    ...STATUS_CONFIG["Long Weekend"],
    icon: <CalendarOutlined />,
  },
  {
    key: "OSD",
    title: "OSD",
    ...STATUS_CONFIG.OSD,
    icon: <UserOutlined />,
  },
  {
    key: "Medical Rest",
    title: "Medical Rest",
    ...STATUS_CONFIG["Medical Rest"],
    icon: <WarningOutlined />,
  },
];

function getDashboardUserStorageId(user) {
  return String(
    user?.id ??
      user?.user_id ??
      user?.username ??
      user?.email ??
      "anonymous"
  );
}

function createDashboardHiddenKey({
  user,
  subjectType,
  sessionType,
}) {
  return (
    `${DASHBOARD_HIDDEN_PREFIX}` +
    `${getDashboardUserStorageId(user)}_` +
    `${String(subjectType).toLowerCase()}_` +
    `${String(sessionType).toLowerCase()}`
  );
}

function readHiddenGroups(storageKey) {
  if (!storageKey) return [];

  try {
    const raw =
      localStorage.getItem(storageKey);

    if (!raw) return [];

    const parsed =
      JSON.parse(raw);

    return Array.isArray(parsed)
      ? parsed.map(String)
      : [];
  } catch {
    return [];
  }
}

function saveHiddenGroups(
  storageKey,
  hiddenNames
) {
  if (!storageKey) return;

  try {
    localStorage.setItem(
      storageKey,
      JSON.stringify(
        Array.isArray(hiddenNames)
          ? hiddenNames
          : []
      )
    );
  } catch (error) {
    console.error(
      "Could not save Dashboard selection:",
      error
    );
  }
}

function formatTime(value) {
  if (!value) return "-";

  if (
    typeof value === "string" &&
    /^\d{2}:\d{2}/.test(value)
  ) {
    const parsed =
      dayjs(`2000-01-01 ${value}`);

    if (parsed.isValid()) {
      return parsed.format("hh:mm A");
    }
  }

  const parsed = dayjs(value);

  return parsed.isValid()
    ? parsed.format("hh:mm A")
    : String(value);
}

function normalize(value) {
  return String(value || "")
    .trim()
    .toUpperCase();
}

function manualAbsenceText(row) {
  const value =
    row?.manual_absence_data;

  if (!value) return "";

  if (typeof value === "string") {
    return value.toUpperCase();
  }

  try {
    return JSON.stringify(value)
      .toUpperCase();
  } catch {
    return "";
  }
}

/*
|--------------------------------------------------------------------------
| MAP CURRENT REPORT ROW TO NEW DASHBOARD HEAD
|--------------------------------------------------------------------------
*/

function rowStatusName(row) {
  if (["NOT_PROCESSED", "PENDING"].includes(normalize(row?.attendance_status))) {
    return normalize(row?.timing_status) === "NO_TIMETABLE" ? "No Timetable" : "Not Processed";
  }
  if (normalize(row?.attendance_status) === "NO_TIMETABLE") return "No Timetable";
  if (normalize(row?.subject_type) === "STAFF") {
    const attendance = normalize(row?.attendance_status);
    if (row?._dashboard_duty || attendance === "DUTY") return "Duty";
    if (attendance === "NO_TIMETABLE" ||
      (["", "PENDING", "NOT_PROCESSED"].includes(attendance) && normalize(row?.timing_status) === "NO_TIMETABLE")) return "No Timetable";
  }
  const attendance =
    normalize(
      row?.attendance_status
    );

  const exemption =
    normalize(
      row?.exemption_type
    );

  const description =
    normalize(
      row?.exemption_description
    );

  const manualText =
    manualAbsenceText(row);

  if (
    exemption.includes("TRAINING_DROP") ||
    exemption.includes("REPATRIATE") ||
    description.includes("TRAINING DROP") ||
    description.includes("REPATRIATE") ||
    attendance.includes("REPATRIATE")
  ) {
    return "Repatriate";
  }

  if (
    exemption.includes("MEDICAL_REST") ||
    description.includes("MEDICAL REST") ||
    attendance.includes("MEDICAL_REST")
  ) {
    return "Medical Rest";
  }

  if (
    attendance === "WEEKEND" ||
    exemption === "WEEKEND" ||
    exemption === "LONG_WEEKEND" ||
    (normalize(row?.subject_type) === "STAFF" && exemption === "DUTY_REST") ||
    description.includes("WEEKEND")
  ) {
    return "Long Weekend";
  }

  if (
    exemption === "OSD" ||
    exemption === "SHORT_PERMISSION" ||
    exemption === "PERMISSION" ||
    description.includes("SHORT PERMISSION") ||
    description === "OSD"
  ) {
    return "OSD";
  }

  /* Leave includes Home Rest exactly as requested. */
  if (
    exemption === "LEAVE" ||
    exemption === "HOME_REST" ||
    description.includes("HOME REST") ||
    description.includes("LEAVE")
  ) {
    return "Leave";
  }

  if (attendance === "PRESENT") {
    return "Present";
  }

  if (attendance === "ABSENT") {
    return "Absent";
  }

  return normalize(row?.subject_type) === "STAFF" ? "Not Processed" : null;
}

function identityKey(row) {
  return String(
    row?.subject_id ??
      row?.employee_id ??
      row?.id ??
      ""
  );
}

function uniqueRows(rows) {
  const map = new Map();

  (rows || []).forEach((row) => {
    const key = identityKey(row);

    if (key && !map.has(key)) {
      map.set(key, row);
    }
  });

  return [...map.values()];
}

/*
|---------------------------------------------------------------------------
| COMPLETED COURSE EXCLUSION
|---------------------------------------------------------------------------
|
| Course status is date-based in the existing PTS system:
| a course is COMPLETED when its end_date is earlier than today's date.
| Keep this filter independent of the selected attendance date so a trainee
| whose course has already completed is not counted on either session or
| on a historical dashboard date.
|---------------------------------------------------------------------------
*/
function isCompletedCourse(record) {
  const rawStartDate = record?.course_start_date;
  const rawEndDate = record?.course_end_date;

  if (!rawStartDate || !rawEndDate) {
    return false;
  }

  const startDate =
    rawStartDate instanceof Date
      ? dayjs(rawStartDate).format("YYYY-MM-DD")
      : String(rawStartDate).trim().slice(0, 10);

  const endDate =
    rawEndDate instanceof Date
      ? dayjs(rawEndDate).format("YYYY-MM-DD")
      : String(rawEndDate).trim().slice(0, 10);

  const isValidDate = (value) =>
    /^\d{4}-\d{2}-\d{2}$/.test(value);

  if (
    !isValidDate(startDate) ||
    !isValidDate(endDate)
  ) {
    return false;
  }

  const today = pakistanNow().slice(0,10);

  // Match the backend course-status rule: a course is COMPLETED
  // as soon as today's date is later than its configured end date.
  return today > endDate;
}

function filterCompletedCourseRows(rows) {
  return (rows || []).filter(
    (row) => !isCompletedCourse(row)
  );
}

function traineeRosterDashboardRow(record) {
  const attendanceStatus = "NOT_PROCESSED";
  const timingStatus = "NOT_PROCESSED";
  const exemptionType = null;
  const exemptionDescription = null;
  return {
    subject_type: "TRAINEE",
    subject_id: record.id,
    trainee_id: record.id,
    employee_id: employeeCode(record),
    biotime_emp_code: record.biotime_emp_code || record.zkteco_emp_code || null,
    subject_name:
      [record.first_name, record.last_name]
        .filter(Boolean)
        .join(" ") ||
      record.employee_id ||
      "-",
    first_name: record.first_name || null,
    last_name: record.last_name || null,
    course_id: record.course_id || null,
    course_name: record.course_name || "No Course",
    platoon_id: record.platoon_id || null,
    platoon_number: record.platoon_number ?? null,
    attendance_status: attendanceStatus,
    timing_status: timingStatus,
    timing_minutes: null,
    exemption_type: exemptionType,
    exemption_description: exemptionDescription,
    selected_punch: null,
    transaction_id: null,
    _dashboard_master_roster: true,
  };
}

function mergeTraineeRosterIntoRows(rows, roster) {
  const map = new Map();

  const allowedIds = new Set(filterCompletedCourseRows(roster).map(record => String(record.id)));
  filterCompletedCourseRows(rows).filter(row => allowedIds.has(String(row.subject_id))).forEach((row) => {
    const key = identityKey(row);

    if (key) {
      map.set(key, row);
    }
  });

  filterCompletedCourseRows(roster).forEach((record) => {
    const key = String(record?.id ?? "");

    if (!key) {
      return;
    }

    if (!map.has(key)) {
      map.set(
        key,
        traineeRosterDashboardRow(record)
      );
      return;
    }

    const existing = map.get(key);

    map.set(key, {
      ...traineeRosterDashboardRow(record),
      ...existing,
      employee_id: employeeCode(record),
      biotime_emp_code: record.biotime_emp_code || record.zkteco_emp_code || existing.biotime_emp_code,
      course_id:
        existing.course_id ??
        record.course_id ??
        null,
      course_name:
        existing.course_name ||
        record.course_name ||
        "No Course",
      platoon_id:
        existing.platoon_id ??
        record.platoon_id ??
        null,
      platoon_number:
        existing.platoon_number ??
        record.platoon_number ??
        null,
    });
  });

  return [...map.values()];
}

/*
|--------------------------------------------------------------------------
| REPATRIATE / TRAINING DROP OVERLAY
|--------------------------------------------------------------------------
|
| Repatriate module is backed by trainee_training_drop. Attendance report
| rows may still contain PRESENT/ABSENT data for a trainee who has since
| been repatriated. The Dashboard must therefore overlay the active
| Repatriate state before calculating cards, pies and statements.
|
|--------------------------------------------------------------------------
*/

function repatriateRecordKeys(record) {
  return [
    record?.trainee_id,
    record?.subject_id,
    record?.employee_id,
    record?.emp_code,
  ]
    .filter(
      (value) =>
        value !== undefined &&
        value !== null &&
        String(value).trim() !== ""
    )
    .map((value) =>
      String(value).trim()
    );
}

function rowIdentityKeys(row) {
  return [
    row?.subject_id,
    row?.trainee_id,
    row?.employee_id,
    row?.emp_code,
    row?.id,
  ]
    .filter(
      (value) =>
        value !== undefined &&
        value !== null &&
        String(value).trim() !== ""
    )
    .map((value) =>
      String(value).trim()
    );
}

function repatriateMatchesRow(
  record,
  row
) {
  return repatriateMatches(record, row);
}

function applyRepatriatesToRows(
  rows,
  repatriateRows
) {
  const sourceRows =
    Array.isArray(rows)
      ? rows
      : [];

  // Repatriate records are loaded from a separate operational endpoint,
  // so filter completed courses here before overlaying or adding pseudo rows.
  const activeRepatriates =
    filterCompletedCourseRows(
      Array.isArray(repatriateRows)
        ? repatriateRows
        : []
    );

  const matchedDropIds =
    new Set();

  const overlaid =
    sourceRows.map((row) => {
      const match =
        activeRepatriates.find(
          (record) =>
            repatriateMatchesRow(
              record,
              row
            )
        );

      if (!match) {
        return row;
      }

      if (match.id) {
        matchedDropIds.add(
          String(match.id)
        );
      }

      return {
        ...row,

        attendance_status:
          "EXEMPT",

        timing_status:
          "EXEMPT",

        exemption_type:
          "TRAINING_DROP_REPATRIATE",

        exemption_description:
          match.reason ||
          "Repatriate",

        selected_punch: null,
        transaction_id: null,
        repatriate_reason: match.reason || null,
        repatriate_drop_id:
          match.id ||
          null,

        repatriate_drop_datetime:
          match.drop_datetime ||
          null,
      };
    });

  /*
  |--------------------------------------------------------------------------
  | ADD REPATRIATES MISSING FROM ATTENDANCE REPORT
  |--------------------------------------------------------------------------
  |
  | This is required when a newly added / dropped trainee has no generated
  | attendance row yet. Without this pseudo row the top Repatriate card can
  | never reach the actual active Repatriate count.
  |
  |--------------------------------------------------------------------------
  */

  const additions = [];

  activeRepatriates.forEach(
    (record) => {
      if (
        record?.id &&
        matchedDropIds.has(
          String(record.id)
        )
      ) {
        return;
      }

      const alreadyExists =
        sourceRows.some(
          (row) =>
            repatriateMatchesRow(
              record,
              row
            )
        );

      if (alreadyExists) {
        return;
      }

      additions.push({
        subject_type:
          "TRAINEE",

        subject_id:
          record.trainee_id ??
          record.subject_id ??
          null,

        trainee_id:
          record.trainee_id ??
          record.subject_id ??
          null,

        employee_id:
          record.employee_id ||
          record.emp_code ||
          "-",

        subject_name:
          record.trainee_name ||
          record.subject_name ||
          record.name ||
          "-",

        course_id:
          record.course_id ||
          null,

        course_name:
          record.course_name ||
          "No Course",

        platoon_id:
          record.platoon_id ||
          null,

        platoon_number:
          record.platoon_number ??
          null,

        attendance_status:
          "EXEMPT",

        timing_status:
          "EXEMPT",

        exemption_type:
          "TRAINING_DROP_REPATRIATE",

        exemption_description:
          record.reason ||
          "Repatriate",

        selected_punch:
          null,

        transaction_id:
          null,

        repatriate_reason: record.reason || null,
        repatriate_drop_id:
          record.id ||
          null,

        repatriate_drop_datetime:
          record.drop_datetime ||
          null,

        _dashboard_supplemental:
          true,
      });
    }
  );

  return uniqueRows([
    ...overlaid,
    ...additions,
  ]);
}


/*
|--------------------------------------------------------------------------
| MEDICAL REST DASHBOARD SOURCE
|--------------------------------------------------------------------------
|
| Business rule remains unchanged:
| Medical Rest is NOT a biometric attendance exemption.
|
| The Dashboard Medical Rest card is an operational card. It reads the
| exact Medical Rest period saved in Outdoor / Medical Management instead
| of waiting for attendance_records.exemption_type = MEDICAL_REST.
|
| Home Rest is intentionally NOT handled here because Home Rest is already
| an approved attendance exemption and is represented under Leave.
|
|--------------------------------------------------------------------------
*/

function medicalRestRecordApplies({
  record,
  selectedDate,
  now,
}) {
  if (!record) {
    return false;
  }

  if (
    normalize(
      record.workflow_status
    ) === "CANCELLED"
  ) {
    return false;
  }

  const medicalRestEnabled =
    record.medical_rest === true ||
    Number(
      record.medical_rest
    ) === 1;

  if (!medicalRestEnabled) {
    return false;
  }

  const start =
    dayjs(
      record.medical_rest_start_datetime
    );

  const end =
    dayjs(
      record.medical_rest_end_datetime
    );

  if (
    !start.isValid() ||
    !end.isValid()
  ) {
    return false;
  }

  const selectedDay =
    dayjs(selectedDate);

  const currentMoment =
    dayjs(now);

  /*
  | Current date = exact current moment.
  | Historical/future selected date = any overlap with that selected day.
  */

  if (
    selectedDay.isSame(
      currentMoment,
      "day"
    )
  ) {
    return (
      start.valueOf() <=
        currentMoment.valueOf() &&
      end.valueOf() >=
        currentMoment.valueOf()
    );
  }

  const dayStart =
    selectedDay.startOf(
      "day"
    );

  const dayEnd =
    selectedDay.endOf(
      "day"
    );

  return (
    start.valueOf() <=
      dayEnd.valueOf() &&
    end.valueOf() >=
      dayStart.valueOf()
  );
}

function medicalRestDashboardRow(
  record
) {
  return {
    ...record,

    attendance_status:
      "MEDICAL_REST",

    timing_status:
      "MEDICAL_REST",

    timing_minutes:
      null,

    exemption_type:
      "MEDICAL_REST_OPERATIONAL",

    exemption_record_id:
      record.id ||
      null,

    exemption_description:
      record.doctor_recommendation ||
      "Medical Rest",

    selected_punch:
      null,

    transaction_id:
      null,

    medical_rest_record_id:
      record.id ||
      null,
  };
}

function activeMedicalRestRows({
  records,
  selectedDate,
  now,
}) {
  const mapped =
    (
      Array.isArray(records)
        ? records
        : []
    )
      .filter(
        (record) =>
          !isCompletedCourse(record) &&
          medicalRestRecordApplies({
            record,
            selectedDate,
            now,
          })
      )
      .map(
        medicalRestDashboardRow
      );

  return uniqueRows(
    mapped
  );
}

/*
|--------------------------------------------------------------------------
| LONG WEEKEND OVERLAY
|--------------------------------------------------------------------------
|
| Long Weekend records are managed from the Timetable page and may apply to:
| - all Trainees
| - selected Trainee Courses
| - all Staff
| - selected Staff Categories
|
| Dashboard uses this overlay so attendance reports do not falsely show
| ABSENT/PRESENT during the configured Long Weekend period.
|
|--------------------------------------------------------------------------
*/

function dashboardDateTime(
  value,
  selectedDate = null
) {
  if (!value) {
    return null;
  }

  if (
    dayjs.isDayjs?.(value)
  ) {
    return value;
  }

  const text =
    String(value).trim();

  if (!text) {
    return null;
  }

  let parsed = null;

  if (
    selectedDate &&
    /^\d{1,2}:\d{2}/.test(
      text
    )
  ) {
    parsed =
      dayjs(
        `${dayjs(
          selectedDate
        ).format(
          "YYYY-MM-DD"
        )} ${text}`
      );
  } else {
    parsed =
      dayjs(value);
  }

  return parsed.isValid()
    ? parsed
    : null;
}

function formatDashboardDateTime(
  value
) {
  const parsed =
    dashboardDateTime(
      value
    );

  return parsed
    ? parsed.format(
        "DD-MMM-YYYY hh:mm A"
      )
    : "-";
}

function weekendRecordEnabled(
  record
) {
  const value =
    record?.is_active;

  return (
    value === true ||
    value === 1 ||
    value === "1"
  );
}

function weekendScopeMatchesRow(
  record,
  row,
  subjectType
) {
  /*
  |--------------------------------------------------------------------------
  | Long Weekend is now Trainee-only AND biometric-departure based.
  | A trainee is counted as Long Weekend only after a valid punch inside the
  | configured departure punch window. Weekend Detain trainees therefore do
  | not become Long Weekend on Dashboard.
  |--------------------------------------------------------------------------
  */

  if (
    subjectType !==
    "TRAINEE"
  ) {
    return false;
  }

  const traineeId =
    Number(
      row?.subject_id ||
      row?.trainee_id
    );

  if (!traineeId) {
    return false;
  }

  const departedIds =
    (
      record
        ?.departure_present_trainee_ids ||
      []
    ).map(
      Number
    );

  if (
    !departedIds.includes(
      traineeId
    )
  ) {
    return false;
  }

  if (
    record?.apply_all_trainees ===
      true ||
    Number(
      record?.apply_all_trainees
    ) === 1
  ) {
    return true;
  }

  const courseId =
    Number(
      row?.course_id
    );

  if (!courseId) {
    return false;
  }

  return (
    record?.course_ids ||
    []
  )
    .map(Number)
    .includes(
      courseId
    );
}

function weekendOverlapsRowWindow(
  record,
  row,
  selectedDate
) {
  const weekendStart =
    dashboardDateTime(
      record?.start_datetime
    );

  const weekendEnd =
    dashboardDateTime(
      record?.end_datetime
    );

  if (
    !weekendStart ||
    !weekendEnd
  ) {
    return false;
  }

  let rowStart =
    dashboardDateTime(
      row?.early_window_start ||
        row?.window_start,
      selectedDate
    );

  let rowEnd =
    dashboardDateTime(
      row?.late_window_end ||
        row?.window_end,
      selectedDate
    );

  if (
    !rowStart ||
    !rowEnd
  ) {
    const day =
      dayjs(
        selectedDate
      );

    rowStart =
      day.startOf(
        "day"
      );

    rowEnd =
      day.endOf(
        "day"
      );
  }

  return (
    rowStart.valueOf() <
      weekendEnd.valueOf() &&
    rowEnd.valueOf() >
      weekendStart.valueOf()
  );
}

function applyLongWeekendsToRows({
  rows,
  weekends,
  subjectType,
  selectedDate,
}) {
  const sourceRows =
    Array.isArray(rows)
      ? rows
      : [];

  const activeWeekends =
    (
      Array.isArray(weekends)
        ? weekends
        : []
    ).filter(
      weekendRecordEnabled
    );

  if (
    !sourceRows.length ||
    !activeWeekends.length
  ) {
    return sourceRows;
  }

  return sourceRows.map(
    (row) => {
      if (subjectType === "STAFF" && row._dashboard_duty) return row;
      const match =
        activeWeekends.find(
          (record) =>
            weekendScopeMatchesRow(
              record,
              row,
              subjectType
            ) &&
            weekendOverlapsRowWindow(
              record,
              row,
              selectedDate
            )
        );

      if (!match) {
        return row;
      }

      return {
        ...row,

        attendance_status:
          "EXEMPT",

        timing_status:
          "EXEMPT",

        timing_minutes:
          null,

        exemption_type:
          "LONG_WEEKEND",

        exemption_record_id:
          match.id ||
          null,

        exemption_description:
          match.weekend_name ||
          "Long Weekend",

        selected_punch:
          null,

        transaction_id:
          null,

        long_weekend_id:
          match.id ||
          null,

        long_weekend_name:
          match.weekend_name ||
          "Long Weekend",

        long_weekend_start:
          match.start_datetime ||
          null,

        long_weekend_end:
          match.end_datetime ||
          null,
      };
    }
  );
}

function getLongWeekendSummary(
  weekends,
  now
) {
  const currentMoment =
    dayjs(now);

  const enabled =
    (
      Array.isArray(weekends)
        ? weekends
        : []
    )
      .filter(
        weekendRecordEnabled
      )
      .map(
        (record) => ({
          ...record,

          _start:
            dashboardDateTime(
              record.start_datetime
            ),

          _end:
            dashboardDateTime(
              record.end_datetime
            ),
        })
      )
      .filter(
        (record) =>
          record._start &&
          record._end
      );

  const completed =
    enabled.filter(
      (record) =>
        record._end.valueOf() <
        currentMoment.valueOf()
    );

  const active =
    enabled
      .filter(
        (record) =>
          record._start.valueOf() <=
            currentMoment.valueOf() &&
          record._end.valueOf() >=
            currentMoment.valueOf()
      )
      .sort(
        (a, b) =>
          a._end.valueOf() -
          b._end.valueOf()
      )[0] ||
    null;

  const next =
    enabled
      .filter(
        (record) =>
          record._start.valueOf() >
          currentMoment.valueOf()
      )
      .sort(
        (a, b) =>
          a._start.valueOf() -
          b._start.valueOf()
      )[0] ||
    null;

  let subtitle =
    "No upcoming Long Weekend";

  if (active) {
    subtitle =
      `Active until ${active._end.format(
        "DD-MMM hh:mm A"
      )}`;

    if (next) {
      subtitle +=
        ` • Next ${next._start.format(
          "DD-MMM hh:mm A"
        )}`;
    }
  } else if (next) {
    subtitle =
      `Next: ${next._start.format(
        "DD-MMM-YYYY hh:mm A"
      )}`;
  }

  return {
    completedCount:
      completed.length,

    active,

    next,

    subtitle,
  };
}

function statementIsLongWeekend(
  statement
) {
  const rows =
    statement?.rows ||
    [];

  return (
    rows.length >
      0 &&
    rows.every(
      (row) =>
        rowStatusName(row) ===
        "Long Weekend"
    )
  );
}

function getStatusCounts(rows) {
  const counts = {};

  Object.keys(STATUS_CONFIG).forEach(
    (name) => {
      counts[name] = 0;
    }
  );

  (rows || []).forEach(
    (row) => {
      const name =
        rowStatusName(row);

      if (
        name &&
        Object.prototype.hasOwnProperty.call(
          counts,
          name
        )
      ) {
        counts[name] += 1;
      }
    }
  );

  return counts;
}

function filterRowsByStatus(
  rows,
  statusName
) {
  return (rows || []).filter(
    (row) =>
      rowStatusName(row) ===
      statusName
  );
}

function buildPieData(
  rows,
  statusNames = STATUS_NAMES
) {
  const counts =
    getStatusCounts(rows);

  return statusNames.map(
    (name) => ({
      name,
      value:
        counts[name] || 0,
      color:
        STATUS_CONFIG[name].color,
    })
  );
}

function groupName(
  row,
  subjectType
) {
  if (
    subjectType === "TRAINEE"
  ) {
    return (
      row?.course_name ||
      "No Course"
    );
  }

  return (
    row?.category_name ||
    "No Category"
  );
}

function buildGroupStatements(
  rows,
  subjectType
) {
  const map = new Map();

  (rows || []).forEach((row) => {
    const name =
      groupName(
        row,
        subjectType
      );

    if (!map.has(name)) {
      map.set(name, []);
    }

    map.get(name).push(row);
  });

  return [...map.entries()]
    .map(
      ([name, groupRows]) => {
        const enrolledRows =
          uniqueRows(groupRows);

        const counts =
          getStatusCounts(
            enrolledRows
          );

        return {
          key: name,
          name,
          rows: enrolledRows,
          total: enrolledRows.length,
          enrolled:
            enrolledRows.length,
          ...counts,
        };
      }
    )
    .sort(
      (a, b) =>
        b.enrolled -
        a.enrolled
    );
}

/*
|--------------------------------------------------------------------------
| DAILY SNAPSHOT FOR TOP CARDS
|--------------------------------------------------------------------------
|
| One person must appear once on top cards.
| Evening row is used only when it contains a meaningful evening event;
| otherwise Morning remains the daily snapshot. This avoids an unstarted
| evening session turning everybody into Absent in the top overview.
|
|--------------------------------------------------------------------------
*/

function buildDailySnapshot(
  morningRows,
  eveningRows
) {
  const map = new Map();

  uniqueRows(morningRows).forEach(
    (row) => {
      map.set(
        identityKey(row),
        row
      );
    }
  );

  uniqueRows(eveningRows).forEach(
    (row) => {
      const key =
        identityKey(row);

      const meaningfulEvening =
        Boolean(
          row?.selected_punch ||
            row?.transaction_id ||
            row?.attendance_status ===
              "EXEMPT" ||
            rowStatusName(row) ===
              "Long Weekend" ||
            rowStatusName(row) ===
              "Repatriate"
        );

      if (
        meaningfulEvening ||
        !map.has(key)
      ) {
        map.set(key, row);
      }
    }
  );

  return [...map.values()];
}

function attendanceTagColor(value) {
  switch (value) {
    case "PRESENT":
      return "green";
    case "ABSENT":
      return "red";
    case "EXEMPT":
      return "blue";
    case "MEDICAL_REST":
      return "orange";
    case "NO_TIMETABLE":
      return "orange";
    default:
      return "default";
  }
}

/*
|--------------------------------------------------------------------------
| PIE LABEL / TOOLTIP
|--------------------------------------------------------------------------
*/

function renderPieValueLabel({
  cx,
  cy,
  midAngle,
  outerRadius,
  value,
  labelOffset = 28,
  chartWidth = 0,
  chartHeight = 0,
}) {
  if (!value) return null;

  const RADIAN =
    Math.PI / 180;

  const angle =
    -midAngle * RADIAN;

  const startRadius =
    outerRadius + 3;

  const elbowRadius =
    outerRadius +
    Math.max(
      9,
      labelOffset * 0.55
    );

  const textRadius =
    outerRadius + labelOffset;

  const startX =
    cx +
    startRadius *
      Math.cos(angle);

  const startY =
    cy +
    startRadius *
      Math.sin(angle);

  const elbowX =
    cx +
    elbowRadius *
      Math.cos(angle);

  const elbowY =
    cy +
    elbowRadius *
      Math.sin(angle);

  const desiredX =
    cx +
    textRadius *
      Math.cos(angle);

  const desiredY =
    cy +
    textRadius *
      Math.sin(angle);

  const rightSide =
    desiredX >= cx;

  const horizontalPadding = 24;
  const verticalPadding = 12;

  const safeMinX =
    horizontalPadding;

  const safeMaxX =
    chartWidth > 0
      ? chartWidth -
        horizontalPadding
      : desiredX;

  const safeMinY =
    verticalPadding;

  const safeMaxY =
    chartHeight > 0
      ? chartHeight -
        verticalPadding
      : desiredY;

  const x =
    chartWidth > 0
      ? Math.min(
          Math.max(
            desiredX,
            safeMinX
          ),
          safeMaxX
        )
      : desiredX;

  const y =
    chartHeight > 0
      ? Math.min(
          Math.max(
            desiredY,
            safeMinY
          ),
          safeMaxY
        )
      : desiredY;

  const lineEndX =
    x +
    (rightSide ? -5 : 5);

  return (
    <g>
      <polyline
        points={`${startX},${startY} ${elbowX},${elbowY} ${lineEndX},${y}`}
        fill="none"
        stroke="#94A3B8"
        strokeWidth="1.2"
        vectorEffect="non-scaling-stroke"
      />

      <text
        x={x}
        y={y}
        fill="#0F172A"
        textAnchor={
          rightSide
            ? "start"
            : "end"
        }
        dominantBaseline="central"
        style={{
          fontSize: 12,
          fontWeight: 800,
        }}
      >
        {value}
      </text>
    </g>
  );
}

function PieTooltip({
  active,
  payload,
  subjectType = null,
}) {
  if (
    !active ||
    !payload?.length
  ) {
    return null;
  }

  const data =
    payload[0]?.payload;

  if (!data) return null;

  return (
    <div
      style={{
        minWidth: 145,
        padding: "10px 12px",
        background: "#fff",
        borderRadius: 12,
        border:
          `1px solid ${data.color}55`,
        boxShadow:
          "0 12px 30px rgba(15,23,42,.15)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 7,
        }}
      >
        <span
          style={{
            width: 9,
            height: 9,
            borderRadius: "50%",
            background: data.color,
          }}
        />

        <Text strong>
          {dashboardStatusLabel(
            data.name,
            subjectType
          )}
        </Text>
      </div>

      <div
        style={{
          marginTop: 5,
          fontSize: 21,
          fontWeight: 900,
          color: data.color,
        }}
      >
        {data.value}
      </div>

      <Text
        type="secondary"
        style={{ fontSize: 10 }}
      >
        Click slice to view list
      </Text>
    </div>
  );
}

function StatusLegend({
  statusNames = STATUS_NAMES,
  subjectType = null,
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        flexWrap: "wrap",
        gap: "8px 15px",
        padding: "3px 4px 0",
      }}
    >
      {statusNames.map(
        (name) => (
          <div
            key={name}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              fontSize: 11,
              color: "#475569",
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background:
                  STATUS_CONFIG[name]
                    .color,
              }}
            />
            {dashboardStatusLabel(
              name,
              subjectType
            )}
          </div>
        )
      )}
    </div>
  );
}

function AttendancePie({
  rows,
  onStatusClick,
  size = 250,
  donut = false,
  centerTotal = null,
  outerRadius: requestedOuterRadius = null,
  statusNames = STATUS_NAMES,
  subjectType = null,
}) {
  const containerRef =
    useRef(null);

  const [containerWidth, setContainerWidth] =
    useState(0);

  useEffect(() => {
    const node =
      containerRef.current;

    if (!node) {
      return undefined;
    }

    const updateWidth = () => {
      setContainerWidth(
        node.getBoundingClientRect()
          .width || 0
      );
    };

    updateWidth();

    if (
      typeof ResizeObserver ===
      "undefined"
    ) {
      window.addEventListener(
        "resize",
        updateWidth
      );

      return () =>
        window.removeEventListener(
          "resize",
          updateWidth
        );
    }

    const observer =
      new ResizeObserver(
        updateWidth
      );

    observer.observe(node);

    return () =>
      observer.disconnect();
  }, []);

  const data =
    useMemo(
      () =>
        buildPieData(
          rows,
          statusNames
        ).filter(
          (item) => item.value > 0
        ),
      [rows, statusNames]
    );

  if (!rows?.length) {
    return (
      <div
        style={{
          height: size,
          display: "grid",
          placeItems: "center",
        }}
      >
        <Empty description="No processed attendance" />
      </div>
    );
  }

  if (!data.length) {
    return (
      <div
        style={{
          height: size,
          display: "grid",
          placeItems: "center",
        }}
      >
        <Empty description="No classified attendance" />
      </div>
    );
  }

  const preferredOuterRadius =
    requestedOuterRadius ||
    (size >= 340
      ? 122
      : size >= 260
      ? 92
      : 72);

  const labelOffset =
    donut ? 16 : 28;

  const horizontalReserve =
    donut ? 52 : 68;

  const maxRadiusByWidth =
    containerWidth > 0
      ? Math.floor(
          (
            containerWidth -
            horizontalReserve * 2
          ) / 2
        )
      : preferredOuterRadius;

  const maxRadiusByHeight =
    Math.floor(
      (size - 74) / 2
    );

  const outerRadius =
    Math.max(
      34,
      Math.min(
        preferredOuterRadius,
        maxRadiusByWidth > 0
          ? maxRadiusByWidth
          : preferredOuterRadius,
        maxRadiusByHeight > 0
          ? maxRadiusByHeight
          : preferredOuterRadius
      )
    );

  const innerRadius =
    donut
      ? Math.round(
          outerRadius * 0.82
        )
      : 0;

  return (
    <div
      ref={containerRef}
      className="pts-dashboard-pie-wrap"
      style={{
        height: size,
        width: "100%",
        minWidth: 0,
        position: "relative",
      }}
    >
      <ResponsiveContainer
        width="100%"
        height="100%"
      >
        <PieChart
          margin={{
            top: 34,
            right: donut ? 48 : 58,
            bottom: 34,
            left: donut ? 48 : 58,
          }}
        >
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius={innerRadius}
            outerRadius={outerRadius}
            paddingAngle={1}
            stroke="#FFFFFF"
            strokeWidth={2}
            labelLine={false}
            label={(props) =>
              renderPieValueLabel({
                ...props,
                labelOffset,
                chartWidth:
                  containerWidth,
                chartHeight:
                  size,
              })
            }
            isAnimationActive={false}
            onClick={(entry) =>
              onStatusClick?.(
                entry.name
              )
            }
            style={{
              cursor: "pointer",
              outline: "none",
            }}
          >
            {data.map((item) => (
              <Cell
                key={item.name}
                fill={item.color}
                style={{
                  cursor: "pointer",
                  filter:
                    "drop-shadow(0 4px 7px rgba(15,23,42,.14))",
                }}
              />
            ))}
          </Pie>

          <RechartsTooltip
            content={
              <PieTooltip
                subjectType={subjectType}
              />
            }
          />
        </PieChart>
      </ResponsiveContainer>

      {donut && (
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            transform: "translate(-50%, -50%)",
            pointerEvents: "none",
            textAlign: "center",
            lineHeight: 1,
          }}
        >
          <div
            style={{
              fontSize: size >= 220 ? 25 : 20,
              fontWeight: 900,
              color: "#0F172A",
            }}
          >
            {centerTotal ?? rows.length}
          </div>
        </div>
      )}
    </div>
  );
}

/*
|--------------------------------------------------------------------------
| GROUP SELECTION
|--------------------------------------------------------------------------
*/

function GroupFilterPopover({
  names,
  appliedNames,
  onApply,
  subjectType,
}) {
  const [open, setOpen] =
    useState(false);

  const [temporary, setTemporary] =
    useState(appliedNames);

  useEffect(() => {
    if (open) {
      setTemporary(
        appliedNames
      );
    }
  }, [open, appliedNames]);

  const content = (
    <div style={{ width: 320, maxWidth: "calc(100vw - 40px)" }}>
      <div style={{ marginBottom: 10 }}>
        <Text strong>
          {subjectType === "TRAINEE"
            ? "Select Courses"
            : "Select Categories"}
        </Text>
        <div>
          <Text
            type="secondary"
            style={{ fontSize: 11 }}
          >
            Uncheck items you want to hide.
          </Text>
        </div>
      </div>

      <div
        style={{
          maxHeight: 280,
          overflowY: "auto",
          paddingRight: 4,
        }}
      >
        <Checkbox.Group
          value={temporary}
          onChange={setTemporary}
          style={{ width: "100%" }}
        >
          <Space
            direction="vertical"
            size={7}
            style={{ width: "100%" }}
          >
            {names.map((name) => (
              <Checkbox
                key={name}
                value={name}
              >
                {name}
              </Checkbox>
            ))}
          </Space>
        </Checkbox.Group>
      </div>

      <div
        style={{
          marginTop: 12,
          paddingTop: 10,
          borderTop:
            "1px solid #F1F5F9",
          display: "flex",
          justifyContent:
            "space-between",
          gap: 8,
        }}
      >
        <Space>
          <Button
            size="small"
            onClick={() =>
              setTemporary(names)
            }
          >
            All
          </Button>

          <Button
            size="small"
            onClick={() =>
              setTemporary([])
            }
          >
            None
          </Button>
        </Space>

        <Button
          size="small"
          type="primary"
          onClick={() => {
            onApply(temporary);
            setOpen(false);
          }}
        >
          Apply Selection
        </Button>
      </div>
    </div>
  );

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      trigger="click"
      placement="bottomRight"
      content={content}
    >
      <Button
        size="small"
        icon={<ControlOutlined />}
      >
        {subjectType === "TRAINEE"
          ? "Choose Courses"
          : "Choose Categories"}
      </Button>
    </Popover>
  );
}

function useVisibleGroups({
  allNames,
  preferenceKey,
}) {
  const [hiddenNames, setHiddenNames] =
    useState([]);

  useEffect(() => {
    const saved =
      readHiddenGroups(
        preferenceKey
      );

    if (!allNames.length) {
      setHiddenNames(saved);
      return;
    }

    const current =
      new Set(allNames);

    const cleaned =
      saved.filter((name) =>
        current.has(name)
      );

    setHiddenNames(cleaned);

    if (
      cleaned.length !==
      saved.length
    ) {
      saveHiddenGroups(
        preferenceKey,
        cleaned
      );
    }
  }, [
    preferenceKey,
    allNames.join("|"),
  ]);

  const selectedNames =
    useMemo(
      () =>
        allNames.filter(
          (name) =>
            !hiddenNames.includes(
              name
            )
        ),
      [allNames, hiddenNames]
    );

  const applySelection =
    (checkedNames) => {
      const checked =
        Array.isArray(
          checkedNames
        )
          ? checkedNames
          : [];

      const hidden =
        allNames.filter(
          (name) =>
            !checked.includes(name)
        );

      setHiddenNames(hidden);
      saveHiddenGroups(
        preferenceKey,
        hidden
      );
    };

  return {
    selectedNames,
    applySelection,
  };
}

/*
|--------------------------------------------------------------------------
| TOP CARDS
|--------------------------------------------------------------------------
*/

function SummaryCard({
  item,
  value,
  onClick,
  subtitle = null,
}) {
  return (
    <Card
      hoverable={Boolean(onClick)}
      onClick={onClick}
      style={{
        ...CARD_STYLE,
        height: "100%",
        cursor: onClick
          ? "pointer"
          : "default",
        background:
          `linear-gradient(145deg,#FFFFFF 0%,${item.soft || "#F8FAFC"} 100%)`,
        borderTop:
          `3px solid ${item.color}`,
      }}
      styles={{
        body: {
          padding: "12px 10px 11px",
        },
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent:
            "space-between",
          gap: 5,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              color: "#64748B",
              fontSize: 10,
              fontWeight: 700,
              textTransform:
                "uppercase",
              letterSpacing: ".3px",
              whiteSpace: "normal",
              overflowWrap: "anywhere",
              lineHeight: 1.15,
              minHeight: 23,
            }}
          >
            {item.title}
          </div>

          <div
            style={{
              marginTop: 8,
              color: item.color,
              fontSize: "clamp(22px,2vw,27px)",
              fontWeight: 900,
              lineHeight: 1,
            }}
          >
            {value}
          </div>

          {subtitle ? (
            <div
              style={{
                marginTop: 6,
                maxWidth: 155,
                color: "#64748B",
                fontSize: 9,
                fontWeight: 700,
                lineHeight: 1.25,
                overflowWrap: "anywhere",
              }}
            >
              {subtitle}
            </div>
          ) : null}
        </div>

        <div
          style={{
            width: 34,
            height: 34,
            borderRadius: 11,
            display: "grid",
            placeItems: "center",
            background: item.soft,
            color: item.color,
            fontSize: 17,
            flex: "0 0 auto",
          }}
        >
          {item.icon}
        </div>
      </div>

      <div
        style={{
          marginTop: 13,
          height: 5,
          borderRadius: 99,
          background: "#EAEFF5",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width:
              Number(value) > 0
                ? "100%"
                : "2%",
            height: "100%",
            borderRadius: 99,
            background: item.color,
            opacity:
              Number(value) > 0
                ? 1
                : 0.25,
          }}
        />
      </div>
    </Card>
  );
}

/*
|--------------------------------------------------------------------------
| COURSE / CATEGORY PIE CARD
|--------------------------------------------------------------------------
*/

function GroupPieCard({
  statement,
  sessionTitle,
  onOpenList,
  subjectType,
}) {
  const openStatus =
    (statusName) => {
      onOpenList(
        `${sessionTitle} - ${statement.name} - ${dashboardStatusLabel(
          statusName,
          subjectType
        )}`,
        filterRowsByStatus(
          statement.rows,
          statusName
        )
      );
    };

  const isLongWeekend =
    statementIsLongWeekend(
      statement
    );

  const weekendRow =
    isLongWeekend
      ? (
          statement.rows ||
          []
        ).find(
          (row) =>
            row?.long_weekend_id ||
            rowStatusName(row) ===
              "Long Weekend"
        )
      : null;

  return (
    <Card
      className="pts-dashboard-group-card"
      style={{
        ...CARD_STYLE,
        height: "100%",
        minWidth: 0,
        ...(isLongWeekend
          ? {
              background:
                "linear-gradient(145deg,#F8FAFC 0%,#EEF2F7 100%)",
              borderColor:
                "#CBD5E1",
            }
          : {}),
      }}
      styles={{
        body: {
          padding: "10px 8px 8px",
        },
      }}
    >
      <div
        style={{
          minHeight: 36,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          padding: "0 4px",
        }}
      >
        <Text
          strong
          style={{
            color: isLongWeekend
              ? "#475569"
              : "#0B1220",
            fontSize: "clamp(12px,1.1vw,14px)",
            fontWeight: 900,
            lineHeight: 1.3,
            overflowWrap: "anywhere",
          }}
        >
          {statement.name}
        </Text>
      </div>

      {isLongWeekend ? (
        <div
          style={{
            height: 218,
            display: "grid",
            placeItems: "center",
            padding: 8,
          }}
        >
          <div
            style={{
              textAlign: "center",
            }}
          >
            <div
              style={{
                width: 132,
                height: 132,
                margin: "0 auto",
                borderRadius: "50%",
                border:
                  "18px solid #CBD5E1",
                display: "grid",
                placeItems: "center",
                background: "#F8FAFC",
                boxShadow:
                  "0 10px 24px rgba(100,116,139,.12)",
              }}
            >
              <div>
                <CalendarOutlined
                  style={{
                    display: "block",
                    marginBottom: 6,
                    color: "#64748B",
                    fontSize: 22,
                  }}
                />

                <div
                  style={{
                    color: "#475569",
                    fontSize: 11,
                    fontWeight: 950,
                    lineHeight: 1.15,
                    textTransform:
                      "uppercase",
                    letterSpacing:
                      ".45px",
                  }}
                >
                  {subjectType === "STAFF"
                    ? "Duty Rest"
                    : (
                      <>
                        Long
                        <br />
                        Weekend
                      </>
                    )}
                </div>
              </div>
            </div>

            <div
              style={{
                marginTop: 8,
                color: "#475569",
                fontSize: 10,
                fontWeight: 800,
                lineHeight: 1.3,
              }}
            >
              {weekendRow
                ?.long_weekend_name ||
                weekendRow
                  ?.exemption_description ||
                (subjectType === "STAFF"
                  ? "Duty Rest"
                  : "Long Weekend")}
            </div>

            {weekendRow
              ?.long_weekend_start &&
            weekendRow
              ?.long_weekend_end ? (
              <div
                style={{
                  marginTop: 3,
                  color: "#94A3B8",
                  fontSize: 8.5,
                  fontWeight: 700,
                  lineHeight: 1.3,
                }}
              >
                {formatDashboardDateTime(
                  weekendRow.long_weekend_start
                )}
                {" → "}
                {formatDashboardDateTime(
                  weekendRow.long_weekend_end
                )}
              </div>
            ) : null}
          </div>
        </div>
      ) : (
        <AttendancePie
          rows={statement.rows}
          onStatusClick={openStatus}
          size={218}
          donut
          centerTotal={statement.total}
          outerRadius={68}
          statusNames={
            subjectType ===
            "STAFF"
              ? staffStatusNames(statement.rows)
              : traineeStatusNames(statement.rows)
          }
          subjectType={subjectType}
        />
      )}
    </Card>
  );
}


/*
|--------------------------------------------------------------------------
| COURSE / CATEGORY STATEMENT TABLE
|--------------------------------------------------------------------------
*/

function StatementTable({
  rows,
  subjectType,
  sessionTitle,
  onOpenList,
}) {
  const statementStatusNames =
    subjectType === "STAFF"
      ? staffStatusNames(rows.flatMap((statement) => statement.rows || []))
      : traineeStatusNames(rows.flatMap((statement) => statement.rows || []));

  const columns = [
    {
      title:
        subjectType === "TRAINEE"
          ? "Course"
          : "Category",
      dataIndex: "name",
      fixed: "left",
      width: 230,
      render: (value) => (
        <Text strong>
          {value}
        </Text>
      ),
    },
    {
      title:
        subjectType === "STAFF"
          ? "Total Staff"
          : "Total",
      dataIndex:
        subjectType === "STAFF"
          ? "enrolled"
          : "total",
      width:
        subjectType === "STAFF"
          ? 105
          : 85,
      align: "center",
    },
    ...(subjectType === "TRAINEE"
      ? [
          {
            title: "Enrolled",
            dataIndex: "enrolled",
            width: 90,
            align: "center",
          },
        ]
      : []),
    ...statementStatusNames.map(
      (statusName) => ({
        title: dashboardStatusLabel(
          statusName,
          subjectType
        ),
        dataIndex: statusName,
        width:
          statusName ===
            "Medical Rest" ||
          statusName ===
            "Long Weekend"
            ? 115
            : 90,
        align: "center",
        render: (value, record) => (
          <Button
            type="link"
            size="small"
            disabled={!value}
            style={{
              padding: 0,
              color:
                STATUS_CONFIG[
                  statusName
                ].color,
              fontWeight: 800,
            }}
            onClick={() =>
              onOpenList(
                `${sessionTitle} - ${record.name} - ${dashboardStatusLabel(
                  statusName,
                  subjectType
                )}`,
                filterRowsByStatus(
                  record.rows,
                  statusName
                )
              )
            }
          >
            {value || 0}
          </Button>
        ),
      })
    ),
  ];

  const grand =
    useMemo(() => {
      const result = {
        key: "__grand_total__",
        name: "GRAND TOTAL",
        total: 0,
        enrolled: 0,
      };

      statementStatusNames.forEach(
        (name) => {
          result[name] = 0;
        }
      );

      rows.forEach((row) => {
        result.total +=
          Number(row.total || 0);
        result.enrolled +=
          Number(
            row.enrolled || 0
          );

        statementStatusNames.forEach(
          (name) => {
            result[name] +=
              Number(
                row[name] || 0
              );
          }
        );
      });

      return result;
    }, [rows]);

  const dataSource =
    rows.length
      ? [...rows, grand]
      : [];

  return (
    <div
      style={{
        marginTop: 18,
      }}
    >
      <div
        style={{
          marginBottom: 9,
          display: "flex",
          alignItems: "center",
          justifyContent:
            "space-between",
          gap: 8,
        }}
      >
        <div>
          <Text
            strong
            style={{
              fontSize: 15,
              color: "#0F172A",
            }}
          >
            {subjectType ===
            "TRAINEE"
              ? "Course-wise Daily Statement"
              : "Category-wise Daily Statement"}
          </Text>
          <div>
            <Text
              type="secondary"
              style={{ fontSize: 10 }}
            >
              Same status heads as Dashboard cards
            </Text>
          </div>
        </div>
      </div>

      <Table
        rowKey="key"
        size="small"
        bordered
        columns={columns}
        dataSource={dataSource}
        pagination={false}
        locale={{
          emptyText:
            "No statement data",
        }}
        scroll={{
          x:
            subjectType === "STAFF"
              ? 720
              : 1120,
        }}
        onRow={(record) => ({
          style:
            record.key ===
            "__grand_total__"
              ? {
                  fontWeight: 800,
                  background:
                    "#F1F5F9",
                }
              : undefined,
        })}
      />
    </div>
  );
}

/*
|--------------------------------------------------------------------------
| SESSION WINDOW STATE
|--------------------------------------------------------------------------
|
| Current-date Evening analysis must not classify everybody as Absent
| before the configured timetable window actually starts. Past dates are
| historical and remain available; future dates stay closed.
|
|--------------------------------------------------------------------------
*/

function parseSessionWindowDateTime(
  value,
  selectedDate
) {
  if (!value) {
    return null;
  }

  const text =
    String(value).trim();

  if (!text) {
    return null;
  }

  let parsed = null;

  if (
    /^\d{1,2}:\d{2}/.test(text)
  ) {
    parsed = dayjs(
      `${selectedDate.format(
        "YYYY-MM-DD"
      )} ${text}`
    );
  } else {
    parsed = dayjs(text);
  }

  return parsed.isValid()
    ? parsed
    : null;
}

function getEveningSessionState({
  rows,
  selectedDate,
  now,
}) {
  const selectedDay =
    dayjs(selectedDate);

  const currentMoment =
    dayjs(now);

  if (
    selectedDay.isBefore(
      currentMoment,
      "day"
    )
  ) {
    return {
      open: true,
      historical: true,
      startAt: null,
      message:
        "Historical evening attendance",
    };
  }

  const starts =
    (rows || [])
      .map((row) =>
        parseSessionWindowDateTime(
          row?.window_start ||
            row?.early_window_start,
          selectedDay
        )
      )
      .filter(Boolean)
      .sort(
        (a, b) =>
          a.valueOf() -
          b.valueOf()
      );

  const startAt =
    starts[0] || null;

  if (
    selectedDay.isAfter(
      currentMoment,
      "day"
    )
  ) {
    return {
      open: false,
      historical: false,
      startAt,
      message: startAt
        ? `Evening attendance opens at ${startAt.format(
            "hh:mm A"
          )}.`
        : "Evening attendance has not started yet.",
    };
  }

  if (!startAt) {
    return {
      open: false,
      historical: false,
      startAt: null,
      message:
        "Evening timetable window is not configured yet.",
    };
  }

  const open =
    currentMoment.valueOf() >=
    startAt.valueOf();

  return {
    open,
    historical: false,
    startAt,
    message: open
      ? `Evening attendance started at ${startAt.format(
          "hh:mm A"
        )}.`
      : `Evening attendance will open automatically at ${startAt.format(
          "hh:mm A"
        )}.`,
  };
}

/*
|--------------------------------------------------------------------------
| ONE MORNING / EVENING SECTION
|--------------------------------------------------------------------------
*/

function SessionSection({
  subjectType,
  sessionType,
  rows,
  loading,
  onOpenList,
  preferenceKey,
  sessionState = null,
  shiftAttendanceRows = [],
}) {
  const sectionStatusNames =
    subjectType === "STAFF"
      ? staffStatusNames(rows)
      : traineeStatusNames(rows);

  const sessionOpen =
    sessionState?.open !== false;

  const analysisRows =
    sessionOpen
      ? rows
      : [];

  const title =
    `Overall ${
      subjectType === "TRAINEE"
        ? "Trainee"
        : "Staff"
    } Attendance Analysis - ${
      sessionType === "MORNING"
        ? "Morning"
        : "Evening"
    }`;

  const statements =
    useMemo(
      () =>
        buildGroupStatements(
          analysisRows,
          subjectType
        ),
      [analysisRows, subjectType]
    );

  const allNames =
    useMemo(
      () =>
        statements.map(
          (item) => item.name
        ),
      [statements]
    );

  const {
    selectedNames,
    applySelection,
  } = useVisibleGroups({
    allNames,
    preferenceKey,
  });

  const visibleStatements =
    useMemo(
      () =>
        statements.filter(
          (item) =>
            selectedNames.includes(
              item.name
            )
        ),
      [statements, selectedNames]
    );

  const rankStrength =
    useMemo(() => {
      if (
        subjectType !== "STAFF"
      ) {
        return [];
      }

      const map = new Map();

      uniqueRows(
        analysisRows
      ).forEach((row) => {
        const rank =
          String(
            row?.rank_name ||
            row?.rank ||
            row?.staff_rank ||
            row?.designation ||
            ""
          ).trim();

        if (!rank) {
          return;
        }

        map.set(
          rank,
          (map.get(rank) || 0) + 1
        );
      });

      return [...map.entries()]
        .map(([name, value]) => ({
          name,
          value,
        }))
        .sort(
          (a, b) =>
            b.value - a.value
        );
    }, [analysisRows, subjectType]);

  const shiftCards =
    useMemo(() => {
      const aliases = [
        {
          key: "FIRST",
          title: "1st Shift",
          matches: [
            "1",
            "1ST",
            "FIRST",
            "SHIFT 1",
            "1ST SHIFT",
            "FIRST SHIFT",
          ],
        },
        {
          key: "SECOND",
          title: "2nd Shift",
          matches: [
            "2",
            "2ND",
            "SECOND",
            "SHIFT 2",
            "2ND SHIFT",
            "SECOND SHIFT",
          ],
        },
        {
          key: "THIRD",
          title: "3rd Shift",
          matches: [
            "3",
            "3RD",
            "THIRD",
            "SHIFT 3",
            "3RD SHIFT",
            "THIRD SHIFT",
          ],
        },
      ];

      const shiftSourceRows =
        subjectType === "STAFF"
          ? (
              Array.isArray(
                shiftAttendanceRows
              )
                ? shiftAttendanceRows.filter(
                    (row) =>
                      normalize(
                        row?.subject_type
                      ) === "STAFF"
                  )
                : []
            )
          : analysisRows;

      return aliases.map(
        (shift) => {
          const shiftRows =
            uniqueRows(
              shiftSourceRows
            ).filter((row) => {
              const value =
                normalize(
                  row?.shift_key ||
                  row?.shift_name ||
                  row?.shift ||
                  row?.staff_shift ||
                  row?.duty_shift
                );

              return (
                value ===
                  normalize(
                    shift.key
                  ) ||
                shift.matches
                  .map(normalize)
                  .includes(value)
              );
            });

          const counts =
            getStatusCounts(
              shiftRows
            );

          return {
            ...shift,
            rows: shiftRows,
            total: shiftRows.length,
            present:
              counts.Present || 0,
            absent:
              counts.Absent || 0,
          };
        }
      );
    }, [
      analysisRows,
      shiftAttendanceRows,
      subjectType,
    ]);

  const openOverallStatus =
    (statusName) => {
      onOpenList(
        `${title} - ${dashboardStatusLabel(
          statusName,
          subjectType
        )}`,
        filterRowsByStatus(
          analysisRows,
          statusName
        )
      );
    };

  const renderGroupPanel =
    (staffLayout = false) => (
      <div
        className="pts-dashboard-group-panel"
        style={{
          border:
            "1px solid rgba(255,255,255,.82)",
          borderRadius: 18,
          background:
            "linear-gradient(145deg,rgba(255,255,255,.90) 0%,rgba(238,248,255,.72) 100%)",
          padding: 12,
          minWidth: 0,
          overflow: "hidden",
          backdropFilter:
            "blur(16px) saturate(135%)",
          WebkitBackdropFilter:
            "blur(16px) saturate(135%)",
          ...(staffLayout
            ? { marginTop: 14 }
            : { minHeight: 405 }),
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent:
              "space-between",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
            marginBottom: 8,
          }}
        >
          <div>
            <Text
              strong
              style={{
                fontSize: 14,
                color: "#0F172A",
              }}
            >
              {subjectType ===
              "TRAINEE"
                ? "Course-wise Daily Attendance"
                : "Category-wise Daily Attendance"}
            </Text>
            <div>
              <Text
                type="secondary"
                style={{ fontSize: 10 }}
              >
                {visibleStatements.length} of {statements.length}{" "}
                {subjectType ===
                "TRAINEE"
                  ? "courses"
                  : "categories"}{" "}
                visible
              </Text>
            </div>
          </div>

          <GroupFilterPopover
            names={allNames}
            appliedNames={selectedNames}
            onApply={applySelection}
            subjectType={subjectType}
          />
        </div>

        {visibleStatements.length ? (
          <div
            className={`pts-dashboard-group-pies ${
              subjectType === "STAFF"
                ? "pts-dashboard-group-pies-staff"
                : ""
            }`}
            style={{
              display: "grid",
              gridTemplateColumns:
                subjectType === "STAFF"
                  ? "repeat(6,minmax(0,1fr))"
                  : "repeat(3,minmax(0,1fr))",
              gap: 10,
            }}
          >
            {visibleStatements.map(
              (statement) => (
                <GroupPieCard
                  key={statement.key}
                  statement={statement}
                  sessionTitle={title}
                  onOpenList={onOpenList}
                  subjectType={subjectType}
                />
              )
            )}
          </div>
        ) : (
          <div
            style={{
              minHeight: 220,
              display: "grid",
              placeItems: "center",
            }}
          >
            <Empty
              description={
                subjectType === "TRAINEE"
                  ? "All courses are hidden. Use Choose Courses to show them."
                  : "All categories are hidden. Use Choose Categories to show them."
              }
            />
          </div>
        )}
      </div>
    );

  return (
    <Card
      style={{
        ...CARD_STYLE,
        marginBottom: 16,
      }}
      styles={{
        body: {
          padding:
            "clamp(10px,1.2vw,14px)",
        },
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent:
            "space-between",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
          marginBottom: 12,
        }}
      >
        <div
          className="pts-dashboard-session-heading"
          style={{
            width: "100%",
            border:
              sessionType === "MORNING"
                ? "1px solid rgba(74,144,226,.20)"
                : "1px solid rgba(130,92,246,.18)",
            borderRadius: 14,
            padding: "10px 14px",
            background:
              sessionType === "MORNING"
                ? "linear-gradient(135deg,rgba(239,248,255,.94),rgba(255,255,255,.78))"
                : "linear-gradient(135deg,rgba(248,244,255,.94),rgba(255,255,255,.78))",
            boxShadow:
              "0 8px 22px rgba(44,78,110,.07), inset 0 1px 0 rgba(255,255,255,.86)",
          }}
        >
          <Title
            level={4}
            style={{
              margin: 0,
              fontSize:
                "clamp(17px,1.65vw,21px)",
              lineHeight: 1.2,
              fontWeight: 950,
              letterSpacing: "-.15px",
              color:
                sessionType === "MORNING"
                  ? "#173F67"
                  : "#4B337B",
              textShadow:
                "0 1px 0 rgba(255,255,255,.88)",
            }}
          >
            {title}
          </Title>
          <Text
            type="secondary"
            style={{ fontSize: 10 }}
          >
            {sessionOpen
              ? "Hover for details • Click any pie slice to open corresponding list"
              : sessionState?.message ||
                "Attendance window has not started yet."}
          </Text>
        </div>
      </div>

      <Spin spinning={loading}>
        {!sessionOpen ? (
          <div
            style={{
              minHeight: 300,
              display: "grid",
              placeItems: "center",
              border:
                "1px solid #E2E8F0",
              borderRadius: 18,
              background:
                "linear-gradient(145deg,#F8FAFC 0%,#F1F5F9 100%)",
              padding: 24,
            }}
          >
            <div
              style={{
                textAlign: "center",
                maxWidth: 520,
              }}
            >
              <ClockCircleOutlined
                style={{
                  color: "#64748B",
                  fontSize: 38,
                  marginBottom: 12,
                }}
              />
              <Title
                level={4}
                style={{
                  margin: 0,
                  color: "#475569",
                }}
              >
                Attendance Window Closed
              </Title>
              <Text type="secondary">
                {sessionState?.message ||
                  "Attendance will become active automatically when the timetable window starts."}
              </Text>
            </div>
          </div>
        ) : subjectType === "STAFF" &&
          sessionType === "MORNING" ? (
          <>
            <div
              className="pts-dashboard-staff-top-grid"
              style={{
                display: "grid",
                gridTemplateColumns:
                  "repeat(2,minmax(0,1fr))",
                gap: 14,
                alignItems: "stretch",
              }}
            >
              <div
                className="pts-dashboard-overall-panel"
                style={{
                  border:
                    "1px solid rgba(255,255,255,.82)",
                  borderRadius: 18,
                  background:
                    "linear-gradient(145deg,rgba(255,255,255,.90) 0%,rgba(238,248,255,.72) 100%)",
                  padding:
                    "14px 10px 10px",
                  minWidth: 0,
                  height: 420,
                  overflow: "hidden",
                  display: "flex",
                  flexDirection: "column",
                  backdropFilter:
                    "blur(16px) saturate(135%)",
                  WebkitBackdropFilter:
                    "blur(16px) saturate(135%)",
                  boxShadow:
                    "0 14px 38px rgba(44,78,110,.09), inset 0 1px 0 rgba(255,255,255,.78)",
                }}
              >
                <div
                  style={{
                    textAlign: "center",
                    fontWeight: 900,
                    color: "#28445F",
                    fontSize: 14,
                  }}
                >
                  Overall Attendance Composition
                </div>

                <div className="pts-dashboard-overall-pie-stage">
                  <AttendancePie
                    rows={analysisRows}
                    onStatusClick={
                      openOverallStatus
                    }
                    size={380}
                    outerRadius={134}
                    statusNames={
                      sectionStatusNames
                    }
                    subjectType="STAFF"
                  />
                </div>
              </div>

              <div
                className="pts-dashboard-rank-panel"
                style={{
                  border:
                    "1px solid rgba(255,255,255,.82)",
                  borderRadius: 18,
                  background:
                    "linear-gradient(145deg,rgba(255,255,255,.90) 0%,rgba(244,248,255,.78) 100%)",
                  padding: 16,
                  minWidth: 0,
                  height: 420,
                  overflow: "auto",
                  boxShadow:
                    "0 14px 38px rgba(44,78,110,.09), inset 0 1px 0 rgba(255,255,255,.78)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: 14,
                    color: "#28445F",
                    fontSize: 14,
                    fontWeight: 900,
                  }}
                >
                  <BarChartOutlined />
                  Rank-wise Strength
                </div>

                {rankStrength.length ? (
                  <div
                    style={{
                      display: "grid",
                      gap: 12,
                    }}
                  >
                    {rankStrength.map(
                      (item) => {
                        const max =
                          rankStrength[0]
                            ?.value || 1;

                        const width =
                          Math.max(
                            5,
                            Math.round(
                              (item.value /
                                max) *
                                100
                            )
                          );

                        return (
                          <div
                            key={item.name}
                          >
                            <div
                              style={{
                                display:
                                  "flex",
                                justifyContent:
                                  "space-between",
                                gap: 10,
                                marginBottom: 5,
                                fontSize: 11,
                                fontWeight: 800,
                                color: "#334155",
                              }}
                            >
                              <span>
                                {item.name}
                              </span>
                              <span>
                                {item.value}
                              </span>
                            </div>
                            <div
                              style={{
                                height: 15,
                                borderRadius: 99,
                                background:
                                  "#E7EEF5",
                                overflow:
                                  "hidden",
                              }}
                            >
                              <div
                                style={{
                                  width:
                                    `${width}%`,
                                  height:
                                    "100%",
                                  borderRadius:
                                    99,
                                  background:
                                    "linear-gradient(90deg,#38A3DB,#1E6FA8)",
                                  boxShadow:
                                    "inset 0 1px 0 rgba(255,255,255,.42)",
                                }}
                              />
                            </div>
                          </div>
                        );
                      }
                    )}
                  </div>
                ) : (
                  <div
                    style={{
                      height: 360,
                      display: "grid",
                      placeItems:
                        "center",
                      textAlign:
                        "center",
                    }}
                  >
                    <Empty
                      description="Rank strength will appear here when Staff rank data is added to the attendance feed."
                    />
                  </div>
                )}
              </div>
            </div>

            {renderGroupPanel(true)}

            <div
              className="pts-dashboard-shift-section"
              style={{
                marginTop: 14,
              }}
            >
              <div
                style={{
                  marginBottom: 9,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  color: "#28445F",
                  fontSize: 14,
                  fontWeight: 900,
                }}
              >
                <ClockCircleOutlined />
                Shift-wise Attendance
              </div>

              <div
                className="pts-dashboard-shift-grid"
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "repeat(3,minmax(0,1fr))",
                  gap: 12,
                }}
              >
                {shiftCards.map(
                  (shift) => {
                    const percentage =
                      shift.total > 0
                        ? Math.round(
                            (shift.present /
                              shift.total) *
                              100
                          )
                        : 0;

                    return (
                      <Card
                        key={shift.key}
                        hoverable={shift.total > 0}
                        onClick={
                          shift.total > 0
                            ? () =>
                                onOpenList(
                                  `Staff - ${shift.title} Duty Attendance`,
                                  shift.rows
                                )
                            : undefined
                        }
                        style={{
                          ...CARD_STYLE,
                          minWidth: 0,
                          cursor:
                            shift.total > 0
                              ? "pointer"
                              : "default",
                        }}
                        styles={{
                          body: {
                            padding:
                              "14px 16px",
                          },
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems:
                              "center",
                            justifyContent:
                              "space-between",
                            gap: 10,
                          }}
                        >
                          <div>
                            <div
                              style={{
                                color:
                                  "#173F67",
                                fontSize: 14,
                                fontWeight: 900,
                              }}
                            >
                              {shift.title}
                            </div>
                            <Text
                              type="secondary"
                              style={{
                                fontSize: 10,
                              }}
                            >
                              {shift.total > 0
                                ? `${shift.present} Present • ${shift.absent} Absent • ${
                                    shift.total -
                                    shift.present -
                                    shift.absent
                                  } Pending • ${shift.total} Total`
                                : "No Duty Roster configured for selected date"}
                            </Text>
                          </div>

                          <div
                            style={{
                              color:
                                "#1E6FA8",
                              fontSize: 22,
                              fontWeight: 950,
                            }}
                          >
                            {shift.total > 0
                              ? shift.present
                              : 0}
                          </div>
                        </div>

                        <div
                          style={{
                            marginTop: 12,
                            height: 16,
                            borderRadius: 99,
                            background:
                              "#E7EEF5",
                            overflow: "hidden",
                          }}
                        >
                          <div
                            style={{
                              width:
                                shift.total > 0
                                  ? `${Math.max(
                                      3,
                                      percentage
                                    )}%`
                                  : "0%",
                              height: "100%",
                              borderRadius: 99,
                              background:
                                "linear-gradient(90deg,#10B981,#0EA5E9)",
                            }}
                          />
                        </div>
                      </Card>
                    );
                  }
                )}
              </div>
            </div>

            <div
              style={{
                marginTop: 10,
                padding: "10px 12px",
                borderRadius: 12,
                background: "#F8FAFC",
                border:
                  "1px solid #E8EDF4",
                width: "100%",
              }}
            >
              <StatusLegend
                statusNames={
                  sectionStatusNames
                }
                subjectType="STAFF"
              />
            </div>

            <StatementTable
              rows={visibleStatements}
              subjectType={subjectType}
              sessionTitle={title}
              onOpenList={onOpenList}
            />
          </>
        ) : (
          <>
            <div
              className="pts-dashboard-analysis-grid"
              style={{
                display: "grid",
                gridTemplateColumns:
                  "minmax(0,2fr) minmax(0,3fr)",
                gap: 14,
                alignItems: "stretch",
              }}
            >
              <div
                className="pts-dashboard-overall-panel"
                style={{
                  border:
                    "1px solid rgba(255,255,255,.82)",
                  borderRadius: 18,
                  background:
                    "linear-gradient(145deg,rgba(255,255,255,.90) 0%,rgba(238,248,255,.72) 100%)",
                  padding:
                    "14px 10px 10px",
                  minWidth: 0,
                  minHeight: 405,
                  overflow: "hidden",
                  display: "flex",
                  flexDirection: "column",
                  backdropFilter:
                    "blur(16px) saturate(135%)",
                  WebkitBackdropFilter:
                    "blur(16px) saturate(135%)",
                  boxShadow:
                    "0 14px 38px rgba(44,78,110,.09), inset 0 1px 0 rgba(255,255,255,.78)",
                }}
              >
                <div
                  style={{
                    textAlign: "center",
                    fontWeight: 900,
                    color: "#28445F",
                    fontSize: 14,
                  }}
                >
                  Overall Attendance Composition
                </div>

                <div className="pts-dashboard-overall-pie-stage">
                  <AttendancePie
                    rows={analysisRows}
                    onStatusClick={
                      openOverallStatus
                    }
                    size={365}
                    outerRadius={122}
                    statusNames={
                      sectionStatusNames
                    }
                    subjectType={subjectType}
                  />
                </div>
              </div>

              {renderGroupPanel(false)}
            </div>

            <div
              style={{
                marginTop: 10,
                padding: "10px 12px",
                borderRadius: 12,
                background: "#F8FAFC",
                border:
                  "1px solid #E8EDF4",
                width: "100%",
              }}
            >
              <StatusLegend
                statusNames={
                  sectionStatusNames
                }
                subjectType={subjectType}
              />
            </div>

            <StatementTable
              rows={visibleStatements}
              subjectType={subjectType}
              sessionTitle={title}
              onOpenList={onOpenList}
            />
          </>
        )}
      </Spin>
    </Card>
  );
}

/*
|--------------------------------------------------------------------------
| ATTENDANCE WINDOWS — HORIZONTAL AT BOTTOM
|--------------------------------------------------------------------------
*/

function timetableFromRows(rows) {
  const first =
    (rows || []).find(
      (row) =>
        row.timetable_name
    );

  if (!first) return null;

  return {
    name:
      first.timetable_name,
    start:
      first.window_start,
    end:
      first.window_end,
    early:
      first.early_window_start,
    late:
      first.late_window_end,
  };
}

function AttendanceWindows({
  traineeMorning,
  traineeEvening,
  staffMorning,
  staffEvening,
}) {
  const cards = [
    {
      title: "Trainees Morning",
      tag: "AM",
      data:
        timetableFromRows(
          traineeMorning
        ),
    },
    {
      title: "Trainees Evening",
      tag: "PM",
      data:
        timetableFromRows(
          traineeEvening
        ),
    },
    {
      title: "Staff Morning",
      tag: "AM",
      data:
        timetableFromRows(
          staffMorning
        ),
    },
    {
      title: "Staff Evening",
      tag: "PM",
      data:
        timetableFromRows(
          staffEvening
        ),
    },
  ];

  return (
    <Card
      style={CARD_STYLE}
      title={
        <Space>
          <ClockCircleOutlined
            style={{
              color: "#7C3AED",
            }}
          />
          Attendance Windows
        </Space>
      }
      styles={{
        body: { padding: 13 },
      }}
    >
      <Row gutter={[10, 10]}>
        {cards.map((item) => (
          <Col
            key={item.title}
            xs={24}
            sm={12}
            xl={6}
          >
            <div
              style={{
                height: "100%",
                padding: "11px 12px",
                borderRadius: 12,
                border:
                  "1px solid #E8EDF4",
                background:
                  "linear-gradient(135deg,#F8FAFC,#FFFFFF)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent:
                    "space-between",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <Text
                  strong
                  style={{ fontSize: 11 }}
                >
                  {item.title}
                </Text>

                <Tag
                  color={
                    item.tag === "AM"
                      ? "blue"
                      : "purple"
                  }
                  style={{
                    margin: 0,
                    fontSize: 9,
                  }}
                >
                  {item.tag}
                </Tag>
              </div>

              {item.data ? (
                <>
                  <div
                    style={{
                      marginTop: 7,
                      fontSize: 12,
                      color: "#334155",
                    }}
                  >
                    <strong>
                      {formatTime(
                        item.data.start
                      )}
                    </strong>
                    {" — "}
                    <strong>
                      {formatTime(
                        item.data.end
                      )}
                    </strong>
                  </div>

                  <div
                    style={{
                      marginTop: 3,
                      fontSize: 9,
                      color: "#94A3B8",
                    }}
                  >
                    Allowed{" "}
                    {formatTime(
                      item.data.early
                    )}
                    {" — "}
                    {formatTime(
                      item.data.late
                    )}
                  </div>
                </>
              ) : (
                <Tag
                  style={{
                    marginTop: 7,
                  }}
                >
                  No Timetable
                </Tag>
              )}
            </div>
          </Col>
        ))}
      </Row>
    </Card>
  );
}

/*
|--------------------------------------------------------------------------
| DASHBOARD
|--------------------------------------------------------------------------
*/

export default function Dashboard() {
  const syncStatus = useBiometricSyncStatus();
  const [dashboardError,setDashboardError] = useState("");
  const { user } = useAuth();

  const [selectedDate, setSelectedDate] =
    useState(() => dayjs(pakistanNow()));

  const [dashboardClock, setDashboardClock] =
    useState(() => dayjs(pakistanNow()));

  useEffect(() => {
    const timerId = setInterval(() => {
      setDashboardClock(dayjs(pakistanNow()));
    }, 1000);

    return () =>
      clearInterval(timerId);
  }, []);

  const dashboardDateTimeValue =
    useMemo(
      () =>
        selectedDate
          .hour(dashboardClock.hour())
          .minute(dashboardClock.minute())
          .second(dashboardClock.second()),
      [selectedDate, dashboardClock]
    );

  const initialDashboardSnapshotRef =
    useRef(undefined);

  if (
    initialDashboardSnapshotRef.current ===
    undefined
  ) {
    initialDashboardSnapshotRef.current =
      readDashboardSnapshot({
        user,
        date: dayjs().format(
          "YYYY-MM-DD"
        ),
      });
  }

  const initialDashboardSnapshot =
    initialDashboardSnapshotRef.current;

  const [activeSubject, setActiveSubject] =
    useState("TRAINEE");

  const [loading, setLoading] =
    useState(false);

  const [traineeMorning, setTraineeMorning] =
    useState(
      initialDashboardSnapshot
        ?.traineeMorning ||
        EMPTY_ATTENDANCE
    );

  const [traineeEvening, setTraineeEvening] =
    useState(
      initialDashboardSnapshot
        ?.traineeEvening ||
        EMPTY_ATTENDANCE
    );

  const [staffMorning, setStaffMorning] =
    useState(
      initialDashboardSnapshot
        ?.staffMorning ||
        EMPTY_ATTENDANCE
    );

  const [staffEvening, setStaffEvening] =
    useState(
      initialDashboardSnapshot
        ?.staffEvening ||
        EMPTY_ATTENDANCE
    );

  const [repatriates, setRepatriates] =
    useState([]);

  const [weekends, setWeekends] =
    useState([]);

  const [traineeRoster, setTraineeRoster] =
    useState([]);

  const [traineeMedicalRest, setTraineeMedicalRest] =
    useState([]);

  const [staffMedicalRest, setStaffMedicalRest] =
    useState([]);

  const [shiftAttendanceRows, setShiftAttendanceRows] =
    useState([]);

  const [detailOpen, setDetailOpen] =
    useState(false);

  const [detailTitle, setDetailTitle] =
    useState("");

  const isRepatriateDetail = /repatriate/i.test(detailTitle);

  const [detailRows, setDetailRows] =
    useState([]);

  const [weekendListOpen, setWeekendListOpen] =
    useState(false);

  const loadingRef =
    useRef(false);

  const traineeMorningPreferenceKey =
    useMemo(
      () =>
        createDashboardHiddenKey({
          user,
          subjectType: "TRAINEE",
          sessionType: "MORNING",
        }),
      [user]
    );

  const traineeEveningPreferenceKey =
    useMemo(
      () =>
        createDashboardHiddenKey({
          user,
          subjectType: "TRAINEE",
          sessionType: "EVENING",
        }),
      [user]
    );

  const staffMorningPreferenceKey =
    useMemo(
      () =>
        createDashboardHiddenKey({
          user,
          subjectType: "STAFF",
          sessionType: "MORNING",
        }),
      [user]
    );

  const staffEveningPreferenceKey =
    useMemo(
      () =>
        createDashboardHiddenKey({
          user,
          subjectType: "STAFF",
          sessionType: "EVENING",
        }),
      [user]
    );

  const requestSequence = useRef(0);
  const requestedDateRef = useRef("");
  requestedDateRef.current = selectedDate.format("YYYY-MM-DD");
  const restoreSupport = useCallback((data, date) => {
    setRepatriates(filterCompletedCourseRows(activeRepatriates(data.training_drops || [], date)));
    setWeekends(data.weekends || []);
    setTraineeMedicalRest(filterCompletedCourseRows(data.trainee_medical_rest || []));
    setStaffMedicalRest(data.staff_medical_rest || []);
    setShiftAttendanceRows(data.shift_attendance_rows || []);
  }, []);
  const loadDashboard = useCallback(async () => {
    const date = selectedDate.format("YYYY-MM-DD");
    if (loadingRef.current === date) return;
    const sequence = ++requestSequence.current;
    loadingRef.current = date;
    setLoading(true);
    try {
      const response = await api.get("/dashboard/snapshot", {
        params: { attendance_date: date, include_support: 1 }, timeout: 120000,
      });
      const snapshot = response.data?.data;
      if (!snapshot || !snapshot.supporting_data) throw new Error("Dashboard snapshot is incomplete.");
      if (sequence !== requestSequence.current || requestedDateRef.current !== date) return;
      setDashboardError("");
      const support = snapshot.supporting_data;
      const dutyAssignmentsByStaffId = collectStaffDutyAssignments(support.shift_attendance_rows, support.custom_shift_rows);
      const shiftDutyStaffIds = new Set(dutyAssignmentsByStaffId.keys());
      const reconcileStaffSession = (report, sessionType) => {
        const rows = reconcileStaffCategoryDuty({
          roster: snapshot.staff_roster, rows: report.rows,
          dutyIds: shiftDutyStaffIds, dutyAssignmentsByStaffId,
        }).map(row => ({...row, attendance_date: date, session_type: sessionType}));
        return {rows,total:rows.length};
      };
      const staffMorningData = reconcileStaffSession(snapshot.staff_morning, "MORNING");
      const staffEveningData = reconcileStaffSession(snapshot.staff_evening, "EVENING");
      setTraineeMorning(snapshot.trainee_morning);
      setTraineeEvening(snapshot.trainee_evening);
      setStaffMorning(staffMorningData);
      setStaffEvening(staffEveningData);
      const roster = filterCompletedCourseRows(snapshot.trainee_roster);
      setTraineeRoster(roster);
      restoreSupport(support, date);
      saveDashboardSnapshot({user,date,traineeMorning:snapshot.trainee_morning,traineeEvening:snapshot.trainee_evening,
        staffMorning: staffMorningData,staffEvening: staffEveningData,supportingData:support,traineeRoster:roster});
    } catch (error) {
      if (sequence !== requestSequence.current || requestedDateRef.current !== date) return;
      // Never mix an old operational overlay with fresh attendance or the wrong date.
      const cached = readDashboardSnapshot({user,date});
      if (cached) {
        setTraineeMorning(cached.traineeMorning);setTraineeEvening(cached.traineeEvening);
        setStaffMorning(cached.staffMorning);setStaffEvening(cached.staffEvening);
        setTraineeRoster(cached.traineeRoster);restoreSupport(cached.supportingData,date);
      }
      setDashboardError(cached ? `Showing the last complete snapshot from ${cached.savedAt || date}. Refresh failed.` : "No complete dashboard data is available. Refresh failed.");
      message.warning(cached ? "Dashboard update failed. Showing the last complete snapshot." :
        (error.response?.data?.error?.message || error.message || "Dashboard data could not be loaded."));
    } finally {
      if (sequence === requestSequence.current) { loadingRef.current = null; setLoading(false); }
    }
  }, [selectedDate,user,restoreSupport]);

  useEffect(() => {
    const date =
      selectedDate.format(
        "YYYY-MM-DD"
      );

    const cached =
      readDashboardSnapshot({
        user,
        date,
      });

    if (cached) {
      setTraineeRoster(cached.traineeRoster);
      restoreSupport(cached.supportingData,date);
      setTraineeMorning(
        cached.traineeMorning
      );
      setTraineeEvening(
        cached.traineeEvening
      );
      setStaffMorning(
        cached.staffMorning
      );
      setStaffEvening(
        cached.staffEvening
      );
    } else {
      setTraineeRoster([]);
      restoreSupport({},date);
      setTraineeMorning(
        EMPTY_ATTENDANCE
      );
      setTraineeEvening(
        EMPTY_ATTENDANCE
      );
      setStaffMorning(
        EMPTY_ATTENDANCE
      );
      setStaffEvening(
        EMPTY_ATTENDANCE
      );
    }

    loadDashboard();
  }, [
    user,
    selectedDate,
    loadDashboard,
    restoreSupport,
  ]);

  const traineeEveningSessionState =
    useMemo(
      () =>
        getEveningSessionState({
          rows:
            filterCompletedCourseRows(
              traineeEvening.rows
            ),
          selectedDate,
          now:
            dashboardClock,
        }),
      [
        traineeEvening.rows,
        selectedDate,
        dashboardClock,
      ]
    );

  const staffEveningSessionState =
    useMemo(
      () =>
        getEveningSessionState({
          rows:
            staffEvening.rows,
          selectedDate,
          now:
            dashboardClock,
        }),
      [
        staffEvening.rows,
        selectedDate,
        dashboardClock,
      ]
    );

  const previousEveningOpenRef =
    useRef({
      trainee: false,
      staff: false,
    });

  useEffect(() => {
    const isCurrentDate =
      selectedDate.isSame(
        dashboardClock,
        "day"
      );

    const previous =
      previousEveningOpenRef.current;

    const traineeJustOpened =
      isCurrentDate &&
      traineeEveningSessionState.open &&
      !previous.trainee;

    const staffJustOpened =
      isCurrentDate &&
      staffEveningSessionState.open &&
      !previous.staff;

    previousEveningOpenRef.current = {
      trainee:
        traineeEveningSessionState.open,
      staff:
        staffEveningSessionState.open,
    };

    if (
      traineeJustOpened ||
      staffJustOpened
    ) {
      loadDashboard();
    }
  }, [
    selectedDate,
    dashboardClock,
    traineeEveningSessionState.open,
    staffEveningSessionState.open,
    loadDashboard,
  ]);

  /*
  |--------------------------------------------------------------------------
  | LONG WEEKEND PERIOD ACTIVE FOR SELECTED DASHBOARD DATE
  |--------------------------------------------------------------------------
  */

  const dashboardTodayKey =
    dashboardClock.format(
      "YYYY-MM-DD"
    );

  const activeWeekendIdsNowKey =
    useMemo(
      () => {
        const now =
          dayjs(
            dashboardClock
          );

        return (
          weekends ||
          []
        )
          .filter(
            (record) => {
              if (
                !weekendRecordEnabled(
                  record
                )
              ) {
                return false;
              }

              const start =
                dashboardDateTime(
                  record.start_datetime
                );

              const end =
                dashboardDateTime(
                  record.end_datetime
                );

              return (
                start &&
                end &&
                start.valueOf() <=
                  now.valueOf() &&
                end.valueOf() >=
                  now.valueOf()
              );
            }
          )
          .map(
            (record) =>
              String(record.id)
          )
          .sort()
          .join("|");
      },
      [
        weekends,
        dashboardClock,
      ]
    );

  const weekendRowsForSelectedDate =
    useMemo(
      () => {
        const selectedIsToday =
          selectedDate.format(
            "YYYY-MM-DD"
          ) ===
          dashboardTodayKey;

        const enabled =
          (
            weekends ||
            []
          ).filter(
            weekendRecordEnabled
          );

        if (
          !selectedIsToday
        ) {
          return enabled;
        }

        const activeIds =
          new Set(
            activeWeekendIdsNowKey
              ? activeWeekendIdsNowKey.split(
                  "|"
                )
              : []
          );

        return enabled.filter(
          (record) =>
            activeIds.has(
              String(
                record.id
              )
            )
        );
      },
      [
        weekends,
        selectedDate,
        dashboardTodayKey,
        activeWeekendIdsNowKey,
      ]
    );

  const traineeMorningWeekendRows =
    useMemo(
      () =>
        applyLongWeekendsToRows({
          rows:
            traineeMorning.rows,

          weekends:
            weekendRowsForSelectedDate,

          subjectType:
            "TRAINEE",

          selectedDate,
        }),
      [
        traineeMorning.rows,
        weekendRowsForSelectedDate,
        selectedDate,
      ]
    );

  const traineeEveningWeekendRows =
    useMemo(
      () =>
        applyLongWeekendsToRows({
          rows:
            traineeEvening.rows,

          weekends:
            weekendRowsForSelectedDate,

          subjectType:
            "TRAINEE",

          selectedDate,
        }),
      [
        traineeEvening.rows,
        weekendRowsForSelectedDate,
        selectedDate,
      ]
    );

  const traineeMorningDashboardRows =
    useMemo(
      () =>
        mergeTraineeRosterIntoRows(
          applyRepatriatesToRows(
            traineeMorningWeekendRows,
            repatriates
          ),
          traineeRoster
        ),
      [
        traineeMorningWeekendRows,
        repatriates,
        traineeRoster,
      ]
    );

  const traineeEveningDashboardRows =
    useMemo(
      () =>
        mergeTraineeRosterIntoRows(
          applyRepatriatesToRows(
            traineeEveningWeekendRows,
            repatriates
          ),
          traineeRoster
        ),
      [
        traineeEveningWeekendRows,
        repatriates,
        traineeRoster,
      ]
    );

  const staffMorningDashboardRows =
    useMemo(
      () =>
        applyLongWeekendsToRows({
          rows:
            staffMorning.rows,

          weekends:
            weekendRowsForSelectedDate,

          subjectType:
            "STAFF",

          selectedDate,
        }),
      [
        staffMorning.rows,
        weekendRowsForSelectedDate,
        selectedDate,
      ]
    );

  const staffEveningDashboardRows =
    useMemo(
      () =>
        applyLongWeekendsToRows({
          rows:
            staffEvening.rows,

          weekends:
            weekendRowsForSelectedDate,

          subjectType:
            "STAFF",

          selectedDate,
        }),
      [
        staffEvening.rows,
        weekendRowsForSelectedDate,
        selectedDate,
      ]
    );

  const activeMorningRows =
    activeSubject === "TRAINEE"
      ? traineeMorningDashboardRows
      : staffMorningDashboardRows;

  const activeEveningRows =
    activeSubject === "TRAINEE"
      ? traineeEveningDashboardRows
      : [];

  const activeEveningSessionState =
    activeSubject === "TRAINEE"
      ? traineeEveningSessionState
      : {
          open: false,
          historical: false,
          startAt: null,
          message:
            "Staff evening attendance is temporarily disabled on Dashboard.",
        };

  const summaryRows =
    useMemo(
      () =>
        buildDailySnapshot(
          activeMorningRows,
          activeEveningSessionState.open
            ? activeEveningRows
            : []
        ),
      [
        activeMorningRows,
        activeEveningRows,
        activeEveningSessionState.open,
      ]
    );

  const summaryCounts =
    useMemo(
      () =>
        getStatusCounts(
          summaryRows
        ),
      [summaryRows]
    );

  const totalEnrolled =
    activeSubject === "TRAINEE"
      ? traineeRoster.length
      : summaryRows.length;

  const longWeekendSummary =
    useMemo(
      () =>
        getLongWeekendSummary(
          weekends,
          dashboardClock
        ),
      [
        weekends,
        dashboardClock,
      ]
    );

  const dashboardMedicalRestRows =
    useMemo(
      () =>
        activeMedicalRestRows({
          records:
            activeSubject ===
            "TRAINEE"
              ? traineeMedicalRest
              : staffMedicalRest,

          selectedDate,

          now:
            dashboardClock,
        }),
      [
        activeSubject,
        traineeMedicalRest,
        staffMedicalRest,
        selectedDate,
        dashboardClock,
      ]
    );

  const activeCardConfig =
    activeSubject === "STAFF"
      ? STAFF_CARD_CONFIG
      : [...CARD_CONFIG, ...["No Timetable","Not Processed"].filter(name => summaryCounts[name] > 0)
          .map(name => ({key:name,title:name,...STATUS_CONFIG[name],icon:<WarningOutlined />}))];

  const openList =
    (title, rows) => {
      const rosterById = new Map(staffMorning.rows.map((row) => [Number(row.subject_id), row]));
      const enriched = rows.map((row) => normalize(row.subject_type) === "STAFF"
        ? { ...rosterById.get(Number(row.subject_id)), ...row,
            belt_no: row.belt_no || row.staff_belt_no || rosterById.get(Number(row.subject_id))?.belt_no }
        : row);
      setDetailTitle(title);
      setDetailRows(enriched);
      setDetailOpen(true);
    };


  const printDetailList = () => {
    const identifierTitle =
      activeSubject === "TRAINEE"
        ? "Cap No."
        : "Employee ID";

    const esc = (value) =>
      String(
        value ?? "-"
      )
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");

    const rowsHtml =
      detailRows
        .map((row, index) => {
          const name =
            row.subject_name ||
            [
              row.first_name,
              row.last_name,
            ]
              .filter(Boolean)
              .join(" ") ||
            "-";

          const group =
            activeSubject === "TRAINEE"
              ? row.course_name || "-"
              : row.category_name || "-";

          const subGroup =
            activeSubject === "TRAINEE"
              ? row.platoon_number !== null &&
                row.platoon_number !== undefined
                ? `Platoon ${row.platoon_number}`
                : "-"
              : row.branch_name || "-";

          const status =
            dashboardStatusLabel(
              rowStatusName(row) || "-",
              activeSubject
            );

          return `
            <tr>
              <td>${index + 1}</td>
              <td>${esc(employeeCode(row))}</td>
              <td>${esc(name)}</td>
              ${activeSubject === "STAFF" ? `<td>${esc(row.belt_no || "Not recorded")}</td><td>${esc((row.duty_assignments || []).map(staffDutyDescription).join("; ") || "—")}</td>` : ""}
              <td>${esc(group)}</td>
              <td>${esc(subGroup)}</td>
              <td>${esc(status)}</td>
              <td>${esc(row.attendance_status || "-")}</td>
              ${!isRepatriateDetail ? `<td>${esc(formatDashboardDateTime(row.osd_start_datetime))}</td><td>${esc(formatDashboardDateTime(row.osd_end_datetime))}</td>
              <td>${esc(formatDashboardDateTime(row.absence_start))}</td>
              <td>${esc(row.absence_end ? formatDashboardDateTime(row.absence_end) : row.absence_start ? "Ongoing at report time" : "—")}</td>
              <td>${esc(row.absence_start ? formatAbsenceDuration(row.absence_duration_seconds) : "—")}</td>` : ""}
              <td>${esc(formatTime(row.selected_punch))}</td>
              <td>${esc(row.repatriate_reason || row.osd_reason || row.exemption_description || "—")}</td>
            </tr>
          `;
        })
        .join("");

    const printWindow =
      window.open(
        "",
        "_blank",
        "width=1180,height=820"
      );

    if (!printWindow) {
      message.warning(
        "Please allow pop-ups to print this report."
      );
      return;
    }

    printWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>${esc(detailTitle)}</title>
          <style>
            @page { size: A4 landscape; margin: 12mm; }
            * { box-sizing: border-box; }
            body {
              margin: 0;
              font-family: Arial, Helvetica, sans-serif;
              color: #111827;
              background: #fff;
            }
            .header { text-align: center; margin-bottom: 14px; }
            .police { font-size: 18px; font-weight: 800; letter-spacing: .6px; }
            .school { margin-top: 3px; font-size: 16px; font-weight: 800; }
            .system { margin-top: 4px; font-size: 10px; color: #475569; }
            .report { margin-top: 9px; font-size: 14px; font-weight: 800; }
            .meta {
              display: flex;
              justify-content: space-between;
              gap: 12px;
              margin: 10px 0 12px;
              padding: 8px 10px;
              border: 1px solid #CBD5E1;
              font-size: 10px;
            }
            table { width: 100%; border-collapse: collapse; font-size: 9px; }
            th, td { border: 1px solid #94A3B8; padding: 6px 7px; text-align: left; }
            th { background: #EAF4FB; font-weight: 800; }
            tr:nth-child(even) td { background: #F8FAFC; }
            .footer { margin-top: 12px; text-align: right; font-size: 9px; color: #64748B; }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="police">PUNJAB POLICE</div>
            <div class="school">POLICE TRAINING SCHOOL FAROOQABAD</div>
            <div class="system">BIOMETRIC ATTENDANCE MANAGEMENT INFORMATION SYSTEM</div>
            <div class="report">${esc(detailTitle)}</div>
          </div>

          <div class="meta">
            <span><strong>Date:</strong> ${esc(selectedDate.format("DD-MMM-YYYY"))}</span>
            <span><strong>Type:</strong> ${esc(activeSubject === "TRAINEE" ? "Trainees" : "Staff")}</span>
            <span><strong>Total Records:</strong> ${detailRows.length}</span>
          </div>

          <table>
            <thead>
              <tr>
                <th>Sr.</th>
                <th>${esc(identifierTitle)}</th>
                <th>Name</th>
                ${activeSubject === "STAFF" ? "<th>Belt No.</th><th>Assigned Duty / Shift</th>" : ""}
                <th>${activeSubject === "TRAINEE" ? "Course" : "Category"}</th>
                <th>${activeSubject === "TRAINEE" ? "Platoon" : "Branch"}</th>
                <th>Dashboard Status</th>
                <th>Attendance</th>
                ${!isRepatriateDetail ? "<th>OSD Starts</th><th>OSD Ends</th><th>Absent From</th><th>Absent Until / Return</th><th>Absent Duration</th>" : ""}
                <th>Punch</th><th>Reason</th>
              </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
          </table>

          <div class="footer">Printed from PTS Farooqabad Dashboard</div>
          <script>
            window.onload = function () {
              window.print();
            };
          </script>
        </body>
      </html>
    `);

    printWindow.document.close();
  };

  const printWeekendList = () => {
    const esc = (value) =>
      String(value ?? "-")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");

    const label =
      activeSubject === "STAFF"
        ? "Duty Rest"
        : "Long Weekend";

    const rowsHtml =
      weekendListRows
        .map(
          (row, index) => `
            <tr>
              <td>${index + 1}</td>
              <td>${esc(row.weekend_name || label)}</td>
              <td>${esc(formatDashboardDateTime(row.start_datetime))}</td>
              <td>${esc(formatDashboardDateTime(row.end_datetime))}</td>
            </tr>
          `
        )
        .join("");

    const printWindow =
      window.open("", "_blank", "width=980,height=760");

    if (!printWindow) {
      message.warning("Please allow pop-ups to print this report.");
      return;
    }

    printWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>${esc(label)} List</title>
          <style>
            @page { size: A4 landscape; margin: 14mm; }
            body { font-family: Arial, Helvetica, sans-serif; color: #111827; }
            .header { text-align: center; margin-bottom: 16px; }
            .header h1 { margin: 0; font-size: 18px; }
            .header h2 { margin: 4px 0; font-size: 15px; }
            .header p { margin: 5px 0 0; font-size: 11px; color: #475569; }
            table { width: 100%; border-collapse: collapse; font-size: 10px; }
            th, td { border: 1px solid #94A3B8; padding: 7px; text-align: left; }
            th { background: #EAF4FB; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>PUNJAB POLICE</h1>
            <h2>POLICE TRAINING SCHOOL FAROOQABAD</h2>
            <p>${esc(label)} Report • ${esc(selectedDate.format("DD-MMM-YYYY"))}</p>
          </div>
          <table>
            <thead>
              <tr><th>Sr.</th><th>${esc(label)}</th><th>Starts</th><th>Ends</th></tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
          </table>
          <script>window.onload = function(){ window.print(); };</script>
        </body>
      </html>
    `);

    printWindow.document.close();
  };

  const weekendListRows =
    useMemo(
      () =>
        [...(weekends || [])].sort(
          (a, b) =>
            dayjs(b.start_datetime).valueOf() -
            dayjs(a.start_datetime).valueOf()
        ),
      [weekends]
    );

  const weekendListColumns = [
    {
      title:
        activeSubject === "STAFF"
          ? "Duty Rest"
          : "Long Weekend",
      dataIndex: "weekend_name",
      width: 190,
      render: (value) => (
        <Text strong>
          {value || "Long Weekend"}
        </Text>
      ),
    },
    {
      title: "Starts",
      dataIndex: "start_datetime",
      width: 180,
      render: (value) =>
        formatDashboardDateTime(value),
    },
    {
      title: "Ends",
      dataIndex: "end_datetime",
      width: 180,
      render: (value) =>
        formatDashboardDateTime(value),
    },
    {
      title: "Trainees",
      width: 190,
      render: (_, record) => {
        if (record.apply_all_trainees) {
          return (
            <Tag color="blue">
              All Trainees
            </Tag>
          );
        }

        const names =
          (record.courses || [])
            .map((item) =>
              item.course_name
            )
            .filter(Boolean);

        return names.length ? (
          <Text style={{ fontSize: 11 }}>
            {names.join(", ")}
          </Text>
        ) : (
          <Text type="secondary">-</Text>
        );
      },
    },
    {
      title: "Staff",
      width: 190,
      render: (_, record) => {
        if (record.apply_all_staff) {
          return (
            <Tag color="purple">
              All Staff
            </Tag>
          );
        }

        const names =
          (record.staff_categories || [])
            .map((item) =>
              item.category_name
            )
            .filter(Boolean);

        return names.length ? (
          <Text style={{ fontSize: 11 }}>
            {names.join(", ")}
          </Text>
        ) : (
          <Text type="secondary">-</Text>
        );
      },
    },
    {
      title: "Status",
      width: 120,
      render: (_, record) => {
        if (!weekendRecordEnabled(record)) {
          return <Tag>INACTIVE</Tag>;
        }

        const now = dayjs(dashboardClock);
        const start = dashboardDateTime(
          record.start_datetime
        );
        const end = dashboardDateTime(
          record.end_datetime
        );

        if (!start || !end) {
          return <Tag>UNKNOWN</Tag>;
        }

        if (now.isBefore(start)) {
          return (
            <Tag color="blue">
              UPCOMING
            </Tag>
          );
        }

        if (now.isAfter(end)) {
          return <Tag>COMPLETED</Tag>;
        }

        return (
          <Tag color="green">
            ACTIVE
          </Tag>
        );
      },
    },
  ];

  const isStaffDutyDetail = activeSubject === "STAFF" && detailRows.some((row) => row.duty_assignments?.length);
  const detailColumns = [
    ...(!isRepatriateDetail ? [
      { title: "OSD Starts", width: 190, render: (_, row) => formatDashboardDateTime(row.osd_start_datetime) },
      { title: "OSD Ends", width: 190, render: (_, row) => formatDashboardDateTime(row.osd_end_datetime) },
      { title: "Absent From", width: 190, render: (_, row) => formatDashboardDateTime(row.absence_start) },
      { title: "Absent Until / Return", width: 190, render: (_, row) => row.absence_end ? formatDashboardDateTime(row.absence_end) : row.absence_start ? "Ongoing at report time" : "—" },
      { title: "Absent Duration", width: 160, render: (_, row) => row.absence_start ? formatAbsenceDuration(row.absence_duration_seconds) : "—" },
    ] : []),
    ...(activeSubject === "STAFF" ? [{
      title: "Belt No.", dataIndex: "belt_no", width: 130,
      render: (value) => value || "Not recorded",
    }] : []),
    ...(isStaffDutyDetail ? [{
      title: "Assigned Duty / Shift", width: 300,
      render: (_, row) => (row.duty_assignments || []).map((assignment) => staffDutyDescription(assignment)).join("; ") || "—",
    }] : []),
    {
      title:
        activeSubject === "TRAINEE"
          ? "Cap No."
          : "Employee ID",
      dataIndex: "employee_id",
      render: (_, row) => employeeCode(row),
      width: 145,
    },
    {
      title: "Name",
      dataIndex: "subject_name",
      width: 185,
    },
    {
      title:
        activeSubject ===
        "TRAINEE"
          ? "Course"
          : "Category",
      width: 210,
      render: (_, row) =>
        activeSubject ===
        "TRAINEE"
          ? row.course_name || "-"
          : row.category_name || "-",
    },
    {
      title:
        activeSubject ===
        "TRAINEE"
          ? "Platoon"
          : "Branch",
      width: 150,
      render: (_, row) =>
        activeSubject ===
          "TRAINEE" &&
        row.platoon_number !==
          null &&
        row.platoon_number !==
          undefined
          ? `Platoon ${row.platoon_number}`
          : row.branch_name || "-",
    },
    ...(isRepatriateDetail
      ? [
          {
            title:
              "Date of Repatriate",

            width: 190,

            render:
              (_, row) =>
                formatDashboardDateTime(
                  row.repatriate_drop_datetime ||
                    row.drop_datetime
                ),
          },
        ]
      : []),

    {
      title: "Dashboard Head",
      width: 135,
      render: (_, row) => {
        const name =
          rowStatusName(row);

        return name ? (
          <Tag
            color={
              name === "Present"
                ? "green"
                : name === "Absent"
                ? "red"
                : name === "Repatriate"
                ? "magenta"
                : name === "Long Weekend"
                ? "default"
                : "blue"
            }
          >
            {dashboardStatusLabel(
              name,
              activeSubject
            )}
          </Tag>
        ) : (
          "-"
        );
      },
    },
    {
      title: "Attendance",
      dataIndex:
        "attendance_status",
      width: 115,
      render: (value) => (
        <Tag
          color={
            attendanceTagColor(
              value
            )
          }
        >
          {value || "-"}
        </Tag>
      ),
    },
    {
      title: "Punch",
      width: 105,
      render: (_, row) =>
        formatTime(
          row.selected_punch
        ),
    },
    { title: "Reason", width: 230, render: (_, row) => row.repatriate_reason || row.osd_reason || row.exemption_description || "—" },
  ];

  return (
    <div className="pts-dashboard-root">
      <style>
        {`
          .pts-dashboard-root {
            width: 100%;
            max-width: 100%;
            min-width: 0;
            container-type: inline-size;
            container-name: dashboard;
          }

          .pts-dashboard-root,
          .pts-dashboard-root * {
            box-sizing: border-box;
          }

          .pts-dashboard-root .ant-card,
          .pts-dashboard-root .ant-card-body,
          .pts-dashboard-root .ant-table-wrapper,
          .pts-dashboard-root .ant-spin-nested-loading,
          .pts-dashboard-root .ant-spin-container {
            min-width: 0;
            max-width: 100%;
          }

          .pts-dashboard-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 12px;
            flex-wrap: wrap;
            margin-bottom: 6px;
            min-width: 0;
          }

          .pts-dashboard-header-actions {
            display: flex;
            align-items: center;
            justify-content: flex-end;
            gap: 8px;
            min-width: 0;
          }

          .pts-dashboard-live-button {
            min-width: 92px;
            height: 34px;
            border-radius: 11px;
            border: 1px solid rgba(34,197,94,.28) !important;
            background:
              linear-gradient(145deg,rgba(240,253,244,.95),rgba(255,255,255,.82)) !important;
            color: #166534 !important;
            font-weight: 900;
            letter-spacing: .45px;
            box-shadow:
              0 8px 20px rgba(34,197,94,.09),
              inset 0 1px 0 rgba(255,255,255,.92);
          }

          .pts-dashboard-live-button:hover {
            border-color: rgba(34,197,94,.48) !important;
            color: #14532D !important;
          }

          .pts-dashboard-live-dot {
            display: inline-block;
            width: 9px;
            height: 9px;
            margin-right: 8px;
            border-radius: 50%;
            background: #22C55E;
            box-shadow: 0 0 0 rgba(34,197,94,.46);
            vertical-align: 1px;
            animation: ptsDashboardLivePulse 1.45s ease-out infinite;
          }

          .pts-dashboard-live-button:disabled .pts-dashboard-live-dot {
            animation-duration: .75s;
          }

          @keyframes ptsDashboardLivePulse {
            0% {
              box-shadow: 0 0 0 0 rgba(34,197,94,.42);
              transform: scale(1);
            }
            60% {
              box-shadow: 0 0 0 7px rgba(34,197,94,0);
              transform: scale(1.05);
            }
            100% {
              box-shadow: 0 0 0 0 rgba(34,197,94,0);
              transform: scale(1);
            }
          }

          .pts-dashboard-session-heading {
            transition:
              transform .22s ease,
              box-shadow .22s ease,
              border-color .22s ease;
          }

          .pts-dashboard-session-heading:hover {
            transform: translateY(-1px);
            box-shadow:
              0 11px 26px rgba(44,78,110,.10),
              inset 0 1px 0 rgba(255,255,255,.90) !important;
          }

          .pts-dashboard-summary-grid {
            display: grid;
            gap: 10px;
            width: 100%;
            min-width: 0;
          }

          .pts-dashboard-summary-grid-trainee {
            grid-template-columns: repeat(8,minmax(0,1fr));
          }

          .pts-dashboard-summary-grid-staff {
            grid-template-columns: repeat(7,minmax(0,1fr));
          }

          .pts-dashboard-analysis-grid {
            min-width: 0;
          }

          .pts-dashboard-group-panel {
            container-type: inline-size;
            container-name: groups;
          }

          .pts-dashboard-group-pies {
            min-width: 0;
          }

          .pts-dashboard-group-card .ant-card-body {
            min-width: 0;
            overflow: hidden;
          }

          .pts-dashboard-pie-wrap {
            max-width: 100%;
            overflow: hidden;
          }

          .pts-dashboard-root .ant-table-container {
            max-width: 100%;
          }

          .pts-dashboard-root .ant-table-content,
          .pts-dashboard-root .ant-table-body {
            overflow-x: auto !important;
          }

          /* -------------------------------------------------------------
             Soft glass dashboard surface + motion
             ------------------------------------------------------------- */
          .pts-dashboard-root {
            padding: 2px;
            border-radius: 24px;
            background:
              radial-gradient(circle at 12% 8%, rgba(89,178,255,.10), transparent 28%),
              radial-gradient(circle at 88% 18%, rgba(108,99,255,.08), transparent 24%);
          }

          .pts-dashboard-root .ant-card,
          .pts-dashboard-overall-panel,
          .pts-dashboard-group-panel {
            position: relative;
            isolation: isolate;
            transition:
              transform .26s cubic-bezier(.2,.8,.2,1),
              box-shadow .26s ease,
              border-color .26s ease,
              background .26s ease;
          }

          .pts-dashboard-root .ant-card::after,
          .pts-dashboard-overall-panel::after,
          .pts-dashboard-group-panel::after {
            content: "";
            position: absolute;
            inset: 0;
            z-index: 0;
            pointer-events: none;
            opacity: 0;
            border-radius: inherit;
            background:
              linear-gradient(
                115deg,
                transparent 18%,
                rgba(255,255,255,.62) 44%,
                rgba(186,225,255,.30) 52%,
                transparent 76%
              );
            transform: translateX(-110%);
            transition:
              transform .75s ease,
              opacity .35s ease;
          }

          .pts-dashboard-root .ant-card:hover,
          .pts-dashboard-overall-panel:hover,
          .pts-dashboard-group-panel:hover {
            transform: translateY(-3px);
            border-color: rgba(111,181,235,.50) !important;
            box-shadow:
              0 18px 44px rgba(54,97,135,.16),
              0 5px 14px rgba(64,126,181,.08),
              inset 0 1px 0 rgba(255,255,255,.92) !important;
          }

          .pts-dashboard-root .ant-card:hover::after,
          .pts-dashboard-overall-panel:hover::after,
          .pts-dashboard-group-panel:hover::after {
            opacity: .72;
            transform: translateX(110%);
          }

          .pts-dashboard-root .ant-card-body,
          .pts-dashboard-overall-panel > *,
          .pts-dashboard-group-panel > * {
            position: relative;
            z-index: 1;
          }

          .pts-dashboard-root .ant-btn,
          .pts-dashboard-root .ant-picker {
            transition:
              transform .20s ease,
              box-shadow .20s ease,
              border-color .20s ease,
              background .20s ease;
          }

          .pts-dashboard-root .ant-btn:hover,
          .pts-dashboard-root .ant-picker:hover {
            transform: translateY(-1px);
            box-shadow: 0 8px 20px rgba(64,126,181,.13);
          }

          .pts-dashboard-pie-wrap {
            transition:
              transform .25s ease,
              filter .25s ease;
            transform-origin: center;
          }

          .pts-dashboard-group-card:hover .pts-dashboard-pie-wrap {
            transform: scale(1.025);
            filter: saturate(1.04);
          }

          .pts-dashboard-summary-grid .ant-card .anticon,
          .pts-dashboard-subject-tab .anticon {
            transition:
              transform .24s ease,
              filter .24s ease;
          }

          .pts-dashboard-summary-grid .ant-card:hover .anticon {
            transform: scale(1.12) rotate(-4deg);
            filter: drop-shadow(0 4px 8px rgba(58,119,164,.18));
          }

          .pts-dashboard-subject-tab:hover .anticon {
            transform: scale(1.10);
          }

          .pts-dashboard-overall-pie-stage {
            flex: 1 1 auto;
            min-height: 315px;
            width: 100%;
            display: grid;
            place-items: center;
            align-content: center;
            justify-content: stretch;
          }

          .pts-dashboard-overall-pie-stage .pts-dashboard-pie-wrap {
            margin: auto;
          }

          .pts-dashboard-group-panel {
            backdrop-filter: blur(16px) saturate(135%);
            -webkit-backdrop-filter: blur(16px) saturate(135%);
            box-shadow:
              0 14px 38px rgba(44,78,110,.09),
              inset 0 1px 0 rgba(255,255,255,.78);
          }

          .pts-dashboard-group-pies-staff {
            grid-template-columns: repeat(6,minmax(0,1fr)) !important;
          }

          /*
          |--------------------------------------------------------------------------
          | 100% BROWSER ZOOM DESKTOP DENSITY
          |--------------------------------------------------------------------------
          | Keep the intended six-card staff layout at normal browser zoom.
          | The previous 1500px container breakpoint made common laptop/desktop
          | viewports fall to four cards and forced users to zoom out to 90%.
          |--------------------------------------------------------------------------
          */

          @container dashboard (max-width: 1400px) {
            .pts-dashboard-group-pies-staff {
              grid-template-columns: repeat(6,minmax(0,1fr)) !important;
              gap: 8px !important;
            }

            .pts-dashboard-group-pies-staff .pts-dashboard-group-card {
              min-width: 0;
            }
          }

          @container dashboard (max-width: 1260px) {
            .pts-dashboard-group-pies-staff {
              grid-template-columns: repeat(4,minmax(0,1fr)) !important;
            }
          }

          @container dashboard (max-width: 920px) {
            .pts-dashboard-staff-top-grid {
              grid-template-columns: 1fr !important;
            }

            .pts-dashboard-group-pies-staff {
              grid-template-columns: repeat(3,minmax(0,1fr)) !important;
            }
          }

          @container dashboard (max-width: 820px) {
            .pts-dashboard-group-pies-staff,
            .pts-dashboard-shift-grid {
              grid-template-columns: repeat(2,minmax(0,1fr)) !important;
            }
          }

          @container dashboard (max-width: 560px) {
            .pts-dashboard-group-pies-staff,
            .pts-dashboard-shift-grid {
              grid-template-columns: 1fr !important;
            }
          }

          @container dashboard (max-width: 1380px) {
            .pts-dashboard-summary-grid-trainee {
              grid-template-columns: repeat(4,minmax(0,1fr)) !important;
            }
          }

          @container dashboard (max-width: 1180px) {
            .pts-dashboard-analysis-grid {
              grid-template-columns: 1fr !important;
            }
          }

          @container dashboard (max-width: 900px) {
            .pts-dashboard-summary-grid-staff {
              grid-template-columns: repeat(3,minmax(0,1fr)) !important;
            }
          }

          @container dashboard (max-width: 720px) {
            .pts-dashboard-summary-grid-trainee,
            .pts-dashboard-summary-grid-staff {
              grid-template-columns: repeat(2,minmax(0,1fr)) !important;
            }

            .pts-dashboard-header {
              align-items: stretch;
            }

            .pts-dashboard-header-actions {
              width: 100%;
              justify-content: stretch;
            }

            .pts-dashboard-header-actions .ant-picker {
              flex: 1 1 auto;
              min-width: 0;
              width: auto;
            }

            .pts-dashboard-header-actions .ant-btn {
              flex: 0 0 auto;
            }
          }

          @container dashboard (max-width: 430px) {
            .pts-dashboard-summary-grid-trainee,
            .pts-dashboard-summary-grid-staff {
              grid-template-columns: 1fr !important;
            }

            .pts-dashboard-header-actions {
              display: grid;
              grid-template-columns: 1fr;
            }

            .pts-dashboard-header-actions .ant-picker,
            .pts-dashboard-header-actions .ant-btn {
              width: 100%;
            }
          }

          @container groups (max-width: 760px) {
            .pts-dashboard-group-pies {
              grid-template-columns: repeat(2,minmax(0,1fr)) !important;
            }
          }

          @container groups (max-width: 500px) {
            .pts-dashboard-group-pies {
              grid-template-columns: 1fr !important;
            }
          }

          /* Fallback for browsers without container-query support */
          @media (max-width: 1400px) {
            .pts-dashboard-summary-grid-trainee {
              grid-template-columns: repeat(4,minmax(0,1fr));
            }
          }

          @media (max-width: 1100px) {
            .pts-dashboard-analysis-grid {
              grid-template-columns: 1fr !important;
            }
          }

          @media (max-width: 820px) {
            .pts-dashboard-summary-grid-trainee,
            .pts-dashboard-summary-grid-staff {
              grid-template-columns: repeat(2,minmax(0,1fr));
            }
          }

          @media (max-width: 560px) {
            .pts-dashboard-group-pies {
              grid-template-columns: 1fr !important;
            }
          }
        `}
      </style>

      {/* HEADER — only one date control remains */}
      <div className="pts-dashboard-header">
        <div>
          <Title
            level={3}
            style={{
              margin: 0,
              color: "#0F172A",
              fontSize: "clamp(21px,2.1vw,28px)",
              lineHeight: 1.15,
            }}
          >
            Dashboard
          </Title>
        </div>

        <div className="pts-dashboard-header-actions">
          <DatePicker
            value={dashboardDateTimeValue}
            allowClear={false}
            format="DD-MMM-YYYY  hh:mm:ss A"
            style={{ minWidth: 218 }}
            onChange={(value) => {
              if (value) {
                setSelectedDate(
                  value
                    .hour(selectedDate.hour())
                    .minute(selectedDate.minute())
                    .second(selectedDate.second())
                );
              }
            }}
          />

          <Button
            className="pts-dashboard-live-button"
            disabled={loading}
            onClick={loadDashboard}
            aria-label="Refresh live Dashboard data"
          >
            <span className="pts-dashboard-live-dot" />
            LIVE
          </Button>
        </div>
      </div>

      {/* TRAINEE / STAFF TABS */}
      <Card
        style={{
          ...CARD_STYLE,
          marginBottom: 8,
        }}
        styles={{
          body: { padding: 8 },
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(2,minmax(0,1fr))",
            gap: 8,
          }}
        >
          {[
            {
              key: "TRAINEE",
              label: "Trainee",
              icon: <TeamOutlined />,
            },
            {
              key: "STAFF",
              label: "Staff",
              icon: <UserOutlined />,
            },
          ].map((item) => {
            const active =
              activeSubject ===
              item.key;

            return (
              <Button
                key={item.key}
                className="pts-dashboard-subject-tab"
                type="default"
                size="large"
                icon={item.icon}
                onClick={() =>
                  setActiveSubject(
                    item.key
                  )
                }
                style={{
                  height: 46,
                  borderRadius: 13,
                  fontWeight: 900,
                  color: active
                    ? "#1E5F91"
                    : "#35536C",
                  borderColor: active
                    ? "rgba(91,169,230,.50)"
                    : "rgba(136,173,201,.30)",
                  background: active
                    ? "linear-gradient(135deg,rgba(213,238,255,.92),rgba(235,247,255,.88))"
                    : "rgba(255,255,255,.56)",
                  boxShadow: active
                    ? "0 9px 22px rgba(65,139,196,.14), inset 0 1px 0 rgba(255,255,255,.9)"
                    : "inset 0 1px 0 rgba(255,255,255,.72)",
                }}
              >
                {item.label}
              </Button>
            );
          })}
        </div>
      </Card>

      {activeSubject === "STAFF" && summaryCounts["No Timetable"] > 0 && (
        <Card size="small" style={{ marginBottom: 12, borderColor: "#FCA5A5" }}>
          <Text strong>{summaryCounts["No Timetable"]} staff have No Timetable. </Text>
          <Text>Required Action: Assign staff timetable / duty shift. </Text>
          <Button type="link" onClick={() => openList("Staff - No Timetable", filterRowsByStatus(summaryRows, "No Timetable"))}>
            {"View Names & Belt Nos."}
          </Button>
        </Card>
      )}
      {dashboardError && <Alert type="warning" showIcon message={dashboardError} style={{marginBottom:12}} />}
      {syncStatus.issues.length > 0 && <Alert type="warning" showIcon message="BioTime sync incomplete — saved data may be out of date"
        description={syncStatus.issues.join(". ")} style={{marginBottom:12}} />}
      {/* TOP STATUS CARDS */}
      <Spin spinning={loading}>
        <div
          className={`pts-dashboard-summary-grid pts-dashboard-summary-grid-${activeSubject.toLowerCase()}`}
          style={{
            marginBottom: 16,
          }}
        >
          {activeCardConfig.map(
            (item) => {
              const isTotalCard =
                item.key === "ENROLLED" ||
                item.key === "STAFF_TOTAL";

              const isLongWeekendCard =
                item.key ===
                "Long Weekend";

              const isMedicalRestCard =
                item.key ===
                "Medical Rest";

              const list =
                isMedicalRestCard
                  ? dashboardMedicalRestRows
                  : isTotalCard
                  ? summaryRows
                  : filterRowsByStatus(
                      summaryRows,
                      item.key
                    );

              const value =
                isLongWeekendCard
                  ? list.length
                  : isMedicalRestCard
                  ? dashboardMedicalRestRows.length
                  : isTotalCard
                  ? totalEnrolled
                  : summaryCounts[
                      item.key
                    ] || 0;

              return (
                <SummaryCard
                  key={item.key}
                  item={item}
                  value={value}
                  subtitle={
                    isLongWeekendCard
                      ? "Valid biometric departures"
                      : null
                  }
                  onClick={() =>
                    openList(
                      `${
                        activeSubject ===
                        "TRAINEE"
                          ? "Trainee"
                          : "Staff"
                      } - ${
                        item.title
                      }`,
                      list
                    )
                  }
                />
              );
            }
          )}
        </div>

        {/* ACTIVE SUBJECT MORNING / EVENING */}
        {activeSubject ===
        "TRAINEE" ? (
          <>
            <SessionSection
              subjectType="TRAINEE"
              sessionType="MORNING"
              rows={
                traineeMorningDashboardRows
              }
              loading={loading}
              onOpenList={openList}
              preferenceKey={
                traineeMorningPreferenceKey
              }
            />

            <SessionSection
              subjectType="TRAINEE"
              sessionType="EVENING"
              rows={
                traineeEveningDashboardRows
              }
              loading={loading}
              onOpenList={openList}
              preferenceKey={
                traineeEveningPreferenceKey
              }
              sessionState={
                traineeEveningSessionState
              }
            />
          </>
        ) : (
          <>
            <SessionSection
              subjectType="STAFF"
              sessionType="MORNING"
              rows={
                staffMorningDashboardRows
              }
              loading={loading}
              onOpenList={openList}
              preferenceKey={
                staffMorningPreferenceKey
              }
              shiftAttendanceRows={
                shiftAttendanceRows
              }
            />

            {/* Staff Evening Dashboard is temporarily disabled. */}
          </>
        )}

      </Spin>

      {/* LONG WEEKEND LIST POPUP */}
      <Modal
        open={weekendListOpen}
        title={
          activeSubject === "STAFF"
            ? "Duty Rest List"
            : "Long Weekend List"
        }
        width="min(1180px, 94vw)"
        footer={
          <Space>
            <Button
              onClick={() =>
                setWeekendListOpen(false)
              }
            >
              Close
            </Button>
            <Button
              type="primary"
              icon={<PrinterOutlined />}
              onClick={printWeekendList}
            >
              Print
            </Button>
          </Space>
        }
        destroyOnHidden
        onCancel={() =>
          setWeekendListOpen(false)
        }
      >
        <div
          style={{
            marginBottom: 10,
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          <Tag
            color="blue"
            style={{ borderRadius: 7 }}
          >
            Total Configured: {weekendListRows.length}
          </Tag>

          <Tag
            style={{ borderRadius: 7 }}
          >
            Completed: {longWeekendSummary.completedCount}
          </Tag>

          {longWeekendSummary.active ? (
            <Tag
              color="green"
              style={{ borderRadius: 7 }}
            >
              Active: {longWeekendSummary.active.weekend_name || "Long Weekend"}
            </Tag>
          ) : null}

          {longWeekendSummary.next ? (
            <Tag
              color="purple"
              style={{ borderRadius: 7 }}
            >
              Next: {formatDashboardDateTime(
                longWeekendSummary.next.start_datetime
              )}
            </Tag>
          ) : null}
        </div>

        <Table
          rowKey="id"
          size="small"
          bordered
          columns={weekendListColumns}
          dataSource={weekendListRows}
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            pageSizeOptions: [10, 20, 50],
          }}
          scroll={{
            x: 1050,
            y: 460,
          }}
          locale={{
            emptyText:
              activeSubject === "STAFF"
                ? "No Duty Rest configured"
                : "No Long Weekend configured",
          }}
        />
      </Modal>

      {/* DETAIL POPUP — preserves click-to-list behaviour */}
      <Modal
        open={detailOpen}
        title={detailTitle}
        width="min(1200px, 94vw)"
        footer={
          <Space>
            <Button
              onClick={() =>
                setDetailOpen(false)
              }
            >
              Close
            </Button>
            <Button
              type="primary"
              icon={<PrinterOutlined />}
              disabled={!detailRows.length}
              onClick={printDetailList}
            >
              Print
            </Button>
          </Space>
        }
        destroyOnHidden
        onCancel={() =>
          setDetailOpen(false)
        }
      >
        <div
          style={{ marginBottom: 10 }}
        >
          <Tag
            color="blue"
            style={{
              borderRadius: 7,
            }}
          >
            Total Records:{" "}
            {detailRows.length}
          </Tag>
        </div>

        <Table
          rowKey={(row, index) =>
            `${
              row.id || "row"
            }-${
              row.subject_id ||
              row.employee_id ||
              index
            }-${
              row.session_type ||
              "session"
            }-${index}`
          }
          columns={detailColumns}
          dataSource={detailRows}
          pagination={{
            pageSize: 25,
            showSizeChanger: true,
            pageSizeOptions: [
              25,
              50,
              100,
              200,
            ],
          }}
          scroll={{
            x: 1320,
            y: 480,
          }}
        />
      </Modal>
    </div>
  );
}
