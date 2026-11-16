import { useState } from "react";
import api from "../services/api";
import "../publicEnhancementsV2.css";

export default function PublicSuggestionForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [suggestion, setSuggestion] = useState("");
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);

  const submit = async (event) => {
    event.preventDefault();
    if (busy) return;
    setNotice(null);
    setBusy(true);
    try {
      const result = await api.post("/public-site/suggestions", { name, email, suggestion, consent, website });
      setNotice({ success: true, text: result.data?.message || "Thank you. Your suggestion has been received." });
      setSuggestion("");
      setConsent(false);
    } catch (error) {
      setNotice({ success: false, text: error.response?.data?.message || "Could not submit your suggestion. Please try again." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="pts-suggestion-box pts-suggestion-compact" aria-labelledby="pts-suggestion-title">
      <div className="pts-suggestion-heading">
        <span>WE VALUE YOUR FEEDBACK</span>
        <h3 id="pts-suggestion-title">Suggestions & Feedback</h3>
      </div>
      <form onSubmit={submit} className="pts-suggestion-form">
        <div className="pts-suggestion-inputs">
          <label>
            Your Name <small>(optional)</small>
            <input type="text" maxLength={120} autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Full name" />
          </label>
          <label>
            Email Address <span aria-hidden="true">*</span>
            <input type="email" required maxLength={254} autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" />
          </label>
        </div>
        <label>
          Your Suggestion <span aria-hidden="true">*</span>
          <textarea required minLength={10} maxLength={3000} rows={3} value={suggestion} onChange={(event) => setSuggestion(event.target.value)} placeholder="Share your suggestion with us (10–3000 characters)" />
        </label>
        <label className="pts-suggestion-consent">
          <input type="checkbox" checked={consent} required onChange={(event) => setConsent(event.target.checked)} />
          <span>I consent to institutional review and an email acknowledgement.</span>
        </label>
        <label className="pts-suggestion-honeypot" aria-hidden="true">Website<input tabIndex={-1} autoComplete="off" value={website} onChange={(event) => setWebsite(event.target.value)} /></label>
        <div className="pts-suggestion-actions">
          <span>Your suggestion and email will not be displayed publicly.</span>
          <button type="submit" disabled={busy}>{busy ? "Submitting..." : "Send Feedback"}</button>
        </div>
        {notice && <p role="status" className={`pts-suggestion-response ${notice.success ? "success" : "error"}`}>{notice.text}</p>}
      </form>
    </section>
  );
}
