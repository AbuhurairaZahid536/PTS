"use strict";

const {
  createSuggestion,
  updateAcknowledgement,
  listSuggestions,
  countUnread,
  countSuggestions,
  markSuggestionRead,
} = require("../models/publicSuggestions.model");
const { sendSuggestionAcknowledgement } = require("../services/publicSuggestionEmail.service");
const logger = require("../utils/logger");

const isValidEmail = (value) =>
  /^[^\s@<>]{1,64}@[^\s@<>]{1,190}\.[^\s@<>]{2,}$/.test(value);

async function submitSuggestion(req, res, next) {
  try {
    // Honeypot: discard bot requests without storing junk in the inbox.
    if (req.body?.website) {
      return res.status(202).json({ success: true, message: "Thank you for your feedback." });
    }
    const name = String(req.body?.name || "").trim();
    const email = String(req.body?.email || "").trim().toLowerCase();
    const suggestion = String(req.body?.suggestion || "").trim();
    if (name.length > 120 || !isValidEmail(email) || email.length > 254 ||
        suggestion.length < 10 || suggestion.length > 3000 || req.body?.consent !== true) {
      return res.status(400).json({ success: false,
        message: "Enter a valid email, suggestion (10–3000 characters), and consent." });
    }
    const id = await createSuggestion({ name, email, suggestion });
    // Save feedback first; email-delivery failure must not lose the submission.
    try {
      const delivery = await sendSuggestionAcknowledgement({ to: email, name });
      await updateAcknowledgement(id, delivery.status);
    } catch (error) {
      logger.warn({ suggestionId: id, error: error.message }, "Suggestion acknowledgement failed");
      await updateAcknowledgement(id, "FAILED", error.message).catch(() => {});
    }
    return res.status(201).json({ success: true,
      message: "Thank you. Your valuable suggestion has been received." });
  } catch (error) {
    return next(error);
  }
}

async function getSuggestionNotifications(req, res, next) {
  try {
    const [unread, total, suggestions] = await Promise.all([
      countUnread(), countSuggestions(), listSuggestions(req.query?.limit, req.query?.offset),
    ]);
    return res.json({ success: true, data: { unread, total, suggestions } });
  } catch (error) { return next(error); }
}

async function markNotificationRead(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) {
      return res.status(400).json({ success: false, message: "Invalid suggestion ID." });
    }
    const updated = await markSuggestionRead(id, req.user?.id);
    if (!updated) {
      return res.status(404).json({ success: false, message: "Suggestion not found." });
    }
    return res.json({ success: true, message: "Suggestion marked as read." });
  } catch (error) { return next(error); }
}

module.exports = { submitSuggestion, getSuggestionNotifications, markNotificationRead };
