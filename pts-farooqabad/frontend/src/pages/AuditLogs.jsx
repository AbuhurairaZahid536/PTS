import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  Alert,
  Button,
  Card,
  Col,
  DatePicker,
  Descriptions,
  Empty,
  Input,
  Modal,
  Row,
  Select,
  Space,
  Spin,
  Table,
  Tag,
  Typography,
  message,
} from "antd";

import {
  ClearOutlined,
  EyeOutlined,
  ReloadOutlined,
  SearchOutlined,
  SafetyCertificateOutlined,
} from "@ant-design/icons";

import api from "../services/api";


const {
  Title,
  Text,
} = Typography;


const {
  RangePicker,
} = DatePicker;


/*
|--------------------------------------------------------------------------
| DATE
|--------------------------------------------------------------------------
*/

function formatDateTime(
  value
) {
  if (!value) {
    return "-";
  }

  const date =
    new Date(
      value
    );

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return String(
      value
    );
  }

  return date.toLocaleString();
}


/*
|--------------------------------------------------------------------------
| ACTION COLOR
|--------------------------------------------------------------------------
*/

function actionColor(
  action
) {
  const value =
    String(
      action ||
      ""
    ).toUpperCase();


  if (
    value.includes(
      "DELETE"
    ) ||
    value.includes(
      "DEACTIVATE"
    ) ||
    value.includes(
      "REJECT"
    ) ||
    value.includes(
      "CANCEL"
    ) ||
    value.includes(
      "REMOVE"
    )
  ) {
    return "red";
  }


  if (
    value.includes(
      "CREATE"
    ) ||
    value.includes(
      "ADD"
    ) ||
    value.includes(
      "UPLOAD"
    ) ||
    value.includes(
      "ACTIVATE"
    ) ||
    value.includes(
      "APPROVE"
    )
  ) {
    return "green";
  }


  if (
    value.includes(
      "UPDATE"
    ) ||
    value.includes(
      "EDIT"
    ) ||
    value.includes(
      "CHANGE"
    ) ||
    value.includes(
      "REPLACE"
    )
  ) {
    return "blue";
  }


  if (
    value.includes(
      "PASSWORD"
    ) ||
    value.includes(
      "PERMISSION"
    )
  ) {
    return "orange";
  }


  return "default";
}


/*
|--------------------------------------------------------------------------
| DATA HELPERS
|--------------------------------------------------------------------------
*/

function parseData(
  value
) {
  if (
    value ===
      null ||
    value ===
      undefined ||
    value ===
      ""
  ) {
    return null;
  }


  if (
    typeof value ===
    "object"
  ) {
    return value;
  }


  try {
    return JSON.parse(
      value
    );
  } catch {
    return value;
  }
}


function isPlainObject(
  value
) {
  return (
    value !==
      null &&
    typeof value ===
      "object" &&
    !Array.isArray(
      value
    )
  );
}


function valuesEqual(
  first,
  second
) {
  if (
    first ===
    second
  ) {
    return true;
  }


  try {
    return (
      JSON.stringify(
        first
      ) ===
      JSON.stringify(
        second
      )
    );
  } catch {
    return false;
  }
}


/*
|--------------------------------------------------------------------------
| FRIENDLY FIELD NAMES
|--------------------------------------------------------------------------
*/

const FIELD_LABELS = {
  id:
    "ID",

  employee_id:
    "Employee ID",

  first_name:
    "First Name",

  last_name:
    "Last Name",

  father_name:
    "Father Name",

  full_name:
    "Full Name",

  username:
    "Username",

  phone:
    "Phone",

  email:
    "Email",

  address:
    "Address",

  course_id:
    "Course",

  course_name:
    "Course",

  platoon_id:
    "Platoon",

  platoon_name:
    "Platoon",

  category:
    "Category",

  branch:
    "Branch",

  status:
    "Status",

  title:
    "Title",

  description:
    "Description",

  designation:
    "Designation",

  name:
    "Name",

  short:
    "Short Name",

  badge:
    "Small Heading",

  title_line_1:
    "Title Line 1",

  title_line_2:
    "Title Line 2",

  primary_button:
    "Primary Button",

  secondary_button:
    "Secondary Button",

  school_name:
    "School Name",

  short_name:
    "Short Name",

  department:
    "Department",

  motto:
    "Motto",

  location:
    "Location",

  visitor_hours:
    "Visitor Hours",

  message:
    "Message",

  kicker:
    "Section Label",

  caption:
    "Caption",

  media_id:
    "Picture",

  photo_media_id:
    "Picture",

  logo_media_id:
    "Logo",

  department_logo_media_id:
    "Department Logo",

  main_media_id:
    "Main Picture",

  secondary_media_id:
    "Secondary Picture",

  is_active:
    "Visible / Active",

  sort_order:
    "Sort Order",

  value:
    "Value",

  label:
    "Label",

  icon:
    "Icon",

  year:
    "Year",
};


function humanizeKey(
  key
) {
  const raw =
    String(
      key ||
      ""
    );


  if (
    FIELD_LABELS[
      raw
    ]
  ) {
    return FIELD_LABELS[
      raw
    ];
  }


  return raw
    .replace(
      /_/g,
      " "
    )
    .replace(
      /\b\w/g,
      (
        character
      ) =>
        character.toUpperCase()
    );
}


function humanizePath(
  path
) {
  if (
    !path ||
    !path.length
  ) {
    return "Record";
  }


  return path
    .map(
      (
        part
      ) => {
        if (
          typeof part ===
          "number"
        ) {
          return `Item #${
            part +
            1
          }`;
        }

        return humanizeKey(
          part
        );
      }
    )
    .join(
      "  ›  "
    );
}


/*
|--------------------------------------------------------------------------
| VALUE DISPLAY
|--------------------------------------------------------------------------
*/

function friendlyValue(
  value
) {
  if (
    value ===
      null ||
    value ===
      undefined ||
    value ===
      ""
  ) {
    return "-";
  }


  if (
    typeof value ===
    "boolean"
  ) {
    return value
      ? "Yes"
      : "No";
  }


  if (
    typeof value ===
    "number"
  ) {
    return String(
      value
    );
  }


  if (
    typeof value ===
    "string"
  ) {
    return value;
  }


  if (
    Array.isArray(
      value
    )
  ) {
    if (
      value.length ===
      0
    ) {
      return "-";
    }


    if (
      value.every(
        (
          item
        ) =>
          item ===
            null ||
          [
            "string",
            "number",
            "boolean",
          ].includes(
            typeof item
          )
      )
    ) {
      return value
        .map(
          friendlyValue
        )
        .join(
          ", "
        );
    }


    return `${value.length} item(s)`;
  }


  if (
    isPlainObject(
      value
    )
  ) {
    const entries =
      Object.entries(
        value
      );


    if (
      entries.length ===
      0
    ) {
      return "-";
    }


    return entries
      .slice(
        0,
        5
      )
      .map(
        ([
          key,
          currentValue,
        ]) =>
          `${humanizeKey(
            key
          )}: ${friendlyValue(
            currentValue
          )}`
      )
      .join(
        " | "
      );
  }


  return String(
    value
  );
}


/*
|--------------------------------------------------------------------------
| DIFFERENCE ENGINE
|--------------------------------------------------------------------------
|
| Raw JSON ki jagah actual changed fields return karta hai.
|
|--------------------------------------------------------------------------
*/

function buildDifferences(
  oldValue,
  newValue,
  path = []
) {
  /*
  |--------------------------------------------------------------------------
  | SAME
  |--------------------------------------------------------------------------
  */

  if (
    valuesEqual(
      oldValue,
      newValue
    )
  ) {
    return [];
  }


  /*
  |--------------------------------------------------------------------------
  | BOTH OBJECTS
  |--------------------------------------------------------------------------
  */

  if (
    isPlainObject(
      oldValue
    ) &&
    isPlainObject(
      newValue
    )
  ) {
    const keys =
      new Set([
        ...Object.keys(
          oldValue
        ),

        ...Object.keys(
          newValue
        ),
      ]);


    const changes = [];


    keys.forEach(
      (
        key
      ) => {
        changes.push(
          ...buildDifferences(
            oldValue[
              key
            ],

            newValue[
              key
            ],

            [
              ...path,
              key,
            ]
          )
        );
      }
    );


    return changes;
  }


  /*
  |--------------------------------------------------------------------------
  | BOTH ARRAYS
  |--------------------------------------------------------------------------
  */

  if (
    Array.isArray(
      oldValue
    ) &&
    Array.isArray(
      newValue
    )
  ) {
    /*
     * Primitive arrays:
     * aik hi row mein before / after dikhayenge.
     */

    const primitiveOld =
      oldValue.every(
        (
          item
        ) =>
          item ===
            null ||
          [
            "string",
            "number",
            "boolean",
          ].includes(
            typeof item
          )
      );


    const primitiveNew =
      newValue.every(
        (
          item
        ) =>
          item ===
            null ||
          [
            "string",
            "number",
            "boolean",
          ].includes(
            typeof item
          )
      );


    if (
      primitiveOld &&
      primitiveNew
    ) {
      return [
        {
          field:
            humanizePath(
              path
            ),

          path,

          type:
            "CHANGED",

          oldValue,

          newValue,
        },
      ];
    }


    /*
     * Object arrays:
     * item-by-item compare.
     */

    const maximum =
      Math.max(
        oldValue.length,
        newValue.length
      );


    const changes = [];


    for (
      let index = 0;
      index <
      maximum;
      index +=
        1
    ) {
      const oldItem =
        oldValue[
          index
        ];

      const newItem =
        newValue[
          index
        ];


      if (
        oldItem ===
          undefined
      ) {
        changes.push({
          field:
            humanizePath([
              ...path,
              index,
            ]),

          path: [
            ...path,
            index,
          ],

          type:
            "ADDED",

          oldValue:
            null,

          newValue:
            newItem,
        });

        continue;
      }


      if (
        newItem ===
          undefined
      ) {
        changes.push({
          field:
            humanizePath([
              ...path,
              index,
            ]),

          path: [
            ...path,
            index,
          ],

          type:
            "REMOVED",

          oldValue:
            oldItem,

          newValue:
            null,
        });

        continue;
      }


      changes.push(
        ...buildDifferences(
          oldItem,
          newItem,
          [
            ...path,
            index,
          ]
        )
      );
    }


    return changes;
  }


  /*
  |--------------------------------------------------------------------------
  | ADDED
  |--------------------------------------------------------------------------
  */

  if (
    oldValue ===
      undefined ||
    oldValue ===
      null
  ) {
    return [
      {
        field:
          humanizePath(
            path
          ),

        path,

        type:
          "ADDED",

        oldValue:
          null,

        newValue,
      },
    ];
  }


  /*
  |--------------------------------------------------------------------------
  | REMOVED
  |--------------------------------------------------------------------------
  */

  if (
    newValue ===
      undefined ||
    newValue ===
      null
  ) {
    return [
      {
        field:
          humanizePath(
            path
          ),

        path,

        type:
          "REMOVED",

        oldValue,

        newValue:
          null,
      },
    ];
  }


  /*
  |--------------------------------------------------------------------------
  | CHANGED
  |--------------------------------------------------------------------------
  */

  return [
    {
      field:
        humanizePath(
          path
        ),

      path,

      type:
        "CHANGED",

      oldValue,

      newValue,
    },
  ];
}


/*
|--------------------------------------------------------------------------
| CHANGE TYPE
|--------------------------------------------------------------------------
*/

function changeTypeTag(
  type
) {
  switch (
    type
  ) {
    case "ADDED":
      return (
        <Tag color="green">
          ADDED
        </Tag>
      );

    case "REMOVED":
      return (
        <Tag color="red">
          REMOVED
        </Tag>
      );

    default:
      return (
        <Tag color="blue">
          CHANGED
        </Tag>
      );
  }
}


/*
|--------------------------------------------------------------------------
| VALUE CELL
|--------------------------------------------------------------------------
*/

function ChangeValue({
  value,
  emptyText = "-",
}) {
  const displayed =
    friendlyValue(
      value
    );


  if (
    displayed ===
    "-"
  ) {
    return (
      <Text type="secondary">
        {emptyText}
      </Text>
    );
  }


  return (
    <div
      style={{
        whiteSpace:
          "pre-wrap",

        wordBreak:
          "break-word",

        lineHeight:
          1.55,
      }}
    >
      {displayed}
    </div>
  );
}


/*
|--------------------------------------------------------------------------
| AUDIT LOGS
|--------------------------------------------------------------------------
*/

export default function AuditLogs() {
  const [
    loading,
    setLoading,
  ] =
    useState(
      false
    );


  const [
    detailLoading,
    setDetailLoading,
  ] =
    useState(
      false
    );


  const [
    rows,
    setRows,
  ] =
    useState([]);


  const [
    options,
    setOptions,
  ] =
    useState({
      modules:
        [],

      actions:
        [],

      users:
        [],
    });


  const [
    search,
    setSearch,
  ] =
    useState("");


  const [
    moduleFilter,
    setModuleFilter,
  ] =
    useState(
      null
    );


  const [
    actionFilter,
    setActionFilter,
  ] =
    useState(
      null
    );


  const [
    userFilter,
    setUserFilter,
  ] =
    useState(
      null
    );


  const [
    dateRange,
    setDateRange,
  ] =
    useState(
      null
    );


  const [
    pagination,
    setPagination,
  ] =
    useState({
      current:
        1,

      pageSize:
        20,

      total:
        0,
    });


  const [
    detailOpen,
    setDetailOpen,
  ] =
    useState(
      false
    );


  const [
    selectedLog,
    setSelectedLog,
  ] =
    useState(
      null
    );


  const requestIdRef =
    useRef(
      0
    );


  /*
  |--------------------------------------------------------------------------
  | OPTIONS
  |--------------------------------------------------------------------------
  */

  const loadOptions =
    useCallback(
      async () => {
        try {
          const response =
            await api.get(
              "/audit-logs/options"
            );


          const data =
            response.data
              ?.data ||
            {};


          setOptions({
            modules:
              Array.isArray(
                data.modules
              )
                ? data.modules
                : [],

            actions:
              Array.isArray(
                data.actions
              )
                ? data.actions
                : [],

            users:
              Array.isArray(
                data.users
              )
                ? data.users
                : [],
          });

        } catch (error) {
          message.error(
            error.response
              ?.data
              ?.message ||
              "Could not load Audit Log filters."
          );
        }
      },
      []
    );


  /*
  |--------------------------------------------------------------------------
  | LOAD LOGS
  |--------------------------------------------------------------------------
  */

  const loadLogs =
    useCallback(
      async ({
        page =
          pagination.current,

        pageSize =
          pagination.pageSize,
      } = {}) => {
        const requestId =
          requestIdRef.current +
          1;


        requestIdRef.current =
          requestId;


        setLoading(
          true
        );


        try {
          const params = {
            page,

            limit:
              pageSize,
          };


          const cleanSearch =
            String(
              search ||
              ""
            ).trim();


          if (
            cleanSearch
          ) {
            params.search =
              cleanSearch;
          }


          if (
            moduleFilter
          ) {
            params.module =
              moduleFilter;
          }


          if (
            actionFilter
          ) {
            params.action =
              actionFilter;
          }


          if (
            userFilter
          ) {
            params.user_id =
              userFilter;
          }


          if (
            dateRange?.[
              0
            ] &&
            dateRange?.[
              1
            ]
          ) {
            params.date_from =
              dateRange[
                0
              ].format(
                "YYYY-MM-DD"
              );

            params.date_to =
              dateRange[
                1
              ].format(
                "YYYY-MM-DD"
              );
          }


          const response =
            await api.get(
              "/audit-logs",
              {
                params,
              }
            );


          if (
            requestId !==
            requestIdRef.current
          ) {
            return;
          }


          const data =
            response.data
              ?.data ||
            [];


          const serverPagination =
            response.data
              ?.pagination ||
            {};


          setRows(
            Array.isArray(
              data
            )
              ? data
              : []
          );


          setPagination({
            current:
              Number(
                serverPagination.page ||
                  page
              ),

            pageSize:
              Number(
                serverPagination.limit ||
                  pageSize
              ),

            total:
              Number(
                serverPagination.total ||
                  0
              ),
          });

        } catch (error) {
          if (
            requestId ===
            requestIdRef.current
          ) {
            message.error(
              error.response
                ?.data
                ?.message ||
                "Could not load Audit Logs."
            );
          }

        } finally {
          if (
            requestId ===
            requestIdRef.current
          ) {
            setLoading(
              false
            );
          }
        }
      },
      [
        search,
        moduleFilter,
        actionFilter,
        userFilter,
        dateRange,
        pagination.current,
        pagination.pageSize,
      ]
    );


  useEffect(
    () => {
      loadOptions();

      loadLogs({
        page:
          1,

        pageSize:
          20,
      });

      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    []
  );


  /*
  |--------------------------------------------------------------------------
  | SEARCH
  |--------------------------------------------------------------------------
  */

  const runSearch =
    () => {
      loadLogs({
        page:
          1,

        pageSize:
          pagination.pageSize,
      });
    };


  const clearFilters =
    async () => {
      setSearch(
        ""
      );

      setModuleFilter(
        null
      );

      setActionFilter(
        null
      );

      setUserFilter(
        null
      );

      setDateRange(
        null
      );


      setLoading(
        true
      );


      try {
        const response =
          await api.get(
            "/audit-logs",
            {
              params: {
                page:
                  1,

                limit:
                  pagination.pageSize,
              },
            }
          );


        const data =
          response.data
            ?.data ||
          [];


        const pageData =
          response.data
            ?.pagination ||
          {};


        setRows(
          Array.isArray(
            data
          )
            ? data
            : []
        );


        setPagination({
          current:
            Number(
              pageData.page ||
                1
            ),

          pageSize:
            Number(
              pageData.limit ||
                pagination.pageSize
            ),

          total:
            Number(
              pageData.total ||
                0
            ),
        });

      } catch (error) {
        message.error(
          error.response
            ?.data
            ?.message ||
            "Could not load Audit Logs."
        );

      } finally {
        setLoading(
          false
        );
      }
    };


  /*
  |--------------------------------------------------------------------------
  | DETAILS
  |--------------------------------------------------------------------------
  */

  const openDetails =
    async (
      record
    ) => {
      setSelectedLog(
        null
      );

      setDetailOpen(
        true
      );

      setDetailLoading(
        true
      );


      try {
        const response =
          await api.get(
            `/audit-logs/${record.id}`
          );


        setSelectedLog(
          response.data
            ?.data ||
            null
        );

      } catch (error) {
        message.error(
          error.response
            ?.data
            ?.message ||
            "Could not load Audit Log details."
        );


        setDetailOpen(
          false
        );

      } finally {
        setDetailLoading(
          false
        );
      }
    };


  /*
  |--------------------------------------------------------------------------
  | MAIN TABLE
  |--------------------------------------------------------------------------
  */

  const columns = [
    {
      title:
        "Date & Time",

      dataIndex:
        "created_at",

      key:
        "created_at",

      width:
        175,

      render:
        (
          value
        ) =>
          formatDateTime(
            value
          ),
    },

    {
      title:
        "User",

      key:
        "user",

      width:
        180,

      render:
        (
          _,
          record
        ) => (
          <div>
            <Text strong>
              {record.full_name ||
                record.username ||
                "System"}
            </Text>

            {record.username && (
              <div>
                <Text
                  type="secondary"
                  style={{
                    fontSize:
                      11,
                  }}
                >
                  {
                    record.username
                  }
                </Text>
              </div>
            )}
          </div>
        ),
    },

    {
      title:
        "Module",

      dataIndex:
        "module",

      key:
        "module",

      width:
        150,

      render:
        (
          value
        ) => (
          <Tag color="geekblue">
            {value ||
              "-"}
          </Tag>
        ),
    },

    {
      title:
        "Action",

      dataIndex:
        "action",

      key:
        "action",

      width:
        150,

      render:
        (
          value
        ) => (
          <Tag
            color={
              actionColor(
                value
              )
            }
          >
            {value ||
              "-"}
          </Tag>
        ),
    },

    {
      title:
        "Record ID",

      dataIndex:
        "record_id",

      key:
        "record_id",

      width:
        110,

      render:
        (
          value
        ) =>
          value ||
          "-",
    },

    {
      title:
        "Description",

      dataIndex:
        "description",

      key:
        "description",

      ellipsis:
        true,

      render:
        (
          value
        ) =>
          value ||
          "-",
    },

    {
      title:
        "IP Address",

      dataIndex:
        "ip_address",

      key:
        "ip_address",

      width:
        145,

      render:
        (
          value
        ) =>
          value ||
          "-",
    },

    {
      title:
        "Details",

      key:
        "details",

      width:
        95,

      fixed:
        "right",

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
            onClick={() =>
              openDetails(
                record
              )
            }
          >
            View
          </Button>
        ),
    },
  ];


  /*
  |--------------------------------------------------------------------------
  | CHANGES FOR SELECTED LOG
  |--------------------------------------------------------------------------
  */

  const oldData =
    parseData(
      selectedLog?.old_data
    );


  const newData =
    parseData(
      selectedLog?.new_data
    );


  const changes =
    selectedLog
      ? buildDifferences(
          oldData,
          newData
        )
      : [];


  const changeColumns = [
    {
      title:
        "Field",

      dataIndex:
        "field",

      key:
        "field",

      width:
        260,

      render:
        (
          value
        ) => (
          <Text strong>
            {
              value
            }
          </Text>
        ),
    },

    {
      title:
        "Change",

      dataIndex:
        "type",

      key:
        "type",

      width:
        100,

      render:
        (
          value
        ) =>
          changeTypeTag(
            value
          ),
    },

    {
      title:
        "Previous Value",

      dataIndex:
        "oldValue",

      key:
        "oldValue",

      width:
        280,

      render:
        (
          value,
          record
        ) => (
          <ChangeValue
            value={
              value
            }
            emptyText={
              record.type ===
              "ADDED"
                ? "Not previously set"
                : "-"
            }
          />
        ),
    },

    {
      title:
        "New Value",

      dataIndex:
        "newValue",

      key:
        "newValue",

      width:
        280,

      render:
        (
          value,
          record
        ) => (
          <ChangeValue
            value={
              value
            }
            emptyText={
              record.type ===
              "REMOVED"
                ? "Removed"
                : "-"
            }
          />
        ),
    },
  ];


  return (
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
            level={3}
            style={{
              margin:
                0,
            }}
          >
            Audit Logs
          </Title>

          <Text type="secondary">
            Complete activity history of users and administrative actions.
          </Text>
        </div>


        <Space>
          <Tag
            color="blue"
            icon={
              <SafetyCertificateOutlined />
            }
          >
            {pagination.total} Records
          </Tag>


          <Button
            icon={
              <ReloadOutlined />
            }
            loading={
              loading
            }
            onClick={() =>
              loadLogs()
            }
          >
            Refresh
          </Button>
        </Space>
      </div>


      {/* FILTERS */}

      <Card
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
            xl={7}
          >
            <Input
              allowClear
              prefix={
                <SearchOutlined />
              }
              placeholder="Search description, user, record ID or IP"
              value={
                search
              }
              onChange={(
                event
              ) =>
                setSearch(
                  event.target
                    .value
                )
              }
              onPressEnter={
                runSearch
              }
            />
          </Col>


          <Col
            xs={24}
            md={12}
            xl={4}
          >
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="Module"
              style={{
                width:
                  "100%",
              }}
              value={
                moduleFilter
              }
              onChange={
                setModuleFilter
              }
              options={
                options.modules.map(
                  (
                    value
                  ) => ({
                    value,

                    label:
                      value,
                  })
                )
              }
            />
          </Col>


          <Col
            xs={24}
            md={12}
            xl={4}
          >
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="Action"
              style={{
                width:
                  "100%",
              }}
              value={
                actionFilter
              }
              onChange={
                setActionFilter
              }
              options={
                options.actions.map(
                  (
                    value
                  ) => ({
                    value,

                    label:
                      value,
                  })
                )
              }
            />
          </Col>


          <Col
            xs={24}
            md={12}
            xl={4}
          >
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="User"
              style={{
                width:
                  "100%",
              }}
              value={
                userFilter
              }
              onChange={
                setUserFilter
              }
              options={
                options.users.map(
                  (
                    item
                  ) => ({
                    value:
                      Number(
                        item.id
                      ),

                    label:
                      `${
                        item.full_name ||
                        item.username
                      }${
                        item.username
                          ? ` (${item.username})`
                          : ""
                      }`,
                  })
                )
              }
            />
          </Col>


          <Col
            xs={24}
            md={12}
            xl={5}
          >
            <RangePicker
              value={
                dateRange
              }
              onChange={
                setDateRange
              }
              style={{
                width:
                  "100%",
              }}
            />
          </Col>


          <Col span={24}>
            <Space>
              <Button
                type="primary"
                icon={
                  <SearchOutlined />
                }
                loading={
                  loading
                }
                onClick={
                  runSearch
                }
              >
                Search
              </Button>


              <Button
                icon={
                  <ClearOutlined />
                }
                onClick={
                  clearFilters
                }
              >
                Clear Filters
              </Button>
            </Space>
          </Col>
        </Row>
      </Card>


      {/* LOG TABLE */}

      <Card>
        <Table
          rowKey="id"

          loading={
            loading
          }

          dataSource={
            rows
          }

          columns={
            columns
          }

          scroll={{
            x:
              1300,
          }}

          pagination={{
            current:
              pagination.current,

            pageSize:
              pagination.pageSize,

            total:
              pagination.total,

            showSizeChanger:
              true,

            pageSizeOptions: [
              "20",
              "50",
              "100",
            ],

            showTotal:
              (
                total,
                range
              ) =>
                `${range[0]}-${range[1]} of ${total} logs`,
          }}

          onChange={(
            tablePagination
          ) =>
            loadLogs({
              page:
                tablePagination.current,

              pageSize:
                tablePagination.pageSize,
            })
          }
        />
      </Card>


      {/* ================================================================
          AUDIT DETAIL
      ================================================================= */}

      <Modal
        title="Audit Log Details"

        open={
          detailOpen
        }

        width={
          1150
        }

        footer={
          null
        }

        onCancel={() =>
          setDetailOpen(
            false
          )
        }
      >
        {detailLoading ? (
          <div
            style={{
              minHeight:
                300,

              display:
                "flex",

              alignItems:
                "center",

              justifyContent:
                "center",
            }}
          >
            <Spin size="large" />
          </div>
        ) : selectedLog ? (
          <>

            {/* BASIC INFORMATION */}

            <Descriptions
              bordered
              size="small"
              column={{
                xs:
                  1,

                sm:
                  2,

                lg:
                  3,
              }}
              style={{
                marginBottom:
                  18,
              }}
            >
              <Descriptions.Item label="Log ID">
                {
                  selectedLog.id
                }
              </Descriptions.Item>


              <Descriptions.Item label="Date & Time">
                {formatDateTime(
                  selectedLog.created_at
                )}
              </Descriptions.Item>


              <Descriptions.Item label="User">
                {selectedLog.full_name ||
                  selectedLog.username ||
                  "System"}
              </Descriptions.Item>


              <Descriptions.Item label="Username">
                {selectedLog.username ||
                  "-"}
              </Descriptions.Item>


              <Descriptions.Item label="Module">
                <Tag color="geekblue">
                  {selectedLog.module ||
                    "-"}
                </Tag>
              </Descriptions.Item>


              <Descriptions.Item label="Action">
                <Tag
                  color={
                    actionColor(
                      selectedLog.action
                    )
                  }
                >
                  {selectedLog.action ||
                    "-"}
                </Tag>
              </Descriptions.Item>


              <Descriptions.Item label="Record ID">
                {selectedLog.record_id ||
                  "-"}
              </Descriptions.Item>


              <Descriptions.Item label="IP Address">
                {selectedLog.ip_address ||
                  "-"}
              </Descriptions.Item>


              <Descriptions.Item
                label="Description"
                span={1}
              >
                {selectedLog.description ||
                  "-"}
              </Descriptions.Item>
            </Descriptions>


            {/* EXACT CHANGES */}

            <Card
              title={
                <Space>
                  <span>
                    Exact Changes
                  </span>

                  <Tag
                    color={
                      changes.length
                        ? "blue"
                        : "default"
                    }
                  >
                    {changes.length} Change
                    {changes.length ===
                    1
                      ? ""
                      : "s"}
                  </Tag>
                </Space>
              }
            >
              {changes.length ? (
                <Table
                  rowKey={(
                    record,
                    index
                  ) =>
                    `${
                      record.field
                    }-${index}`
                  }

                  dataSource={
                    changes
                  }

                  columns={
                    changeColumns
                  }

                  pagination={
                    false
                  }

                  size="middle"

                  scroll={{
                    x:
                      900,

                    y:
                      480,
                  }}

                  rowClassName={(
                    record
                  ) => {
                    if (
                      record.type ===
                      "ADDED"
                    ) {
                      return "audit-change-added";
                    }

                    if (
                      record.type ===
                      "REMOVED"
                    ) {
                      return "audit-change-removed";
                    }

                    return "audit-change-updated";
                  }}
                />
              ) : (
                <Empty
                  image={
                    Empty.PRESENTED_IMAGE_SIMPLE
                  }
                  description="No field-level changes found in this audit record."
                />
              )}
            </Card>


            {/* USER FRIENDLY NOTE */}

            <Alert
              type="info"
              showIcon
              style={{
                marginTop:
                  16,
              }}
              message="Only changed information is shown above."
              description="Unchanged fields are automatically hidden, so you can immediately see what was different before and what it became after the action."
            />

          </>
        ) : null}
      </Modal>

    </div>
  );
}