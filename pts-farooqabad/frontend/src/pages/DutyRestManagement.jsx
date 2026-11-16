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
  Drawer,
  Form,
  Input,
  Modal,
  Radio,
  Row,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  Upload,
  message,
} from "antd";

import {
  EditOutlined,
  FileExcelOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  StopOutlined,
  UploadOutlined,
} from "@ant-design/icons";

import dayjs from "dayjs";

import api from "../services/api";
import { useAuth } from "../contexts/AuthContext";

const {
  Title,
  Text,
} = Typography;

const {
  RangePicker,
} = DatePicker;


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


function fullName(
  record
) {
  return (
    [
      record?.first_name,
      record?.last_name,
    ]
      .filter(Boolean)
      .join(" ") ||
    record?.employee_id ||
    "-"
  );
}


function staffOptionLabel(
  item
) {
  return [
    fullName(
      item
    ),

    item.belt_no
      ? `Belt ${item.belt_no}`
      : "Belt -",

    item.category_name ||
      "Category Not Set",
  ]
    .filter(Boolean)
    .join(" | ");
}


function normalizeStaffSearch(
  value
) {
  return String(
    value || ""
  )
    .trim()
    .toLowerCase();
}


function staffSelectOption(
  item
) {
  const value =
    item.subject_id ??
    item.id;

  const name =
    fullName(item);

  return {
    value,

    label:
      staffOptionLabel(
        item
      ),

    search_text:
      [
        item.employee_id,
        item.belt_no,
        item.first_name,
        item.last_name,
        name,
        item.father_name,
        item.category_name,
        item.branch_name,
        item.designation,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase(),

    employee_id:
      String(
        item.employee_id ||
          ""
      ).trim(),

    belt_no:
      String(
        item.belt_no ||
          ""
      ).trim(),

    staff_name:
      String(
        name || ""
      ).trim(),

    first_name:
      String(
        item.first_name ||
          ""
      ).trim(),

    last_name:
      String(
        item.last_name ||
          ""
      ).trim(),

    raw:
      item,
  };
}


function staffSearchScore(
  option,
  searchValue
) {
  const query =
    normalizeStaffSearch(
      searchValue
    );

  if (!query) {
    return 100;
  }

  const belt =
    normalizeStaffSearch(
      option?.belt_no
    );

  const employeeId =
    normalizeStaffSearch(
      option?.employee_id
    );

  const name =
    normalizeStaffSearch(
      option?.staff_name
    );

  const firstName =
    normalizeStaffSearch(
      option?.first_name
    );

  const lastName =
    normalizeStaffSearch(
      option?.last_name
    );

  if (belt === query) {
    return 0;
  }

  if (employeeId === query) {
    return 1;
  }

  if (name === query) {
    return 2;
  }

  if (
    firstName === query ||
    lastName === query
  ) {
    return 3;
  }

  if (belt.startsWith(query)) {
    return 4;
  }

  if (
    employeeId.startsWith(
      query
    )
  ) {
    return 5;
  }

  if (name.startsWith(query)) {
    return 6;
  }

  return 10;
}


export default function DutyRestManagement() {
  const { hasPermission } = useAuth();

  const canCreate =
    hasPermission("duty_rest.manage") ||
    hasPermission("staff.edit") ||
    hasPermission("manual_absence.create");

  const canEdit =
    hasPermission("duty_rest.manage") ||
    hasPermission("staff.edit") ||
    hasPermission("manual_absence.edit");

  const canCancel =
    hasPermission("duty_rest.manage") ||
    hasPermission("staff.edit") ||
    hasPermission("manual_absence.cancel");

  const [
    form,
  ] =
    Form.useForm();

  const [
    categories,
    setCategories,
  ] =
    useState([]);

  const [
    staffOptions,
    setStaffOptions,
  ] =
    useState([]);


  const [
    staffOptionsLoading,
    setStaffOptionsLoading,
  ] =
    useState(false);

  const [
    records,
    setRecords,
  ] =
    useState([]);

  const [
    overallTotal,
    setOverallTotal,
  ] =
    useState(0);

  const [
    loading,
    setLoading,
  ] =
    useState(false);

  const [
    saving,
    setSaving,
  ] =
    useState(false);

  const [
    templateLoading,
    setTemplateLoading,
  ] =
    useState(false);

  const [
    importing,
    setImporting,
  ] =
    useState(false);

  const [
    importOpen,
    setImportOpen,
  ] =
    useState(false);

  const [
    importFile,
    setImportFile,
  ] =
    useState(null);

  const [
    importResult,
    setImportResult,
  ] =
    useState(null);

  const [
    drawerOpen,
    setDrawerOpen,
  ] =
    useState(false);

  const [
    editingRecord,
    setEditingRecord,
  ] =
    useState(null);

  const [
    selectionMode,
    setSelectionMode,
  ] =
    useState("CATEGORIES");

  const [
    search,
    setSearch,
  ] =
    useState("");

  const [
    dateRange,
    setDateRange,
  ] =
    useState(null);

  const categoryOptions =
    useMemo(
      () =>
        categories.map(
          (item) => ({
            value:
              item.id,

            label:
              item.category_name,
          })
        ),

      [
        categories,
      ]
    );


  const loadCategories =
    async () => {
      try {
        const response =
          await api.get(
            "/staff/categories"
          );

        setCategories(
          Array.isArray(
            response.data
              ?.data
          )
            ? response.data
                .data
            : []
        );
      } catch (
        error
      ) {
        message.error(
          error.response
            ?.data
            ?.message ||
            "Could not load Staff Categories."
        );
      }
    };


  const loadRecords =
    async () => {
      setLoading(
        true
      );

      try {
        const params = {
          search:
            search.trim() ||
            undefined,
        };

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
            "/duty-rest",
            {
              params,
            }
          );

        const rows =
          Array.isArray(
            response.data
              ?.data
          )
            ? response.data
                .data
            : [];

        setRecords(
          rows
        );

        setOverallTotal(
          Number(
            response.data
              ?.total ??
              rows.length
          )
        );
      } catch (
        error
      ) {
        message.error(
          error.response
            ?.data
            ?.message ||
            "Could not load Duty Rest records."
        );
      } finally {
        setLoading(
          false
        );
      }
    };


  useEffect(
    () => {
      loadCategories();
      loadRecords();
    },
    []
  );


  const loadAllStaff =
    async () => {
      setStaffOptionsLoading(
        true
      );

      try {
        const response =
          await api.get(
            "/leaves/subjects/search",
            {
              params: {
                subject_type:
                  "STAFF",

                include_all:
                  1,
              },
            }
          );

        const rows =
          Array.isArray(
            response.data
              ?.data
          )
            ? response.data
                .data
            : [];

        setStaffOptions(
          rows.map(
            staffSelectOption
          )
        );
      } catch (
        error
      ) {
        message.error(
          error.response
            ?.data
            ?.message ||
            "Could not load Staff list."
        );
      } finally {
        setStaffOptionsLoading(
          false
        );
      }
    };



  const openAdd =
    () => {
      setEditingRecord(
        null
      );

      setSelectionMode(
        "CATEGORIES"
      );

      setStaffOptions(
        []
      );

      form.resetFields();

      form.setFieldsValue({
        selection_mode:
          "CATEGORIES",

        category_ids:
          [],

        staff_ids:
          [],
      });

      setDrawerOpen(
        true
      );
    };


  const openEdit =
    async (
      record
    ) => {
      setSaving(
        true
      );

      try {
        const response =
          await api.get(
            `/duty-rest/${record.id}`
          );

        const detail =
          response.data
            ?.data ||
          record;

        setEditingRecord(
          detail
        );

        const mode =
          detail.selection_mode ||
          "CATEGORIES";

        setSelectionMode(
          mode
        );

        const selectedStaff =
          Array.isArray(
            detail.selected_staff
          )
            ? detail.selected_staff
            : [];

        setStaffOptions(
          selectedStaff.map(
            staffSelectOption
          )
        );

        if (
          mode === "STAFF"
        ) {
          await loadAllStaff();
        }

        form.setFieldsValue({
          title:
            detail.title ||
            "",

          selection_mode:
            mode,

          category_ids:
            Array.isArray(
              detail.category_ids
            )
              ? detail.category_ids
              : [],

          staff_ids:
            Array.isArray(
              detail.staff_ids
            )
              ? detail.staff_ids
              : [],

          period:
            detail.start_datetime &&
            detail.end_datetime
              ? [
                  dayjs(
                    detail.start_datetime
                  ),
                  dayjs(
                    detail.end_datetime
                  ),
                ]
              : null,

          reason:
            detail.reason ||
            "",

          reference_no:
            detail.reference_no ||
            "",

          remarks:
            detail.remarks ||
            "",
        });

        setDrawerOpen(
          true
        );
      } catch (
        error
      ) {
        message.error(
          error.response
            ?.data
            ?.message ||
            "Could not load Duty Rest."
        );
      } finally {
        setSaving(
          false
        );
      }
    };


  const closeDrawer =
    () => {
      setDrawerOpen(
        false
      );

      setEditingRecord(
        null
      );

      setStaffOptions(
        []
      );

      form.resetFields();
    };


  const handleSave =
    async () => {
      try {
        const values =
          await form.validateFields();

        const period =
          values.period;

        if (
          !period?.[
            0
          ] ||
          !period?.[
            1
          ]
        ) {
          message.error(
            "Duty Rest period is required."
          );

          return;
        }

        setSaving(
          true
        );

        const payload = {
          title:
            values.title
              ?.trim() ||
            null,

          selection_mode:
            values.selection_mode,

          category_ids:
            values.selection_mode ===
            "CATEGORIES"
              ? (
                  values.category_ids ||
                  []
                )
              : [],

          staff_ids:
            values.selection_mode ===
            "STAFF"
              ? (
                  values.staff_ids ||
                  []
                )
              : [],

          start_datetime:
            period[
              0
            ].format(
              "YYYY-MM-DD HH:mm:ss"
            ),

          end_datetime:
            period[
              1
            ].format(
              "YYYY-MM-DD HH:mm:ss"
            ),

          reason:
            values.reason
              ?.trim() ||
            null,

          reference_no:
            values.reference_no
              ?.trim() ||
            null,

          remarks:
            values.remarks
              ?.trim() ||
            null,
        };


        if (
          editingRecord
            ?.id
        ) {
          await api.put(
            `/duty-rest/${editingRecord.id}`,
            payload
          );

          message.success(
            "Duty Rest updated successfully."
          );
        } else {
          await api.post(
            "/duty-rest",
            payload
          );

          message.success(
            "Duty Rest saved successfully."
          );
        }

        closeDrawer();

        await loadRecords();
      } catch (
        error
      ) {
        if (
          error?.errorFields
        ) {
          return;
        }

        message.error(
          error.response
            ?.data
            ?.message ||
            "Could not save Duty Rest."
        );
      } finally {
        setSaving(
          false
        );
      }
    };


  /*
  |--------------------------------------------------------------------------
  | EXCEL TEMPLATE / IMPORT
  |--------------------------------------------------------------------------
  */

  const downloadTemplate =
    async () => {
      setTemplateLoading(
        true
      );

      try {
        const response =
          await api.get(
            "/duty-rest/template",
            {
              responseType:
                "blob",

              timeout:
                120000,
            }
          );

        downloadBlob(
          response.data,
          "PTS_Duty_Rest_Import_Template.xlsx"
        );

        message.success(
          "Duty Rest import template downloaded."
        );
      } catch (
        error
      ) {
        message.error(
          error.response
            ?.data
            ?.message ||
            "Could not download Duty Rest template."
        );
      } finally {
        setTemplateLoading(
          false
        );
      }
    };


  const openImport =
    () => {
      setImportFile(
        null
      );

      setImportResult(
        null
      );

      setImportOpen(
        true
      );
    };


  const runImport =
    async () => {
      if (
        !importFile
      ) {
        message.error(
          "Please select an Excel file."
        );

        return;
      }

      setImporting(
        true
      );

      setImportResult(
        null
      );

      try {
        const formData =
          new FormData();

        formData.append(
          "file",
          importFile
        );

        const response =
          await api.post(
            "/duty-rest/import",
            formData,
            {
              timeout:
                120000,
            }
          );

        const result =
          response.data
            ?.data ||
          null;

        setImportResult(
          result
        );

        if (
          Number(
            result?.failed ||
              0
          ) >
          0
        ) {
          message.warning(
            `${Number(result?.imported || 0)} imported, ${Number(result?.failed || 0)} failed.`
          );
        } else {
          message.success(
            `${Number(result?.imported || 0)} Duty Rest record(s) imported successfully.`
          );
        }

        await loadRecords();
      } catch (
        error
      ) {
        message.error(
          error.response
            ?.data
            ?.message ||
            error.response
              ?.data
              ?.error
              ?.message ||
            "Could not import Duty Rest Excel file."
        );
      } finally {
        setImporting(
          false
        );
      }
    };


  const handleCancelRecord =
    (
      record
    ) => {
      Modal.confirm({
        title:
          "Cancel Duty Rest?",

        content:
          record.title ||
          record.selection_label ||
          "This Duty Rest record",

        okText:
          "Cancel Duty Rest",

        okButtonProps: {
          danger:
            true,
        },

        onOk:
          async () => {
            try {
              await api.put(
                `/duty-rest/${record.id}/cancel`,
                {
                  cancellation_reason:
                    "Cancelled from Duty Rest Management.",
                }
              );

              message.success(
                "Duty Rest cancelled successfully."
              );

              await loadRecords();
            } catch (
              error
            ) {
              message.error(
                error.response
                  ?.data
                  ?.message ||
                  "Could not cancel Duty Rest."
              );
            }
          },
      });
    };


  const columns = [
    {
      title:
        "Duty Rest",

      dataIndex:
        "title",

      width:
        200,

      render:
        (
          value
        ) =>
          value ||
          "Duty Rest",
    },

    {
      title:
        "Applies To",

      dataIndex:
        "selection_label",

      width:
        320,

      render:
        (
          value
        ) =>
          value ||
          "-",
    },

    {
      title:
        "Period",

      width:
        270,

      render:
        (
          _,
          record
        ) =>
          record.start_datetime &&
          record.end_datetime
            ? `${dayjs(
                record.start_datetime
              ).format(
                "DD-MMM-YYYY hh:mm A"
              )} → ${dayjs(
                record.end_datetime
              ).format(
                "DD-MMM-YYYY hh:mm A"
              )}`
            : "-",
    },

    {
      title:
        "Status",

      dataIndex:
        "record_status",

      width:
        120,

      render:
        (
          value
        ) => (
          <Tag
            color={
              value ===
              "ACTIVE"
                ? "green"
                : value ===
                    "CANCELLED"
                  ? "red"
                  : "blue"
            }
          >
            {value ||
              "-"}
          </Tag>
        ),
    },

    {
      title:
        "Actions",

      width:
        170,

      fixed:
        "right",

      render:
        (
          _,
          record
        ) => (
          <Space>
            {canEdit && (
              <Button
                size="small"
                icon={
                  <EditOutlined />
                }
                disabled={
                  record.record_status ===
                  "CANCELLED"
                }
                onClick={() =>
                  openEdit(
                    record
                  )
                }
              >
                Edit
              </Button>
            )}

            {canCancel && (
              <Button
                size="small"
                danger
                icon={
                  <StopOutlined />
                }
                disabled={
                  record.record_status ===
                  "CANCELLED"
                }
                onClick={() =>
                  handleCancelRecord(
                    record
                  )
                }
              >
                Cancel
              </Button>
            )}

            {!canEdit && !canCancel && "-"}
          </Space>
        ),
    },
  ];


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

          flexWrap:
            "wrap",
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
            PTS Staff Duty Rest
          </Title>

          <Text
            type="secondary"
          >
            All Staff, Staff Categories ya selected Staff ke liye Duty Rest manage karein.
          </Text>
        </div>

        <Space
          wrap
        >
          <Button
            icon={
              <ReloadOutlined />
            }
            onClick={
              loadRecords
            }
            loading={
              loading
            }
          >
            Refresh
          </Button>

          <Button
            icon={
              <FileExcelOutlined />
            }
            loading={
              templateLoading
            }
            onClick={
              downloadTemplate
            }
          >
            Template
          </Button>

          {canCreate && (
            <Button
              icon={
                <UploadOutlined />
              }
              onClick={
                openImport
              }
            >
              Import Excel
            </Button>
          )}

          {canCreate && (
            <Button
              type="primary"
              icon={
                <PlusOutlined />
              }
              onClick={
                openAdd
              }
            >
              Add Duty Rest
            </Button>
          )}
        </Space>
      </div>


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
            md={
              10
            }
          >
            <Input
              allowClear
              prefix={
                <SearchOutlined />
              }
              placeholder="Search Duty Rest / Category / Staff"
              value={
                search
              }
              onChange={(
                event
              ) =>
                setSearch(
                  event
                    .target
                    .value
                )
              }
              onPressEnter={
                loadRecords
              }
            />
          </Col>

          <Col
            xs={
              24
            }
            md={
              10
            }
          >
            <RangePicker
              style={{
                width:
                  "100%",
              }}
              value={
                dateRange
              }
              onChange={
                setDateRange
              }
              format="DD-MMM-YYYY"
            />
          </Col>

          <Col
            xs={
              24
            }
            md={
              4
            }
          >
            <Button
              type="primary"
              block
              onClick={
                loadRecords
              }
            >
              Filter
            </Button>
          </Col>
        </Row>
      </Card>


      <Card>
        <div
          style={{
            marginBottom:
              12,
          }}
        >
          <Text>
            Total:{" "}
            <strong>
              {records.length}
              /
              {overallTotal}
            </strong>
          </Text>
        </div>

        <Table
          rowKey="id"
          loading={
            loading
          }
          dataSource={
            records
          }
          columns={
            columns
          }
          scroll={{
            x:
              1100,
          }}
          pagination={{
            pageSize:
              20,

            showSizeChanger:
              true,

            showQuickJumper:
              true,

            pageSizeOptions: [
              "10",
              "20",
              "50",
              "100",
            ],
          }}
        />
      </Card>


      <Modal
        title={
          <Space>
            <FileExcelOutlined />
            Import Duty Rest from Excel
          </Space>
        }
        open={
          importOpen
        }
        width={
          820
        }
        okText="Import Duty Rest"
        confirmLoading={
          importing
        }
        onOk={
          runImport
        }
        onCancel={
          () => {
            if (
              !importing
            ) {
              setImportOpen(
                false
              );
            }
          }
        }
      >
        <Alert
          type="info"
          showIcon
          style={{
            marginBottom:
              16,
          }}
          message="Staff Duty Rest Import"
          description="Each valid Excel row creates an individual Staff Duty Rest record. Exact Cap No./Belt No. match is preferred; Employee ID is accepted as fallback."
        />

        <Text strong>
          Excel File
        </Text>

        <div
          style={{
            marginTop:
              6,
          }}
        >
          <Upload
            accept=".xlsx"
            maxCount={
              1
            }
            beforeUpload={(
              file
            ) => {
              setImportFile(
                file
              );

              setImportResult(
                null
              );

              return false;
            }}
            onRemove={
              () => {
                setImportFile(
                  null
                );

                setImportResult(
                  null
                );
              }
            }
            fileList={
              importFile
                ? [
                    importFile,
                  ]
                : []
            }
          >
            <Button
              icon={
                <UploadOutlined />
              }
            >
              Select Excel File
            </Button>
          </Upload>
        </div>

        <Alert
          style={{
            marginTop:
              16,
          }}
          type="info"
          showIcon
          message="Identity Resolution"
          description="Required: Employee ID/Cap No., Start Date & Time and End Date & Time. Staff Category/Branch are optional and are used only when the identity is ambiguous."
        />

        {importResult && (
          <div
            style={{
              marginTop:
                18,
            }}
          >
            <Row
              gutter={[
                8,
                8,
              ]}
            >
              {[
                [
                  "Processed",
                  importResult.processed,
                ],
                [
                  "Imported",
                  importResult.imported,
                ],
                [
                  "Failed",
                  importResult.failed,
                ],
                [
                  "Overlap",
                  importResult.overlap,
                ],
                [
                  "Not Found",
                  importResult.not_found,
                ],
                [
                  "Ambiguous",
                  importResult.ambiguous,
                ],
              ].map(
                ([
                  label,
                  value,
                ]) => (
                  <Col
                    xs={
                      12
                    }
                    md={
                      8
                    }
                    key={
                      label
                    }
                  >
                    <Card
                      size="small"
                    >
                      <Text
                        type="secondary"
                      >
                        {label}
                      </Text>

                      <div
                        style={{
                          fontSize:
                            22,

                          fontWeight:
                            700,
                        }}
                      >
                        {Number(
                          value ||
                            0
                        )}
                      </div>
                    </Card>
                  </Col>
                )
              )}
            </Row>

            {importResult
              .errors
              ?.length >
              0 && (
              <Card
                size="small"
                title="Import Errors"
                style={{
                  marginTop:
                    12,
                }}
              >
                <Table
                  size="small"
                  rowKey={(
                    record,
                    index
                  ) =>
                    `${record.row}-${index}`
                  }
                  pagination={{
                    pageSize:
                      10,
                  }}
                  columns={[
                    {
                      title:
                        "Row",

                      dataIndex:
                        "row",

                      width:
                        70,
                    },
                    {
                      title:
                        "Employee ID / Cap No.",

                      dataIndex:
                        "employee_id",

                      width:
                        180,

                      render: (
                        value
                      ) =>
                        value ||
                        "-",
                    },
                    {
                      title:
                        "Error",

                      dataIndex:
                        "message",
                    },
                  ]}
                  dataSource={
                    importResult.errors
                  }
                />
              </Card>
            )}
          </div>
        )}
      </Modal>


      <Drawer
        title={
          editingRecord
            ? "Edit Duty Rest"
            : "Add Duty Rest"
        }
        width={
          720
        }
        open={
          drawerOpen
        }
        onClose={
          closeDrawer
        }
        extra={
          <Space>
            <Button
              onClick={
                closeDrawer
              }
            >
              Cancel
            </Button>

            <Button
              type="primary"
              loading={
                saving
              }
              onClick={
                handleSave
              }
            >
              {editingRecord
                ? "Update Duty Rest"
                : "Save Duty Rest"}
            </Button>
          </Space>
        }
      >
        <Form
          form={
            form
          }
          layout="vertical"
        >
          <Form.Item
            name="title"
            label="Duty Rest Title"
          >
            <Input
              placeholder="e.g. Weekly Duty Rest"
            />
          </Form.Item>


          <Form.Item
            name="selection_mode"
            label="Apply Duty Rest To"
            rules={[
              {
                required:
                  true,

                message:
                  "Select Duty Rest scope.",
              },
            ]}
          >
            <Radio.Group
              onChange={(
                event
              ) => {
                const value =
                  event
                    .target
                    .value;

                setSelectionMode(
                  value
                );

                if (
                  value !==
                  "CATEGORIES"
                ) {
                  form.setFieldValue(
                    "category_ids",
                    []
                  );
                }

                if (
                  value !==
                  "STAFF"
                ) {
                  form.setFieldValue(
                    "staff_ids",
                    []
                  );
                } else {
                  loadAllStaff();
                }
              }}
            >
              <Radio
                value="ALL"
              >
                All Staff
              </Radio>

              <Radio
                value="CATEGORIES"
              >
                Staff Categories
              </Radio>

              <Radio
                value="STAFF"
              >
                Selected Staff
              </Radio>
            </Radio.Group>
          </Form.Item>


          {selectionMode ===
            "CATEGORIES" && (
            <Form.Item
              name="category_ids"
              label="Staff Categories"
              rules={[
                {
                  required:
                    true,

                  message:
                    "Select at least one Staff Category.",
                },
              ]}
            >
              <Select
                mode="multiple"
                showSearch
                optionFilterProp="label"
                options={
                  categoryOptions
                }
                placeholder="Select one or multiple Staff Categories"
                maxTagCount="responsive"
              />
            </Form.Item>
          )}


          {selectionMode ===
            "STAFF" && (
            <Form.Item
              name="staff_ids"
              label="Selected Staff"
              rules={[
                {
                  required:
                    true,

                  message:
                    "Select at least one Staff member.",
                },
              ]}
            >
              <Select
                mode="multiple"
                showSearch
                loading={
                  staffOptionsLoading
                }
                options={
                  staffOptions
                }
                optionFilterProp="search_text"
                filterOption={(
                  input,
                  option
                ) =>
                  normalizeStaffSearch(
                    option?.search_text
                  ).includes(
                    normalizeStaffSearch(
                      input
                    )
                  )
                }
                filterSort={(
                  optionA,
                  optionB,
                  {
                    searchValue,
                  }
                ) => {
                  const scoreDifference =
                    staffSearchScore(
                      optionA,
                      searchValue
                    ) -
                    staffSearchScore(
                      optionB,
                      searchValue
                    );

                  if (
                    scoreDifference !==
                    0
                  ) {
                    return scoreDifference;
                  }

                  return String(
                    optionA?.label ||
                      ""
                  ).localeCompare(
                    String(
                      optionB?.label ||
                        ""
                    )
                  );
                }}
                onOpenChange={(
                  open
                ) => {
                  if (
                    open &&
                    !staffOptions.length &&
                    !staffOptionsLoading
                  ) {
                    loadAllStaff();
                  }
                }}
                placeholder="Search by Belt No. or Name"
                maxTagCount="responsive"
                notFoundContent={
                  staffOptionsLoading
                    ? "Loading Staff..."
                    : "No matching Staff found"
                }
              />
            </Form.Item>
          )}


          <Form.Item
            name="period"
            label="Duty Rest Start / End Date & Time"
            rules={[
              {
                required:
                  true,

                message:
                  "Duty Rest period is required.",
              },
            ]}
          >
            <RangePicker
              showTime={{
                format:
                  "hh:mm A",
              }}
              use12Hours
              format="DD-MMM-YYYY hh:mm A"
              style={{
                width:
                  "100%",
              }}
            />
          </Form.Item>


          <Form.Item
            name="reason"
            label="Reason / Description"
          >
            <Input.TextArea
              rows={
                3
              }
            />
          </Form.Item>


          <Form.Item
            name="reference_no"
            label="Order / Reference No."
          >
            <Input />
          </Form.Item>


          <Form.Item
            name="remarks"
            label="Remarks"
          >
            <Input.TextArea
              rows={
                3
              }
            />
          </Form.Item>
        </Form>
      </Drawer>
    </div>
  );
}
