const { pool } = require("./src/config/db");

(async () => {
  const [rows] = await pool.query(`
    SELECT
      c.id AS course_id,
      c.course_name,
      c.start_date,
      c.end_date,
      c.zkbiotime_department_id,
      c.zkbiotime_dept_code,

      COUNT(DISTINCT t.id) AS trainees,

      COUNT(
        DISTINCT CASE
          WHEN
            t.zkteco_emp_id IS NOT NULL
            OR t.zkteco_emp_code IS NOT NULL
            OR COALESCE(t.zkteco_synced, 0) = 1
          THEN t.id
        END
      ) AS zk_linked_trainees,

      COUNT(DISTINCT p.id) AS platoons,

      COUNT(
        DISTINCT CASE
          WHEN p.zkbiotime_position_id IS NOT NULL
          THEN p.id
        END
      ) AS zk_linked_platoons

    FROM courses c

    LEFT JOIN trainees t
      ON t.course_id = c.id
      AND t.is_deleted = 0
      AND t.is_staff_exempt = 0

    LEFT JOIN platoons p
      ON p.course_id = c.id

    WHERE
      c.end_date IS NOT NULL
      AND DATE(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+05:00')) > c.end_date

      AND c.course_name NOT IN (
        'Admin',
        'Class 4 Staff',
        'Line Staff',
        'Drill Instructors',
        'Law Instructor',
        'Menial Staff',
        'Ministerial Staff'
      )

    GROUP BY
      c.id,
      c.course_name,
      c.start_date,
      c.end_date,
      c.zkbiotime_department_id,
      c.zkbiotime_dept_code

    ORDER BY
      c.end_date DESC
  `);

  console.table(rows);

  await pool.end();
})().catch(async (error) => {
  console.error(error);

  try {
    await pool.end();
  } catch (_) {}

  process.exit(1);
});
