"use strict";

const { pool } = require("../config/db");

// Matches the Public Website CMS lazy-infrastructure convention. This table is
// deliberately separate from attendance, trainees, and permission tables.
let setupPromise;
async function ensureSuggestionsTable() {
  if (!setupPromise) {
    setupPromise = pool.query(`
      CREATE TABLE IF NOT EXISTS public_site_suggestions (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        visitor_name VARCHAR(120) NULL,
        visitor_email VARCHAR(254) NOT NULL,
        suggestion_text TEXT NOT NULL,
        status ENUM('NEW','READ') NOT NULL DEFAULT 'NEW',
        email_status ENUM('PENDING','SENT','FAILED','NOT_CONFIGURED') NOT NULL DEFAULT 'PENDING',
        email_error VARCHAR(255) NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        read_at TIMESTAMP NULL,
        read_by BIGINT NULL,
        PRIMARY KEY (id),
        KEY idx_public_suggestions_status (status, created_at),
        KEY idx_public_suggestions_created (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `).catch((error) => {
      setupPromise = null;
      throw error;
    });
  }
  await setupPromise;
}

async function createSuggestion({ name, email, suggestion }) {
  await ensureSuggestionsTable();
  const [result] = await pool.execute(
    `INSERT INTO public_site_suggestions (visitor_name,visitor_email,suggestion_text)
     VALUES (?,?,?)`,
    [name || null, email, suggestion],
  );
  return result.insertId;
}

async function updateAcknowledgement(id, status, errorMessage = null) {
  await pool.execute(
    `UPDATE public_site_suggestions SET email_status=?,email_error=? WHERE id=?`,
    [status, errorMessage ? String(errorMessage).slice(0, 255) : null, id],
  );
}

async function listSuggestions(limit = 50, offset = 0) {
  await ensureSuggestionsTable();
  const n = Math.max(1, Math.min(100, Math.floor(Number(limit) || 50)));
  const start = Math.max(0, Math.min(1000000, Math.floor(Number(offset) || 0)));
  const [rows] = await pool.query(
    `SELECT id,visitor_name,visitor_email,suggestion_text,status,email_status,created_at,read_at
     FROM public_site_suggestions ORDER BY created_at DESC,id DESC LIMIT ${n} OFFSET ${start}`,
  );
  return rows;
}

async function countSuggestions() {
  await ensureSuggestionsTable();
  const [[row]] = await pool.query("SELECT COUNT(*) AS total FROM public_site_suggestions");
  return Number(row.total) || 0;
}

async function countUnread() {
  await ensureSuggestionsTable();
  const [[row]] = await pool.query(
    "SELECT COUNT(*) AS unread FROM public_site_suggestions WHERE status='NEW'",
  );
  return Number(row.unread) || 0;
}

async function markSuggestionRead(id, userId) {
  await ensureSuggestionsTable();
  const [result] = await pool.execute(
    `UPDATE public_site_suggestions
     SET status='READ',read_at=COALESCE(read_at,NOW()),read_by=COALESCE(read_by,?)
     WHERE id=?`,
    [userId || null, id],
  );
  return result.affectedRows > 0;
}

module.exports = {
  createSuggestion,
  updateAcknowledgement,
  listSuggestions,
  countUnread,
  countSuggestions,
  markSuggestionRead,
};
