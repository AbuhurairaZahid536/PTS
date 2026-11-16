const { pool } = require("../config/db");

/*
|--------------------------------------------------------------------------
| HELPERS
|--------------------------------------------------------------------------
*/

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
      "-",
      pad(value.getMonth() + 1),
      "-",
      pad(value.getDate()),
    ].join("");
  }

  return String(value).substring(0, 10);
}

/*
|--------------------------------------------------------------------------
| TRAINEE
|--------------------------------------------------------------------------
*/

async function getTrainee(traineeId) {
  const [rows] = await pool.query(
    `
      SELECT
        t.id,
        t.employee_id,
        t.first_name,
        t.last_name,
        t.father_name,
        t.course_id,
        t.platoon_id,

        c.course_name,
        c.course_code,

        c.start_date AS course_start_date,
        c.end_date AS course_end_date,

        CASE
          WHEN c.start_date IS NULL
            OR c.end_date IS NULL
            THEN 'DATE_NOT_SET'

          WHEN DATE(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+05:00')) < c.start_date
            THEN 'UPCOMING'

          WHEN DATE(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+05:00'))
            BETWEEN c.start_date AND c.end_date
            THEN 'ACTIVE'

          ELSE 'COMPLETED'
        END AS course_status,

        p.platoon_number,
        p.platoon_name

      FROM trainees t

      LEFT JOIN courses c
        ON c.id = t.course_id

      LEFT JOIN platoons p
        ON p.id = t.platoon_id

      WHERE t.id = :traineeId
        AND t.is_deleted = 0
        AND t.is_staff_exempt = 0

      LIMIT 1
    `,
    {
      traineeId: Number(traineeId),
    }
  );

  return rows[0] || null;
}

/*
|--------------------------------------------------------------------------
| VALIDATE DATE AGAINST COURSE
|--------------------------------------------------------------------------
*/

async function validateTraineeDateTime({
  traineeId,
  dateTime,
  label = "Date/Time",
}) {
  const trainee = await getTrainee(traineeId);

  if (!trainee) {
    return {
      valid: false,
      trainee: null,
      message: "Trainee not found.",
    };
  }

  const courseStart = dateOnly(
    trainee.course_start_date
  );

  const courseEnd = dateOnly(
    trainee.course_end_date
  );

  if (!courseStart || !courseEnd) {
    return {
      valid: false,
      trainee,
      message:
        "Selected trainee Course Start/End Date is not set.",
    };
  }

  const eventDate = dateOnly(dateTime);

  if (!eventDate) {
    return {
      valid: false,
      trainee,
      message: `${label} is required.`,
    };
  }

  if (
    eventDate < courseStart ||
    eventDate > courseEnd
  ) {
    return {
      valid: false,
      trainee,
      message:
        `${label} must fall within Course period ${courseStart} to ${courseEnd}.`,
    };
  }

  return {
    valid: true,
    trainee,
    message: null,
  };
}

/*
|--------------------------------------------------------------------------
| SINGLE DROP
|--------------------------------------------------------------------------
*/

async function getById(id) {
  const [rows] = await pool.query(
    `
      SELECT
        d.*,

        t.employee_id,

        CONCAT_WS(
          ' ',
          t.first_name,
          t.last_name
        ) AS trainee_name,

        t.course_id,
        t.platoon_id,

        c.course_name,
        c.course_code,

        c.start_date AS course_start_date,
        c.end_date AS course_end_date,

        CASE
          WHEN c.start_date IS NULL
            OR c.end_date IS NULL
            THEN 'DATE_NOT_SET'

          WHEN DATE(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+05:00')) < c.start_date
            THEN 'UPCOMING'

          WHEN DATE(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+05:00'))
            BETWEEN c.start_date AND c.end_date
            THEN 'ACTIVE'

          ELSE 'COMPLETED'
        END AS course_status,

        p.platoon_number,

        authorizer.full_name
          AS authorized_by_name,

        rejoiner.full_name
          AS rejoined_by_name,

        creator.full_name
          AS created_by_name,

        canceller.full_name
          AS cancelled_by_name

      FROM trainee_training_drop d

      JOIN trainees t
        ON t.id = d.trainee_id

      LEFT JOIN courses c
        ON c.id = t.course_id

      LEFT JOIN platoons p
        ON p.id = t.platoon_id

      LEFT JOIN users authorizer
        ON authorizer.id = d.authorized_by

      LEFT JOIN users rejoiner
        ON rejoiner.id = d.rejoined_by

      LEFT JOIN users creator
        ON creator.id = d.created_by

      LEFT JOIN users canceller
        ON canceller.id = d.cancelled_by

      WHERE d.id = :id

      LIMIT 1
    `,
    {
      id: Number(id),
    }
  );

  return rows[0] || null;
}

/*
|--------------------------------------------------------------------------
| ACTIVE DROP CHECK
|--------------------------------------------------------------------------
*/

async function hasActiveDrop(
  traineeId,
  excludeId = null
) {
  const params = {
    traineeId,
  };

  let exclusion = "";

  if (excludeId) {
    exclusion =
      "AND id <> :excludeId";

    params.excludeId =
      excludeId;
  }

  const [rows] = await pool.query(
    `
      SELECT id

      FROM trainee_training_drop

      WHERE trainee_id = :traineeId

        AND drop_status = 'ACTIVE'

        ${exclusion}

      LIMIT 1
    `,
    params
  );

  return rows.length > 0;
}

/*
|--------------------------------------------------------------------------
| CREATE DROP
|--------------------------------------------------------------------------
*/

async function createDrop({
  traineeId,
  dropDatetime,
  reason,
  orderReference,
  remarks,
  userId,
}) {
  const connection =
    await pool.getConnection();

  let insertId = null;

  try {
    await connection.beginTransaction();

    const [result] =
      await connection.query(
        `
          INSERT INTO trainee_training_drop
          (
            trainee_id,
            drop_datetime,
            reason,
            order_reference,
            drop_status,
            authorized_by,
            authorization_datetime,
            remarks,
            created_by,
            updated_by
          )

          VALUES
          (
            :traineeId,
            :dropDatetime,
            :reason,
            :orderReference,
            'ACTIVE',
            :userId,
            NOW(),
            :remarks,
            :userId,
            :userId
          )
        `,
        {
          traineeId,
          dropDatetime,
          reason,

          orderReference:
            orderReference || null,

          remarks:
            remarks || null,

          userId,
        }
      );

    insertId =
      result.insertId;

    /*
    |--------------------------------------------------------------------------
    | SYNC OPERATIONAL STATUS
    |--------------------------------------------------------------------------
    */

    await connection.query(
      `
        UPDATE trainees

        SET status = 'TRAINING_DROP'

        WHERE id = :traineeId
          AND is_deleted = 0
      `,
      {
        traineeId,
      }
    );

    /*
    |--------------------------------------------------------------------------
    | CLOSE ACTIVE CONTINUOUS ABSENCE ON REPATRIATE
    |--------------------------------------------------------------------------
    |
    | Repatriate ends the current Continuous Absence immediately. The existing
    | absence_episodes schema supports OPEN / RETURNED only, so an administrative
    | closure is stored as RETURNED with NO biometric transaction id and with the
    | repatriate datetime as return_punch_at. Report/Profile queries explicitly
    | hide this administrative marker, while the preserved source-session keys
    | prevent the same historical missed sessions from reopening later.
    |
    |--------------------------------------------------------------------------
    */

    await connection.query(
      `
        UPDATE absence_episodes

        SET
          status = 'RETURNED',

          return_punch_at = :dropDatetime,

          return_transaction_id = NULL,

          duration_seconds =
            GREATEST(
              0,
              TIMESTAMPDIFF(
                SECOND,
                absent_from,
                :dropDatetime
              )
            )

        WHERE subject_type = 'TRAINEE'
          AND subject_id = :traineeId
          AND status = 'OPEN'
      `,
      {
        traineeId,
        dropDatetime,
      }
    );

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  return getById(
    insertId
  );
}

async function updateDrop({
  id,
  dropDatetime,
  reason,
  orderReference,
  remarks,
  updatedBy,
}) {
  const [result] =
    await pool.query(
      `
        UPDATE trainee_training_drop

        SET
          drop_datetime =
            :dropDatetime,

          reason =
            :reason,

          order_reference =
            :orderReference,

          remarks =
            :remarks,

          updated_by =
            :updatedBy

        WHERE id = :id
      `,
      {
        id,

        dropDatetime,

        reason,

        orderReference:
          orderReference ||
          null,

        remarks:
          remarks ||
          null,

        updatedBy:
          updatedBy ||
          null,
      }
    );

  if (
    !result.affectedRows
  ) {
    return null;
  }

  return getById(
    id
  );
}
/*
|--------------------------------------------------------------------------
| REJOIN
|--------------------------------------------------------------------------
*/

async function rejoinDrop({
  id,
  rejoinDatetime,
  rejoinReason,
  rejoinOrderReference,
  rejoinedBy,
}) {
  const [result] = await pool.query(
    `
      UPDATE trainee_training_drop

      SET
        drop_status = 'REJOINED',

        rejoin_datetime =
          :rejoinDatetime,

        rejoin_reason =
          :rejoinReason,

        rejoin_order_reference =
          :rejoinOrderReference,

        rejoined_by =
          :rejoinedBy,

        updated_by =
          :rejoinedBy

      WHERE id = :id
        AND drop_status = 'ACTIVE'
    `,
    {
      id,
      rejoinDatetime,

      rejoinReason:
        rejoinReason || null,

      rejoinOrderReference:
        rejoinOrderReference || null,

      rejoinedBy,
    }
  );

  if (!result.affectedRows) {
    return null;
  }

  /*
  |--------------------------------------------------------------------------
  | RESTORE ACTIVE STATUS
  |--------------------------------------------------------------------------
  */

  await pool.query(
    `
      UPDATE trainees t

      JOIN trainee_training_drop d
        ON d.trainee_id = t.id

      SET t.status = 'ACTIVE'

      WHERE d.id = :id
        AND t.is_deleted = 0
    `,
    {
      id,
    }
  );

  /*
  |--------------------------------------------------------------------------
  | CONTINUOUS ABSENCE AFTER REJOIN
  |--------------------------------------------------------------------------
  |
  | Do not reopen the pre-repatriation absence. It ended when Repatriate was
  | applied. If the trainee misses attendance after rejoining, the normal
  | Continuous Absence engine will create a new episode from that later miss.
  |
  |--------------------------------------------------------------------------
  */

  return getById(id);
}

/*
|--------------------------------------------------------------------------
| CANCEL
|--------------------------------------------------------------------------
*/

async function cancelDrop({
  id,
  cancelledBy,
  cancellationReason,
}) {
  const [result] = await pool.query(
    `
      UPDATE trainee_training_drop

      SET
        drop_status = 'CANCELLED',

        cancelled_by =
          :cancelledBy,

        cancelled_at =
          NOW(),

        cancellation_reason =
          :cancellationReason,

        updated_by =
          :cancelledBy

      WHERE id = :id
        AND drop_status = 'ACTIVE'
    `,
    {
      id,
      cancelledBy,

      cancellationReason:
        cancellationReason || null,
    }
  );

  if (!result.affectedRows) {
    return null;
  }

  /*
  |--------------------------------------------------------------------------
  | CANCELLED DROP = ACTIVE TRAINEE
  |--------------------------------------------------------------------------
  */

  await pool.query(
    `
      UPDATE trainees t

      JOIN trainee_training_drop d
        ON d.trainee_id = t.id

      SET t.status = 'ACTIVE'

      WHERE d.id = :id
        AND t.is_deleted = 0
    `,
    {
      id,
    }
  );

  return getById(id);
}

/*
|--------------------------------------------------------------------------
| LIST
|--------------------------------------------------------------------------
*/

async function getDrops({
  search = "",
  status = null,
  dateFrom = null,
  dateTo = null,
}) {
  const conditions = [
    "t.is_deleted = 0",
    "t.is_staff_exempt = 0",
  ];

  const params = {};

  if (search) {
    conditions.push(`
      (
        t.employee_id LIKE :search

        OR t.first_name LIKE :search

        OR t.last_name LIKE :search

        OR CONCAT_WS(
          ' ',
          t.first_name,
          t.last_name
        ) LIKE :search

        OR d.reason LIKE :search

        OR c.course_name LIKE :search
      )
    `);

    params.search =
      `%${search}%`;
  }

  if (status) {
    conditions.push(
      "d.drop_status = :status"
    );

    params.status =
      status;
  }

  if (dateFrom) {
    conditions.push(
      "d.drop_datetime >= :dateFrom"
    );

    params.dateFrom =
      `${dateFrom} 00:00:00`;
  }

  if (dateTo) {
    conditions.push(
      "d.drop_datetime <= :dateTo"
    );

    params.dateTo =
      `${dateTo} 23:59:59`;
  }

  const [rows] = await pool.query(
    `
      SELECT
        d.*,

        t.employee_id,

        CONCAT_WS(
          ' ',
          t.first_name,
          t.last_name
        ) AS trainee_name,

        t.course_id,
        t.platoon_id,

        c.course_name,

        c.start_date
          AS course_start_date,

        c.end_date
          AS course_end_date,

        CASE
          WHEN c.start_date IS NULL
            OR c.end_date IS NULL
            THEN 'DATE_NOT_SET'

          WHEN DATE(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+05:00')) < c.start_date
            THEN 'UPCOMING'

          WHEN DATE(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+05:00'))
            BETWEEN c.start_date AND c.end_date
            THEN 'ACTIVE'

          ELSE 'COMPLETED'
        END AS course_status,

        p.platoon_number,

        authorizer.full_name
          AS authorized_by_name,

        rejoiner.full_name
          AS rejoined_by_name,

        canceller.full_name
          AS cancelled_by_name

      FROM trainee_training_drop d

      JOIN trainees t
        ON t.id = d.trainee_id

      LEFT JOIN courses c
        ON c.id = t.course_id

      LEFT JOIN platoons p
        ON p.id = t.platoon_id

      LEFT JOIN users authorizer
        ON authorizer.id = d.authorized_by

      LEFT JOIN users rejoiner
        ON rejoiner.id = d.rejoined_by

      LEFT JOIN users canceller
        ON canceller.id = d.cancelled_by

      WHERE ${conditions.join(" AND ")}

      ORDER BY
        d.drop_datetime DESC,
        d.id DESC
    `,
    params
  );

  return rows;
}

module.exports = {
  getTrainee,
  validateTraineeDateTime,
  getById,
  hasActiveDrop,
  createDrop,
  updateDrop,
  rejoinDrop,
  cancelDrop,
  getDrops,
};