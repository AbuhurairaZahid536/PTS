const {
  listDutyRosters,
  getDutyRosterById,

  createDutyRoster,
  updateDutyRoster,
  deleteDutyRoster,
  calculateDutyRosterAttendance,
  getStaffDutyStatus,
} = require(
  "../models/dutyRoster.model"
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
    ) ===
      400 ||
    /Duty Roster|Shift|Duty Point|selected Staff|selected Trainee|Same Staff/i.test(
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
      await listDutyRosters({
        search:
          req.query
            ?.search,

        rosterDate:
          req.query
            ?.roster_date,
      });

    return res.json({
      success:
        true,

      data,

      total:
        data.length,
    });
  } catch (
    error
  ) {
    return next(
      error
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
      await getDutyRosterById(
        req.params.id
      );

    if (
      !record
    ) {
      return res
        .status(404)
        .json({
          success:
            false,

          message:
            "Duty Roster not found.",
        });
    }

    return res.json({
      success:
        true,

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


async function addRecord(
  req,
  res,
  next
) {
  try {
    const record =
      await createDutyRoster(
        req.body ||
          {},

        req.user?.id ||
          null
      );


    await logRequestAudit(
      req,
      {
        action:
          "CREATE",

        module:
          "DUTY_ROSTER",

        recordId:
          record.id,

        description:
          "Duty Roster created.",

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
          "Duty Roster saved successfully.",

        data:
          record,
      });
  } catch (
    error
  ) {
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
      await getDutyRosterById(
        req.params.id
      );

    if (
      !existing
    ) {
      return res
        .status(404)
        .json({
          success:
            false,

          message:
            "Duty Roster not found.",
        });
    }


    const record =
      await updateDutyRoster(
        req.params.id,

        req.body ||
          {},

        req.user?.id ||
          null
      );


    await logRequestAudit(
      req,
      {
        action:
          "UPDATE",

        module:
          "DUTY_ROSTER",

        recordId:
          record.id,

        description:
          "Duty Roster updated.",

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
        "Duty Roster updated successfully.",

      data:
        record,
    });
  } catch (
    error
  ) {
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
      await getDutyRosterById(
        req.params.id
      );

    if (
      !existing
    ) {
      return res
        .status(404)
        .json({
          success:
            false,

          message:
            "Duty Roster not found.",
        });
    }


    const deleted =
      await deleteDutyRoster(
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
          "DUTY_ROSTER",

        recordId:
          deleted.id,

        description:
          "Duty Roster deleted from active roster list.",

        oldData:
          existing,

        newData:
          deleted,
      }
    );


    return res.json({
      success:
        true,

      message:
        "Duty Roster deleted successfully.",
    });
  } catch (
    error
  ) {
    return next(
      error
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
      req.query
        ?.attendance_date;

    if (
      !attendanceDate
    ) {
      return res
        .status(400)
        .json({
          success:
            false,

          message:
            "attendance_date is required.",
        });
    }

    const data =
      await calculateDutyRosterAttendance(
        attendanceDate
      );

    return res.json({
      success:
        true,

      data,
    });
  } catch (
    error
  ) {
    return sendModelError(
      error,
      res,
      next
    );
  }
}


async function staffDutyStatus(
  req,
  res,
  next
) {
  try {
    const subjectId =
      req.query
        ?.subject_id;

    const rosterDate =
      req.query
        ?.roster_date;

    if (
      !subjectId ||
      !rosterDate
    ) {
      return res
        .status(400)
        .json({
          success:
            false,

          message:
            "subject_id and roster_date are required.",
        });
    }

    const data =
      await getStaffDutyStatus({
        subjectId,

        rosterDate,

        startTime:
          req.query
            ?.start_time ||
          null,

        endTime:
          req.query
            ?.end_time ||
          null,

        shiftKey:
          req.query
            ?.shift_key ||
          null,
      });

    return res.json({
      success:
        true,

      data,
    });
  } catch (
    error
  ) {
    return sendModelError(
      error,
      res,
      next
    );
  }
}


module.exports = {
  listRecords,
  getRecord,
  addRecord,
  editRecord,
  deleteRecord,
  attendanceSummary,
  staffDutyStatus,
};
