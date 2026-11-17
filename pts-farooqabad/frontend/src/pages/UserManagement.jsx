import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  Alert,
  Button,
  Card,
  Checkbox,
  Col,
  Drawer,
  Form,
  Input,
  Modal,
  Row,
  Select,
  Space,
  Switch,
  Tabs,
  Tag,
  Typography,
  message,
} from "antd";
import Table from "../components/SerialTable";

import {
  CheckCircleOutlined,
  EditOutlined,
  KeyOutlined,
  PlusOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  StopOutlined,
  TeamOutlined,
} from "@ant-design/icons";

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
| HELPERS
|--------------------------------------------------------------------------
*/

function formatDateTime(
  value
) {
  if (!value) {
    return "-";
  }

  const date =
    new Date(value);

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


function isSuperAdmin(
  roleName
) {
  return (
    String(
      roleName ||
      ""
    )
      .trim()
      .toUpperCase() ===
    "SUPER_ADMIN"
  );
}


export default function UserManagement({
  initialTab = "users",
}) {
  const {
    hasPermission,
  } = useAuth();


  const canViewUsers =
    hasPermission(
      "users.view"
    ) ||
    hasPermission(
      "users.manage"
    );

  const canManageUsers =
    hasPermission(
      "users.manage"
    );

  const canViewRoles =
    hasPermission(
      "roles.view"
    ) ||
    hasPermission(
      "roles.manage"
    );

  const canManageRoles =
    hasPermission(
      "roles.manage"
    );


  const [userForm] =
    Form.useForm();

  const [passwordForm] =
    Form.useForm();

  const [roleForm] =
    Form.useForm();


  const [
    activeTab,
    setActiveTab,
  ] =
    useState(() => {
      if (
        initialTab ===
          "roles" &&
        canViewRoles
      ) {
        return "roles";
      }

      if (
        canViewUsers
      ) {
        return "users";
      }

      return "roles";
    });


  const [
    loading,
    setLoading,
  ] = useState(false);

  const [
    saving,
    setSaving,
  ] = useState(false);


  const [
    users,
    setUsers,
  ] = useState([]);

  const [
    roles,
    setRoles,
  ] = useState([]);

  const [
    permissions,
    setPermissions,
  ] = useState([]);


  /*
  |--------------------------------------------------------------------------
  | USER FILTERS
  |--------------------------------------------------------------------------
  */

  const [
    search,
    setSearch,
  ] = useState("");

  const [
    roleFilter,
    setRoleFilter,
  ] = useState(null);

  const [
    statusFilter,
    setStatusFilter,
  ] = useState(null);


  /*
  |--------------------------------------------------------------------------
  | USER FORM
  |--------------------------------------------------------------------------
  */

  const [
    userDrawerOpen,
    setUserDrawerOpen,
  ] = useState(false);

  const [
    userFormMode,
    setUserFormMode,
  ] = useState("add");

  const [
    selectedUser,
    setSelectedUser,
  ] = useState(null);


  /*
  |--------------------------------------------------------------------------
  | USER PERMISSIONS
  |--------------------------------------------------------------------------
  */

  const [
    userPermissionDrawerOpen,
    setUserPermissionDrawerOpen,
  ] = useState(false);

  const [
    selectedOverrides,
    setSelectedOverrides,
  ] = useState({});

  const [
    selectedRoleDefaultIds,
    setSelectedRoleDefaultIds,
  ] = useState([]);


  /*
  |--------------------------------------------------------------------------
  | PASSWORD
  |--------------------------------------------------------------------------
  */

  const [
    passwordModalOpen,
    setPasswordModalOpen,
  ] = useState(false);


  /*
  |--------------------------------------------------------------------------
  | ROLE FORM
  |--------------------------------------------------------------------------
  */

  const [
    roleDrawerOpen,
    setRoleDrawerOpen,
  ] = useState(false);

  const [
    roleFormMode,
    setRoleFormMode,
  ] = useState("add");

  const [
    selectedRole,
    setSelectedRole,
  ] = useState(null);


  /*
  |--------------------------------------------------------------------------
  | ROLE PERMISSIONS
  |--------------------------------------------------------------------------
  */

  const [
    rolePermissionDrawerOpen,
    setRolePermissionDrawerOpen,
  ] = useState(false);

  const [
    selectedRolePermissionIds,
    setSelectedRolePermissionIds,
  ] = useState([]);


  /*
  |--------------------------------------------------------------------------
  | LOAD ROLES
  |--------------------------------------------------------------------------
  */

  const loadRoles =
    async () => {
      if (
        !canViewUsers &&
        !canViewRoles
      ) {
        setRoles([]);

        return [];
      }

      try {
        const response =
          await api.get(
            "/roles"
          );

        const rows =
          response.data
            ?.data ||
          [];

        setRoles(
          rows
        );

        return rows;

      } catch (error) {

        message.error(
          error.response
            ?.data
            ?.message ||
          "Could not load Roles."
        );

        return [];
      }
    };


  /*
  |--------------------------------------------------------------------------
  | LOAD PERMISSIONS
  |--------------------------------------------------------------------------
  */

  const loadPermissions =
    async () => {
      if (
        !canManageUsers &&
        !canViewRoles
      ) {
        setPermissions([]);

        return [];
      }

      try {
        const response =
          await api.get(
            "/permissions"
          );

        const rows =
          response.data
            ?.data ||
          [];

        setPermissions(
          rows
        );

        return rows;

      } catch (error) {

        message.error(
          error.response
            ?.data
            ?.message ||
          "Could not load permissions."
        );

        return [];
      }
    };


  /*
  |--------------------------------------------------------------------------
  | LOAD USERS
  |--------------------------------------------------------------------------
  */

  const loadUsers =
    async () => {
      if (
        !canViewUsers
      ) {
        setUsers([]);

        return;
      }

      setLoading(
        true
      );

      try {
        const params = {};

        if (
          search.trim()
        ) {
          params.search =
            search.trim();
        }

        if (
          roleFilter
        ) {
          params.role_id =
            roleFilter;
        }

        if (
          statusFilter
        ) {
          params.status =
            statusFilter;
        }

        const response =
          await api.get(
            "/users",
            {
              params,
            }
          );

        setUsers(
          response.data
            ?.data ||
          []
        );

      } catch (error) {

        message.error(
          error.response
            ?.data
            ?.message ||
          "Could not load users."
        );

      } finally {

        setLoading(
          false
        );
      }
    };


  /*
  |--------------------------------------------------------------------------
  | REFRESH ALL
  |--------------------------------------------------------------------------
  */

  const refreshAll =
    async () => {
      setLoading(
        true
      );

      try {
        await Promise.all([
          loadRoles(),

          loadPermissions(),

          canViewUsers
            ? loadUsers()
            : Promise.resolve(),
        ]);

      } finally {

        setLoading(
          false
        );
      }
    };


  useEffect(() => {
    loadRoles();

    loadPermissions();

    if (
      canViewUsers
    ) {
      loadUsers();
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  useEffect(() => {
    if (
      initialTab ===
        "roles" &&
      canViewRoles
    ) {
      setActiveTab(
        "roles"
      );

      return;
    }

    if (
      canViewUsers
    ) {
      setActiveTab(
        "users"
      );

      return;
    }

    if (
      canViewRoles
    ) {
      setActiveTab(
        "roles"
      );
    }
  }, [
    initialTab,
    canViewRoles,
    canViewUsers,
  ]);


  /*
  |--------------------------------------------------------------------------
  | ROLE OPTIONS
  |--------------------------------------------------------------------------
  */

  const roleOptions =
    useMemo(
      () =>
        roles
          .filter(
            (role) =>
              Boolean(
                role.is_active
              )
          )
          .map(
            (role) => ({
              value:
                role.id,

              label:
                role.role_name,
            })
          ),
      [
        roles,
      ]
    );


  /*
  |--------------------------------------------------------------------------
  | PERMISSION GROUPS
  |--------------------------------------------------------------------------
  */

  const permissionGroups =
    useMemo(
      () => {
        const groups =
          {};

        permissions.forEach(
          (item) => {
            const moduleName =
              item.module_name ||
              "OTHER";

            if (
              !groups[
                moduleName
              ]
            ) {
              groups[
                moduleName
              ] = [];
            }

            groups[
              moduleName
            ].push(
              item
            );
          }
        );

        return groups;
      },
      [
        permissions,
      ]
    );


  const roleDefaultSet =
    useMemo(
      () =>
        new Set(
          selectedRoleDefaultIds.map(
            Number
          )
        ),
      [
        selectedRoleDefaultIds,
      ]
    );


  const selectedRolePermissionSet =
    useMemo(
      () =>
        new Set(
          selectedRolePermissionIds.map(
            Number
          )
        ),
      [
        selectedRolePermissionIds,
      ]
    );


  /*
  |--------------------------------------------------------------------------
  | ADD USER
  |--------------------------------------------------------------------------
  */

  const openAddUser =
    () => {
      setUserFormMode(
        "add"
      );

      setSelectedUser(
        null
      );

      userForm.resetFields();

      userForm.setFieldsValue({
        is_active:
          true,
      });

      setUserDrawerOpen(
        true
      );
    };


  /*
  |--------------------------------------------------------------------------
  | EDIT USER
  |--------------------------------------------------------------------------
  */

  const openEditUser =
    (record) => {
      setUserFormMode(
        "edit"
      );

      setSelectedUser(
        record
      );

      userForm.resetFields();

      userForm.setFieldsValue({
        full_name:
          record.full_name,

        username:
          record.username,

        role_id:
          record.role_id,

        is_active:
          Boolean(
            record.is_active
          ),
      });

      setUserDrawerOpen(
        true
      );
    };


  /*
  |--------------------------------------------------------------------------
  | SAVE USER
  |--------------------------------------------------------------------------
  */

  const saveUser =
    async () => {
      try {
        const values =
          await userForm.validateFields();

        setSaving(
          true
        );

        if (
          userFormMode ===
          "add"
        ) {
          if (
            values.password !==
            values.confirm_password
          ) {
            message.error(
              "Password and Confirm Password do not match."
            );

            return;
          }

          await api.post(
            "/users",
            {
              full_name:
                values.full_name
                  ?.trim(),

              username:
                values.username
                  ?.trim(),

              password:
                values.password,

              role_id:
                values.role_id,

              is_active:
                values.is_active !==
                false,
            }
          );

          message.success(
            "User created successfully."
          );

        } else {

          await api.put(
            `/users/${selectedUser.id}`,
            {
              full_name:
                values.full_name
                  ?.trim(),

              username:
                values.username
                  ?.trim(),

              role_id:
                values.role_id,
            }
          );

          if (
            Boolean(
              selectedUser.is_active
            ) !==
            Boolean(
              values.is_active
            )
          ) {
            await api.put(
              `/users/${selectedUser.id}/status`,
              {
                is_active:
                  Boolean(
                    values.is_active
                  ),
              }
            );
          }

          message.success(
            "User updated successfully."
          );
        }

        setUserDrawerOpen(
          false
        );

        userForm.resetFields();

        await Promise.all([
          loadUsers(),
          loadRoles(),
        ]);

      } catch (error) {

        if (
          error
            ?.errorFields
        ) {
          return;
        }

        message.error(
          error.response
            ?.data
            ?.message ||
          "Could not save user."
        );

      } finally {

        setSaving(
          false
        );
      }
    };


  /*
  |--------------------------------------------------------------------------
  | USER STATUS
  |--------------------------------------------------------------------------
  */

  const changeUserStatus =
    (record) => {
      const activating =
        !Boolean(
          record.is_active
        );

      Modal.confirm({
        title:
          activating
            ? "Activate User?"
            : "Deactivate User?",

        content:
          activating
            ? `Activate ${record.full_name}?`
            : `Deactivate ${record.full_name}? User will no longer be able to login.`,

        okText:
          activating
            ? "Activate"
            : "Deactivate",

        okType:
          activating
            ? "primary"
            : "danger",

        async onOk() {
          try {
            await api.put(
              `/users/${record.id}/status`,
              {
                is_active:
                  activating,
              }
            );

            message.success(
              activating
                ? "User activated."
                : "User deactivated."
            );

            await Promise.all([
              loadUsers(),
              loadRoles(),
            ]);

          } catch (error) {

            message.error(
              error.response
                ?.data
                ?.message ||
              "Could not update user status."
            );
          }
        },
      });
    };


  /*
  |--------------------------------------------------------------------------
  | PASSWORD
  |--------------------------------------------------------------------------
  */

  const openPasswordReset =
    (record) => {
      setSelectedUser(
        record
      );

      passwordForm.resetFields();

      setPasswordModalOpen(
        true
      );
    };


  const resetPassword =
    async () => {
      try {
        const values =
          await passwordForm.validateFields();

        if (
          values.password !==
          values.confirm_password
        ) {
          message.error(
            "Password and Confirm Password do not match."
          );

          return;
        }

        setSaving(
          true
        );

        await api.put(
          `/users/${selectedUser.id}/password`,
          {
            password:
              values.password,
          }
        );

        message.success(
          "Password reset successfully."
        );

        setPasswordModalOpen(
          false
        );

        passwordForm.resetFields();

      } catch (error) {

        if (
          error
            ?.errorFields
        ) {
          return;
        }

        message.error(
          error.response
            ?.data
            ?.message ||
          "Could not reset password."
        );

      } finally {

        setSaving(
          false
        );
      }
    };


  /*
  |--------------------------------------------------------------------------
  | USER PERMISSIONS
  |--------------------------------------------------------------------------
  */

  const openUserPermissions =
    async (record) => {
      try {
        setSaving(
          true
        );

        const response =
          await api.get(
            `/users/${record.id}/permissions`
          );

        const data =
          response.data
            ?.data ||
          {};

        const overrides =
          {};

        (
          data.user_overrides ||
          []
        ).forEach(
          (item) => {
            overrides[
              item.permission_id
            ] =
              item.access_type;
          }
        );

        setSelectedUser(
          record
        );

        setSelectedOverrides(
          overrides
        );

        setSelectedRoleDefaultIds(
          (
            data.role_permissions ||
            []
          ).map(
            (item) =>
              Number(
                item.id
              )
          )
        );

        setUserPermissionDrawerOpen(
          true
        );

      } catch (error) {

        message.error(
          error.response
            ?.data
            ?.message ||
          "Could not load user permissions."
        );

      } finally {

        setSaving(
          false
        );
      }
    };


  const saveUserPermissions =
    async () => {
      try {
        setSaving(
          true
        );

        const overrides =
          Object.entries(
            selectedOverrides
          )
            .filter(
              (
                [
                  ,
                  value,
                ]
              ) =>
                value ===
                  "ALLOW" ||
                value ===
                  "DENY"
            )
            .map(
              (
                [
                  permissionId,
                  accessType,
                ]
              ) => ({
                permission_id:
                  Number(
                    permissionId
                  ),

                access_type:
                  accessType,
              })
            );

        await api.put(
          `/users/${selectedUser.id}/permissions`,
          {
            overrides,
          }
        );

        message.success(
          "User permissions updated successfully."
        );

        setUserPermissionDrawerOpen(
          false
        );

      } catch (error) {

        message.error(
          error.response
            ?.data
            ?.message ||
          "Could not update user permissions."
        );

      } finally {

        setSaving(
          false
        );
      }
    };


  /*
  |--------------------------------------------------------------------------
  | ADD ROLE
  |--------------------------------------------------------------------------
  */

  const openAddRole =
    () => {
      setRoleFormMode(
        "add"
      );

      setSelectedRole(
        null
      );

      roleForm.resetFields();

      roleForm.setFieldsValue({
        is_active:
          true,
      });

      setRoleDrawerOpen(
        true
      );
    };


  /*
  |--------------------------------------------------------------------------
  | EDIT ROLE
  |--------------------------------------------------------------------------
  */

  const openEditRole =
    (record) => {
      setRoleFormMode(
        "edit"
      );

      setSelectedRole(
        record
      );

      roleForm.resetFields();

      roleForm.setFieldsValue({
        role_name:
          record.role_name,

        description:
          record.description ||
          "",

        is_active:
          Boolean(
            record.is_active
          ),
      });

      setRoleDrawerOpen(
        true
      );
    };


  /*
  |--------------------------------------------------------------------------
  | SAVE ROLE
  |--------------------------------------------------------------------------
  */

  const saveRole =
    async () => {
      try {
        const values =
          await roleForm.validateFields();

        setSaving(
          true
        );

        if (
          roleFormMode ===
          "add"
        ) {
          await api.post(
            "/roles",
            {
              role_name:
                values.role_name
                  ?.trim(),

              description:
                values.description
                  ?.trim() ||
                null,

              is_active:
                values.is_active !==
                false,
            }
          );

          message.success(
            "Role created successfully."
          );

        } else {

          await api.put(
            `/roles/${selectedRole.id}`,
            {
              role_name:
                values.role_name
                  ?.trim(),

              description:
                values.description
                  ?.trim() ||
                null,
            }
          );

          if (
            Boolean(
              selectedRole.is_active
            ) !==
            Boolean(
              values.is_active
            )
          ) {
            await api.put(
              `/roles/${selectedRole.id}/status`,
              {
                is_active:
                  Boolean(
                    values.is_active
                  ),
              }
            );
          }

          message.success(
            "Role updated successfully."
          );
        }

        setRoleDrawerOpen(
          false
        );

        roleForm.resetFields();

        await Promise.all([
          loadRoles(),

          canViewUsers
            ? loadUsers()
            : Promise.resolve(),
        ]);

      } catch (error) {

        if (
          error
            ?.errorFields
        ) {
          return;
        }

        message.error(
          error.response
            ?.data
            ?.message ||
          "Could not save Role."
        );

      } finally {

        setSaving(
          false
        );
      }
    };


  /*
  |--------------------------------------------------------------------------
  | ROLE STATUS
  |--------------------------------------------------------------------------
  */

  const changeRoleStatus =
    (record) => {
      const activating =
        !Boolean(
          record.is_active
        );

      Modal.confirm({
        title:
          activating
            ? "Activate Role?"
            : "Deactivate Role?",

        content:
          activating
            ? `Activate Role ${record.role_name}?`
            : `${record.active_user_count || 0} active user(s) are assigned to ${record.role_name}. Deactivating this Role will stop those users from logging in.`,

        okText:
          activating
            ? "Activate"
            : "Deactivate",

        okType:
          activating
            ? "primary"
            : "danger",

        async onOk() {
          try {
            await api.put(
              `/roles/${record.id}/status`,
              {
                is_active:
                  activating,
              }
            );

            message.success(
              activating
                ? "Role activated."
                : "Role deactivated."
            );

            await Promise.all([
              loadRoles(),

              canViewUsers
                ? loadUsers()
                : Promise.resolve(),
            ]);

          } catch (error) {

            message.error(
              error.response
                ?.data
                ?.message ||
              "Could not update Role status."
            );
          }
        },
      });
    };


  /*
  |--------------------------------------------------------------------------
  | OPEN ROLE PERMISSIONS
  |--------------------------------------------------------------------------
  */

  const openRolePermissions =
    async (record) => {
      try {
        setSaving(
          true
        );

        const response =
          await api.get(
            `/roles/${record.id}/permissions`
          );

        const data =
          response.data
            ?.data ||
          {};

        setSelectedRole(
          record
        );

        setSelectedRolePermissionIds(
          (
            data.permission_ids ||
            []
          ).map(
            Number
          )
        );

        setRolePermissionDrawerOpen(
          true
        );

      } catch (error) {

        message.error(
          error.response
            ?.data
            ?.message ||
          "Could not load Role permissions."
        );

      } finally {

        setSaving(
          false
        );
      }
    };


  /*
  |--------------------------------------------------------------------------
  | TOGGLE ROLE PERMISSION
  |--------------------------------------------------------------------------
  */

  const toggleRolePermission =
    (
      permissionId,
      checked
    ) => {
      const id =
        Number(
          permissionId
        );

      setSelectedRolePermissionIds(
        (previous) => {
          const next =
            new Set(
              previous.map(
                Number
              )
            );

          if (checked) {
            next.add(
              id
            );
          } else {
            next.delete(
              id
            );
          }

          return Array.from(
            next
          );
        }
      );
    };


  /*
  |--------------------------------------------------------------------------
  | TOGGLE MODULE
  |--------------------------------------------------------------------------
  */

  const toggleModulePermissions =
    (
      items,
      checked
    ) => {
      const ids =
        items.map(
          (item) =>
            Number(
              item.id
            )
        );

      setSelectedRolePermissionIds(
        (previous) => {
          const next =
            new Set(
              previous.map(
                Number
              )
            );

          ids.forEach(
            (id) => {
              if (checked) {
                next.add(
                  id
                );
              } else {
                next.delete(
                  id
                );
              }
            }
          );

          return Array.from(
            next
          );
        }
      );
    };


  /*
  |--------------------------------------------------------------------------
  | SAVE ROLE PERMISSIONS
  |--------------------------------------------------------------------------
  */

  const saveRolePermissions =
    async () => {
      try {
        setSaving(
          true
        );

        await api.put(
          `/roles/${selectedRole.id}/permissions`,
          {
            permission_ids:
              selectedRolePermissionIds,
          }
        );

        message.success(
          "Role permissions updated successfully."
        );

        setRolePermissionDrawerOpen(
          false
        );

        await loadRoles();

      } catch (error) {

        message.error(
          error.response
            ?.data
            ?.message ||
          "Could not update Role permissions."
        );

      } finally {

        setSaving(
          false
        );
      }
    };


  /*
  |--------------------------------------------------------------------------
  | USER TABLE
  |--------------------------------------------------------------------------
  */

  const userColumns = [
    {
      title:
        "Full Name",

      dataIndex:
        "full_name",

      key:
        "full_name",

      render:
        (value) => (
          <Text strong>
            {value ||
              "-"}
          </Text>
        ),
    },

    {
      title:
        "Username",

      dataIndex:
        "username",

      width:
        160,
    },

    {
      title:
        "Role",

      dataIndex:
        "role_name",

      width:
        180,

      render:
        (
          value,
          record
        ) => (
          <Space
            direction="vertical"
            size={0}
          >
            <Tag color="blue">
              {value ||
                "No Role"}
            </Tag>

            {!record.role_is_active && (
              <Text
                type="danger"
                style={{
                  fontSize:
                    11,
                }}
              >
                Role inactive
              </Text>
            )}
          </Space>
        ),
    },

    {
      title:
        "Status",

      dataIndex:
        "is_active",

      width:
        100,

      render:
        (value) => (
          <Tag
            color={
              value
                ? "green"
                : "default"
            }
          >
            {value
              ? "Active"
              : "Inactive"}
          </Tag>
        ),
    },

    {
      title:
        "Last Login",

      dataIndex:
        "last_login",

      width:
        180,

      render:
        formatDateTime,
    },

    {
      title:
        "Actions",

      width:
        360,

      fixed:
        "right",

      render:
        (
          _,
          record
        ) =>
          canManageUsers ? (
            <Space wrap>
              <Button
                size="small"

                icon={
                  <EditOutlined />
                }

                onClick={() =>
                  openEditUser(
                    record
                  )
                }
              >
                Edit
              </Button>

              <Button
                size="small"

                icon={
                  <SafetyCertificateOutlined />
                }

                onClick={() =>
                  openUserPermissions(
                    record
                  )
                }
              >
                Permissions
              </Button>

              <Button
                size="small"

                icon={
                  <KeyOutlined />
                }

                onClick={() =>
                  openPasswordReset(
                    record
                  )
                }
              >
                Password
              </Button>

              <Button
                size="small"

                danger={
                  Boolean(
                    record.is_active
                  )
                }

                icon={
                  record.is_active
                    ? (
                      <StopOutlined />
                    )
                    : (
                      <CheckCircleOutlined />
                    )
                }

                onClick={() =>
                  changeUserStatus(
                    record
                  )
                }
              >
                {record.is_active
                  ? "Deactivate"
                  : "Activate"}
              </Button>
            </Space>
          ) : (
            "-"
          ),
    },
  ];


  /*
  |--------------------------------------------------------------------------
  | ROLE TABLE
  |--------------------------------------------------------------------------
  */

  const roleColumns = [
    {
      title:
        "Role Name",

      dataIndex:
        "role_name",

      key:
        "role_name",

      width:
        220,

      render:
        (value) => (
          <Space>
            <Text strong>
              {value ||
                "-"}
            </Text>

            {isSuperAdmin(
              value
            ) && (
              <Tag color="red">
                Protected
              </Tag>
            )}
          </Space>
        ),
    },

    {
      title:
        "Description",

      dataIndex:
        "description",

      render:
        (value) =>
          value ||
          "-",
    },

    {
      title:
        "Users",

      dataIndex:
        "user_count",

      width:
        90,

      align:
        "center",
    },

    {
      title:
        "Active Users",

      dataIndex:
        "active_user_count",

      width:
        110,

      align:
        "center",
    },

    {
      title:
        "Permissions",

      dataIndex:
        "permission_count",

      width:
        110,

      align:
        "center",
    },

    {
      title:
        "Status",

      dataIndex:
        "is_active",

      width:
        100,

      render:
        (value) => (
          <Tag
            color={
              value
                ? "green"
                : "default"
            }
          >
            {value
              ? "Active"
              : "Inactive"}
          </Tag>
        ),
    },

    {
      title:
        "Actions",

      width:
        280,

      fixed:
        "right",

      render:
        (
          _,
          record
        ) => (
          <Space wrap>
            {canManageRoles && (
              <Button
                size="small"

                icon={
                  <EditOutlined />
                }

                onClick={() =>
                  openEditRole(
                    record
                  )
                }
              >
                Edit
              </Button>
            )}

            <Button
              size="small"

              type="primary"
              ghost

              icon={
                <SafetyCertificateOutlined />
              }

              onClick={() =>
                openRolePermissions(
                  record
                )
              }
            >
              Permissions
            </Button>

            {canManageRoles && (
              <Button
                size="small"

                disabled={
                  isSuperAdmin(
                    record.role_name
                  )
                }

                danger={
                  Boolean(
                    record.is_active
                  )
                }

                icon={
                  record.is_active
                    ? (
                      <StopOutlined />
                    )
                    : (
                      <CheckCircleOutlined />
                    )
                }

                onClick={() =>
                  changeRoleStatus(
                    record
                  )
                }
              >
                {record.is_active
                  ? "Deactivate"
                  : "Activate"}
              </Button>
            )}
          </Space>
        ),
    },
  ];


  /*
  |--------------------------------------------------------------------------
  | USERS TAB
  |--------------------------------------------------------------------------
  */

  const userTab = (
    <>
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

          flexWrap:
            "wrap",

          marginBottom:
            16,
        }}
      >
        <div>
          <Title
            level={4}
            style={{
              margin:
                0,
            }}
          >
            Portal Users
          </Title>

          <Text type="secondary">
            Kisi bhi active Role ke against jitne chahein users create karein.
          </Text>
        </div>

        <Space>
          <Button
            icon={
              <ReloadOutlined />
            }

            onClick={
              loadUsers
            }
          >
            Refresh
          </Button>

          {canManageUsers && (
            <Button
              type="primary"

              icon={
                <PlusOutlined />
              }

              onClick={
                openAddUser
              }
            >
              Add User
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
            xs={24}
            md={10}
          >
            <Input.Search
              allowClear

              placeholder="Search Full Name or Username"

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

              onSearch={
                loadUsers
              }
            />
          </Col>


          <Col
            xs={24}
            md={6}
          >
            <Select
              allowClear
              showSearch

              optionFilterProp="label"

              style={{
                width:
                  "100%",
              }}

              placeholder="Role"

              options={
                roleOptions
              }

              value={
                roleFilter
              }

              onChange={
                setRoleFilter
              }
            />
          </Col>


          <Col
            xs={24}
            md={5}
          >
            <Select
              allowClear

              style={{
                width:
                  "100%",
              }}

              placeholder="Status"

              value={
                statusFilter
              }

              onChange={
                setStatusFilter
              }

              options={[
                {
                  value:
                    "ACTIVE",

                  label:
                    "Active",
                },

                {
                  value:
                    "INACTIVE",

                  label:
                    "Inactive",
                },
              ]}
            />
          </Col>


          <Col
            xs={24}
            md={3}
          >
            <Button
              type="primary"
              block

              onClick={
                loadUsers
              }
            >
              Search
            </Button>
          </Col>
        </Row>
      </Card>


      <Card>
        <Table
          rowKey="id"

          loading={
            loading
          }

          dataSource={
            users
          }

          columns={
            userColumns
          }

          scroll={{
            x:
              1250,
          }}

          pagination={{
            pageSize:
              20,

            showSizeChanger:
              true,

            showTotal:
              (total) =>
                `Total ${total} users`,
          }}
        />
      </Card>
    </>
  );


  /*
  |--------------------------------------------------------------------------
  | ROLES TAB
  |--------------------------------------------------------------------------
  */

  const roleTab = (
    <>
      <Alert
        type="info"
        showIcon

        style={{
          marginBottom:
            16,
        }}

        message="Dynamic Roles"

        description="Principal, Muharrar, OSI, Course Commander, Duty Officer, Attendance Clerk ya koi bhi future Role yahan se create kiya ja sakta hai. Code ya SQL change ki zarurat nahi."
      />


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

          flexWrap:
            "wrap",

          marginBottom:
            16,
        }}
      >
        <div>
          <Title
            level={4}
            style={{
              margin:
                0,
            }}
          >
            Roles & Permissions
          </Title>

          <Text type="secondary">
            Role create karein aur module-wise permissions assign karein.
          </Text>
        </div>

        <Space>
          <Button
            icon={
              <ReloadOutlined />
            }

            onClick={() =>
              Promise.all([
                loadRoles(),
                loadPermissions(),
              ])
            }
          >
            Refresh
          </Button>

          {canManageRoles && (
            <Button
              type="primary"

              icon={
                <PlusOutlined />
              }

              onClick={
                openAddRole
              }
            >
              Add Role
            </Button>
          )}
        </Space>
      </div>


      <Card>
        <Table
          rowKey="id"

          loading={
            loading
          }

          dataSource={
            roles
          }

          columns={
            roleColumns
          }

          scroll={{
            x:
              1200,
          }}

          pagination={
            false
          }
        />
      </Card>
    </>
  );


  /*
  |--------------------------------------------------------------------------
  | ACCESS
  |--------------------------------------------------------------------------
  */

  if (
    !canViewUsers &&
    !canViewRoles
  ) {
    return (
      <Alert
        type="error"
        showIcon

        message="Access Denied"

        description="You do not have permission to view User or Role Management."
      />
    );
  }


  /*
  |--------------------------------------------------------------------------
  | TABS
  |--------------------------------------------------------------------------
  */

  const tabItems = [];

  if (
    canViewUsers
  ) {
    tabItems.push({
      key:
        "users",

      label: (
        <Space>
          <TeamOutlined />

          Users
        </Space>
      ),

      children:
        userTab,
    });
  }

  if (
    canViewRoles
  ) {
    tabItems.push({
      key:
        "roles",

      label: (
        <Space>
          <SafetyCertificateOutlined />

          Roles & Permissions
        </Space>
      ),

      children:
        roleTab,
    });
  }


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

          flexWrap:
            "wrap",

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
            Administration
          </Title>

          <Text type="secondary">
            Portal users, dynamic Roles, passwords and permissions.
          </Text>
        </div>

        <Button
          icon={
            <ReloadOutlined />
          }

          loading={
            loading
          }

          onClick={
            refreshAll
          }
        >
          Refresh All
        </Button>
      </div>


      <Tabs
        activeKey={
          activeTab
        }

        onChange={
          setActiveTab
        }

        items={
          tabItems
        }
      />


      {/* USER ADD / EDIT */}

      <Drawer
        title={
          userFormMode ===
          "add"
            ? "Add Portal User"
            : "Edit Portal User"
        }

        width={
          620
        }

        open={
          userDrawerOpen
        }

        destroyOnHidden

        onClose={() =>
          setUserDrawerOpen(
            false
          )
        }

        extra={
          <Space>
            <Button
              onClick={() =>
                setUserDrawerOpen(
                  false
                )
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
                saveUser
              }
            >
              Save
            </Button>
          </Space>
        }
      >
        <Form
          form={
            userForm
          }

          layout="vertical"
        >
          <Form.Item
            name="full_name"

            label="Full Name"

            rules={[
              {
                required:
                  true,

                message:
                  "Full Name is required.",
              },
            ]}
          >
            <Input
              placeholder="e.g. Muhammad Ali"
            />
          </Form.Item>


          <Form.Item
            name="username"

            label="Username"

            rules={[
              {
                required:
                  true,

                message:
                  "Username is required.",
              },
            ]}
          >
            <Input
              placeholder="e.g. muhammad.ali"
            />
          </Form.Item>


          <Form.Item
            name="role_id"

            label="Role"

            rules={[
              {
                required:
                  true,

                message:
                  "Role is required.",
              },
            ]}
          >
            <Select
              showSearch

              optionFilterProp="label"

              options={
                roleOptions
              }

              placeholder="Select Role"
            />
          </Form.Item>


          {userFormMode ===
            "add" && (
            <>
              <Form.Item
                name="password"

                label="Password"

                rules={[
                  {
                    required:
                      true,
                  },

                  {
                    min:
                      8,

                    message:
                      "Minimum 8 characters.",
                  },
                ]}
              >
                <Input.Password />
              </Form.Item>


              <Form.Item
                name="confirm_password"

                label="Confirm Password"

                rules={[
                  {
                    required:
                      true,
                  },
                ]}
              >
                <Input.Password />
              </Form.Item>
            </>
          )}


          <Form.Item
            name="is_active"

            label="Active"

            valuePropName="checked"
          >
            <Switch />
          </Form.Item>
        </Form>
      </Drawer>


      {/* PASSWORD */}

      <Modal
        title={
          `Reset Password${
            selectedUser
              ? ` - ${selectedUser.full_name}`
              : ""
          }`
        }

        open={
          passwordModalOpen
        }

        onCancel={() =>
          setPasswordModalOpen(
            false
          )
        }

        onOk={
          resetPassword
        }

        okText="Reset Password"

        confirmLoading={
          saving
        }
      >
        <Alert
          type="warning"
          showIcon

          style={{
            marginBottom:
              18,
          }}

          message="Existing password cannot be viewed. A new password will replace it."
        />


        <Form
          form={
            passwordForm
          }

          layout="vertical"
        >
          <Form.Item
            name="password"

            label="New Password"

            rules={[
              {
                required:
                  true,
              },

              {
                min:
                  8,

                message:
                  "Minimum 8 characters.",
              },
            ]}
          >
            <Input.Password />
          </Form.Item>


          <Form.Item
            name="confirm_password"

            label="Confirm New Password"

            rules={[
              {
                required:
                  true,
              },
            ]}
          >
            <Input.Password />
          </Form.Item>
        </Form>
      </Modal>


      {/* USER PERMISSIONS */}

      <Drawer
        title={
          selectedUser
            ? `User Permissions - ${selectedUser.full_name}`
            : "User Permissions"
        }

        width={
          800
        }

        open={
          userPermissionDrawerOpen
        }

        onClose={() =>
          setUserPermissionDrawerOpen(
            false
          )
        }

        extra={
          <Button
            type="primary"

            loading={
              saving
            }

            onClick={
              saveUserPermissions
            }
          >
            Save Permissions
          </Button>
        }
      >
        <Alert
          type="info"
          showIcon

          style={{
            marginBottom:
              20,
          }}

          message="Individual Permission Override"

          description="Role Default normally apply hota hai. ALLOW user ko extra permission deta hai aur DENY Role se milne wali permission bhi remove kar deta hai."
        />


        {Object.entries(
          permissionGroups
        ).map(
          (
            [
              moduleName,
              items,
            ]
          ) => (
            <Card
              key={
                moduleName
              }

              size="small"

              title={
                moduleName
              }

              style={{
                marginBottom:
                  14,
              }}
            >
              {items.map(
                (
                  permission
                ) => {
                  const roleAllows =
                    roleDefaultSet.has(
                      Number(
                        permission.id
                      )
                    );

                  return (
                    <div
                      key={
                        permission.id
                      }

                      style={{
                        display:
                          "flex",

                        justifyContent:
                          "space-between",

                        alignItems:
                          "center",

                        gap:
                          20,

                        padding:
                          "10px 0",

                        borderBottom:
                          "1px solid #f0f0f0",
                      }}
                    >
                      <div>
                        <Space wrap>
                          <Text strong>
                            {
                              permission.permission_name
                            }
                          </Text>

                          <Tag
                            color={
                              roleAllows
                                ? "green"
                                : "default"
                            }
                          >
                            Role Default:{" "}
                            {roleAllows
                              ? "Allow"
                              : "No Access"}
                          </Tag>
                        </Space>

                        <div>
                          <Text
                            type="secondary"

                            style={{
                              fontSize:
                                12,
                            }}
                          >
                            {
                              permission.permission_key
                            }
                          </Text>
                        </div>

                        {permission.description && (
                          <div>
                            <Text
                              type="secondary"

                              style={{
                                fontSize:
                                  12,
                              }}
                            >
                              {
                                permission.description
                              }
                            </Text>
                          </div>
                        )}
                      </div>


                      <Select
                        style={{
                          width:
                            155,
                        }}

                        value={
                          selectedOverrides[
                            permission.id
                          ] ||
                          "DEFAULT"
                        }

                        onChange={(
                          value
                        ) => {
                          setSelectedOverrides(
                            (
                              previous
                            ) => ({
                              ...previous,

                              [permission.id]:
                                value,
                            })
                          );
                        }}

                        options={[
                          {
                            value:
                              "DEFAULT",

                            label:
                              "Role Default",
                          },

                          {
                            value:
                              "ALLOW",

                            label:
                              "Allow",
                          },

                          {
                            value:
                              "DENY",

                            label:
                              "Deny",
                          },
                        ]}
                      />
                    </div>
                  );
                }
              )}
            </Card>
          )
        )}
      </Drawer>


      {/* ROLE ADD / EDIT */}

      <Drawer
        title={
          roleFormMode ===
          "add"
            ? "Add New Role"
            : `Edit Role - ${selectedRole?.role_name || ""}`
        }

        width={
          620
        }

        open={
          roleDrawerOpen
        }

        destroyOnHidden

        onClose={() =>
          setRoleDrawerOpen(
            false
          )
        }

        extra={
          <Space>
            <Button
              onClick={() =>
                setRoleDrawerOpen(
                  false
                )
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
                saveRole
              }
            >
              Save Role
            </Button>
          </Space>
        }
      >
        <Alert
          type="info"
          showIcon

          style={{
            marginBottom:
              18,
          }}

          message="Role name is fully dynamic"

          description="Principal, Muharrar, OSI, Course Commander, Duty Officer ya koi bhi required designation/role create kar sakte hain."
        />


        <Form
          form={
            roleForm
          }

          layout="vertical"
        >
          <Form.Item
            name="role_name"

            label="Role Name"

            rules={[
              {
                required:
                  true,

                message:
                  "Role Name is required.",
              },

              {
                min:
                  2,

                max:
                  100,

                message:
                  "Role Name must contain 2 to 100 characters.",
              },
            ]}
          >
            <Input
              placeholder="e.g. Principal, Muharrar, OSI"

              disabled={
                roleFormMode ===
                  "edit" &&
                isSuperAdmin(
                  selectedRole
                    ?.role_name
                )
              }
            />
          </Form.Item>


          <Form.Item
            name="description"

            label="Description"
          >
            <Input.TextArea
              rows={
                4
              }

              placeholder="Optional Role description"
            />
          </Form.Item>


          <Form.Item
            name="is_active"

            label="Active"

            valuePropName="checked"
          >
            <Switch
              disabled={
                roleFormMode ===
                  "edit" &&
                isSuperAdmin(
                  selectedRole
                    ?.role_name
                )
              }
            />
          </Form.Item>
        </Form>


        {roleFormMode ===
          "add" && (
          <Alert
            type="success"
            showIcon

            message="After saving the Role, use its Permissions button to select module access."
          />
        )}
      </Drawer>


      {/* ROLE PERMISSIONS */}

      <Drawer
        title={
          selectedRole
            ? `Role Permissions - ${selectedRole.role_name}`
            : "Role Permissions"
        }

        width={
          860
        }

        open={
          rolePermissionDrawerOpen
        }

        onClose={() =>
          setRolePermissionDrawerOpen(
            false
          )
        }

        extra={
          canManageRoles ? (
            <Button
              type="primary"

              loading={
                saving
              }

              onClick={
                saveRolePermissions
              }
            >
              Save Role Permissions
            </Button>
          ) : null
        }
      >
        <Alert
          type="info"
          showIcon

          style={{
            marginBottom:
              20,
          }}

          message="Role Default Permissions"

          description="Checked permissions is Role ke tamam users ko default tor par milengi. Kisi specific user ke liye User Permission Override se ALLOW/DENY kiya ja sakta hai."
        />


        {Object.entries(
          permissionGroups
        ).map(
          (
            [
              moduleName,
              items,
            ]
          ) => {
            const moduleIds =
              items.map(
                (item) =>
                  Number(
                    item.id
                  )
              );

            const selectedCount =
              moduleIds.filter(
                (id) =>
                  selectedRolePermissionSet.has(
                    id
                  )
              ).length;

            const allChecked =
              moduleIds.length >
                0 &&
              selectedCount ===
                moduleIds.length;

            const indeterminate =
              selectedCount >
                0 &&
              selectedCount <
                moduleIds.length;

            return (
              <Card
                key={
                  moduleName
                }

                size="small"

                style={{
                  marginBottom:
                    14,
                }}

                title={
                  <Space>
                    <Checkbox
                      disabled={!canManageRoles}

                      checked={
                        allChecked
                      }

                      indeterminate={
                        indeterminate
                      }

                      onChange={(
                        event
                      ) =>
                        toggleModulePermissions(
                          items,
                          event.target
                            .checked
                        )
                      }
                    />

                    <span>
                      {
                        moduleName
                      }
                    </span>

                    <Tag>
                      {selectedCount}/
                      {moduleIds.length}
                    </Tag>
                  </Space>
                }
              >
                {items.map(
                  (
                    permission
                  ) => (
                    <div
                      key={
                        permission.id
                      }

                      style={{
                        padding:
                          "9px 0",

                        borderBottom:
                          "1px solid #f0f0f0",
                      }}
                    >
                      <Checkbox
                        disabled={!canManageRoles}

                        checked={
                          selectedRolePermissionSet.has(
                            Number(
                              permission.id
                            )
                          )
                        }

                        onChange={(
                          event
                        ) =>
                          toggleRolePermission(
                            permission.id,
                            event.target
                              .checked
                          )
                        }
                      >
                        <Text strong>
                          {
                            permission.permission_name
                          }
                        </Text>
                      </Checkbox>

                      <div
                        style={{
                          marginLeft:
                            24,
                        }}
                      >
                        <Text
                          type="secondary"

                          style={{
                            fontSize:
                              12,
                          }}
                        >
                          {
                            permission.permission_key
                          }
                        </Text>
                      </div>

                      {permission.description && (
                        <div
                          style={{
                            marginLeft:
                              24,
                          }}
                        >
                          <Text
                            type="secondary"

                            style={{
                              fontSize:
                                12,
                            }}
                          >
                            {
                              permission.description
                            }
                          </Text>
                        </div>
                      )}
                    </div>
                  )
                )}
              </Card>
            );
          }
        )}
      </Drawer>
    </div>
  );
}