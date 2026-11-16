"use strict";

/**
 * Resend REST delivery uses Node's native fetch (no extra npm dependency).
 * Requires a verified sender/domain in the mail provider before delivery works.
 */
async function sendSuggestionAcknowledgement({ to, name }) {
  const apiKey = String(process.env.RESEND_API_KEY || "").trim();
  const from = String(process.env.PUBLIC_SUGGESTION_FROM_EMAIL || "").trim();
  if (!apiKey || !from) {
    return { status: "NOT_CONFIGURED" };
  }

  const displayName = (name || "Visitor").replace(/[<>]/g, "");
  const safeName = displayName.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  const plainText =
    `Dear ${displayName},\n\n` +
    "Thank you for sharing your valuable suggestion with Police Training School Farooqabad. " +
    "We appreciate your time and feedback. Your suggestion has been received for review by the concerned office.\n\n" +
    "Regards,\nPolice Training School Farooqabad\n" +
    "This is an automated acknowledgement; please do not reply.";

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: "Thank you for your valuable suggestion — PTS Farooqabad",
      text: plainText,
      html:
        `<p>Dear ${safeName},</p>` +
        "<p>Thank you for sharing your valuable suggestion with <strong>Police Training School Farooqabad</strong>. " +
        "We appreciate your time and feedback. Your suggestion has been received for review by the concerned office.</p>" +
        "<p>Regards,<br/>Police Training School Farooqabad</p>" +
        "<p><small>This is an automated acknowledgement; please do not reply.</small></p>",
    }),
    signal: AbortSignal.timeout(6000),
  });
  if (!response.ok) {
    // Never include provider responses containing user email in application logs.
    throw new Error(`Mail provider returned HTTP ${response.status}`);
  }
  return { status: "SENT" };
}

module.exports = { sendSuggestionAcknowledgement };
