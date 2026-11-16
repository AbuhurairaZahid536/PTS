import { useCallback, useEffect, useMemo, useState } from "react";

import {
  Alert,
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
  Table,
  Tag,
  Typography,
  message,
} from "antd";

import {
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  FileExcelOutlined,
  PlusOutlined,
  PrinterOutlined,
  ReloadOutlined,
  SearchOutlined,
} from "@ant-design/icons";

import api from "../services/api";

import { useAuth } from "../contexts/AuthContext";

const { Title, Text } = Typography;

const { TextArea } = Input;

/*
|--------------------------------------------------------------------------
| STATUS
|--------------------------------------------------------------------------
*/

const STATUS_OPTIONS = [
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
    value: "INACTIVE",

    label: "Inactive",
  },
];

/*
|--------------------------------------------------------------------------
| MAIN
|--------------------------------------------------------------------------
*/

export default function Staff({ defaultCategoryName = null, onOpenProfile }) {
  const [form] = Form.useForm();

  const [categoryForm] = Form.useForm();

  const [branchForm] = Form.useForm();

  const { hasPermission } = useAuth();

  const canEditExistingStaff =
    hasPermission("staff.edit") ||
    hasPermission("profiles.edit");

  const canCreateStaff =
    hasPermission("staff.edit");

  const canManageStaffMasters =
    hasPermission("staff.edit");

  const canPermanentDelete =
    hasPermission("data_management.manage") ||
    hasPermission("users.manage");

  /*
  |--------------------------------------------------------------------------
  | LOADING
  |--------------------------------------------------------------------------
  */

  const [loading, setLoading] = useState(false);

  const [saving, setSaving] = useState(false);

  const [categorySaving, setCategorySaving] = useState(false);

  const [branchSaving, setBranchSaving] = useState(false);

  const [bulkDeleting, setBulkDeleting] = useState(false);

  const [masterDeleting, setMasterDeleting] = useState(false);

  const [reportLoading, setReportLoading] = useState(false);

  /*
  |--------------------------------------------------------------------------
  | DATA
  |--------------------------------------------------------------------------
  */

  const [staff, setStaff] = useState([]);

  const [overallTotal, setOverallTotal] = useState(0);

  const [categories, setCategories] = useState([]);

  const [branches, setBranches] = useState([]);

  const [selectedRowKeys, setSelectedRowKeys] = useState([]);

  /*
  |--------------------------------------------------------------------------
  | FILTERS
  |--------------------------------------------------------------------------
  */

  const [search, setSearch] = useState("");

  const [categoryId, setCategoryId] = useState(null);

  const [branchId, setBranchId] = useState(null);

  const [status, setStatus] = useState(null);

  /*
  |--------------------------------------------------------------------------
  | STAFF FORM
  |--------------------------------------------------------------------------
  */

  const [formOpen, setFormOpen] = useState(false);

  const [formMode, setFormMode] = useState("add");

  const [editingStaff, setEditingStaff] = useState(null);

  /*
  |--------------------------------------------------------------------------
  | MASTER MODALS
  |--------------------------------------------------------------------------
  */

  const [categoryModalOpen, setCategoryModalOpen] = useState(false);

  const [categoryFormMode, setCategoryFormMode] = useState("add");

  const [editingCategory, setEditingCategory] = useState(null);

  const [categoryManagerOpen, setCategoryManagerOpen] = useState(false);

  const [branchModalOpen, setBranchModalOpen] = useState(false);

  const [branchFormMode, setBranchFormMode] = useState("add");

  const [editingBranch, setEditingBranch] = useState(null);

  const [branchManagerOpen, setBranchManagerOpen] = useState(false);

  /*
  |--------------------------------------------------------------------------
  | PAGINATION
  |--------------------------------------------------------------------------
  */

  const [pagination, setPagination] = useState({
    current: 1,

    pageSize: 25,

    total: 0,
  });

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
  | LOAD CATEGORIES
  |--------------------------------------------------------------------------
  */

  const loadCategories = useCallback(async () => {
    try {
      const response = await api.get("/staff/categories");

      const rows = response.data?.data || [];

      setCategories(rows);

      return rows;
    } catch (error) {
      message.error(
        error.response?.data?.message || "Could not load Staff Categories.",
      );

      return [];
    }
  }, []);

  /*
  |--------------------------------------------------------------------------
  | LOAD BRANCHES
  |--------------------------------------------------------------------------
  */

  const loadBranches = useCallback(async () => {
    try {
      const response = await api.get("/staff/branches");

      const rows = response.data?.data || [];

      setBranches(rows);

      return rows;
    } catch (error) {
      message.error(
        error.response?.data?.message ||
          "Could not load Branch / Posting Places.",
      );

      return [];
    }
  }, []);

  /*
  |--------------------------------------------------------------------------
  | LOAD STAFF
  |--------------------------------------------------------------------------
  */

  const loadStaff = useCallback(
    async (page = 1, pageSize = pagination.pageSize, overrides = {}) => {
      setLoading(true);

      try {
        const currentSearch =
          overrides.search !== undefined ? overrides.search : search;

        const currentCategoryId =
          overrides.categoryId !== undefined
            ? overrides.categoryId
            : categoryId;

        const currentBranchId =
          overrides.branchId !== undefined ? overrides.branchId : branchId;

        const currentStatus =
          overrides.status !== undefined ? overrides.status : status;

        const params = {
          page,

          page_size: pageSize,
        };

        if (currentSearch?.trim()) {
          params.search = currentSearch.trim();
        }

        if (currentCategoryId) {
          params.category_id = currentCategoryId;
        }

        if (currentBranchId) {
          params.branch_id = currentBranchId;
        }

        if (currentStatus) {
          params.status = currentStatus;
        }

        const response = await api.get("/staff", {
          params,
        });

        const data = response.data?.data || {};

        setStaff(data.rows || []);

        setPagination({
          current: Number(data.pagination?.page) || page,

          pageSize: Number(data.pagination?.pageSize) || pageSize,

          total: Number(data.pagination?.total) || 0,
        });
      } catch (error) {
        message.error(
          error.response?.data?.message || "Could not load PTS Staff.",
        );
      } finally {
        setLoading(false);
      }
    },
    [search, categoryId, branchId, status, pagination.pageSize],
  );

  /*
  |--------------------------------------------------------------------------
  | LOAD OVERALL TOTAL
  |--------------------------------------------------------------------------
  |
  | Overall total follows the page scope. If Staff.jsx is opened for one
  | fixed category, denominator remains that category's total. Otherwise it
  | represents all PTS Staff.
  |--------------------------------------------------------------------------
  */

  const loadOverallTotal = useCallback(async (fixedCategoryId = null) => {
    try {
      const params = {
        page: 1,

        page_size: 1,
      };

      if (fixedCategoryId) {
        params.category_id = fixedCategoryId;
      }

      const response = await api.get("/staff", {
        params,
      });

      const total = Number(response.data?.data?.pagination?.total) || 0;

      setOverallTotal(total);

      return total;
    } catch (error) {
      console.error("Could not load overall Staff total:", error);

      setOverallTotal(0);

      return 0;
    }
  }, []);

  /*
  |--------------------------------------------------------------------------
  | INITIAL LOAD
  |--------------------------------------------------------------------------
  */

  useEffect(() => {
    const initialize = async () => {
      const [categoryRows] = await Promise.all([
        loadCategories(),
        loadBranches(),
      ]);

      let selectedCategoryId = null;

      if (defaultCategoryName) {
        const matched = categoryRows.find(
          (item) =>
            String(item.category_name || "")
              .trim()
              .toLowerCase() ===
            String(defaultCategoryName).trim().toLowerCase(),
        );

        selectedCategoryId = matched?.id || null;
      }

      setSearch("");

      setStatus(null);

      setCategoryId(selectedCategoryId);

      setBranchId(null);

      setSelectedRowKeys([]);

      await Promise.all([
        loadOverallTotal(selectedCategoryId),

        loadStaff(1, 25, {
          search: "",

          categoryId: selectedCategoryId,

          branchId: null,

          status: null,
        }),
      ]);
    };

    initialize();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultCategoryName]);

  /*
  |--------------------------------------------------------------------------
  | OPTIONS
  |--------------------------------------------------------------------------
  */

  const categoryOptions = useMemo(
    () =>
      categories.map((item) => ({
        value: item.id,

        label: item.category_name,
      })),
    [categories],
  );

  const branchOptions = useMemo(
    () =>
      branches.map((item) => ({
        value: item.id,

        label: item.branch_name,
      })),
    [branches],
  );

  /*
  |--------------------------------------------------------------------------
  | FILTER CATEGORY
  |--------------------------------------------------------------------------
  */

  const handleCategoryFilterChange = async (value) => {
    const selected = value || null;

    setSelectedRowKeys([]);

    setCategoryId(selected);

    await loadStaff(1, pagination.pageSize, {
      categoryId: selected,
    });
  };

  /*
  |--------------------------------------------------------------------------
  | FILTER BRANCH
  |--------------------------------------------------------------------------
  */

  const handleBranchFilterChange = async (value) => {
    const selected = value || null;

    setSelectedRowKeys([]);

    setBranchId(selected);

    await loadStaff(1, pagination.pageSize, {
      branchId: selected,
    });
  };

  /*
  |--------------------------------------------------------------------------
  | SEARCH
  |--------------------------------------------------------------------------
  */

  const handleSearch = () => {
    setSelectedRowKeys([]);

    loadStaff(1, pagination.pageSize);
  };

  /*
  |--------------------------------------------------------------------------
  | RESET
  |--------------------------------------------------------------------------
  */

  const handleReset = async () => {
    setSelectedRowKeys([]);

    let selectedCategoryId = null;

    if (defaultCategoryName) {
      const matched = categories.find(
        (item) =>
          String(item.category_name || "")
            .trim()
            .toLowerCase() === String(defaultCategoryName).trim().toLowerCase(),
      );

      selectedCategoryId = matched?.id || null;
    }

    setSearch("");

    setCategoryId(selectedCategoryId);

    setBranchId(null);

    setStatus(null);

    await loadStaff(1, pagination.pageSize, {
      search: "",

      categoryId: selectedCategoryId,

      branchId: null,

      status: null,
    });
  };

  /*
  |--------------------------------------------------------------------------
  | TABLE PAGE
  |--------------------------------------------------------------------------
  */

  const handleTableChange = (tablePagination) => {
    const nextPageSize =
      Number(tablePagination.pageSize) || pagination.pageSize;

    const pageSizeChanged = nextPageSize !== pagination.pageSize;

    const nextPage = pageSizeChanged ? 1 : Number(tablePagination.current) || 1;

    setSelectedRowKeys([]);

    loadStaff(nextPage, nextPageSize);
  };

  /*
  |--------------------------------------------------------------------------
  | ADD STAFF
  |--------------------------------------------------------------------------
  */

  const openAddStaff = () => {
    setFormMode("add");

    setEditingStaff(null);

    form.resetFields();

    form.setFieldsValue({
      status: "ACTIVE",

      category_id: categoryId || null,

      branch_id: branchId || null,
    });

    setFormOpen(true);
  };

  /*
  |--------------------------------------------------------------------------
  | EDIT STAFF
  |--------------------------------------------------------------------------
  */

  const openEditStaff = async (record) => {
    setSaving(true);

    try {
      const response = await api.get(`/staff/${record.id}`);

      const item = response.data?.data || record;

      setFormMode("edit");

      setEditingStaff(item);

      form.setFieldsValue({
        employee_id: item.employee_id || "",

        first_name: item.first_name || "",

        last_name: item.last_name || "",

        father_name: item.father_name || "",

        belt_no: item.belt_no || "",

        cnic: item.cnic || "",

        phone: item.phone || "",

        email: item.email || "",

        address: item.address || "",

        designation: item.designation || "",

        category_id: item.category_id || null,

        branch_id: item.branch_id || null,

        joining_date: item.joining_date
          ? String(item.joining_date).slice(0, 10)
          : "",

        status: item.status || "ACTIVE",

        remarks: item.remarks || "",
      });

      setFormOpen(true);
    } catch (error) {
      message.error(
        error.response?.data?.message || "Could not load Staff record.",
      );
    } finally {
      setSaving(false);
    }
  };

  /*
  |--------------------------------------------------------------------------
  | SAVE STAFF
  |--------------------------------------------------------------------------
  */

  const handleSaveStaff = async () => {
    try {
      const values = await form.validateFields();

      setSaving(true);

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

        designation: values.designation?.trim() || null,

        category_id: values.category_id || null,

        branch_id: values.branch_id || null,

        joining_date: values.joining_date?.trim() || null,

        status: values.status || "ACTIVE",

        remarks: values.remarks?.trim() || null,
      };

      let response;

      if (formMode === "edit" && editingStaff?.id) {
        response = await api.put(`/staff/${editingStaff.id}`, payload);
      } else {
        response = await api.post("/staff", payload);
      }

      const zk = response.data?.zkbiotime;

      if (zk?.status === "SYNCED") {
        message.success(
          formMode === "edit"
            ? "Staff updated in PTS and ZKBioTime."
            : "Staff added to PTS and ZKBioTime.",
        );
      } else {
        message.warning(
          zk?.message || "Staff saved in PTS, ZKBioTime sync pending.",
        );
      }

      setFormOpen(false);

      setEditingStaff(null);

      form.resetFields();

      await Promise.all([
        loadCategories(),
        loadBranches(),

        loadStaff(pagination.current, pagination.pageSize),
      ]);
    } catch (error) {
      if (error?.errorFields) {
        return;
      }

      message.error(
        error.response?.data?.message ||
          error.response?.data?.error ||
          "Could not save Staff.",
      );
    } finally {
      setSaving(false);
    }
  };

  /*
  |--------------------------------------------------------------------------
  | REFRESH AFTER MASTER CHANGE
  |--------------------------------------------------------------------------
  */

  const refreshAfterMasterChange = async ({
    deletedCategoryId = null,
    deletedBranchId = null,
  } = {}) => {
    const [categoryRows, branchRows] = await Promise.all([
      loadCategories(),
      loadBranches(),
    ]);

    let nextCategoryId = categoryId;

    let nextBranchId = branchId;

    if (
      deletedCategoryId &&
      Number(nextCategoryId) === Number(deletedCategoryId)
    ) {
      nextCategoryId = null;
    }

    if (
      deletedBranchId &&
      Number(nextBranchId) === Number(deletedBranchId)
    ) {
      nextBranchId = null;
    }

    if (defaultCategoryName) {
      const matched = categoryRows.find(
        (item) =>
          String(item.category_name || "")
            .trim()
            .toLowerCase() ===
          String(defaultCategoryName).trim().toLowerCase(),
      );

      nextCategoryId = matched?.id || null;
    }

    if (
      nextBranchId &&
      !branchRows.some(
        (item) => Number(item.id) === Number(nextBranchId),
      )
    ) {
      nextBranchId = null;
    }

    setCategoryId(nextCategoryId);

    setBranchId(nextBranchId);

    setSelectedRowKeys([]);

    if (defaultCategoryName && !nextCategoryId) {
      setStaff([]);

      setOverallTotal(0);

      setPagination((current) => ({
        ...current,
        current: 1,
        total: 0,
      }));

      return;
    }

    await Promise.all([
      loadOverallTotal(defaultCategoryName ? nextCategoryId : null),

      loadStaff(1, pagination.pageSize, {
        categoryId: nextCategoryId,
        branchId: nextBranchId,
      }),
    ]);
  };

  /*
  |--------------------------------------------------------------------------
  | ADD / EDIT CATEGORY
  |--------------------------------------------------------------------------
  */

  const openAddCategory = () => {
    setCategoryFormMode("add");

    setEditingCategory(null);

    categoryForm.resetFields();

    setCategoryModalOpen(true);
  };

  const openEditCategory = (record) => {
    setCategoryFormMode("edit");

    setEditingCategory(record);

    categoryForm.setFieldsValue({
      category_name: record.category_name || "",
    });

    setCategoryModalOpen(true);
  };

  const closeCategoryModal = () => {
    setCategoryModalOpen(false);

    setEditingCategory(null);

    setCategoryFormMode("add");

    categoryForm.resetFields();
  };

  const handleSaveCategory = async () => {
    try {
      const values = await categoryForm.validateFields();

      setCategorySaving(true);

      const payload = {
        category_name: values.category_name.trim(),
      };

      const response =
        categoryFormMode === "edit" && editingCategory?.id
          ? await api.put(`/staff/categories/${editingCategory.id}`, payload)
          : await api.post("/staff/categories", payload);

      const saved = response.data?.data;

      const zk = response.data?.zkbiotime;

      const staffSync = response.data?.staff_sync;

      if (
        zk?.status === "SYNCED" &&
        !Number(staffSync?.failed || 0)
      ) {
        message.success(
          categoryFormMode === "edit"
            ? "Staff Category updated in PTS and ZKBioTime."
            : "Staff Category created in PTS and ZKBioTime.",
        );
      } else {
        message.warning(
          zk?.message ||
            (Number(staffSync?.failed || 0) > 0
              ? `Category saved, but ${staffSync.failed} linked Staff ZKBioTime sync(s) are pending.`
              : "Staff Category saved. ZKBioTime Department mapping pending."),
        );
      }

      closeCategoryModal();

      if (categoryFormMode === "edit") {
        await refreshAfterMasterChange();
      } else {
        await loadCategories();
      }

      if (
        formOpen &&
        saved?.id &&
        categoryFormMode !== "edit"
      ) {
        form.setFieldValue("category_id", saved.id);
      }
    } catch (error) {
      if (error?.errorFields) {
        return;
      }

      message.error(
        error.response?.data?.message ||
          (categoryFormMode === "edit"
            ? "Could not update Staff Category."
            : "Could not create Staff Category."),
      );
    } finally {
      setCategorySaving(false);
    }
  };

  /*
  |--------------------------------------------------------------------------
  | ADD / EDIT BRANCH
  |--------------------------------------------------------------------------
  */

  const openAddBranch = () => {
    setBranchFormMode("add");

    setEditingBranch(null);

    branchForm.resetFields();

    setBranchModalOpen(true);
  };

  const openEditBranch = (record) => {
    setBranchFormMode("edit");

    setEditingBranch(record);

    branchForm.setFieldsValue({
      branch_name: record.branch_name || "",
    });

    setBranchModalOpen(true);
  };

  const closeBranchModal = () => {
    setBranchModalOpen(false);

    setEditingBranch(null);

    setBranchFormMode("add");

    branchForm.resetFields();
  };

  const handleSaveBranch = async () => {
    try {
      const values = await branchForm.validateFields();

      setBranchSaving(true);

      const payload = {
        branch_name: values.branch_name.trim(),
      };

      const response =
        branchFormMode === "edit" && editingBranch?.id
          ? await api.put(`/staff/branches/${editingBranch.id}`, payload)
          : await api.post("/staff/branches", payload);

      const saved = response.data?.data;

      const zk = response.data?.zkbiotime;

      const staffSync = response.data?.staff_sync;

      if (
        zk?.status === "SYNCED" &&
        !Number(staffSync?.failed || 0)
      ) {
        message.success(
          branchFormMode === "edit"
            ? "Branch / Posting Place updated in PTS and ZKBioTime."
            : "Branch / Posting Place created in PTS and ZKBioTime.",
        );
      } else {
        message.warning(
          zk?.message ||
            (Number(staffSync?.failed || 0) > 0
              ? `Branch saved, but ${staffSync.failed} linked Staff ZKBioTime sync(s) are pending.`
              : "Branch saved in PTS. ZKBioTime Position mapping pending."),
        );
      }

      closeBranchModal();

      if (branchFormMode === "edit") {
        await refreshAfterMasterChange();
      } else {
        await loadBranches();
      }

      if (
        formOpen &&
        saved?.id &&
        branchFormMode !== "edit"
      ) {
        form.setFieldValue("branch_id", saved.id);
      }
    } catch (error) {
      if (error?.errorFields) {
        return;
      }

      message.error(
        error.response?.data?.message ||
          (branchFormMode === "edit"
            ? "Could not update Branch / Posting Place."
            : "Could not create Branch / Posting Place."),
      );
    } finally {
      setBranchSaving(false);
    }
  };

  /*
  |--------------------------------------------------------------------------
  | PERMANENT DELETE CATEGORY / BRANCH
  |--------------------------------------------------------------------------
  */

  const executeCategoryPermanentDelete = async (
    record,
    deleteRawTransactions,
  ) => {
    setMasterDeleting(true);

    try {
      const response = await api.post(
        `/data-management/staff-categories/${record.id}/permanent-delete`,
        {
          delete_raw_transactions: Boolean(deleteRawTransactions),
        },
      );

      const result = response.data?.data || {};

      message.success(
        `Category permanently deleted. ${result.staff_deleted || 0} Staff member(s) removed.`,
      );

      await refreshAfterMasterChange({
        deletedCategoryId: record.id,
      });
    } catch (error) {
      await refreshAfterMasterChange();

      message.error(
        error.response?.data?.message ||
          "Permanent Staff Category delete failed.",
      );

      throw error;
    } finally {
      setMasterDeleting(false);
    }
  };

  const confirmCategoryPermanentDelete = (record) => {
    let confirmationText = "";

    let deleteRawTransactions = false;

    Modal.confirm({
      title: `Permanently Delete Category "${record.category_name}"?`,

      width: 720,

      okText: "Permanently Delete",

      okType: "danger",

      cancelText: "Cancel",

      content: (
        <div>
          <Alert
            type="error"
            showIcon
            style={{
              marginBottom: 16,
            }}
            message="This deletes the Category and all Staff currently linked to it."
            description={`Linked Staff: ${Number(record.staff_count || 0)}. Their linked PTS attendance/leave/OSD/outdoor/manual-absence records will also be permanently removed. ZKBioTime employees will be deleted only where the same Employee ID is not used by another Portal identity. The mapped Department is deleted only if it is no longer shared.`}
          />

          <Checkbox
            onChange={(event) => {
              deleteRawTransactions = event.target.checked;
            }}
          >
            Also permanently delete eligible raw biometric transactions
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
          message.error('Type "DELETE" exactly to confirm permanent deletion.');

          throw new Error("DELETE_CONFIRMATION_REQUIRED");
        }

        await executeCategoryPermanentDelete(record, deleteRawTransactions);
      },
    });
  };

  const executeBranchPermanentDelete = async (
    record,
    deleteRawTransactions,
  ) => {
    setMasterDeleting(true);

    try {
      const response = await api.post(
        `/data-management/staff-branches/${record.id}/permanent-delete`,
        {
          delete_raw_transactions: Boolean(deleteRawTransactions),
        },
      );

      const result = response.data?.data || {};

      message.success(
        `Branch / Posting Place permanently deleted. ${result.staff_deleted || 0} Staff member(s) removed.`,
      );

      await refreshAfterMasterChange({
        deletedBranchId: record.id,
      });
    } catch (error) {
      await refreshAfterMasterChange();

      message.error(
        error.response?.data?.message ||
          "Permanent Branch / Posting Place delete failed.",
      );

      throw error;
    } finally {
      setMasterDeleting(false);
    }
  };

  const confirmBranchPermanentDelete = (record) => {
    let confirmationText = "";

    let deleteRawTransactions = false;

    Modal.confirm({
      title: `Permanently Delete Branch "${record.branch_name}"?`,

      width: 720,

      okText: "Permanently Delete",

      okType: "danger",

      cancelText: "Cancel",

      content: (
        <div>
          <Alert
            type="error"
            showIcon
            style={{
              marginBottom: 16,
            }}
            message="This deletes the Branch / Posting Place and all Staff currently linked to it."
            description={`Linked Staff: ${Number(record.staff_count || 0)}. Their linked PTS records will also be permanently removed. ZKBioTime employees/raw transactions remain protected where another Portal identity uses the same Employee ID. The mapped Position is deleted only if it is no longer shared.`}
          />

          <Checkbox
            onChange={(event) => {
              deleteRawTransactions = event.target.checked;
            }}
          >
            Also permanently delete eligible raw biometric transactions
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
          message.error('Type "DELETE" exactly to confirm permanent deletion.');

          throw new Error("DELETE_CONFIRMATION_REQUIRED");
        }

        await executeBranchPermanentDelete(record, deleteRawTransactions);
      },
    });
  };

  /*
  |--------------------------------------------------------------------------
  | FILTERED LIST PARAMS
  |--------------------------------------------------------------------------
  */

  const getFilteredListParams = (page = 1, pageSize = 100) => {
    const params = {
      page,

      page_size: pageSize,
    };

    if (search.trim()) {
      params.search = search.trim();
    }

    if (categoryId) {
      params.category_id = categoryId;
    }

    if (branchId) {
      params.branch_id = branchId;
    }

    if (status) {
      params.status = status;
    }

    return params;
  };

  /*
  |--------------------------------------------------------------------------
  | PRINT / EXPORT STAFF
  |--------------------------------------------------------------------------
  */

  const loadAllFilteredStaffRows = async () => {
    const pageSize = 100;

    let page = 1;

    let total = null;

    const rows = [];

    while (total === null || rows.length < total) {
      const response = await api.get("/staff", {
        params: getFilteredListParams(page, pageSize),
      });

      const data = response.data?.data || {};

      const pageRows = Array.isArray(data.rows) ? data.rows : [];

      rows.push(...pageRows);

      total = Number(data.pagination?.total) || pageRows.length;

      if (!pageRows.length || rows.length >= total) {
        break;
      }

      page += 1;
    }

    return rows;
  };

  const getStaffReportTitle = () =>
    defaultCategoryName
      ? `${defaultCategoryName} Staff List`
      : "All PTS Staff List";

  const getStaffFilterSummary = () => {
    const parts = [];

    if (search.trim()) {
      parts.push(`Search: ${search.trim()}`);
    }

    if (categoryId) {
      const category = categories.find(
        (item) => Number(item.id) === Number(categoryId),
      );

      if (category?.category_name) {
        parts.push(`Category: ${category.category_name}`);
      }
    }

    if (branchId) {
      const branch = branches.find(
        (item) => Number(item.id) === Number(branchId),
      );

      if (branch?.branch_name) {
        parts.push(`Branch / Posting: ${branch.branch_name}`);
      }
    }

    if (status) {
      parts.push(`Status: ${status}`);
    }

    return parts.length ? parts.join(" | ") : "All records";
  };

  const escapeHtml = (value) =>
    String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");

  const buildStaffTableRowsHtml = (rows) =>
    rows
      .map((item, index) => {
        const name =
          [item.first_name, item.last_name].filter(Boolean).join(" ") || "-";

        return `
          <tr>
            <td>${index + 1}</td>
            <td>${escapeHtml(item.employee_id || "-")}</td>
            <td>${escapeHtml(name)}</td>
            <td>${escapeHtml(item.father_name || "-")}</td>
            <td>${escapeHtml(item.category_name || "Not Assigned")}</td>
            <td>${escapeHtml(item.branch_name || "Not Assigned")}</td>
            <td>${escapeHtml(item.designation || "-")}</td>
            <td>${escapeHtml(item.status || "-")}</td>
            <td>${escapeHtml(item.zkteco_synced ? "Synced" : "Pending")}</td>
          </tr>
        `;
      })
      .join("");

  const buildStaffReportHtml = (rows, forExcel = false) => {
    const reportTitle = getStaffReportTitle();

    const filterSummary = getStaffFilterSummary();

    const generatedAt = new Date().toLocaleString();

    const tableRows = buildStaffTableRowsHtml(rows);

    const printScript = forExcel
      ? ""
      : `
          <script>
            window.onload = function () {
              window.focus();
              setTimeout(function () {
                window.print();
              }, 250);
            };
          </script>
        `;

    return `
      <!doctype html>
      <html>
        <head>
          <meta charset="UTF-8" />
          <title>${escapeHtml(reportTitle)}</title>
          <style>
            body {
              font-family: Arial, Helvetica, sans-serif;
              margin: 24px;
              color: #111827;
            }

            h1 {
              margin: 0 0 6px;
              font-size: 22px;
              text-align: center;
            }

            .subtitle {
              text-align: center;
              margin-bottom: 4px;
              font-size: 13px;
              font-weight: 700;
            }

            .meta {
              text-align: center;
              margin-bottom: 18px;
              font-size: 11px;
              color: #4b5563;
            }

            table {
              width: 100%;
              border-collapse: collapse;
              font-size: 10px;
            }

            th,
            td {
              border: 1px solid #9ca3af;
              padding: 6px 5px;
              text-align: left;
              vertical-align: top;
            }

            th {
              background: #eaf3fb;
              font-weight: 700;
            }

            tr:nth-child(even) td {
              background: #f8fafc;
            }

            .footer {
              margin-top: 12px;
              font-size: 10px;
              color: #4b5563;
            }

            @media print {
              @page {
                size: landscape;
                margin: 10mm;
              }

              body {
                margin: 0;
              }

              thead {
                display: table-header-group;
              }

              tr {
                break-inside: avoid;
              }
            }
          </style>
        </head>

        <body>
          <h1>Police Training School Farooqabad</h1>

          <div class="subtitle">
            ${escapeHtml(reportTitle)}
          </div>

          <div class="meta">
            ${escapeHtml(filterSummary)}
            <br />
            Generated: ${escapeHtml(generatedAt)}
            | Total Records: ${rows.length}
          </div>

          <table>
            <thead>
              <tr>
                <th>Sr.</th>
                <th>Employee ID</th>
                <th>Name</th>
                <th>Father Name</th>
                <th>Staff Category</th>
                <th>Branch / Posting Place</th>
                <th>Rank</th>
                <th>Status</th>
                <th>ZKBioTime</th>
              </tr>
            </thead>

            <tbody>
              ${tableRows}
            </tbody>
          </table>

          <div class="footer">
            Police Training School Farooqabad - Staff Management
          </div>

          ${printScript}
        </body>
      </html>
    `;
  };

  const handlePrintStaff = async () => {
    const printWindow = window.open(
      "",
      "_blank",
      "width=1300,height=850,noopener,noreferrer",
    );

    if (!printWindow) {
      message.warning(
        "Print window was blocked. Please allow pop-ups and try again.",
      );

      return;
    }

    printWindow.document.write(
      "<p style='font-family:Arial;padding:20px'>Preparing staff list...</p>",
    );

    setReportLoading(true);

    try {
      const rows = await loadAllFilteredStaffRows();

      if (!rows.length) {
        printWindow.close();

        message.warning("No staff records found for the selected filters.");

        return;
      }

      printWindow.document.open();

      printWindow.document.write(buildStaffReportHtml(rows));

      printWindow.document.close();
    } catch (error) {
      printWindow.close();

      message.error(
        error.response?.data?.message || "Could not prepare Staff print list.",
      );
    } finally {
      setReportLoading(false);
    }
  };

  const handleExportStaffExcel = async () => {
    setReportLoading(true);

    try {
      const rows = await loadAllFilteredStaffRows();

      if (!rows.length) {
        message.warning("No staff records found for the selected filters.");

        return;
      }

      const html = buildStaffReportHtml(rows, true);

      const blob = new Blob(["\ufeff", html], {
        type: "application/vnd.ms-excel;charset=utf-8;",
      });

      const downloadUrl = URL.createObjectURL(blob);

      const link = document.createElement("a");

      const date = new Date().toISOString().slice(0, 10);

      const safeTitle = getStaffReportTitle()
        .replace(/[^a-z0-9]+/gi, "_")
        .replace(/^_+|_+$/g, "");

      link.href = downloadUrl;

      link.download = `${safeTitle || "PTS_Staff_List"}_${date}.xls`;

      document.body.appendChild(link);

      link.click();

      link.remove();

      URL.revokeObjectURL(downloadUrl);

      message.success(`${rows.length} staff record(s) exported to Excel.`);
    } catch (error) {
      message.error(
        error.response?.data?.message || "Could not export Staff list.",
      );
    } finally {
      setReportLoading(false);
    }
  };

  /*
  |--------------------------------------------------------------------------
  | LOAD ALL FILTERED IDS
  |--------------------------------------------------------------------------
  */

  const loadAllFilteredStaffIds = async () => {
    const pageSize = 100;

    let page = 1;

    let total = null;

    const ids = [];

    while (total === null || ids.length < total) {
      const response = await api.get("/staff", {
        params: getFilteredListParams(page, pageSize),
      });

      const data = response.data?.data || {};

      const rows = data.rows || [];

      ids.push(...rows.map((item) => item.id));

      total = Number(data.pagination?.total) || rows.length;

      if (!rows.length || ids.length >= total) {
        break;
      }

      page += 1;
    }

    return [...new Set(ids)];
  };

  /*
  |--------------------------------------------------------------------------
  | DELETE RESULT
  |--------------------------------------------------------------------------
  */

  const showDeleteResult = (result) => {
    const failedRows = result?.results?.filter((item) => !item.success) || [];

    Modal[Number(result?.failed || 0) > 0 ? "warning" : "success"]({
      title:
        Number(result?.failed || 0) > 0
          ? "Permanent Delete Completed with Failures"
          : "Permanent Delete Completed",

      width: 650,

      content: (
        <div
          style={{
            marginTop: 16,
          }}
        >
          <Descriptions bordered column={1} size="small">
            <Descriptions.Item label="Selected">
              {result?.selected || 0}
            </Descriptions.Item>

            <Descriptions.Item label="PTS + DB Deleted">
              <Tag color="green">{result?.deleted || 0}</Tag>
            </Descriptions.Item>

            <Descriptions.Item label="ZKBioTime Deleted">
              {result?.zk_deleted || 0}
            </Descriptions.Item>

            <Descriptions.Item label="Already Missing in ZKBioTime">
              {result?.zk_already_missing || 0}
            </Descriptions.Item>

            <Descriptions.Item label="Failed">
              <Tag color={Number(result?.failed || 0) > 0 ? "red" : "green"}>
                {result?.failed || 0}
              </Tag>
            </Descriptions.Item>
          </Descriptions>

          {failedRows.length > 0 && (
            <div
              style={{
                marginTop: 16,
              }}
            >
              <Text strong>Failed Records</Text>

              {failedRows.slice(0, 20).map((item) => (
                <div key={`${item.id}-${item.employee_id || "unknown"}`}>
                  {item.employee_id || item.id}: {item.error || "Unknown error"}
                </div>
              ))}
            </div>
          )}
        </div>
      ),
    });
  };

  /*
  |--------------------------------------------------------------------------
  | EXECUTE PERMANENT DELETE
  |--------------------------------------------------------------------------
  */

  const executePermanentDelete = async (ids, deleteRawTransactions) => {
    setBulkDeleting(true);

    try {
      const response = await api.post(
        "/data-management/staff/permanent-delete",
        {
          ids,

          delete_raw_transactions: Boolean(deleteRawTransactions),
        },
      );

      const result = response.data?.data || {};

      showDeleteResult(result);

      setSelectedRowKeys([]);

      await Promise.all([
        loadCategories(),
        loadBranches(),

        loadStaff(1, pagination.pageSize),
      ]);
    } catch (error) {
      message.error(
        error.response?.data?.message || "Permanent Staff delete failed.",
      );

      throw error;
    } finally {
      setBulkDeleting(false);
    }
  };

  /*
  |--------------------------------------------------------------------------
  | CONFIRM PERMANENT DELETE
  |--------------------------------------------------------------------------
  */

  const confirmPermanentDelete = (ids, label) => {
    if (!ids.length) {
      message.warning("Please select at least one staff member.");

      return;
    }

    let confirmationText = "";

    let deleteRawTransactions = false;

    Modal.confirm({
      title: `Permanently Delete ${label}?`,

      width: 680,

      okText: "Permanently Delete",

      okType: "danger",

      cancelText: "Cancel",

      content: (
        <div>
          <Alert
            type="error"
            showIcon
            style={{
              marginBottom: 16,
            }}
            message="This action cannot be undone."
            description="Selected staff will be removed from PTS Portal, linked records, database and ZKBioTime."
          />

          <p>
            Selected staff: <strong>{ids.length}</strong>
          </p>

          <Checkbox
            onChange={(event) => {
              deleteRawTransactions = event.target.checked;
            }}
          >
            Also permanently delete these Employee IDs&apos; raw biometric
            transactions
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
          message.error('Type "DELETE" exactly to confirm permanent deletion.');

          throw new Error("DELETE_CONFIRMATION_REQUIRED");
        }

        await executePermanentDelete(ids, deleteRawTransactions);
      },
    });
  };

  /*
  |--------------------------------------------------------------------------
  | SELECT ALL FILTERED
  |--------------------------------------------------------------------------
  */

  const handleSelectAllFiltered = async () => {
    setBulkDeleting(true);

    try {
      const ids = await loadAllFilteredStaffIds();

      setSelectedRowKeys(ids);

      message.success(`${ids.length} filtered staff member(s) selected.`);
    } catch (error) {
      message.error(
        error.response?.data?.message || "Could not select all filtered staff.",
      );
    } finally {
      setBulkDeleting(false);
    }
  };

  /*
  |--------------------------------------------------------------------------
  | ROW SELECTION
  |--------------------------------------------------------------------------
  */

  const rowSelection = canPermanentDelete
    ? {
        selectedRowKeys,

        preserveSelectedRowKeys: true,

        onChange: (keys) => setSelectedRowKeys(keys),
      }
    : undefined;

  /*
  |--------------------------------------------------------------------------
  | TABLE COLUMNS
  |--------------------------------------------------------------------------
  */

  const columns = [
    {
      title: "Employee ID",

      dataIndex: "employee_id",

      key: "employee_id",

      width: 150,

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

      key: "name",

      width: 210,

      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <Text strong>
            {[record.first_name, record.last_name].filter(Boolean).join(" ") || "-"}
          </Text>
          <Text type="secondary" style={{ fontSize: 11 }}>
            {record.belt_no ? `Belt No. ${record.belt_no}` : "Belt No. not recorded"}
          </Text>
        </Space>
      ),
    },

    {
      title: "Father Name",

      dataIndex: "father_name",

      key: "father_name",

      width: 180,

      render: (value) => value || "-",
    },

    {
      title: "Staff Category",

      dataIndex: "category_name",

      key: "category_name",

      width: 200,

      render: (value) => value || <Tag color="orange">Not Assigned</Tag>,
    },

    {
      title: "Branch / Posting Place",

      dataIndex: "branch_name",

      key: "branch_name",

      width: 220,

      render: (value) => value || <Tag color="orange">Not Assigned</Tag>,
    },

    {
      title: "Rank",

      dataIndex: "designation",

      key: "designation",

      width: 160,

      render: (value) => value || "-",
    },

    {
      title: "Status",

      dataIndex: "status",

      key: "status",

      width: 120,

      align: "center",

      render: (value) => {
        let color = "default";

        if (value === "ACTIVE") {
          color = "green";
        } else if (value === "ON_LEAVE" || value === "OSD") {
          color = "orange";
        }

        return <Tag color={color}>{value || "UNKNOWN"}</Tag>;
      },
    },

    {
      title: "ZKBioTime",

      key: "zkbiotime",

      width: 120,

      align: "center",

      render: (_, record) => (
        <Tag color={record.zkteco_synced ? "green" : "orange"}>
          {record.zkteco_synced ? "Synced" : "Pending"}
        </Tag>
      ),
    },

    {
      title: "Actions",

      key: "actions",

      width: 160,

      fixed: "right",

      render: (_, record) => (
        <Space size="small">
          <Button
            type="text"
            icon={<EyeOutlined />}
            title="Open Profile"
            onClick={() => openProfile(record)}
          />

          {canEditExistingStaff && (
            <Button
              type="text"
              icon={<EditOutlined />}
              title="Edit"
              onClick={() => openEditStaff(record)}
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

                  `Staff ${record.employee_id}`,
                )
              }
            />
          )}
        </Space>
      ),
    },
  ];

  const categoryManagementColumns = [
    {
      title: "Staff Category / Duty Type",
      dataIndex: "category_name",
      key: "category_name",
      render: (value) => value || "-",
    },
    {
      title: "Total Staff",
      dataIndex: "staff_count",
      key: "staff_count",
      width: 110,
      align: "center",
      render: (value) => Number(value || 0),
    },
    {
      title: "Active Staff",
      dataIndex: "active_staff_count",
      key: "active_staff_count",
      width: 110,
      align: "center",
      render: (value) => Number(value || 0),
    },
    {
      title: "ZKBioTime Department",
      key: "zk_department",
      width: 190,
      render: (_, record) =>
        record.zkbiotime_department_id ? (
          <Space size={4} wrap>
            <Tag color="green">Mapped</Tag>
            <Text type="secondary">
              ID {record.zkbiotime_department_id}
            </Text>
          </Space>
        ) : (
          <Tag color="orange">Pending</Tag>
        ),
    },
    {
      title: "Actions",
      key: "actions",
      width: 130,
      align: "center",
      render: (_, record) => (
        <Space size="small">
          {canManageStaffMasters && (
            <Button
              type="text"
              icon={<EditOutlined />}
              title="Edit Category"
              onClick={() => openEditCategory(record)}
            />
          )}

          {canPermanentDelete && (
            <Button
              type="text"
              danger
              icon={<DeleteOutlined />}
              title="Permanent Delete Category"
              disabled={masterDeleting}
              onClick={() => confirmCategoryPermanentDelete(record)}
            />
          )}
        </Space>
      ),
    },
  ];

  const branchManagementColumns = [
    {
      title: "Branch / Posting Place",
      dataIndex: "branch_name",
      key: "branch_name",
      render: (value) => value || "-",
    },
    {
      title: "Total Staff",
      dataIndex: "staff_count",
      key: "staff_count",
      width: 110,
      align: "center",
      render: (value) => Number(value || 0),
    },
    {
      title: "Active Staff",
      dataIndex: "active_staff_count",
      key: "active_staff_count",
      width: 110,
      align: "center",
      render: (value) => Number(value || 0),
    },
    {
      title: "ZKBioTime Position",
      key: "zk_position",
      width: 180,
      render: (_, record) =>
        record.zkbiotime_position_id ? (
          <Space size={4} wrap>
            <Tag color="green">Mapped</Tag>
            <Text type="secondary">
              ID {record.zkbiotime_position_id}
            </Text>
          </Space>
        ) : (
          <Tag color="orange">Pending</Tag>
        ),
    },
    {
      title: "Actions",
      key: "actions",
      width: 130,
      align: "center",
      render: (_, record) => (
        <Space size="small">
          {canManageStaffMasters && (
            <Button
              type="text"
              icon={<EditOutlined />}
              title="Edit Branch / Posting Place"
              onClick={() => openEditBranch(record)}
            />
          )}

          {canPermanentDelete && (
            <Button
              type="text"
              danger
              icon={<DeleteOutlined />}
              title="Permanent Delete Branch / Posting Place"
              disabled={masterDeleting}
              onClick={() => confirmBranchPermanentDelete(record)}
            />
          )}
        </Space>
      ),
    },
  ];

  /*
  |--------------------------------------------------------------------------
  | UI
  |--------------------------------------------------------------------------
  */

  return (
    <div>
      {/* HEADER */}

      <div
        style={{
          display: "flex",

          justifyContent: "space-between",

          alignItems: "center",

          marginBottom: 16,

          gap: 16,
        }}
      >
        <div>
          <Title
            level={3}
            style={{
              margin: 0,
            }}
          >
            {defaultCategoryName || "All PTS Staff"}
          </Title>

          <Text type="secondary">
            Staff Category duty type hai aur Branch / Posting Place independent
            posting hai.
          </Text>
        </div>

        <Space wrap>
          {(canManageStaffMasters || canPermanentDelete) && (
            <Button
              onClick={async () => {
                await loadCategories();
                setCategoryManagerOpen(true);
              }}
            >
              Manage Categories
            </Button>
          )}

          {(canManageStaffMasters || canPermanentDelete) && (
            <Button
              onClick={async () => {
                await loadBranches();
                setBranchManagerOpen(true);
              }}
            >
              Manage Branches / Postings
            </Button>
          )}

          {canCreateStaff && (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={openAddStaff}
            >
              Add Staff
            </Button>
          )}
        </Space>
      </div>

      {/* FILTERS */}

      <Card
        style={{
          marginBottom: 16,
        }}
      >
        <Space wrap>
          <Input
            allowClear
            value={search}
            prefix={<SearchOutlined />}
            placeholder="Employee ID, Name, Father Name"
            style={{
              width: 280,
            }}
            onChange={(event) => setSearch(event.target.value)}
            onPressEnter={handleSearch}
          />

          <Select
            allowClear={!defaultCategoryName}
            showSearch
            placeholder="Staff Category"
            value={categoryId}
            style={{
              width: 240,
            }}
            options={categoryOptions}
            optionFilterProp="label"
            disabled={Boolean(defaultCategoryName)}
            onChange={handleCategoryFilterChange}
          />

          <Select
            allowClear
            showSearch
            placeholder="Branch / Posting"
            value={branchId}
            style={{
              width: 250,
            }}
            options={branchOptions}
            optionFilterProp="label"
            onChange={handleBranchFilterChange}
          />

          <Select
            allowClear
            placeholder="Status"
            value={status}
            style={{
              width: 150,
            }}
            options={STATUS_OPTIONS}
            onChange={(value) => {
              setSelectedRowKeys([]);

              setStatus(value || null);
            }}
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

      {/* BULK DELETE */}

      {/* STAFF TABLE */}

      <Card>
        <div
          style={{
            display: "flex",

            justifyContent: "space-between",

            alignItems: "center",

            gap: 12,

            marginBottom: 12,

            flexWrap: "wrap",
          }}
        >
          <Text>
            Total:{" "}
            <strong>
              {pagination.total}/{overallTotal}
            </strong>
          </Text>

          <Space wrap>
            <Button
              icon={<PrinterOutlined />}
              loading={reportLoading}
              onClick={handlePrintStaff}
            >
              Print
            </Button>

            <Button
              icon={<FileExcelOutlined />}
              loading={reportLoading}
              onClick={handleExportStaffExcel}
            >
              Export Excel
            </Button>

            {canPermanentDelete && (
              <Button
                danger
                icon={<DeleteOutlined />}
                loading={bulkDeleting}
                disabled={selectedRowKeys.length === 0}
                onClick={() =>
                  confirmPermanentDelete(
                    selectedRowKeys,

                    `${selectedRowKeys.length} Selected Staff Member(s)`,
                  )
                }
              >
                Delete Selected
                {selectedRowKeys.length ? ` (${selectedRowKeys.length})` : ""}
              </Button>
            )}
          </Space>
        </div>

        <Table
          rowKey="id"
          rowSelection={rowSelection}
          loading={loading}
          columns={columns}
          dataSource={staff}
          scroll={{
            x: 1450,
          }}
          pagination={{
            current: pagination.current,

            pageSize: pagination.pageSize,

            total: pagination.total,

            showSizeChanger: true,

            showQuickJumper: true,

            pageSizeOptions: ["10", "25", "50", "100"],
          }}
          onChange={handleTableChange}
        />
      </Card>

      {/* ADD / EDIT STAFF */}

      <Drawer
        title={formMode === "edit" ? "Edit Staff" : "Add Staff"}
        width={720}
        open={formOpen}
        destroyOnHidden
        onClose={() => {
          setFormOpen(false);

          setEditingStaff(null);

          form.resetFields();
        }}
        extra={
          <Space>
            <Button onClick={() => setFormOpen(false)}>Cancel</Button>

            <Button type="primary" loading={saving} onClick={handleSaveStaff}>
              {formMode === "edit" ? "Update Staff" : "Save Staff"}
            </Button>
          </Space>
        }
      >
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="employee_id"
                label="Employee ID"
                rules={[
                  {
                    required: true,

                    message: "Employee ID is required.",
                  },
                ]}
              >
                <Input disabled={formMode === "edit"} />
              </Form.Item>
            </Col>

            <Col span={12}>
              <Form.Item name="status" label="Status">
                <Select options={STATUS_OPTIONS} />
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

          <Form.Item name="email" label="Email">
            <Input />
          </Form.Item>

          <Form.Item name="address" label="Address">
            <TextArea rows={2} />
          </Form.Item>

          <Divider orientation="left">Posting Information</Divider>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="category_id"
                label="Staff Category / Duty Type"
                rules={[
                  {
                    required: true,

                    message: "Staff Category is required.",
                  },
                ]}
              >
                <Select
                  showSearch
                  options={categoryOptions}
                  optionFilterProp="label"
                  placeholder="Select Staff Category"
                />
              </Form.Item>
            </Col>

            <Col span={12}>
              <Form.Item name="branch_id" label="Branch / Posting Place">
                <Select
                  allowClear
                  showSearch
                  options={branchOptions}
                  optionFilterProp="label"
                  placeholder="Select Branch / Posting"
                />
              </Form.Item>
            </Col>
          </Row>

          {canManageStaffMasters && (
            <Space
              wrap
              style={{
                marginBottom: 20,
              }}
            >
              <Button
                size="small"
                icon={<PlusOutlined />}
                onClick={openAddCategory}
              >
                New Category
              </Button>

              <Button
                size="small"
                icon={<PlusOutlined />}
                onClick={openAddBranch}
              >
                New Branch / Posting
              </Button>
            </Space>
          )}

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="designation" label="Rank">
                <Input />
              </Form.Item>
            </Col>

            <Col span={12}>
              <Form.Item name="joining_date" label="Joining Date">
                <Input type="date" />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="remarks" label="Remarks">
            <TextArea rows={3} />
          </Form.Item>
        </Form>
      </Drawer>

      {/* CATEGORY MANAGER */}

      <Modal
        title="Manage Staff Categories / Duty Types"
        open={categoryManagerOpen}
        onCancel={() => setCategoryManagerOpen(false)}
        footer={null}
        width={920}
        destroyOnHidden
      >
        <Alert
          type="info"
          showIcon
          style={{
            marginBottom: 16,
          }}
          message="Category is the Staff duty type and maps to a ZKBioTime Department."
          description="Renaming updates the safe ZKBioTime mapping. Permanent Delete is a Super Admin action and also permanently removes all Staff currently linked to that Category."
        />

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            marginBottom: 12,
            flexWrap: "wrap",
          }}
        >
          <Text type="secondary">
            Categories: <strong>{categories.length}</strong>
          </Text>

          {canManageStaffMasters && (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={openAddCategory}
            >
              Add Category
            </Button>
          )}
        </div>

        <Table
          rowKey="id"
          size="small"
          columns={categoryManagementColumns}
          dataSource={categories}
          loading={categorySaving || masterDeleting}
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            pageSizeOptions: ["10", "25", "50", "100"],
          }}
          scroll={{
            x: 780,
          }}
        />
      </Modal>

      {/* BRANCH MANAGER */}

      <Modal
        title="Manage Branches / Posting Places"
        open={branchManagerOpen}
        onCancel={() => setBranchManagerOpen(false)}
        footer={null}
        width={920}
        destroyOnHidden
      >
        <Alert
          type="info"
          showIcon
          style={{
            marginBottom: 16,
          }}
          message="Branch / Posting Place is independent from Staff Category and maps to a ZKBioTime Position."
          description="Renaming updates the safe Position mapping. Permanent Delete is a Super Admin action and also permanently removes all Staff currently linked to that Branch / Posting Place."
        />

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            marginBottom: 12,
            flexWrap: "wrap",
          }}
        >
          <Text type="secondary">
            Branches / Postings: <strong>{branches.length}</strong>
          </Text>

          {canManageStaffMasters && (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={openAddBranch}
            >
              Add Branch / Posting
            </Button>
          )}
        </div>

        <Table
          rowKey="id"
          size="small"
          columns={branchManagementColumns}
          dataSource={branches}
          loading={branchSaving || masterDeleting}
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            pageSizeOptions: ["10", "25", "50", "100"],
          }}
          scroll={{
            x: 760,
          }}
        />
      </Modal>

      {/* CATEGORY MODAL */}

      <Modal
        title={
          categoryFormMode === "edit"
            ? "Edit Staff Category / Duty Type"
            : "Add Staff Category / Duty Type"
        }
        open={categoryModalOpen}
        onCancel={closeCategoryModal}
        onOk={handleSaveCategory}
        confirmLoading={categorySaving}
        okText={categoryFormMode === "edit" ? "Update Category" : "Create Category"}
        destroyOnHidden
      >
        <Alert
          type="info"
          showIcon
          style={{
            marginBottom: 16,
          }}
          message="Staff Category duty type hai."
          description={
            categoryFormMode === "edit"
              ? "Category rename Portal aur ZKBioTime Department mapping dono par safely synchronize hogi. Shared Department mapping ko overwrite nahi kiya jayega."
              : "Category Branch ke sath fixed nahi hogi. Ye ZKBioTime mein Staff Department ke taur par synchronize hogi."
          }
        />

        <Form form={categoryForm} layout="vertical">
          <Form.Item
            name="category_name"
            label="Category Name"
            rules={[
              {
                required: true,

                message: "Category Name is required.",
              },
            ]}
          >
            <Input placeholder="e.g. Security Staff" />
          </Form.Item>
        </Form>
      </Modal>

      {/* BRANCH MODAL */}

      <Modal
        title={
          branchFormMode === "edit"
            ? "Edit Branch / Posting Place"
            : "Add Branch / Posting Place"
        }
        open={branchModalOpen}
        onCancel={closeBranchModal}
        onOk={handleSaveBranch}
        confirmLoading={branchSaving}
        okText={branchFormMode === "edit" ? "Update Branch" : "Create Branch"}
        destroyOnHidden
      >
        <Alert
          type="info"
          showIcon
          style={{
            marginBottom: 16,
          }}
          message="Branch / Posting Place global hai."
          description={
            branchFormMode === "edit"
              ? "Branch rename Portal aur ZKBioTime Position mapping dono par safely synchronize hogi. Shared Position mapping ko overwrite nahi kiya jayega."
              : "Ye kisi Staff Category ke sath fixed nahi hogi. Har Category ka staff is Branch mein post ho sakta hai. ZKBioTime mein Position Name ke taur par synchronize hogi."
          }
        />

        <Form form={branchForm} layout="vertical">
          <Form.Item
            name="branch_name"
            label="Branch / Posting Place"
            rules={[
              {
                required: true,

                message: "Branch / Posting Place is required.",
              },
            ]}
          >
            <Input placeholder="e.g. Establishment Branch" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
