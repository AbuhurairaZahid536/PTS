// Regular sessions are not missed until the configured final punch window closes.
// Existing OPEN episodes remain absent across later not-yet-started sessions.
const effectiveAttendanceStatus = `CASE WHEN ar.attendance_status='ABSENT'
  AND ar.late_window_end>DATE_ADD(UTC_TIMESTAMP(),INTERVAL 5 HOUR)
  AND NOT EXISTS (SELECT 1 FROM absence_episodes pending_episode
    WHERE pending_episode.subject_type=ar.subject_type AND pending_episode.subject_id=ar.subject_id AND pending_episode.status='OPEN')
  THEN 'PENDING' ELSE ar.attendance_status END`;
module.exports = { effectiveAttendanceStatus };
