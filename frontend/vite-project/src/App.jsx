import React, { useEffect, useMemo, useState } from "react";
import StudentView from "./StudentView";
import AdvisorView from "./AdvisorView";
import AuthView from "./AuthView";
import RegistrarView from "./RegistrarView";
import ProfileMenu from "./ProfileMenu";


const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5050";
const API_PREFIXES = ["/auth", "/students", "/advisors", "/registrar", "/chat", "/comments"];
const _fetch = window.fetch.bind(window);

window.fetch = (input, init = {}) => {
  let url = typeof input === "string" ? input : input.url;

  // If it's a relative path to our API, prefix with API_URL
  const isRelative = typeof url === "string" && url.startsWith("/") && !url.startsWith("//");
  if (isRelative && API_PREFIXES.some((p) => url.startsWith(p))) {
    url = API_URL.replace(/\/$/, "") + url;
  }

  const headers = new Headers(init.headers || {});
  const token = localStorage.getItem("token");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  return _fetch(url, { ...init, headers });
};

function getStoredUser() {
  try {
    const raw = localStorage.getItem("user");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function getToken() {
  return localStorage.getItem("token");
}

export default function App() {
  const [user, setUser] = useState(() => getStoredUser());
  const isAuthed = !!getToken() && !!user?.role;

  // refreshes user when tab gains focus
  useEffect(() => {
    const onFocus = () => setUser(getStoredUser());
    window.addEventListener("focus", onFocus);

    //  respond to cross-tab logins/logouts
    const onStorage = (e) => {
      if (e.key === "user" || e.key === "token") setUser(getStoredUser());
    };
    window.addEventListener("storage", onStorage);

    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setUser(null);
  };

  const view = useMemo(() => {
    if (!isAuthed) return <AuthView />;
    if (user.role === "student") return <StudentView />;
    if (user.role === "advisor") return <AdvisorView />;
    if (user.role === "registrar") return <RegistrarView />;
    return <AuthView />; // fallback
  }, [isAuthed, user]);

  return (
    <>
      {isAuthed && (
        <ProfileMenu
          user={user}
          onUserUpdated={setUser}
          onLogout={handleLogout}
        />
      )}

      {view}
    </>
  );
}
