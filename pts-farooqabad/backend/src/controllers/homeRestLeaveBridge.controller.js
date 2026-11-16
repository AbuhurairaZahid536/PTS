/*
 * Leave Management only: edit/cancel the Home Rest component of an existing
 * Outdoor/Medical record. Never create a Leave record or cancel Outdoor/Medical.
 * Editing is delegated to the existing Outdoor controller to preserve overlap,
 * training-course, individual Long Weekend, audit and validation rules.
 */
const {
  normalizeSubjectType,
  getOutdoorById,
} = require("../models/outdoor.model");
const { editOutdoor } = require("./outdoor.controller");

function asSqlDateTime(value) {
  if (!value) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    // SQL DATETIME is stored in the server's MySQL-local civil clock.
    const pad = (n) => String(n).padStart(2, "0");
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())} ${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`;
  }
  return String(value).replace("T", " ").slice(0, 19);
}

function existingOutdoorBody(record) {
  return {
    outdoor_purpose: record.outdoor_purpose,
    location: record.location,
    start_datetime: asSqlDateTime(record.start_datetime),
    end_datetime: asSqlDateTime(record.end_datetime),
    reference_no: record.reference_no,
    doctor_name: record.doctor_name,
    doctor_checked_datetime: asSqlDateTime(record.doctor_checked_datetime),
    doctor_recommendation: record.doctor_recommendation,
    medical_rest: Boolean(record.medical_rest),
    medical_rest_start_datetime: asSqlDateTime(record.medical_rest_start_datetime),
    medical_rest_end_datetime: asSqlDateTime(record.medical_rest_end_datetime),
    home_rest: Boolean(record.home_rest),
    home_rest_start_datetime: asSqlDateTime(record.home_rest_start_datetime),
    home_rest_end_datetime: asSqlDateTime(record.home_rest_end_datetime),
    remarks: record.remarks,
  };
}

async function updateHomeRestFromLeave(req, res, next) {
  try {
    const subjectType = normalizeSubjectType(req.params.subjectType);
    const id = Number(req.params.id);
    if (!subjectType || !Number.isInteger(id) || id < 1) {
      return res.status(400).json({ success: false, message: "Invalid Home Rest record." });
    }
    const existing = await getOutdoorById(subjectType, id);
    // A Leave permission cannot be used to modify ordinary Outdoor/Medical.
    if (!existing || !Boolean(existing.home_rest)) {
      return res.status(404).json({ success: false, message: "Home Rest record not found." });
    }
    if (String(existing.workflow_status).toUpperCase() !== "ACTIVE") {
      return res.status(409).json({ success: false, message: "Only active Home Rest may be modified." });
    }
    const cancellation = req.path.endsWith("/cancel");
    const originalPayload = req.body || {};
    const nextBody = existingOutdoorBody(existing);
    if (cancellation) {
      const reason = String(originalPayload.cancellation_reason || "").trim();
      if (!reason) {
        return res.status(400).json({ success: false, message: "Cancellation Reason is required." });
      }
      if (reason.length > 500) {
        return res.status(400).json({ success: false, message: "Cancellation Reason is too long." });
      }
      // Preserve the source record, its Outdoor status and any Medical Rest.
      // Store reason in audited Outdoor remarks (same existing audit pipeline).
      nextBody.home_rest = false;
      nextBody.home_rest_start_datetime = null;
      nextBody.home_rest_end_datetime = null;
      nextBody.remarks = [existing.remarks, `Home Rest cancelled: ${reason}`]
        .filter(Boolean).join("\n");
    } else {
      nextBody.home_rest_start_datetime = originalPayload.home_rest_start_datetime;
      nextBody.home_rest_end_datetime = originalPayload.home_rest_end_datetime;
    }
    // Never forward arbitrary client fields to the general editOutdoor route.
    req.body = nextBody;
    return editOutdoor(req, res, next);
  } catch (error) {
    return next(error);
  }
}

module.exports = { updateHomeRestFromLeave };
