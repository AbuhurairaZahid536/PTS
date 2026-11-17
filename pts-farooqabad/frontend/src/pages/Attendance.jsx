import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  Alert,
  Button,
  Card,
  Col,
  DatePicker,
  Descriptions,
  Drawer,
  Empty,
  Input,
  Modal,
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
  ClockCircleOutlined,
  DownloadOutlined,
  EyeOutlined,
  FilePdfOutlined,
  FilterOutlined,
  ReloadOutlined,
  SearchOutlined,
  SyncOutlined,
  TeamOutlined,
  UserOutlined,
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

/*
|--------------------------------------------------------------------------
| CONSTANTS
|--------------------------------------------------------------------------
*/

const EMPTY_SUMMARY = {
  total_subjects:
    0,

  total_session_records:
    0,

  present:
    0,

  absent:
    0,

  exempt:
    0,

  no_timetable:
    0,

  early:
    0,

  in_time:
    0,

  late:
    0,

  manual_absence:
    0,

  sessions:
    [],
};

const ATTENDANCE_OPTIONS = [
  {
    value:
      "PRESENT",

    label:
      "Present",
  },

  {
    value:
      "ABSENT",

    label:
      "Absent",
  },

  {
    value:
      "EXEMPT",

    label:
      "Exempt",
  },

  {
    value:
      "NO_TIMETABLE",

    label:
      "No Timetable",
  },
];

const TIMING_OPTIONS = [
  {
    value:
      "EARLY",

    label:
      "Early",
  },

  {
    value:
      "IN_TIME",

    label:
      "In Time",
  },

  {
    value:
      "LATE",

    label:
      "Late",
  },

  {
    value:
      "NO_PUNCH",

    label:
      "No Punch",
  },

  {
    value:
      "EXEMPT",

    label:
      "Exempt",
  },

  {
    value:
      "NO_TIMETABLE",

    label:
      "No Timetable",
  },
];

/*
|--------------------------------------------------------------------------
| HELPERS
|--------------------------------------------------------------------------
*/

function formatDateTime(
  value
) {
  if (!value) {
    return "-";
  }

  const parsed =
    dayjs(
      value
    );

  if (
    !parsed.isValid()
  ) {
    return String(
      value
    );
  }

  return parsed.format(
    "DD-MMM-YYYY hh:mm:ss A"
  );
}

function formatTime(
  value
) {
  if (!value) {
    return "-";
  }

  const parsed =
    dayjs(
      value
    );

  if (
    !parsed.isValid()
  ) {
    return String(
      value
    );
  }

  return parsed.format(
    "hh:mm:ss A"
  );
}

function statusColor(
  status
) {
  switch (
    status
  ) {
    case "PRESENT":
      return "green";

    case "ABSENT":
      return "red";

    case "EXEMPT":
      return "blue";

    case "NO_TIMETABLE":
      return "orange";

    default:
      return "default";
  }
}

function timingColor(
  status
) {
  switch (
    status
  ) {
    case "EARLY":
      return "cyan";

    case "IN_TIME":
      return "green";

    case "LATE":
      return "orange";

    case "NO_PUNCH":
      return "red";

    case "EXEMPT":
      return "blue";

    case "NO_TIMETABLE":
      return "default";

    default:
      return "default";
  }
}

function sessionColor(
  session
) {
  return session ===
    "MORNING"
    ? "gold"
    : "purple";
}

function parseManualAbsence(
  value
) {
  if (!value) {
    return [];
  }

  if (
    Array.isArray(
      value
    )
  ) {
    return value;
  }

  if (
    typeof value ===
    "object"
  ) {
    return [
      value,
    ];
  }

  try {
    const parsed =
      JSON.parse(
        value
      );

    return Array.isArray(
      parsed
    )
      ? parsed
      : [
          parsed,
        ];
  } catch {
    return [];
  }
}

function getGroupName(
  record
) {
  if (
    record.subject_type ===
    "TRAINEE"
  ) {
    return (
      record.course_name ||
      "No Course"
    );
  }

  return (
    record.category_name ||
    "No Category"
  );
}

function getSubGroupName(
  record
) {
  if (
    record.subject_type ===
    "TRAINEE"
  ) {
    return record.platoon_number
      ? `Platoon ${record.platoon_number}`
      : "No Platoon";
  }

  return (
    record.branch_name ||
    "No Branch"
  );
}

function escapeCsv(
  value
) {
  if (
    value ===
      null ||
    value ===
      undefined
  ) {
    return "";
  }

  const text =
    String(
      value
    );

  if (
    text.includes(
      ","
    ) ||
    text.includes(
      "\""
    ) ||
    text.includes(
      "\n"
    )
  ) {
    return `"${text.replace(
      /"/g,
      "\"\""
    )}"`;
  }

  return text;
}

/*
|--------------------------------------------------------------------------
| COMPONENT
|--------------------------------------------------------------------------
*/

export default function Attendance({
  onOpenProfile,
}) {
  const {
    hasPermission,
  } =
    useAuth();

  const canProcess =
    hasPermission(
      "attendance.correct"
    );

  /*
  |--------------------------------------------------------------------------
  | PRIMARY FILTERS
  |--------------------------------------------------------------------------
  */

  const [
    attendanceDate,
    setAttendanceDate,
  ] =
    useState(
      dayjs()
    );

  const [
    subjectType,
    setSubjectType,
  ] =
    useState(
      "TRAINEE"
    );

  const [
    sessionType,
    setSessionType,
  ] =
    useState(null);

  const [
    status,
    setStatus,
  ] =
    useState(null);

  const [
    timingStatus,
    setTimingStatus,
  ] =
    useState(null);

  const [
    manualOnly,
    setManualOnly,
  ] =
    useState(false);

  const [
    search,
    setSearch,
  ] =
    useState("");

  /*
  |--------------------------------------------------------------------------
  | LOCAL GROUP FILTERS
  |--------------------------------------------------------------------------
  */

  const [
    groupFilter,
    setGroupFilter,
  ] =
    useState(null);

  const [
    subGroupFilter,
    setSubGroupFilter,
  ] =
    useState(null);

  /*
  |--------------------------------------------------------------------------
  | DATA
  |--------------------------------------------------------------------------
  */

  const [
    loading,
    setLoading,
  ] =
    useState(false);

  const [
    processing,
    setProcessing,
  ] =
    useState(false);

  const [
    records,
    setRecords,
  ] =
    useState([]);

  const [
    summary,
    setSummary,
  ] =
    useState(
      EMPTY_SUMMARY
    );

  /*
  |--------------------------------------------------------------------------
  | DRAWER
  |--------------------------------------------------------------------------
  */

  const [
    selectedRecord,
    setSelectedRecord,
  ] =
    useState(null);

  const [
    viewOpen,
    setViewOpen,
  ] =
    useState(false);

  /*
  |--------------------------------------------------------------------------
  | LOAD
  |--------------------------------------------------------------------------
  */

  const loadAttendance =
    async () => {
      if (
        !attendanceDate
      ) {
        return;
      }

      setLoading(
        true
      );

      try {
        const date =
          attendanceDate.format(
            "YYYY-MM-DD"
          );

        const params = {
          attendance_date:
            date,
        };

        if (
          subjectType &&
          subjectType !==
            "ALL"
        ) {
          params.subject_type =
            subjectType;
        }

        if (
          sessionType
        ) {
          params.session_type =
            sessionType;
        }

        if (
          status
        ) {
          params.status =
            status;
        }

        if (
          timingStatus
        ) {
          params.timing_status =
            timingStatus;
        }

        if (
          manualOnly
        ) {
          params.manual_only =
            "1";
        }

        if (
          search.trim()
        ) {
          params.search =
            search.trim();
        }

        const [
          attendanceResponse,
          summaryResponse,
        ] =
          await Promise.all([
            api.get(
              "/attendance",
              {
                params,
              }
            ),

            api.get(
              "/attendance/summary",
              {
                params: {
                  attendance_date:
                    date,

                  ...(
                    subjectType &&
                    subjectType !==
                      "ALL"
                      ? {
                          subject_type:
                            subjectType,
                        }
                      : {}
                  ),
                },
              }
            ),
          ]);

        setRecords(
          attendanceResponse
            .data
            ?.data ||
            []
        );

        setSummary(
          summaryResponse
            .data
            ?.data ||
            EMPTY_SUMMARY
        );
      } catch (error) {
        message.error(
          error.response
            ?.data
            ?.message ||
            "Could not load attendance."
        );
      } finally {
        setLoading(
          false
        );
      }
    };

  useEffect(
    () => {
      setGroupFilter(
        null
      );

      setSubGroupFilter(
        null
      );

      loadAttendance();

      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [
      attendanceDate,
      subjectType,
    ]
  );

  /*
  |--------------------------------------------------------------------------
  | GROUP OPTIONS
  |--------------------------------------------------------------------------
  */

  const groupOptions =
    useMemo(
      () => {
        return [
          ...new Set(
            records.map(
              getGroupName
            )
          ),
        ]
          .sort(
            (
              a,
              b
            ) =>
              String(
                a
              ).localeCompare(
                String(
                  b
                )
              )
          )
          .map(
            (
              value
            ) => ({
              value,

              label:
                value,
            })
          );
      },
      [
        records,
      ]
    );

  const subGroupOptions =
    useMemo(
      () => {
        const source =
          groupFilter
            ? records.filter(
                (
                  row
                ) =>
                  getGroupName(
                    row
                  ) ===
                  groupFilter
              )
            : records;

        return [
          ...new Set(
            source.map(
              getSubGroupName
            )
          ),
        ]
          .sort(
            (
              a,
              b
            ) =>
              String(
                a
              ).localeCompare(
                String(
                  b
                )
              )
          )
          .map(
            (
              value
            ) => ({
              value,

              label:
                value,
            })
          );
      },
      [
        records,
        groupFilter,
      ]
    );

  /*
  |--------------------------------------------------------------------------
  | DISPLAY RECORDS
  |--------------------------------------------------------------------------
  */

  const displayedRecords =
    useMemo(
      () => {
        return records.filter(
          (
            row
          ) => {
            if (
              groupFilter &&
              getGroupName(
                row
              ) !==
                groupFilter
            ) {
              return false;
            }

            if (
              subGroupFilter &&
              getSubGroupName(
                row
              ) !==
                subGroupFilter
            ) {
              return false;
            }

            return true;
          }
        );
      },
      [
        records,
        groupFilter,
        subGroupFilter,
      ]
    );

  /*
  |--------------------------------------------------------------------------
  | DISPLAY SUMMARY
  |--------------------------------------------------------------------------
  */

  const displayedSummary =
    useMemo(
      () => {
        const result = {
          total:
            displayedRecords.length,

          present:
            0,

          absent:
            0,

          exempt:
            0,

          no_timetable:
            0,

          early:
            0,

          in_time:
            0,

          late:
            0,

          no_punch:
            0,

          manual_absence:
            0,
        };

        displayedRecords.forEach(
          (
            row
          ) => {
            switch (
              row.attendance_status
            ) {
              case "PRESENT":
                result.present +=
                  1;

                break;

              case "ABSENT":
                result.absent +=
                  1;

                break;

              case "EXEMPT":
                result.exempt +=
                  1;

                break;

              case "NO_TIMETABLE":
                result.no_timetable +=
                  1;

                break;

              default:
                break;
            }

            switch (
              row.timing_status
            ) {
              case "EARLY":
                result.early +=
                  1;

                break;

              case "IN_TIME":
                result.in_time +=
                  1;

                break;

              case "LATE":
                result.late +=
                  1;

                break;

              case "NO_PUNCH":
                result.no_punch +=
                  1;

                break;

              default:
                break;
            }

            if (
              Number(
                row.has_manual_absence
              ) ===
              1
            ) {
              result.manual_absence +=
                1;
            }
          }
        );

        return result;
      },
      [
        displayedRecords,
      ]
    );

  /*
  |--------------------------------------------------------------------------
  | PROCESS / RECALCULATE
  |--------------------------------------------------------------------------
  */

  const processAttendance =
    () => {
      if (
        !attendanceDate
      ) {
        message.error(
          "Please select attendance date."
        );

        return;
      }

      const date =
        attendanceDate.format(
          "YYYY-MM-DD"
        );

      const today =
        dayjs().format(
          "YYYY-MM-DD"
        );

      const isToday =
        date ===
        today;

      Modal.confirm({
        title:
          "Process / Recalculate Attendance?",

        width:
          600,

        content: (
          <div>
            <p>
              Date:{" "}
              <strong>
                {attendanceDate.format(
                  "DD-MMM-YYYY"
                )}
              </strong>
            </p>

            <p>
              Type:{" "}
              <strong>
                {subjectType ===
                "ALL"
                  ? "Trainees + Staff"
                  : subjectType}
              </strong>
            </p>

            {isToday ? (
              <Alert
                type="info"

                showIcon

                message="Current Date"

                description="Processing se pehle current date ki complete ZKBioTime transactions local database mein sync/re-sync hongi. Uske baad attendance calculate hogi."
              />
            ) : (
              <Alert
                type="warning"

                showIcon

                message="Historical Date"

                description="Historical date ke liye ZKBioTime API call nahi hogi. Attendance sirf already-saved local transactions se calculate hogi."
              />
            )}
          </div>
        ),

        okText:
          "Process Attendance",

        async onOk() {
          try {
            setProcessing(
              true
            );

            const payload = {
              attendance_date:
                date,
            };

            if (
              subjectType !==
              "ALL"
            ) {
              payload.subject_type =
                subjectType;
            }

            const response =
              await api.post(
                "/attendance/process",
                payload
              );

            const result =
              response.data
                ?.data ||
              {};

            const duration =
              result.duration_ms
                ? `${(
                    result.duration_ms /
                    1000
                  ).toFixed(
                    1
                  )} sec`
                : "-";

            if (
              result.failed >
              0
            ) {
              Modal.warning({
                title:
                  "Attendance processed with some failures",

                content: (
                  <div>
                    <p>
                      Successful records:{" "}
                      <strong>
                        {
                          result.records
                        }
                      </strong>
                    </p>

                    <p>
                      Failed sessions:{" "}
                      <strong>
                        {
                          result.failed
                        }
                      </strong>
                    </p>

                    <p>
                      Processing time:{" "}
                      <strong>
                        {
                          duration
                        }
                      </strong>
                    </p>
                  </div>
                ),
              });
            } else {
              message.success(
                `Attendance processed successfully. ${result.subjects || 0} persons, ${result.records || 0} session records.`
              );
            }

            if (
              result
                .biometric_sync
                ?.attempted &&
              result
                .biometric_sync
                ?.success ===
                false
            ) {
              Modal.warning({
                title:
                  "Biometric Sync Warning",

                content:
                  result
                    .biometric_sync
                    .message,
              });
            }

            await loadAttendance();
          } catch (error) {
            message.error(
              error.response
                ?.data
                ?.message ||
                "Attendance processing failed."
            );
          } finally {
            setProcessing(
              false
            );
          }
        },
      });
    };

  /*
  |--------------------------------------------------------------------------
  | RESET FILTERS
  |--------------------------------------------------------------------------
  */

  const resetFilters =
    () => {
      setSessionType(
        null
      );

      setStatus(
        null
      );

      setTimingStatus(
        null
      );

      setManualOnly(
        false
      );

      setSearch(
        ""
      );

      setGroupFilter(
        null
      );

      setSubGroupFilter(
        null
      );

      setTimeout(
        () => {
          loadAttendance();
        },
        0
      );
    };

  /*
  |--------------------------------------------------------------------------
  | QUICK STATUS FILTER
  |--------------------------------------------------------------------------
  */

  const applyAttendanceStatus =
    (
      value
    ) => {
      setStatus(
        value
      );

      setTimeout(
        () => {
          const date =
            attendanceDate.format(
              "YYYY-MM-DD"
            );

          const params = {
            attendance_date:
              date,

            status:
              value,
          };

          if (
            subjectType !==
            "ALL"
          ) {
            params.subject_type =
              subjectType;
          }

          if (
            sessionType
          ) {
            params.session_type =
              sessionType;
          }

          setLoading(
            true
          );

          api.get(
            "/attendance",
            {
              params,
            }
          )
            .then(
              (
                response
              ) => {
                setRecords(
                  response.data
                    ?.data ||
                    []
                );
              }
            )
            .catch(
              (
                error
              ) => {
                message.error(
                  error.response
                    ?.data
                    ?.message ||
                    "Could not filter attendance."
                );
              }
            )
            .finally(
              () => {
                setLoading(
                  false
                );
              }
            );
        },
        0
      );
    };

  /*
  |--------------------------------------------------------------------------
  | EXPORT CSV
  |--------------------------------------------------------------------------
  */

  const exportCsv =
    () => {
      if (
        !displayedRecords.length
      ) {
        message.warning(
          "Export ke liye koi attendance record mojood nahi."
        );

        return;
      }

      const headers = [
        "Employee ID",
        "Name",
        "Type",
        "Course / Category",
        "Platoon / Branch",
        "Date",
        "Session",
        "Punch",
        "Attendance",
        "Timing",
        "Timing Minutes",
        "Exemption",
        "Exemption Detail",
        "Manual Absence",
        "Timetable",
      ];

      const rows =
        displayedRecords.map(
          (
            row
          ) => [
            row.employee_id,

            row.subject_name,

            row.subject_type,

            getGroupName(
              row
            ),

            getSubGroupName(
              row
            ),

            row.attendance_date
              ? dayjs(
                  row.attendance_date
                ).format(
                  "DD-MMM-YYYY"
                )
              : "",

            row.session_type,

            row.selected_punch
              ? formatDateTime(
                  row.selected_punch
                )
              : "",

            row.attendance_status,

            row.timing_status,

            row.timing_minutes ??
              "",

            row.exemption_type ||
              "",

            row.exemption_description ||
              "",

            Number(
              row.has_manual_absence
            ) ===
            1
              ? "Yes"
              : "No",

            row.timetable_name ||
              "",
          ]
        );

      const csv =
        [
          headers,
          ...rows,
        ]
          .map(
            (
              row
            ) =>
              row
                .map(
                  escapeCsv
                )
                .join(
                  ","
                )
          )
          .join(
            "\r\n"
          );

      const blob =
        new Blob(
          [
            "\uFEFF",
            csv,
          ],
          {
            type:
              "text/csv;charset=utf-8;",
          }
        );

      const url =
        URL.createObjectURL(
          blob
        );

      const anchor =
        document.createElement(
          "a"
        );

      const typeText =
        subjectType ===
        "ALL"
          ? "All"
          : subjectType;

      anchor.href =
        url;

      anchor.download =
        `Attendance_${typeText}_${attendanceDate.format(
          "YYYY-MM-DD"
        )}.csv`;

      document.body.appendChild(
        anchor
      );

      anchor.click();

      document.body.removeChild(
        anchor
      );

      URL.revokeObjectURL(
        url
      );

      message.success(
        "Attendance CSV exported successfully."
      );
    };

  /*
  |--------------------------------------------------------------------------
  | PRINT
  |--------------------------------------------------------------------------
  */

  const printAttendance =
    () => {
      if (
        !displayedRecords.length
      ) {
        message.warning(
          "Print ke liye koi record mojood nahi."
        );

        return;
      }

      window.print();
    };

  /*
  |--------------------------------------------------------------------------
  | PROFILE
  |--------------------------------------------------------------------------
  */

  const openProfile =
    (
      record
    ) => {
      if (
        typeof onOpenProfile ===
        "function"
      ) {
        onOpenProfile({
          subjectType:
            record.subject_type,

          subjectId:
            record.subject_id,
        });

        return;
      }

      setSelectedRecord(
        record
      );

      setViewOpen(
        true
      );
    };

  /*
  |--------------------------------------------------------------------------
  | TABLE
  |--------------------------------------------------------------------------
  */

  const columns = [
    {
      title:
        "Employee ID / Cap No.",

      dataIndex:
        "employee_id",

      width:
        150,

      fixed:
        "left",

      render:
        (
          value,
          record
        ) => (
          <Button
            type="link"

            size="small"

            style={{
              padding:
                0,

              height:
                "auto",

              fontWeight:
                700,
            }}

            onClick={() =>
              openProfile(
                record
              )
            }
          >
            {value ||
              "-"}
          </Button>
        ),
    },

    {
      title:
        "Name",

      dataIndex:
        "subject_name",

      width:
        190,

      render:
        (
          value
        ) =>
          value ||
          "-",
    },

    {
      title:
        "Type",

      dataIndex:
        "subject_type",

      width:
        100,

      render:
        (
          value
        ) => (
          <Tag
            color={
              value ===
              "TRAINEE"
                ? "blue"
                : "purple"
            }
          >
            {value}
          </Tag>
        ),
    },

    {
      title:
        "Course / Category",

      width:
        210,

      render:
        (
          _,
          record
        ) =>
          getGroupName(
            record
          ),
    },

    {
      title:
        "Platoon / Branch",

      width:
        175,

      render:
        (
          _,
          record
        ) =>
          getSubGroupName(
            record
          ),
    },

    {
      title:
        "Session",

      dataIndex:
        "session_type",

      width:
        110,

      align:
        "center",

      render:
        (
          value
        ) => (
          <Tag
            color={
              sessionColor(
                value
              )
            }
          >
            {value}
          </Tag>
        ),
    },

    {
      title:
        "Punch",

      dataIndex:
        "selected_punch",

      width:
        165,

      render:
        (
          value
        ) => (
          <Space
            direction="vertical"

            size={
              0
            }
          >
            <Text
              strong={
                Boolean(
                  value
                )
              }
            >
              {formatTime(
                value
              )}
            </Text>

            {value && (
              <Text
                type="secondary"

                style={{
                  fontSize:
                    10,
                }}
              >
                {dayjs(
                  value
                ).format(
                  "DD-MMM-YYYY"
                )}
              </Text>
            )}
          </Space>
        ),
    },

    {
      title:
        "Attendance",

      dataIndex:
        "attendance_status",

      width:
        135,

      align:
        "center",

      render:
        (
          value
        ) => (
          <Tag
            color={
              statusColor(
                value
              )
            }
          >
            {value}
          </Tag>
        ),
    },

    {
      title:
        "Timing",

      width:
        135,

      align:
        "center",

      render:
        (
          _,
          record
        ) => (
          <Space
            direction="vertical"

            size={
              0
            }
          >
            <Tag
              color={
                timingColor(
                  record.timing_status
                )
              }
            >
              {record.timing_status ||
                "-"}
            </Tag>

            {[
              "EARLY",
              "LATE",
            ].includes(
              record.timing_status
            ) &&
              record.timing_minutes !==
                null &&
              record.timing_minutes !==
                undefined && (
                <Text
                  type="secondary"

                  style={{
                    fontSize:
                      10,

                    whiteSpace:
                      "nowrap",
                  }}
                >
                  {record.timing_status ===
                  "LATE"
                    ? "Late by"
                    : "Early by"}{" "}
                  <strong>
                    {
                      record.timing_minutes
                    }
                  </strong>{" "}
                  min
                </Text>
              )}
          </Space>
        ),
    },

    {
      title:
        "Exemption",

      width:
        210,

      render:
        (
          _,
          record
        ) => {
          if (
            !record.exemption_type
          ) {
            return "-";
          }

          return (
            <Space
              direction="vertical"

              size={
                0
              }
            >
              <Tag
                color="blue"
              >
                {
                  record.exemption_type
                }
              </Tag>

              {record.exemption_description && (
                <Text
                  type="secondary"

                  ellipsis={{
                    tooltip:
                      record.exemption_description,
                  }}

                  style={{
                    maxWidth:
                      180,

                    fontSize:
                      10,
                  }}
                >
                  {
                    record.exemption_description
                  }
                </Text>
              )}
            </Space>
          );
        },
    },

    {
      title:
        "Manual Absence",

      width:
        145,

      align:
        "center",

      render:
        (
          _,
          record
        ) =>
          Number(
            record.has_manual_absence
          ) ===
          1 ? (
            <Tag
              color="red"
            >
              Recorded
            </Tag>
          ) : (
            <Tag>
              No
            </Tag>
          ),
    },

    {
      title:
        "Timetable",

      dataIndex:
        "timetable_name",

      width:
        190,

      render:
        (
          value
        ) =>
          value ||
          "-",
    },

    {
      title:
        "Action",

      width:
        90,

      fixed:
        "right",

      align:
        "center",

      render:
        (
          _,
          record
        ) => (
          <Button
            size="small"

            icon={
              <EyeOutlined />
            }

            onClick={() => {
              setSelectedRecord(
                record
              );

              setViewOpen(
                true
              );
            }}
          >
            View
          </Button>
        ),
    },
  ];

  /*
  |--------------------------------------------------------------------------
  | DATE STATE
  |--------------------------------------------------------------------------
  */

  const today =
    dayjs().format(
      "YYYY-MM-DD"
    );

  const selectedDate =
    attendanceDate.format(
      "YYYY-MM-DD"
    );

  const isToday =
    selectedDate ===
    today;

  /*
  |--------------------------------------------------------------------------
  | ACTIVE FILTER COUNT
  |--------------------------------------------------------------------------
  */

  const activeFilterCount =
    [
      sessionType,
      status,
      timingStatus,
      manualOnly,
      search.trim(),
      groupFilter,
      subGroupFilter,
    ].filter(
      Boolean
    ).length;

  /*
  |--------------------------------------------------------------------------
  | UI
  |--------------------------------------------------------------------------
  */

  return (
    <>
      <style>
        {`
          .attendance-stat-card {
            height: 100%;
            border-radius: 12px;
          }

          .attendance-summary-clickable {
            cursor: pointer;
            transition: all .2s ease;
          }

          .attendance-summary-clickable:hover {
            transform: translateY(-3px);
            box-shadow: 0 8px 20px rgba(15,23,42,.10);
          }

          .attendance-print-root {
            display: none;
          }

          @media print {

            body * {
              visibility: hidden !important;
            }

            .attendance-print-root,
            .attendance-print-root * {
              visibility: visible !important;
            }

            .attendance-print-root {
              display: block !important;
              position: absolute;
              left: 0;
              top: 0;
              width: 100%;
              background: #fff;
              font-family: Arial, Helvetica, sans-serif;
              color: #000;
            }

            .attendance-print-header {
              text-align: center;
              border-bottom: 3px double #000;
              margin-bottom: 12px;
              padding-bottom: 8px;
            }

            .attendance-print-title {
              font-size: 18px;
              font-weight: 800;
            }

            .attendance-print-subtitle {
              font-size: 12px;
              font-weight: 700;
            }

            .attendance-print-meta {
              width: 100%;
              border-collapse: collapse;
              font-size: 10px;
              margin-bottom: 10px;
            }

            .attendance-print-meta td {
              border: 1px solid #000;
              padding: 4px 5px;
            }

            .attendance-print-table {
              width: 100%;
              border-collapse: collapse;
              font-size: 8px;
            }

            .attendance-print-table th,
            .attendance-print-table td {
              border: 1px solid #000;
              padding: 3px;
              vertical-align: top;
            }

            .attendance-print-table th {
              background: #eaeaea;
              font-weight: 800;
            }

            .attendance-print-footer {
              margin-top: 18px;
              display: flex;
              justify-content: space-between;
              font-size: 9px;
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
            display:
              "flex",

            justifyContent:
              "space-between",

            alignItems:
              "center",

            gap:
              16,

            marginBottom:
              16,
          }}
        >
          <div>
            <Title
              level={
                3
              }

              style={{
                margin:
                  0,
              }}
            >
              Attendance
            </Title>

            <Text
              type="secondary"
            >
              Biometric Attendance Control Center — Morning / Evening Attendance, Timings, Exemptions, and Manual Absences.
            </Text>
          </div>

          <Space
            wrap
          >
            <Button
              icon={
                <DownloadOutlined />
              }

              onClick={
                exportCsv
              }
            >
              Export CSV
            </Button>

            <Button
              icon={
                <FilePdfOutlined />
              }

              onClick={
                printAttendance
              }
            >
              Print / PDF
            </Button>

            <Button
              icon={
                <ReloadOutlined />
              }

              loading={
                loading
              }

              onClick={
                loadAttendance
              }
            >
              Refresh
            </Button>

            {canProcess && (
              <Button
                type="primary"

                loading={
                  processing
                }

                icon={
                  <SyncOutlined />
                }

                onClick={
                  processAttendance
                }
              >
                Process / Recalculate
              </Button>
            )}
          </Space>
        </div>

        {/* DATE INFORMATION */}

        <Alert
          type={
            isToday
              ? "success"
              : "info"
          }

          showIcon

          style={{
            marginBottom:
              16,
          }}

          message={
            isToday
              ? "Current Date Attendance"
              : "Historical Attendance"
          }

          description={
            isToday
              ? "Processing or recalculating the current date triggers an automatic sync of the latest biometric transactions from ZKBioTime to the local database. Once the sync completes, the Attendance Engine processes the local database records."
              : "No API calls will be made to ZKBioTime for historical dates; attendance will be calculated entirely from already-saved local transactions."
          }
        />

        {/* SESSION QUICK SWITCH */}

        <Card
          size="small"

          style={{
            marginBottom:
              12,
          }}
        >
          <div
            style={{
              display:
                "flex",

              justifyContent:
                "space-between",

              alignItems:
                "center",

              gap:
                12,

              flexWrap:
                "wrap",
            }}
          >
            <Space
              wrap
            >
              <Text
                strong
              >
                Session:
              </Text>

              <Button
                type={
                  sessionType ===
                  null
                    ? "primary"
                    : "default"
                }

                onClick={() =>
                  setSessionType(
                    null
                  )
                }
              >
                All Sessions
              </Button>

              <Button
                type={
                  sessionType ===
                  "MORNING"
                    ? "primary"
                    : "default"
                }

                onClick={() =>
                  setSessionType(
                    "MORNING"
                  )
                }
              >
                Morning
              </Button>

              <Button
                type={
                  sessionType ===
                  "EVENING"
                    ? "primary"
                    : "default"
                }

                onClick={() =>
                  setSessionType(
                    "EVENING"
                  )
                }
              >
                Evening
              </Button>

              <Button
                icon={
                  <SearchOutlined />
                }

                onClick={
                  loadAttendance
                }
              >
                Apply
              </Button>
            </Space>

            <Space>
              <Tag
                color="blue"
              >
                Showing {
                  displayedRecords.length
                } Records
              </Tag>

              {activeFilterCount >
                0 && (
                <Tag
                  color="orange"
                >
                  {
                    activeFilterCount
                  } Active Filter(s)
                </Tag>
              )}
            </Space>
          </div>
        </Card>

        {/* FILTERS */}

        <Card
          title={
            <Space>
              <FilterOutlined />

              Filters
            </Space>
          }

          extra={
            <Button
              size="small"

              onClick={
                resetFilters
              }
            >
              Reset Filters
            </Button>
          }

          style={{
            marginBottom:
              16,
          }}
        >
          <Row
            gutter={[
              12,
              12,
            ]}
          >
            <Col
              xs={24}
              sm={12}
              lg={4}
            >
              <Text
                type="secondary"

                style={{
                  fontSize:
                    11,
                }}
              >
                Attendance Date
              </Text>

              <DatePicker
                value={
                  attendanceDate
                }

                allowClear={
                  false
                }

                format="DD-MMM-YYYY"

                style={{
                  width:
                    "100%",

                  marginTop:
                    4,
                }}

                onChange={
                  setAttendanceDate
                }
              />
            </Col>

            <Col
              xs={24}
              sm={12}
              lg={4}
            >
              <Text
                type="secondary"

                style={{
                  fontSize:
                    11,
                }}
              >
                Person Type
              </Text>

              <Select
                value={
                  subjectType
                }

                style={{
                  width:
                    "100%",

                  marginTop:
                    4,
                }}

                onChange={(
                  value
                ) => {
                  setSubjectType(
                    value
                  );

                  setGroupFilter(
                    null
                  );

                  setSubGroupFilter(
                    null
                  );
                }}

                options={[
                  {
                    value:
                      "TRAINEE",

                    label:
                      "Trainees",
                  },

                  {
                    value:
                      "STAFF",

                    label:
                      "PTS Staff",
                  },

                  {
                    value:
                      "ALL",

                    label:
                      "Trainees + Staff",
                  },
                ]}
              />
            </Col>

            <Col
              xs={24}
              sm={12}
              lg={4}
            >
              <Text
                type="secondary"

                style={{
                  fontSize:
                    11,
                }}
              >
                Course / Category
              </Text>

              <Select
                allowClear

                showSearch

                optionFilterProp="label"

                value={
                  groupFilter
                }

                placeholder={
                  subjectType ===
                  "STAFF"
                    ? "All Categories"
                    : subjectType ===
                      "TRAINEE"
                    ? "All Courses"
                    : "All Groups"
                }

                options={
                  groupOptions
                }

                style={{
                  width:
                    "100%",

                  marginTop:
                    4,
                }}

                onChange={(
                  value
                ) => {
                  setGroupFilter(
                    value ||
                      null
                  );

                  setSubGroupFilter(
                    null
                  );
                }}
              />
            </Col>

            <Col
              xs={24}
              sm={12}
              lg={4}
            >
              <Text
                type="secondary"

                style={{
                  fontSize:
                    11,
                }}
              >
                Platoon / Branch
              </Text>

              <Select
                allowClear

                showSearch

                optionFilterProp="label"

                value={
                  subGroupFilter
                }

                placeholder={
                  subjectType ===
                  "STAFF"
                    ? "All Branches"
                    : subjectType ===
                      "TRAINEE"
                    ? "All Platoons"
                    : "All"
                }

                options={
                  subGroupOptions
                }

                style={{
                  width:
                    "100%",

                  marginTop:
                    4,
                }}

                onChange={(
                  value
                ) =>
                  setSubGroupFilter(
                    value ||
                      null
                  )
                }
              />
            </Col>

            <Col
              xs={24}
              sm={12}
              lg={4}
            >
              <Text
                type="secondary"

                style={{
                  fontSize:
                    11,
                }}
              >
                Attendance Status
              </Text>

              <Select
                allowClear

                value={
                  status
                }

                placeholder="All Statuses"

                style={{
                  width:
                    "100%",

                  marginTop:
                    4,
                }}

                onChange={
                  setStatus
                }

                options={
                  ATTENDANCE_OPTIONS
                }
              />
            </Col>

            <Col
              xs={24}
              sm={12}
              lg={4}
            >
              <Text
                type="secondary"

                style={{
                  fontSize:
                    11,
                }}
              >
                Timing Status
              </Text>

              <Select
                allowClear

                value={
                  timingStatus
                }

                placeholder="All Timing"

                style={{
                  width:
                    "100%",

                  marginTop:
                    4,
                }}

                onChange={
                  setTimingStatus
                }

                options={
                  TIMING_OPTIONS
                }
              />
            </Col>

            <Col
              xs={24}
              sm={12}
              lg={4}
            >
              <Text
                type="secondary"

                style={{
                  fontSize:
                    11,
                }}
              >
                Manual Absence
              </Text>

              <Select
                value={
                  manualOnly
                    ? "YES"
                    : "ALL"
                }

                style={{
                  width:
                    "100%",

                  marginTop:
                    4,
                }}

                onChange={(
                  value
                ) =>
                  setManualOnly(
                    value ===
                      "YES"
                  )
                }

                options={[
                  {
                    value:
                      "ALL",

                    label:
                      "All Records",
                  },

                  {
                    value:
                      "YES",

                    label:
                      "Manual Absence Only",
                  },
                ]}
              />
            </Col>

            <Col
              xs={24}
              lg={16}
            >
              <Text
                type="secondary"

                style={{
                  fontSize:
                    11,
                }}
              >
                Search
              </Text>

              <Input
                allowClear

                prefix={
                  <SearchOutlined />
                }

                value={
                  search
                }

                placeholder="Search Employee ID / Cap No. or Name"

                style={{
                  marginTop:
                    4,
                }}

                onChange={(
                  event
                ) =>
                  setSearch(
                    event.target
                      .value
                  )
                }

                onPressEnter={
                  loadAttendance
                }
              />
            </Col>

            <Col
              xs={24}
              lg={4}
            >
              <Text
                type="secondary"

                style={{
                  visibility:
                    "hidden",

                  fontSize:
                    11,
                }}
              >
                Apply
              </Text>

              <Button
                type="primary"

                block

                icon={
                  <SearchOutlined />
                }

                style={{
                  marginTop:
                    4,
                }}

                loading={
                  loading
                }

                onClick={
                  loadAttendance
                }
              >
                Apply Filters
              </Button>
            </Col>
          </Row>
        </Card>

        {/* SUMMARY CARDS */}

        <Row
          gutter={[
            10,
            10,
          ]}

          style={{
            marginBottom:
              16,
          }}
        >
          <Col
            xs={12}
            md={6}
            xl={3}
          >
            <Card
              className="attendance-stat-card"
            >
              <Statistic
                title={
                  subjectType ===
                  "STAFF"
                    ? "Total Staff"
                    : subjectType ===
                      "TRAINEE"
                    ? "Total Trainees"
                    : "Total Persons"
                }

                value={
                  summary.total_subjects ||
                  0
                }

                prefix={
                  <TeamOutlined />
                }
              />
            </Card>
          </Col>

          <Col
            xs={12}
            md={6}
            xl={3}
          >
            <Card
              className="attendance-stat-card"
            >
              <Statistic
                title="Displayed Sessions"

                value={
                  displayedSummary.total
                }

                prefix={
                  <CalendarOutlined />
                }
              />
            </Card>
          </Col>

          <Col
            xs={12}
            md={6}
            xl={3}
          >
            <Card
              className="attendance-stat-card attendance-summary-clickable"

              onClick={() =>
                applyAttendanceStatus(
                  "PRESENT"
                )
              }
            >
              <Statistic
                title="Present"

                value={
                  displayedSummary.present
                }

                valueStyle={{
                  color:
                    "#389e0d",
                }}

                prefix={
                  <CheckCircleOutlined />
                }
              />
            </Card>
          </Col>

          <Col
            xs={12}
            md={6}
            xl={3}
          >
            <Card
              className="attendance-stat-card attendance-summary-clickable"

              onClick={() =>
                applyAttendanceStatus(
                  "ABSENT"
                )
              }
            >
              <Statistic
                title="Absent"

                value={
                  displayedSummary.absent
                }

                valueStyle={{
                  color:
                    "#cf1322",
                }}

                prefix={
                  <WarningOutlined />
                }
              />
            </Card>
          </Col>

          <Col
            xs={12}
            md={6}
            xl={3}
          >
            <Card
              className="attendance-stat-card attendance-summary-clickable"

              onClick={() =>
                applyAttendanceStatus(
                  "EXEMPT"
                )
              }
            >
              <Statistic
                title="Exempt"

                value={
                  displayedSummary.exempt
                }

                valueStyle={{
                  color:
                    "#1677ff",
                }}

                prefix={
                  <UserOutlined />
                }
              />
            </Card>
          </Col>

          <Col
            xs={12}
            md={6}
            xl={3}
          >
            <Card
              className="attendance-stat-card"
            >
              <Statistic
                title="In Time"

                value={
                  displayedSummary.in_time
                }

                valueStyle={{
                  color:
                    "#389e0d",
                }}

                prefix={
                  <ClockCircleOutlined />
                }
              />
            </Card>
          </Col>

          <Col
            xs={12}
            md={6}
            xl={3}
          >
            <Card
              className="attendance-stat-card"
            >
              <Statistic
                title="Early"

                value={
                  displayedSummary.early
                }

                valueStyle={{
                  color:
                    "#08979c",
                }}
              />
            </Card>
          </Col>

          <Col
            xs={12}
            md={6}
            xl={3}
          >
            <Card
              className="attendance-stat-card"
            >
              <Statistic
                title="Late"

                value={
                  displayedSummary.late
                }

                valueStyle={{
                  color:
                    "#d46b08",
                }}
              />
            </Card>
          </Col>
        </Row>

        {/* SECONDARY SUMMARY */}

        <Card
          size="small"

          style={{
            marginBottom:
              16,
          }}
        >
          <Space
            wrap

            size="large"
          >
            <Text>
              No Timetable:{" "}
              <strong>
                {
                  displayedSummary.no_timetable
                }
              </strong>
            </Text>

            <Text>
              No Punch:{" "}
              <strong>
                {
                  displayedSummary.no_punch
                }
              </strong>
            </Text>

            <Text>
              Manual Absence:{" "}
              <strong>
                {
                  displayedSummary.manual_absence
                }
              </strong>
            </Text>

            <Text>
              Server Session Records:{" "}
              <strong>
                {summary.total_session_records ||
                  0}
              </strong>
            </Text>
          </Space>
        </Card>

        {/* SESSION SUMMARY */}

        <Row
          gutter={[
            12,
            12,
          ]}

          style={{
            marginBottom:
              16,
          }}
        >
          {(
            summary.sessions ||
            []
          ).map(
            (
              item
            ) => (
              <Col
                xs={24}
                lg={12}

                key={
                  item.session_type
                }
              >
                <Card
                  title={
                    <Space>
                      <Tag
                        color={
                          sessionColor(
                            item.session_type
                          )
                        }
                      >
                        {
                          item.session_type
                        }
                      </Tag>

                      Attendance Summary
                    </Space>
                  }

                  extra={
                    <Button
                      size="small"

                      onClick={() => {
                        setSessionType(
                          item.session_type
                        );

                        setTimeout(
                          loadAttendance,
                          0
                        );
                      }}
                    >
                      View Session
                    </Button>
                  }
                >
                  <Row
                    gutter={[
                      8,
                      8,
                    ]}
                  >
                    <Col
                      span={
                        6
                      }
                    >
                      <Statistic
                        title="Total"

                        value={
                          item.total ||
                          0
                        }

                        valueStyle={{
                          fontSize:
                            20,
                        }}
                      />
                    </Col>

                    <Col
                      span={
                        6
                      }
                    >
                      <Statistic
                        title="Present"

                        value={
                          item.present ||
                          0
                        }

                        valueStyle={{
                          fontSize:
                            20,

                          color:
                            "#389e0d",
                        }}
                      />
                    </Col>

                    <Col
                      span={
                        6
                      }
                    >
                      <Statistic
                        title="Absent"

                        value={
                          item.absent ||
                          0
                        }

                        valueStyle={{
                          fontSize:
                            20,

                          color:
                            "#cf1322",
                        }}
                      />
                    </Col>

                    <Col
                      span={
                        6
                      }
                    >
                      <Statistic
                        title="Exempt"

                        value={
                          item.exempt ||
                          0
                        }

                        valueStyle={{
                          fontSize:
                            20,

                          color:
                            "#1677ff",
                        }}
                      />
                    </Col>

                    <Col
                      span={
                        6
                      }
                    >
                      <Statistic
                        title="Early"

                        value={
                          item.early ||
                          0
                        }

                        valueStyle={{
                          fontSize:
                            18,
                        }}
                      />
                    </Col>

                    <Col
                      span={
                        6
                      }
                    >
                      <Statistic
                        title="In Time"

                        value={
                          item.in_time ||
                          0
                        }

                        valueStyle={{
                          fontSize:
                            18,
                        }}
                      />
                    </Col>

                    <Col
                      span={
                        6
                      }
                    >
                      <Statistic
                        title="Late"

                        value={
                          item.late ||
                          0
                        }

                        valueStyle={{
                          fontSize:
                            18,
                        }}
                      />
                    </Col>

                    <Col
                      span={
                        6
                      }
                    >
                      <Statistic
                        title="No Timetable"

                        value={
                          item.no_timetable ||
                          0
                        }

                        valueStyle={{
                          fontSize:
                            18,
                        }}
                      />
                    </Col>
                  </Row>
                </Card>
              </Col>
            )
          )}
        </Row>

        {/* TABLE */}

        <Card
          title={
            <Space
              wrap
            >
              <span>
                Attendance Records
              </span>

              <Tag>
                {
                  displayedRecords.length
                } displayed
              </Tag>

              {groupFilter && (
                <Tag
                  color="blue"
                >
                  {groupFilter}
                </Tag>
              )}

              {subGroupFilter && (
                <Tag
                  color="cyan"
                >
                  {subGroupFilter}
                </Tag>
              )}
            </Space>
          }
        >
          {displayedRecords.length ? (
            <Table
              rowKey="id"

              loading={
                loading
              }

              dataSource={
                displayedRecords
              }

              columns={
                columns
              }

              bordered

              size="middle"

              scroll={{
                x:
                  2150,
              }}

              pagination={{
                defaultPageSize:
                  25,

                showSizeChanger:
                  true,

                pageSizeOptions: [
                  25,
                  50,
                  100,
                  200,
                ],

                showTotal:
                  (
                    total,
                    range
                  ) =>
                    `${range[0]}-${range[1]} of ${total} attendance session records`,
              }}
            />
          ) : (
            <Empty
              description="No attendance records found for selected filters."
            />
          )}
        </Card>

        {/* DETAILS DRAWER */}

        <Drawer
          title="Attendance Details"

          width={
            760
          }

          open={
            viewOpen
          }

          onClose={() =>
            setViewOpen(
              false
            )
          }

          extra={
            selectedRecord && (
              <Button
                type="primary"

                onClick={() =>
                  openProfile(
                    selectedRecord
                  )
                }
              >
                Open Full Profile
              </Button>
            )
          }
        >
          {selectedRecord && (
            <>
              <Card
                size="small"

                style={{
                  marginBottom:
                    16,
                }}
              >
                <Title
                  level={
                    4
                  }

                  style={{
                    margin:
                      0,
                  }}
                >
                  {selectedRecord.subject_name ||
                    "Employee"}
                </Title>

                <Space
                  wrap

                  style={{
                    marginTop:
                      8,
                  }}
                >
                  <Tag
                    color="blue"
                  >
                    {selectedRecord.employee_id}
                  </Tag>

                  <Tag
                    color={
                      selectedRecord.subject_type ===
                      "TRAINEE"
                        ? "blue"
                        : "purple"
                    }
                  >
                    {selectedRecord.subject_type}
                  </Tag>

                  <Tag
                    color={
                      sessionColor(
                        selectedRecord.session_type
                      )
                    }
                  >
                    {selectedRecord.session_type}
                  </Tag>
                </Space>
              </Card>

              <Descriptions
                bordered

                column={
                  1
                }

                size="small"
              >
                <Descriptions.Item label="Employee ID / Cap No.">
                  <Button
                    type="link"

                    style={{
                      padding:
                        0,

                      height:
                        "auto",

                      fontWeight:
                        700,
                    }}

                    onClick={() =>
                      openProfile(
                        selectedRecord
                      )
                    }
                  >
                    {
                      selectedRecord.employee_id
                    }
                  </Button>
                </Descriptions.Item>

                <Descriptions.Item label="Name">
                  {selectedRecord.subject_name ||
                    "-"}
                </Descriptions.Item>

                <Descriptions.Item label="Type">
                  {
                    selectedRecord.subject_type
                  }
                </Descriptions.Item>

                <Descriptions.Item label="Course / Category">
                  {getGroupName(
                    selectedRecord
                  )}
                </Descriptions.Item>

                <Descriptions.Item label="Platoon / Branch">
                  {getSubGroupName(
                    selectedRecord
                  )}
                </Descriptions.Item>

                <Descriptions.Item label="Date">
                  {dayjs(
                    selectedRecord.attendance_date
                  ).format(
                    "DD-MMM-YYYY"
                  )}
                </Descriptions.Item>

                <Descriptions.Item label="Session">
                  <Tag
                    color={
                      sessionColor(
                        selectedRecord.session_type
                      )
                    }
                  >
                    {
                      selectedRecord.session_type
                    }
                  </Tag>
                </Descriptions.Item>

                <Descriptions.Item label="Attendance Status">
                  <Tag
                    color={
                      statusColor(
                        selectedRecord.attendance_status
                      )
                    }
                  >
                    {
                      selectedRecord.attendance_status
                    }
                  </Tag>
                </Descriptions.Item>

                <Descriptions.Item label="Timing">
                  <Tag
                    color={
                      timingColor(
                        selectedRecord.timing_status
                      )
                    }
                  >
                    {
                      selectedRecord.timing_status
                    }
                  </Tag>

                  {selectedRecord.timing_minutes !==
                    null &&
                    selectedRecord.timing_minutes !==
                      undefined &&
                    [
                      "EARLY",
                      "LATE",
                    ].includes(
                      selectedRecord.timing_status
                    ) && (
                      <>
                        {" "}
                        {
                          selectedRecord.timing_minutes
                        }{" "}
                        minutes
                      </>
                    )}
                </Descriptions.Item>

                <Descriptions.Item label="Selected Punch">
                  {formatDateTime(
                    selectedRecord.selected_punch
                  )}
                </Descriptions.Item>

                <Descriptions.Item label="Transaction ID">
                  {selectedRecord.transaction_id ||
                    "-"}
                </Descriptions.Item>

                <Descriptions.Item label="Timetable">
                  {selectedRecord.timetable_name ||
                    "-"}
                </Descriptions.Item>

                <Descriptions.Item label="Normal Window">
                  {formatDateTime(
                    selectedRecord.window_start
                  )}
                  {" → "}
                  {formatDateTime(
                    selectedRecord.window_end
                  )}
                </Descriptions.Item>

                <Descriptions.Item label="Allowed Attendance Window">
                  {formatDateTime(
                    selectedRecord.early_window_start
                  )}
                  {" → "}
                  {formatDateTime(
                    selectedRecord.late_window_end
                  )}
                </Descriptions.Item>

                <Descriptions.Item label="Exemption">
                  {selectedRecord.exemption_type ? (
                    <Space
                      direction="vertical"

                      size={
                        3
                      }
                    >
                      <Tag
                        color="blue"
                      >
                        {
                          selectedRecord.exemption_type
                        }
                      </Tag>

                      {selectedRecord.exemption_description && (
                        <Text>
                          {
                            selectedRecord.exemption_description
                          }
                        </Text>
                      )}
                    </Space>
                  ) : (
                    "-"
                  )}
                </Descriptions.Item>

                <Descriptions.Item label="Manual Absence">
                  {Number(
                    selectedRecord.has_manual_absence
                  ) ===
                  1 ? (
                    <Tag
                      color="red"
                    >
                      Yes — Manual Absence Recorded
                    </Tag>
                  ) : (
                    <Tag>
                      No
                    </Tag>
                  )}
                </Descriptions.Item>

                <Descriptions.Item label="Processed At">
                  {formatDateTime(
                    selectedRecord.processed_at
                  )}
                </Descriptions.Item>
              </Descriptions>

              {parseManualAbsence(
                selectedRecord.manual_absence_data
              ).length >
                0 && (
                <Card
                  size="small"

                  title="Manual Absence Records"

                  style={{
                    marginTop:
                      16,
                  }}
                >
                  {parseManualAbsence(
                    selectedRecord.manual_absence_data
                  ).map(
                    (
                      item,
                      index
                    ) => (
                      <Descriptions
                        key={
                          item.id ||
                          index
                        }

                        bordered

                        size="small"

                        column={
                          1
                        }

                        style={{
                          marginBottom:
                            12,
                        }}
                      >
                        <Descriptions.Item label="Category">
                          {item.absence_category ||
                            "-"}
                        </Descriptions.Item>

                        <Descriptions.Item label="Program / Class">
                          {item.program_class ||
                            "-"}
                        </Descriptions.Item>

                        <Descriptions.Item label="From">
                          {formatDateTime(
                            item.start_datetime
                          )}
                        </Descriptions.Item>

                        <Descriptions.Item label="To">
                          {formatDateTime(
                            item.end_datetime
                          )}
                        </Descriptions.Item>

                        <Descriptions.Item label="Reason">
                          {item.reason ||
                            "-"}
                        </Descriptions.Item>

                        {item.remarks && (
                          <Descriptions.Item label="Remarks">
                            {
                              item.remarks
                            }
                          </Descriptions.Item>
                        )}
                      </Descriptions>
                    )
                  )}
                </Card>
              )}
            </>
          )}
        </Drawer>
      </div>

      {/* PRINT / PDF DOCUMENT */}

      <div
        className="attendance-print-root"
      >
        <div
          className="attendance-print-header"
        >
          <div
            className="attendance-print-title"
          >
            PUNJAB POLICE
          </div>

          <div
            className="attendance-print-subtitle"
          >
            POLICE TRAINING SCHOOL FAROOQABAD
          </div>

          <div>
            BIOMETRIC ATTENDANCE REPORT
          </div>
        </div>

        <table
          className="attendance-print-meta"
        >
          <tbody>
            <tr>
              <td>
                <strong>
                  Date
                </strong>
              </td>

              <td>
                {attendanceDate.format(
                  "DD-MMM-YYYY"
                )}
              </td>

              <td>
                <strong>
                  Type
                </strong>
              </td>

              <td>
                {subjectType ===
                "ALL"
                  ? "Trainees + Staff"
                  : subjectType}
              </td>

              <td>
                <strong>
                  Session
                </strong>
              </td>

              <td>
                {sessionType ||
                  "All"}
              </td>
            </tr>

            <tr>
              <td>
                <strong>
                  Course / Category
                </strong>
              </td>

              <td>
                {groupFilter ||
                  "All"}
              </td>

              <td>
                <strong>
                  Platoon / Branch
                </strong>
              </td>

              <td>
                {subGroupFilter ||
                  "All"}
              </td>

              <td>
                <strong>
                  Records
                </strong>
              </td>

              <td>
                {
                  displayedRecords.length
                }
              </td>
            </tr>

            <tr>
              <td>
                <strong>
                  Present
                </strong>
              </td>

              <td>
                {
                  displayedSummary.present
                }
              </td>

              <td>
                <strong>
                  Absent
                </strong>
              </td>

              <td>
                {
                  displayedSummary.absent
                }
              </td>

              <td>
                <strong>
                  Exempt
                </strong>
              </td>

              <td>
                {
                  displayedSummary.exempt
                }
              </td>
            </tr>
          </tbody>
        </table>

        <table
          className="attendance-print-table"
        >
          <thead>
            <tr>
              <th>
                #
              </th>

              <th>
                Employee ID
              </th>

              <th>
                Name
              </th>

              <th>
                Course / Category
              </th>

              <th>
                Platoon / Branch
              </th>

              <th>
                Session
              </th>

              <th>
                Punch
              </th>

              <th>
                Attendance
              </th>

              <th>
                Timing
              </th>

              <th>
                Exemption
              </th>

              <th>
                Manual
              </th>
            </tr>
          </thead>

          <tbody>
            {displayedRecords.map(
              (
                row,
                index
              ) => (
                <tr
                  key={
                    row.id ||
                    index
                  }
                >
                  <td>
                    {
                      index +
                      1
                    }
                  </td>

                  <td>
                    {row.employee_id ||
                      "-"}
                  </td>

                  <td>
                    {row.subject_name ||
                      "-"}
                  </td>

                  <td>
                    {getGroupName(
                      row
                    )}
                  </td>

                  <td>
                    {getSubGroupName(
                      row
                    )}
                  </td>

                  <td>
                    {row.session_type ||
                      "-"}
                  </td>

                  <td>
                    {formatTime(
                      row.selected_punch
                    )}
                  </td>

                  <td>
                    {row.attendance_status ||
                      "-"}
                  </td>

                  <td>
                    {row.timing_status ||
                      "-"}

                    {row.timing_minutes !==
                      null &&
                    row.timing_minutes !==
                      undefined &&
                    [
                      "EARLY",
                      "LATE",
                    ].includes(
                      row.timing_status
                    )
                      ? ` (${row.timing_minutes} min)`
                      : ""}
                  </td>

                  <td>
                    {row.exemption_type ||
                      "-"}
                  </td>

                  <td>
                    {Number(
                      row.has_manual_absence
                    ) ===
                    1
                      ? "Yes"
                      : "No"}
                  </td>
                </tr>
              )
            )}
          </tbody>
        </table>

        <div
          className="attendance-print-footer"
        >
          <span>
            Printed:{" "}
            {dayjs().format(
              "DD-MMM-YYYY hh:mm A"
            )}
          </span>

          <span>
            Police Training School Farooqabad
          </span>
        </div>
      </div>
    </>
  );
}