const ExcelJS = require("exceljs");

const { pool } = require("../config/db");

const {
  getTrainees,
  getTraineeById,

  findTraineeByCourseAndEmployee,
  getCurrentTraineeByEmployeeId,

  createTrainee,
  updateTrainee,
  restoreTrainee,

  softDeleteTrainee,
  getTraineeDeleteInfo,
} = require("../models/trainee.model");

const {
  resolveCourse,
  resolvePlatoon,
} = require("../services/traineeMaster.service");

const {
  deleteZkEmployeeByCode,
} = require("../integrations/zkbiotime/employeeWrite.service");

const { hasActiveDrop, createDrop } = require("../models/trainingDrop.model");

const { logRequestAudit, logBulkAudit } = require("../services/audit.service");

const {
  queueCourseLifecycleReconcile,
} = require("../jobs/courseLifecycle.job");

const {
  provisionActiveTraineeById,
} = require(
  "../services/courseZkLifecycle.service"
);

/*
|--------------------------------------------------------------------------
| HELPERS
|--------------------------------------------------------------------------
*/

function cleanText(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const text = String(value).trim();

  return text || null;
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function dateOnly(value) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return [
      value.getFullYear(),
      pad(value.getMonth() + 1),
      pad(value.getDate()),
    ].join("-");
  }

  const text = String(value).trim();

  if (!text) {
    return null;
  }

  return text.substring(0, 10);
}

/*
|--------------------------------------------------------------------------
| AUDIT SNAPSHOT
|--------------------------------------------------------------------------
*/

function buildTraineeAuditState(record) {
  if (!record) {
    return null;
  }

  return {
    employee_id: record.employee_id || null,

    belt_no: record.belt_no || null,

    first_name: record.first_name || null,

    last_name: record.last_name || null,

    father_name: record.father_name || null,

    cnic: record.cnic || null,

    phone: record.phone || null,

    email: record.email || null,

    address: record.address || null,

    course_id: record.course_id || null,

    course_name: record.course_name || null,

    platoon_id: record.platoon_id || null,

    platoon_number: record.platoon_number || null,

    position: record.position || null,

    joining_date: dateOnly(record.joining_date),

    status: record.status || null,

    remarks: record.remarks || null,

    is_deleted: Boolean(record.is_deleted),
  };
}

function todayDate() {
  const now = new Date();

  return [now.getFullYear(), pad(now.getMonth() + 1), pad(now.getDate())].join(
    "-",
  );
}

function getCourseStatus(course, referenceDate = todayDate()) {
  const start = dateOnly(course?.start_date);

  const end = dateOnly(course?.end_date);

  if (!start || !end) {
    return "DATE_NOT_SET";
  }

  if (referenceDate < start) {
    return "UPCOMING";
  }

  if (referenceDate > end) {
    return "COMPLETED";
  }

  return "ACTIVE";
}

function duplicateErrorMessage(error) {
  const message = String(
    error?.message || error?.sqlMessage || "",
  ).toLowerCase();

  if (message.includes("uq_trainee_course_employee")) {
    return "Same Employee ID / Cap No. already exists in this Course.";
  }

  return "Duplicate trainee record already exists.";
}

function normalizeHeader(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function getExcelCellValue(cell) {
  const raw = cell?.value;

  if (raw === null || raw === undefined) {
    return null;
  }

  if (raw instanceof Date) {
    return raw;
  }

  if (typeof raw === "object") {
    if (raw.text) {
      return String(raw.text).trim();
    }

    if (raw.result !== undefined) {
      return raw.result;
    }

    if (Array.isArray(raw.richText)) {
      return raw.richText
        .map((item) => item.text || "")
        .join("")
        .trim();
    }
  }

  return String(raw).trim();
}

function buildHeaderMap(worksheet) {
  const row = worksheet.getRow(1);

  const map = new Map();

  row.eachCell(
    {
      includeEmpty: false,
    },
    (cell, columnNumber) => {
      const name = normalizeHeader(getExcelCellValue(cell));

      if (name) {
        map.set(name, columnNumber);
      }
    },
  );

  return map;
}

function getColumnIndex(headerMap, names) {
  for (const name of names) {
    const index = headerMap.get(normalizeHeader(name));

    if (index) {
      return index;
    }
  }

  return null;
}

function rowValue(row, columnIndex) {
  if (!columnIndex) {
    return null;
  }

  return getExcelCellValue(row.getCell(columnIndex));
}

/*
|--------------------------------------------------------------------------
| CENTRAL ZK LIFECYCLE REQUEST
|--------------------------------------------------------------------------
|
| IMPORTANT:
|
| This controller DOES NOT directly create/update ZKBioTime employees.
|
| All automatic trainee ZKBioTime ownership is now handled by:
|
| courseZkLifecycle.service.js
|
| DATE_NOT_SET
|   -> PTS only
|   -> ZKBioTime untouched
|
| UPCOMING
|   -> PTS only
|   -> ZKBioTime untouched
|
| ACTIVE
|   -> Course lifecycle queued
|
| COMPLETED
|   -> Course lifecycle queued
|   -> PTS Course/Trainee/Platoon/history remain preserved
|
|--------------------------------------------------------------------------
*/

async function syncTraineeToZkWithRetry({
  trainee,
  course,
  platoon,
  attempts = 3,
  queueOnly = false,
}) {
  void platoon;

  if (!trainee) {
    return {
      status: "PENDING",

      message: "Trainee record is missing.",
    };
  }

  if (!course) {
    return {
      status: "PTS_ONLY",

      course_status: "DATE_NOT_SET",

      message:
        "Trainee saved in PTS. Course is required before ZKBioTime lifecycle can run.",
    };
  }

  const courseStatus =
    getCourseStatus(course);

  if (courseStatus === "DATE_NOT_SET") {
    return {
      status: "PTS_ONLY",

      course_status: courseStatus,

      message:
        "Trainee saved in PTS. Course dates are not set, so ZKBioTime was not changed.",
    };
  }

  if (courseStatus === "UPCOMING") {
    return {
      status: "PTS_ONLY",

      course_status: courseStatus,

      message:
        "Upcoming Course trainee saved in PTS. ZKBioTime was not changed.",
    };
  }

  /*
  |--------------------------------------------------------------------------
  | COMPLETED / BULK IMPORT
  |--------------------------------------------------------------------------
  |
  | Completed Course deprovisioning remains centralized. Bulk import also
  | remains queued so importing many rows does not become a long HTTP request.
  |--------------------------------------------------------------------------
  */

  if (
    courseStatus === "COMPLETED" ||
    queueOnly
  ) {
    queueCourseLifecycleReconcile(
      course.id
    );

    return {
      status: "LIFECYCLE_QUEUED",

      course_status: courseStatus,

      message:
        courseStatus === "COMPLETED"
          ? "Completed Course lifecycle queued. PTS Course, trainee, platoon and history remain preserved."
          : "Active Course lifecycle queued for ZKBioTime synchronization.",
    };
  }

  /*
  |--------------------------------------------------------------------------
  | ACTIVE — IMMEDIATE SAFE SINGLE-TRAINEE SYNC
  |--------------------------------------------------------------------------
  |
  | Do not wait for the full Course scheduler. The central service applies
  | the same Staff/duplicate-active-Course ownership guards to this one row.
  |--------------------------------------------------------------------------
  */

  const maxAttempts =
    Math.max(
      1,
      Number(attempts) ||
        1
    );

  let lastError =
    null;

  for (
    let attempt = 1;
    attempt <= maxAttempts;
    attempt += 1
  ) {
    try {
      const result =
        await provisionActiveTraineeById({
          traineeId:
            trainee.id,

          dryRun:
            false,
        });

      const action =
        String(
          result?.status ||
          ""
        ).toUpperCase();

      if (
        [
          "CREATED_FRESH",
          "RECREATED_FRESH",
          "UPDATED",
        ].includes(action)
      ) {
        return {
          status: "SYNCED",

          course_status: "ACTIVE",

          action,

          zkteco_employee_id:
            result?.zk_employee_id ||
            null,

          message:
            action === "UPDATED"
              ? "Trainee updated in ZKBioTime successfully."
              : "Trainee created in ZKBioTime successfully.",
        };
      }

      if (
        [
          "STAFF_CONFLICT",
          "AMBIGUOUS",
          "HISTORICAL",
          "SKIPPED",
          "DELETED",
          "ALREADY_MISSING",
          "NO_ACTION",
          "COURSE_NOT_MANAGED",
          "NOT_FOUND",
        ].includes(action)
      ) {
        return {
          status: "NOT_CURRENT",

          course_status:
            result?.course_status ||
            "ACTIVE",

          action,

          message:
            result?.reason ||
            "Trainee is not eligible for current ZKBioTime provisioning.",
        };
      }

      return {
        status: "PENDING",

        course_status: "ACTIVE",

        action:
          action ||
          null,

        message:
          result?.reason ||
          "ZKBioTime synchronization did not return a final employee state.",
      };
    } catch (error) {
      lastError =
        error;

      if (
        attempt <
        maxAttempts
      ) {
        await new Promise(
          (resolve) =>
            setTimeout(
              resolve,
              350 *
                attempt
            )
        );
      }
    }
  }

  /*
   * Network/API failure should not lose the PTS record. Queue the Course as
   * a background recovery path, but return the actual immediate failure.
   */
  queueCourseLifecycleReconcile(
    course.id
  );

  return {
    status: "PENDING",

    course_status: "ACTIVE",

    message:
      `Immediate ZKBioTime synchronization failed${
        lastError?.message
          ? `: ${lastError.message}`
          : "."
      } Lifecycle retry has been queued.`,
  };
}

/*
|--------------------------------------------------------------------------
| LIST
|--------------------------------------------------------------------------
*/

async function listTrainees(req, res, next) {
  try {
    const page = Number(req.query.page || 1);

    const pageSize = Number(req.query.page_size || 25);

    if (!Number.isInteger(page) || page < 1) {
      return res.status(400).json({
        success: false,

        message: "page must be a positive integer.",
      });
    }

    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
      return res.status(400).json({
        success: false,

        message: "page_size must be between 1 and 100.",
      });
    }

    const result = await getTrainees({
      search: req.query.search || "",

      courseId: req.query.course_id || null,

      platoonId: req.query.platoon_id || null,

      status: req.query.status || null,

      courseStatus: req.query.course_status || null,

      page,

      pageSize,
    });

    return res.json({
      success: true,

      data: result,
    });
  } catch (error) {
    return next(error);
  }
}

/*
|--------------------------------------------------------------------------
| GET SINGLE
|--------------------------------------------------------------------------
*/

async function getTrainee(req, res, next) {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({
        success: false,

        message: "Invalid trainee ID.",
      });
    }

    const trainee = await getTraineeById(id);

    if (!trainee) {
      return res.status(404).json({
        success: false,

        message: "Trainee not found.",
      });
    }

    return res.json({
      success: true,

      data: trainee,
    });
  } catch (error) {
    return next(error);
  }
}

/*
|--------------------------------------------------------------------------
| RESOLVE COURSE / PLATOON
|--------------------------------------------------------------------------
*/

async function resolveManualMasters(data) {
  const courseResult = await resolveCourse({
    courseId: data.course_id || null,

    courseName: cleanText(data.course_name),

    createIfMissing: true,
  });

  const course = courseResult.course;

  let platoonResult = {
    platoon: null,

    created: false,
  };

  if (course) {
    platoonResult = await resolvePlatoon({
      courseId: course.id,

      platoonId: data.platoon_id || null,

      platoonNumber: cleanText(data.platoon_number),

      platoonName: cleanText(data.platoon_name),

      createIfMissing: true,
    });
  }

  return {
    course,

    platoon: platoonResult.platoon,

    courseCreated: courseResult.created,

    platoonCreated: platoonResult.created,
  };
}

/*
|--------------------------------------------------------------------------
| ADD
|--------------------------------------------------------------------------
*/

async function addTrainee(req, res, next) {
  try {
    const data = req.body;

    const employeeId = cleanText(data.employee_id);

    if (!employeeId) {
      return res.status(400).json({
        success: false,

        message: "Employee ID / Cap No. is required.",
      });
    }

    const { course, platoon, courseCreated, platoonCreated } =
      await resolveManualMasters(data);

    if (!course) {
      return res.status(400).json({
        success: false,

        message: "Course is required.",
      });
    }

    const requestedStatus = (cleanText(data.status) || "ACTIVE").toUpperCase();

    /*
    |--------------------------------------------------------------------------
    | TRAINING DROP VALIDATION
    |--------------------------------------------------------------------------
    */

    if (requestedStatus === "TRAINING_DROP") {
      const courseStart = dateOnly(course.start_date);

      const courseEnd = dateOnly(course.end_date);

      const currentDate = todayDate();

      if (!courseStart || !courseEnd) {
        return res.status(400).json({
          success: false,

          message:
            "Training Drop cannot be created because Course Start/End Date is not set.",
        });
      }

      if (currentDate < courseStart || currentDate > courseEnd) {
        return res.status(400).json({
          success: false,

          message: `Training Drop can only be created within Course period ${courseStart} to ${courseEnd}.`,
        });
      }
    }

    /*
    |--------------------------------------------------------------------------
    | SAME EMPLOYEE + SAME COURSE PROTECTION
    |--------------------------------------------------------------------------
    */

    const duplicate = await findTraineeByCourseAndEmployee({
      courseId: course.id,

      employeeId,

      includeDeleted: true,
    });

    if (duplicate) {
      return res.status(409).json({
        success: false,

        message: `Employee ID / Cap No. ${employeeId} already exists in ${course.course_name}.`,
      });
    }

    /*
    |--------------------------------------------------------------------------
    | CREATE PTS TRAINEE
    |--------------------------------------------------------------------------
    */

    const trainee = await createTrainee({
      employee_id: employeeId,

      belt_no: cleanText(data.belt_no),

      first_name: cleanText(data.first_name),

      last_name: cleanText(data.last_name),

      father_name: cleanText(data.father_name),

      cnic: cleanText(data.cnic),

      phone: cleanText(data.phone),

      email: cleanText(data.email),

      address: cleanText(data.address),

      course_id: course.id,

      platoon_id: platoon?.id || null,

      position: cleanText(data.position),

      joining_date: data.joining_date || null,

      training_start_date: dateOnly(course.start_date),

      training_end_date: dateOnly(course.end_date),

      status: requestedStatus,

      remarks: cleanText(data.remarks),
    });

    /*
    |--------------------------------------------------------------------------
    | REPATRIATE / TRAINING DROP
    |--------------------------------------------------------------------------
    */

    if (requestedStatus === "TRAINING_DROP") {
      const activeDropExists = await hasActiveDrop(trainee.id);

      if (!activeDropExists) {
        await createDrop({
          traineeId: trainee.id,

          dropDatetime: new Date(),

          reason:
            cleanText(data.remarks) || "Repatriated while adding trainee.",

          orderReference: null,

          remarks: cleanText(data.remarks),

          userId: req.user?.id || null,
        });
      }
    }

    /*
    |--------------------------------------------------------------------------
    | CENTRAL COURSE LIFECYCLE
    |--------------------------------------------------------------------------
    */

    const zkSync = await syncTraineeToZkWithRetry({
      trainee: {
        ...trainee,

        status: requestedStatus,
      },

      course,

      platoon,

      attempts: 3,
    });

    const latest = await getTraineeById(trainee.id);

    await logRequestAudit(req, {
      action: "CREATE",

      module: "TRAINEE",

      recordId: trainee.id,

      description:
        requestedStatus === "TRAINING_DROP"
          ? `Trainee ${employeeId} added for ${course.course_name} and added to Repatriate. ZKBioTime: ${zkSync.status}.`
          : `Trainee ${employeeId} added for ${course.course_name}. ZKBioTime: ${zkSync.status}.`,

      oldData: null,

      newData: buildTraineeAuditState(latest || trainee),
    });

    return res.status(201).json({
      success: true,

      message:
        requestedStatus === "TRAINING_DROP"
          ? "Trainee saved and added to Repatriate successfully."
          : "Trainee saved successfully.",

      data: latest || trainee,

      master_data: {
        course_created: courseCreated,

        platoon_created: platoonCreated,

        course,

        platoon: platoon || null,
      },

      zkbiotime: zkSync,
    });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        success: false,

        message: duplicateErrorMessage(error),
      });
    }

    return next(error);
  }
}

/*
|--------------------------------------------------------------------------
| EDIT
|--------------------------------------------------------------------------
|
| IMPORTANT:
|
| Employee ID cannot be changed.
|
| Course change on an existing history row should not be used to manufacture
| a new Course history. For a different Course, create a new trainee record.
|--------------------------------------------------------------------------
*/

async function editTrainee(req, res, next) {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({
        success: false,

        message: "Invalid trainee ID.",
      });
    }

    const existing = await getTraineeById(id);

    if (!existing) {
      return res.status(404).json({
        success: false,

        message: "Trainee not found.",
      });
    }

    const data = req.body;

    const employeeId = cleanText(data.employee_id);

    if (!employeeId) {
      return res.status(400).json({
        success: false,

        message: "Employee ID / Cap No. is required.",
      });
    }

    if (employeeId !== String(existing.employee_id).trim()) {
      return res.status(400).json({
        success: false,

        message: "Employee ID / Cap No. cannot be changed after creation.",
      });
    }

    const { course, platoon, courseCreated, platoonCreated } =
      await resolveManualMasters(data);

    if (!course) {
      return res.status(400).json({
        success: false,

        message: "Course is required.",
      });
    }

    /*
    |--------------------------------------------------------------------------
    | HISTORICAL COURSE IDENTITY GUARD
    |--------------------------------------------------------------------------
    |
    | Employee ID + Course = historical trainee identity.
    |
    | Existing row must not simply be moved to another Course.
    |--------------------------------------------------------------------------
    */

    if (
      existing.course_id &&
      Number(existing.course_id) !== Number(course.id)
    ) {
      return res.status(409).json({
        success: false,

        message:
          "Course cannot be changed on an existing trainee history record. Add the same Employee ID as a new trainee record for the new Course.",
      });
    }

    const duplicate = await findTraineeByCourseAndEmployee({
      courseId: course.id,

      employeeId,

      excludeId: id,

      includeDeleted: true,
    });

    if (duplicate) {
      return res.status(409).json({
        success: false,

        message: `Employee ID / Cap No. ${employeeId} already exists in ${course.course_name}.`,
      });
    }

    const requestedStatus = (
      cleanText(data.status) ||
      existing.status ||
      "ACTIVE"
    ).toUpperCase();

    /*
    |--------------------------------------------------------------------------
    | TRAINING DROP VALIDATION
    |--------------------------------------------------------------------------
    */

    if (requestedStatus === "TRAINING_DROP") {
      const courseStart = dateOnly(course.start_date);

      const courseEnd = dateOnly(course.end_date);

      const currentDate = todayDate();

      if (!courseStart || !courseEnd) {
        return res.status(400).json({
          success: false,

          message:
            "Training Drop cannot be created because Course Start/End Date is not set.",
        });
      }

      if (currentDate < courseStart || currentDate > courseEnd) {
        return res.status(400).json({
          success: false,

          message: `Training Drop can only be created within Course period ${courseStart} to ${courseEnd}.`,
        });
      }
    }

    /*
    |--------------------------------------------------------------------------
    | UPDATE PTS RECORD
    |--------------------------------------------------------------------------
    */

    const trainee = await updateTrainee(id, {
      employee_id: existing.employee_id,

      belt_no:
        data.belt_no !== undefined
          ? cleanText(data.belt_no)
          : existing.belt_no,

      first_name: cleanText(data.first_name),

      last_name: cleanText(data.last_name),

      father_name: cleanText(data.father_name),

      cnic: cleanText(data.cnic),

      phone: cleanText(data.phone),

      email: cleanText(data.email),

      address: cleanText(data.address),

      course_id: existing.course_id || course.id,

      platoon_id: platoon?.id || null,

      position: cleanText(data.position),

      joining_date: data.joining_date || existing.joining_date || null,

      training_start_date: dateOnly(course.start_date),

      training_end_date: dateOnly(course.end_date),

      status: requestedStatus,

      remarks: cleanText(data.remarks),
    });

    /*
    |--------------------------------------------------------------------------
    | REPATRIATE / TRAINING DROP
    |--------------------------------------------------------------------------
    */

    if (requestedStatus === "TRAINING_DROP") {
      const activeDropExists = await hasActiveDrop(id);

      if (!activeDropExists) {
        await createDrop({
          traineeId: id,

          dropDatetime: new Date(),

          reason:
            cleanText(data.remarks) ||
            "Repatriated from Trainee List operational status.",

          orderReference: null,

          remarks: cleanText(data.remarks),

          userId: req.user?.id || null,
        });
      }
    }

    /*
    |--------------------------------------------------------------------------
    | CENTRAL COURSE LIFECYCLE
    |--------------------------------------------------------------------------
    */

    const zkSync = await syncTraineeToZkWithRetry({
      trainee,

      course,

      platoon,

      attempts: 3,
    });

    const latest = await getTraineeById(id);

    await logRequestAudit(req, {
      action: "UPDATE",

      module: "TRAINEE",

      recordId: id,

      description: `Trainee ${employeeId} updated. ZKBioTime: ${zkSync.status}.`,

      oldData: buildTraineeAuditState(existing),

      newData: buildTraineeAuditState(latest || trainee),
    });

    return res.json({
      success: true,

      message:
        requestedStatus === "TRAINING_DROP"
          ? "Trainee updated and added to Repatriate successfully."
          : "Trainee updated successfully.",

      data: latest || trainee,

      master_data: {
        course_created: courseCreated,

        platoon_created: platoonCreated,

        course,

        platoon: platoon || null,
      },

      zkbiotime: zkSync,
    });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        success: false,

        message: duplicateErrorMessage(error),
      });
    }

    return next(error);
  }
}

/*
|--------------------------------------------------------------------------
| IMPORT TEMPLATE
|--------------------------------------------------------------------------
*/

async function downloadImportTemplate(req, res, next) {
  try {
    const workbook = new ExcelJS.Workbook();

    const worksheet = workbook.addWorksheet("Trainees Import");

    worksheet.columns = [
      {
        header: "Employee ID / Cap No.",

        key: "employee_id",

        width: 24,
      },

      {
        header: "Belt #",

        key: "belt_no",

        width: 16,
      },

      {
        header: "First Name",

        key: "first_name",

        width: 20,
      },

      {
        header: "Last Name",

        key: "last_name",

        width: 20,
      },

      {
        header: "Father Name",

        key: "father_name",

        width: 22,
      },

      {
        header: "CNIC",

        key: "cnic",

        width: 18,
      },

      {
        header: "Phone",

        key: "phone",

        width: 18,
      },

      {
        header: "Email",

        key: "email",

        width: 28,
      },

      {
        header: "Address",

        key: "address",

        width: 35,
      },

      {
        header: "Course",

        key: "course",

        width: 30,
      },

      {
        header: "Platoon",

        key: "platoon",

        width: 14,
      },

      {
        header: "Status",

        key: "status",

        width: 18,
      },

      {
        header: "Remarks",

        key: "remarks",

        width: 35,
      },
    ];

    const headerRow = worksheet.getRow(1);

    headerRow.font = {
      bold: true,
    };

    headerRow.alignment = {
      vertical: "middle",

      horizontal: "center",
    };

    worksheet.views = [
      {
        state: "frozen",

        ySplit: 1,
      },
    ];

    worksheet.addRow({
      employee_id: "LC-0313",

      belt_no: "313/C",

      first_name: "Ali",

      last_name: "Ahmed",

      father_name: "Muhammad Ahmed",

      course: "Recruit Course 67th",

      platoon: "3",

      status: "ACTIVE",

      remarks: "",
    });

    const instructions = workbook.addWorksheet("Instructions");

    instructions.columns = [
      {
        header: "Field",

        key: "field",

        width: 32,
      },

      {
        header: "Instruction",

        key: "instruction",

        width: 110,
      },
    ];

    instructions.getRow(1).font = {
      bold: true,
    };

    instructions.addRows([
      {
        field: "Employee ID / Cap No.",

        instruction:
          "Required. Same Employee ID may exist in different Courses, but not twice in the same Course.",
      },

      {
        field: "Belt #",

        instruction:
          "Optional personal Belt Number. It does not replace Employee ID / Cap No.", 
      },

      {
        field: "Course",

        instruction:
          "Existing Course will be reused. New Course will be automatically created if it does not exist.",
      },

      {
        field: "New Course Dates",

        instruction:
          "Auto-created Course may initially have no Start/End Date. Open Courses page later and set dates. All trainees of that Course will automatically follow those Course dates.",
      },

      {
        field: "Platoon",

        instruction:
          "Existing Platoon in that Course will be reused. New Platoon will be automatically created.",
      },

      {
        field: "Same Employee + Same Course",

        instruction: "Existing same-Course trainee record will be updated.",
      },

      {
        field: "Same Employee + New Course",

        instruction: "New Course-specific history record will be created.",
      },

      {
        field: "Attendance",

        instruction:
          "A trainee is eligible for attendance only when selected attendance date falls between Course Start Date and Course End Date.",
      },

      {
        field: "Status",

        instruction:
          "Operational status. Recommended values: ACTIVE, ON_LEAVE, OSD, OUTDOOR, TRAINING_DROP, INACTIVE. Course lifecycle itself is automatically derived from Course dates.",
      },
    ]);

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );

    res.setHeader(
      "Content-Disposition",
      'attachment; filename="PTS_Trainees_Import_Template.xlsx"',
    );

    await workbook.xlsx.write(res);

    res.end();
  } catch (error) {
    return next(error);
  }
}

/*
|--------------------------------------------------------------------------
| EXPORT
|--------------------------------------------------------------------------
*/

async function exportTraineesExcel(req, res, next) {
  try {
    const params = [];

    const where = ["t.is_deleted = 0", "t.is_staff_exempt = 0"];

    if (req.query.search) {
      where.push(`
        (
          t.employee_id LIKE ?
          OR t.first_name LIKE ?
          OR t.last_name LIKE ?
          OR t.father_name LIKE ?
        )
      `);

      const searchValue = `%${req.query.search}%`;

      params.push(searchValue, searchValue, searchValue, searchValue);
    }

    if (req.query.course_id) {
      where.push("t.course_id = ?");

      params.push(req.query.course_id);
    }

    if (req.query.platoon_id) {
      where.push("t.platoon_id = ?");

      params.push(req.query.platoon_id);
    }

    if (req.query.status) {
      where.push("t.status = ?");

      params.push(req.query.status);
    }

    if (req.query.course_status === "ACTIVE") {
      where.push(`
        c.start_date IS NOT NULL
        AND c.end_date IS NOT NULL
        AND DATE(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+05:00'))
            BETWEEN c.start_date
            AND c.end_date
      `);
    }

    if (req.query.course_status === "UPCOMING") {
      where.push(`
        c.start_date IS NOT NULL
        AND c.end_date IS NOT NULL
        AND DATE(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+05:00')) < c.start_date
      `);
    }

    if (req.query.course_status === "COMPLETED") {
      where.push(`
        c.start_date IS NOT NULL
        AND c.end_date IS NOT NULL
        AND DATE(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+05:00')) > c.end_date
      `);
    }

    if (req.query.course_status === "DATE_NOT_SET") {
      where.push(`
        (
          c.start_date IS NULL
          OR c.end_date IS NULL
        )
      `);
    }

    const whereSql = `WHERE ${where.join(" AND ")}`;

    const [rows] = await pool.execute(
      `
          SELECT
            t.employee_id,
            t.belt_no,

            t.first_name,
            t.last_name,
            t.father_name,

            t.cnic,
            t.phone,
            t.email,
            t.address,

            c.course_name,
            p.platoon_number,

            c.start_date
              AS course_start_date,

            c.end_date
              AS course_end_date,

            CASE
              WHEN
                c.start_date IS NULL
                OR c.end_date IS NULL
                THEN 'DATE_NOT_SET'

              WHEN
                DATE(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+05:00')) < c.start_date
                THEN 'UPCOMING'

              WHEN
                DATE(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+05:00'))
                BETWEEN
                  c.start_date
                AND
                  c.end_date
                THEN 'ACTIVE'

              ELSE 'COMPLETED'
            END
              AS course_status,

            t.status
              AS operational_status,

            t.remarks,

            t.zkteco_synced

          FROM trainees t

          LEFT JOIN courses c
            ON c.id =
               t.course_id

          LEFT JOIN platoons p
            ON p.id =
               t.platoon_id

          ${whereSql}

          ORDER BY
            c.start_date DESC,

            c.course_name,

            CAST(
              p.platoon_number
              AS UNSIGNED
            ),

            t.employee_id
        `,
      params,
    );

    const workbook = new ExcelJS.Workbook();

    const worksheet = workbook.addWorksheet("Trainees");

    worksheet.columns = [
      {
        header: "Employee ID / Cap No.",

        key: "employee_id",

        width: 24,
      },

      {
        header: "Belt #",

        key: "belt_no",

        width: 16,
      },

      {
        header: "First Name",

        key: "first_name",

        width: 20,
      },

      {
        header: "Last Name",

        key: "last_name",

        width: 20,
      },

      {
        header: "Father Name",

        key: "father_name",

        width: 22,
      },

      {
        header: "CNIC",

        key: "cnic",

        width: 18,
      },

      {
        header: "Phone",

        key: "phone",

        width: 18,
      },

      {
        header: "Email",

        key: "email",

        width: 28,
      },

      {
        header: "Address",

        key: "address",

        width: 35,
      },

      {
        header: "Course",

        key: "course_name",

        width: 30,
      },

      {
        header: "Platoon",

        key: "platoon_number",

        width: 14,
      },

      {
        header: "Course Start Date",

        key: "course_start_date",

        width: 20,
      },

      {
        header: "Course End Date",

        key: "course_end_date",

        width: 20,
      },

      {
        header: "Course Status",

        key: "course_status",

        width: 18,
      },

      {
        header: "Operational Status",

        key: "operational_status",

        width: 20,
      },

      {
        header: "ZKBioTime",

        key: "zk_status",

        width: 22,
      },

      {
        header: "Remarks",

        key: "remarks",

        width: 35,
      },
    ];

    worksheet.getRow(1).font = {
      bold: true,
    };

    worksheet.views = [
      {
        state: "frozen",

        ySplit: 1,
      },
    ];

    for (const row of rows) {
      worksheet.addRow({
        ...row,

        zk_status: row.zkteco_synced
          ? "Synced / Current"
          : "Historical / Pending",
      });
    }

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );

    res.setHeader(
      "Content-Disposition",
      'attachment; filename="PTS_Trainees_Export.xlsx"',
    );

    await workbook.xlsx.write(res);

    res.end();
  } catch (error) {
    return next(error);
  }
}

/*
|--------------------------------------------------------------------------
| IMPORT EXCEL
|--------------------------------------------------------------------------
*/

async function importTraineesExcel(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,

        message: "Please select an Excel file.",
      });
    }

    const workbook = new ExcelJS.Workbook();

    await workbook.xlsx.load(req.file.buffer);

    const worksheet =
      workbook.getWorksheet("Trainees Import") || workbook.worksheets[0];

    if (!worksheet) {
      return res.status(400).json({
        success: false,

        message: "Excel worksheet not found.",
      });
    }

    const headerMap = buildHeaderMap(worksheet);

    const columns = {
      employeeId: getColumnIndex(headerMap, [
        "Employee ID / Cap No.",
        "Employee ID",
        "Cap No.",
      ]),

      beltNo: getColumnIndex(headerMap, ["Belt #", "Belt No", "Belt Number"]),

      firstName: getColumnIndex(headerMap, ["First Name"]),

      lastName: getColumnIndex(headerMap, ["Last Name"]),

      fatherName: getColumnIndex(headerMap, ["Father Name"]),

      cnic: getColumnIndex(headerMap, ["CNIC"]),

      phone: getColumnIndex(headerMap, ["Phone", "Mobile"]),

      email: getColumnIndex(headerMap, ["Email"]),

      address: getColumnIndex(headerMap, ["Address"]),

      course: getColumnIndex(headerMap, ["Course", "Course Name"]),

      platoon: getColumnIndex(headerMap, ["Platoon", "Platoon Number"]),

      status: getColumnIndex(headerMap, ["Status", "Operational Status"]),

      remarks: getColumnIndex(headerMap, ["Remarks"]),
    };

    if (!columns.employeeId) {
      return res.status(400).json({
        success: false,

        message: 'Excel must contain "Employee ID / Cap No." column.',
      });
    }

    if (!columns.course) {
      return res.status(400).json({
        success: false,

        message: 'Excel must contain "Course" column.',
      });
    }

    const created = [];

    const updated = [];

    const failed = [];

    let coursesCreated = 0;

    let platoonsCreated = 0;

    let lifecycleQueued = 0;

    let ptsOnly = 0;

    const validStatuses = [
      "ACTIVE",
      "ON_LEAVE",
      "OSD",
      "OUTDOOR",
      "TRAINING_DROP",
      "INACTIVE",
      "COMPLETED",
    ];

    for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
      const row = worksheet.getRow(rowNumber);

      const employeeId = cleanText(rowValue(row, columns.employeeId));

      if (!employeeId) {
        const hasAnyValue = row.values
          .slice(1)
          .some(
            (item) =>
              item !== null && item !== undefined && String(item).trim() !== "",
          );

        if (!hasAnyValue) {
          continue;
        }

        failed.push({
          row: rowNumber,

          reason: "Employee ID / Cap No. is required.",
        });

        continue;
      }

      try {
        const beltNo = cleanText(rowValue(row, columns.beltNo));

        const firstName = cleanText(rowValue(row, columns.firstName));

        const lastName = cleanText(rowValue(row, columns.lastName));

        const fatherName = cleanText(rowValue(row, columns.fatherName));

        const cnic = cleanText(rowValue(row, columns.cnic));

        const phone = cleanText(rowValue(row, columns.phone));

        const email = cleanText(rowValue(row, columns.email));

        const address = cleanText(rowValue(row, columns.address));

        const courseName = cleanText(rowValue(row, columns.course));

        const platoonNumber = cleanText(rowValue(row, columns.platoon));

        let traineeStatus =
          cleanText(rowValue(row, columns.status)) || "ACTIVE";

        traineeStatus = traineeStatus.toUpperCase();

        if (!validStatuses.includes(traineeStatus)) {
          traineeStatus = "ACTIVE";
        }

        const remarks = cleanText(rowValue(row, columns.remarks));

        if (!courseName) {
          throw new Error("Course is required.");
        }

        const courseResult = await resolveCourse({
          courseName,

          createIfMissing: true,
        });

        const course = courseResult.course;

        if (!course) {
          throw new Error("Course could not be resolved.");
        }

        if (courseResult.created) {
          coursesCreated += 1;
        }

        let platoonResult = {
          platoon: null,

          created: false,
        };

        if (platoonNumber) {
          platoonResult = await resolvePlatoon({
            courseId: course.id,

            platoonNumber,

            createIfMissing: true,
          });
        }

        const platoon = platoonResult.platoon;

        if (platoonResult.created) {
          platoonsCreated += 1;
        }

        /*
        |--------------------------------------------------------------------------
        | SAME EMPLOYEE + SAME COURSE = UPDATE
        |--------------------------------------------------------------------------
        */

        const existing = await findTraineeByCourseAndEmployee({
          courseId: course.id,

          employeeId,

          includeDeleted: true,
        });

        let traineeId;

        if (existing) {
          traineeId = existing.id;

          if (existing.is_deleted) {
            await restoreTrainee(traineeId);
          }

          await pool.query(
            `
              UPDATE trainees

              SET
                belt_no =
                  :beltNo,

                first_name =
                  :firstName,

                last_name =
                  :lastName,

                father_name =
                  :fatherName,

                cnic =
                  :cnic,

                phone =
                  :phone,

                email =
                  :email,

                address =
                  :address,

                course_id =
                  :courseId,

                platoon_id =
                  :platoonId,

                training_start_date =
                  :courseStartDate,

                training_end_date =
                  :courseEndDate,

                status =
                  :status,

                remarks =
                  :remarks,

                is_deleted = 0,

                is_staff_exempt = 0,

                deleted_at = NULL,

                deleted_by = NULL

              WHERE
                id =
                :traineeId
            `,
            {
              traineeId,

              beltNo,

              firstName,
              lastName,
              fatherName,

              cnic,
              phone,
              email,
              address,

              courseId: course.id,

              platoonId: platoon?.id || null,

              courseStartDate: dateOnly(course.start_date),

              courseEndDate: dateOnly(course.end_date),

              status: traineeStatus,

              remarks,
            },
          );

          updated.push({
            row: rowNumber,

            employee_id: employeeId,

            course: course.course_name,

            course_status: getCourseStatus(course),
          });
        } else {
          const [result] = await pool.query(
            `
                INSERT INTO trainees
                (
                  employee_id,
                  belt_no,

                  first_name,
                  last_name,
                  father_name,

                  cnic,
                  phone,
                  email,
                  address,

                  course_id,
                  platoon_id,

                  training_start_date,
                  training_end_date,

                  status,
                  remarks,

                  is_staff_exempt
                )

                VALUES
                (
                  :employeeId,
                  :beltNo,

                  :firstName,
                  :lastName,
                  :fatherName,

                  :cnic,
                  :phone,
                  :email,
                  :address,

                  :courseId,
                  :platoonId,

                  :courseStartDate,
                  :courseEndDate,

                  :status,
                  :remarks,

                  0
                )
              `,
            {
              employeeId,
              beltNo,

              firstName,
              lastName,
              fatherName,

              cnic,
              phone,
              email,
              address,

              courseId: course.id,

              platoonId: platoon?.id || null,

              courseStartDate: dateOnly(course.start_date),

              courseEndDate: dateOnly(course.end_date),

              status: traineeStatus,

              remarks,
            },
          );

          traineeId = result.insertId;

          created.push({
            row: rowNumber,

            trainee_id: traineeId,

            employee_id: employeeId,

            course: course.course_name,

            course_status: getCourseStatus(course),
          });
        }

        const trainee = await getTraineeById(traineeId);

        const zkResult = await syncTraineeToZkWithRetry({
          trainee,

          course,

          platoon,

          attempts: 3,

          queueOnly: true,
        });

        if (zkResult.status === "LIFECYCLE_QUEUED") {
          lifecycleQueued += 1;
        } else {
          ptsOnly += 1;
        }
      } catch (rowError) {
        failed.push({
          row: rowNumber,

          employee_id: employeeId,

          reason:
            rowError.code === "ER_DUP_ENTRY"
              ? duplicateErrorMessage(rowError)
              : rowError.message,
        });
      }
    }

    await logBulkAudit(req, {
      action: "IMPORT",

      module: "TRAINEE",

      description: `Trainee Excel import completed from ${req.file?.originalname || "uploaded file"}.`,

      summary: {
        file_name: req.file?.originalname || null,

        total_rows: created.length + updated.length + failed.length,

        created: created.length,

        updated: updated.length,

        courses_created: coursesCreated,

        platoons_created: platoonsCreated,

        lifecycle_queued: lifecycleQueued,

        pts_only: ptsOnly,

        failed: failed.length,
      },
    });

    return res.json({
      success: true,

      message: "Excel import completed.",

      data: {
        total_rows: created.length + updated.length + failed.length,

        created: created.length,

        updated: updated.length,

        courses_created: coursesCreated,

        platoons_created: platoonsCreated,

        lifecycle_queued: lifecycleQueued,

        pts_only: ptsOnly,

        failed: failed.length,

        failed_rows: failed,
      },
    });
  } catch (error) {
    return next(error);
  }
}

/*
|--------------------------------------------------------------------------
| DELETE
|--------------------------------------------------------------------------
|
| This is an explicit user-requested Trainee deletion action.
|
| It is different from automatic Course completion.
|--------------------------------------------------------------------------
*/

async function deleteTraineeRecord(req, res, next) {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({
        success: false,

        message: "Invalid trainee ID.",
      });
    }

    const trainee = await getTraineeDeleteInfo(id);

    if (!trainee || trainee.is_deleted) {
      return res.status(404).json({
        success: false,

        message: "Trainee not found.",
      });
    }

    const existingDetails = await getTraineeById(id);

    const current = await getCurrentTraineeByEmployeeId(trainee.employee_id);

    const isCurrentOwner =
      current &&
      Number(current.id) === Number(trainee.id) &&
      Boolean(
        trainee.zkteco_emp_id ||
        trainee.zkteco_emp_code ||
        trainee.zkteco_synced,
      );

    let zkDelete = {
      status: "SKIPPED_HISTORICAL",
    };

    if (isCurrentOwner) {
      try {
        const result = await deleteZkEmployeeByCode(
          trainee.employee_id,
          {
            zktecoEmpId:
              trainee.zkteco_emp_id ||
              null,
          }
        );

        zkDelete = {
          status: "SYNCED",

          action: result.action,

          zkteco_employee_id: result.employee_id || null,
        };
      } catch (syncError) {
        return res.status(502).json({
          success: false,

          message:
            "ZKBioTime employee delete failed. PTS Trainee record was not deleted.",

          error: syncError.message,
        });
      }
    }

    const deleted = await softDeleteTrainee(id, req.user?.id || null);

    if (!deleted) {
      return res.status(400).json({
        success: false,

        message: "Trainee could not be deleted.",
      });
    }

    const oldAuditState = buildTraineeAuditState(existingDetails || trainee);

    await logRequestAudit(req, {
      action: "DELETE",

      module: "TRAINEE",

      recordId: id,

      description: isCurrentOwner
        ? `Trainee ${trainee.employee_id} deleted from PTS and current ZKBioTime identity removed.`
        : `Historical trainee ${trainee.employee_id} deleted. Current ZKBioTime identity preserved.`,

      oldData: oldAuditState,

      newData: {
        ...oldAuditState,

        is_deleted: true,
      },
    });

    return res.json({
      success: true,

      message: isCurrentOwner
        ? "Trainee deleted from PTS and ZKBioTime."
        : "Historical trainee deleted. Current ZKBioTime identity preserved.",

      zkbiotime: zkDelete,
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  listTrainees,

  getTrainee,

  addTrainee,

  editTrainee,

  deleteTraineeRecord,

  downloadImportTemplate,

  exportTraineesExcel,

  importTraineesExcel,
};
