const {
  pool,
} = require("../config/db");

/*
|--------------------------------------------------------------------------
| USERS
|--------------------------------------------------------------------------
*/

async function getUsers({
  search = "",
  roleId = null,
  status = null,
} = {}) {
  const conditions = [
    "1 = 1",
  ];

  const params = {};

  if (search) {
    conditions.push(`
      (
        u.username LIKE :search
        OR
        u.full_name LIKE :search
      )
    `);

    params.search =
      `%${search}%`;
  }

  if (roleId) {
    conditions.push(
      "u.role_id = :roleId"
    );

    params.roleId =
      Number(roleId);
  }

  if (
    status === "ACTIVE"
  ) {
    conditions.push(
      "u.is_active = 1"
    );
  }

  if (
    status === "INACTIVE"
  ) {
    conditions.push(
      "u.is_active = 0"
    );
  }

  const [rows] =
    await pool.query(
      `
        SELECT
          u.id,
          u.username,
          u.full_name,
          u.role_id,
          u.is_active,
          u.last_login,
          u.created_at,
          u.updated_at,

          r.role_name,

          r.description
            AS role_description,

          r.is_active
            AS role_is_active

        FROM users u

        LEFT JOIN roles r
          ON r.id =
             u.role_id

        WHERE
          ${conditions.join(
            " AND "
          )}

        ORDER BY
          u.is_active DESC,
          u.full_name ASC,
          u.username ASC
      `,
      params
    );

  return rows;
}


async function getUserById(
  id
) {
  const [rows] =
    await pool.query(
      `
        SELECT
          u.id,
          u.username,
          u.full_name,
          u.role_id,
          u.is_active,
          u.last_login,
          u.created_at,
          u.updated_at,

          r.role_name,

          r.description
            AS role_description,

          r.is_active
            AS role_is_active

        FROM users u

        LEFT JOIN roles r
          ON r.id =
             u.role_id

        WHERE
          u.id = :id

        LIMIT 1
      `,
      {
        id:
          Number(id),
      }
    );

  return (
    rows[0] ||
    null
  );
}


/*
|--------------------------------------------------------------------------
| ROLES
|--------------------------------------------------------------------------
*/

async function getRoles() {
  const [rows] =
    await pool.query(
      `
        SELECT
          r.id,
          r.role_name,
          r.description,
          r.is_active,

          COUNT(
            DISTINCT u.id
          ) AS user_count,

          COUNT(
            DISTINCT
            CASE
              WHEN
                u.is_active = 1
              THEN
                u.id

              ELSE
                NULL
            END
          ) AS active_user_count,

          COUNT(
            DISTINCT
            rp.permission_id
          ) AS permission_count

        FROM roles r

        LEFT JOIN users u
          ON u.role_id =
             r.id

        LEFT JOIN role_permissions rp
          ON rp.role_id =
             r.id

        GROUP BY
          r.id,
          r.role_name,
          r.description,
          r.is_active

        ORDER BY
          CASE
            WHEN
              UPPER(
                TRIM(
                  r.role_name
                )
              ) =
              'SUPER_ADMIN'
            THEN 0

            ELSE 1
          END,

          r.is_active DESC,

          r.role_name ASC
      `
    );

  return rows.map(
    (row) => ({
      ...row,

      user_count:
        Number(
          row.user_count ||
          0
        ),

      active_user_count:
        Number(
          row.active_user_count ||
          0
        ),

      permission_count:
        Number(
          row.permission_count ||
          0
        ),
    })
  );
}


async function getRoleById(
  roleId
) {
  const [rows] =
    await pool.query(
      `
        SELECT
          r.id,
          r.role_name,
          r.description,
          r.is_active,

          COUNT(
            DISTINCT u.id
          ) AS user_count,

          COUNT(
            DISTINCT
            CASE
              WHEN
                u.is_active = 1
              THEN
                u.id

              ELSE
                NULL
            END
          ) AS active_user_count,

          COUNT(
            DISTINCT
            rp.permission_id
          ) AS permission_count

        FROM roles r

        LEFT JOIN users u
          ON u.role_id =
             r.id

        LEFT JOIN role_permissions rp
          ON rp.role_id =
             r.id

        WHERE
          r.id = :roleId

        GROUP BY
          r.id,
          r.role_name,
          r.description,
          r.is_active

        LIMIT 1
      `,
      {
        roleId:
          Number(roleId),
      }
    );

  if (!rows[0]) {
    return null;
  }

  return {
    ...rows[0],

    user_count:
      Number(
        rows[0]
          .user_count ||
        0
      ),

    active_user_count:
      Number(
        rows[0]
          .active_user_count ||
        0
      ),

    permission_count:
      Number(
        rows[0]
          .permission_count ||
        0
      ),
  };
}


async function getRoleByName(
  roleName,
  excludeRoleId = null
) {
  const params = {
    roleName:
      String(
        roleName ||
        ""
      ).trim(),
  };

  let exclusion =
    "";

  if (excludeRoleId) {
    exclusion =
      "AND id <> :excludeRoleId";

    params.excludeRoleId =
      Number(
        excludeRoleId
      );
  }

  const [rows] =
    await pool.query(
      `
        SELECT
          id,
          role_name,
          description,
          is_active

        FROM roles

        WHERE
          LOWER(
            TRIM(role_name)
          ) =
          LOWER(
            TRIM(:roleName)
          )

          ${exclusion}

        LIMIT 1
      `,
      params
    );

  return (
    rows[0] ||
    null
  );
}


/*
|--------------------------------------------------------------------------
| PERMISSIONS MASTER
|--------------------------------------------------------------------------
*/

async function getPermissions() {
  const [rows] =
    await pool.query(
      `
        SELECT
          id,
          permission_key,
          permission_name,
          module_name,
          description,
          is_active

        FROM permissions

        WHERE
          is_active = 1

        ORDER BY
          module_name,
          permission_name,
          permission_key
      `
    );

  return rows;
}


async function getPermissionIdsByKeys(
  permissionKeys = []
) {
  const keys =
    [
      ...new Set(
        permissionKeys
          .map(
            (item) =>
              String(
                item ||
                ""
              ).trim()
          )
          .filter(
            Boolean
          )
      ),
    ];

  if (!keys.length) {
    return [];
  }

  const placeholders =
    keys
      .map(
        () => "?"
      )
      .join(", ");

  const [rows] =
    await pool.query(
      `
        SELECT
          id,
          permission_key

        FROM permissions

        WHERE
          is_active = 1

          AND
          permission_key
          IN
          (
            ${placeholders}
          )
      `,
      keys
    );

  return rows;
}


/*
|--------------------------------------------------------------------------
| CREATE ROLE
|--------------------------------------------------------------------------
*/

async function createRole({
  roleName,
  description = null,
  isActive = true,
}) {
  const [result] =
    await pool.query(
      `
        INSERT INTO roles
        (
          role_name,
          description,
          is_active
        )

        VALUES
        (
          :roleName,
          :description,
          :isActive
        )
      `,
      {
        roleName,
        description,

        isActive:
          isActive
            ? 1
            : 0,
      }
    );

  return getRoleById(
    result.insertId
  );
}


/*
|--------------------------------------------------------------------------
| UPDATE ROLE
|--------------------------------------------------------------------------
*/

async function updateRole(
  roleId,
  {
    roleName,
    description = null,
  }
) {
  await pool.query(
    `
      UPDATE roles

      SET
        role_name =
          :roleName,

        description =
          :description

      WHERE
        id = :roleId
    `,
    {
      roleId:
        Number(roleId),

      roleName,
      description,
    }
  );

  return getRoleById(
    roleId
  );
}


/*
|--------------------------------------------------------------------------
| ROLE STATUS
|--------------------------------------------------------------------------
*/

async function updateRoleStatus(
  roleId,
  isActive
) {
  const [result] =
    await pool.query(
      `
        UPDATE roles

        SET
          is_active =
            :isActive

        WHERE
          id = :roleId
      `,
      {
        roleId:
          Number(roleId),

        isActive:
          isActive
            ? 1
            : 0,
      }
    );

  return (
    result.affectedRows >
    0
  );
}


/*
|--------------------------------------------------------------------------
| ROLE PERMISSIONS
|--------------------------------------------------------------------------
*/

async function getRolePermissionDetails(
  roleId
) {
  const role =
    await getRoleById(
      roleId
    );

  if (!role) {
    return null;
  }

  const [rows] =
    await pool.query(
      `
        SELECT
          p.id,
          p.permission_key,
          p.permission_name,
          p.module_name,
          p.description

        FROM role_permissions rp

        JOIN permissions p
          ON p.id =
             rp.permission_id

        WHERE
          rp.role_id =
            :roleId

          AND
          p.is_active = 1

        ORDER BY
          p.module_name,
          p.permission_name,
          p.permission_key
      `,
      {
        roleId:
          Number(roleId),
      }
    );

  return {
    role,

    role_permissions:
      rows,

    permission_ids:
      rows.map(
        (row) =>
          Number(row.id)
      ),
  };
}


async function replaceRolePermissions(
  roleId,
  permissionIds = []
) {
  const uniqueIds =
    [
      ...new Set(
        permissionIds
          .map(
            Number
          )
          .filter(
            (item) =>
              Number.isInteger(
                item
              ) &&
              item > 0
          )
      ),
    ];

  const connection =
    await pool.getConnection();

  try {
    await connection.beginTransaction();

    await connection.query(
      `
        DELETE FROM
          role_permissions

        WHERE
          role_id = ?
      `,
      [
        Number(roleId),
      ]
    );

    for (
      const permissionId
      of uniqueIds
    ) {
      await connection.query(
        `
          INSERT INTO role_permissions
          (
            role_id,
            permission_id
          )

          VALUES
          (
            ?,
            ?
          )
        `,
        [
          Number(roleId),
          permissionId,
        ]
      );
    }

    await connection.commit();

  } catch (error) {

    await connection.rollback();

    throw error;

  } finally {

    connection.release();
  }

  return getRolePermissionDetails(
    roleId
  );
}


/*
|--------------------------------------------------------------------------
| CREATE USER
|--------------------------------------------------------------------------
*/

async function createUser({
  username,
  passwordHash,
  fullName,
  roleId,
  isActive = true,
}) {
  const [result] =
    await pool.query(
      `
        INSERT INTO users
        (
          username,
          password_hash,
          full_name,
          role_id,
          is_active
        )

        VALUES
        (
          :username,
          :passwordHash,
          :fullName,
          :roleId,
          :isActive
        )
      `,
      {
        username,
        passwordHash,
        fullName,
        roleId,

        isActive:
          isActive
            ? 1
            : 0,
      }
    );

  return getUserById(
    result.insertId
  );
}


/*
|--------------------------------------------------------------------------
| UPDATE USER
|--------------------------------------------------------------------------
*/

async function updateUser(
  id,
  {
    username,
    fullName,
    roleId,
  }
) {
  await pool.query(
    `
      UPDATE users

      SET
        username =
          :username,

        full_name =
          :fullName,

        role_id =
          :roleId

      WHERE
        id = :id
    `,
    {
      id:
        Number(id),

      username,
      fullName,
      roleId,
    }
  );

  return getUserById(
    id
  );
}


/*
|--------------------------------------------------------------------------
| USER STATUS
|--------------------------------------------------------------------------
*/

async function updateUserStatus(
  id,
  isActive
) {
  const [result] =
    await pool.query(
      `
        UPDATE users

        SET
          is_active =
            :isActive

        WHERE
          id = :id
      `,
      {
        id:
          Number(id),

        isActive:
          isActive
            ? 1
            : 0,
      }
    );

  return (
    result.affectedRows >
    0
  );
}


/*
|--------------------------------------------------------------------------
| PASSWORD
|--------------------------------------------------------------------------
*/

async function updatePassword(
  id,
  passwordHash
) {
  const [result] =
    await pool.query(
      `
        UPDATE users

        SET
          password_hash =
            :passwordHash

        WHERE
          id = :id
      `,
      {
        id:
          Number(id),

        passwordHash,
      }
    );

  return (
    result.affectedRows >
    0
  );
}


/*
|--------------------------------------------------------------------------
| USER PERMISSION DETAILS
|--------------------------------------------------------------------------
*/

async function getUserPermissionDetails(
  userId
) {
  const user =
    await getUserById(
      userId
    );

  if (!user) {
    return null;
  }

  const [rolePermissions] =
    await pool.query(
      `
        SELECT
          p.id,
          p.permission_key,
          p.permission_name,
          p.module_name,
          p.description

        FROM role_permissions rp

        JOIN permissions p
          ON p.id =
             rp.permission_id

        WHERE
          rp.role_id =
            :roleId

          AND
          p.is_active = 1

        ORDER BY
          p.module_name,
          p.permission_name,
          p.permission_key
      `,
      {
        roleId:
          user.role_id,
      }
    );

  const [userOverrides] =
    await pool.query(
      `
        SELECT
          up.permission_id,
          up.access_type,

          p.permission_key,
          p.permission_name,
          p.module_name

        FROM user_permissions up

        JOIN permissions p
          ON p.id =
             up.permission_id

        WHERE
          up.user_id =
            :userId

          AND
          p.is_active = 1

        ORDER BY
          p.module_name,
          p.permission_name,
          p.permission_key
      `,
      {
        userId:
          Number(userId),
      }
    );

  return {
    user,

    role_permissions:
      rolePermissions,

    user_overrides:
      userOverrides,
  };
}


/*
|--------------------------------------------------------------------------
| USER OVERRIDES
|--------------------------------------------------------------------------
*/

async function replaceUserPermissions(
  userId,
  overrides = []
) {
  const connection =
    await pool.getConnection();

  try {
    await connection.beginTransaction();

    await connection.query(
      `
        DELETE FROM
          user_permissions

        WHERE
          user_id = ?
      `,
      [
        Number(userId),
      ]
    );

    for (
      const item of overrides
    ) {
      await connection.query(
        `
          INSERT INTO user_permissions
          (
            user_id,
            permission_id,
            access_type
          )

          VALUES
          (
            ?,
            ?,
            ?
          )
        `,
        [
          Number(userId),

          Number(
            item.permission_id
          ),

          item.access_type,
        ]
      );
    }

    await connection.commit();

  } catch (error) {

    await connection.rollback();

    throw error;

  } finally {

    connection.release();
  }

  return getUserPermissionDetails(
    userId
  );
}


/*
|--------------------------------------------------------------------------
| SUPER ADMIN COUNT
|--------------------------------------------------------------------------
*/

async function countActiveSuperAdmins(
  excludeUserId = null
) {
  const params = {};

  let excludeSql =
    "";

  if (excludeUserId) {
    excludeSql =
      "AND u.id <> :excludeUserId";

    params.excludeUserId =
      Number(
        excludeUserId
      );
  }

  const [rows] =
    await pool.query(
      `
        SELECT
          COUNT(*) AS total

        FROM users u

        JOIN roles r
          ON r.id =
             u.role_id

        WHERE
          UPPER(
            TRIM(
              r.role_name
            )
          ) =
          'SUPER_ADMIN'

          AND
          u.is_active = 1

          AND
          r.is_active = 1

          ${excludeSql}
      `,
      params
    );

  return Number(
    rows[0]?.total ||
    0
  );
}


module.exports = {
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
};