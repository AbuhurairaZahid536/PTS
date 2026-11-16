const {
  listCustomShiftGroups,
  getCustomShiftGroupById,
  createCustomShiftGroup,
  updateCustomShiftGroup,
  deactivateCustomShiftGroup,
  permanentlyDeleteCustomShiftGroup,
  getCustomShiftGroupsForDate,
  calculateCustomShiftAttendance,
} = require(
  "../models/customShift.model"
);

const {
  logRequestAudit,
} = require(
  "../services/audit.service"
);


function sendModelError(
  error,
  res,
  next
) {
  if (
    Number(
      error?.statusCode
    ) === 400 ||
    /Custom Shift|Shift|Staff|overlap|effective|attendance history/i.test(
      String(
        error?.message ||
        ""
      )
    )
  ) {
    return res
      .status(400)
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


async function listRecords(
  req,
  res,
  next
) {
  try {
    const data =
      await listCustomShiftGroups({
        search:
          req.query?.search,
        activeOn:
          req.query?.active_on,
        isActive:
          req.query?.is_active,
      });

    return res.json({
      success:
        true,
      data,
      total:
        data.length,
    });
  } catch (error) {
    return next(
      error
    );
  }
}


async function recordsForDate(
  req,
  res,
  next
) {
  try {
    const data =
      await getCustomShiftGroupsForDate(
        req.query?.date ||
        req.query?.attendance_date
      );

    return res.json({
      success:
        true,
      data,
      total:
        data.length,
    });
  } catch (error) {
    return sendModelError(
      error,
      res,
      next
    );
  }
}


async function attendanceSummary(
  req,
  res,
  next
) {
  try {
    const attendanceDate =
      req.query?.attendance_date ||
      req.query?.date;

    if (!attendanceDate) {
      return res
        .status(400)
        .json({
          success: false,
          message:
            "attendance_date is required.",
        });
    }

    const data =
      await calculateCustomShiftAttendance(
        attendanceDate
      );

    return res.json({
      success: true,
      data,
    });
  } catch (error) {
    return sendModelError(
      error,
      res,
      next
    );
  }
}


async function getRecord(
  req,
  res,
  next
) {
  try {
    const record =
      await getCustomShiftGroupById(
        req.params.id
      );

    if (!record) {
      return res
        .status(404)
        .json({
          success:
            false,
          message:
            "Custom Shift Group not found.",
        });
    }

    return res.json({
      success:
        true,
      data:
        record,
    });
  } catch (error) {
    return next(
      error
    );
  }
}


async function addRecord(
  req,
  res,
  next
) {
  try {
    const record =
      await createCustomShiftGroup(
        req.body || {},
        req.user?.id ||
          null
      );

    await logRequestAudit(
      req,
      {
        action:
          "CREATE",
        module:
          "CUSTOM_SHIFT_DUTY",
        recordId:
          record.id,
        description:
          "Custom Shift Duty Group created.",
        oldData:
          null,
        newData:
          record,
      }
    );

    return res
      .status(201)
      .json({
        success:
          true,
        message:
          "Custom Shift Duty Group saved successfully.",
        data:
          record,
      });
  } catch (error) {
    return sendModelError(
      error,
      res,
      next
    );
  }
}


async function editRecord(
  req,
  res,
  next
) {
  try {
    const existing =
      await getCustomShiftGroupById(
        req.params.id
      );

    if (!existing) {
      return res
        .status(404)
        .json({
          success:
            false,
          message:
            "Custom Shift Group not found.",
        });
    }

    const record =
      await updateCustomShiftGroup(
        req.params.id,
        req.body || {},
        req.user?.id ||
          null
      );

    await logRequestAudit(
      req,
      {
        action:
          "UPDATE",
        module:
          "CUSTOM_SHIFT_DUTY",
        recordId:
          record.id,
        description:
          record.effective_period_created
            ? `Custom Shift new effective period created from group ${existing.id}; historical records preserved.`
            : "Custom Shift Duty Group updated.",
        oldData:
          existing,
        newData:
          record,
      }
    );

    return res.json({
      success:
        true,
      message:
        record.effective_period_created
          ? "New effective period saved; completed attendance preserved."
          : "Custom Shift Duty Group updated successfully.",
      data:
        record,
    });
  } catch (error) {
    return sendModelError(
      error,
      res,
      next
    );
  }
}


async function permanentDeleteRecord(
  req,
  res,
  next
) {
  try {
    const existing =
      await getCustomShiftGroupById(
        req.params.id
      );

    if (!existing) {
      return res
        .status(404)
        .json({
          success:
            false,
          message:
            "Custom Shift Group not found.",
        });
    }

    const record =
      await permanentlyDeleteCustomShiftGroup(
        req.params.id
      );

    await logRequestAudit(
      req,
      {
        action:
          "PERMANENT_DELETE",
        module:
          "CUSTOM_SHIFT_DUTY",
        recordId:
          existing.id,
        description:
          "Custom Shift Duty Group permanently deleted.",
        oldData:
          existing,
        newData:
          null,
      }
    );

    return res.json({
      success:
        true,
      message:
        "Custom Shift Duty Group permanently deleted successfully.",
      data:
        record,
    });
  } catch (error) {
    return sendModelError(
      error,
      res,
      next
    );
  }
}


async function deleteRecord(
  req,
  res,
  next
) {
  try {
    const existing =
      await getCustomShiftGroupById(
        req.params.id
      );

    if (!existing) {
      return res
        .status(404)
        .json({
          success:
            false,
          message:
            "Custom Shift Group not found.",
        });
    }

    const record =
      await deactivateCustomShiftGroup(
        req.params.id,
        req.user?.id ||
          null
      );

    await logRequestAudit(
      req,
      {
        action:
          "DELETE",
        module:
          "CUSTOM_SHIFT_DUTY",
        recordId:
          record.id,
        description:
          "Custom Shift Duty Group deactivated.",
        oldData:
          existing,
        newData:
          record,
      }
    );

    return res.json({
      success:
        true,
      message:
        "Custom Shift Duty Group deactivated successfully.",
      data:
        record,
    });
  } catch (error) {
    return sendModelError(
      error,
      res,
      next
    );
  }
}


module.exports = {
  listRecords,
  recordsForDate,
  attendanceSummary,
  getRecord,
  addRecord,
  editRecord,
  deleteRecord,
  permanentDeleteRecord,
};
