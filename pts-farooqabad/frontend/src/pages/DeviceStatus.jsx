import {
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
  Descriptions,
  Divider,
  Drawer,
  Dropdown,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
  Select,
  Space,
  Statistic,
  Tag,
  Tooltip,
  Typography,
  message,
} from "antd";
import Table from "../components/SerialTable";

import {
  CloudUploadOutlined,
  DatabaseOutlined,
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  MoreOutlined,
  PlusOutlined,
  PoweroffOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  SettingOutlined,
  SyncOutlined,
  UserAddOutlined,
  WarningOutlined,
} from "@ant-design/icons";

import dayjs from "dayjs";

import api from "../services/api";
import {
  useAuth,
} from "../contexts/AuthContext";

const {
  Title,
  Text,
} = Typography;

const DEVICE_ACTIONS = {
  uploadTransactions: {
    path:
      "/biometric/devices/actions/upload-transactions",
    success:
      "Transaction upload command sent successfully.",
  },

  uploadAll: {
    path:
      "/biometric/devices/actions/upload-all",
    success:
      "Upload-all command sent successfully.",
  },

  reboot: {
    path:
      "/biometric/devices/actions/reboot",
    success:
      "Reboot command sent successfully.",
  },

  clearCommand: {
    path:
      "/biometric/devices/actions/clear-command",
    success:
      "Pending command queue cleared successfully.",
  },

  clearCapture: {
    path:
      "/biometric/devices/actions/clear-capture",
    success:
      "Clear-capture command sent successfully.",
  },

  clearAll: {
    path:
      "/biometric/devices/actions/clear-all",
    success:
      "Clear-all command sent successfully.",
  },
};

/*
|--------------------------------------------------------------------------
| ZK FINGER SLOTS
|--------------------------------------------------------------------------
|
| ZKTeco attendance terminals use 0-9 fingerprint slots. Keep the numeric
| value sent to ZKBioTime, but show the same human-readable finger names
| operators see in ZKBioTime instead of asking them to remember an index.
|
|--------------------------------------------------------------------------
*/

const FINGER_OPTIONS = [
  { value: 0, label: "(Left Hand) Little Finger" },
  { value: 1, label: "(Left Hand) Ring Finger" },
  { value: 2, label: "(Left Hand) Middle Finger" },
  { value: 3, label: "(Left Hand) Fore Finger" },
  { value: 4, label: "(Left Hand) Thumb" },
  { value: 5, label: "(Right Hand) Thumb" },
  { value: 6, label: "(Right Hand) Fore Finger" },
  { value: 7, label: "(Right Hand) Middle Finger" },
  { value: 8, label: "(Right Hand) Ring Finger" },
  { value: 9, label: "(Right Hand) Little Finger" },
];

function readValue(
  record,
  keys
) {
  for (const key of keys) {
    if (
      record?.[key] !==
        undefined &&
      record?.[key] !== null &&
      record?.[key] !== ""
    ) {
      return record[key];
    }
  }

  return null;
}

function formatDateTime(
  value
) {
  if (!value) {
    return "-";
  }

  const parsed =
    dayjs(value);

  return parsed.isValid()
    ? parsed.format(
        "DD-MMM-YYYY hh:mm:ss A"
      )
    : String(value);
}

function getOnlineStatus(
  record
) {
  const value =
    readValue(record, [
      "state",
      "status",
      "online",
      "is_online",
      "device_status",
    ]);

  if (
    typeof value ===
    "boolean"
  ) {
    return value;
  }

  const normalized =
    String(value ?? "")
      .trim()
      .toLowerCase();

  if (
    [
      "1",
      "true",
      "online",
      "active",
      "connected",
    ].includes(
      normalized
    )
  ) {
    return true;
  }

  if (
    [
      "0",
      "false",
      "offline",
      "inactive",
      "disconnected",
    ].includes(
      normalized
    )
  ) {
    return false;
  }

  return null;
}

function getDeviceId(
  record
) {
  const value =
    readValue(record, [
      "id",
      "terminal_id",
      "device_id",
      "pk",
    ]);

  const parsed =
    Number(value);

  return Number.isInteger(
    parsed
  ) && parsed > 0
    ? parsed
    : null;
}

function getDeviceName(
  record
) {
  return (
    readValue(record, [
      "alias",
      "terminal_alias",
      "device_name",
      "name",
    ]) ||
    readValue(record, [
      "sn",
      "terminal_sn",
      "serial_number",
    ]) ||
    "Device"
  );
}

function getDeviceSerial(
  record
) {
  return (
    readValue(record, [
      "sn",
      "terminal_sn",
      "serial_number",
    ]) || "-"
  );
}

function getAreaId(
  record
) {
  const area =
    record?.area;

  if (
    area &&
    typeof area ===
      "object"
  ) {
    const value =
      Number(
        area.id ??
          area.pk
      );

    return Number.isInteger(
      value
    ) && value > 0
      ? value
      : null;
  }

  const value =
    Number(
      readValue(record, [
        "area_id",
        "area",
      ])
    );

  return Number.isInteger(
    value
  ) && value > 0
    ? value
    : null;
}

function getAreaText(
  record
) {
  const area =
    record?.area;

  if (
    area &&
    typeof area ===
      "object"
  ) {
    return (
      area.area_name ||
      area.name ||
      area.area_code ||
      (area.id
        ? `Area ${area.id}`
        : "-")
    );
  }

  return (
    readValue(record, [
      "area_alias",
      "area_name",
      "area",
    ]) || "-"
  );
}

function normalizeDeviceList(
  data
) {
  if (
    Array.isArray(data)
  ) {
    return data;
  }

  if (
    Array.isArray(
      data?.data
    )
  ) {
    return data.data;
  }

  if (
    Array.isArray(
      data?.results
    )
  ) {
    return data.results;
  }

  return [];
}

function normalizeEmployeeList(data) {
  if (Array.isArray(data)) {
    return data;
  }

  if (Array.isArray(data?.data)) {
    return data.data;
  }

  if (Array.isArray(data?.results)) {
    return data.results;
  }

  return [];
}

function employeeSearchLabel(employee) {
  const code = String(employee?.emp_code || "-");
  const name = String(
    employee?.name ||
      [employee?.first_name, employee?.last_name]
        .filter(Boolean)
        .join(" ") ||
      ""
  ).trim();
  const department = String(
    employee?.department_name || ""
  ).trim();

  const identity = [code, name, department]
    .filter(Boolean)
    .join(" • ");

  const biometric = [
    `FP: ${employee?.fingerprint ?? "-"}`,
    `Face: ${
      employee?.vl_face ??
      employee?.face ??
      "-"
    }`,
    `Palm: ${employee?.palm ?? "-"}`,
  ].join(" | ");

  return `${identity} — ${biometric}`;
}

function apiErrorMessage(
  error,
  fallback
) {
  const responseError =
    error?.response?.data?.error;

  return (
    error?.response?.data
      ?.message ||
    responseError?.message ||
    (typeof responseError === "string"
      ? responseError
      : null) ||
    error?.message ||
    fallback
  );
}

function parseNumericIds(
  value
) {
  const values =
    String(value || "")
      .split(/[\s,;]+/)
      .map((item) =>
        Number(item)
      )
      .filter(
        (item) =>
          Number.isInteger(
            item
          ) && item > 0
      );

  return [
    ...new Set(values),
  ];
}

function devicePayloadFromForm(
  values
) {
  const payload = {
    sn:
      values.sn?.trim(),
    alias:
      values.alias?.trim(),
    ip_address:
      values.ip_address?.trim(),
  };

  if (
    values.terminal_tz !==
      undefined &&
    values.terminal_tz !==
      null &&
    values.terminal_tz !==
      ""
  ) {
    payload.terminal_tz =
      Number(
        values.terminal_tz
      );
  }

  if (
    values.heartbeat !==
      undefined &&
    values.heartbeat !==
      null &&
    values.heartbeat !==
      ""
  ) {
    payload.heartbeat =
      Number(
        values.heartbeat
      );
  }

  if (
    values.area !==
      undefined &&
    values.area !== null &&
    values.area !== ""
  ) {
    payload.area =
      Number(values.area);
  }

  return payload;
}

function statusTag(
  record
) {
  const online =
    getOnlineStatus(record);

  if (online === true) {
    return (
      <Tag color="green">
        Online
      </Tag>
    );
  }

  if (online === false) {
    return (
      <Tag color="red">
        Offline
      </Tag>
    );
  }

  return <Tag>Unknown</Tag>;
}

export default function DeviceStatus() {
  const {
    hasPermission,
  } = useAuth();

  const canManage =
    hasPermission(
      "devices.manage"
    );

  const [
    loading,
    setLoading,
  ] = useState(false);

  const [
    devices,
    setDevices,
  ] = useState([]);

  const [
    selectedRowKeys,
    setSelectedRowKeys,
  ] = useState([]);

  const [
    selectedRows,
    setSelectedRows,
  ] = useState([]);

  const [
    commandLoading,
    setCommandLoading,
  ] = useState(false);

  const [
    detailsOpen,
    setDetailsOpen,
  ] = useState(false);

  const [
    detailsLoading,
    setDetailsLoading,
  ] = useState(false);

  const [
    detailsRecord,
    setDetailsRecord,
  ] = useState(null);

  const [
    deviceModalOpen,
    setDeviceModalOpen,
  ] = useState(false);

  const [
    deviceModalMode,
    setDeviceModalMode,
  ] = useState("create");

  const [
    deviceModalRecord,
    setDeviceModalRecord,
  ] = useState(null);

  const [
    deviceSaving,
    setDeviceSaving,
  ] = useState(false);

  const [
    deviceForm,
  ] = Form.useForm();

  const [
    enrollOpen,
    setEnrollOpen,
  ] = useState(false);

  const [
    enrollRecord,
    setEnrollRecord,
  ] = useState(null);

  const [
    enrollSaving,
    setEnrollSaving,
  ] = useState(false);

  const [
    enrollForm,
  ] = Form.useForm();

  const [
    resyncOpen,
    setResyncOpen,
  ] = useState(false);

  const [
    resyncSaving,
    setResyncSaving,
  ] = useState(false);

  const [
    resyncForm,
  ] = Form.useForm();

  const [
    templateOpen,
    setTemplateOpen,
  ] = useState(false);

  const [
    templateSaving,
    setTemplateSaving,
  ] = useState(false);

  const [
    templateForm,
  ] = Form.useForm();

  const [
    employeeOptions,
    setEmployeeOptions,
  ] = useState([]);

  const [
    employeeSearchLoading,
    setEmployeeSearchLoading,
  ] = useState(false);

  const employeeSearchTimerRef =
    useRef(null);

  const employeeSearchRequestRef =
    useRef(0);

  const searchEmployees =
    async (search = "") => {
      const requestId =
        employeeSearchRequestRef.current + 1;

      employeeSearchRequestRef.current =
        requestId;

      setEmployeeSearchLoading(true);

      try {
        const response = await api.get(
          "/biometric/devices/employees/search",
          {
            params: {
              q: String(search || "").trim(),
              page_size: 30,
            },
          }
        );

        if (
          requestId !==
          employeeSearchRequestRef.current
        ) {
          return;
        }

        const incoming =
          normalizeEmployeeList(
            response.data?.data
          );

        setEmployeeOptions(
          (current) => {
            const map = new Map();

            [
              ...current,
              ...incoming,
            ].forEach(
              (employee) => {
                const key =
                  Number(
                    employee?.id
                  ) > 0
                    ? `ID:${employee.id}`
                    : employee?.emp_code
                    ? `CODE:${employee.emp_code}`
                    : null;

                if (key) {
                  map.set(
                    key,
                    employee
                  );
                }
              }
            );

            return [
              ...map.values(),
            ];
          }
        );
      } catch (error) {
        if (
          requestId ===
          employeeSearchRequestRef.current
        ) {
          message.error(
            apiErrorMessage(
              error,
              "Could not search ZKBioTime employees."
            )
          );
        }
      } finally {
        if (
          requestId ===
          employeeSearchRequestRef.current
        ) {
          setEmployeeSearchLoading(false);
        }
      }
    };

  const queueEmployeeSearch =
    (value) => {
      if (employeeSearchTimerRef.current) {
        clearTimeout(
          employeeSearchTimerRef.current
        );
      }

      const normalized =
        String(value || "").trim();

      /*
      | One-character searches create noisy, low-value requests while the
      | operator is still typing. Blank is still allowed for initial list.
      */
      if (normalized && normalized.length < 2) {
        return;
      }

      employeeSearchTimerRef.current =
        setTimeout(
          () => searchEmployees(normalized),
          450
        );
    };

  const prepareEmployeeSearch =
    () => {
      setEmployeeOptions([]);
      searchEmployees("");
    };

  const loadDevices =
    async () => {
      setLoading(true);

      try {
        const response =
          await api.get(
            "/biometric/devices"
          );

        setDevices(
          normalizeDeviceList(
            response.data?.data
          )
        );

        setSelectedRowKeys(
          []
        );
        setSelectedRows([]);
      } catch (error) {
        message.error(
          apiErrorMessage(
            error,
            "Could not load ZKBioTime devices."
          )
        );
      } finally {
        setLoading(false);
      }
    };

  useEffect(() => {
    loadDevices();
  }, []);

  useEffect(
    () => () => {
      if (employeeSearchTimerRef.current) {
        clearTimeout(
          employeeSearchTimerRef.current
        );
      }
    },
    []
  );

  const statistics =
    useMemo(() => {
      let online = 0;
      let offline = 0;
      let unknown = 0;

      devices.forEach(
        (record) => {
          const status =
            getOnlineStatus(
              record
            );

          if (
            status === true
          ) {
            online += 1;
          } else if (
            status === false
          ) {
            offline += 1;
          } else {
            unknown += 1;
          }
        }
      );

      return {
        total:
          devices.length,
        online,
        offline,
        unknown,
      };
    }, [devices]);

  const selectedDeviceIds =
    useMemo(
      () =>
        selectedRows
          .map(
            getDeviceId
          )
          .filter(Boolean),
      [selectedRows]
    );

  const runTerminalAction =
    async (
      actionKey,
      ids,
      {
        refresh = true,
      } = {}
    ) => {
      const action =
        DEVICE_ACTIONS[
          actionKey
        ];

      if (!action) {
        return;
      }

      if (
        !Array.isArray(ids) ||
        !ids.length
      ) {
        message.warning(
          "Select at least one valid device."
        );
        return;
      }

      setCommandLoading(true);

      try {
        const response =
          await api.post(
            action.path,
            {
              terminals:
                ids,
            }
          );

        message.success(
          response.data
            ?.message ||
            action.success
        );

        if (refresh) {
          await loadDevices();
        }
      } catch (error) {
        message.error(
          apiErrorMessage(
            error,
            "Device command failed."
          )
        );
      } finally {
        setCommandLoading(
          false
        );
      }
    };

  const confirmTerminalAction =
    ({
      title,
      content,
      actionKey,
      ids,
      danger = false,
      okText = "Confirm",
    }) => {
      Modal.confirm({
        title,
        content,
        okText,
        cancelText:
          "Cancel",
        okButtonProps:
          danger
            ? {
                danger: true,
              }
            : undefined,
        onOk: () =>
          runTerminalAction(
            actionKey,
            ids
          ),
      });
    };

  const openDetails =
    async (record) => {
      const id =
        getDeviceId(record);

      setDetailsRecord(
        record
      );
      setDetailsOpen(true);

      if (!id) {
        return;
      }

      setDetailsLoading(true);

      try {
        const response =
          await api.get(
            `/biometric/devices/${id}`
          );

        setDetailsRecord(
          response.data?.data ||
            record
        );
      } catch (error) {
        message.error(
          apiErrorMessage(
            error,
            "Could not load device details."
          )
        );
      } finally {
        setDetailsLoading(
          false
        );
      }
    };

  const openCreateDevice =
    () => {
      setDeviceModalMode(
        "create"
      );
      setDeviceModalRecord(
        null
      );
      deviceForm.resetFields();
      deviceForm.setFieldsValue({
        heartbeat: 10,
      });
      setDeviceModalOpen(
        true
      );
    };

  const openEditDevice =
    (record) => {
      setDeviceModalMode(
        "edit"
      );
      setDeviceModalRecord(
        record
      );

      deviceForm.setFieldsValue({
        sn:
          getDeviceSerial(
            record
          ) === "-"
            ? undefined
            : getDeviceSerial(
                record
              ),
        alias:
          getDeviceName(
            record
          ),
        ip_address:
          readValue(
            record,
            [
              "ip_address",
              "ip",
              "terminal_ip",
            ]
          ),
        terminal_tz:
          readValue(
            record,
            [
              "terminal_tz",
            ]
          ),
        heartbeat:
          readValue(
            record,
            ["heartbeat"]
          ),
        area:
          getAreaId(
            record
          ),
      });

      setDeviceModalOpen(
        true
      );
    };

  const saveDevice =
    async () => {
      try {
        const values =
          await deviceForm.validateFields();

        const payload =
          devicePayloadFromForm(
            values
          );

        setDeviceSaving(true);

        if (
          deviceModalMode ===
          "create"
        ) {
          const response =
            await api.post(
              "/biometric/devices",
              payload
            );

          message.success(
            response.data
              ?.message ||
              "Device created successfully."
          );
        } else {
          const id =
            getDeviceId(
              deviceModalRecord
            );

          if (!id) {
            throw new Error(
              "Valid device ID is required for update."
            );
          }

          const response =
            await api.put(
              `/biometric/devices/${id}`,
              payload
            );

          message.success(
            response.data
              ?.message ||
              "Device updated successfully."
          );
        }

        setDeviceModalOpen(
          false
        );
        await loadDevices();
      } catch (error) {
        if (
          error?.errorFields
        ) {
          return;
        }

        message.error(
          apiErrorMessage(
            error,
            "Could not save device."
          )
        );
      } finally {
        setDeviceSaving(false);
      }
    };

  const deleteDevice =
    (record) => {
      const id =
        getDeviceId(record);

      if (!id) {
        message.error(
          "Valid device ID is required."
        );
        return;
      }

      Modal.confirm({
        title:
          `Delete ${getDeviceName(
            record
          )}?`,
        icon:
          <WarningOutlined />,
        content:
          "This removes the terminal record from ZKBioTime. It does not represent a normal temporary offline state.",
        okText:
          "Delete Device",
        okButtonProps: {
          danger: true,
        },
        cancelText:
          "Cancel",
        onOk:
          async () => {
            try {
              const response =
                await api.delete(
                  `/biometric/devices/${id}`
                );

              message.success(
                response.data
                  ?.message ||
                  "Device deleted successfully."
              );

              await loadDevices();
            } catch (error) {
              message.error(
                apiErrorMessage(
                  error,
                  "Could not delete device."
                )
              );
            }
          },
      });
    };

  const openRemoteEnroll =
    (record) => {
      const id =
        getDeviceId(record);

      if (!id) {
        message.error(
          "Valid device ID is required for remote enrollment."
        );
        return;
      }

      setEnrollRecord(record);
      enrollForm.resetFields();
      enrollForm.setFieldsValue({
        bio_type: "1",
        finger: 6,
      });
      prepareEmployeeSearch();
      setEnrollOpen(true);
    };

  const submitRemoteEnroll =
    async () => {
      try {
        const values =
          await enrollForm.validateFields();

        const id =
          getDeviceId(
            enrollRecord
          );

        if (!id) {
          throw new Error(
            "Valid device ID is required for remote enrollment."
          );
        }

        setEnrollSaving(true);

        const payload = {
          emp_code:
            values.emp_code.trim(),
          bio_type:
            values.bio_type,
          finger:
            values.bio_type ===
            "1"
              ? Number(
                  values.finger
                )
              : 0,
        };

        const response =
          await api.post(
            `/biometric/devices/${id}/actions/enroll-remotely`,
            payload
          );

        message.success(
          response.data
            ?.message ||
            "Remote enrollment command sent successfully."
        );

        setEnrollOpen(false);
      } catch (error) {
        if (
          error?.errorFields
        ) {
          return;
        }

        message.error(
          apiErrorMessage(
            error,
            "Remote enrollment command failed."
          )
        );
      } finally {
        setEnrollSaving(false);
      }
    };

  const submitEmployeeResync =
    async () => {
      try {
        const values =
          await resyncForm.validateFields();

        const employees =
          (Array.isArray(
            values.employee_ids
          )
            ? values.employee_ids
            : []
          )
            .map(Number)
            .filter(
              (id) =>
                Number.isInteger(id) &&
                id > 0
            );

        if (!employees.length) {
          message.error(
            "Select at least one ZKBioTime employee."
          );
          return;
        }

        setResyncSaving(true);

        const response =
          await api.post(
            "/biometric/devices/actions/resync-employees",
            {
              employees,
            }
          );

        message.success(
          response.data
            ?.message ||
            "Employee resync command sent successfully."
        );

        setResyncOpen(false);
        resyncForm.resetFields();
      } catch (error) {
        if (
          error?.errorFields
        ) {
          return;
        }

        message.error(
          apiErrorMessage(
            error,
            "Employee resync failed."
          )
        );
      } finally {
        setResyncSaving(false);
      }
    };

  const submitTemplateDelete =
    async () => {
      try {
        const values =
          await templateForm.validateFields();

        const employees =
          (Array.isArray(
            values.employee_ids
          )
            ? values.employee_ids
            : []
          )
            .map(Number)
            .filter(
              (id) =>
                Number.isInteger(id) &&
                id > 0
            );

        if (!employees.length) {
          message.error(
            "Select at least one ZKBioTime employee."
          );
          return;
        }

        const selectedTypes =
          Array.isArray(
            values.template_types
          )
            ? values.template_types
            : [];

        if (!selectedTypes.length) {
          message.error(
            "Select at least one biometric template type."
          );
          return;
        }

        Modal.confirm({
          title:
            "Delete biometric templates?",
          icon:
            <WarningOutlined />,
          content:
            "Selected templates will be deleted through ZKBioTime. This action should only be used when biometric re-enrollment is intended.",
          okText:
            "Delete Templates",
          okButtonProps: {
            danger: true,
          },
          cancelText:
            "Cancel",
          onOk:
            async () => {
              setTemplateSaving(
                true
              );

              try {
                const response =
                  await api.post(
                    "/biometric/devices/actions/delete-biometric-templates",
                    {
                      employees,
                      finger_print:
                        selectedTypes.includes(
                          "finger_print"
                        ),
                      face:
                        selectedTypes.includes(
                          "face"
                        ),
                      finger_vein:
                        selectedTypes.includes(
                          "finger_vein"
                        ),
                      palm:
                        selectedTypes.includes(
                          "palm"
                        ),
                    }
                  );

                message.success(
                  response.data
                    ?.message ||
                    "Biometric templates deleted successfully."
                );

                setTemplateOpen(
                  false
                );
                templateForm.resetFields();
              } catch (error) {
                message.error(
                  apiErrorMessage(
                    error,
                    "Could not delete biometric templates."
                  )
                );

                throw error;
              } finally {
                setTemplateSaving(
                  false
                );
              }
            },
        });
      } catch (error) {
        if (
          error?.errorFields
        ) {
          return;
        }
      }
    };

  const deviceMenuItems =
    (record) => {
      const id =
        getDeviceId(record);

      const items = [
        {
          key: "details",
          icon:
            <EyeOutlined />,
          label:
            "View Details",
        },
      ];

      if (!canManage) {
        return items;
      }

      items.push(
        {
          type: "divider",
        },
        {
          key: "edit",
          icon:
            <EditOutlined />,
          label:
            "Edit Device",
        },
        {
          key: "enroll",
          icon:
            <UserAddOutlined />,
          label:
            "Enroll Remotely",
          disabled: !id,
        },
        {
          type: "divider",
        },
        {
          key:
            "upload-transactions",
          icon:
            <CloudUploadOutlined />,
          label:
            "Upload Transactions",
          disabled: !id,
        },
        {
          key: "upload-all",
          icon:
            <CloudUploadOutlined />,
          label:
            "Upload All",
          disabled: !id,
        },
        {
          key: "reboot",
          icon:
            <PoweroffOutlined />,
          label:
            "Reboot Device",
          disabled: !id,
        },
        {
          type: "divider",
        },
        {
          key: "clear-command",
          icon:
            <SettingOutlined />,
          label:
            "Clear Command Queue",
          disabled: !id,
        },
        {
          key: "clear-capture",
          icon:
            <DatabaseOutlined />,
          label:
            "Clear Capture",
          disabled: !id,
        },
        {
          key: "clear-all",
          icon:
            <WarningOutlined />,
          label:
            "Clear All",
          danger: true,
          disabled: !id,
        },
        {
          type: "divider",
        },
        {
          key: "delete",
          icon:
            <DeleteOutlined />,
          label:
            "Delete Device",
          danger: true,
          disabled: !id,
        }
      );

      return items;
    };

  const handleDeviceMenu =
    (record, key) => {
      const id =
        getDeviceId(record);

      if (
        key === "details"
      ) {
        openDetails(record);
        return;
      }

      if (
        key === "edit"
      ) {
        openEditDevice(
          record
        );
        return;
      }

      if (
        key === "enroll"
      ) {
        openRemoteEnroll(
          record
        );
        return;
      }

      if (
        key === "delete"
      ) {
        deleteDevice(record);
        return;
      }

      if (!id) {
        message.error(
          "Valid device ID is required."
        );
        return;
      }

      const ids = [id];
      const name =
        getDeviceName(
          record
        );

      if (
        key ===
        "upload-transactions"
      ) {
        confirmTerminalAction({
          title:
            "Upload transactions?",
          content:
            `Request ${name} to upload its transactions to ZKBioTime.`,
          actionKey:
            "uploadTransactions",
          ids,
          okText:
            "Upload Transactions",
        });
        return;
      }

      if (
        key === "upload-all"
      ) {
        confirmTerminalAction({
          title:
            "Upload all device data?",
          content:
            `Request ${name} to upload all supported data to ZKBioTime.`,
          actionKey:
            "uploadAll",
          ids,
          okText:
            "Upload All",
        });
        return;
      }

      if (key === "reboot") {
        confirmTerminalAction({
          title:
            "Reboot device?",
          content:
            `${name} will restart after the command reaches the terminal.`,
          actionKey:
            "reboot",
          ids,
          okText:
            "Reboot",
        });
        return;
      }

      if (
        key ===
        "clear-command"
      ) {
        confirmTerminalAction({
          title:
            "Clear pending commands?",
          content:
            `Clear the pending ZKBioTime command queue for ${name}.`,
          actionKey:
            "clearCommand",
          ids,
          okText:
            "Clear Commands",
        });
        return;
      }

      if (
        key ===
        "clear-capture"
      ) {
        confirmTerminalAction({
          title:
            "Clear capture data?",
          content:
            `Send the clear-capture command to ${name}.`,
          actionKey:
            "clearCapture",
          ids,
          danger: true,
          okText:
            "Clear Capture",
        });
        return;
      }

      if (key === "clear-all") {
        confirmTerminalAction({
          title:
            "Clear all device data?",
          content:
            `This is a destructive terminal command for ${name}. Use it only when you intentionally want ZKBioTime to issue Clear All to this device.`,
          actionKey:
            "clearAll",
          ids,
          danger: true,
          okText:
            "Clear All",
        });
      }
    };

  const batchMenuItems = [
    {
      key:
        "upload-transactions",
      icon:
        <CloudUploadOutlined />,
      label:
        "Upload Transactions",
    },
    {
      key: "upload-all",
      icon:
        <CloudUploadOutlined />,
      label:
        "Upload All",
    },
    {
      key: "reboot",
      icon:
        <PoweroffOutlined />,
      label:
        "Reboot",
    },
    {
      type: "divider",
    },
    {
      key: "clear-command",
      icon:
        <SettingOutlined />,
      label:
        "Clear Commands",
    },
    {
      key: "clear-capture",
      icon:
        <DatabaseOutlined />,
      label:
        "Clear Capture",
      danger: true,
    },
    {
      key: "clear-all",
      icon:
        <WarningOutlined />,
      label:
        "Clear All",
      danger: true,
    },
  ];

  const handleBatchAction =
    (key) => {
      if (
        !selectedDeviceIds.length
      ) {
        message.warning(
          "Select at least one device."
        );
        return;
      }

      const count =
        selectedDeviceIds.length;

      const configs = {
        "upload-transactions": {
          title:
            "Upload transactions?",
          content:
            `Send transaction upload command to ${count} selected device(s).`,
          actionKey:
            "uploadTransactions",
          okText:
            "Upload Transactions",
        },
        "upload-all": {
          title:
            "Upload all device data?",
          content:
            `Send upload-all command to ${count} selected device(s).`,
          actionKey:
            "uploadAll",
          okText:
            "Upload All",
        },
        reboot: {
          title:
            "Reboot selected devices?",
          content:
            `${count} selected device(s) will restart after receiving the command.`,
          actionKey:
            "reboot",
          okText:
            "Reboot",
        },
        "clear-command": {
          title:
            "Clear pending commands?",
          content:
            `Clear pending ZKBioTime commands for ${count} selected device(s).`,
          actionKey:
            "clearCommand",
          okText:
            "Clear Commands",
        },
        "clear-capture": {
          title:
            "Clear capture data?",
          content:
            `Send clear-capture to ${count} selected device(s).`,
          actionKey:
            "clearCapture",
          okText:
            "Clear Capture",
          danger: true,
        },
        "clear-all": {
          title:
            "Clear all selected devices?",
          content:
            `This sends the destructive Clear All command to ${count} selected device(s).`,
          actionKey:
            "clearAll",
          okText:
            "Clear All",
          danger: true,
        },
      };

      const config =
        configs[key];

      if (!config) {
        return;
      }

      confirmTerminalAction({
        ...config,
        ids:
          selectedDeviceIds,
      });
    };

  const columns = [
    {
      title: "Device",
      width: 220,
      fixed: "left",
      render: (_, record) => (
        <Space
          direction="vertical"
          size={0}
        >
          <Text strong>
            {getDeviceName(
              record
            )}
          </Text>
          <Text
            type="secondary"
            style={{
              fontSize: 12,
            }}
          >
            ID: {getDeviceId(
              record
            ) || "-"}
          </Text>
        </Space>
      ),
    },
    {
      title:
        "Serial Number",
      width: 180,
      render: (_, record) =>
        getDeviceSerial(
          record
        ),
    },
    {
      title:
        "IP Address",
      width: 160,
      render: (_, record) =>
        readValue(record, [
          "ip_address",
          "ip",
          "terminal_ip",
        ]) || "-",
    },
    {
      title: "Status",
      width: 120,
      align: "center",
      render: (_, record) =>
        statusTag(record),
    },
    {
      title: "Area",
      width: 180,
      render: (_, record) =>
        getAreaText(
          record
        ),
    },
    {
      title:
        "Last Activity",
      width: 210,
      render: (_, record) =>
        formatDateTime(
          readValue(record, [
            "last_activity",
            "last_activity_time",
            "last_online_time",
            "last_update",
            "update_time",
          ])
        ),
    },
    {
      title: "Users",
      width: 90,
      align: "right",
      render: (_, record) =>
        readValue(record, [
          "user_count",
        ]) ?? "-",
    },
    {
      title:
        "Fingerprints",
      width: 110,
      align: "right",
      render: (_, record) =>
        readValue(record, [
          "fp_count",
        ]) ?? "-",
    },
    {
      title: "Faces",
      width: 90,
      align: "right",
      render: (_, record) =>
        readValue(record, [
          "face_count",
        ]) ?? "-",
    },
    {
      title:
        "Transactions",
      width: 120,
      align: "right",
      render: (_, record) =>
        readValue(record, [
          "transaction_count",
        ]) ?? "-",
    },
    {
      title: "Firmware",
      width: 180,
      render: (_, record) =>
        readValue(record, [
          "firmware",
          "firmware_version",
          "fw_ver",
        ]) || "-",
    },
    {
      title: "Actions",
      width: 110,
      fixed: "right",
      align: "center",
      render: (_, record) => (
        <Dropdown
          trigger={[
            "click",
          ]}
          menu={{
            items:
              deviceMenuItems(
                record
              ),
            onClick: ({
              key,
            }) =>
              handleDeviceMenu(
                record,
                key
              ),
          }}
        >
          <Button
            icon={
              <MoreOutlined />
            }
          >
            Actions
          </Button>
        </Dropdown>
      ),
    },
  ];

  const enrollBioType =
    Form.useWatch(
      "bio_type",
      enrollForm
    );

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent:
            "space-between",
          alignItems:
            "flex-start",
          gap: 16,
          flexWrap: "wrap",
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
            ZKBioTime Device
            Management
          </Title>

          <Text type="secondary">
            Device status,
            commands, remote
            enrollment and
            biometric maintenance
            from one page.
          </Text>
        </div>

        <Space wrap>
          {canManage && (
            <>
              <Button
                icon={
                  <SyncOutlined />
                }
                onClick={() => {
                  resyncForm.resetFields();
                  prepareEmployeeSearch();
                  setResyncOpen(
                    true
                  );
                }}
              >
                Resync Employee
              </Button>

              <Button
                danger
                icon={
                  <SafetyCertificateOutlined />
                }
                onClick={() => {
                  templateForm.resetFields();
                  prepareEmployeeSearch();
                  setTemplateOpen(
                    true
                  );
                }}
              >
                Delete Template
              </Button>

              <Button
                type="primary"
                icon={
                  <PlusOutlined />
                }
                onClick={
                  openCreateDevice
                }
              >
                Add Device
              </Button>
            </>
          )}

          <Button
            icon={
              <ReloadOutlined />
            }
            loading={loading}
            onClick={loadDevices}
          >
            Refresh Devices
          </Button>
        </Space>
      </div>

      <Row
        gutter={[
          12,
          12,
        ]}
        style={{
          marginBottom: 16,
        }}
      >
        <Col
          xs={12}
          sm={12}
          md={6}
        >
          <Card size="small">
            <Statistic
              title="Total Devices"
              value={
                statistics.total
              }
            />
          </Card>
        </Col>

        <Col
          xs={12}
          sm={12}
          md={6}
        >
          <Card size="small">
            <Statistic
              title="Online"
              value={
                statistics.online
              }
            />
          </Card>
        </Col>

        <Col
          xs={12}
          sm={12}
          md={6}
        >
          <Card size="small">
            <Statistic
              title="Offline"
              value={
                statistics.offline
              }
            />
          </Card>
        </Col>

        <Col
          xs={12}
          sm={12}
          md={6}
        >
          <Card size="small">
            <Statistic
              title="Unknown"
              value={
                statistics.unknown
              }
            />
          </Card>
        </Col>
      </Row>

      {canManage &&
        selectedDeviceIds.length >
          0 && (
          <Card
            size="small"
            style={{
              marginBottom: 12,
            }}
          >
            <Space wrap>
              <Text strong>
                {
                  selectedDeviceIds.length
                }{" "}
                device(s) selected
              </Text>

              <Dropdown
                menu={{
                  items:
                    batchMenuItems,
                  onClick: ({
                    key,
                  }) =>
                    handleBatchAction(
                      key
                    ),
                }}
              >
                <Button
                  loading={
                    commandLoading
                  }
                  icon={
                    <SettingOutlined />
                  }
                >
                  Batch Actions
                </Button>
              </Dropdown>

              <Button
                onClick={() => {
                  setSelectedRowKeys(
                    []
                  );
                  setSelectedRows(
                    []
                  );
                }}
              >
                Clear Selection
              </Button>
            </Space>
          </Card>
        )}

      <Card>
        <Table
          rowKey={(record) =>
            getDeviceId(
              record
            ) ||
            getDeviceSerial(
              record
            )
          }
          loading={loading}
          columns={columns}
          dataSource={devices}
          scroll={{
            x: 1850,
          }}
          rowSelection={
            canManage
              ? {
                  selectedRowKeys,
                  onChange: (
                    keys,
                    rows
                  ) => {
                    setSelectedRowKeys(
                      keys
                    );
                    setSelectedRows(
                      rows
                    );
                  },
                  getCheckboxProps:
                    (record) => ({
                      disabled:
                        !getDeviceId(
                          record
                        ),
                    }),
                }
              : undefined
          }
          pagination={{
            pageSize: 25,
            showSizeChanger:
              true,
            showTotal: (
              total
            ) =>
              `Total ${total} devices`,
          }}
        />
      </Card>

      <Drawer
        title="Device Details"
        open={detailsOpen}
        width={620}
        onClose={() =>
          setDetailsOpen(false)
        }
        loading={
          detailsLoading
        }
        extra={
          canManage &&
          detailsRecord ? (
            <Space>
              <Button
                icon={
                  <EditOutlined />
                }
                onClick={() => {
                  setDetailsOpen(
                    false
                  );
                  openEditDevice(
                    detailsRecord
                  );
                }}
              >
                Edit
              </Button>

              <Button
                type="primary"
                icon={
                  <UserAddOutlined />
                }
                onClick={() => {
                  setDetailsOpen(
                    false
                  );
                  openRemoteEnroll(
                    detailsRecord
                  );
                }}
              >
                Enroll Remotely
              </Button>
            </Space>
          ) : null
        }
      >
        {detailsRecord && (
          <>
            <Space
              direction="vertical"
              size={4}
              style={{
                marginBottom: 16,
              }}
            >
              <Title
                level={4}
                style={{
                  margin: 0,
                }}
              >
                {getDeviceName(
                  detailsRecord
                )}
              </Title>

              <Space>
                {statusTag(
                  detailsRecord
                )}
                <Text type="secondary">
                  {getDeviceSerial(
                    detailsRecord
                  )}
                </Text>
              </Space>
            </Space>

            <Descriptions
              bordered
              size="small"
              column={1}
            >
              <Descriptions.Item label="ZKBioTime ID">
                {getDeviceId(
                  detailsRecord
                ) || "-"}
              </Descriptions.Item>

              <Descriptions.Item label="Serial Number">
                {getDeviceSerial(
                  detailsRecord
                )}
              </Descriptions.Item>

              <Descriptions.Item label="IP Address">
                {readValue(
                  detailsRecord,
                  [
                    "ip_address",
                    "ip",
                    "terminal_ip",
                  ]
                ) || "-"}
              </Descriptions.Item>

              <Descriptions.Item label="Area">
                {getAreaText(
                  detailsRecord
                )}
              </Descriptions.Item>

              <Descriptions.Item label="Firmware">
                {readValue(
                  detailsRecord,
                  [
                    "fw_ver",
                    "firmware",
                    "firmware_version",
                  ]
                ) || "-"}
              </Descriptions.Item>

              <Descriptions.Item label="Push Version">
                {readValue(
                  detailsRecord,
                  ["push_ver"]
                ) || "-"}
              </Descriptions.Item>

              <Descriptions.Item label="Terminal TZ">
                {readValue(
                  detailsRecord,
                  [
                    "terminal_tz",
                  ]
                ) ?? "-"}
              </Descriptions.Item>

              <Descriptions.Item label="Last Activity">
                {formatDateTime(
                  readValue(
                    detailsRecord,
                    [
                      "last_activity",
                      "last_activity_time",
                      "last_online_time",
                      "last_update",
                      "update_time",
                    ]
                  )
                )}
              </Descriptions.Item>

              <Descriptions.Item label="Users">
                {readValue(
                  detailsRecord,
                  ["user_count"]
                ) ?? "-"}
              </Descriptions.Item>

              <Descriptions.Item label="Fingerprints">
                {readValue(
                  detailsRecord,
                  ["fp_count"]
                ) ?? "-"}
              </Descriptions.Item>

              <Descriptions.Item label="Faces">
                {readValue(
                  detailsRecord,
                  ["face_count"]
                ) ?? "-"}
              </Descriptions.Item>

              <Descriptions.Item label="Palms">
                {readValue(
                  detailsRecord,
                  ["palm_count"]
                ) ?? "-"}
              </Descriptions.Item>

              <Descriptions.Item label="Transactions">
                {readValue(
                  detailsRecord,
                  [
                    "transaction_count",
                  ]
                ) ?? "-"}
              </Descriptions.Item>

              <Descriptions.Item label="Push Time">
                {readValue(
                  detailsRecord,
                  ["push_time"]
                ) || "-"}
              </Descriptions.Item>

              <Descriptions.Item label="Transfer Time">
                {readValue(
                  detailsRecord,
                  [
                    "transfer_time",
                  ]
                ) || "-"}
              </Descriptions.Item>

              <Descriptions.Item label="Transfer Interval">
                {readValue(
                  detailsRecord,
                  [
                    "transfer_interval",
                  ]
                ) ?? "-"}
              </Descriptions.Item>
            </Descriptions>
          </>
        )}
      </Drawer>

      <Modal
        title={
          deviceModalMode ===
          "create"
            ? "Add ZKBioTime Device"
            : "Edit ZKBioTime Device"
        }
        open={deviceModalOpen}
        onCancel={() =>
          setDeviceModalOpen(
            false
          )
        }
        onOk={saveDevice}
        okText={
          deviceModalMode ===
          "create"
            ? "Add Device"
            : "Save Changes"
        }
        confirmLoading={
          deviceSaving
        }
        destroyOnClose={false}
      >
        <Alert
          type="info"
          showIcon
          style={{
            marginBottom: 16,
          }}
          message="This form writes directly to the ZKBioTime terminal registry through the PTS backend."
        />

        <Form
          form={deviceForm}
          layout="vertical"
        >
          <Form.Item
            name="sn"
            label="Serial Number"
            rules={[
              {
                required: true,
                whitespace: true,
                message:
                  "Serial number is required.",
              },
            ]}
          >
            <Input placeholder="Device serial number" />
          </Form.Item>

          <Form.Item
            name="alias"
            label="Device Name / Alias"
            rules={[
              {
                required: true,
                whitespace: true,
                message:
                  "Device name is required.",
              },
            ]}
          >
            <Input placeholder="PTS Main Gate" />
          </Form.Item>

          <Form.Item
            name="ip_address"
            label="IP Address"
            rules={[
              {
                required: true,
                whitespace: true,
                message:
                  "IP address is required.",
              },
            ]}
          >
            <Input placeholder="192.168.1.201" />
          </Form.Item>

          <Row gutter={12}>
            <Col span={8}>
              <Form.Item
                name="terminal_tz"
                label="Terminal TZ"
              >
                <InputNumber
                  style={{
                    width: "100%",
                  }}
                  placeholder="Optional"
                />
              </Form.Item>
            </Col>

            <Col span={8}>
              <Form.Item
                name="heartbeat"
                label="Heartbeat"
              >
                <InputNumber
                  min={1}
                  style={{
                    width: "100%",
                  }}
                  placeholder="10"
                />
              </Form.Item>
            </Col>

            <Col span={8}>
              <Form.Item
                name="area"
                label="Area ID"
              >
                <InputNumber
                  min={1}
                  style={{
                    width: "100%",
                  }}
                  placeholder="Optional"
                />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

      <Modal
        title="Enroll Remotely"
        open={enrollOpen}
        onCancel={() =>
          setEnrollOpen(false)
        }
        onOk={
          submitRemoteEnroll
        }
        okText="Send Enrollment Command"
        confirmLoading={
          enrollSaving
        }
      >
        <Alert
          type="info"
          showIcon
          style={{
            marginBottom: 16,
          }}
          message={
            enrollRecord
              ? `${getDeviceName(
                  enrollRecord
                )} • ${getDeviceSerial(
                  enrollRecord
                )}`
              : "Selected device"
          }
          description="The terminal will open its biometric enrollment workflow after ZKBioTime accepts the command."
        />

        <Form
          form={enrollForm}
          layout="vertical"
        >
          <Form.Item
            name="emp_code"
            label="Employee / Cap No."
            rules={[
              {
                required: true,
                message:
                  "Select an employee.",
              },
            ]}
          >
            <Select
              showSearch
              allowClear
              filterOption={false}
              onSearch={
                queueEmployeeSearch
              }
              onFocus={() => {
                if (!employeeOptions.length) {
                  searchEmployees("");
                }
              }}
              loading={
                employeeSearchLoading
              }
              placeholder="Search by Cap No., employee code or name"
              options={
                employeeOptions
                  .filter(
                    (employee) =>
                      employee?.emp_code
                  )
                  .map(
                    (employee) => ({
                      value: String(
                        employee.emp_code
                      ),
                      label:
                        employeeSearchLabel(
                          employee
                        ),
                    })
                  )
              }
            />
          </Form.Item>

          <Form.Item
            name="bio_type"
            label="Biometric Type"
            rules={[
              {
                required: true,
              },
            ]}
          >
            <Select
              options={[
                {
                  value: "1",
                  label:
                    "Fingerprint",
                },
                {
                  value: "2",
                  label:
                    "VL Face",
                },
              ]}
            />
          </Form.Item>

          {enrollBioType ===
            "1" && (
            <Form.Item
              name="finger"
              label="Finger"
              extra="Select the finger by name. PTS sends the matching ZKTeco finger slot automatically."
              rules={[
                {
                  required: true,
                  message:
                    "Finger is required.",
                },
              ]}
            >
              <Select
                options={
                  FINGER_OPTIONS
                }
                placeholder="Select finger"
              />
            </Form.Item>
          )}
        </Form>
      </Modal>

      <Modal
        title="Re-synchronize Employee to Device"
        open={resyncOpen}
        onCancel={() =>
          setResyncOpen(false)
        }
        onOk={
          submitEmployeeResync
        }
        okText="Re-synchronize"
        confirmLoading={
          resyncSaving
        }
      >
        <Alert
          type="info"
          showIcon
          style={{
            marginBottom: 16,
          }}
          message="ZKBioTime re-synchronizes selected employee records to the devices assigned through their areas."
        />

        <Form
          form={resyncForm}
          layout="vertical"
        >
          <Form.Item
            name="employee_ids"
            label="Employees"
            extra="Search by Cap No., employee code or name. PTS resolves the internal ZKBioTime employee ID automatically."
            rules={[
              {
                required: true,
                message:
                  "Select at least one employee.",
              },
            ]}
          >
            <Select
              mode="multiple"
              showSearch
              allowClear
              filterOption={false}
              onSearch={
                queueEmployeeSearch
              }
              onFocus={() => {
                if (!employeeOptions.length) {
                  searchEmployees("");
                }
              }}
              loading={
                employeeSearchLoading
              }
              placeholder="Search employees"
              options={
                employeeOptions
                  .filter(
                    (employee) =>
                      Number(employee?.id) > 0
                  )
                  .map(
                    (employee) => ({
                      value: Number(
                        employee.id
                      ),
                      label:
                        employeeSearchLabel(
                          employee
                        ),
                    })
                  )
              }
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Delete Biometric Template"
        open={templateOpen}
        onCancel={() =>
          setTemplateOpen(false)
        }
        onOk={
          submitTemplateDelete
        }
        okText="Continue"
        okButtonProps={{
          danger: true,
        }}
        confirmLoading={
          templateSaving
        }
      >
        <Alert
          type="warning"
          showIcon
          style={{
            marginBottom: 16,
          }}
          message="Template deletion is destructive. Use it only when the employee should be re-enrolled."
        />

        <Form
          form={templateForm}
          layout="vertical"
        >
          <Form.Item
            name="employee_ids"
            label="Employees"
            extra="Search by Cap No., employee code or name. PTS resolves the internal ZKBioTime employee ID automatically before template deletion."
            rules={[
              {
                required: true,
                message:
                  "Select at least one employee.",
              },
            ]}
          >
            <Select
              mode="multiple"
              showSearch
              allowClear
              filterOption={false}
              onSearch={
                queueEmployeeSearch
              }
              onFocus={() => {
                if (!employeeOptions.length) {
                  searchEmployees("");
                }
              }}
              loading={
                employeeSearchLoading
              }
              placeholder="Search employees"
              options={
                employeeOptions
                  .filter(
                    (employee) =>
                      Number(employee?.id) > 0
                  )
                  .map(
                    (employee) => ({
                      value: Number(
                        employee.id
                      ),
                      label:
                        employeeSearchLabel(
                          employee
                        ),
                    })
                  )
              }
            />
          </Form.Item>

          <Form.Item
            name="template_types"
            label="Template Type(s)"
            rules={[
              {
                required: true,
                message:
                  "Select at least one template type.",
              },
            ]}
          >
            <Checkbox.Group>
              <Space
                direction="vertical"
              >
                <Checkbox value="finger_print">
                  Fingerprint
                </Checkbox>
                <Checkbox value="face">
                  Face
                </Checkbox>
                <Checkbox value="finger_vein">
                  Finger Vein
                </Checkbox>
                <Checkbox value="palm">
                  Palm
                </Checkbox>
              </Space>
            </Checkbox.Group>
          </Form.Item>
        </Form>
      </Modal>

      {canManage && (
        <div
          style={{
            marginTop: 12,
          }}
        >
          <Tooltip title="Only users with devices.manage permission can see and run device-changing actions.">
            <Text
              type="secondary"
              style={{
                fontSize: 12,
              }}
            >
              <SafetyCertificateOutlined />{" "}
              Device-changing actions are permission protected. Destructive actions require confirmation.
            </Text>
          </Tooltip>
        </div>
      )}
    </div>
  );
}
