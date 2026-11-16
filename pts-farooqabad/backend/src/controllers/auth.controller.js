const {
  verifyPassword,
} = require("../utils/password");

const {
  pool,
} = require("../config/db");

const {
  signToken,
} = require("../utils/jwt");

const {
  getEffectivePermissions,
} = require("../middleware/permissions");


async function login(
  req,
  res,
  next
) {
  try {
    const username =
      String(
        req.body?.username ||
        ""
      ).trim();

    const password =
      String(
        req.body?.password ||
        ""
      );


    if (
      !username ||
      !password
    ) {
      return res
        .status(400)
        .json({
          success: false,

          message:
            "Username and password are required.",
        });
    }


    const [rows] =
      await pool.query(
        `
          SELECT
            u.id,
            u.username,
            u.password_hash,
            u.full_name,
            u.role_id,
            u.is_active,

            r.role_name,
            r.is_active
              AS role_is_active

          FROM users u

          LEFT JOIN roles r
            ON r.id =
               u.role_id

          WHERE u.username =
                :username

          LIMIT 1
        `,
        {
          username,
        }
      );


    const user =
      rows[0];


    if (
      !user ||
      !user.is_active ||
      !user.role_is_active
    ) {
      return res
        .status(401)
        .json({
          success: false,

          message:
            "Invalid username or password.",
        });
    }


    const valid =
      await verifyPassword(
        password,
        user.password_hash
      );


    if (!valid) {
      return res
        .status(401)
        .json({
          success: false,

          message:
            "Invalid username or password.",
        });
    }


    await pool.query(
      `
        UPDATE users

        SET last_login =
            NOW()

        WHERE id =
              :userId
      `,
      {
        userId:
          user.id,
      }
    );


    const permissions =
      await getEffectivePermissions(
        user.id,
        user.role_id
      );


    const token =
      signToken({
        sub:
          user.id,

        username:
          user.username,

        role_id:
          user.role_id,

        role:
          user.role_name ||
          null,
      });


    return res.json({
      success: true,

      data: {
        token,

        user: {
          id:
            user.id,

          username:
            user.username,

          fullName:
            user.full_name,

          roleId:
            user.role_id,

          role:
            user.role_name ||
            null,

          permissions,
        },
      },
    });

  } catch (err) {
    return next(err);
  }
}


async function me(
  req,
  res
) {
  return res.json({
    success: true,

    data: {
      user:
        req.user,
    },
  });
}


module.exports = {
  login,
  me,
};