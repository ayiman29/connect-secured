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

// ─── Step 1: credentials ─────────────────────────────────────────────────────

function CredentialsStep({ onPreAuth }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const canSubmit = username.trim().length > 0 && password.length > 0;

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    setError("");
    setLoading(true);

    // Try each role until one succeeds (mirrors the original loginSmart logic).
    const roles = ["student", "advisor", "registrar"];
    let lastErr;
    for (const role of roles) {
      try {
        const data = await apiRequest("/auth/login", {
          email: username.trim(),
          password,
          role,
        });
        // data = { preAuthToken, totp_enabled }
        onPreAuth(data.preAuthToken, data.totp_enabled);
        setLoading(false);
        return;
      } catch (e) {
        lastErr = e;
      }
    }

    setError(lastErr?.message || "Login failed");
    setLoading(false);
  };

  return (
    <>
      <h2 className="login-card__heading">Sign in to your account</h2>

      {error && (
        <p style={{ color: "#dc2626", fontSize: 13, textAlign: "center", marginBottom: 4 }}>
          {error}
        </p>
      )}

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

        <button
          type="submit"
          className="btn btn-primary"
          disabled={!canSubmit || loading}
        >
          {loading ? "Checking…" : "Continue"}
        </button>
      </form>
    </>
  );
}

// ─── Step 2a: TOTP setup (first-time enrollment) ─────────────────────────────

function TotpSetupStep({ preAuthToken, onVerified, onExpired }) {
  const [qrCode, setQrCode] = useState(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loadingQr, setLoadingQr] = useState(false);
  const [verifying, setVerifying] = useState(false);

  const fetchQr = async () => {
    setLoadingQr(true);
    setError("");
    try {
      const data = await apiRequest("/auth/setup-totp", { preAuthToken });
      setQrCode(data.qrCode);
    } catch (e) {
      if (e.message.toLowerCase().includes("expired") || e.message.toLowerCase().includes("invalid")) {
        onExpired();
      } else {
        setError(e.message || "Failed to generate QR code");
      }
    } finally {
      setLoadingQr(false);
    }
  };

  // Fetch the QR code on mount.
  React.useEffect(() => {
    fetchQr();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const onSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setVerifying(true);
    try {
      const data = await apiRequest("/auth/verify-totp", { preAuthToken, code });
      onVerified(data);
    } catch (e) {
      if (e.message.toLowerCase().includes("expired") || e.message.toLowerCase().includes("invalid")) {
        onExpired();
      } else {
        setError(e.message || "Verification failed");
      }
    } finally {
      setVerifying(false);
    }
  };

  return (
    <>
      <h2 className="login-card__heading">Set up two-factor authentication</h2>

      <div style={{ width: "min(430px, 100%)", margin: "0 auto", paddingLeft: 20, paddingRight: 20 }}>
        <p style={{ fontSize: 13.5, color: "#4b5563", marginBottom: 16, lineHeight: 1.55 }}>
          Scan the QR code below with an authenticator app (e.g.{" "}
          <strong>Google Authenticator</strong> or <strong>Authy</strong>), then enter
          the 6-digit code to complete setup.
        </p>

        {loadingQr && (
          <p style={{ textAlign: "center", color: "#9aa3ad", fontSize: 13 }}>
            Generating QR code…
          </p>
        )}

        {qrCode && !loadingQr && (
          <div style={{ textAlign: "center", marginBottom: 20 }}>
            <img
              src={qrCode}
              alt="Scan this QR code with your authenticator app"
              style={{
                width: 200,
                height: 200,
                borderRadius: 8,
                border: "1px solid #dce3ec",
                padding: 8,
                background: "#fff",
              }}
            />
          </div>
        )}

        {error && (
          <p style={{ color: "#dc2626", fontSize: 13, marginBottom: 8, textAlign: "center" }}>
            {error}
          </p>
        )}

        <form onSubmit={onSubmit} style={{ display: "grid", gap: 12 }}>
          <label htmlFor="totp-setup-code" className="field__label">
            6-digit code from your authenticator app
          </label>
          <input
            id="totp-setup-code"
            className="field__input"
            type="text"
            inputMode="numeric"
            pattern="\d{6}"
            maxLength={6}
            placeholder="000000"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            autoComplete="one-time-code"
            style={{ letterSpacing: "0.25em", textAlign: "center", fontSize: 18 }}
          />
          <button
            type="submit"
            className="btn btn-primary"
            disabled={code.length !== 6 || verifying}
          >
            {verifying ? "Verifying…" : "Activate 2FA & Sign In"}
          </button>
        </form>
      </div>
    </>
  );
}

// ─── Step 2b: TOTP verify (returning user) ───────────────────────────────────

function TotpVerifyStep({ preAuthToken, onVerified, onExpired }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [verifying, setVerifying] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setVerifying(true);
    try {
      const data = await apiRequest("/auth/verify-totp", { preAuthToken, code });
      onVerified(data);
    } catch (e) {
      if (e.message.toLowerCase().includes("expired") || e.message.toLowerCase().includes("invalid")) {
        onExpired();
      } else {
        setError(e.message || "Verification failed");
      }
    } finally {
      setVerifying(false);
    }
  };

  return (
    <>
      <h2 className="login-card__heading">Two-factor authentication</h2>

      <div style={{ width: "min(430px, 100%)", margin: "0 auto", paddingLeft: 20, paddingRight: 20 }}>
        <p style={{ fontSize: 13.5, color: "#4b5563", marginBottom: 16, lineHeight: 1.55 }}>
          Open your authenticator app and enter the 6-digit code for{" "}
          <strong>Bracu Central</strong>.
        </p>

        {error && (
          <p style={{ color: "#dc2626", fontSize: 13, marginBottom: 8, textAlign: "center" }}>
            {error}
          </p>
        )}

        <form onSubmit={onSubmit} style={{ display: "grid", gap: 12 }}>
          <label htmlFor="totp-verify-code" className="field__label">
            Authenticator code
          </label>
          <input
            id="totp-verify-code"
            className="field__input"
            type="text"
            inputMode="numeric"
            pattern="\d{6}"
            maxLength={6}
            placeholder="000000"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            autoComplete="one-time-code"
            autoFocus
            style={{ letterSpacing: "0.25em", textAlign: "center", fontSize: 18 }}
          />
          <button
            type="submit"
            className="btn btn-primary"
            disabled={code.length !== 6 || verifying}
          >
            {verifying ? "Verifying…" : "Verify & Sign In"}
          </button>

          <div className="form-row form-row--right" style={{ marginTop: -4 }}>
            <button
              type="button"
              className="link-button link"
              style={{ fontSize: 13 }}
              onClick={onExpired}
            >
              ← Back to login
            </button>
          </div>
        </form>
      </div>
    </>
  );
}

// ─── LoginForm orchestrator ───────────────────────────────────────────────────

function LoginForm({ onSwitch }) {
  // stage: "credentials" | "setup" | "verify"
  const [stage, setStage] = useState("credentials");
  const [preAuthToken, setPreAuthToken] = useState(null);

  const handlePreAuth = (token, totpEnabled) => {
    setPreAuthToken(token);
    setStage(totpEnabled ? "verify" : "setup");
  };

  const handleVerified = ({ token, user }) => {
    localStorage.setItem("token", token);
    localStorage.setItem("user", JSON.stringify(user));
    if (user.role === "advisor") window.location.href = "/advisor";
    else if (user.role === "registrar") window.location.href = "/registrar";
    else window.location.href = "/student";
  };

  const handleExpired = () => {
    setPreAuthToken(null);
    setStage("credentials");
  };

  if (stage === "setup") {
    return (
      <TotpSetupStep
        preAuthToken={preAuthToken}
        onVerified={handleVerified}
        onExpired={handleExpired}
      />
    );
  }

  if (stage === "verify") {
    return (
      <TotpVerifyStep
        preAuthToken={preAuthToken}
        onVerified={handleVerified}
        onExpired={handleExpired}
      />
    );
  }

  return (
    <>
      <CredentialsStep onPreAuth={handlePreAuth} />
      <div className="form-row form-row--right" style={{ width: "min(430px, 100%)", margin: "8px auto 0", paddingLeft: 20, paddingRight: 20 }}>
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
    </>
  );
}

// ─── SignupForm ───────────────────────────────────────────────────────────────

function SignupForm({ onSwitch }) {
  const [fullName, setFullName] = useState("");
  const [userId, setUserId] = useState("");
  const [email, setEmail] = useState("");
  const [accountType, setAccountType] = useState("student");
  const [credit, setCredit] = useState("");
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

// ─── Root ─────────────────────────────────────────────────────────────────────

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
