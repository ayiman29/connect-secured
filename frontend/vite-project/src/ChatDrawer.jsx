import React, { useState, useEffect, useRef, useCallback } from "react";
import "./ChatDrawer.css";

export default function ChatDrawer({
  role = "student",
  targetStudentId = null,
  targetAdvisorId = null,
  externalOpen = null,
  onExternalToggle = null,
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = externalOpen !== null ? externalOpen : internalOpen;
  const toggleOpen = () => {
    if (onExternalToggle) {
      onExternalToggle(!isOpen);
    } else {
      setInternalOpen(!internalOpen);
    }
  };

  const [session, setSession] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState("");
  const [loadingSession, setLoadingSession] = useState(false);
  const [sending, setSending] = useState(false);

  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // 1. Fetch or create session
  const initSession = useCallback(async () => {
    setLoadingSession(true);
    try {
      let query = "";
      if (role === "student" && targetAdvisorId) {
        query = `?advisorId=${encodeURIComponent(targetAdvisorId)}`;
      } else if (role === "advisor" && targetStudentId) {
        query = `?studentId=${encodeURIComponent(targetStudentId)}`;
      }

      const res = await fetch(`/chat/session${query}`);
      if (!res.ok) throw new Error("Failed to load chat session");
      const data = await res.json();
      setSession(data);
    } catch (err) {
      console.error("Chat session init error:", err);
    } finally {
      setLoadingSession(false);
    }
  }, [role, targetAdvisorId, targetStudentId]);

  // 2. Load messages
  const loadMessages = useCallback(async (sessionId) => {
    if (!sessionId) return;
    try {
      const res = await fetch(`/chat/messages/${sessionId}`);
      if (!res.ok) return;
      const data = await res.json();
      setMessages(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Load messages error:", err);
    }
  }, []);

  // When drawer opens or target changes, init session
  useEffect(() => {
    if (isOpen) {
      initSession();
    }
  }, [isOpen, initSession]);

  // When session is ready, load messages and start polling
  useEffect(() => {
    if (!isOpen || !session?.session_id) return;
    loadMessages(session.session_id);

    const timer = setInterval(() => {
      loadMessages(session.session_id);
    }, 3500);

    return () => clearInterval(timer);
  }, [isOpen, session?.session_id, loadMessages]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Send message
  const handleSendMessage = async (e) => {
    e?.preventDefault?.();
    const text = inputText.trim();
    if (!text || !session?.session_id || sending) return;

    setSending(true);
    try {
      const res = await fetch("/chat/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: session.session_id,
          text,
        }),
      });

      if (!res.ok) throw new Error("Failed to send message");
      const newMsg = await res.json();
      setMessages((prev) => [...prev, newMsg]);
      setInputText("");
      setTimeout(scrollToBottom, 50);
    } catch (err) {
      console.error("Send message error:", err);
    } finally {
      setSending(false);
    }
  };

  const partnerInitials = session?.partner_name
    ? session.partner_name
        .split(/\s+/)
        .map((w) => w[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : role === "student"
    ? "AD"
    : "ST";

  const partnerDisplayName =
    session?.partner_name || (role === "student" ? "Academic Advisor" : `Student ${targetStudentId || ""}`);

  return (
    <div className="chat-widget">
      {!isOpen && (
        <button
          type="button"
          className="chat-launcher-btn"
          onClick={toggleOpen}
          aria-label="Open chat"
        >
          <span className="chat-launcher-icon">💬</span>
          <span>{role === "student" ? "Chat with Advisor" : "Student Chat"}</span>
        </button>
      )}

      {isOpen && (
        <div className="chat-window">
          {/* Header */}
          <div className="chat-header">
            <div className="chat-header-profile">
              <div className="chat-avatar">{partnerInitials}</div>
              <div>
                <div className="chat-header-name">{partnerDisplayName}</div>
                <div className="chat-header-status">
                  <span className="chat-status-dot" />
                  <span>End-to-end encrypted</span>
                </div>
              </div>
            </div>
            <button
              type="button"
              className="chat-close-btn"
              onClick={toggleOpen}
              aria-label="Close chat"
            >
              ✕
            </button>
          </div>

          {/* Messages Body */}
          <div className="chat-body">
            {loadingSession ? (
              <div className="chat-empty">Connecting secure session...</div>
            ) : messages.length === 0 ? (
              <div className="chat-empty">
                <div className="chat-empty-icon">👋</div>
                <div>
                  No messages yet. Send a message to start your conversation with your {role === "student" ? "advisor" : "student"}.
                </div>
              </div>
            ) : (
              messages.map((m) => {
                const isMe = m.sender_role === role;
                const timeStr = m.created_at
                  ? new Date(m.created_at).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "";

                return (
                  <div
                    key={m.message_id || Math.random()}
                    className={`chat-bubble-wrap ${isMe ? "me" : "partner"}`}
                  >
                    <div className="chat-bubble">{m.text}</div>
                    {timeStr && <div className="chat-time">{timeStr}</div>}
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Footer */}
          <form className="chat-footer" onSubmit={handleSendMessage}>
            <input
              type="text"
              className="chat-input"
              placeholder="Type your message..."
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              disabled={loadingSession}
            />
            <button
              type="submit"
              className="chat-send-btn"
              disabled={!inputText.trim() || sending || loadingSession}
              aria-label="Send message"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
              </svg>
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
