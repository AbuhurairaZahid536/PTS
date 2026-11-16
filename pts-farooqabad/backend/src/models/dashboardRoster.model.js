const { pool } = require("../config/db");

async function getAllTraineesForDashboard() {
  const [rows] = await pool.query(`
    SELECT
      t.id,
      t.employee_id,
      t.belt_no,
      t.first_name,
      t.last_name,
      t.father_name,
      t.status,
      t.course_id,
      c.course_name,
      c.course_code,
      c.start_date AS course_start_date,
      c.end_date AS course_end_date,
      t.platoon_id,
      p.platoon_number,
      p.platoon_name
    FROM trainees t
    LEFT JOIN courses c
      ON c.id = t.course_id
    LEFT JOIN platoons p
      ON p.id = t.platoon_id
    WHERE
      t.is_deleted = 0
      AND t.is_staff_exempt = 0
      AND (
        c.start_date IS NULL
        OR c.end_date IS NULL
        OR CURDATE() < c.start_date
        OR c.end_date >= CURDATE()
      )
    ORDER BY
      c.start_date DESC,
      c.course_name ASC,
      p.platoon_number ASC,
      t.employee_id ASC,
      t.id ASC
  `);

  return rows;
}

module.exports = {
  getAllTraineesForDashboard,
};
