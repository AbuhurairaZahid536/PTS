const {
  getAuditLogs,
  getAuditLogById,
  getAuditLogOptions,
} = require(
  "../models/auditLog.model"
);


function parseJsonValue(
  value
) {
  if (
    value ===
      null ||
    value ===
      undefined
  ) {
    return null;
  }

  if (
    typeof value ===
    "object"
  ) {
    return value;
  }

  try {
    return JSON.parse(
      value
    );
  } catch {
    return value;
  }
}


async function listAuditLogs(
  req,
  res,
  next
) {
  try {
    const result =
      await getAuditLogs({
        search:
          req.query.search ||
          "",

        module:
          req.query.module ||
          "",

        action:
          req.query.action ||
          "",

        userId:
          req.query.user_id ||
          null,

        dateFrom:
          req.query.date_from ||
          "",

        dateTo:
          req.query.date_to ||
          "",

        page:
          req.query.page ||
          1,

        limit:
          req.query.limit ||
          20,
      });


    return res.json({
      success:
        true,

      data:
        result.rows,

      pagination:
        result.pagination,
    });
  } catch (error) {
    return next(
      error
    );
  }
}


async function getAuditLog(
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
      !Number.isInteger(
        id
      ) ||
      id <
        1
    ) {
      return res
        .status(400)
        .json({
          success:
            false,

          message:
            "Invalid Audit Log ID.",
        });
    }


    const row =
      await getAuditLogById(
        id
      );


    if (!row) {
      return res
        .status(404)
        .json({
          success:
            false,

          message:
            "Audit Log not found.",
        });
    }


    return res.json({
      success:
        true,

      data: {
        ...row,

        old_data:
          parseJsonValue(
            row.old_data
          ),

        new_data:
          parseJsonValue(
            row.new_data
          ),
      },
    });
  } catch (error) {
    return next(
      error
    );
  }
}


async function listAuditLogOptions(
  req,
  res,
  next
) {
  try {
    const data =
      await getAuditLogOptions();


    return res.json({
      success:
        true,

      data,
    });
  } catch (error) {
    return next(
      error
    );
  }
}


module.exports = {
  listAuditLogs,
  getAuditLog,
  listAuditLogOptions,
};