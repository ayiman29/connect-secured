import { useCallback, useEffect, useMemo, useState } from "react";
import "./ChatWidget.css";

const API_PREFIX = "/chat";

async function chatRequest(path, options = {}) {
  const response = await fetch(`${API_PREFIX}${path}`, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });

  if (!response.ok) {
    const message = await response.text().catch(() => response.statusText);
    throw new Error(message || "Chat request failed.");
  }

  return response.headers.get("content-type")?.includes("application/json")
    ? response.json()
    : null;
}

function formatMessageTime(value) {
  if (!value) return "";
  return new Date(value).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export default function ChatWidget({ role, studentId }) {
  const [open, setOpen] = useState(false);
  const [session, setSession] = useState(null);
  const [advisors, setAdvisors] = useState([]);
  const [selectedAdvisorId, setSelectedAdvisorId] = useState("");
  const [contacts, setContacts] = useState([]);
  const [selectedStudentId, setSelectedStudentId] = useState(String(studentId || ""));
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingAdvisors, setLoadingAdvisors] = useState(false);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const canOpen = role === "student" || role === "advisor";
  const isStudent = role === "student";

  const loadMessages = useCallback(async (sessionId) => {
    const data = await chatRequest(`/messages/${encodeURIComponent(sessionId)}`);
    setMessages(Array.isArray(data) ? data : []);
  }, []);

  const loadAdvisors = useCallback(async () => {
    if (!isStudent) return;
    setLoadingAdvisors(true);
    setError("");
    try {
      const data = await chatRequest("/advisors");
      const available = Array.isArray(data) ? data : [];
      setAdvisors(available);
      setSelectedAdvisorId((current) => {
        if (available.some((advisor) => String(advisor.advisor_id) === String(current))) return current;
        return available[0] ? String(available[0].advisor_id) : "";
      });
      if (available.length === 0) setError("No advisors are available for messaging.");
    } catch (err) {
      setError(err.message || "Unable to load advisors.");
      setAdvisors([]);
    } finally {
      setLoadingAdvisors(false);
    }
  }, [isStudent]);

  const loadContacts = useCallback(async () => {
    if (isStudent) return;
    setLoadingContacts(true);
    setError("");
    try {
      const data = await chatRequest("/advisor/contacts");
      const available = Array.isArray(data) ? data : [];
      const currentStudentId = String(studentId || "");
      const hasCurrentStudent = available.some((contact) => String(contact.student_id) === currentStudentId);
      const contactsWithCurrent = currentStudentId && !hasCurrentStudent
        ? [{ student_id: currentStudentId, student_name: `Student ${currentStudentId}` }, ...available]
        : available;

      setContacts(contactsWithCurrent);
      setSelectedStudentId((current) => {
        if (contactsWithCurrent.some((contact) => String(contact.student_id) === String(current))) return current;
        return contactsWithCurrent[0] ? String(contactsWithCurrent[0].student_id) : "";
      });
      if (contactsWithCurrent.length === 0) setError("No student conversations yet.");
    } catch (err) {
      setError(err.message || "Unable to load student conversations.");
      setContacts([]);
    } finally {
      setLoadingContacts(false);
    }
  }, [isStudent, studentId]);

  const openSession = useCallback(async () => {
    if (!canOpen) return;
    if (isStudent && !selectedAdvisorId) return;
    if (!isStudent && !selectedStudentId) return;
    setLoading(true);
    setError("");
    try {
      const query = isStudent
        ? `?advisorId=${encodeURIComponent(selectedAdvisorId)}`
        : `?studentId=${encodeURIComponent(selectedStudentId)}`;
      const data = await chatRequest(`/session${query}`);
      setSession(data);
      await loadMessages(data.session_id);
    } catch (err) {
      setError(err.message || "Unable to open chat.");
      setSession(null);
      setMessages([]);
    } finally {
      setLoading(false);
    }
  }, [canOpen, isStudent, loadMessages, selectedAdvisorId, selectedStudentId]);

  useEffect(() => {
    if (open && isStudent) loadAdvisors();
  }, [isStudent, loadAdvisors, open]);

  useEffect(() => {
    if (open && !isStudent) loadContacts();
  }, [isStudent, loadContacts, open]);

  useEffect(() => {
    if (open && ((isStudent && selectedAdvisorId) || (!isStudent && selectedStudentId))) openSession();
  }, [isStudent, open, openSession, selectedAdvisorId, selectedStudentId]);

  const handleRecipientChange = (event) => {
    const recipientId = event.target.value;
    if (isStudent) setSelectedAdvisorId(recipientId);
    else setSelectedStudentId(recipientId);
    setSession(null);
    setMessages([]);
    setError("");
  };

  useEffect(() => {
    if (!open || !session?.session_id) return undefined;
    const timer = window.setInterval(() => {
      loadMessages(session.session_id).catch(() => {});
    }, 5000);
    return () => window.clearInterval(timer);
  }, [loadMessages, open, session?.session_id]);

  const sendMessage = async (event) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text || !session?.session_id || sending) return;

    setSending(true);
    setError("");
    try {
      const message = await chatRequest("/send", {
        method: "POST",
        body: JSON.stringify({ sessionId: session.session_id, text }),
      });
      setMessages((previous) => [...previous, message]);
      setDraft("");
    } catch (err) {
      setError(err.message || "Unable to send message.");
    } finally {
      setSending(false);
    }
  };

  const title = useMemo(() => {
    if (session?.partner_name) return session.partner_name;
    return isStudent ? "Your advisor" : "Student conversation";
  }, [isStudent, session?.partner_name]);

  return (
    <>
      <button
        type="button"
        className={`chat-launcher${open ? " chat-launcher--active" : ""}`}
        onClick={() => canOpen && setOpen((value) => !value)}
        disabled={!canOpen}
        aria-label="Open messages"
        title="Messages"
      >
        <span aria-hidden="true">{open ? "×" : "✉"}</span>
        <span className="chat-launcher__label">Messages</span>
      </button>

      {open && (
        <section className="chat-drawer" aria-label="Messages">
          <header className="chat-drawer__header">
            <div>
              <p className="chat-drawer__eyebrow">Messages</p>
              <h2>{title}</h2>
            </div>
            <button type="button" className="chat-drawer__close" onClick={() => setOpen(false)} aria-label="Close messages">
              ×
            </button>
          </header>

          {isStudent && (
            <div className="chat-recipient">
              <label htmlFor="chat-advisor">Message an advisor</label>
              <select
                id="chat-advisor"
                value={selectedAdvisorId}
                onChange={handleRecipientChange}
                disabled={loadingAdvisors || advisors.length === 0}
              >
                {advisors.length === 0 ? <option value="">No advisors available</option> : null}
                {advisors.map((advisor) => (
                  <option key={advisor.advisor_id} value={advisor.advisor_id}>
                    {advisor.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {!isStudent && (
            <div className="chat-recipient">
              <label htmlFor="chat-student">Message a student</label>
              <select
                id="chat-student"
                value={selectedStudentId}
                onChange={handleRecipientChange}
                disabled={loadingContacts || contacts.length === 0}
              >
                {contacts.length === 0 ? <option value="">No student conversations</option> : null}
                {contacts.map((contact) => (
                  <option key={contact.student_id} value={contact.student_id}>
                    {contact.student_name || `Student ${contact.student_id}`}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="chat-drawer__body">
            {loading || loadingAdvisors || loadingContacts ? <p className="chat-state">Opening conversation...</p> : null}
            {!loading && error ? <p className="chat-state chat-state--error">{error}</p> : null}
            {!loading && !error && messages.length === 0 ? (
              <p className="chat-state">No messages yet. Start the conversation.</p>
            ) : null}
            {!loading && !error && messages.length > 0 ? (
              <div className="chat-messages" aria-live="polite">
                {messages.map((message) => {
                  const mine = message.sender_role === role;
                  return (
                    <div className={`chat-message${mine ? " chat-message--mine" : ""}`} key={message.message_id}>
                      <div className="chat-message__bubble">{message.text}</div>
                      <time dateTime={message.created_at}>{formatMessageTime(message.created_at)}</time>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>

          <form className="chat-composer" onSubmit={sendMessage}>
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Write a message..."
              rows={2}
              disabled={!session || sending}
              aria-label="Message"
            />
            <button type="submit" disabled={!session || !draft.trim() || sending}>
              {sending ? "Sending..." : "Send"}
            </button>
          </form>
        </section>
      )}
    </>
  );
}
