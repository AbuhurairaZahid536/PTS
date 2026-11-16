const {
  getTrainee,

  validateTraineeDateTime,

  getById,

  hasActiveDrop,

  createDrop,

  updateDrop,

  rejoinDrop,

  cancelDrop,

  getDrops,
} = require(
  "../models/trainingDrop.model"
);

const {
  logRequestAudit,
} = require(
  "../services/audit.service"
);

const {
  findIndividualLongWeekendConflict,
  buildReverseConflictMessage,
} = require("../services/longWeekendConflict.service");

/*
|--------------------------------------------------------------------------
| HELPERS
|--------------------------------------------------------------------------
*/

function validDateTime(
  value
) {
  if (!value) {
    return false;
  }

  const date =
    new Date(
      value
    );

  return !Number.isNaN(
    date.getTime()
  );
}


async function individualWeekendConflictMessageForRepatriate({
  traineeId,
  startDatetime,
  endDatetime = null,
}) {
  const conflict =
    await findIndividualLongWeekendConflict({
      traineeId,
      startDatetime,
      endDatetime,
    });

  return buildReverseConflictMessage(
    conflict,
    "Repatriate"
  );
}


function auditDateTime(
  value
) {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return null;
  }

  if (
    value instanceof Date
  ) {
    if (
      Number.isNaN(
        value.getTime()
      )
    ) {
      return null;
    }

    const pad = (
      number
    ) =>
      String(
        number
      ).padStart(
        2,
        "0"
      );

    return [
      value.getFullYear(),
      "-",
      pad(
        value.getMonth() + 1
      ),
      "-",
      pad(
        value.getDate()
      ),
      " ",
      pad(
        value.getHours()
      ),
      ":",
      pad(
        value.getMinutes()
      ),
      ":",
      pad(
        value.getSeconds()
      ),
    ].join("");
  }

  const text =
    String(
      value
    ).trim();

  if (!text) {
    return null;
  }

  if (
    /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/
      .test(
        text
      )
  ) {
    return text
      .replace(
        "T",
        " "
      )
      .substring(
        0,
        19
      );
  }

  return text;
}


/*
|--------------------------------------------------------------------------
| AUDIT STATE
|--------------------------------------------------------------------------
*/

function buildAuditState(
  record,
  trainee =
    null
) {
  if (!record) {
    return null;
  }

  const context =
    trainee ||
    {};

  return {
    trainee_id:
      record.trainee_id ||
      context.id ||
      null,

    employee_id:
      record.employee_id ||
      context.employee_id ||
      null,

    course_id:
      record.course_id ||
      context.course_id ||
      null,

    course_name:
      record.course_name ||
      context.course_name ||
      null,

    course_start_date:
      record.course_start_date ||
      context.course_start_date ||
      null,

    course_end_date:
      record.course_end_date ||
      context.course_end_date ||
      null,

    platoon_id:
      record.platoon_id ||
      context.platoon_id ||
      null,

    platoon_number:
      record.platoon_number ??
      context.platoon_number ??
      null,

    /*
    |--------------------------------------------------------------------------
    | DROP
    |--------------------------------------------------------------------------
    */

    drop_datetime:
      auditDateTime(
        record.drop_datetime
      ),

    reason:
      record.reason ||
      null,

    order_reference:
      record.order_reference ||
      null,

    remarks:
      record.remarks ||
      null,

    drop_status:
      record.drop_status ||
      null,

    /*
    |--------------------------------------------------------------------------
    | REJOIN
    |--------------------------------------------------------------------------
    */

    rejoin_datetime:
      auditDateTime(
        record.rejoin_datetime
      ),

    rejoin_reason:
      record.rejoin_reason ||
      null,

    rejoin_order_reference:
      record.rejoin_order_reference ||
      null,

    rejoined_by:
      record.rejoined_by ||
      null,

    rejoined_at:
      auditDateTime(
        record.rejoined_at
      ),

    /*
    |--------------------------------------------------------------------------
    | CANCELLATION
    |--------------------------------------------------------------------------
    */

    cancellation_reason:
      record.cancellation_reason ||
      null,

    cancelled_by:
      record.cancelled_by ||
      null,

    cancelled_at:
      auditDateTime(
        record.cancelled_at
      ),
  };
}


function buildEmptyAuditState() {
  return {
    trainee_id:
      null,

    employee_id:
      null,

    course_id:
      null,

    course_name:
      null,

    course_start_date:
      null,

    course_end_date:
      null,

    platoon_id:
      null,

    platoon_number:
      null,

    drop_datetime:
      null,

    reason:
      null,

    order_reference:
      null,

    remarks:
      null,

    drop_status:
      null,

    rejoin_datetime:
      null,

    rejoin_reason:
      null,

    rejoin_order_reference:
      null,

    rejoined_by:
      null,

    rejoined_at:
      null,

    cancellation_reason:
      null,

    cancelled_by:
      null,

    cancelled_at:
      null,
  };
}


/*
|--------------------------------------------------------------------------
| CENTRAL AUDIT
|--------------------------------------------------------------------------
*/

async function writeAudit({
  req,

  action,

  id,

  description,

  oldData =
    null,

  newData =
    null,

  trainee =
    null,
}) {
  return logRequestAudit(
    req,
    {
      action,

      module:
        "TRAINING_DROP",

      recordId:
        id,

      description,

      oldData:
        oldData
          ? buildAuditState(
              oldData,
              trainee
            )
          : buildEmptyAuditState(),

      newData:
        newData
          ? buildAuditState(
              newData,
              trainee
            )
          : null,
    }
  );
}


/*
|--------------------------------------------------------------------------
| LIST
|--------------------------------------------------------------------------
*/

async function listDrops(
  req,
  res,
  next
) {
  try {
    const status =
      req.query.status
        ? String(
            req.query.status
          )
            .trim()
            .toUpperCase()
        : null;

    if (
      status &&
      ![
        "ACTIVE",
        "REJOINED",
        "CANCELLED",
      ].includes(
        status
      )
    ) {
      return res
        .status(400)
        .json({
          success:
            false,

          message:
            "Invalid Training Drop status.",
        });
    }

    const rows =
      await getDrops({
        search:
          req.query.search ||
          "",

        status,

        dateFrom:
          req.query.date_from ||
          null,

        dateTo:
          req.query.date_to ||
          null,
      });

    return res.json({
      success:
        true,

      data:
        rows,
    });
  } catch (
    error
  ) {
    return next(
      error
    );
  }
}


/*
|--------------------------------------------------------------------------
| CREATE DROP
|--------------------------------------------------------------------------
*/

async function addDrop(
  req,
  res,
  next
) {
  try {
    const traineeId =
      Number(
        req.body
          .trainee_id
      );

    if (!traineeId) {
      return res
        .status(400)
        .json({
          success:
            false,

          message:
            "Valid trainee is required.",
        });
    }

    const trainee =
      await getTrainee(
        traineeId
      );

    if (!trainee) {
      return res
        .status(404)
        .json({
          success:
            false,

          message:
            "Trainee not found.",
        });
    }

    const dropDatetime =
      req.body
        .drop_datetime;

    if (
      !validDateTime(
        dropDatetime
      )
    ) {
      return res
        .status(400)
        .json({
          success:
            false,

          message:
            "Valid Drop Date/Time is required.",
        });
    }

    /*
    |--------------------------------------------------------------------------
    | COURSE DATE VALIDATION
    |--------------------------------------------------------------------------
    */

    const dateCheck =
      await validateTraineeDateTime({
        traineeId,

        dateTime:
          dropDatetime,

        label:
          "Drop Date",
      });

    if (
      !dateCheck.valid
    ) {
      return res
        .status(400)
        .json({
          success:
            false,

          message:
            dateCheck.message,
        });
    }

    /*
    |--------------------------------------------------------------------------
    | ACTIVE DROP
    |--------------------------------------------------------------------------
    */

    if (
      await hasActiveDrop(
        traineeId
      )
    ) {
      return res
        .status(409)
        .json({
          success:
            false,

          message:
            "This Course-specific trainee record already has an Active Training Drop.",
        });
    }

    const weekendConflictMessage =
      await individualWeekendConflictMessageForRepatriate({
        traineeId,
        startDatetime:
          dropDatetime,
      });

    if (weekendConflictMessage) {
      return res
        .status(409)
        .json({
          success:
            false,

          message:
            weekendConflictMessage,
        });
    }

    const reason =
      String(
        req.body.reason ||
        ""
      ).trim();

    if (!reason) {
      return res
        .status(400)
        .json({
          success:
            false,

          message:
            "Drop Reason is required.",
        });
    }

    const record =
      await createDrop({
        traineeId,

        dropDatetime,

        reason,

        orderReference:
          req.body
            .order_reference,

        remarks:
          req.body
            .remarks,

        userId:
          req.user?.id ||
          null,
      });

    /*
    |--------------------------------------------------------------------------
    | CENTRAL AUDIT
    |--------------------------------------------------------------------------
    */

    await writeAudit({
      req,

      action:
        "DROP",

      id:
        record.id,

      description:
        `Trainee ${trainee.employee_id} dropped from ${trainee.course_name || "training"}.`,

      oldData:
        null,

      newData: {
        ...record,

        trainee_id:
          trainee.id,

        employee_id:
          trainee.employee_id,
      },

      trainee,
    });

    return res
      .status(201)
      .json({
        success:
          true,

        message:
          "Trainee dropped from training successfully.",

        data:
          record,
      });
  } catch (
    error
  ) {
    return next(
      error
    );
  }
}


/*
|--------------------------------------------------------------------------
| EDIT DROP / REPATRIATE
|--------------------------------------------------------------------------
*/

async function editDrop(
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
      id <= 0
    ) {
      return res
        .status(400)
        .json({
          success:
            false,

          message:
            "Invalid Training Drop.",
        });
    }

    const existing =
      await getById(
        id
      );

    if (!existing) {
      return res
        .status(404)
        .json({
          success:
            false,

          message:
            "Training Drop not found.",
        });
    }

    /*
    |--------------------------------------------------------------------------
    | CANCELLED CANNOT BE EDITED
    |--------------------------------------------------------------------------
    */

    if (
      existing.drop_status ===
      "CANCELLED"
    ) {
      return res
        .status(400)
        .json({
          success:
            false,

          message:
            "Cancelled Training Drop cannot be edited.",
        });
    }

    /*
    |--------------------------------------------------------------------------
    | REPATRIATE DATE / TIME
    |--------------------------------------------------------------------------
    */

    const dropDatetime =
      req.body
        .drop_datetime;

    if (
      !validDateTime(
        dropDatetime
      )
    ) {
      return res
        .status(400)
        .json({
          success:
            false,

          message:
            "Valid Repatriate Date/Time is required.",
        });
    }

    /*
    |--------------------------------------------------------------------------
    | COURSE DATE VALIDATION
    |--------------------------------------------------------------------------
    */

    const dateCheck =
      await validateTraineeDateTime({
        traineeId:
          existing.trainee_id,

        dateTime:
          dropDatetime,

        label:
          "Repatriate Date",
      });

    if (
      !dateCheck.valid
    ) {
      return res
        .status(400)
        .json({
          success:
            false,

          message:
            dateCheck.message,
        });
    }

    /*
    |--------------------------------------------------------------------------
    | REJOINED RECORD DATE VALIDATION
    |--------------------------------------------------------------------------
    */

    if (
      existing.drop_status ===
        "REJOINED" &&
      existing.rejoin_datetime
    ) {
      if (
        new Date(
          dropDatetime
        ) >=
        new Date(
          existing.rejoin_datetime
        )
      ) {
        return res
          .status(400)
          .json({
            success:
              false,

            message:
              "Repatriate Date/Time must be earlier than Rejoin Date/Time.",
          });
      }
    }

    /*
    |--------------------------------------------------------------------------
    | ACTIVE DROP DUPLICATE CHECK
    |--------------------------------------------------------------------------
    */

    if (
      existing.drop_status ===
      "ACTIVE"
    ) {
      const anotherActiveDrop =
        await hasActiveDrop(
          existing.trainee_id,
          id
        );

      if (
        anotherActiveDrop
      ) {
        return res
          .status(409)
          .json({
            success:
              false,

            message:
              "This trainee already has another Active Training Drop.",
          });
      }
    }

    const weekendConflictMessage =
      await individualWeekendConflictMessageForRepatriate({
        traineeId:
          existing.trainee_id,
        startDatetime:
          dropDatetime,
        endDatetime:
          existing.drop_status === "REJOINED"
            ? existing.rejoin_datetime
            : null,
      });

    if (weekendConflictMessage) {
      return res
        .status(409)
        .json({
          success:
            false,

          message:
            weekendConflictMessage,
        });
    }

    /*
    |--------------------------------------------------------------------------
    | REASON
    |--------------------------------------------------------------------------
    */

    const reason =
      String(
        req.body.reason ||
        ""
      ).trim();

    if (!reason) {
      return res
        .status(400)
        .json({
          success:
            false,

          message:
            "Repatriate Reason is required.",
        });
    }

    /*
    |--------------------------------------------------------------------------
    | TRAINEE
    |--------------------------------------------------------------------------
    */

    const trainee =
      await getTrainee(
        existing.trainee_id
      );

    if (!trainee) {
      return res
        .status(404)
        .json({
          success:
            false,

          message:
            "Trainee not found.",
        });
    }

    /*
    |--------------------------------------------------------------------------
    | UPDATE
    |--------------------------------------------------------------------------
    */

    const record =
      await updateDrop({
        id,

        dropDatetime,

        reason,

        orderReference:
          req.body
            .order_reference,

        remarks:
          req.body
            .remarks,

        updatedBy:
          req.user?.id ||
          null,
      });

    if (!record) {
      return res
        .status(400)
        .json({
          success:
            false,

          message:
            "Training Drop could not be updated.",
        });
    }

    /*
    |--------------------------------------------------------------------------
    | AUDIT
    |--------------------------------------------------------------------------
    */

    await writeAudit({
      req,

      action:
        "UPDATE",

      id,

      description:
        `Repatriate record updated for ${
          trainee.employee_id ||
          existing.employee_id ||
          "trainee"
        }.`,

      oldData:
        existing,

      newData:
        record,

      trainee,
    });

    return res.json({
      success:
        true,

      message:
        "Repatriate record updated successfully.",

      data:
        record,
    });
  } catch (
    error
  ) {
    return next(
      error
    );
  }
}


/*
|--------------------------------------------------------------------------
| REJOIN
|--------------------------------------------------------------------------
*/

async function rejoin(
  req,
  res,
  next
) {
  try {
    const id =
      Number(
        req.params.id
      );

    if (!id) {
      return res
        .status(400)
        .json({
          success:
            false,

          message:
            "Invalid Training Drop.",
        });
    }

    const existing =
      await getById(
        id
      );

    if (!existing) {
      return res
        .status(404)
        .json({
          success:
            false,

          message:
            "Training Drop not found.",
        });
    }

    if (
      existing.drop_status !==
      "ACTIVE"
    ) {
      return res
        .status(400)
        .json({
          success:
            false,

          message:
            "Only Active Training Drop can be rejoined.",
        });
    }

    const rejoinDatetime =
      req.body
        .rejoin_datetime;

    if (
      !validDateTime(
        rejoinDatetime
      )
    ) {
      return res
        .status(400)
        .json({
          success:
            false,

          message:
            "Valid Rejoin Date/Time is required.",
        });
    }

    if (
      new Date(
        rejoinDatetime
      ) <=
      new Date(
        existing.drop_datetime
      )
    ) {
      return res
        .status(400)
        .json({
          success:
            false,

          message:
            "Rejoin Date/Time must be later than Drop Date/Time.",
        });
    }

    /*
    |--------------------------------------------------------------------------
    | REJOIN MUST ALSO BE INSIDE SAME COURSE
    |--------------------------------------------------------------------------
    */

    const dateCheck =
      await validateTraineeDateTime({
        traineeId:
          existing.trainee_id,

        dateTime:
          rejoinDatetime,

        label:
          "Rejoin Date",
      });

    if (
      !dateCheck.valid
    ) {
      return res
        .status(400)
        .json({
          success:
            false,

          message:
            dateCheck.message,
        });
    }

    const trainee =
      await getTrainee(
        existing.trainee_id
      );

    const record =
      await rejoinDrop({
        id,

        rejoinDatetime,

        rejoinReason:
          req.body
            .rejoin_reason,

        rejoinOrderReference:
          req.body
            .rejoin_order_reference,

        rejoinedBy:
          req.user?.id ||
          null,
      });

    if (!record) {
      return res
        .status(400)
        .json({
          success:
            false,

          message:
            "Training Drop could not be rejoined.",
        });
    }

    /*
    |--------------------------------------------------------------------------
    | CENTRAL AUDIT
    |--------------------------------------------------------------------------
    */

    await writeAudit({
      req,

      action:
        "REJOIN",

      id,

      description:
        `Trainee ${
          trainee?.employee_id ||
          existing.employee_id ||
          ""
        } rejoined training.`,

      oldData:
        existing,

      newData:
        record,

      trainee,
    });

    return res.json({
      success:
        true,

      message:
        "Trainee rejoined successfully.",

      data:
        record,
    });
  } catch (
    error
  ) {
    return next(
      error
    );
  }
}


/*
|--------------------------------------------------------------------------
| CANCEL
|--------------------------------------------------------------------------
*/

async function cancel(
  req,
  res,
  next
) {
  try {
    const id =
      Number(
        req.params.id
      );

    if (!id) {
      return res
        .status(400)
        .json({
          success:
            false,

          message:
            "Invalid Training Drop.",
        });
    }

    const existing =
      await getById(
        id
      );

    if (!existing) {
      return res
        .status(404)
        .json({
          success:
            false,

          message:
            "Training Drop not found.",
        });
    }

    const reason =
      String(
        req.body
          .cancellation_reason ||
        ""
      ).trim();

    if (!reason) {
      return res
        .status(400)
        .json({
          success:
            false,

          message:
            "Cancellation Reason is required.",
        });
    }

    const trainee =
      await getTrainee(
        existing.trainee_id
      );

    const record =
      await cancelDrop({
        id,

        cancelledBy:
          req.user?.id ||
          null,

        cancellationReason:
          reason,
      });

    if (!record) {
      return res
        .status(400)
        .json({
          success:
            false,

          message:
            "Only Active Training Drop can be cancelled.",
        });
    }

    /*
    |--------------------------------------------------------------------------
    | CENTRAL AUDIT
    |--------------------------------------------------------------------------
    */

    await writeAudit({
      req,

      action:
        "CANCEL",

      id,

      description:
        `Training Drop cancelled for ${
          trainee?.employee_id ||
          existing.employee_id ||
          "trainee"
        }.`,

      oldData:
        existing,

      newData:
        record,

      trainee,
    });

    return res.json({
      success:
        true,

      message:
        "Training Drop cancelled.",

      data:
        record,
    });
  } catch (
    error
  ) {
    return next(
      error
    );
  }
}


module.exports = {
  listDrops,

  addDrop,

  editDrop,

  rejoin,

  cancel,
};