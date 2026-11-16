const {
  pool,
} = require("../config/db");

const {
  getEmployees,
  deleteEmployee,
  deleteDepartment,
  deletePosition,
} = require(
  "../integrations/zkbiotime/client"
);

const {
  deleteZkEmployeeByCode,
} = require(
  "../integrations/zkbiotime/employeeWrite.service"
);

/*
|--------------------------------------------------------------------------
| HELPERS
|--------------------------------------------------------------------------
*/

function normalizeIds(
  ids
) {
  if (
    !Array.isArray(
      ids
    )
  ) {
    return [];
  }

  return [
    ...new Set(
      ids
        .map(Number)
        .filter(
          (id) =>
            Number.isInteger(
              id
            ) &&
            id > 0
        )
    ),
  ];
}

function extractResults(
  data
) {
  if (!data) {
    return [];
  }

  if (
    Array.isArray(
      data
    )
  ) {
    return data;
  }

  if (
    Array.isArray(
      data.data
    )
  ) {
    return data.data;
  }

  if (
    Array.isArray(
      data.results
    )
  ) {
    return data.results;
  }

  return [];
}


/*
|--------------------------------------------------------------------------
| ZK NOT FOUND HELPER
|--------------------------------------------------------------------------
|
| Portal mappings can legitimately become stale when a Department / Position
| / Employee was removed directly in ZKBioTime. A 404 therefore means the
| external master is already absent and must NOT block local permanent delete.
|--------------------------------------------------------------------------
*/

function isZkNotFoundError(
  error
) {
  const message =
    String(
      error?.message ||
      ""
    );

  return (
    /\bHTTP\s*404\b/i.test(
      message
    ) ||
    /"detail"\s*:\s*"Not found\.?"/i.test(
      message
    ) ||
    /\bnot found\b/i.test(
      message
    )
  );
}

/*
|--------------------------------------------------------------------------
| FIND OTHER PORTAL IDENTITY
|--------------------------------------------------------------------------
|
| Same Employee ID multiple courses mein aa sakti hai.
|
| Agar same emp_code kisi aur Trainee record ya Staff record mein
| available hai to ZKBioTime employee aur raw punches delete nahi karne.
|--------------------------------------------------------------------------
*/

async function hasOtherPortalIdentity({
  employeeId,
  excludeTraineeId = null,
  excludeStaffId = null,
}) {
  const code =
    String(
      employeeId ||
        ""
    ).trim();

  if (!code) {
    return false;
  }

  const [
    traineeResult,
    staffResult,
  ] =
    await Promise.all([
      pool.query(
        `
          SELECT
            id

          FROM trainees

          WHERE
            TRIM(
              employee_id
            ) = ?

            AND (
              ? IS NULL
              OR id <> ?
            )

          LIMIT 1
        `,
        [
          code,
          excludeTraineeId,
          excludeTraineeId,
        ]
      ),

      pool.query(
        `
          SELECT
            id

          FROM staff

          WHERE
            TRIM(
              employee_id
            ) = ?

            AND (
              ? IS NULL
              OR id <> ?
            )

          LIMIT 1
        `,
        [
          code,
          excludeStaffId,
          excludeStaffId,
        ]
      ),
    ]);

  return (
    traineeResult[0].length >
      0 ||
    staffResult[0].length >
      0
  );
}

/*
|--------------------------------------------------------------------------
| FIND ZK EMPLOYEE
|--------------------------------------------------------------------------
*/

async function findZkEmployee({
  zktecoEmpId,
  employeeId,
  zktecoEmpCode,
}) {
  /*
  |--------------------------------------------------------------------------
  | Stored numeric ZK ID preferred
  |--------------------------------------------------------------------------
  */

  if (
    zktecoEmpId
  ) {
    return {
      id:
        Number(
          zktecoEmpId
        ),

      source:
        "LOCAL_ZK_ID",
    };
  }

  const code =
    String(
      zktecoEmpCode ||
        employeeId ||
        ""
    ).trim();

  if (!code) {
    return null;
  }

  const response =
    await getEmployees({
      emp_code:
        code,

      page_size:
        100,
    });

  const rows =
    extractResults(
      response
    );

  const exact =
    rows.find(
      (item) =>
        String(
          item.emp_code ||
            ""
        ).trim() ===
        code
    );

  if (!exact) {
    return null;
  }

  const id =
    exact.id ||
    exact.emp ||
    exact.pk;

  if (!id) {
    return null;
  }

  return {
    id:
      Number(
        id
      ),

    source:
      "ZK_LOOKUP",
  };
}

/*
|--------------------------------------------------------------------------
| DELETE ZK PERSON
|--------------------------------------------------------------------------
*/

async function deleteZkPerson(
  person
) {
  const code =
    String(
      person.employee_id ||
        person.zkteco_emp_code ||
        ""
    ).trim();

  const result =
    await deleteZkEmployeeByCode(
      code,
      {
        zktecoEmpId:
          person.zkteco_emp_id ||
          null,
      }
    );

  return {
    deleted:
      result.action ===
      "DELETED",

    alreadyMissing:
      result.action ===
      "ALREADY_MISSING",

    zkEmployeeId:
      result.employee_id ||
      null,
  };
}


/*
|--------------------------------------------------------------------------
| SAFE ZK POSITION DELETE
|--------------------------------------------------------------------------
|
| Platoon Position ZKBioTime mein doosre Course ke Platoon ke sath
| shared ho sakti hai.
|
| Jab tak doosra Platoon same ZK Position ID use karta ho,
| position delete nahi hogi.
|--------------------------------------------------------------------------
*/

async function deletePositionIfUnused({
  positionId,
  excludePlatoonId = null,
  excludeCourseId = null,
  excludeStaffBranchId = null,
}) {
  if (!positionId) {
    return {
      deleted: false,
      skipped: true,
      reason: "NO_POSITION_ID",
    };
  }

  const platoonConditions = [
    "zkbiotime_position_id = ?",
  ];
  const platoonParams = [
    positionId,
  ];

  if (excludePlatoonId) {
    platoonConditions.push(
      "id <> ?"
    );
    platoonParams.push(
      excludePlatoonId
    );
  }

  if (excludeCourseId) {
    platoonConditions.push(
      "course_id <> ?"
    );
    platoonParams.push(
      excludeCourseId
    );
  }

  const branchConditions = [
    "zkbiotime_position_id = ?",
  ];
  const branchParams = [
    positionId,
  ];

  if (excludeStaffBranchId) {
    branchConditions.push(
      "id <> ?"
    );
    branchParams.push(
      excludeStaffBranchId
    );
  }

  const [
    platoonResult,
    branchResult,
  ] = await Promise.all([
    pool.query(
      `
        SELECT id
        FROM platoons
        WHERE ${platoonConditions.join(
          " AND "
        )}
        LIMIT 1
      `,
      platoonParams
    ),
    pool.query(
      `
        SELECT id
        FROM staff_branches
        WHERE ${branchConditions.join(
          " AND "
        )}
        LIMIT 1
      `,
      branchParams
    ),
  ]);

  if (
    platoonResult[0].length > 0 ||
    branchResult[0].length > 0
  ) {
    return {
      deleted: false,
      skipped: true,
      reason:
        "POSITION_STILL_IN_USE",
    };
  }

  try {
    await deletePosition(
      positionId
    );

    return {
      deleted: true,
      alreadyMissing: false,
      skipped: false,
      reason: null,
    };
  } catch (error) {
    if (
      isZkNotFoundError(
        error
      )
    ) {
      return {
        deleted: false,
        alreadyMissing: true,
        skipped: false,
        reason:
          "POSITION_ALREADY_MISSING_IN_ZK",
      };
    }

    throw error;
  }
}

/*
|--------------------------------------------------------------------------
| SAFE ZK DEPARTMENT DELETE
|--------------------------------------------------------------------------
|
| A ZKBioTime Department may be referenced by either a Trainee Course or a
| Staff Category.  Never remove the ZK master while another Portal master
| still owns the same mapping.
|--------------------------------------------------------------------------
*/

async function deleteDepartmentIfUnused({
  departmentId,
  excludeCourseId = null,
  excludeStaffCategoryId = null,
}) {
  if (!departmentId) {
    return {
      deleted: false,
      skipped: true,
      reason:
        "NO_DEPARTMENT_ID",
    };
  }

  const courseConditions = [
    "zkbiotime_department_id = ?",
  ];
  const courseParams = [
    departmentId,
  ];

  if (excludeCourseId) {
    courseConditions.push(
      "id <> ?"
    );
    courseParams.push(
      excludeCourseId
    );
  }

  const categoryConditions = [
    "zkbiotime_department_id = ?",
  ];
  const categoryParams = [
    departmentId,
  ];

  if (excludeStaffCategoryId) {
    categoryConditions.push(
      "id <> ?"
    );
    categoryParams.push(
      excludeStaffCategoryId
    );
  }

  const [
    courseResult,
    categoryResult,
  ] = await Promise.all([
    pool.query(
      `
        SELECT id
        FROM courses
        WHERE ${courseConditions.join(
          " AND "
        )}
        LIMIT 1
      `,
      courseParams
    ),
    pool.query(
      `
        SELECT id
        FROM staff_categories
        WHERE ${categoryConditions.join(
          " AND "
        )}
        LIMIT 1
      `,
      categoryParams
    ),
  ]);

  if (
    courseResult[0].length > 0 ||
    categoryResult[0].length > 0
  ) {
    return {
      deleted: false,
      skipped: true,
      reason:
        "DEPARTMENT_STILL_IN_USE",
    };
  }

  try {
    await deleteDepartment(
      departmentId
    );

    return {
      deleted: true,
      alreadyMissing: false,
      skipped: false,
      reason: null,
    };
  } catch (error) {
    if (
      isZkNotFoundError(
        error
      )
    ) {
      return {
        deleted: false,
        alreadyMissing: true,
        skipped: false,
        reason:
          "DEPARTMENT_ALREADY_MISSING_IN_ZK",
      };
    }

    throw error;
  }
}

/*
|--------------------------------------------------------------------------
| DELETE TRAINEE LOCAL DATA
|--------------------------------------------------------------------------
*/

async function deleteTraineeLocal({
  trainee,
  deleteRawTransactions,
  allowRawTransactionDelete,
  userId,
}) {
  const connection =
    await pool.getConnection();

  try {
    await connection.beginTransaction();

    /*
    |--------------------------------------------------------------------------
    | Attendance
    |--------------------------------------------------------------------------
    */

    await connection.query(
      `
        DELETE FROM attendance_records

        WHERE
          subject_type =
            'TRAINEE'

          AND subject_id = ?
      `,
      [
        trainee.id,
      ]
    );

    /*
    |--------------------------------------------------------------------------
    | CONTINUOUS ABSENCE
    |--------------------------------------------------------------------------
    |
    | absence_episode_sessions has ON DELETE CASCADE on episode_id, so deleting
    | the trainee's episode also removes all attached missed-session rows.
    | This prevents a permanently deleted trainee from reappearing later as an
    | OPEN absence / synthetic "No Course" Dashboard row.
    |
    |--------------------------------------------------------------------------
    */

    await connection.query(
      `
        DELETE FROM absence_episodes

        WHERE
          subject_type =
            'TRAINEE'

          AND subject_id = ?
      `,
      [
        trainee.id,
      ]
    );

    /*
    |--------------------------------------------------------------------------
    | Leave
    |--------------------------------------------------------------------------
    */

    await connection.query(
      `
        DELETE FROM trainee_leaves

        WHERE trainee_id = ?
      `,
      [
        trainee.id,
      ]
    );

    /*
    |--------------------------------------------------------------------------
    | OSD
    |--------------------------------------------------------------------------
    */

    await connection.query(
      `
        DELETE FROM trainee_osd

        WHERE trainee_id = ?
      `,
      [
        trainee.id,
      ]
    );

    /*
    |--------------------------------------------------------------------------
    | Outdoor
    |--------------------------------------------------------------------------
    */

    await connection.query(
      `
        DELETE FROM trainee_outdoor

        WHERE trainee_id = ?
      `,
      [
        trainee.id,
      ]
    );

    /*
    |--------------------------------------------------------------------------
    | Manual Absence
    |--------------------------------------------------------------------------
    */

    await connection.query(
      `
        DELETE FROM trainee_manual_absence

        WHERE trainee_id = ?
      `,
      [
        trainee.id,
      ]
    );

    /*
    |--------------------------------------------------------------------------
    | Training Drop
    |--------------------------------------------------------------------------
    */

    await connection.query(
      `
        DELETE FROM trainee_training_drop

        WHERE trainee_id = ?
      `,
      [
        trainee.id,
      ]
    );

    /*
    |--------------------------------------------------------------------------
    | RAW BIOMETRIC
    |--------------------------------------------------------------------------
    |
    | User checkbox tick kar sakta hai,
    | lekin same Employee ID ki doosri portal identity ho to raw data
    | protect rahega.
    |--------------------------------------------------------------------------
    */

    let rawTransactionsDeleted =
      false;

    if (
      deleteRawTransactions &&
      allowRawTransactionDelete &&
      trainee.employee_id
    ) {
      await connection.query(
        `
          DELETE FROM zkteco_transactions

          WHERE TRIM(
            emp_code
          ) = ?
        `,
        [
          String(
            trainee.employee_id
          ).trim(),
        ]
      );

      rawTransactionsDeleted =
        true;
    }

    /*
    |--------------------------------------------------------------------------
    | PERMANENT TRAINEE DELETE
    |--------------------------------------------------------------------------
    */

    await connection.query(
      `
        DELETE FROM trainees

        WHERE id = ?
      `,
      [
        trainee.id,
      ]
    );

    /*
    |--------------------------------------------------------------------------
    | AUDIT
    |--------------------------------------------------------------------------
    */

    await connection.query(
      `
        INSERT INTO audit_logs
        (
          user_id,
          action,
          module,
          record_id,
          description,
          old_data,
          new_data,
          ip_address
        )

        VALUES
        (
          ?,
          'PERMANENT_DELETE',
          'DATA_MANAGEMENT',
          ?,
          ?,
          ?,
          ?,
          NULL
        )
      `,
      [
        userId ||
          null,

        String(
          trainee.id
        ),

        `Trainee ${trainee.employee_id} / Course ${trainee.course_id || "-"} permanently deleted.`,

        JSON.stringify(
          trainee
        ),

        JSON.stringify({
          raw_transactions_deleted:
            rawTransactionsDeleted,
        }),
      ]
    );

    await connection.commit();

    return {
      success:
        true,

      rawTransactionsDeleted,
    };
  } catch (
    error
  ) {
    await connection.rollback();

    throw error;
  } finally {
    connection.release();
  }
}

/*
|--------------------------------------------------------------------------
| DELETE STAFF LOCAL
|--------------------------------------------------------------------------
*/

async function deleteStaffLocal({
  staff,
  deleteRawTransactions,
  allowRawTransactionDelete,
  userId,
}) {
  const connection =
    await pool.getConnection();

  try {
    await connection.beginTransaction();

    await connection.query(
      `
        DELETE FROM attendance_records

        WHERE
          subject_type =
            'STAFF'

          AND subject_id = ?
      `,
      [
        staff.id,
      ]
    );

    /*
    |--------------------------------------------------------------------------
    | CONTINUOUS ABSENCE
    |--------------------------------------------------------------------------
    | absence_episode_sessions are removed automatically by ON DELETE CASCADE.
    |--------------------------------------------------------------------------
    */

    await connection.query(
      `
        DELETE FROM absence_episodes

        WHERE
          subject_type =
            'STAFF'

          AND subject_id = ?
      `,
      [
        staff.id,
      ]
    );

    await connection.query(
      `
        DELETE FROM staff_leaves

        WHERE staff_id = ?
      `,
      [
        staff.id,
      ]
    );

    await connection.query(
      `
        DELETE FROM staff_osd

        WHERE staff_id = ?
      `,
      [
        staff.id,
      ]
    );

    await connection.query(
      `
        DELETE FROM staff_outdoor

        WHERE staff_id = ?
      `,
      [
        staff.id,
      ]
    );

    await connection.query(
      `
        DELETE FROM staff_manual_absence

        WHERE staff_id = ?
      `,
      [
        staff.id,
      ]
    );

    let rawTransactionsDeleted =
      false;

    if (
      deleteRawTransactions &&
      allowRawTransactionDelete &&
      staff.employee_id
    ) {
      await connection.query(
        `
          DELETE FROM zkteco_transactions

          WHERE TRIM(
            emp_code
          ) = ?
        `,
        [
          String(
            staff.employee_id
          ).trim(),
        ]
      );

      rawTransactionsDeleted =
        true;
    }

    await connection.query(
      `
        DELETE FROM staff

        WHERE id = ?
      `,
      [
        staff.id,
      ]
    );

    await connection.query(
      `
        INSERT INTO audit_logs
        (
          user_id,
          action,
          module,
          record_id,
          description,
          old_data,
          new_data
        )

        VALUES
        (
          ?,
          'PERMANENT_DELETE',
          'DATA_MANAGEMENT',
          ?,
          ?,
          ?,
          ?
        )
      `,
      [
        userId ||
          null,

        String(
          staff.id
        ),

        `Staff ${staff.employee_id} permanently deleted.`,

        JSON.stringify(
          staff
        ),

        JSON.stringify({
          raw_transactions_deleted:
            rawTransactionsDeleted,
        }),
      ]
    );

    await connection.commit();

    return {
      success:
        true,

      rawTransactionsDeleted,
    };
  } catch (
    error
  ) {
    await connection.rollback();

    throw error;
  } finally {
    connection.release();
  }
}

/*
|--------------------------------------------------------------------------
| DELETE ONE TRAINEE
|--------------------------------------------------------------------------
*/

async function permanentlyDeleteTrainee({
  traineeId,
  deleteRawTransactions = false,
  userId = null,
}) {
  const [
    rows,
  ] =
    await pool.query(
      `
        SELECT
          id,

          employee_id,

          first_name,
          last_name,

          course_id,
          platoon_id,

          zkteco_emp_id,
          zkteco_emp_code,
          zkteco_synced

        FROM trainees

        WHERE id = ?

        LIMIT 1
      `,
      [
        traineeId,
      ]
    );

  const trainee =
    rows[0];

  if (!trainee) {
    return {
      id:
        traineeId,

      success:
        false,

      error:
        "Trainee not found.",
    };
  }

  try {
    /*
    |--------------------------------------------------------------------------
    | Does same Employee ID still exist elsewhere?
    |--------------------------------------------------------------------------
    */

    const otherIdentityExists =
      await hasOtherPortalIdentity({
        employeeId:
          trainee.employee_id,

        excludeTraineeId:
          trainee.id,
      });

    /*
    |--------------------------------------------------------------------------
    | ZKBioTime
    |--------------------------------------------------------------------------
    |
    | Historical course delete:
    | ZK employee MUST stay.
    |--------------------------------------------------------------------------
    */

    let zkResult = {
      deleted:
        false,

      alreadyMissing:
        false,

      skipped:
        false,

      reason:
        null,
    };

    if (
      otherIdentityExists
    ) {
      zkResult = {
        deleted:
          false,

        alreadyMissing:
          false,

        skipped:
          true,

        reason:
          "EMPLOYEE_ID_USED_BY_ANOTHER_PORTAL_RECORD",
      };
    } else {
      zkResult =
        await deleteZkPerson(
          trainee
        );
    }

    /*
    |--------------------------------------------------------------------------
    | RAW TRANSACTIONS
    |--------------------------------------------------------------------------
    */

    const allowRawTransactionDelete =
      !otherIdentityExists;

    const localResult =
      await deleteTraineeLocal({
        trainee,

        deleteRawTransactions,

        allowRawTransactionDelete,

        userId,
      });

    return {
      id:
        trainee.id,

      employee_id:
        trainee.employee_id,

      success:
        true,

      zk_deleted:
        Boolean(
          zkResult.deleted
        ),

      zk_already_missing:
        Boolean(
          zkResult.alreadyMissing
        ),

      zk_skipped:
        Boolean(
          zkResult.skipped
        ),

      zk_skip_reason:
        zkResult.reason ||
        null,

      raw_transactions_deleted:
        Boolean(
          localResult.rawTransactionsDeleted
        ),

      raw_transactions_protected:
        Boolean(
          deleteRawTransactions &&
          !allowRawTransactionDelete
        ),
    };
  } catch (
    error
  ) {
    return {
      id:
        trainee.id,

      employee_id:
        trainee.employee_id,

      success:
        false,

      error:
        error.message,
    };
  }
}

/*
|--------------------------------------------------------------------------
| DELETE ONE STAFF
|--------------------------------------------------------------------------
*/

async function permanentlyDeleteStaff({
  staffId,
  deleteRawTransactions = false,
  userId = null,
}) {
  const [
    rows,
  ] =
    await pool.query(
      `
        SELECT
          id,

          employee_id,

          first_name,
          last_name,

          category_id,
          branch_id,

          source_zk_department_id,

          zkteco_emp_id,
          zkteco_emp_code,
          zkteco_synced

        FROM staff

        WHERE id = ?

        LIMIT 1
      `,
      [
        staffId,
      ]
    );

  const staff =
    rows[0];

  if (!staff) {
    return {
      id:
        staffId,

      success:
        false,

      error:
        "Staff member not found.",
    };
  }

  try {
    const otherIdentityExists =
      await hasOtherPortalIdentity({
        employeeId:
          staff.employee_id,

        excludeStaffId:
          staff.id,
      });

    let zkResult;

    if (
      otherIdentityExists
    ) {
      zkResult = {
        deleted:
          false,

        alreadyMissing:
          false,

        skipped:
          true,

        reason:
          "EMPLOYEE_ID_USED_BY_ANOTHER_PORTAL_RECORD",
      };
    } else {
      zkResult =
        await deleteZkPerson(
          staff
        );
    }

    const localResult =
      await deleteStaffLocal({
        staff,

        deleteRawTransactions,

        allowRawTransactionDelete:
          !otherIdentityExists,

        userId,
      });

    return {
      id:
        staff.id,

      employee_id:
        staff.employee_id,

      success:
        true,

      zk_deleted:
        Boolean(
          zkResult.deleted
        ),

      zk_already_missing:
        Boolean(
          zkResult.alreadyMissing
        ),

      zk_skipped:
        Boolean(
          zkResult.skipped
        ),

      zk_skip_reason:
        zkResult.reason ||
        null,

      raw_transactions_deleted:
        Boolean(
          localResult.rawTransactionsDeleted
        ),

      raw_transactions_protected:
        Boolean(
          deleteRawTransactions &&
          otherIdentityExists
        ),
    };
  } catch (
    error
  ) {
    return {
      id:
        staff.id,

      employee_id:
        staff.employee_id,

      success:
        false,

      error:
        error.message,
    };
  }
}

/*
|--------------------------------------------------------------------------
| BULK TRAINEES
|--------------------------------------------------------------------------
*/

async function bulkDeleteTrainees({
  ids,
  deleteRawTransactions = false,
  userId = null,
}) {
  const cleanIds =
    normalizeIds(
      ids
    );

  const results =
    [];

  for (
    const traineeId
    of cleanIds
  ) {
    const result =
      await permanentlyDeleteTrainee({
        traineeId,

        deleteRawTransactions,

        userId,
      });

    results.push(
      result
    );
  }

  return buildSummary(
    cleanIds,
    results
  );
}

/*
|--------------------------------------------------------------------------
| BULK STAFF
|--------------------------------------------------------------------------
*/

async function bulkDeleteStaff({
  ids,
  deleteRawTransactions = false,
  userId = null,
}) {
  const cleanIds =
    normalizeIds(
      ids
    );

  const results =
    [];

  for (
    const staffId
    of cleanIds
  ) {
    const result =
      await permanentlyDeleteStaff({
        staffId,

        deleteRawTransactions,

        userId,
      });

    results.push(
      result
    );
  }

  return buildSummary(
    cleanIds,
    results
  );
}

/*
|--------------------------------------------------------------------------
| SUMMARY
|--------------------------------------------------------------------------
*/

function buildSummary(
  ids,
  results
) {
  const successful =
    results.filter(
      (item) =>
        item.success
    );

  const failed =
    results.filter(
      (item) =>
        !item.success
    );

  return {
    selected:
      ids.length,

    deleted:
      successful.length,

    failed:
      failed.length,

    zk_deleted:
      successful.filter(
        (item) =>
          item.zk_deleted
      ).length,

    zk_already_missing:
      successful.filter(
        (item) =>
          item.zk_already_missing
      ).length,

    zk_protected:
      successful.filter(
        (item) =>
          item.zk_skipped
      ).length,

    raw_transactions_deleted:
      successful.filter(
        (item) =>
          item.raw_transactions_deleted
      ).length,

    raw_transactions_protected:
      successful.filter(
        (item) =>
          item.raw_transactions_protected
      ).length,

    results,
  };
}

/*
|--------------------------------------------------------------------------
| DELETE PLATOON
|--------------------------------------------------------------------------
*/

async function permanentlyDeletePlatoon({
  platoonId,
  deleteTrainees = false,
  deleteRawTransactions = false,
  userId = null,
}) {
  const [
    rows,
  ] =
    await pool.query(
      `
        SELECT
          id,

          course_id,

          platoon_number,
          platoon_name,

          zkbiotime_position_id,
          zkbiotime_position_code

        FROM platoons

        WHERE id = ?

        LIMIT 1
      `,
      [
        platoonId,
      ]
    );

  const platoon =
    rows[0];

  if (!platoon) {
    throw new Error(
      "Platoon not found."
    );
  }

  const [
    traineeRows,
  ] =
    await pool.query(
      `
        SELECT id

        FROM trainees

        WHERE platoon_id = ?
      `,
      [
        platoonId,
      ]
    );

  if (
    traineeRows.length >
      0 &&
    !deleteTrainees
  ) {
    throw new Error(
      `Platoon contains ${traineeRows.length} trainees. Use Delete Platoon + Trainees.`
    );
  }

  let traineeResult =
    null;

  if (
    traineeRows.length >
    0
  ) {
    traineeResult =
      await bulkDeleteTrainees({
        ids:
          traineeRows.map(
            (item) =>
              item.id
          ),

        deleteRawTransactions,

        userId,
      });

    if (
      traineeResult.failed >
      0
    ) {
      throw new Error(
        `${traineeResult.failed} trainee(s) could not be permanently deleted. Platoon deletion stopped.`
      );
    }
  }

  /*
  |--------------------------------------------------------------------------
  | ZK Position only if not shared
  |--------------------------------------------------------------------------
  */

  let zkPosition = {
    deleted:
      false,

    skipped:
      true,
  };

  if (
    platoon.zkbiotime_position_id
  ) {
    zkPosition =
      await deletePositionIfUnused({
        positionId:
          platoon.zkbiotime_position_id,

        excludePlatoonId:
          platoon.id,
      });
  }

  await pool.query(
    `
      DELETE FROM platoons

      WHERE id = ?
    `,
    [
      platoonId,
    ]
  );

  return {
    platoon_id:
      platoonId,

    platoon_number:
      platoon.platoon_number,

    trainees:
      traineeResult,

    zk_position:
      zkPosition,

    success:
      true,
  };
}

/*
|--------------------------------------------------------------------------
| DELETE COURSE
|--------------------------------------------------------------------------
*/

async function permanentlyDeleteCourse({
  courseId,
  deleteTrainees = false,
  deleteRawTransactions = false,
  userId = null,
}) {
  const [
    rows,
  ] =
    await pool.query(
      `
        SELECT
          id,

          course_name,
          course_code,

          zkbiotime_department_id,
          zkbiotime_dept_code

        FROM courses

        WHERE id = ?

        LIMIT 1
      `,
      [
        courseId,
      ]
    );

  const course =
    rows[0];

  if (!course) {
    throw new Error(
      "Course not found."
    );
  }

  const [
    traineeRows,
  ] =
    await pool.query(
      `
        SELECT id

        FROM trainees

        WHERE course_id = ?
      `,
      [
        courseId,
      ]
    );

  if (
    traineeRows.length >
      0 &&
    !deleteTrainees
  ) {
    throw new Error(
      `Course contains ${traineeRows.length} trainees. Use Delete Course + All Trainees.`
    );
  }

  let traineeResult =
    null;

  if (
    traineeRows.length >
    0
  ) {
    traineeResult =
      await bulkDeleteTrainees({
        ids:
          traineeRows.map(
            (item) =>
              item.id
          ),

        deleteRawTransactions,

        userId,
      });

    if (
      traineeResult.failed >
      0
    ) {
      throw new Error(
        `${traineeResult.failed} trainee(s) could not be permanently deleted. Course deletion stopped.`
      );
    }
  }

  /*
  |--------------------------------------------------------------------------
  | FETCH PLATOONS
  |--------------------------------------------------------------------------
  */

  const [
    platoons,
  ] =
    await pool.query(
      `
        SELECT
          id,
          zkbiotime_position_id

        FROM platoons

        WHERE course_id = ?
      `,
      [
        courseId,
      ]
    );

  /*
  |--------------------------------------------------------------------------
  | SAFE ZK POSITION DELETE
  |--------------------------------------------------------------------------
  */

  const deletedPositionIds =
    new Set();

  for (
    const platoon
    of platoons
  ) {
    if (
      !platoon.zkbiotime_position_id
    ) {
      continue;
    }

    if (
      deletedPositionIds.has(
        Number(
          platoon.zkbiotime_position_id
        )
      )
    ) {
      continue;
    }

    const result =
      await deletePositionIfUnused({
        positionId:
          platoon.zkbiotime_position_id,

        excludeCourseId:
          courseId,
      });

    if (
      result.deleted
    ) {
      deletedPositionIds.add(
        Number(
          platoon.zkbiotime_position_id
        )
      );
    }
  }

  /*
  |--------------------------------------------------------------------------
  | SAFE ZK DEPARTMENT DELETE
  |--------------------------------------------------------------------------
  */

  let departmentResult = {
    deleted:
      false,

    skipped:
      true,
  };

  if (
    course.zkbiotime_department_id
  ) {
    departmentResult =
      await deleteDepartmentIfUnused({
        departmentId:
          course.zkbiotime_department_id,

        excludeCourseId:
          courseId,
      });
  }

  /*
  |--------------------------------------------------------------------------
  | LOCAL COURSE DELETE
  |--------------------------------------------------------------------------
  */

  const connection =
    await pool.getConnection();

  try {
    await connection.beginTransaction();

    await connection.query(
      `
        DELETE FROM timetable_course_assignments

        WHERE course_id = ?
      `,
      [
        courseId,
      ]
    );

    await connection.query(
      `
        DELETE FROM platoons

        WHERE course_id = ?
      `,
      [
        courseId,
      ]
    );

    await connection.query(
      `
        DELETE FROM courses

        WHERE id = ?
      `,
      [
        courseId,
      ]
    );

    await connection.query(
      `
        INSERT INTO audit_logs
        (
          user_id,
          action,
          module,
          record_id,
          description,
          old_data,
          new_data
        )

        VALUES
        (
          ?,
          'PERMANENT_DELETE',
          'DATA_MANAGEMENT',
          ?,
          ?,
          ?,
          ?
        )
      `,
      [
        userId ||
          null,

        String(
          courseId
        ),

        `Course ${course.course_name} permanently deleted.`,

        JSON.stringify(
          course
        ),

        JSON.stringify({
          trainees:
            traineeResult,

          zk_department:
            departmentResult,

          zk_positions_deleted:
            deletedPositionIds.size,
        }),
      ]
    );

    await connection.commit();
  } catch (
    error
  ) {
    await connection.rollback();

    throw error;
  } finally {
    connection.release();
  }

  return {
    course_id:
      courseId,

    course_name:
      course.course_name,

    trainees:
      traineeResult,

    platoons_deleted:
      platoons.length,

    zk_positions_deleted:
      deletedPositionIds.size,

    zk_department:
      departmentResult,

    success:
      true,
  };
}

/*
|--------------------------------------------------------------------------
| PERMANENT DELETE STAFF CATEGORY
|--------------------------------------------------------------------------
|
| Deletes every Staff member currently owned by the Category first. Each
| staff delete keeps the existing duplicate-identity protection, so an
| Employee ID still used by another Portal identity is not removed from ZK.
| The Category's ZK Department is removed only when no Course/other Staff
| Category still uses it.
|--------------------------------------------------------------------------
*/

async function permanentlyDeleteStaffCategory({
  categoryId,
  deleteRawTransactions = false,
  userId = null,
}) {
  const [categoryRows] =
    await pool.query(
      `
        SELECT
          id,
          category_name,
          zkbiotime_department_id,
          zkbiotime_dept_code
        FROM staff_categories
        WHERE id = ?
        LIMIT 1
      `,
      [categoryId]
    );

  const category =
    categoryRows[0];

  if (!category) {
    return {
      id: categoryId,
      success: false,
      error:
        "Staff Category not found.",
    };
  }

  const [staffRows] =
    await pool.query(
      `
        SELECT id
        FROM staff
        WHERE category_id = ?
        ORDER BY id
      `,
      [categoryId]
    );

  const staffResults = [];

  for (const row of staffRows) {
    const result =
      await permanentlyDeleteStaff({
        staffId: row.id,
        deleteRawTransactions,
        userId,
      });

    staffResults.push(
      result
    );
  }

  const failedStaff =
    staffResults.filter(
      (item) =>
        !item.success
    );

  if (failedStaff.length > 0) {
    return {
      id: categoryId,
      category_name:
        category.category_name,
      success: false,
      partial: true,
      staff_selected:
        staffRows.length,
      staff_deleted:
        staffResults.length -
        failedStaff.length,
      staff_failed:
        failedStaff.length,
      staff_results:
        staffResults,
      error:
        "Some Staff members could not be deleted. Category was preserved so the operation can be retried safely.",
    };
  }

  let departmentResult = {
    deleted: false,
    skipped: true,
    reason:
      "NO_DEPARTMENT_ID",
  };

  if (
    category.zkbiotime_department_id
  ) {
    try {
      departmentResult =
        await deleteDepartmentIfUnused({
          departmentId:
            category.zkbiotime_department_id,
          excludeStaffCategoryId:
            category.id,
        });
    } catch (error) {
      return {
        id: categoryId,
        category_name:
          category.category_name,
        success: false,
        partial: true,
        staff_selected:
          staffRows.length,
        staff_deleted:
          staffResults.length,
        staff_failed: 0,
        staff_results:
          staffResults,
        error:
          `ZKBioTime Department delete failed: ${error.message}`,
      };
    }
  }

  const connection =
    await pool.getConnection();

  try {
    await connection.beginTransaction();

    await connection.query(
      `
        DELETE FROM timetable_staff_assignments
        WHERE category_id = ?
      `,
      [category.id]
    );

    const [deleteResult] =
      await connection.query(
        `
          DELETE FROM staff_categories
          WHERE id = ?
        `,
        [category.id]
      );

    if (
      Number(
        deleteResult.affectedRows ||
        0
      ) !== 1
    ) {
      throw new Error(
        "Staff Category could not be deleted from Portal database."
      );
    }

    await connection.query(
      `
        INSERT INTO audit_logs
        (
          user_id,
          action,
          module,
          record_id,
          description,
          old_data,
          new_data
        )
        VALUES
        (
          ?,
          'PERMANENT_DELETE',
          'STAFF_CATEGORY',
          ?,
          ?,
          ?,
          ?
        )
      `,
      [
        userId || null,
        String(category.id),
        `Staff Category ${category.category_name} permanently deleted with ${staffResults.length} Staff member(s).`,
        JSON.stringify(category),
        JSON.stringify({
          staff_deleted:
            staffResults.length,
          zk_department:
            departmentResult,
        }),
      ]
    );

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  return {
    id: category.id,
    category_name:
      category.category_name,
    success: true,
    staff_selected:
      staffRows.length,
    staff_deleted:
      staffResults.length,
    staff_failed: 0,
    staff_results:
      staffResults,
    zk_department:
      departmentResult,
  };
}

/*
|--------------------------------------------------------------------------
| PERMANENT DELETE STAFF BRANCH / POSTING PLACE
|--------------------------------------------------------------------------
*/

async function permanentlyDeleteStaffBranch({
  branchId,
  deleteRawTransactions = false,
  userId = null,
}) {
  const [branchRows] =
    await pool.query(
      `
        SELECT
          id,
          branch_name,
          zkbiotime_position_id
        FROM staff_branches
        WHERE id = ?
        LIMIT 1
      `,
      [branchId]
    );

  const branch =
    branchRows[0];

  if (!branch) {
    return {
      id: branchId,
      success: false,
      error:
        "Branch / Posting Place not found.",
    };
  }

  const [staffRows] =
    await pool.query(
      `
        SELECT id
        FROM staff
        WHERE branch_id = ?
        ORDER BY id
      `,
      [branchId]
    );

  const staffResults = [];

  for (const row of staffRows) {
    const result =
      await permanentlyDeleteStaff({
        staffId: row.id,
        deleteRawTransactions,
        userId,
      });

    staffResults.push(
      result
    );
  }

  const failedStaff =
    staffResults.filter(
      (item) =>
        !item.success
    );

  if (failedStaff.length > 0) {
    return {
      id: branchId,
      branch_name:
        branch.branch_name,
      success: false,
      partial: true,
      staff_selected:
        staffRows.length,
      staff_deleted:
        staffResults.length -
        failedStaff.length,
      staff_failed:
        failedStaff.length,
      staff_results:
        staffResults,
      error:
        "Some Staff members could not be deleted. Branch / Posting Place was preserved so the operation can be retried safely.",
    };
  }

  let positionResult = {
    deleted: false,
    skipped: true,
    reason:
      "NO_POSITION_ID",
  };

  if (
    branch.zkbiotime_position_id
  ) {
    try {
      positionResult =
        await deletePositionIfUnused({
          positionId:
            branch.zkbiotime_position_id,
          excludeStaffBranchId:
            branch.id,
        });
    } catch (error) {
      return {
        id: branchId,
        branch_name:
          branch.branch_name,
        success: false,
        partial: true,
        staff_selected:
          staffRows.length,
        staff_deleted:
          staffResults.length,
        staff_failed: 0,
        staff_results:
          staffResults,
        error:
          `ZKBioTime Position delete failed: ${error.message}`,
      };
    }
  }

  const connection =
    await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [deleteResult] =
      await connection.query(
        `
          DELETE FROM staff_branches
          WHERE id = ?
        `,
        [branch.id]
      );

    if (
      Number(
        deleteResult.affectedRows ||
        0
      ) !== 1
    ) {
      throw new Error(
        "Branch / Posting Place could not be deleted from Portal database."
      );
    }

    await connection.query(
      `
        INSERT INTO audit_logs
        (
          user_id,
          action,
          module,
          record_id,
          description,
          old_data,
          new_data
        )
        VALUES
        (
          ?,
          'PERMANENT_DELETE',
          'STAFF_BRANCH',
          ?,
          ?,
          ?,
          ?
        )
      `,
      [
        userId || null,
        String(branch.id),
        `Staff Branch / Posting Place ${branch.branch_name} permanently deleted with ${staffResults.length} Staff member(s).`,
        JSON.stringify(branch),
        JSON.stringify({
          staff_deleted:
            staffResults.length,
          zk_position:
            positionResult,
        }),
      ]
    );

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  return {
    id: branch.id,
    branch_name:
      branch.branch_name,
    success: true,
    staff_selected:
      staffRows.length,
    staff_deleted:
      staffResults.length,
    staff_failed: 0,
    staff_results:
      staffResults,
    zk_position:
      positionResult,
  };
}

module.exports = {
  bulkDeleteTrainees,
  bulkDeleteStaff,

  permanentlyDeleteTrainee,
  permanentlyDeleteStaff,

  permanentlyDeleteCourse,
  permanentlyDeletePlatoon,

  permanentlyDeleteStaffCategory,
  permanentlyDeleteStaffBranch,
};