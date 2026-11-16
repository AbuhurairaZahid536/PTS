const { pool } = require("../config/db");

async function getEffectivePermissions(userId, roleId) {
  /*
  |--------------------------------------------------------------------------
  | ROLE DEFAULT PERMISSIONS
  |--------------------------------------------------------------------------
  */

  const [roleRows] = await pool.query(
    `
        SELECT
          p.id,
          p.permission_key

        FROM role_permissions rp

        JOIN permissions p
          ON p.id =
             rp.permission_id

        WHERE rp.role_id =
              :roleId

          AND p.is_active = 1
      `,
    {
      roleId,
    },
  );

  const permissionSet = new Set(roleRows.map((row) => row.permission_key));

  /*
  |--------------------------------------------------------------------------
  | USER-SPECIFIC OVERRIDES
  |--------------------------------------------------------------------------
  |
  | ALLOW = add permission
  | DENY  = remove permission
  |--------------------------------------------------------------------------
  */

  const [userRows] = await pool.query(
    `
        SELECT
          p.permission_key,
          up.access_type

        FROM user_permissions up

        JOIN permissions p
          ON p.id =
             up.permission_id

        WHERE up.user_id =
              :userId

          AND p.is_active = 1
      `,
    {
      userId,
    },
  );

  for (const row of userRows) {
    if (row.access_type === "ALLOW") {
      permissionSet.add(row.permission_key);
    }

    if (row.access_type === "DENY") {
      permissionSet.delete(row.permission_key);
    }
  }

  return Array.from(permissionSet);
}

function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,

        message: "Authentication required.",
      });
    }

    const userPermissions = Array.isArray(req.user.permissions)
      ? req.user.permissions
      : [];

    if (userPermissions.includes(permission)) {
      return next();
    }

    return res.status(403).json({
      success: false,

      message: "You do not have permission for this action.",

      requiredPermission: permission,
    });
  };
}

function requireAnyPermission(
  ...permissionArgs
) {
  /*
  |--------------------------------------------------------------------------
  | NORMALIZE REQUIRED PERMISSIONS
  |--------------------------------------------------------------------------
  |
  | Supports:
  |
  | requireAnyPermission("leave.view")
  |
  | requireAnyPermission(
  |   "leave.view",
  |   "leave.create"
  | )
  |
  | requireAnyPermission([
  |   "leave.view",
  |   "leave.create"
  | ])
  |
  |--------------------------------------------------------------------------
  */

  const permissions =
    permissionArgs
      .flat(Infinity)
      .filter(
        (permission) =>
          typeof permission ===
            "string" &&
          permission.trim()
      )
      .map(
        (permission) =>
          permission.trim()
      );


  return (
    req,
    res,
    next
  ) => {
    if (
      !req.user
    ) {
      return res
        .status(401)
        .json({
          success: false,

          message:
            "Authentication required.",
        });
    }


    /*
    |--------------------------------------------------------------------------
    | NORMALIZE USER PERMISSIONS
    |--------------------------------------------------------------------------
    */

    const userPermissions =
      Array.isArray(
        req.user.permissions
      )
        ? req.user.permissions
        : [];


    /*
    |--------------------------------------------------------------------------
    | CONFIGURATION SAFETY
    |--------------------------------------------------------------------------
    */

    if (
      permissions.length ===
      0
    ) {
      console.error(
        "requireAnyPermission called without valid permissions."
      );

      return res
        .status(500)
        .json({
          success: false,

          message:
            "Permission middleware is not configured correctly.",
        });
    }


    /*
    |--------------------------------------------------------------------------
    | CHECK ANY REQUIRED PERMISSION
    |--------------------------------------------------------------------------
    */

    const allowed =
      permissions.some(
        (permission) =>
          userPermissions.includes(
            permission
          )
      );


    if (
      allowed
    ) {
      return next();
    }


    return res
      .status(403)
      .json({
        success: false,

        message:
          "You do not have permission for this action.",

        requiredPermissions:
          permissions,
      });
  };
}

module.exports = {
  getEffectivePermissions,
  requirePermission,
  requireAnyPermission,
};
