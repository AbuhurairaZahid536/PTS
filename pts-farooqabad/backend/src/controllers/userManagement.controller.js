const {
  hashPassword,
} = require("../utils/password");

const {
  getEffectivePermissions,
} = require("../middleware/permissions");

const {
  getUsers,
  getUserById,

  getRoles,
  getRoleById,
  getRoleByName,

  getPermissions,
  getPermissionIdsByKeys,

  createRole,
  updateRole,
  updateRoleStatus,

  getRolePermissionDetails,
  replaceRolePermissions,

  createUser,
  updateUser,

  updateUserStatus,
  updatePassword,

  getUserPermissionDetails,
  replaceUserPermissions,

  countActiveSuperAdmins,
} = require(
  "../models/userManagement.model"
);

const {
  logRequestAudit,
} = require(
  "../services/audit.service"
);


/*
|--------------------------------------------------------------------------
| HELPERS
|--------------------------------------------------------------------------
*/

function cleanText(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  const text =
    String(value).trim();

  return text || null;
}


function parseBoolean(
  value,
  defaultValue = false
) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return defaultValue;
  }

  if (
    typeof value ===
    "boolean"
  ) {
    return value;
  }

  if (
    typeof value ===
    "number"
  ) {
    return value === 1;
  }

  const normalized =
    String(value)
      .trim()
      .toLowerCase();

  if (
    [
      "1",
      "true",
      "yes",
      "on",
      "active",
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
      "no",
      "off",
      "inactive",
    ].includes(
      normalized
    )
  ) {
    return false;
  }

  return defaultValue;
}


function isPositiveId(value) {
  const id =
    Number(value);

  return (
    Number.isInteger(id) &&
    id > 0
  );
}


function isSuperAdminRole(
  roleOrName
) {
  const roleName =
    typeof roleOrName ===
    "string"
      ? roleOrName
      : roleOrName
          ?.role_name;

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


/*
|--------------------------------------------------------------------------
| PERMISSION ID NORMALIZATION
|--------------------------------------------------------------------------
*/

function normalizePermissionIds(
  value
) {
  if (
    !Array.isArray(
      value
    )
  ) {
    return [];
  }

  return [
    ...new Set(
      value
        .map((item) => {
          if (
            item &&
            typeof item ===
              "object"
          ) {
            return Number(
              item.permission_id ??
              item.id
            );
          }

          return Number(
            item
          );
        })
        .filter(
          (item) =>
            Number.isInteger(
              item
            ) &&
            item > 0
        )
    ),
  ].sort(
    (a, b) =>
      a - b
  );
}


/*
|--------------------------------------------------------------------------
| OVERRIDE NORMALIZATION FOR AUDIT
|--------------------------------------------------------------------------
*/

function normalizeOverridesForAudit(
  value
) {
  if (
    !Array.isArray(
      value
    )
  ) {
    return [];
  }

  return value
    .map((item) => ({
      permission_id:
        Number(
          item
            ?.permission_id ??
          item
            ?.id
        ),

      access_type:
        String(
          item
            ?.access_type ||
          ""
        )
          .trim()
          .toUpperCase(),
    }))
    .filter(
      (item) =>
        Number.isInteger(
          item.permission_id
        ) &&
        item.permission_id >
          0 &&
        [
          "ALLOW",
          "DENY",
        ].includes(
          item.access_type
        )
    )
    .sort(
      (a, b) =>
        a.permission_id -
        b.permission_id
    );
}


/*
|--------------------------------------------------------------------------
| VALIDATE PERMISSION IDs
|--------------------------------------------------------------------------
*/

async function validatePermissionIds(
  permissionIds
) {
  const allPermissions =
    await getPermissions();

  const validIds =
    new Set(
      allPermissions.map(
        (item) =>
          Number(
            item.id
          )
      )
    );

  const invalid =
    permissionIds.filter(
      (id) =>
        !validIds.has(
          Number(id)
        )
    );

  if (
    invalid.length
  ) {
    const error =
      new Error(
        "One or more selected permissions are invalid or inactive."
      );

    error.statusCode =
      400;

    throw error;
  }
}


/*
|--------------------------------------------------------------------------
| NORMALIZE USER OVERRIDES
|--------------------------------------------------------------------------
*/

async function normalizePermissionOverrides(
  overrides
) {
  if (
    !Array.isArray(
      overrides
    )
  ) {
    return [];
  }

  const normalized = [];

  for (
    const item
    of overrides
  ) {
    const permissionId =
      Number(
        item
          ?.permission_id
      );

    const accessType =
      String(
        item
          ?.access_type ||
        ""
      )
        .trim()
        .toUpperCase();

    if (
      !Number.isInteger(
        permissionId
      ) ||
      permissionId <= 0 ||
      ![
        "ALLOW",
        "DENY",
      ].includes(
        accessType
      )
    ) {
      const error =
        new Error(
          "Invalid permission override."
        );

      error.statusCode =
        400;

      throw error;
    }

    normalized.push({
      permission_id:
        permissionId,

      access_type:
        accessType,
    });
  }

  const unique =
    new Map();

  for (
    const item
    of normalized
  ) {
    unique.set(
      item.permission_id,
      item
    );
  }

  const result =
    Array.from(
      unique.values()
    ).sort(
      (a, b) =>
        a.permission_id -
        b.permission_id
    );

  await validatePermissionIds(
    result.map(
      (item) =>
        item.permission_id
    )
  );

  return result;
}


/*
|--------------------------------------------------------------------------
| ROLE AUDIT HELPERS
|--------------------------------------------------------------------------
*/

function extractRolePermissionIds(
  details
) {
  if (!details) {
    return [];
  }

  if (
    Array.isArray(
      details.permission_ids
    )
  ) {
    return normalizePermissionIds(
      details.permission_ids
    );
  }

  if (
    Array.isArray(
      details.role_permissions
    )
  ) {
    return normalizePermissionIds(
      details.role_permissions
    );
  }

  if (
    Array.isArray(
      details.permissions
    )
  ) {
    return normalizePermissionIds(
      details.permissions
    );
  }

  return [];
}


function buildRoleAuditState(
  role,
  permissionDetails =
    null
) {
  if (!role) {
    return null;
  }

  return {
    role_name:
      role.role_name ||
      null,

    description:
      role.description ||
      null,

    is_active:
      parseBoolean(
        role.is_active,
        false
      ),

    permission_ids:
      extractRolePermissionIds(
        permissionDetails
      ),
  };
}


function buildEmptyRoleAuditState() {
  return {
    role_name:
      null,

    description:
      null,

    is_active:
      null,

    permission_ids:
      [],
  };
}


/*
|--------------------------------------------------------------------------
| USER AUDIT HELPERS
|--------------------------------------------------------------------------
*/

function buildUserAuditState(
  user,
  permissionDetails =
    null
) {
  if (!user) {
    return null;
  }

  return {
    username:
      user.username ||
      null,

    full_name:
      user.full_name ||
      null,

    role_id:
      user.role_id ||
      null,

    role_name:
      user.role_name ||
      null,

    is_active:
      parseBoolean(
        user.is_active,
        false
      ),

    permission_overrides:
      normalizeOverridesForAudit(
        permissionDetails
          ?.user_overrides ||
        []
      ),
  };
}


function buildEmptyUserAuditState() {
  return {
    username:
      null,

    full_name:
      null,

    role_id:
      null,

    role_name:
      null,

    is_active:
      null,

    permission_overrides:
      [],
  };
}


/*
|--------------------------------------------------------------------------
| CENTRAL AUDIT
|--------------------------------------------------------------------------
*/

async function writeAudit({
  req,

  module =
    "USER_MANAGEMENT",

  action,

  recordId,

  description,

  oldData =
    null,

  newData =
    null,
}) {
  return logRequestAudit(
    req,
    {
      action,

      module,

      recordId,

      description,

      oldData,

      newData,
    }
  );
}


/*
|--------------------------------------------------------------------------
| USERS LIST
|--------------------------------------------------------------------------
*/

async function listUsers(
  req,
  res,
  next
) {
  try {
    const rows =
      await getUsers({
        search:
          req.query.search ||
          "",

        roleId:
          req.query.role_id ||
          null,

        status:
          req.query.status ||
          null,
      });

    return res.json({
      success:
        true,

      data:
        rows,
    });
  } catch (error) {
    return next(
      error
    );
  }
}


/*
|--------------------------------------------------------------------------
| SINGLE USER
|--------------------------------------------------------------------------
*/

async function getUser(
  req,
  res,
  next
) {
  try {
    const id =
      Number(
        req.params.id
      );

    if (
      !isPositiveId(
        id
      )
    ) {
      return res
        .status(400)
        .json({
          success:
            false,

          message:
            "Invalid User ID.",
        });
    }

    const user =
      await getUserById(
        id
      );

    if (!user) {
      return res
        .status(404)
        .json({
          success:
            false,

          message:
            "User not found.",
        });
    }

    const permissionInfo =
      await getUserPermissionDetails(
        id
      );

    const effectivePermissions =
      await getEffectivePermissions(
        id,
        user.role_id
      );

    return res.json({
      success:
        true,

      data: {
        ...user,

        role_permissions:
          permissionInfo
            ?.role_permissions ||
          [],

        user_overrides:
          permissionInfo
            ?.user_overrides ||
          [],

        effective_permissions:
          effectivePermissions,
      },
    });
  } catch (error) {
    return next(
      error
    );
  }
}


/*
|--------------------------------------------------------------------------
| LIST ROLES
|--------------------------------------------------------------------------
*/

async function listRoles(
  req,
  res,
  next
) {
  try {
    const rows =
      await getRoles();

    return res.json({
      success:
        true,

      data:
        rows,
    });
  } catch (error) {
    return next(
      error
    );
  }
}


/*
|--------------------------------------------------------------------------
| PERMISSIONS MASTER
|--------------------------------------------------------------------------
*/

async function listPermissions(
  req,
  res,
  next
) {
  try {
    const rows =
      await getPermissions();

    return res.json({
      success:
        true,

      data:
        rows,
    });
  } catch (error) {
    return next(
      error
    );
  }
}


/*
|--------------------------------------------------------------------------
| CREATE ROLE
|--------------------------------------------------------------------------
*/

async function addRole(
  req,
  res,
  next
) {
  try {
    const roleName =
      cleanText(
        req.body.role_name
      );

    const description =
      cleanText(
        req.body.description
      );

    const isActive =
      parseBoolean(
        req.body.is_active,
        true
      );

    const permissionIds =
      normalizePermissionIds(
        req.body
          .permission_ids
      );

    if (!roleName) {
      return res
        .status(400)
        .json({
          success:
            false,

          message:
            "Role Name is required.",
        });
    }

    if (
      roleName.length < 2 ||
      roleName.length > 100
    ) {
      return res
        .status(400)
        .json({
          success:
            false,

          message:
            "Role Name must contain 2 to 100 characters.",
        });
    }

    /*
    |--------------------------------------------------------------------------
    | SUPER ADMIN PROTECTION
    |--------------------------------------------------------------------------
    */

    if (
      isSuperAdminRole(
        roleName
      )
    ) {
      return res
        .status(400)
        .json({
          success:
            false,

          message:
            "SUPER_ADMIN is a protected system Role and cannot be created manually.",
        });
    }

    const duplicate =
      await getRoleByName(
        roleName
      );

    if (duplicate) {
      return res
        .status(409)
        .json({
          success:
            false,

          message:
            "A Role with this name already exists.",
        });
    }

    await validatePermissionIds(
      permissionIds
    );

    const role =
      await createRole({
        roleName,
        description,
        isActive,
      });

    if (
      permissionIds.length
    ) {
      await replaceRolePermissions(
        role.id,
        permissionIds
      );
    }

    const finalRole =
      await getRoleById(
        role.id
      );

    const finalPermissions =
      await getRolePermissionDetails(
        role.id
      );

    /*
    |--------------------------------------------------------------------------
    | CENTRAL AUDIT
    |--------------------------------------------------------------------------
    */

    await writeAudit({
      req,

      module:
        "ROLE_MANAGEMENT",

      action:
        "CREATE",

      recordId:
        role.id,

      description:
        `Portal Role ${finalRole.role_name} created.`,

      oldData:
        buildEmptyRoleAuditState(),

      newData:
        buildRoleAuditState(
          finalRole,
          finalPermissions
        ),
    });

    return res
      .status(201)
      .json({
        success:
          true,

        message:
          "Role created successfully.",

        data:
          finalRole,
      });
  } catch (error) {
    if (
      error.code ===
      "ER_DUP_ENTRY"
    ) {
      return res
        .status(409)
        .json({
          success:
            false,

          message:
            "A Role with this name already exists.",
        });
    }

    if (
      error.statusCode
    ) {
      return res
        .status(
          error.statusCode
        )
        .json({
          success:
            false,

          message:
            error.message,
        });
    }

    return next(
      error
    );
  }
}


/*
|--------------------------------------------------------------------------
| EDIT ROLE
|--------------------------------------------------------------------------
*/

async function editRole(
  req,
  res,
  next
) {
  try {
    const roleId =
      Number(
        req.params.id
      );

    if (
      !isPositiveId(
        roleId
      )
    ) {
      return res
        .status(400)
        .json({
          success:
            false,

          message:
            "Invalid Role ID.",
        });
    }

    const existing =
      await getRoleById(
        roleId
      );

    if (!existing) {
      return res
        .status(404)
        .json({
          success:
            false,

          message:
            "Role not found.",
        });
    }

    const beforePermissions =
      await getRolePermissionDetails(
        roleId
      );

    const roleName =
      cleanText(
        req.body.role_name
      );

    const description =
      cleanText(
        req.body.description
      );

    if (!roleName) {
      return res
        .status(400)
        .json({
          success:
            false,

          message:
            "Role Name is required.",
        });
    }

    if (
      roleName.length < 2 ||
      roleName.length > 100
    ) {
      return res
        .status(400)
        .json({
          success:
            false,

          message:
            "Role Name must contain 2 to 100 characters.",
        });
    }

    /*
    |--------------------------------------------------------------------------
    | SUPER ADMIN PROTECTION
    |--------------------------------------------------------------------------
    */

    if (
      isSuperAdminRole(
        existing
      ) &&
      !isSuperAdminRole(
        roleName
      )
    ) {
      return res
        .status(400)
        .json({
          success:
            false,

          message:
            "The protected SUPER_ADMIN Role cannot be renamed.",
        });
    }

    if (
      !isSuperAdminRole(
        existing
      ) &&
      isSuperAdminRole(
        roleName
      )
    ) {
      return res
        .status(400)
        .json({
          success:
            false,

          message:
            "SUPER_ADMIN is a reserved system Role name.",
        });
    }

    const duplicate =
      await getRoleByName(
        roleName,
        roleId
      );

    if (duplicate) {
      return res
        .status(409)
        .json({
          success:
            false,

          message:
            "Another Role with this name already exists.",
        });
    }

    await updateRole(
      roleId,
      {
        roleName,
        description,
      }
    );

    const updated =
      await getRoleById(
        roleId
      );

    const afterPermissions =
      await getRolePermissionDetails(
        roleId
      );

    /*
    |--------------------------------------------------------------------------
    | CENTRAL AUDIT
    |--------------------------------------------------------------------------
    */

    await writeAudit({
      req,

      module:
        "ROLE_MANAGEMENT",

      action:
        "UPDATE",

      recordId:
        roleId,

      description:
        `Portal Role ${updated.role_name} updated.`,

      oldData:
        buildRoleAuditState(
          existing,
          beforePermissions
        ),

      newData:
        buildRoleAuditState(
          updated,
          afterPermissions
        ),
    });

    return res.json({
      success:
        true,

      message:
        "Role updated successfully.",

      data:
        updated,
    });
  } catch (error) {
    if (
      error.code ===
      "ER_DUP_ENTRY"
    ) {
      return res
        .status(409)
        .json({
          success:
            false,

          message:
            "Another Role with this name already exists.",
        });
    }

    return next(
      error
    );
  }
}


/*
|--------------------------------------------------------------------------
| ROLE STATUS
|--------------------------------------------------------------------------
*/

async function changeRoleStatus(
  req,
  res,
  next
) {
  try {
    const roleId =
      Number(
        req.params.id
      );

    if (
      !isPositiveId(
        roleId
      )
    ) {
      return res
        .status(400)
        .json({
          success:
            false,

          message:
            "Invalid Role ID.",
        });
    }

    const existing =
      await getRoleById(
        roleId
      );

    if (!existing) {
      return res
        .status(404)
        .json({
          success:
            false,

          message:
            "Role not found.",
        });
    }

    const beforePermissions =
      await getRolePermissionDetails(
        roleId
      );

    const isActive =
      parseBoolean(
        req.body.is_active,
        false
      );

    if (
      isSuperAdminRole(
        existing
      ) &&
      !isActive
    ) {
      return res
        .status(400)
        .json({
          success:
            false,

          message:
            "The protected SUPER_ADMIN Role cannot be deactivated.",
        });
    }

    await updateRoleStatus(
      roleId,
      isActive
    );

    const updated =
      await getRoleById(
        roleId
      );

    const afterPermissions =
      await getRolePermissionDetails(
        roleId
      );

    await writeAudit({
      req,

      module:
        "ROLE_MANAGEMENT",

      action:
        isActive
          ? "ACTIVATE"
          : "DEACTIVATE",

      recordId:
        roleId,

      description:
        `Portal Role ${existing.role_name} ${
          isActive
            ? "activated"
            : "deactivated"
        }.`,

      oldData:
        buildRoleAuditState(
          existing,
          beforePermissions
        ),

      newData:
        buildRoleAuditState(
          updated,
          afterPermissions
        ),
    });

    return res.json({
      success:
        true,

      message:
        isActive
          ? "Role activated successfully."
          : "Role deactivated successfully. Users assigned to this Role will not be able to login until the Role is activated again.",

      data:
        updated,
    });
  } catch (error) {
    return next(
      error
    );
  }
}


/*
|--------------------------------------------------------------------------
| GET ROLE PERMISSIONS
|--------------------------------------------------------------------------
*/

async function getRolePermissions(
  req,
  res,
  next
) {
  try {
    const roleId =
      Number(
        req.params.id
      );

    if (
      !isPositiveId(
        roleId
      )
    ) {
      return res
        .status(400)
        .json({
          success:
            false,

          message:
            "Invalid Role ID.",
        });
    }

    const details =
      await getRolePermissionDetails(
        roleId
      );

    if (!details) {
      return res
        .status(404)
        .json({
          success:
            false,

          message:
            "Role not found.",
        });
    }

    return res.json({
      success:
        true,

      data:
        details,
    });
  } catch (error) {
    return next(
      error
    );
  }
}


/*
|--------------------------------------------------------------------------
| SAVE ROLE PERMISSIONS
|--------------------------------------------------------------------------
*/

async function saveRolePermissions(
  req,
  res,
  next
) {
  try {
    const roleId =
      Number(
        req.params.id
      );

    if (
      !isPositiveId(
        roleId
      )
    ) {
      return res
        .status(400)
        .json({
          success:
            false,

          message:
            "Invalid Role ID.",
        });
    }

    const existing =
      await getRoleById(
        roleId
      );

    if (!existing) {
      return res
        .status(404)
        .json({
          success:
            false,

          message:
            "Role not found.",
        });
    }

    const permissionIds =
      normalizePermissionIds(
        req.body
          .permission_ids
      );

    await validatePermissionIds(
      permissionIds
    );

    /*
    |--------------------------------------------------------------------------
    | SUPER ADMIN CRITICAL PROTECTION
    |--------------------------------------------------------------------------
    */

    if (
      isSuperAdminRole(
        existing
      )
    ) {
      const criticalRows =
        await getPermissionIdsByKeys(
          [
            "users.manage",
            "roles.manage",
          ]
        );

      const criticalIds =
        criticalRows.map(
          (row) =>
            Number(
              row.id
            )
        );

      const missingCritical =
        criticalIds.filter(
          (id) =>
            !permissionIds.includes(
              id
            )
        );

      if (
        missingCritical.length
      ) {
        return res
          .status(400)
          .json({
            success:
              false,

            message:
              "SUPER_ADMIN must keep users.manage and roles.manage permissions.",
          });
      }
    }

    const before =
      await getRolePermissionDetails(
        roleId
      );

    await replaceRolePermissions(
      roleId,
      permissionIds
    );

    const after =
      await getRolePermissionDetails(
        roleId
      );

    const updatedRole =
      await getRoleById(
        roleId
      );

    /*
    |--------------------------------------------------------------------------
    | CENTRAL AUDIT
    |--------------------------------------------------------------------------
    */

    await writeAudit({
      req,

      module:
        "ROLE_MANAGEMENT",

      action:
        "PERMISSIONS_UPDATE",

      recordId:
        roleId,

      description:
        `Permissions updated for Portal Role ${existing.role_name}.`,

      oldData:
        buildRoleAuditState(
          existing,
          before
        ),

      newData:
        buildRoleAuditState(
          updatedRole,
          after
        ),
    });

    return res.json({
      success:
        true,

      message:
        "Role permissions updated successfully.",

      data:
        after,
    });
  } catch (error) {
    if (
      error.statusCode
    ) {
      return res
        .status(
          error.statusCode
        )
        .json({
          success:
            false,

          message:
            error.message,
        });
    }

    return next(
      error
    );
  }
}


/*
|--------------------------------------------------------------------------
| CREATE USER
|--------------------------------------------------------------------------
*/

async function addUser(
  req,
  res,
  next
) {
  try {
    const username =
      String(
        req.body.username ||
        ""
      )
        .trim()
        .toLowerCase();

    const fullName =
      String(
        req.body.full_name ||
        ""
      ).trim();

    const password =
      String(
        req.body.password ||
        ""
      );

    const roleId =
      Number(
        req.body.role_id
      );

    const isActive =
      parseBoolean(
        req.body.is_active,
        true
      );

    if (
      !username ||
      !fullName ||
      !password ||
      !isPositiveId(
        roleId
      )
    ) {
      return res
        .status(400)
        .json({
          success:
            false,

          message:
            "Full Name, Username, Password and Role are required.",
        });
    }

    if (
      password.length < 8
    ) {
      return res
        .status(400)
        .json({
          success:
            false,

          message:
            "Password must contain at least 8 characters.",
        });
    }

    const role =
      await getRoleById(
        roleId
      );

    if (
      !role ||
      !parseBoolean(
        role.is_active,
        false
      )
    ) {
      return res
        .status(400)
        .json({
          success:
            false,

          message:
            "Selected Role is invalid or inactive.",
        });
    }

    /*
    |--------------------------------------------------------------------------
    | HASH PASSWORD
    |--------------------------------------------------------------------------
    */

    const passwordHash =
      await hashPassword(
        password
      );

    const user =
      await createUser({
        username,
        passwordHash,
        fullName,
        roleId,
        isActive,
      });

    /*
    |--------------------------------------------------------------------------
    | OPTIONAL INDIVIDUAL PERMISSIONS
    |--------------------------------------------------------------------------
    */

    if (
      Array.isArray(
        req.body
          .permission_overrides
      )
    ) {
      const overrides =
        await normalizePermissionOverrides(
          req.body
            .permission_overrides
        );

      await replaceUserPermissions(
        user.id,
        overrides
      );
    }

    const finalUser =
      await getUserById(
        user.id
      );

    const permissionInfo =
      await getUserPermissionDetails(
        user.id
      );

    /*
    |--------------------------------------------------------------------------
    | CENTRAL AUDIT
    |--------------------------------------------------------------------------
    |
    | Password or password hash is NOT included.
    |
    |--------------------------------------------------------------------------
    */

    await writeAudit({
      req,

      module:
        "USER_MANAGEMENT",

      action:
        "CREATE",

      recordId:
        user.id,

      description:
        `Portal user ${finalUser.username} created.`,

      oldData:
        buildEmptyUserAuditState(),

      newData:
        buildUserAuditState(
          finalUser,
          permissionInfo
        ),
    });

    return res
      .status(201)
      .json({
        success:
          true,

        message:
          "User created successfully.",

        data:
          finalUser,
      });
  } catch (error) {
    if (
      error.code ===
      "ER_DUP_ENTRY"
    ) {
      return res
        .status(409)
        .json({
          success:
            false,

          message:
            "Username already exists.",
        });
    }

    if (
      error.statusCode
    ) {
      return res
        .status(
          error.statusCode
        )
        .json({
          success:
            false,

          message:
            error.message,
        });
    }

    return next(
      error
    );
  }
}


/*
|--------------------------------------------------------------------------
| EDIT USER
|--------------------------------------------------------------------------
*/

async function editUser(
  req,
  res,
  next
) {
  try {
    const id =
      Number(
        req.params.id
      );

    if (
      !isPositiveId(
        id
      )
    ) {
      return res
        .status(400)
        .json({
          success:
            false,

          message:
            "Invalid User ID.",
        });
    }

    const existing =
      await getUserById(
        id
      );

    if (!existing) {
      return res
        .status(404)
        .json({
          success:
            false,

          message:
            "User not found.",
        });
    }

    const beforePermissions =
      await getUserPermissionDetails(
        id
      );

    const username =
      String(
        req.body.username ||
        ""
      )
        .trim()
        .toLowerCase();

    const fullName =
      String(
        req.body.full_name ||
        ""
      ).trim();

    const roleId =
      Number(
        req.body.role_id
      );

    if (
      !username ||
      !fullName ||
      !isPositiveId(
        roleId
      )
    ) {
      return res
        .status(400)
        .json({
          success:
            false,

          message:
            "Full Name, Username and Role are required.",
        });
    }

    const newRole =
      await getRoleById(
        roleId
      );

    if (
      !newRole ||
      !parseBoolean(
        newRole.is_active,
        false
      )
    ) {
      return res
        .status(400)
        .json({
          success:
            false,

          message:
            "Selected Role is invalid or inactive.",
        });
    }

    /*
    |--------------------------------------------------------------------------
    | LAST SUPER ADMIN PROTECTION
    |--------------------------------------------------------------------------
    */

    if (
      isSuperAdminRole(
        existing
      ) &&
      !isSuperAdminRole(
        newRole
      ) &&
      parseBoolean(
        existing.is_active,
        false
      )
    ) {
      const remaining =
        await countActiveSuperAdmins(
          id
        );

      if (
        remaining < 1
      ) {
        return res
          .status(400)
          .json({
            success:
              false,

            message:
              "The last active Super Admin cannot be changed to another Role.",
          });
      }
    }

    await updateUser(
      id,
      {
        username,
        fullName,
        roleId,
      }
    );

    const updated =
      await getUserById(
        id
      );

    const afterPermissions =
      await getUserPermissionDetails(
        id
      );

    /*
    |--------------------------------------------------------------------------
    | CENTRAL AUDIT
    |--------------------------------------------------------------------------
    */

    await writeAudit({
      req,

      module:
        "USER_MANAGEMENT",

      action:
        "UPDATE",

      recordId:
        id,

      description:
        `Portal user ${updated.username} updated.`,

      oldData:
        buildUserAuditState(
          existing,
          beforePermissions
        ),

      newData:
        buildUserAuditState(
          updated,
          afterPermissions
        ),
    });

    return res.json({
      success:
        true,

      message:
        "User updated successfully.",

      data:
        updated,
    });
  } catch (error) {
    if (
      error.code ===
      "ER_DUP_ENTRY"
    ) {
      return res
        .status(409)
        .json({
          success:
            false,

          message:
            "Username already exists.",
        });
    }

    return next(
      error
    );
  }
}


/*
|--------------------------------------------------------------------------
| USER STATUS
|--------------------------------------------------------------------------
*/

async function changeUserStatus(
  req,
  res,
  next
) {
  try {
    const id =
      Number(
        req.params.id
      );

    if (
      !isPositiveId(
        id
      )
    ) {
      return res
        .status(400)
        .json({
          success:
            false,

          message:
            "Invalid User ID.",
        });
    }

    const existing =
      await getUserById(
        id
      );

    if (!existing) {
      return res
        .status(404)
        .json({
          success:
            false,

          message:
            "User not found.",
        });
    }

    const beforePermissions =
      await getUserPermissionDetails(
        id
      );

    const isActive =
      parseBoolean(
        req.body.is_active,
        false
      );

    /*
    |--------------------------------------------------------------------------
    | SELF LOCKOUT PROTECTION
    |--------------------------------------------------------------------------
    */

    if (
      Number(
        req.user?.id
      ) === id &&
      !isActive
    ) {
      return res
        .status(400)
        .json({
          success:
            false,

          message:
            "You cannot deactivate your own logged-in account.",
        });
    }

    /*
    |--------------------------------------------------------------------------
    | LAST SUPER ADMIN PROTECTION
    |--------------------------------------------------------------------------
    */

    if (
      isSuperAdminRole(
        existing
      ) &&
      parseBoolean(
        existing.is_active,
        false
      ) &&
      !isActive
    ) {
      const remaining =
        await countActiveSuperAdmins(
          id
        );

      if (
        remaining < 1
      ) {
        return res
          .status(400)
          .json({
            success:
              false,

            message:
              "The last active Super Admin cannot be deactivated.",
          });
      }
    }

    await updateUserStatus(
      id,
      isActive
    );

    const updated =
      await getUserById(
        id
      );

    const afterPermissions =
      await getUserPermissionDetails(
        id
      );

    await writeAudit({
      req,

      module:
        "USER_MANAGEMENT",

      action:
        isActive
          ? "ACTIVATE"
          : "DEACTIVATE",

      recordId:
        id,

      description:
        `Portal user ${existing.username} ${
          isActive
            ? "activated"
            : "deactivated"
        }.`,

      oldData:
        buildUserAuditState(
          existing,
          beforePermissions
        ),

      newData:
        buildUserAuditState(
          updated,
          afterPermissions
        ),
    });

    return res.json({
      success:
        true,

      message:
        isActive
          ? "User activated successfully."
          : "User deactivated successfully.",

      data:
        updated,
    });
  } catch (error) {
    return next(
      error
    );
  }
}


/*
|--------------------------------------------------------------------------
| PASSWORD RESET
|--------------------------------------------------------------------------
*/

async function resetUserPassword(
  req,
  res,
  next
) {
  try {
    const id =
      Number(
        req.params.id
      );

    if (
      !isPositiveId(
        id
      )
    ) {
      return res
        .status(400)
        .json({
          success:
            false,

          message:
            "Invalid User ID.",
        });
    }

    const existing =
      await getUserById(
        id
      );

    if (!existing) {
      return res
        .status(404)
        .json({
          success:
            false,

          message:
            "User not found.",
        });
    }

    const password =
      String(
        req.body.password ||
        ""
      );

    if (
      password.length <
      8
    ) {
      return res
        .status(400)
        .json({
          success:
            false,

          message:
            "New password must contain at least 8 characters.",
        });
    }

    const passwordHash =
      await hashPassword(
        password
      );

    await updatePassword(
      id,
      passwordHash
    );

    /*
    |--------------------------------------------------------------------------
    | PASSWORD AUDIT
    |--------------------------------------------------------------------------
    |
    | IMPORTANT:
    |
    | Password:
    | - old value NOT logged
    | - new value NOT logged
    | - hash NOT logged
    |
    |--------------------------------------------------------------------------
    */

    await writeAudit({
      req,

      module:
        "USER_MANAGEMENT",

      action:
        "PASSWORD_RESET",

      recordId:
        id,

      description:
        `Password reset for portal user ${existing.username}.`,

      oldData: {
        password_reset:
          false,
      },

      newData: {
        password_reset:
          true,
      },
    });

    return res.json({
      success:
        true,

      message:
        "Password reset successfully.",
    });
  } catch (error) {
    return next(
      error
    );
  }
}


/*
|--------------------------------------------------------------------------
| GET USER PERMISSIONS
|--------------------------------------------------------------------------
*/

async function getUserPermissions(
  req,
  res,
  next
) {
  try {
    const id =
      Number(
        req.params.id
      );

    if (
      !isPositiveId(
        id
      )
    ) {
      return res
        .status(400)
        .json({
          success:
            false,

          message:
            "Invalid User ID.",
        });
    }

    const details =
      await getUserPermissionDetails(
        id
      );

    if (!details) {
      return res
        .status(404)
        .json({
          success:
            false,

          message:
            "User not found.",
        });
    }

    const effectivePermissions =
      await getEffectivePermissions(
        id,
        details
          .user
          .role_id
      );

    return res.json({
      success:
        true,

      data: {
        ...details,

        effective_permissions:
          effectivePermissions,
      },
    });
  } catch (error) {
    return next(
      error
    );
  }
}


/*
|--------------------------------------------------------------------------
| SAVE USER PERMISSIONS
|--------------------------------------------------------------------------
*/

async function saveUserPermissions(
  req,
  res,
  next
) {
  try {
    const id =
      Number(
        req.params.id
      );

    if (
      !isPositiveId(
        id
      )
    ) {
      return res
        .status(400)
        .json({
          success:
            false,

          message:
            "Invalid User ID.",
        });
    }

    const existing =
      await getUserById(
        id
      );

    if (!existing) {
      return res
        .status(404)
        .json({
          success:
            false,

          message:
            "User not found.",
        });
    }

    const overrides =
      await normalizePermissionOverrides(
        Array.isArray(
          req.body.overrides
        )
          ? req.body.overrides
          : []
      );

    /*
    |--------------------------------------------------------------------------
    | LAST SUPER ADMIN LOCKOUT PROTECTION
    |--------------------------------------------------------------------------
    */

    if (
      isSuperAdminRole(
        existing
      ) &&
      parseBoolean(
        existing.is_active,
        false
      )
    ) {
      const remaining =
        await countActiveSuperAdmins(
          id
        );

      if (
        remaining < 1
      ) {
        const criticalRows =
          await getPermissionIdsByKeys(
            [
              "users.manage",
              "roles.manage",
            ]
          );

        const criticalIds =
          criticalRows.map(
            (row) =>
              Number(
                row.id
              )
          );

        const criticalDenied =
          overrides.some(
            (item) =>
              item.access_type ===
                "DENY" &&
              criticalIds.includes(
                Number(
                  item.permission_id
                )
              )
          );

        if (
          criticalDenied
        ) {
          return res
            .status(400)
            .json({
              success:
                false,

              message:
                "Critical User Management permissions cannot be denied for the last active Super Admin.",
            });
        }
      }
    }

    const before =
      await getUserPermissionDetails(
        id
      );

    await replaceUserPermissions(
      id,
      overrides
    );

    const after =
      await getUserPermissionDetails(
        id
      );

    const updatedUser =
      await getUserById(
        id
      );

    /*
    |--------------------------------------------------------------------------
    | CENTRAL AUDIT
    |--------------------------------------------------------------------------
    */

    await writeAudit({
      req,

      module:
        "USER_MANAGEMENT",

      action:
        "PERMISSIONS_UPDATE",

      recordId:
        id,

      description:
        `Individual permissions updated for portal user ${existing.username}.`,

      oldData:
        buildUserAuditState(
          existing,
          before
        ),

      newData:
        buildUserAuditState(
          updatedUser,
          after
        ),
    });

    const effective =
      await getEffectivePermissions(
        id,
        updatedUser.role_id
      );

    return res.json({
      success:
        true,

      message:
        "User permissions updated successfully.",

      data: {
        ...after,

        effective_permissions:
          effective,
      },
    });
  } catch (error) {
    if (
      error.statusCode
    ) {
      return res
        .status(
          error.statusCode
        )
        .json({
          success:
            false,

          message:
            error.message,
        });
    }

    return next(
      error
    );
  }
}


module.exports = {
  listUsers,

  getUser,

  listRoles,

  listPermissions,

  addRole,

  editRole,

  changeRoleStatus,

  getRolePermissions,

  saveRolePermissions,

  addUser,

  editUser,

  changeUserStatus,

  resetUserPassword,

  getUserPermissions,

  saveUserPermissions,
};