import { useEffect, useState } from "react";
import "./ProfileMenu.css";

export default function ProfileMenu({ user, onUserUpdated, onLogout }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", address: "", phone: "" });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const openProfile = async (editMode = false) => {
    setMenuOpen(false);
    setProfileOpen(true);
    setEditing(editMode);
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/auth/profile");
      if (!response.ok) throw new Error("Unable to load profile.");
      const data = await response.json();
      setForm({ name: data.name || "", email: data.email || "", address: data.address || "", phone: data.phone || "" });
    } catch (err) {
      setError(err.message || "Unable to load profile.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!profileOpen) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setProfileOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [profileOpen]);

  const saveProfile = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/auth/profile", {
        method: "PUT",
        body: JSON.stringify(form),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Unable to update profile.");
      const nextUser = { ...user, name: data.name, email: data.email };
      localStorage.setItem("user", JSON.stringify(nextUser));
      onUserUpdated(nextUser);
      setProfileOpen(false);
    } catch (err) {
      setError(err.message || "Unable to update profile.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="profile-menu">
        <button
          type="button"
          className="profile-menu__trigger"
          onClick={() => setMenuOpen((open) => !open)}
          aria-label="Account menu"
          aria-expanded={menuOpen}
        >
          ⋮
        </button>
        {menuOpen && (
          <div className="profile-menu__dropdown">
            <button type="button" onClick={() => openProfile(false)}>View profile</button>
            <button type="button" onClick={() => openProfile(true)}>Edit profile</button>
            <button type="button" onClick={onLogout}>Log out</button>
          </div>
        )}
      </div>

      {profileOpen && (
        <div className="profile-modal" role="dialog" aria-modal="true" aria-labelledby="profile-title">
          <form className="profile-modal__card" onSubmit={saveProfile}>
            <div className="profile-modal__header">
              <div>
                <p>Account</p>
                <h2 id="profile-title">{editing ? "Edit profile" : "View profile"}</h2>
              </div>
              <button type="button" onClick={() => setProfileOpen(false)} aria-label="Close profile">×</button>
            </div>
            {loading ? <p className="profile-modal__state">Loading profile...</p> : (
              <>
                {error ? <p className="profile-modal__error">{error}</p> : null}
                {editing ? (
                  <>
                    <label>Name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
                    <label>Email<input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></label>
                    <label>Address<input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Optional" /></label>
                    <label>Phone number<input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Optional" /></label>
                  </>
                ) : (
                  <dl className="profile-modal__details">
                    <div><dt>Name</dt><dd>{form.name || "Not provided"}</dd></div>
                    <div><dt>Email</dt><dd>{form.email || "Not provided"}</dd></div>
                    <div><dt>Address</dt><dd>{form.address || "Not provided"}</dd></div>
                    <div><dt>Phone number</dt><dd>{form.phone || "Not provided"}</dd></div>
                  </dl>
                )}
                <div className="profile-modal__actions">
                  <button type="button" onClick={onLogout}>Log out</button>
                  <button type="button" onClick={() => setProfileOpen(false)}>Cancel</button>
                  {editing ? <button type="submit" disabled={saving}>{saving ? "Saving..." : "Save changes"}</button> : null}
                </div>
              </>
            )}
          </form>
        </div>
      )}
    </>
  );
}
