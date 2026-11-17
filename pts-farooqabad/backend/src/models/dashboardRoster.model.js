const { pool } = require("../config/db");

async function getAllTraineesForDashboard() {
  const [rows] = await pool.query(`
    SELECT
      t.id,
      COALESCE(NULLIF(t.zkteco_emp_code,''),t.employee_id) AS employee_id,
      t.zkteco_emp_code AS biotime_emp_code,
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
        OR DATE(DATE_ADD(UTC_TIMESTAMP(),INTERVAL 5 HOUR)) < c.start_date
        OR c.end_date >= DATE(DATE_ADD(UTC_TIMESTAMP(),INTERVAL 5 HOUR))
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

// Match the unfiltered All Staff list: every non-deleted person, including
// staff without attendance records, a category, or a regular timetable.
async function getAllStaffForDashboard() {
  const [rows] = await pool.query(`
    SELECT s.id, COALESCE(NULLIF(s.zkteco_emp_code,''),s.employee_id) AS employee_id, s.belt_no,
      s.first_name, s.last_name, s.status, s.designation,
      s.category_id, sc.category_name, s.branch_id, sb.branch_name
    FROM staff s
    LEFT JOIN staff_categories sc ON sc.id = s.category_id
    LEFT JOIN staff_branches sb ON sb.id = s.branch_id
    WHERE s.is_deleted = 0
    ORDER BY s.id DESC
  `);
  return rows;
}

module.exports = {
  getAllTraineesForDashboard,
  getAllStaffForDashboard,
};
