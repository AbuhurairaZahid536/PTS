import {
  useCallback,
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
  Input,
  Modal,
  Row,
  Select,
  Space,
  Table,
  Tag,
  TimePicker,
  Typography,
  message,
} from "antd";

import {
  DownloadOutlined,
  ReloadOutlined,
  SearchOutlined,
  SyncOutlined,
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
| DOWNLOAD BLOB
|--------------------------------------------------------------------------
*/

function downloadBlob(
  blob,
  filename
) {
  const url =
    window.URL.createObjectURL(
      blob
    );


  const link =
    document.createElement(
      "a"
    );


  link.href =
    url;

  link.download =
    filename;


  document.body.appendChild(
    link
  );


  link.click();


  link.remove();


  window.URL.revokeObjectURL(
    url
  );
}


/*
|--------------------------------------------------------------------------
| FORMAT DATE TIME
|--------------------------------------------------------------------------
*/

function formatDateTime(
  value
) {
  if (
    !value
  ) {
    return "-";
  }


  return dayjs(
    value
  ).format(
    "DD-MMM-YYYY hh:mm:ss A"
  );
}


export default function BiometricTransactions() {
  const {
    hasPermission,
  } =
    useAuth();


  /*
  |--------------------------------------------------------------------------
  | PERMISSION
  |--------------------------------------------------------------------------
  */

  const canSync =
    hasPermission(
      "biometric.sync"
    );


  /*
  |--------------------------------------------------------------------------
  | STATE
  |--------------------------------------------------------------------------
  */

  const [
    loading,
    setLoading,
  ] =
    useState(
      false
    );


  const [
    syncing,
    setSyncing,
  ] =
    useState(
      false
    );


  const [
    exporting,
    setExporting,
  ] =
    useState(
      false
    );


  const [
    date,
    setDate,
  ] =
    useState(
      dayjs()
    );


  const [
    startTime,
    setStartTime,
  ] =
    useState(
      null
    );


  const [
    endTime,
    setEndTime,
  ] =
    useState(
      null
    );


  const [
    search,
    setSearch,
  ] =
    useState(
      ""
    );


  const [
    department,
    setDepartment,
  ] =
    useState(
      null
    );


  const [
    position,
    setPosition,
  ] =
    useState(
      null
    );


  const [
    terminalSn,
    setTerminalSn,
  ] =
    useState(
      null
    );


  const [
    punchState,
    setPunchState,
  ] =
    useState(
      null
    );


  const [
    verifyType,
    setVerifyType,
  ] =
    useState(
      null
    );


  const [
    rows,
    setRows,
  ] =
    useState(
      []
    );


  const [
    filters,
    setFilters,
  ] =
    useState({
      departments:
        [],

      positions:
        [],

      terminals:
        [],

      punch_states:
        [],

      verify_types:
        [],
    });


  const [
    pagination,
    setPagination,
  ] =
    useState({
      current:
        1,

      pageSize:
        50,

      total:
        0,
    });


  /*
  |--------------------------------------------------------------------------
  | BUILD PARAMS
  |--------------------------------------------------------------------------
  */

  const buildParams =
    useCallback(
      (
        page =
          pagination.current,

        pageSize =
          pagination.pageSize
      ) => {
        const params = {
          page,

          page_size:
            pageSize,
        };


        if (
          date
        ) {
          params.date =
            date.format(
              "YYYY-MM-DD"
            );
        }


        if (
          startTime
        ) {
          params.start_time =
            startTime.format(
              "HH:mm:ss"
            );
        }


        if (
          endTime
        ) {
          params.end_time =
            endTime.format(
              "HH:mm:ss"
            );
        }


        if (
          search.trim()
        ) {
          params.search =
            search.trim();
        }


        if (
          department
        ) {
          params.department =
            department;
        }


        if (
          position
        ) {
          params.position =
            position;
        }


        if (
          terminalSn
        ) {
          params.terminal_sn =
            terminalSn;
        }


        if (
          punchState !==
            null &&
          punchState !==
            undefined
        ) {
          params.punch_state =
            punchState;
        }


        if (
          verifyType !==
            null &&
          verifyType !==
            undefined
        ) {
          params.verify_type =
            verifyType;
        }


        return params;
      },
      [
        date,
        startTime,
        endTime,
        search,
        department,
        position,
        terminalSn,
        punchState,
        verifyType,
        pagination.current,
        pagination.pageSize,
      ]
    );


  /*
  |--------------------------------------------------------------------------
  | LOAD FILTERS
  |--------------------------------------------------------------------------
  */

  const loadFilters =
    async () => {
      try {
        const response =
          await api.get(
            "/biometric/transactions/filters"
          );


        setFilters(
          response.data
            ?.data ||
          {}
        );
      } catch (
        error
      ) {
        message.error(
          error.response
            ?.data
            ?.message ||
          "Could not load transaction filters."
        );
      }
    };


  /*
  |--------------------------------------------------------------------------
  | LOAD TRANSACTIONS
  |--------------------------------------------------------------------------
  */

  const loadTransactions =
    useCallback(
      async (
        page =
          1,

        pageSize =
          pagination.pageSize
      ) => {
        setLoading(
          true
        );


        try {
          const response =
            await api.get(
              "/biometric/transactions",
              {
                params:
                  buildParams(
                    page,
                    pageSize
                  ),
              }
            );


          const data =
            response.data
              ?.data ||
            {};


          setRows(
            data.rows ||
              []
          );


          setPagination({
            current:
              Number(
                data.pagination
                  ?.page
              ) ||
              page,

            pageSize:
              Number(
                data.pagination
                  ?.pageSize
              ) ||
              pageSize,

            total:
              Number(
                data.pagination
                  ?.total
              ) ||
              0,
          });
        } catch (
          error
        ) {
          message.error(
            error.response
              ?.data
              ?.message ||
            "Could not load biometric transactions."
          );
        } finally {
          setLoading(
            false
          );
        }
      },
      [
        buildParams,
        pagination.pageSize,
      ]
    );


  /*
  |--------------------------------------------------------------------------
  | INITIAL LOAD
  |--------------------------------------------------------------------------
  */

  useEffect(
    () => {
      loadFilters();

      loadTransactions(
        1,
        50
      );

      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    []
  );


  /*
  |--------------------------------------------------------------------------
  | LIVE SYNC EVENT
  |--------------------------------------------------------------------------
  */

  useEffect(
    () => {
      const handleLiveSynced =
        () => {
          const selectedDate =
            date?.format(
              "YYYY-MM-DD"
            );


          const today =
            dayjs().format(
              "YYYY-MM-DD"
            );


          if (
            selectedDate !==
            today
          ) {
            return;
          }


          loadTransactions(
            pagination.current,

            pagination.pageSize
          );
        };


      window.addEventListener(
        "pts-biometric-live-synced",

        handleLiveSynced
      );


      return () => {
        window.removeEventListener(
          "pts-biometric-live-synced",

          handleLiveSynced
        );
      };
    },
    [
      date,
      loadTransactions,
      pagination.current,
      pagination.pageSize,
    ]
  );


  /*
  |--------------------------------------------------------------------------
  | RESET
  |--------------------------------------------------------------------------
  */

  const handleReset =
    async () => {
      setDate(
        dayjs()
      );

      setStartTime(
        null
      );

      setEndTime(
        null
      );

      setSearch(
        ""
      );

      setDepartment(
        null
      );

      setPosition(
        null
      );

      setTerminalSn(
        null
      );

      setPunchState(
        null
      );

      setVerifyType(
        null
      );


      setTimeout(
        () => {
          loadTransactions(
            1,

            pagination.pageSize
          );
        },
        0
      );
    };


  /*
  |--------------------------------------------------------------------------
  | MANUAL SYNC
  |--------------------------------------------------------------------------
  */

  const handleSync =
    () => {
      const today =
        dayjs().format(
          "YYYY-MM-DD"
        );


      const selectedDate =
        date?.format(
          "YYYY-MM-DD"
        );


      if (
        !date
      ) {
        message.error(
          "Select a date first."
        );

        return;
      }


      if (
        selectedDate !==
        today
      ) {
        message.info(
          "Previous date ki transactions local database history se load hoti hain."
        );

        return;
      }


      Modal.confirm({
        title:
          "Sync Current Date from ZKBioTime?",

        content: (
          <div>
            <p>
              Date:{" "}
              <strong>
                {
                  date.format(
                    "DD-MMM-YYYY"
                  )
                }
              </strong>
            </p>

            <p>
              Current date ki complete transactions
              ZKBioTime se local database mein
              re-sync hongi.
            </p>
          </div>
        ),

        okText:
          "Sync Current Date",


        async onOk() {
          setSyncing(
            true
          );


          try {
            const response =
              await api.post(
                "/biometric/transactions/sync",

                {
                  date:
                    today,
                },

                {
                  timeout:
                    120000,
                }
              );


            const result =
              response.data
                ?.data ||
              {};


            if (
              result.failed >
              0
            ) {
              Modal.warning({
                title:
                  "Sync completed with some failures",

                content: (
                  <div>
                    <p>
                      Received:{" "}
                      {
                        result.received ||
                        0
                      }
                    </p>

                    <p>
                      Synced:{" "}
                      {
                        result.synced ||
                        0
                      }
                    </p>

                    <p>
                      Failed:{" "}
                      {
                        result.failed ||
                        0
                      }
                    </p>
                  </div>
                ),
              });
            } else {
              message.success(
                `${result.synced || 0} current-date transaction(s) synced successfully.`
              );
            }


            await Promise.all([
              loadTransactions(
                1,

                pagination.pageSize
              ),

              loadFilters(),
            ]);
          } catch (
            error
          ) {
            message.error(
              error.response
                ?.data
                ?.message ||
              "Could not sync current-date transactions from ZKBioTime."
            );
          } finally {
            setSyncing(
              false
            );
          }
        },
      });
    };


  /*
  |--------------------------------------------------------------------------
  | EXPORT
  |--------------------------------------------------------------------------
  */

  const handleExport =
    async () => {
      setExporting(
        true
      );


      try {
        const params =
          buildParams(
            1,

            pagination.pageSize
          );


        delete params.page;

        delete params.page_size;


        const response =
          await api.get(
            "/biometric/transactions/export",

            {
              params,

              responseType:
                "blob",
            }
          );


        const filename =
          date
            ? `ZKBioTime_Transactions_${date.format(
                "YYYY-MM-DD"
              )}.xlsx`
            : "ZKBioTime_Transactions.xlsx";


        downloadBlob(
          response.data,

          filename
        );


        message.success(
          "Transactions exported successfully."
        );
      } catch (
        error
      ) {
        message.error(
          "Could not export transactions."
        );
      } finally {
        setExporting(
          false
        );
      }
    };


  /*
  |--------------------------------------------------------------------------
  | FILTER OPTIONS
  |--------------------------------------------------------------------------
  */

  const departmentOptions =
    useMemo(
      () =>
        (
          filters.departments ||
          []
        ).map(
          (
            item
          ) => ({
            value:
              item.value,

            label:
              item.value,
          })
        ),
      [
        filters.departments,
      ]
    );


  const positionOptions =
    useMemo(
      () =>
        (
          filters.positions ||
          []
        ).map(
          (
            item
          ) => ({
            value:
              item.value,

            label:
              item.value,
          })
        ),
      [
        filters.positions,
      ]
    );


  const terminalOptions =
    useMemo(
      () =>
        (
          filters.terminals ||
          []
        ).map(
          (
            item
          ) => ({
            value:
              item.terminal_sn,

            label:
              item.terminal_alias
                ? `${item.terminal_alias} (${item.terminal_sn})`
                : item.terminal_sn,
          })
        ),
      [
        filters.terminals,
      ]
    );


  const punchStateOptions =
    useMemo(
      () =>
        (
          filters.punch_states ||
          []
        ).map(
          (
            item
          ) => ({
            value:
              item.punch_state,

            label:
              item.punch_state_display ||
              item.punch_state ||
              "-",
          })
        ),
      [
        filters.punch_states,
      ]
    );


  const verifyTypeOptions =
    useMemo(
      () =>
        (
          filters.verify_types ||
          []
        ).map(
          (
            item
          ) => ({
            value:
              item.verify_type,

            label:
              item.verify_type_display ||
              String(
                item.verify_type
              ),
          })
        ),
      [
        filters.verify_types,
      ]
    );


  /*
  |--------------------------------------------------------------------------
  | TABLE
  |--------------------------------------------------------------------------
  */

  const columns = [
    {
      title:
        "Transaction ID",

      dataIndex:
        "id",

      width:
        130,

      fixed:
        "left",
    },

    {
      title:
        "Employee ID",

      dataIndex:
        "emp_code",

      width:
        130,

      fixed:
        "left",

      render:
        (
          value
        ) => (
          <Text
            strong
          >
            {
              value ||
              "-"
            }
          </Text>
        ),
    },

    {
      title:
        "Name",

      width:
        180,

      render:
        (
          _,
          record
        ) =>
          [
            record.first_name,
            record.last_name,
          ]
            .filter(
              Boolean
            )
            .join(
              " "
            ) ||
          "-",
    },

    {
      title:
        "Department",

      dataIndex:
        "department",

      width:
        220,

      render:
        (
          value
        ) =>
          value ||
          "-",
    },

    {
      title:
        "Position",

      dataIndex:
        "position",

      width:
        160,

      render:
        (
          value
        ) =>
          value ||
          "-",
    },

    {
      title:
        "Punch Time",

      dataIndex:
        "punch_time",

      width:
        190,

      render:
        formatDateTime,
    },

    {
      title:
        "Punch State",

      width:
        150,

      render:
        (
          _,
          record
        ) => (
          <Tag>
            {
              record.punch_state_display ||
              record.punch_state ||
              "-"
            }
          </Tag>
        ),
    },

    {
      title:
        "Verify Type",

      width:
        150,

      render:
        (
          _,
          record
        ) =>
          record.verify_type_display ||
          record.verify_type ||
          "-",
    },

    {
      title:
        "Device",

      width:
        180,

      render:
        (
          _,
          record
        ) =>
          record.terminal_alias ||
          record.terminal_sn ||
          "-",
    },

    {
      title:
        "Device SN",

      dataIndex:
        "terminal_sn",

      width:
        150,

      render:
        (
          value
        ) =>
          value ||
          "-",
    },

    {
      title:
        "Area",

      dataIndex:
        "area_alias",

      width:
        140,

      render:
        (
          value
        ) =>
          value ||
          "-",
    },

    {
      title:
        "Local Sync",

      dataIndex:
        "sync_status",

      width:
        120,

      align:
        "center",

      render:
        (
          value
        ) => (
          <Tag
            color={
              value ===
              "SYNCED"
                ? "green"
                : "orange"
            }
          >
            {
              value ||
              "UNKNOWN"
            }
          </Tag>
        ),
    },
  ];


  const today =
    dayjs().format(
      "YYYY-MM-DD"
    );


  const isCurrentDate =
    date?.format(
      "YYYY-MM-DD"
    ) ===
    today;


  /*
  |--------------------------------------------------------------------------
  | UI
  |--------------------------------------------------------------------------
  */

  return (
    <div>
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
            ZKBioTime Transactions
          </Title>


          <Text
            type="secondary"
          >
            Yehi local raw transactions Attendance Engine process karega.
          </Text>
        </div>


        <Space
          wrap
        >
          <Button
            icon={
              <ReloadOutlined />
            }

            onClick={() =>
              loadTransactions(
                pagination.current,

                pagination.pageSize
              )
            }
          >
            Refresh
          </Button>


          <Button
            icon={
              <DownloadOutlined />
            }

            loading={
              exporting
            }

            onClick={
              handleExport
            }
          >
            Export Excel
          </Button>


          {
            canSync && (
              <Button
                type="primary"

                icon={
                  <SyncOutlined />
                }

                loading={
                  syncing
                }

                disabled={
                  !isCurrentDate
                }

                onClick={
                  handleSync
                }
              >
                Sync Current Date
              </Button>
            )
          }
        </Space>
      </div>


      <Alert
        type="success"

        showIcon

        style={{
          marginBottom:
            16,
        }}

        message="Current Date Live Auto Sync Active"

        description="As long as the user remains logged into the portal, only the current date’s ZKBioTime transactions will automatically sync to the database in the background every 10 seconds. When a previous date is selected, the system will display historical data from the local database only."
      />


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
            xs={
              24
            }

            sm={
              12
            }

            lg={
              4
            }
          >
            <DatePicker
              value={
                date
              }

              allowClear={
                false
              }

              format="DD-MMM-YYYY"

              style={{
                width:
                  "100%",
              }}

              onChange={
                setDate
              }
            />
          </Col>


          <Col
            xs={
              24
            }

            sm={
              12
            }

            lg={
              4
            }
          >
            <TimePicker
              value={
                startTime
              }

              format="hh:mm A"

              placeholder="Start Time"

              style={{
                width:
                  "100%",
              }}

              onChange={
                setStartTime
              }
            />
          </Col>


          <Col
            xs={
              24
            }

            sm={
              12
            }

            lg={
              4
            }
          >
            <TimePicker
              value={
                endTime
              }

              format="hh:mm A"

              placeholder="End Time"

              style={{
                width:
                  "100%",
              }}

              onChange={
                setEndTime
              }
            />
          </Col>


          <Col
            xs={
              24
            }

            sm={
              12
            }

            lg={
              6
            }
          >
            <Input
              allowClear

              value={
                search
              }

              prefix={
                <SearchOutlined />
              }

              placeholder="Employee ID or Name"

              onChange={(
                event
              ) =>
                setSearch(
                  event.target
                    .value
                )
              }

              onPressEnter={() =>
                loadTransactions(
                  1,

                  pagination.pageSize
                )
              }
            />
          </Col>


          <Col
            xs={
              24
            }

            sm={
              12
            }

            lg={
              6
            }
          >
            <Select
              allowClear

              showSearch

              value={
                department
              }

              options={
                departmentOptions
              }

              optionFilterProp="label"

              placeholder="Department"

              style={{
                width:
                  "100%",
              }}

              onChange={
                setDepartment
              }
            />
          </Col>


          <Col
            xs={
              24
            }

            sm={
              12
            }

            lg={
              4
            }
          >
            <Select
              allowClear

              showSearch

              value={
                position
              }

              options={
                positionOptions
              }

              optionFilterProp="label"

              placeholder="Position"

              style={{
                width:
                  "100%",
              }}

              onChange={
                setPosition
              }
            />
          </Col>


          <Col
            xs={
              24
            }

            sm={
              12
            }

            lg={
              5
            }
          >
            <Select
              allowClear

              showSearch

              value={
                terminalSn
              }

              options={
                terminalOptions
              }

              optionFilterProp="label"

              placeholder="Device"

              style={{
                width:
                  "100%",
              }}

              onChange={
                setTerminalSn
              }
            />
          </Col>


          <Col
            xs={
              24
            }

            sm={
              12
            }

            lg={
              4
            }
          >
            <Select
              allowClear

              value={
                punchState
              }

              options={
                punchStateOptions
              }

              placeholder="Punch State"

              style={{
                width:
                  "100%",
              }}

              onChange={
                setPunchState
              }
            />
          </Col>


          <Col
            xs={
              24
            }

            sm={
              12
            }

            lg={
              4
            }
          >
            <Select
              allowClear

              value={
                verifyType
              }

              options={
                verifyTypeOptions
              }

              placeholder="Verify Type"

              style={{
                width:
                  "100%",
              }}

              onChange={
                setVerifyType
              }
            />
          </Col>


          <Col
            xs={
              24
            }

            sm={
              12
            }

            lg={
              7
            }
          >
            <Space
              wrap
            >
              <Button
                type="primary"

                icon={
                  <SearchOutlined />
                }

                onClick={() =>
                  loadTransactions(
                    1,

                    pagination.pageSize
                  )
                }
              >
                Apply Filters
              </Button>


              <Button
                icon={
                  <ReloadOutlined />
                }

                onClick={
                  handleReset
                }
              >
                Reset
              </Button>
            </Space>
          </Col>
        </Row>
      </Card>


      <Card>
        <Table
          rowKey="id"

          loading={
            loading
          }

          columns={
            columns
          }

          dataSource={
            rows
          }

          scroll={{
            x:
              1900,
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
              "25",
              "50",
              "100",
              "200",
              "500",
            ],

            showTotal:
              (
                total
              ) =>
                `Total ${total} transactions`,
          }}

          onChange={(
            tablePagination
          ) =>
            loadTransactions(
              tablePagination.current,

              tablePagination.pageSize
            )
          }
        />
      </Card>
    </div>
  );
}