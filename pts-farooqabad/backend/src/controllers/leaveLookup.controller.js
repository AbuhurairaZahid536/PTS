const { pool } = require("../config/db");

async function searchLeaveSubjects(req, res, next) {
  try {
    const subjectType = String(
      req.query.subject_type || ""
    )
      .trim()
      .toUpperCase();

    const search = String(
      req.query.search || ""
    ).trim();

    const includeAll =
      [
        "1",
        "true",
        "yes",
      ].includes(
        String(
          req.query.include_all ||
            ""
        )
          .trim()
          .toLowerCase()
      );

    const assignmentSearch =
      [
        "1",
        "true",
        "yes",
      ].includes(
        String(
          req.query.assignment_search ||
            ""
        )
          .trim()
          .toLowerCase()
      );

    if (!["TRAINEE", "STAFF"].includes(subjectType)) {
      return res.status(400).json({
        success: false,
        message: "subject_type must be TRAINEE or STAFF.",
      });
    }

    if (
      search.length < 1 &&
      subjectType === "STAFF" &&
      includeAll
    ) {
      const [rows] =
        await pool.execute(
          `
            SELECT
              s.id,
              s.employee_id,
              s.belt_no,
              s.first_name,
              s.last_name,
              s.father_name,
              s.category_id,
              sc.category_name,
              s.branch_id,
              sb.branch_name,
              s.designation

            FROM staff s

            LEFT JOIN staff_categories sc
              ON sc.id = s.category_id

            LEFT JOIN staff_branches sb
              ON sb.id = s.branch_id

            WHERE s.is_deleted = 0

            ORDER BY
              CONCAT_WS(
                ' ',
                s.first_name,
                s.last_name
              ),
              s.employee_id
          `
        );

      return res.json({
        success: true,
        data: rows.map((row) => ({
          ...row,
          subject_type: "STAFF",
          subject_id: row.id,
        })),
      });
    }

    if (search.length < 1) {
      return res.json({
        success: true,
        data: [],
      });
    }

    const value = `%${search}%`;

    if (subjectType === "TRAINEE") {
      const [rows] = await pool.execute(
        `
          SELECT
            t.id,
            t.employee_id,
            t.belt_no,
            t.first_name,
            t.last_name,
            t.father_name,
            t.course_id,
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
              WHEN DATE(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+05:00')) BETWEEN c.start_date AND c.end_date
                THEN 'ACTIVE'
              ELSE 'COMPLETED'
            END AS course_status,
            t.platoon_id,
            p.platoon_number,
            p.platoon_name

          FROM trainees t

          LEFT JOIN courses c
            ON c.id = t.course_id

          LEFT JOIN platoons p
            ON p.id = t.platoon_id

          WHERE t.is_deleted = 0
            AND t.is_staff_exempt = 0
            AND (
              t.employee_id LIKE ?
              OR t.belt_no LIKE ?
              OR t.first_name LIKE ?
              OR t.last_name LIKE ?
              OR t.father_name LIKE ?
              OR CONCAT_WS(
                ' ',
                t.first_name,
                t.last_name
              ) LIKE ?
            )

          ORDER BY
            CASE
              WHEN TRIM(t.employee_id) = ? THEN 0
              WHEN TRIM(COALESCE(t.belt_no, '')) = ? THEN 0
              ELSE 1
            END,
            t.employee_id,
            c.start_date DESC,
            t.id DESC

          LIMIT 30
        `,
        [
          value,
          value,
          value,
          value,
          value,
          value,
          search,
          search,
        ]
      );

      return res.json({
        success: true,
        data: rows.map((row) => ({
          ...row,
          subject_type: "TRAINEE",
          subject_id: row.id,
        })),
      });
    }

    if (subjectType === "STAFF" && assignmentSearch) {
      const prefixValue = `${search}%`;

      const [rows] = await pool.execute(
        `
          SELECT
            s.id,
            s.employee_id,
            s.belt_no,
            s.first_name,
            s.last_name,
            s.father_name,
            s.category_id,
            sc.category_name,
            s.branch_id,
            sb.branch_name,
            s.designation

          FROM staff s

          LEFT JOIN staff_categories sc
            ON sc.id = s.category_id

          LEFT JOIN staff_branches sb
            ON sb.id = s.branch_id

          WHERE s.is_deleted = 0
            AND (
              s.belt_no LIKE ?
              OR s.first_name LIKE ?
              OR s.last_name LIKE ?
              OR CONCAT_WS(
                ' ',
                s.first_name,
                s.last_name
              ) LIKE ?
            )

          ORDER BY
            CASE
              WHEN TRIM(COALESCE(s.belt_no, '')) = ? THEN 0
              WHEN LOWER(TRIM(CONCAT_WS(' ', s.first_name, s.last_name))) = LOWER(?) THEN 0
              WHEN COALESCE(s.belt_no, '') LIKE ? THEN 1
              WHEN CONCAT_WS(' ', s.first_name, s.last_name) LIKE ? THEN 1
              ELSE 2
            END,
            COALESCE(s.belt_no, ''),
            CONCAT_WS(' ', s.first_name, s.last_name),
            s.id

          LIMIT 30
        `,
        [
          value,
          value,
          value,
          value,
          search,
          search,
          prefixValue,
          prefixValue,
        ]
      );

      return res.json({
        success: true,
        data: rows.map((row) => ({
          ...row,
          subject_type: "STAFF",
          subject_id: row.id,
        })),
      });
    }

    const [rows] = await pool.execute(
      `
        SELECT
          s.id,
          s.employee_id,
          s.belt_no,
          s.first_name,
          s.last_name,
          s.father_name,
          s.category_id,
          sc.category_name,
          s.branch_id,
          sb.branch_name,
          s.designation

        FROM staff s

        LEFT JOIN staff_categories sc
          ON sc.id = s.category_id

        LEFT JOIN staff_branches sb
          ON sb.id = s.branch_id

        WHERE s.is_deleted = 0
          AND (
            s.employee_id LIKE ?
            OR s.belt_no LIKE ?
            OR s.first_name LIKE ?
            OR s.last_name LIKE ?
            OR s.father_name LIKE ?
            OR CONCAT_WS(
              ' ',
              s.first_name,
              s.last_name
            ) LIKE ?
          )

        ORDER BY
          CASE
            WHEN TRIM(s.employee_id) = ? THEN 0
            WHEN TRIM(COALESCE(s.belt_no, '')) = ? THEN 0
            ELSE 1
          END,
          s.employee_id

        LIMIT 30
      `,
      [
        value,
        value,
        value,
        value,
        value,
        value,
        search,
        search,
      ]
    );

    return res.json({
      success: true,
      data: rows.map((row) => ({
        ...row,
        subject_type: "STAFF",
        subject_id: row.id,
      })),
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  searchLeaveSubjects,
};