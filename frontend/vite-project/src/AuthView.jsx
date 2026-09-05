import React, { useState } from "react";
import bracuLogo from "./assets/bracu_logo_transparent_allwhite.png";
import "./Login.css";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5050";

async function apiRequest(path, body) {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || "Request failed");
  return data;
}

// diff roles
async function loginSmart({ email, password }) {
  const roles = ["student", "advisor", "registrar"];
  let lastErr;
  for (const role of roles) {
    try {
      const data = await apiRequest("/auth/login", { email, password, role });
      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user)); 
      return data;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("Login failed");
}

async function signupUser(payload) {

  return apiRequest("/auth/signup", payload);
}

function Brand() {
  return (
    <header className="brand">
      <img src={bracuLogo} alt="BRAC University" className="brand__logo" />
      <h1 className="brand__title">Bracu Central Login</h1>
    </header>
  );
}

function EyeIcon({ open }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path
        d="M12 5C7 5.2 3 8 1.2 12c1.8 4 5.8 6.8 10.8 7 5-.2 9-3 10.8-7C21 8 17 5.2 12 5Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      {open ? (
        <circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.8" />
      ) : (
        <path d="M3 3L21 21" stroke="currentColor" strokeWidth="1.8" />
      )}
    </svg>
  );
}

// sign in
function LoginForm({ onSwitch }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);

  const canSubmit = username.trim().length > 0 && password.length > 0;

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;

    try {
      const { user } = await loginSmart({ email: username.trim(), password });

      if (user.role === "advisor") window.location.href = "/advisor";
      else if (user.role === "registrar") window.location.href = "/registrar";
      else window.location.href = "/student";
    } catch (err) {
      alert(err.message || "Login failed");
    }
  };

  return (
    <>
      <h2 className="login-card__heading">Sign in to your account</h2>

      <form className="login-form" onSubmit={onSubmit} autoComplete="on">

        <label htmlFor="li-username" className="field__label">
          Email
        </label>
        <input
          id="li-username"
          className="field__input"
          type="text"
          placeholder="Enter email"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
        />

        {/* Password */}
        <label htmlFor="li-password" className="field__label">
          Password
        </label>
        <div className="field__input-wrap">
          <input
            id="li-password"
            className="field__input field__input--pw"
            type={showPw ? "text" : "password"}
            placeholder="Enter your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
          <button
            type="button"
            className="pw-toggle"
            aria-label={showPw ? "Hide password" : "Show password"}
            onClick={() => setShowPw((v) => !v)}
          >
            <EyeIcon open={showPw} />
          </button>
        </div>

        {/* swiych to sign up */}
        <div className="form-row form-row--right">
          <a
            href="#"
            className="link"
            onClick={(e) => {
              e.preventDefault();
              onSwitch();
            }}
          >
            No account? Sign up here
          </a>
        </div>

        {/* submit */}
        <button type="submit" className="btn btn-primary" disabled={!canSubmit}>
          Sign In
        </button>
      </form>
    </>
  );
}

// sign up
function SignupForm({ onSwitch }) {
  const [fullName, setFullName] = useState("");
  const [userId, setUserId] = useState("");
  const [email, setEmail] = useState("");
  const [accountType, setAccountType] = useState("student"); // student | advisor | registrar
  const [credit, setCredit] = useState(""); // optional if student
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [sending, setSending] = useState(false);

  const canSubmit =
    fullName.trim().length > 0 &&
    userId.trim().length > 0 &&
    email.trim().length > 0 &&
    password.length > 0;

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;

    setSending(true);
    try {
      const payload = {
        name: fullName.trim(),
        id: userId.trim(),
        email: email.trim(),
        role: accountType, 
        password,
      };
      if (accountType === "student" && credit !== "") {
        payload.credit = Number(credit);
      }

      await signupUser(payload);
      alert("Signup successful! Please sign in.");
      onSwitch();
    } catch (err) {
      alert(err.message || "Sign up failed");
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <h2 className="login-card__heading">Create your account</h2>

      <form className="login-form" onSubmit={onSubmit} autoComplete="on">
        {/* Full name */}
        <label htmlFor="su-name" className="field__label">
          Full name
        </label>
        <input
          id="su-name"
          className="field__input"
          type="text"
          placeholder="Your name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          autoComplete="name"
        />

        {/* User ID */}
        <label htmlFor="su-userid" className="field__label">
          User ID
        </label>
        <input
          id="su-userid"
          className="field__input"
          type="text"
          placeholder="e.g., 23301211"
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          autoComplete="username"
        />

        {/* Email */}
        <label htmlFor="su-email" className="field__label">
          Email
        </label>
        <input
          id="su-email"
          className="field__input"
          type="email"
          placeholder="you@bracu.ac.bd"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
        />

        {/* Account type */}
        <label htmlFor="su-role" className="field__label">
          Account type
        </label>
        <select
          id="su-role"
          className="field__input"
          value={accountType}
          onChange={(e) => setAccountType(e.target.value)}
        >
          <option value="student">Student</option>
          <option value="advisor">Advisor</option>
          <option value="registrar">Registrar</option>
        </select>

        {/* Credits (only for student) */}
        {accountType === "student" && (
          <>
            <label htmlFor="su-credit" className="field__label">
              Initial Credits (optional)
            </label>
            <input
              id="su-credit"
              className="field__input"
              type="number"
              min="0"
              placeholder="0"
              value={credit}
              onChange={(e) => setCredit(e.target.value)}
            />
          </>
        )}


        <label htmlFor="su-password" className="field__label">
          Password
        </label>
        <div className="field__input-wrap">
          <input
            id="su-password"
            className="field__input field__input--pw"
            type={showPw ? "text" : "password"}
            placeholder="Create a password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            minLength={6}
          />
          <button
            type="button"
            className="pw-toggle"
            aria-label={showPw ? "Hide password" : "Show password"}
            onClick={() => setShowPw((v) => !v)}
          >
            <EyeIcon open={showPw} />
          </button>
        </div>

        {/* Switch to sign in */}
        <div className="form-row form-row--right" style={{ marginTop: 2 }}>
          <a
            href="#"
            className="link"
            onClick={(e) => {
              e.preventDefault();
              onSwitch();
            }}
          >
            Already have an account? Sign in
          </a>
        </div>

        {/* Submit */}
        <button className="btn btn-primary" type="submit" disabled={!canSubmit || sending}>
          {sending ? "Creating…" : "Sign Up"}
        </button>
      </form>
    </>
  );
}

export default function AuthView() {
  const [mode, setMode] = useState("login"); // "login" | "signup"

  return (
    <div className="login-page">
      <Brand />

      <main className="login-card">
        {mode === "login" ? (
          <LoginForm onSwitch={() => setMode("signup")} />
        ) : (
          <SignupForm onSwitch={() => setMode("login")} />
        )}
      </main>
    </div>
  );
}
