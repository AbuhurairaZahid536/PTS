const {
  verifyToken,
} = require("../utils/jwt");

const {
  pool,
} = require("../config/db");

const {
  getEffectivePermissions,
  requirePermission,
  requireAnyPermission,
} = require("./permissions");


async function authenticate(
  req,
  res,
  next
) {
  try {
    const header =
      req.headers.authorization ||
      "";


    if (
      !header.startsWith(
        "Bearer "
      )
    ) {
      return res
        .status(401)
        .json({
          success: false,

          message:
            "Authentication required.",
        });
    }


    const token =
      header
        .slice(7)
        .trim();


    const payload =
      verifyToken(token);


    /*
    |--------------------------------------------------------------------------
    | LOAD CURRENT USER FROM DB
    |--------------------------------------------------------------------------
    |
    | Token role ko blindly trust nahi karenge.
    | Har request par current DB role/status check hoga.
    |--------------------------------------------------------------------------
    */

    const [rows] =
      await pool.query(
        `
          SELECT
            u.id,
            u.username,
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

          WHERE u.id =
                :id

          LIMIT 1
        `,
        {
          id:
            payload.sub,
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
            "User account is inactive or unavailable.",
        });
    }


    /*
    |--------------------------------------------------------------------------
    | CALCULATE EFFECTIVE PERMISSIONS
    |--------------------------------------------------------------------------
    */

    const permissions =
      await getEffectivePermissions(
        user.id,
        user.role_id
      );


    req.user = {
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

      roles:
        user.role_name
          ? [
              user.role_name,
            ]
          : [],

      permissions,
    };


    return next();

  } catch (err) {

    if (
      err.name ===
        "TokenExpiredError" ||
      err.name ===
        "JsonWebTokenError"
    ) {
      return res
        .status(401)
        .json({
          success: false,

          message:
            "Invalid or expired authentication token.",
        });
    }


    return next(err);
  }
}


module.exports = {
  authenticate,
  requirePermission,
  requireAnyPermission,
};