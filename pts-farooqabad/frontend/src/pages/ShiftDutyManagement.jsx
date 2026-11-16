import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Col,
  DatePicker,
  Descriptions,
  Divider,
  Drawer,
  Empty,
  Form,
  Input,
  Modal,
  Radio,
  Row,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  TimePicker,
  Typography,
  message,
} from "antd";
import {
  CopyOutlined,
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  PlusOutlined,
  PrinterOutlined,
  ReloadOutlined,
  SaveOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import api from "../services/api";
import { useAuth } from "../contexts/AuthContext";
import CustomShiftDutyTab from "./CustomShiftDutyTab.jsx";

const { Title, Text } = Typography;

const SHIFT_OPTIONS = [
  { value: "FIRST", label: "1st Shift" },
  { value: "SECOND", label: "2nd Shift" },
  { value: "THIRD", label: "3rd Shift" },
];

const SHIFT_LABELS = {
  FIRST: "1st Shift",
  SECOND: "2nd Shift",
  THIRD: "3rd Shift",
};

/*
|--------------------------------------------------------------------------
| IMPORTANT
|--------------------------------------------------------------------------
| Exact Urdu note text from the approved official roster should be inserted
| in these six fixed slots after final verification. The print structure is
| already fixed and these rows are NOT editable by the end user.
|--------------------------------------------------------------------------
*/
const FIXED_URDU_NOTES = [
  "چیف سکیورٹی آفیسر ڈیوٹی لگانے، بریفنگ دینے اور تمام ڈیوٹیوں کو چیک کرنے کا ذمہ دار ہوگا۔",
  "SO، SSO اور JSO ادارہ ہذا کی تمام سکیورٹی ڈیوٹی کو اچانک اور بار بار چیک کرنے کے ذمہ دار ہوں گے اور ڈیوٹی کی بروقت تبدیلی کو یقینی بنائیں گے۔",
  "ڈیوٹی مقررہ وقت سے شروع ہوگی اور تمام ملازمین اپنی ڈیوٹی سے 15 منٹ قبل جائے تعیناتی پر پہنچیں گے تاکہ باقاعدہ چارج لیا اور دیا جا سکے۔",
  "SO، SSO اور JSO باقاعدگی سے سکیورٹی ڈیوٹی پر مامور ملازمان کو چیک کریں گے اور خلاف ورزی یا غیر حاضری کی صورت میں فوری رپورٹ کریں گے۔",
  "گارڈ کمانڈر اور ڈیوٹی عملہ مقررہ پوائنٹ، اسلحہ/سامان اور ڈیوٹی ہدایات کی پابندی کریں گے اور بغیر اجازت ڈیوٹی پوائنٹ نہیں چھوڑیں گے۔",
  "PTS کے تمام متعلقہ ڈیوٹی ملازمان دورانِ ڈیوٹی نظم و ضبط، بروقت حاضری اور افسران کی ہدایات پر مکمل عمل کریں گے۔",
];

function fullName(item) {
  return [item?.first_name, item?.last_name].filter(Boolean).join(" ") || "-";
}

function personKey(item) {
  return `${item.subject_type}:${item.subject_id}`;
}

function formatPerson(item, withWeapon = true) {
  if (!item) return "-";

  const identity =
    item.subject_type === "STAFF"
      ? `Belt No. ${item.belt_no || "not recorded"}`
      : [item.cap_no || item.employee_id || "", item.platoon_number || ""]
          .filter(Boolean)
          .join("/");

  const weapon = String(item.weapon || "").trim();

  return [
    item.name || "-",
    identity,
    withWeapon && weapon ? `(${weapon})` : null,
  ]
    .filter(Boolean)
    .join(" ");
}

function toTime(value) {
  return value ? value.format("HH:mm:ss") : null;
}

function displayTime(value) {
  if (!value) return "-";
  const parsed = dayjs(value, "HH:mm:ss");
  return parsed.isValid() ? parsed.format("hh:mm A") : value;
}

function blankDutyPoint() {
  return {
    local_id: `point-${Date.now()}-${Math.random()}`,
    duty_point_name: "",
    employees: [],
  };
}

export default function ShiftDutyManagement() {
  const { hasPermission } = useAuth();

  const canManage =
    hasPermission("duty_roster.manage") ||
    hasPermission("timetable.edit");

  const [rosterForm] = Form.useForm();
  const [shiftForm] = Form.useForm();

  const [rosters, setRosters] = useState([]);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [currentRoster, setCurrentRoster] = useState(null);

  const [shiftOpen, setShiftOpen] = useState(false);
  const [editingShiftKey, setEditingShiftKey] = useState(null);
  const [dutyPoints, setDutyPoints] = useState([blankDutyPoint()]);

  const [employeeTypeByPoint, setEmployeeTypeByPoint] = useState({});
  const [employeeOptions, setEmployeeOptions] = useState({});
  const employeeSearchSeqRef = useRef({});
  const [staffStatusByPoint, setStaffStatusByPoint] = useState({});
  const [staffStatusLoadingByPoint, setStaffStatusLoadingByPoint] = useState({});

  const [viewOpen, setViewOpen] = useState(false);
  const [viewingRoster, setViewingRoster] = useState(null);

  const [search, setSearch] = useState("");
  const [dateFilter, setDateFilter] = useState(null);
  const [page, setPage] = useState({ current: 1, pageSize: 20 });

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [shiftSaving, setShiftSaving] = useState(false);

  const usedShiftKeys = useMemo(
    () => new Set((currentRoster?.shifts || []).map((item) => item.shift_key)),
    [currentRoster],
  );

  const filteredRosters = useMemo(() => {
    const q = search.trim().toLowerCase();

    return rosters.filter((item) => {
      if (dateFilter && !dayjs(item.roster_date).isSame(dateFilter, "day")) {
        return false;
      }

      if (!q) return true;

      return [item.title, item.reference_no, item.roster_date]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q));
    });
  }, [rosters, search, dateFilter]);

  const loadRosters = async () => {
    setLoading(true);

    try {
      const response = await api.get("/duty-rosters");

      setRosters(
        Array.isArray(response.data?.data)
          ? response.data.data
          : [],
      );
    } catch (error) {
      message.error(
        error.response?.data?.message ||
          "Could not load Duty Rosters.",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRosters();
  }, []);

  const openAddRoster = () => {
    rosterForm.resetFields();

    setCurrentRoster({
      id: null,
      copied_from_roster_id: null,
      roster_date: null,
      title: "",
      reference_no: "",
      remarks: "",
      shifts: [],
    });

    setBuilderOpen(true);
  };

  const openEditRoster = (record) => {
    const copy = structuredClone(record);

    setCurrentRoster(copy);

    rosterForm.setFieldsValue({
      roster_date: copy.roster_date ? dayjs(copy.roster_date) : null,
      title: copy.title || "",
      reference_no: copy.reference_no || "",
      remarks: copy.remarks || "",
    });

    setBuilderOpen(true);
  };

  const copyAsNew = (record) => {
    const copy = structuredClone(record);

    copy.copied_from_roster_id = record.id || null;
    copy.id = null;
    copy.roster_date = null;
    copy.title = copy.title ? `${copy.title} Copy` : "Copied Duty Roster";

    setCurrentRoster(copy);

    rosterForm.setFieldsValue({
      roster_date: null,
      title: copy.title,
      reference_no: copy.reference_no || "",
      remarks: copy.remarks || "",
    });

    setBuilderOpen(true);
  };

  const deleteRoster = (record) => {
    Modal.confirm({
      title: "Delete Duty Roster?",
      content:
        "Roster active list se remove ho jayega, lekin database history preserve rahegi.",
      okText: "Delete",
      okType: "danger",
      async onOk() {
        try {
          await api.delete(`/duty-rosters/${record.id}`);

          message.success("Duty Roster deleted successfully.");

          await loadRosters();
        } catch (error) {
          message.error(
            error.response?.data?.message ||
              "Could not delete Duty Roster.",
          );
        }
      },
    });
  };

  const openAddShift = () => {
    const existingShifts = currentRoster?.shifts || [];

    if (!rosterForm.getFieldValue("roster_date")) {
      message.warning("Select Roster Date before adding a Shift.");
      return;
    }

    if (existingShifts.length >= 3) {
      message.warning("Only 1st, 2nd and 3rd Shift are allowed.");
      return;
    }

    /*
    |--------------------------------------------------------------------------
    | DUTY POINT TEMPLATE FOR NEW SHIFT
    |--------------------------------------------------------------------------
    | Duty Point rows remain the same for all three shifts. When another shift
    | is added, copy only the previous shift's Duty Point names/order. Staff /
    | Trainee assignments are deliberately NOT copied; every new shift starts
    | with empty assignments and the existing cross-shift duplicate guard
    | remains responsible for preventing the same person in another shift.
    |--------------------------------------------------------------------------
    */
    const previousShift = [...existingShifts]
      .sort(
        (a, b) =>
          SHIFT_OPTIONS.findIndex((item) => item.value === a.shift_key) -
          SHIFT_OPTIONS.findIndex((item) => item.value === b.shift_key),
      )
      .at(-1);

    const inheritedPoints = (previousShift?.duty_points || [])
      .filter((point) => String(point?.duty_point_name || "").trim())
      .map((point, index) => ({
        local_id: `point-${Date.now()}-${index}-${Math.random()}`,
        duty_point_name: String(point.duty_point_name || "").trim(),
        employees: [],
      }));

    setEditingShiftKey(null);
    shiftForm.resetFields();
    setDutyPoints(inheritedPoints.length ? inheritedPoints : [blankDutyPoint()]);
    setEmployeeTypeByPoint({});
    setEmployeeOptions({});
    setStaffStatusByPoint({});
    setStaffStatusLoadingByPoint({});
    setShiftOpen(true);
  };

  const openEditShift = (shift) => {
    setEditingShiftKey(shift.shift_key);

    shiftForm.setFieldsValue({
      shift_key: shift.shift_key,
      start_time: shift.start_time ? dayjs(shift.start_time, "HH:mm:ss") : null,
      end_time: shift.end_time ? dayjs(shift.end_time, "HH:mm:ss") : null,
      start_punch_from: shift.start_punch_from
        ? dayjs(shift.start_punch_from, "HH:mm:ss")
        : null,
      start_punch_to: shift.start_punch_to
        ? dayjs(shift.start_punch_to, "HH:mm:ss")
        : null,
      end_punch_from: shift.end_punch_from
        ? dayjs(shift.end_punch_from, "HH:mm:ss")
        : null,
      end_punch_to: shift.end_punch_to
        ? dayjs(shift.end_punch_to, "HH:mm:ss")
        : null,
    });

    setDutyPoints(structuredClone(shift.duty_points || []));
    setEmployeeTypeByPoint({});
    setEmployeeOptions({});
    setStaffStatusByPoint({});
    setStaffStatusLoadingByPoint({});
    setShiftOpen(true);
  };

  const removeShift = (shiftKey) => {
    setCurrentRoster((old) => ({
      ...old,
      shifts: (old?.shifts || []).filter((item) => item.shift_key !== shiftKey),
    }));
  };

  const addDutyPoint = () => {
    setDutyPoints((old) => [...old, blankDutyPoint()]);
  };

  const updateDutyPointName = (pointId, value) => {
    setDutyPoints((old) =>
      old.map((point) =>
        point.local_id === pointId
          ? { ...point, duty_point_name: value }
          : point,
      ),
    );
  };

  const removeDutyPoint = (pointId) => {
    setDutyPoints((old) => old.filter((point) => point.local_id !== pointId));
  };

  const searchEmployee = async (pointId, query) => {
    const q = String(query || "").trim();
    const subjectType = employeeTypeByPoint[pointId] || "STAFF";

    const nextSeq = Number(employeeSearchSeqRef.current[pointId] || 0) + 1;
    employeeSearchSeqRef.current[pointId] = nextSeq;

    if (!q) {
      setEmployeeOptions((old) => ({ ...old, [pointId]: [] }));
      return;
    }

    try {
      const response = await api.get("/leaves/subjects/search", {
        params: {
          subject_type: subjectType,
          search: q,
          assignment_search: subjectType === "STAFF" ? 1 : undefined,
        },
      });

      if (employeeSearchSeqRef.current[pointId] !== nextSeq) {
        return;
      }

      const rows = Array.isArray(response.data?.data) ? response.data.data : [];

      setEmployeeOptions((old) => ({
        ...old,
        [pointId]: rows.map((item) => ({
          value: `${subjectType}:${item.subject_id}`,
          label:
            subjectType === "STAFF"
              ? [
                  fullName(item),
                  item.belt_no || "No Belt No.",
                  item.category_name || "Uncategorized",
                ]
                  .filter(Boolean)
                  .join(" • ")
              : `${fullName(item)} ${
                  item.cap_no || item.employee_id || ""
                }${item.platoon_number ? `/${item.platoon_number}` : ""}`,
          raw: {
            subject_type: subjectType,
            subject_id: Number(item.subject_id),
            name: fullName(item),
            employee_id: item.employee_id || "",
            belt_no: item.belt_no || "",
            category_id: item.category_id || null,
            category_name: item.category_name || "",
            cap_no: item.cap_no || item.employee_id || "",
            platoon_number: item.platoon_number || "",
            weapon: "",
          },
        })),
      }));
    } catch (error) {
      if (employeeSearchSeqRef.current[pointId] === nextSeq) {
        message.error(
          error.response?.data?.message || "Could not search employee.",
        );
      }
    }
  };

  const rosterHasPerson = (assignment, currentPointId) => {
    const key = personKey(assignment);

    for (const shift of currentRoster?.shifts || []) {
      if (shift.shift_key === editingShiftKey) continue;

      for (const point of shift.duty_points || []) {
        if (
          (point.employees || []).some(
            (employee) => personKey(employee) === key,
          )
        ) {
          return true;
        }
      }
    }

    for (const point of dutyPoints) {
      if (point.local_id === currentPointId) continue;

      if (
        (point.employees || []).some((employee) => personKey(employee) === key)
      ) {
        return true;
      }
    }

    return false;
  };

  const addEmployee = async (pointId, selectedValue) => {
    const option = (employeeOptions[pointId] || []).find(
      (item) => item.value === selectedValue,
    );

    if (!option?.raw) return;

    if (rosterHasPerson(option.raw, pointId)) {
      message.error(
        "This employee/trainee is already assigned on another Duty Point / Shift.",
      );
      return;
    }

    /*
    |--------------------------------------------------------------------------
    | INSTANT STAFF STATUS CHECK
    |--------------------------------------------------------------------------
    | Staff member select hotay hi Leave / OSD / Duty Rest / Home Rest /
    | Short Permission check hota hai. Trainee ke liye ye Staff-only check
    | apply nahi hota.
    |--------------------------------------------------------------------------
    */
    if (option.raw.subject_type === "STAFF") {
      const rosterDateValue = rosterForm.getFieldValue("roster_date");

      if (!rosterDateValue) {
        message.warning("Select Roster Date before selecting Staff.");
        return;
      }

      const shiftValues = shiftForm.getFieldsValue(["start_time", "end_time"]);
      const startTime = toTime(shiftValues.start_time);
      const endTime = toTime(shiftValues.end_time);

      setStaffStatusLoadingByPoint((old) => ({
        ...old,
        [pointId]: true,
      }));

      try {
        const response = await api.get("/duty-rosters/staff-status", {
          params: {
            subject_id: option.raw.subject_id,
            roster_date: rosterDateValue.format("YYYY-MM-DD"),
            start_time: startTime || undefined,
            end_time: endTime || undefined,
            shift_key: editingShiftKey || undefined,
          },
        });

        const status = response.data?.data || null;

        setStaffStatusByPoint((old) => ({
          ...old,
          [pointId]: status,
        }));

        if (status && status.available === false) {
          message.warning(
            `${option.raw.name} is ${status.status_label || "not available"}${
              status.description ? `: ${status.description}` : ""
            }.`,
          );
          return;
        }

        message.success(`${option.raw.name} is available for duty.`);
      } catch (error) {
        const errorMessage =
          error.response?.data?.message ||
          "Could not check Staff duty status.";

        setStaffStatusByPoint((old) => ({
          ...old,
          [pointId]: {
            available: false,
            status: "CHECK_FAILED",
            status_label: "Status Check Failed",
            description: errorMessage,
          },
        }));

        message.error(errorMessage);
        return;
      } finally {
        setStaffStatusLoadingByPoint((old) => ({
          ...old,
          [pointId]: false,
        }));
      }
    } else {
      setStaffStatusByPoint((old) => ({
        ...old,
        [pointId]: null,
      }));
    }

    setDutyPoints((old) =>
      old.map((point) => {
        if (point.local_id !== pointId) return point;

        if (
          (point.employees || []).some(
            (employee) => personKey(employee) === personKey(option.raw),
          )
        ) {
          return point;
        }

        return {
          ...point,
          employees: [...(point.employees || []), option.raw],
        };
      }),
    );
  };

  const updateWeapon = (pointId, key, value) => {
    setDutyPoints((old) =>
      old.map((point) =>
        point.local_id === pointId
          ? {
              ...point,
              employees: (point.employees || []).map((employee) =>
                personKey(employee) === key
                  ? { ...employee, weapon: value }
                  : employee,
              ),
            }
          : point,
      ),
    );
  };

  const removeEmployee = (pointId, key) => {
    setDutyPoints((old) =>
      old.map((point) =>
        point.local_id === pointId
          ? {
              ...point,
              employees: (point.employees || []).filter(
                (employee) => personKey(employee) !== key,
              ),
            }
          : point,
      ),
    );
  };

  const buildRosterPayload = (values, roster) => ({
    roster_date: values.roster_date.format("YYYY-MM-DD"),
    title: String(values.title || "").trim() || null,
    reference_no: String(values.reference_no || "").trim() || null,
    remarks: String(values.remarks || "").trim() || null,
    copied_from_roster_id: roster?.copied_from_roster_id || null,

    shifts: (roster?.shifts || []).map((shift) => ({
      shift_key: shift.shift_key,
      start_time: shift.start_time,
      end_time: shift.end_time,
      start_punch_from: shift.start_punch_from,
      start_punch_to: shift.start_punch_to,
      end_punch_from: shift.end_punch_from,
      end_punch_to: shift.end_punch_to,

      duty_points: (shift.duty_points || []).map((point) => ({
        duty_point_name: point.duty_point_name,

        employees: (point.employees || []).map((employee) => ({
          subject_type: employee.subject_type,
          subject_id: Number(employee.subject_id),
          weapon: String(employee.weapon || "").trim() || null,
        })),
      })),
    })),
  });

  const saveShift = async () => {
    try {
      const values = await shiftForm.validateFields();
      const rosterValues = await rosterForm.validateFields();

      const cleanedPoints = dutyPoints
        .map((point) => ({
          ...point,
          duty_point_name: String(point.duty_point_name || "").trim(),
        }))
        .filter((point) => point.duty_point_name);

      if (!cleanedPoints.length) {
        message.error("At least one Duty Point is required.");
        return;
      }

      const emptyPoint = cleanedPoints.find(
        (point) => !(point.employees || []).length,
      );

      if (emptyPoint) {
        message.error(
          `Duty Point "${emptyPoint.duty_point_name}" mein employee add karein.`,
        );
        return;
      }

      const shift = {
        shift_key: values.shift_key,
        shift_name: SHIFT_LABELS[values.shift_key],
        start_time: toTime(values.start_time),
        end_time: toTime(values.end_time),
        start_punch_from: toTime(values.start_punch_from),
        start_punch_to: toTime(values.start_punch_to),
        end_punch_from: toTime(values.end_punch_from),
        end_punch_to: toTime(values.end_punch_to),
        duty_points: cleanedPoints,
      };

      const oldShifts = currentRoster?.shifts || [];

      const changedShifts = editingShiftKey
        ? oldShifts.map((item) =>
            item.shift_key === editingShiftKey ? shift : item,
          )
        : [...oldShifts, shift];

      const nextShifts = SHIFT_OPTIONS.map((option) =>
        changedShifts.find((item) => item.shift_key === option.value),
      ).filter(Boolean);

      const nextRoster = {
        ...currentRoster,
        roster_date: rosterValues.roster_date.format("YYYY-MM-DD"),
        title: String(rosterValues.title || "").trim() || null,
        reference_no: String(rosterValues.reference_no || "").trim() || null,
        remarks: String(rosterValues.remarks || "").trim() || null,
        shifts: nextShifts,
      };

      const payload = buildRosterPayload(rosterValues, nextRoster);

      setShiftSaving(true);

      const response = currentRoster?.id
        ? await api.put(`/duty-rosters/${currentRoster.id}`, payload)
        : await api.post("/duty-rosters", payload);

      const savedRoster = response.data?.data || nextRoster;

      setCurrentRoster(savedRoster);

      setShiftOpen(false);
      setEditingShiftKey(null);
      setDutyPoints([blankDutyPoint()]);
      setEmployeeTypeByPoint({});
      setEmployeeOptions({});
      shiftForm.resetFields();

      message.success(
        `${shift.shift_name} saved to database. Your progress is safe.`,
      );
    } catch (error) {
      if (error?.errorFields) {
        return;
      }

      message.error(
        error.response?.data?.message ||
          "Could not save Shift to database.",
      );
    } finally {
      setShiftSaving(false);
    }
  };

  const saveRoster = async () => {
    try {
      const values = await rosterForm.validateFields();

      if (!(currentRoster?.shifts || []).length) {
        message.error("At least one Shift add karein.");
        return;
      }

      setSaving(true);

      const payload = buildRosterPayload(values, currentRoster);

      if (currentRoster?.id) {
        await api.put(`/duty-rosters/${currentRoster.id}`, payload);

        message.success("Duty Roster updated successfully.");
      } else {
        await api.post("/duty-rosters", payload);

        message.success("Duty Roster saved successfully.");
      }

      setBuilderOpen(false);
      setCurrentRoster(null);
      rosterForm.resetFields();

      await loadRosters();
    } catch (error) {
      if (error?.errorFields) {
        return;
      }

      message.error(
        error.response?.data?.message ||
          "Could not save Duty Roster.",
      );
    } finally {
      setSaving(false);
    }
  };

  const totalAssigned = (roster) => {
    const keys = new Set();

    for (const shift of roster?.shifts || []) {
      for (const point of shift.duty_points || []) {
        for (const employee of point.employees || []) {
          keys.add(personKey(employee));
        }
      }
    }

    return keys.size;
  };

  const printShift = (roster, key) =>
    (roster?.shifts || []).find((shift) => shift.shift_key === key);

  const allDutyPoints = (roster) => {
    const names = [];

    for (const shift of roster?.shifts || []) {
      for (const point of shift.duty_points || []) {
        if (point.duty_point_name && !names.includes(point.duty_point_name)) {
          names.push(point.duty_point_name);
        }
      }
    }

    return names;
  };

  const employeesAt = (shift, pointName) =>
    (shift?.duty_points || []).find(
      (point) => point.duty_point_name === pointName,
    )?.employees || [];

  const columns = [
    {
      title: "Roster Date",
      dataIndex: "roster_date",
      width: 130,
      render: (value) => (value ? dayjs(value).format("DD-MMM-YYYY") : "-"),
    },
    {
      title: "Roster",
      dataIndex: "title",
      width: 220,
      render: (value) => <Text strong>{value || "Duty Roster"}</Text>,
    },
    {
      title: "Shifts",
      width: 90,
      align: "center",
      render: (_, record) => (record.shifts || []).length,
    },
    {
      title: "Assigned",
      width: 100,
      align: "center",
      render: (_, record) => totalAssigned(record),
    },
    {
      title: "Reference",
      dataIndex: "reference_no",
      width: 160,
      render: (value) => value || "-",
    },
    {
      title: "Actions",
      width: 330,
      fixed: "right",
      render: (_, record) => (
        <Space wrap>
          <Button
            size="small"
            icon={<EyeOutlined />}
            onClick={() => {
              setViewingRoster(record);
              setViewOpen(true);
            }}
          >
            View
          </Button>

          <Button
            size="small"
            icon={<PrinterOutlined />}
            onClick={() => {
              setViewingRoster(record);
              setViewOpen(true);
              setTimeout(() => window.print(), 250);
            }}
          >
            Print
          </Button>

          {canManage && (
            <>
              <Button
                size="small"
                icon={<EditOutlined />}
                onClick={() => openEditRoster(record)}
              >
                Edit
              </Button>

              <Button
                size="small"
                icon={<CopyOutlined />}
                onClick={() => copyAsNew(record)}
              >
                Copy as New
              </Button>

              <Button
                size="small"
                danger
                icon={<DeleteOutlined />}
                onClick={() => deleteRoster(record)}
              >
                Delete
              </Button>
            </>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <style>
        {`
          @media print {
            body * {
              visibility: hidden !important;
            }

            .duty-roster-print,
            .duty-roster-print * {
              visibility: visible !important;
            }

            .duty-roster-print {
              position: absolute !important;
              left: 0 !important;
              top: 0 !important;
              width: 100% !important;
              background: #fff !important;
            }

            .no-print,
            .ant-drawer-header,
            .ant-drawer-mask {
              display: none !important;
            }

            .ant-drawer-content-wrapper {
              width: 100% !important;
              box-shadow: none !important;
            }

            .ant-drawer-body {
              padding: 0 !important;
            }
          }

          .official-roster-table {
            width: 100%;
            border-collapse: collapse;
            table-layout: fixed;
          }

          .official-roster-table th,
          .official-roster-table td {
            border: 1px solid #111;
            padding: 6px 8px;
            vertical-align: top;
            font-size: 12px;
          }

          .official-roster-table th {
            text-align: center;
            font-weight: 700;
          }

          .official-roster-employee {
            margin-bottom: 4px;
            line-height: 1.35;
          }

          .official-roster-notes {
            width: 100%;
            border-collapse: collapse;
            margin-top: 14px;
          }

          .official-roster-notes td {
            border-bottom: 1px solid #333;
            padding: 5px 6px;
            font-size: 12px;
          }
        `}
      </style>

      {!builderOpen ? (
        <Tabs
          defaultActiveKey="security"
          items={[
            {
              key: "security",
              label: "Security Duty Roster",
              children: (
                <>
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
              <Title level={3} style={{ margin: 0 }}>
                Shift Duty / Duty Roster
              </Title>

              <Text type="secondary">
                Fixed 3-shift Duty Roster. Staff biometric attendance follows
                the assigned Shift windows; Trainee attendance stays on the Course timetable.
              </Text>
            </div>

            <Space wrap>
              <Button
                icon={<ReloadOutlined />}
                loading={loading}
                onClick={loadRosters}
              >
                Refresh
              </Button>

              {canManage && (
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={openAddRoster}
                >
                  Add Duty Roster
                </Button>
              )}
            </Space>
          </div>

          <Card style={{ marginBottom: 16 }}>
            <Row gutter={[12, 12]}>
              <Col xs={24} md={10}>
                <Input
                  allowClear
                  placeholder="Search Roster / Reference"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </Col>

              <Col xs={24} md={8}>
                <DatePicker
                  format="DD-MMM-YYYY"
                  value={dateFilter}
                  onChange={setDateFilter}
                  style={{ width: "100%" }}
                />
              </Col>
            </Row>
          </Card>

          <Card>
            <div style={{ marginBottom: 12 }}>
              <Text>
                Total:{" "}
                <strong>
                  {filteredRosters.length}/{rosters.length}
                </strong>
              </Text>
            </div>

            <Table
              rowKey="id"
              loading={loading}
              columns={columns}
              dataSource={filteredRosters}
              scroll={{ x: 1200 }}
              pagination={{
                current: page.current,
                pageSize: page.pageSize,
                total: filteredRosters.length,
                showSizeChanger: true,
                showQuickJumper: true,
                pageSizeOptions: ["10", "20", "50", "100"],
                onChange: (current, pageSize) => {
                  const changed = pageSize !== page.pageSize;
                  setPage({
                    current: changed ? 1 : current,
                    pageSize,
                  });
                },
              }}
            />
          </Card>
                </>
              ),
            },
            {
              key: "custom",
              label: "Custom Shift Duty",
              children: <CustomShiftDutyTab canManage={canManage} />,
            },
          ]}
        />
      ) : (
        <>
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
              <Title level={3} style={{ margin: 0 }}>
                {currentRoster?.id
                  ? "Edit Duty Roster"
                  : "Add Duty Roster"}
              </Title>

              <Text type="secondary">
                Add 1st / 2nd / 3rd Shift and build Duty Points independently.
              </Text>
            </div>

            <Space>
              <Button
                onClick={() => {
                  setBuilderOpen(false);
                  setCurrentRoster(null);
                  rosterForm.resetFields();
                }}
              >
                Cancel
              </Button>

              <Button
                type="primary"
                icon={<SaveOutlined />}
                onClick={saveRoster}
                loading={saving}
              >
                Save Duty Roster
              </Button>
            </Space>
          </div>

          <Card style={{ marginBottom: 16 }}>
            <Form form={rosterForm} layout="vertical">
              <Row gutter={16}>
                <Col xs={24} md={8}>
                  <Form.Item
                    name="roster_date"
                    label="Roster Date"
                    rules={[
                      {
                        required: true,
                        message: "Roster Date is required.",
                      },
                    ]}
                  >
                    <DatePicker
                      format="DD-MMM-YYYY"
                      style={{ width: "100%" }}
                    />
                  </Form.Item>
                </Col>

                <Col xs={24} md={8}>
                  <Form.Item name="title" label="Roster Title">
                    <Input placeholder="Daily Duty Roster" />
                  </Form.Item>
                </Col>

                <Col xs={24} md={8}>
                  <Form.Item name="reference_no" label="Reference No.">
                    <Input />
                  </Form.Item>
                </Col>
              </Row>

              <Form.Item name="remarks" label="Remarks">
                <Input.TextArea rows={2} />
              </Form.Item>
            </Form>
          </Card>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 12,
            }}
          >
            <Title level={4} style={{ margin: 0 }}>
              Shifts
            </Title>

            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={openAddShift}
              disabled={(currentRoster?.shifts || []).length >= 3}
            >
              Add Shift
            </Button>
          </div>

          {!(currentRoster?.shifts || []).length ? (
            <Card>
              <Empty description="No Shift added yet" />
            </Card>
          ) : (
            <Space direction="vertical" size={14} style={{ width: "100%" }}>
              {(currentRoster?.shifts || []).map((shift) => (
                <Card
                  key={shift.shift_key}
                  title={
                    <Space>
                      <Text strong>{shift.shift_name}</Text>
                      <Tag>
                        {displayTime(shift.start_time)} -{" "}
                        {displayTime(shift.end_time)}
                      </Tag>
                    </Space>
                  }
                  extra={
                    <Space>
                      <Button
                        size="small"
                        icon={<EditOutlined />}
                        onClick={() => openEditShift(shift)}
                      >
                        Edit
                      </Button>

                      <Button
                        size="small"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={() => removeShift(shift.shift_key)}
                      >
                        Remove
                      </Button>
                    </Space>
                  }
                >
                  <Descriptions bordered size="small" column={2}>
                    <Descriptions.Item label="Start Punch">
                      {displayTime(shift.start_punch_from)} →{" "}
                      {displayTime(shift.start_punch_to)}
                    </Descriptions.Item>

                    <Descriptions.Item label="End Punch">
                      {displayTime(shift.end_punch_from)} →{" "}
                      {displayTime(shift.end_punch_to)}
                    </Descriptions.Item>
                  </Descriptions>

                  <Table
                    style={{ marginTop: 14 }}
                    size="small"
                    rowKey="local_id"
                    pagination={false}
                    dataSource={shift.duty_points}
                    columns={[
                      {
                        title: "Duty Point",
                        dataIndex: "duty_point_name",
                        width: 260,
                      },
                      {
                        title: "Employees",
                        render: (_, point) => (
                          <Space direction="vertical" size={3}>
                            {(point.employees || []).map((employee) => (
                              <Text key={personKey(employee)}>
                                {formatPerson(employee)}
                              </Text>
                            ))}
                          </Space>
                        ),
                      },
                    ]}
                  />
                </Card>
              ))}
            </Space>
          )}
        </>
      )}

      <Drawer
        title={editingShiftKey ? "Edit Shift" : "Add Shift"}
        width={900}
        open={shiftOpen}
        destroyOnHidden
        onClose={() => {
          setShiftOpen(false);
          setEditingShiftKey(null);
          setDutyPoints([blankDutyPoint()]);
          shiftForm.resetFields();
        }}
        extra={
          <Space>
            <Button
              disabled={shiftSaving}
              onClick={() => setShiftOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="primary"
              onClick={saveShift}
              loading={shiftSaving}
            >
              Save Shift
            </Button>
          </Space>
        }
      >
        <Form form={shiftForm} layout="vertical">
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item
                name="shift_key"
                label="Shift"
                rules={[{ required: true, message: "Select Shift." }]}
              >
                <Select
                  placeholder="Select Shift"
                  disabled={Boolean(editingShiftKey)}
                  options={SHIFT_OPTIONS.map((option) => ({
                    ...option,
                    disabled:
                      usedShiftKeys.has(option.value) &&
                      option.value !== editingShiftKey,
                  }))}
                />
              </Form.Item>
            </Col>

            <Col span={8}>
              <Form.Item
                name="start_time"
                label="Shift Start Time"
                rules={[{ required: true }]}
              >
                <TimePicker
                  use12Hours
                  format="hh:mm A"
                  style={{ width: "100%" }}
                />
              </Form.Item>
            </Col>

            <Col span={8}>
              <Form.Item
                name="end_time"
                label="Shift End Time"
                rules={[{ required: true }]}
              >
                <TimePicker
                  use12Hours
                  format="hh:mm A"
                  style={{ width: "100%" }}
                />
              </Form.Item>
            </Col>
          </Row>

          <Divider orientation="left">Biometric Attendance Windows</Divider>

          <Row gutter={16}>
            <Col span={6}>
              <Form.Item
                name="start_punch_from"
                label="Start Punch From"
                rules={[{ required: true }]}
              >
                <TimePicker
                  use12Hours
                  format="hh:mm A"
                  style={{ width: "100%" }}
                />
              </Form.Item>
            </Col>

            <Col span={6}>
              <Form.Item
                name="start_punch_to"
                label="Start Punch To"
                rules={[{ required: true }]}
              >
                <TimePicker
                  use12Hours
                  format="hh:mm A"
                  style={{ width: "100%" }}
                />
              </Form.Item>
            </Col>

            <Col span={6}>
              <Form.Item
                name="end_punch_from"
                label="End Punch From"
                rules={[{ required: true }]}
              >
                <TimePicker
                  use12Hours
                  format="hh:mm A"
                  style={{ width: "100%" }}
                />
              </Form.Item>
            </Col>

            <Col span={6}>
              <Form.Item
                name="end_punch_to"
                label="End Punch To"
                rules={[{ required: true }]}
              >
                <TimePicker
                  use12Hours
                  format="hh:mm A"
                  style={{ width: "100%" }}
                />
              </Form.Item>
            </Col>
          </Row>

          <Divider orientation="left">Duty Points</Divider>

          <Space direction="vertical" size={14} style={{ width: "100%" }}>
            {dutyPoints.map((point, index) => (
              <Card
                key={point.local_id}
                size="small"
                title={`Duty Point ${index + 1}`}
                extra={
                  dutyPoints.length > 1 ? (
                    <Button
                      type="text"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={() => removeDutyPoint(point.local_id)}
                    />
                  ) : null
                }
              >
                <Input
                  placeholder="Type Duty Point name"
                  value={point.duty_point_name}
                  onChange={(event) =>
                    updateDutyPointName(point.local_id, event.target.value)
                  }
                  style={{ marginBottom: 12 }}
                />

                <Row gutter={[8, 8]}>
                  <Col xs={24} md={7}>
                    <Radio.Group
                      value={employeeTypeByPoint[point.local_id] || "STAFF"}
                      onChange={(event) => {
                        setEmployeeTypeByPoint((old) => ({
                          ...old,
                          [point.local_id]: event.target.value,
                        }));

                        setEmployeeOptions((old) => ({
                          ...old,
                          [point.local_id]: [],
                        }));

                        setStaffStatusByPoint((old) => ({
                          ...old,
                          [point.local_id]: null,
                        }));
                      }}
                    >
                      <Radio.Button value="STAFF">Staff</Radio.Button>
                      <Radio.Button value="TRAINEE">Trainee</Radio.Button>
                    </Radio.Group>
                  </Col>

                  <Col xs={24} md={17}>
                    <Select
                      showSearch
                      filterOption={false}
                      placeholder={
                        (employeeTypeByPoint[point.local_id] || "STAFF") === "STAFF"
                          ? "Search Staff by Name or Belt No."
                          : "Search Trainee"
                      }
                      style={{ width: "100%" }}
                      loading={Boolean(
                        staffStatusLoadingByPoint[point.local_id],
                      )}
                      disabled={Boolean(
                        staffStatusLoadingByPoint[point.local_id],
                      )}
                      onSearch={(value) =>
                        searchEmployee(point.local_id, value)
                      }
                      onSelect={(value) => addEmployee(point.local_id, value)}
                      options={employeeOptions[point.local_id] || []}
                    />
                  </Col>
                </Row>

                {staffStatusByPoint[point.local_id] && (
                  <Alert
                    showIcon
                    style={{ marginTop: 10 }}
                    type={
                      staffStatusByPoint[point.local_id].available
                        ? "success"
                        : staffStatusByPoint[point.local_id].status ===
                            "CHECK_FAILED"
                          ? "error"
                          : "warning"
                    }
                    message={
                      staffStatusByPoint[point.local_id].available
                        ? "Available for Duty"
                        : staffStatusByPoint[point.local_id].status_label ||
                          "Not Available"
                    }
                    description={
                      staffStatusByPoint[point.local_id].description ||
                      (staffStatusByPoint[point.local_id].available
                        ? "Selected Staff member can be assigned to this Duty Roster Shift."
                        : "Selected Staff member has an active exemption for this date / shift.")
                    }
                  />
                )}

                {!!(point.employees || []).length && (
                  <Table
                    style={{ marginTop: 12 }}
                    size="small"
                    rowKey={(employee) => personKey(employee)}
                    pagination={false}
                    dataSource={point.employees}
                    columns={[
                      {
                        title: "Employee",
                        render: (_, employee) => formatPerson(employee, false),
                      },
                      {
                        title: "Weapon",
                        width: 220,
                        render: (_, employee) => (
                          <Input
                            placeholder="Optional weapon"
                            value={employee.weapon}
                            onChange={(event) =>
                              updateWeapon(
                                point.local_id,
                                personKey(employee),
                                event.target.value,
                              )
                            }
                          />
                        ),
                      },
                      {
                        title: "",
                        width: 60,
                        render: (_, employee) => (
                          <Button
                            type="text"
                            danger
                            icon={<DeleteOutlined />}
                            onClick={() =>
                              removeEmployee(
                                point.local_id,
                                personKey(employee),
                              )
                            }
                          />
                        ),
                      },
                    ]}
                  />
                )}
              </Card>
            ))}
          </Space>

          <Button
            block
            type="dashed"
            icon={<PlusOutlined />}
            onClick={addDutyPoint}
            style={{ marginTop: 14 }}
          >
            Add Duty Point
          </Button>
        </Form>
      </Drawer>

      <Drawer
        title="Duty Roster"
        width={1200}
        open={viewOpen}
        onClose={() => setViewOpen(false)}
        extra={
          <Button
            className="no-print"
            icon={<PrinterOutlined />}
            onClick={() => window.print()}
          >
            Print
          </Button>
        }
      >
        {viewingRoster && (
          <div className="duty-roster-print">
            <div style={{ textAlign: "center", marginBottom: 12 }}>
              <Title level={4} style={{ marginBottom: 4 }}>
                Duty Roster Police Training School Farooqabad
              </Title>
              <Text>
                {dayjs(viewingRoster.roster_date).format("DD.MM.YYYY")}
              </Text>
            </div>

            <table className="official-roster-table">
              <thead>
                <tr>
                  <th style={{ width: "25%" }}>Duty Point</th>

                  {SHIFT_OPTIONS.map((option) => {
                    const shift = printShift(viewingRoster, option.value);

                    return (
                      <th key={option.value}>
                        <div>{option.label}</div>
                        <div style={{ marginTop: 3, fontWeight: 400 }}>
                          {shift
                            ? `${displayTime(shift.start_time)} - ${displayTime(
                                shift.end_time,
                              )}`
                            : "-"}
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>

              <tbody>
                {allDutyPoints(viewingRoster).map((pointName) => (
                  <tr key={pointName}>
                    <td>
                      <strong>{pointName}</strong>
                    </td>

                    {SHIFT_OPTIONS.map((option) => {
                      const shift = printShift(viewingRoster, option.value);

                      return (
                        <td key={option.value}>
                          {employeesAt(shift, pointName).map((employee) => (
                            <div
                              className="official-roster-employee"
                              key={personKey(employee)}
                            >
                              {formatPerson(employee)}
                            </div>
                          ))}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>

            <table className="official-roster-notes">
              <tbody>
                {FIXED_URDU_NOTES.map((note, index) => (
                  <tr key={index}>
                    <td
                      style={{
                        width: 40,
                        textAlign: "center",
                        direction: "ltr",
                      }}
                    >
                      {index + 1}
                    </td>
                    <td
                      style={{
                        direction: "rtl",
                        textAlign: "right",
                      }}
                    >
                      {note || " "}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <table className="official-roster-table" style={{ marginTop: 16 }}>
              <tbody>
                <tr>
                  <th>Drill</th>
                  <th>Trainee</th>
                  <th>Weapon Staff</th>
                  <th>Band Staff</th>
                  <th>Other</th>
                  <th>Total SEC</th>
                  <th>DUTY SEC</th>
                  <th>REST/LEAVE</th>
                  <th>Medical+OSD</th>
                  <th>Absent</th>
                </tr>
                <tr>
                  <td>-</td>
                  <td>-</td>
                  <td>-</td>
                  <td>-</td>
                  <td>-</td>
                  <td>{totalAssigned(viewingRoster)}</td>
                  <td>{totalAssigned(viewingRoster)}</td>
                  <td>-</td>
                  <td>-</td>
                  <td>-</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </Drawer>
    </div>
  );
}
