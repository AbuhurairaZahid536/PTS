const {
  pool,
} = require("../config/db");


function cleanText(value) {
  if (
    value === undefined ||
    value === null
  ) {
    return null;
  }

  const text =
    String(value).trim();

  return text || null;
}


function normalizeSelectionMode(value) {
  const mode =
    String(
      value || ""
    )
      .trim()
      .toUpperCase();

  return [
    "ALL",
    "CATEGORIES",
    "STAFF",
  ].includes(mode)
    ? mode
    : null;
}


function normalizeIdList(values) {
  return Array.from(
    new Set(
      (
        Array.isArray(values)
          ? values
          : []
      )
        .map(Number)
        .filter(
          (value) =>
            Number.isInteger(value) &&
            value > 0
        )
    )
  );
}


async function validateCategoryIds(
  connection,
  ids
) {
  const categoryIds =
    normalizeIdList(ids);

  if (!categoryIds.length) {
    return [];
  }

  const [
    rows,
  ] =
    await connection.query(
      `
        SELECT id
        FROM staff_categories
        WHERE id IN (?)
          AND is_active = 1
      `,
      [categoryIds]
    );

  if (
    rows.length !==
    categoryIds.length
  ) {
    throw new Error(
      "One or more selected Staff Categories are invalid or inactive."
    );
  }

  return categoryIds;
}


async function validateStaffIds(
  connection,
  ids
) {
  const staffIds =
    normalizeIdList(ids);

  if (!staffIds.length) {
    return [];
  }

  const [
    rows,
  ] =
    await connection.query(
      `
        SELECT id
        FROM staff
        WHERE id IN (?)
          AND is_deleted = 0
      `,
      [staffIds]
    );

  if (
    rows.length !==
    staffIds.length
  ) {
    throw new Error(
      "One or more selected Staff members are invalid."
    );
  }

  return staffIds;
}


async function replaceSelections(
  connection,
  dutyRestId,
  selectionMode,
  categoryIds,
  staffIds
) {
  await connection.query(
    `
      DELETE FROM staff_duty_rest_categories
      WHERE duty_rest_id = ?
    `,
    [dutyRestId]
  );

  await connection.query(
    `
      DELETE FROM staff_duty_rest_members
      WHERE duty_rest_id = ?
    `,
    [dutyRestId]
  );

  if (
    selectionMode ===
    "CATEGORIES"
  ) {
    const validCategoryIds =
      await validateCategoryIds(
        connection,
        categoryIds
      );

    if (!validCategoryIds.length) {
      throw new Error(
        "Select at least one Staff Category."
      );
    }

    const placeholders =
      validCategoryIds
        .map(
          () =>
            "(?, ?)"
        )
        .join(", ");

    const params = [];

    validCategoryIds.forEach(
      (categoryId) => {
        params.push(
          dutyRestId,
          categoryId
        );
      }
    );

    await connection.query(
      `
        INSERT INTO staff_duty_rest_categories
        (
          duty_rest_id,
          category_id
        )
        VALUES ${placeholders}
      `,
      params
    );
  }


  if (
    selectionMode ===
    "STAFF"
  ) {
    const validStaffIds =
      await validateStaffIds(
        connection,
        staffIds
      );

    if (!validStaffIds.length) {
      throw new Error(
        "Select at least one Staff member."
      );
    }

    const placeholders =
      validStaffIds
        .map(
          () =>
            "(?, ?)"
        )
        .join(", ");

    const params = [];

    validStaffIds.forEach(
      (staffId) => {
        params.push(
          dutyRestId,
          staffId
        );
      }
    );

    await connection.query(
      `
        INSERT INTO staff_duty_rest_members
        (
          duty_rest_id,
          staff_id
        )
        VALUES ${placeholders}
      `,
      params
    );
  }
}


function decorateRecord(row) {
  const categoryNames =
    row.category_names
      ? String(
          row.category_names
        )
          .split("||")
          .filter(Boolean)
      : [];

  const staffNames =
    row.staff_names
      ? String(
          row.staff_names
        )
          .split("||")
          .filter(Boolean)
      : [];

  let selectionLabel =
    "All Staff";

  if (
    row.selection_mode ===
    "CATEGORIES"
  ) {
    selectionLabel =
      categoryNames.join(", ") ||
      "Selected Staff Categories";
  }

  if (
    row.selection_mode ===
    "STAFF"
  ) {
    selectionLabel =
      staffNames.join(", ") ||
      "Selected Staff";
  }

  return {
    ...row,

    category_names:
      categoryNames,

    staff_names:
      staffNames,

    selection_label:
      selectionLabel,
  };
}


async function listDutyRest({
  search = "",
  dateFrom = null,
  dateTo = null,
  status = null,
} = {}) {
  const conditions = [
    "1 = 1",
  ];

  const params = {};

  const cleanSearch =
    cleanText(search);

  if (cleanSearch) {
    conditions.push(`
      (
        dr.title LIKE :search
        OR dr.reason LIKE :search
        OR dr.reference_no LIKE :search

        OR EXISTS
        (
          SELECT 1

          FROM staff_duty_rest_categories drc2

          JOIN staff_categories sc2
            ON sc2.id =
               drc2.category_id

          WHERE
            drc2.duty_rest_id =
              dr.id

            AND sc2.category_name
                LIKE :search
        )

        OR EXISTS
        (
          SELECT 1

          FROM staff_duty_rest_members drm2

          JOIN staff s2
            ON s2.id =
               drm2.staff_id

          WHERE
            drm2.duty_rest_id =
              dr.id

            AND
            (
              s2.employee_id LIKE :search
              OR s2.belt_no LIKE :search
              OR s2.first_name LIKE :search
              OR s2.last_name LIKE :search
              OR CONCAT_WS(
                   ' ',
                   s2.first_name,
                   s2.last_name
                 ) LIKE :search
            )
        )
      )
    `);

    params.search =
      `%${cleanSearch}%`;
  }


  if (dateFrom) {
    conditions.push(
      "dr.end_datetime >= :dateFrom"
    );

    params.dateFrom =
      `${String(dateFrom).substring(0, 10)} 00:00:00`;
  }


  if (dateTo) {
    conditions.push(
      "dr.start_datetime <= :dateTo"
    );

    params.dateTo =
      `${String(dateTo).substring(0, 10)} 23:59:59`;
  }


  if (status) {
    conditions.push(
      "dr.record_status = :status"
    );

    params.status =
      String(status)
        .trim()
        .toUpperCase();
  }


  const [
    rows,
  ] =
    await pool.query(
      `
        SELECT
          dr.*,

          creator.full_name
            AS created_by_name,

          updater.full_name
            AS updated_by_name,

          canceller.full_name
            AS cancelled_by_name,

          GROUP_CONCAT(
            DISTINCT
            sc.category_name
            ORDER BY
              sc.category_name
            SEPARATOR '||'
          )
            AS category_names,

          GROUP_CONCAT(
            DISTINCT
            CONCAT(
              COALESCE(
                NULLIF(
                  TRIM(
                    CONCAT_WS(
                      ' ',
                      s.first_name,
                      s.last_name
                    )
                  ),
                  ''
                ),
                s.employee_id
              ),
              CASE
                WHEN
                  s.belt_no IS NOT NULL
                  AND TRIM(
                    s.belt_no
                  ) <> ''
                  THEN CONCAT(
                    ' ',
                    TRIM(
                      s.belt_no
                    )
                  )
                ELSE ''
              END
            )
            ORDER BY
              s.first_name,
              s.last_name,
              s.employee_id
            SEPARATOR '||'
          )
            AS staff_names

        FROM staff_duty_rest dr

        LEFT JOIN staff_duty_rest_categories drc
          ON drc.duty_rest_id =
             dr.id

        LEFT JOIN staff_categories sc
          ON sc.id =
             drc.category_id

        LEFT JOIN staff_duty_rest_members drm
          ON drm.duty_rest_id =
             dr.id

        LEFT JOIN staff s
          ON s.id =
             drm.staff_id

        LEFT JOIN users creator
          ON creator.id =
             dr.created_by

        LEFT JOIN users updater
          ON updater.id =
             dr.updated_by

        LEFT JOIN users canceller
          ON canceller.id =
             dr.cancelled_by

        WHERE
          ${conditions.join(" AND ")}

        GROUP BY
          dr.id

        ORDER BY
          dr.start_datetime DESC,
          dr.id DESC
      `,
      params
    );

  return rows.map(
    decorateRecord
  );
}


async function getDutyRestById(
  id,
  connection =
    pool
) {
  const [
    rows,
  ] =
    await connection.query(
      `
        SELECT
          dr.*,

          creator.full_name
            AS created_by_name,

          updater.full_name
            AS updated_by_name,

          canceller.full_name
            AS cancelled_by_name

        FROM staff_duty_rest dr

        LEFT JOIN users creator
          ON creator.id =
             dr.created_by

        LEFT JOIN users updater
          ON updater.id =
             dr.updated_by

        LEFT JOIN users canceller
          ON canceller.id =
             dr.cancelled_by

        WHERE
          dr.id = ?

        LIMIT 1
      `,
      [
        Number(id),
      ]
    );

  const record =
    rows[0];

  if (!record) {
    return null;
  }


  const [
    categoryRows,
  ] =
    await connection.query(
      `
        SELECT
          sc.id,
          sc.category_name

        FROM staff_duty_rest_categories drc

        JOIN staff_categories sc
          ON sc.id =
             drc.category_id

        WHERE
          drc.duty_rest_id = ?

        ORDER BY
          sc.category_name
      `,
      [
        Number(id),
      ]
    );


  const [
    staffRows,
  ] =
    await connection.query(
      `
        SELECT
          s.id,
          s.employee_id,
          s.belt_no,
          s.first_name,
          s.last_name,
          s.category_id,
          s.branch_id,

          sc.category_name,
          sb.branch_name

        FROM staff_duty_rest_members drm

        JOIN staff s
          ON s.id =
             drm.staff_id

        LEFT JOIN staff_categories sc
          ON sc.id =
             s.category_id

        LEFT JOIN staff_branches sb
          ON sb.id =
             s.branch_id

        WHERE
          drm.duty_rest_id = ?

        ORDER BY
          s.first_name,
          s.last_name,
          s.employee_id
      `,
      [
        Number(id),
      ]
    );


  let selectionLabel =
    "All Staff";

  if (
    record.selection_mode ===
    "CATEGORIES"
  ) {
    selectionLabel =
      categoryRows
        .map(
          (item) =>
            item.category_name
        )
        .join(", ") ||
      "Selected Staff Categories";
  }

  if (
    record.selection_mode ===
    "STAFF"
  ) {
    selectionLabel =
      staffRows
        .map(
          (item) => {
            const name =
              [
                item.first_name,
                item.last_name,
              ]
                .filter(Boolean)
                .join(" ") ||
              item.employee_id;

            return item.belt_no
              ? `${name} ${item.belt_no}`
              : name;
          }
        )
        .join(", ") ||
      "Selected Staff";
  }


  return {
    ...record,

    category_ids:
      categoryRows.map(
        (item) =>
          item.id
      ),

    staff_ids:
      staffRows.map(
        (item) =>
          item.id
      ),

    selected_categories:
      categoryRows,

    selected_staff:
      staffRows,

    selection_label:
      selectionLabel,
  };
}


async function createDutyRest({
  title = null,
  selectionMode,
  categoryIds = [],
  staffIds = [],
  startDatetime,
  endDatetime,
  reason = null,
  referenceNo = null,
  remarks = null,
  userId = null,
}) {
  const connection =
    await pool.getConnection();

  try {
    await connection.beginTransaction();

    const mode =
      normalizeSelectionMode(
        selectionMode
      );

    if (!mode) {
      throw new Error(
        "Invalid Duty Rest selection mode."
      );
    }

    const [
      result,
    ] =
      await connection.query(
        `
          INSERT INTO staff_duty_rest
          (
            title,
            selection_mode,
            start_datetime,
            end_datetime,
            reason,
            reference_no,
            remarks,
            record_status,
            created_by,
            updated_by
          )
          VALUES
          (
            :title,
            :selectionMode,
            :startDatetime,
            :endDatetime,
            :reason,
            :referenceNo,
            :remarks,
            'ACTIVE',
            :userId,
            :userId
          )
        `,
        {
          title:
            cleanText(title),

          selectionMode:
            mode,

          startDatetime,
          endDatetime,

          reason:
            cleanText(reason),

          referenceNo:
            cleanText(
              referenceNo
            ),

          remarks:
            cleanText(
              remarks
            ),

          userId:
            Number(userId) > 0
              ? Number(userId)
              : null,
        }
      );


    await replaceSelections(
      connection,
      result.insertId,
      mode,
      categoryIds,
      staffIds
    );


    await connection.commit();

    return getDutyRestById(
      result.insertId
    );
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}


async function updateDutyRest({
  id,
  title = null,
  selectionMode,
  categoryIds = [],
  staffIds = [],
  startDatetime,
  endDatetime,
  reason = null,
  referenceNo = null,
  remarks = null,
  userId = null,
}) {
  const connection =
    await pool.getConnection();

  try {
    await connection.beginTransaction();

    const existing =
      await getDutyRestById(
        id,
        connection
      );

    if (!existing) {
      return null;
    }

    if (
      existing.record_status ===
      "CANCELLED"
    ) {
      throw new Error(
        "Cancelled Duty Rest record cannot be edited."
      );
    }

    const mode =
      normalizeSelectionMode(
        selectionMode
      );

    if (!mode) {
      throw new Error(
        "Invalid Duty Rest selection mode."
      );
    }


    await connection.query(
      `
        UPDATE staff_duty_rest

        SET
          title =
            :title,

          selection_mode =
            :selectionMode,

          start_datetime =
            :startDatetime,

          end_datetime =
            :endDatetime,

          reason =
            :reason,

          reference_no =
            :referenceNo,

          remarks =
            :remarks,

          updated_by =
            :userId

        WHERE
          id = :id
      `,
      {
        id:
          Number(id),

        title:
          cleanText(title),

        selectionMode:
          mode,

        startDatetime,
        endDatetime,

        reason:
          cleanText(reason),

        referenceNo:
          cleanText(
            referenceNo
          ),

        remarks:
          cleanText(
            remarks
          ),

        userId:
          Number(userId) > 0
            ? Number(userId)
            : null,
      }
    );


    await replaceSelections(
      connection,
      Number(id),
      mode,
      categoryIds,
      staffIds
    );


    await connection.commit();

    return getDutyRestById(
      id
    );
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}


async function cancelDutyRest({
  id,
  cancellationReason = null,
  userId = null,
}) {
  const existing =
    await getDutyRestById(
      id
    );

  if (!existing) {
    return null;
  }

  if (
    existing.record_status ===
    "CANCELLED"
  ) {
    return existing;
  }

  await pool.query(
    `
      UPDATE staff_duty_rest

      SET
        record_status =
          'CANCELLED',

        cancelled_by =
          :userId,

        cancelled_at =
          NOW(),

        cancellation_reason =
          :cancellationReason,

        updated_by =
          :userId

      WHERE
        id = :id
    `,
    {
      id:
        Number(id),

      userId:
        Number(userId) > 0
          ? Number(userId)
          : null,

      cancellationReason:
        cleanText(
          cancellationReason
        ),
    }
  );

  return getDutyRestById(
    id
  );
}


module.exports = {
  normalizeSelectionMode,
  listDutyRest,
  getDutyRestById,
  createDutyRest,
  updateDutyRest,
  cancelDutyRest,
};
