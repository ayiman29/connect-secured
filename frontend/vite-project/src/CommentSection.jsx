import { useCallback, useEffect, useMemo, useState } from "react";
import "./CommentSection.css";

function getUser() {
  try {
    return JSON.parse(localStorage.getItem("user") || "null");
  } catch {
    return null;
  }
}

function getTokenUserId() {
  try {
    const token = localStorage.getItem("token");
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.userId;
  } catch {
    return null;
  }
}

function formatDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

async function request(path, options = {}) {
  const response = await fetch(`/comments${path}`, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  if (!response.ok) {
    const message = await response.text().catch(() => response.statusText);
    throw new Error(message || "Comment request failed.");
  }
  return response.headers.get("content-type")?.includes("application/json") ? response.json() : null;
}

export default function CommentSection() {
  const user = useMemo(() => getUser(), []);
  const currentUserId = useMemo(() => getTokenUserId(), []);
  const [comments, setComments] = useState([]);
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editingText, setEditingText] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const loadComments = useCallback(async () => {
    try {
      const data = await request("");
      setComments(Array.isArray(data) ? data : []);
      setError("");
    } catch (err) {
      setError(err.message || "Unable to load comments.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadComments();
    const timer = window.setInterval(loadComments, 60 * 1000);
    return () => window.clearInterval(timer);
  }, [loadComments]);

  const submitComment = async (event) => {
    event.preventDefault();
    const content = draft.trim();
    if (!content || saving) return;
    setSaving(true);
    try {
      await request("", { method: "POST", body: JSON.stringify({ content }) });
      setDraft("");
      await loadComments();
    } catch (err) {
      setError(err.message || "Unable to add comment.");
    } finally {
      setSaving(false);
    }
  };

  const saveEdit = async (commentId) => {
    const content = editingText.trim();
    if (!content || saving) return;
    setSaving(true);
    try {
      await request(`/${commentId}`, { method: "PUT", body: JSON.stringify({ content }) });
      setEditingId(null);
      setEditingText("");
      await loadComments();
    } catch (err) {
      setError(err.message || "Unable to edit comment.");
    } finally {
      setSaving(false);
    }
  };

  const removeComment = async (commentId) => {
    if (saving) return;
    setSaving(true);
    try {
      await request(`/${commentId}`, { method: "DELETE" });
      await loadComments();
    } catch (err) {
      setError(err.message || "Unable to delete comment.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="comment-section" aria-labelledby="comment-title">
      <div className="comment-section__header">
        <div>
          <p className="comment-section__eyebrow">Community</p>
          <h2 id="comment-title">Comment</h2>
          <p>Share a short update with other users. Comments disappear automatically after 24 hours.</p>
        </div>
      </div>

      <form className="comment-composer" onSubmit={submitComment}>
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Write a comment..."
          maxLength={2000}
          rows={3}
          disabled={saving}
          aria-label="New comment"
        />
        <div className="comment-composer__footer">
          <span>{draft.length}/2000</span>
          <button type="submit" disabled={saving || !draft.trim()}>{saving ? "Posting..." : "Post comment"}</button>
        </div>
      </form>

      {error ? <p className="comment-error">{error}</p> : null}
      {loading ? <p className="comment-empty">Loading comments...</p> : null}
      {!loading && comments.length === 0 ? <p className="comment-empty">No comments yet.</p> : null}

      <div className="comment-list">
        {comments.map((comment) => {
          const isOwner = String(comment.user_id) === String(currentUserId);
          const canDelete = isOwner || user?.role === "registrar";
          const isEditing = editingId === comment.comment_id;
          return (
            <article className="comment-item" key={comment.comment_id}>
              <div className="comment-item__topline">
                <div>
                  <strong>{comment.author_name}</strong>
                  <span>{formatDate(comment.created_at)}</span>
                </div>
                <span className="comment-item__expiry">Expires {formatDate(comment.expires_at)}</span>
              </div>
              {isEditing ? (
                <textarea
                  className="comment-item__edit"
                  value={editingText}
                  onChange={(event) => setEditingText(event.target.value)}
                  maxLength={2000}
                  rows={3}
                />
              ) : (
                <p>{comment.content}</p>
              )}
              {(isOwner || canDelete) ? (
                <div className="comment-item__actions">
                  {isOwner && (isEditing ? (
                    <>
                      <button type="button" onClick={() => saveEdit(comment.comment_id)} disabled={saving}>Save</button>
                      <button type="button" onClick={() => setEditingId(null)} disabled={saving}>Cancel</button>
                    </>
                  ) : (
                    <button type="button" onClick={() => { setEditingId(comment.comment_id); setEditingText(comment.content); }}>Edit</button>
                  ))}
                  {canDelete ? <button type="button" onClick={() => removeComment(comment.comment_id)} disabled={saving}>Delete</button> : null}
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
