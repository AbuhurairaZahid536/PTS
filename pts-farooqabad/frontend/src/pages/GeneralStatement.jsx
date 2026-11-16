import { useCallback, useEffect, useMemo, useState } from "react";

import {
  Alert,
  Button,
  Card,
  Col,
  DatePicker,
  Empty,
  Row,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
  message,
} from "antd";

import { PrinterOutlined, ReloadOutlined } from "@ant-design/icons";

import dayjs from "dayjs";

import api from "../services/api";

const { Title, Text } = Typography;

const DETAIL_SECTIONS = [
  {
    key: "training_drop_repatriate",
    label: "Training Drop / Repatriate",
  },
  {
    key: "absent",
    label: "Absent",
  },
  {
    key: "leave",
    label: "Leave",
  },
  {
    key: "emergency_leave",
    label: "Emergency Leave",
  },
  {
    key: "osd",
    label: "OSD",
  },
  {
    key: "permission",
    label: "Permission",
  },
  {
    key: "outdoor",
    label: "Outdoor",
  },
  {
    key: "medical_rest",
    label: "Medical Rest",
  },
  {
    key: "home_rest",
    label: "Home Rest",
  },
];

function formatDate(value) {
  if (!value) {
    return "-";
  }

  const parsed = dayjs(value);

  return parsed.isValid() ? parsed.format("DD-MMM-YYYY") : String(value);
}

function formatDateTime(value) {
  if (!value) {
    return "-";
  }

  const parsed = dayjs(value);

  return parsed.isValid()
    ? parsed.format("DD-MMM-YYYY hh:mm A")
    : String(value);
}

function num(value) {
  return Number(value || 0);
}

export default function GeneralStatement({ courseId, onOpenProfile }) {
  const [loading, setLoading] = useState(false);

  const [data, setData] = useState(null);

  const [statementDateTime, setStatementDateTime] = useState(dayjs());

  /*
  |--------------------------------------------------------------------------
  | LOAD
  |--------------------------------------------------------------------------
  */

  const loadStatement = useCallback(async () => {
    if (!courseId) {
      setData(null);
      return;
    }

    setLoading(true);

    try {
      const response = await api.get(`/general-statements/course/${courseId}`, {
        params: {
          statement_datetime: statementDateTime.format("YYYY-MM-DD HH:mm:ss"),
        },
      });

      setData(response.data?.data || null);
    } catch (error) {
      setData(null);

      message.error(
        error.response?.data?.message ||
          error.response?.data?.error?.message ||
          "Could not load General Statement.",
      );
    } finally {
      setLoading(false);
    }
  }, [courseId, statementDateTime]);

  useEffect(() => {
    loadStatement();
  }, [loadStatement]);

  const total = data?.summary?.total || {};

  const summaryRows = data?.summary?.rows || [];

  const details = data?.details || {};

  /*
  |--------------------------------------------------------------------------
  | NAME-WISE DETAILS
  |--------------------------------------------------------------------------
  |
  | Present trainees ki name-wise list intentionally show nahi hoti.
  |
  |--------------------------------------------------------------------------
  */

  const visibleDetails = useMemo(
    () =>
      DETAIL_SECTIONS.map((section) => ({
        ...section,

        rows: details[section.key] || [],
      })).filter((section) => section.rows.length > 0),
    [details],
  );

  const openProfile = (record) => {
    if (typeof onOpenProfile !== "function") {
      return;
    }

    onOpenProfile({
      subjectType: "TRAINEE",

      subjectId: record.trainee_id,
    });
  };

  /*
  |--------------------------------------------------------------------------
  | SUMMARY TABLE
  |--------------------------------------------------------------------------
  */

  const summaryColumns = [
    {
      title: "Platoon",
      dataIndex: "platoon_label",
      width: 120,
      fixed: "left",

      render: (value) => <Text strong>{value || "-"}</Text>,
    },

    {
      title: "Total Strength",

      dataIndex: "total_strength",

      width: 115,
      align: "center",
    },

    {
      title: "Training Drop / Repatriate",

      dataIndex: "training_drop_repatriate",

      width: 155,
      align: "center",
    },

    {
      title: "Effective Strength",

      dataIndex: "effective_strength",

      width: 125,
      align: "center",
    },

    {
      title: "Present",
      dataIndex: "present",
      width: 90,
      align: "center",
    },

    {
      title: "Absent",
      dataIndex: "absent",
      width: 90,
      align: "center",
    },

    {
      title: "Leave",
      dataIndex: "leave",
      width: 90,
      align: "center",
    },

    {
      title: "Emergency Leave",

      dataIndex: "emergency_leave",

      width: 120,
      align: "center",
    },

    {
      title: "OSD",
      dataIndex: "osd",
      width: 80,
      align: "center",
    },

    {
      title: "Permission",
      dataIndex: "permission",
      width: 95,
      align: "center",
    },

    {
      title: "Outdoor",
      dataIndex: "outdoor",
      width: 90,
      align: "center",
    },

    {
      title: "Medical Rest",

      dataIndex: "medical_rest",

      width: 105,
      align: "center",
    },

    {
      title: "Home Rest",
      dataIndex: "home_rest",
      width: 100,
      align: "center",
    },
  ];

  /*
  |--------------------------------------------------------------------------
  | DETAIL TABLE
  |--------------------------------------------------------------------------
  */

  const detailColumns = [
    {
      title: "#",
      width: 60,
      align: "center",

      render: (_, __, index) => index + 1,
    },

    {
      title: "Employee ID / Cap No.",

      dataIndex: "employee_id",

      width: 160,

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
      dataIndex: "trainee_name",
      width: 210,

      render: (value) => value || "-",
    },

    {
      title: "Platoon",

      dataIndex: "platoon_number",

      width: 100,
      align: "center",

      render: (value) => (value === null || value === undefined ? "-" : value),
    },

    {
      title: "Detail",
      dataIndex: "detail",
      width: 280,

      render: (value) => value || "-",
    },

    {
      title: "Reference",

      dataIndex: "reference_no",

      width: 150,

      render: (value) => value || "-",
    },

    {
      title: "Period",
      width: 250,

      render: (_, record) => (
        <div>
          <div>{formatDateTime(record.period_start)}</div>

          <Text type="secondary">to {formatDateTime(record.period_end)}</Text>
        </div>
      ),
    },
  ];

  /*
  |--------------------------------------------------------------------------
  | PRINT
  |--------------------------------------------------------------------------
  */

  const printStatement = () => {
    if (!data) {
      message.warning("General Statement data is not available.");

      return;
    }

    window.print();
  };

  return (
    <>
      <style>
        {`
          .general-statement-print {
            display: none;
          }

          @media print {
            body * {
              visibility: hidden !important;
            }

            .general-statement-print,
            .general-statement-print * {
              visibility: visible !important;
            }

            .general-statement-print {
              display: block !important;
              position: absolute;
              top: 0;
              left: 0;
              width: 100%;
              background: #fff;
              color: #000;
              font-family: Arial, Helvetica, sans-serif;
            }

            .gs-summary-page {
              page-break-after: always;
              break-after: page;
            }

            .gs-print-header {
              text-align: center;
              border-bottom: 3px double #000;
              padding-bottom: 6px;
              margin-bottom: 8px;
            }

            .gs-main-title {
              font-size: 16px;
              font-weight: 800;
            }

            .gs-school-title {
              font-size: 13px;
              font-weight: 800;
              margin-top: 2px;
            }

            .gs-report-title {
              font-size: 11px;
              font-weight: 800;
              margin-top: 3px;
            }

            .gs-meta {
              width: 100%;
              border-collapse: collapse;
              font-size: 8px;
              margin-bottom: 8px;
            }

            .gs-meta td {
              border: 1px solid #000;
              padding: 4px;
            }

            .gs-summary-print-table,
            .gs-detail-print-table {
              width: 100%;
              border-collapse: collapse;
            }

            .gs-summary-print-table {
              font-size: 6.5px;
            }

            .gs-detail-print-table {
              font-size: 7.5px;
            }

            .gs-summary-print-table th,
            .gs-summary-print-table td,
            .gs-detail-print-table th,
            .gs-detail-print-table td {
              border: 1px solid #000;
              padding: 3px;
              vertical-align: top;
            }

            .gs-summary-print-table th,
            .gs-detail-print-table th {
              background: #eaeaea;
              text-align: center;
              font-weight: 800;
            }

            .gs-summary-print-table td:not(:first-child) {
              text-align: center;
            }

            .gs-grand-total td {
              font-weight: 800;
            }

            .gs-detail-section {
              margin-bottom: 12px;
              page-break-inside: avoid;
              break-inside: avoid-page;
            }

            .gs-detail-heading {
              font-size: 10px;
              font-weight: 800;
              padding-bottom: 3px;
              margin-bottom: 4px;
              border-bottom: 1px solid #000;
            }

            .gs-signatures {
              display: flex;
              justify-content: space-between;
              gap: 40px;
              margin-top: 28px;
              font-size: 8px;
            }

            .gs-signature {
              width: 200px;
              border-top: 1px solid #000;
              text-align: center;
              padding-top: 4px;
            }

            @page {
              size: A4 landscape;
              margin: 8mm;
            }
          }
        `}
      </style>

      {/* SCREEN */}

      <div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
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
              General Statement
            </Title>

            {data?.course?.course_name && (
              <div
                style={{
                  marginTop: 2,
                  marginBottom: 2,
                }}
              >
                <Text
                  strong
                  style={{
                    fontSize: 16,
                  }}
                >
                  {data.course.course_name}
                </Text>
              </div>
            )}

            <Text type="secondary">
              Course strength and attendance statement.
            </Text>
          </div>

          <Space wrap>
            <DatePicker
              showTime={{
                format: "hh:mm A",
              }}
              use12Hours
              allowClear={false}
              format="DD-MMM-YYYY hh:mm A"
              value={statementDateTime}
              onChange={(value) => {
                if (value) {
                  setStatementDateTime(value);
                }
              }}
            />

            <Button
              icon={<ReloadOutlined />}
              loading={loading}
              onClick={loadStatement}
            >
              Refresh
            </Button>

            <Button
              type="primary"
              icon={<PrinterOutlined />}
              disabled={!data}
              onClick={printStatement}
            >
              Print / Save PDF
            </Button>
          </Space>
        </div>

        <Alert
          type="info"
          showIcon
          style={{
            marginBottom: 16,
          }}
          message="General Statement"
          description="The General Statement is not based on biometric punches. Manual Absence does not appear in a separate column; it is counted under 'Absent'. Present is calculated by subtracting all applicable absence and exemption categories from the Effective Strength."
        />

        {/* TOTAL CARDS */}

        <Card
          loading={loading}
          style={{
            marginBottom: 16,
          }}
        >
          {data ? (
            <>
              <Row gutter={[16, 16]}>
                <Col xs={24} sm={12} lg={6}>
                  <Statistic
                    title="Total Strength"
                    value={num(total.total_strength)}
                  />
                </Col>

                <Col xs={24} sm={12} lg={6}>
                  <Statistic
                    title="Effective Strength"
                    value={num(total.effective_strength)}
                  />
                </Col>

                <Col xs={24} sm={12} lg={6}>
                  <Statistic title="Present" value={num(total.present)} />
                </Col>

                <Col xs={24} sm={12} lg={6}>
                  <Statistic title="Absent" value={num(total.absent)} />
                </Col>
              </Row>

              <Space
                wrap
                style={{
                  marginTop: 14,
                }}
              >
                <Tag color="blue">{data.course?.course_name || "Course"}</Tag>

                <Tag>
                  Course: {formatDate(data.course?.start_date)} to{" "}
                  {formatDate(data.course?.end_date)}
                </Tag>

                <Tag color="geekblue">
                  Statement: {formatDateTime(data.statement_datetime)}
                </Tag>
              </Space>
            </>
          ) : (
            <Empty description="General Statement data is not available." />
          )}
        </Card>

        {/* SUMMARY */}

        <Card
          title="Platoon-wise Strength Summary"
          style={{
            marginBottom: 16,
          }}
        >
          <Table
            rowKey={(record) => String(record.platoon_label)}
            loading={loading}
            dataSource={summaryRows}
            columns={summaryColumns}
            bordered
            size="small"
            scroll={{
              x: 1500,
            }}
            pagination={false}
            summary={() => {
              if (!data) {
                return null;
              }

              const fields = [
                "total_strength",
                "training_drop_repatriate",
                "effective_strength",
                "present",
                "absent",
                "leave",
                "emergency_leave",
                "osd",
                "permission",
                "outdoor",
                "medical_rest",
                "home_rest",
              ];

              return (
                <Table.Summary.Row>
                  <Table.Summary.Cell index={0}>
                    <Text strong>Grand Total</Text>
                  </Table.Summary.Cell>

                  {fields.map((key, index) => (
                    <Table.Summary.Cell
                      key={key}
                      index={index + 1}
                      align="center"
                    >
                      <Text strong>{num(total[key])}</Text>
                    </Table.Summary.Cell>
                  ))}
                </Table.Summary.Row>
              );
            }}
          />
        </Card>

        {/* NAME DETAILS */}

        <div
          style={{
            marginBottom: 12,
          }}
        >
          <Title
            level={4}
            style={{
              marginBottom: 4,
            }}
          >
            Name-wise Details
          </Title>

          <Text type="secondary">
            Present trainees ki name-wise list General Statement mein show nahi
            hoti. Sirf applicable categories ki details neeche show hoti hain.
          </Text>
        </div>

        {visibleDetails.length ? (
          visibleDetails.map((section) => (
            <Card
              key={section.key}
              title={
                <Space>
                  <span>{section.label}</span>

                  <Tag>{section.rows.length}</Tag>
                </Space>
              }
              style={{
                marginBottom: 16,
              }}
            >
              <Table
                rowKey={(record) =>
                  `${section.key}-${record.trainee_id}-${record.employee_id}`
                }
                dataSource={section.rows}
                columns={detailColumns}
                bordered
                size="small"
                scroll={{
                  x: 1200,
                }}
                pagination={{
                  pageSize: 25,
                  showSizeChanger: true,
                }}
              />
            </Card>
          ))
        ) : (
          <Card>
            <Empty description="No absence or exception record for selected date and time." />
          </Card>
        )}
      </div>

      {/* PRINT VERSION */}

      <div className="general-statement-print">
        {data && (
          <>
            {/* PAGE 1 */}

            <section className="gs-summary-page">
              <div className="gs-print-header">
                <div className="gs-main-title">PUNJAB POLICE</div>

                <div className="gs-school-title">
                  POLICE TRAINING SCHOOL FAROOQABAD
                </div>

                <div className="gs-report-title">GENERAL STATEMENT</div>

                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 800,
                    marginTop: 3,
                  }}
                >
                  {data.course?.course_name || "-"}
                </div>
              </div>

              <table className="gs-meta">
                <tbody>
                  <tr>
                    <td>
                      <strong>Course</strong>
                    </td>

                    <td>{data.course?.course_name || "-"}</td>

                    <td>
                      <strong>Statement Date & Time</strong>
                    </td>

                    <td>{formatDateTime(data.statement_datetime)}</td>
                  </tr>

                  <tr>
                    <td>
                      <strong>Course Start</strong>
                    </td>

                    <td>{formatDate(data.course?.start_date)}</td>

                    <td>
                      <strong>Course End</strong>
                    </td>

                    <td>{formatDate(data.course?.end_date)}</td>
                  </tr>
                </tbody>
              </table>

              <table className="gs-summary-print-table">
                <thead>
                  <tr>
                    <th>Platoon</th>

                    <th>Total Strength</th>

                    <th>Training Drop / Repatriate</th>

                    <th>Effective Strength</th>

                    <th>Present</th>

                    <th>Absent</th>

                    <th>Leave</th>

                    <th>Emergency Leave</th>

                    <th>OSD</th>

                    <th>Permission</th>

                    <th>Outdoor</th>

                    <th>Medical Rest</th>

                    <th>Home Rest</th>
                  </tr>
                </thead>

                <tbody>
                  {summaryRows.map((row) => (
                    <tr key={row.platoon_label}>
                      <td>{row.platoon_label}</td>

                      <td>{num(row.total_strength)}</td>

                      <td>{num(row.training_drop_repatriate)}</td>

                      <td>{num(row.effective_strength)}</td>

                      <td>{num(row.present)}</td>

                      <td>{num(row.absent)}</td>

                      <td>{num(row.leave)}</td>

                      <td>{num(row.emergency_leave)}</td>

                      <td>{num(row.osd)}</td>

                      <td>{num(row.permission)}</td>

                      <td>{num(row.outdoor)}</td>

                      <td>{num(row.medical_rest)}</td>

                      <td>{num(row.home_rest)}</td>
                    </tr>
                  ))}

                  <tr className="gs-grand-total">
                    <td>Grand Total</td>

                    <td>{num(total.total_strength)}</td>

                    <td>{num(total.training_drop_repatriate)}</td>

                    <td>{num(total.effective_strength)}</td>

                    <td>{num(total.present)}</td>

                    <td>{num(total.absent)}</td>

                    <td>{num(total.leave)}</td>

                    <td>{num(total.emergency_leave)}</td>

                    <td>{num(total.osd)}</td>

                    <td>{num(total.permission)}</td>

                    <td>{num(total.outdoor)}</td>

                    <td>{num(total.medical_rest)}</td>

                    <td>{num(total.home_rest)}</td>
                  </tr>
                </tbody>
              </table>

              <div className="gs-signatures">
                <div className="gs-signature">Prepared By</div>

                <div className="gs-signature">Checked By</div>
              </div>
            </section>

            {/* PAGE 2+ */}

            <section>
              <div className="gs-print-header">
                <div className="gs-school-title">
                  POLICE TRAINING SCHOOL FAROOQABAD
                </div>

                <div className="gs-report-title">
                  {data.course?.course_name || "COURSE"} - NAME-WISE STATUS
                  DETAIL
                </div>

                <div
                  style={{
                    fontSize: 8,
                    marginTop: 2,
                  }}
                >
                  {formatDateTime(data.statement_datetime)}
                </div>
              </div>

              {visibleDetails.length ? (
                visibleDetails.map((section) => (
                  <div key={section.key} className="gs-detail-section">
                    <div className="gs-detail-heading">
                      {section.label} ({section.rows.length})
                    </div>

                    <table className="gs-detail-print-table">
                      <thead>
                        <tr>
                          <th>Sr.</th>

                          <th>Employee ID / Cap No.</th>

                          <th>Name</th>

                          <th>Platoon</th>

                          <th>Detail</th>

                          <th>Reference</th>

                          <th>Period</th>
                        </tr>
                      </thead>

                      <tbody>
                        {section.rows.map((record, index) => (
                          <tr
                            key={`${section.key}-${record.trainee_id}-${index}`}
                          >
                            <td>{index + 1}</td>

                            <td>{record.employee_id || "-"}</td>

                            <td>{record.trainee_name || "-"}</td>

                            <td>{record.platoon_number ?? "-"}</td>

                            <td>{record.detail || "-"}</td>

                            <td>{record.reference_no || "-"}</td>

                            <td>
                              {formatDateTime(record.period_start)}

                              {" to "}

                              {formatDateTime(record.period_end)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))
              ) : (
                <div>No absence or exception record.</div>
              )}
            </section>
          </>
        )}
      </div>
    </>
  );
}
