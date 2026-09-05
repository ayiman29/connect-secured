import React, { useEffect, useState } from "react";
import "./RegistrarView.css";
import "./Nav.css";
import bracuLogo from "./assets/bracu.png";

// config 
const API_URL = import.meta.env?.VITE_API_URL || "http://127.0.0.1:5050";
const REGISTRAR_ID = 10012135;
const REGISTRAR_EMAIL = "moontasir.khan@bracu.ac.bd";

/* ===== NEW: schedule helpers ===== */
const DAY_OPTIONS = [
  "SUNDAY–TUESDAY",
  "MONDAY–WEDNESDAY",
  "THURSDAY–SATURDAY",
];

function fmt24(h, m) {
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function makeTimeSlots() {
  const DURATION = 90;                // minutes
  const EARLIEST_START = 8 * 60;      // 08:00
  const LAST_END = 18 * 60 + 30;      // 18:30  ✅ include 17:00–18:30

  const slots = [];
  for (let start = EARLIEST_START; start + DURATION <= LAST_END; start += DURATION) {
    const end = start + DURATION;
    const sh = Math.floor(start / 60), sm = start % 60;
    const eh = Math.floor(end / 60),   em = end % 60;
    slots.push(`${fmt24(sh, sm)}–${fmt24(eh, em)}`);
  }
  return slots;
}

const TIME_OPTIONS = makeTimeSlots(); // ["08:00–09:30","09:30–11:00","11:00–12:30","12:30–14:00","14:00–15:30","15:30–17:00","17:00–18:30"]

async function authRequest(path, { method = "GET", body } = {}) {
  const token = localStorage.getItem("token") || "";
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text().catch(() => "");
  const data = (() => {
    try { return JSON.parse(text); } catch { return text; }
  })();
  if (!res.ok) {
    const msg =
      (data && (data.message || data.error)) ||
      (text || res.statusText || `HTTP ${res.status}`);
    throw new Error(msg);
  }
  return data;
}

const post = (p, b) => authRequest(p, { method: "POST", body: b });
const del  = (p)   => authRequest(p, { method: "DELETE" });

// registrar console - api
export default function RegistrarView() {
  /* flash message */
  const [msg, setMsg] = useState(null);

  /* course form */
  const [cId, setCId] = useState("");
  const [cTitle, setCTitle] = useState("");
  const [cName, setCName] = useState("");
  const [cCredit, setCCredit] = useState("");
  const [cExam, setCExam] = useState("");

  // course drop form 
  const [dropId, setDropId] = useState("");

  // section form 
  const [sCourseId, setSCourseId] = useState("");
  const [sSectionId, setSSectionId] = useState(""); // blank => add
  const [sFaculty, setSFaculty] = useState("");
  const [sSchedule, setSSchedule] = useState("");   // combined value we send

  /* ===== NEW: dropdown states ===== */
  const [sDays, setSDays]   = useState("");
  const [sTime, setSTime]   = useState("");

  /* ===== Reports state ===== */
  const [reports, setReports] = useState([]);
  const [loadingReports, setLoadingReports] = useState(false);
  const [decryptedReports, setDecryptedReports] = useState({});
  const [decryptingId, setDecryptingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const fetchReports = async () => {
    setLoadingReports(true);
    try {
      const data = await authRequest("/registrars/reports");
      setReports(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error("Failed to load reports:", e);
    } finally {
      setLoadingReports(false);
    }
  };

  useEffect(() => {
    if (!localStorage.getItem("token")) {
      setMsg({ type: "err", text: "No token found. Please log in first." });
    } else {
      fetchReports();
    }
  }, []);

  /* ===== NEW: keep schedule in sync with dropdowns ===== */
  useEffect(() => {
    if (sDays && sTime) setSSchedule(`${sDays} ${sTime}`);
    else setSSchedule("");
  }, [sDays, sTime]);

  const handleDecryptReport = async (reportId) => {
    setDecryptingId(reportId);
    try {
      const res = await authRequest(`/registrars/reports/${encodeURIComponent(reportId)}/decrypt`, {
        method: "POST",
      });
      setDecryptedReports((prev) => ({
        ...prev,
        [reportId]: res.decryptedProblem,
      }));
    } catch (e) {
      setMsg({ type: "err", text: e.message || "Failed to decrypt report." });
    } finally {
      setDecryptingId(null);
    }
  };

  const handleMarkAsDone = async (reportId) => {
    setDeletingId(reportId);
    try {
      await authRequest(`/registrars/reports/${encodeURIComponent(reportId)}`, {
        method: "DELETE",
      });
      setReports((prev) => prev.filter((r) => r.report_id !== reportId));
      setDecryptedReports((prev) => {
        const next = { ...prev };
        delete next[reportId];
        return next;
      });
      setMsg({ type: "ok", text: "Issue marked as done." });
    } catch (e) {
      setMsg({ type: "err", text: e.message || "Failed to mark report as done." });
    } finally {
      setDeletingId(null);
    }
  };

  const flash = async (fn, okText = "Saved successfully.") => {
    setMsg(null);
    try {
      await fn();
      setMsg({ type: "ok", text: okText });
    } catch (e) {
      setMsg({ type: "err", text: e.message || String(e) });
    }
  };

  //  api actions  
  const doAddOrUpdateCourse = async (payload) => {
    const body = {
      courseId: Number(payload.id),
      title: payload.title,
      name: payload.name,
      examSchedule: payload.examSchedule,
      courseCredit: Number(payload.credit),
      registrarId: REGISTRAR_ID,
      registrarEmail: REGISTRAR_EMAIL,
    };
    return post("/registrars/course", body);
  };

  const doDropCourse = (id) =>
    del(`/registrars/course/${encodeURIComponent(id)}`);

  const doAddOrUpdateSection = (payload) => {
    const body = {
      courseId: payload.courseId,
      sectionId: payload.sectionId ? Number(payload.sectionId) : undefined, // blank => auto
      schedule: payload.schedule, // already combined "DAY–DAY HH:MM–HH:MM"
      faculty: payload.faculty,
      seatAvailability: 40, // defaulted
      registrarId: REGISTRAR_ID,
      registrarEmail: REGISTRAR_EMAIL,
    };
    return post("/registrars/section", body);
  };

  const doDropSection = (courseId, sectionId) =>
    del(
      `/registrars/section/${encodeURIComponent(
        courseId
      )}/${encodeURIComponent(sectionId)}`
    );

  return (
    <div className="page">
      <nav className="navbar">
        <div className="navbar-inner">
          <div className="navbar-logo">
            <img src={bracuLogo} alt="Logo" />
          </div>
        </div>
      </nav>

      <div className="registrar">
        <h1 className="registrar__h1">Registrar Console</h1>

        {msg && (
          <div
            className={`flash ${msg.type === "ok" ? "flash--ok" : "flash--err"}`}
            role="status"
          >
            {msg.text}
          </div>
        )}

        <div className="registrar__grid">
             
          <section className="card">
            <h2 className="card__title">Courses</h2>

            <form
              className="form"
              onSubmit={(e) => {
                e.preventDefault();
                flash(() =>
                  doAddOrUpdateCourse({
                    id: cId,
                    title: cTitle,
                    name: cName,
                    credit: cCredit,
                    examSchedule: cExam,
                  })
                );
              }}
            >
              <div className="row row--2">
                <div className="field">
                  <label className="label">Course ID</label>
                  <input
                    className="input"
                    value={cId}
                    onChange={(e) => setCId(e.target.value)}
                    placeholder="e.g., 12345"
                  />
                </div>
                <div className="field">
                  <label className="label">Course Title (code)</label>
                  <input
                    className="input"
                    value={cTitle}
                    onChange={(e) => setCTitle(e.target.value)}
                    placeholder="e.g., CSE110"
                  />
                </div>
              </div>

              <div className="row row--2">
                <div className="field">
                  <label className="label">Course Name</label>
                  <input
                    className="input"
                    value={cName}
                    onChange={(e) => setCName(e.target.value)}
                    placeholder="e.g., Introduction to Programming"
                  />
                </div>
                <div className="field">
                  <label className="label">Credit</label>
                  <input
                    className="input"
                    type="number"
                    step="0.5"
                    min="0"
                    value={cCredit}
                    onChange={(e) => setCCredit(e.target.value)}
                    placeholder="3"
                  />
                </div>
              </div>

              <div className="row row--2">
                <div className="field">
                  <label className="label">Exam Schedule</label>
                  <input
                    className="input"
                    value={cExam}
                    onChange={(e) => setCExam(e.target.value)}
                    placeholder="e.g., YYYY-MM-DD"
                  />
                </div>
                <div className="field" />
              </div>

              <div className="row row--right">
                <button type="submit" className="btn btn--primary">
                  Add / Update Course
                </button>
              </div>
            </form>

            <div className="divider" />

            <form
              className="form"
              onSubmit={(e) => {
                e.preventDefault();
                if (!dropId.trim()) {
                  setMsg({ type: "err", text: "Provide a Course ID to delete." });
                  return;
                }
                flash(() => doDropCourse(dropId), "Course deleted.");
              }}
            >
              <div className="row row--2">
                <div className="field">
                  <label className="label">Delete Course (ID)</label>
                  <input
                    className="input"
                    value={dropId}
                    onChange={(e) => setDropId(e.target.value)}
                    placeholder="Course ID to delete"
                  />
                </div>
                <div className="field" />
              </div>

              <div className="row row--right">
                <button type="submit" className="btn btn--danger">
                  Delete Course
                </button>
              </div>
            </form>
          </section>

           {/* sections  */}
          <section className="card">
            <h2 className="card__title">Sections</h2>

            <form
              className="form"
              onSubmit={(e) => {
                e.preventDefault();
                if (!sCourseId.trim()) {
                  setMsg({ type: "err", text: "Course ID is required for sections." });
                  return;
                }
                if (!sDays || !sTime) {
                  setMsg({ type: "err", text: "Pick both Days and Time." });
                  return;
                }
                flash(() =>
                  doAddOrUpdateSection({
                    courseId: sCourseId,
                    sectionId: sSectionId,
                    faculty: sFaculty,
                    schedule: sSchedule, // ⬅ combined value
                  })
                );
              }}
            >
              <div className="row row--2">
                <div className="field">
                  <label className="label">Course ID</label>
                  <input
                    className="input"
                    value={sCourseId}
                    onChange={(e) => setSCourseId(e.target.value)}
                    placeholder="e.g., 12345"
                  />
                </div>
                <div className="field">
                  <label className="label">
                    Section ID <span className="hint">(blank = auto-assign)</span>
                  </label>
                  <input
                    className="input"
                    type="number"
                    min="1"
                    value={sSectionId}
                    onChange={(e) => setSSectionId(e.target.value)}
                    placeholder="(blank for add)"
                  />
                </div>
              </div>

              <div className="row row--2">
                <div className="field">
                  <label className="label">Faculty</label>
                  <input
                    className="input"
                    value={sFaculty}
                    onChange={(e) => setSFaculty(e.target.value)}
                    placeholder="Instructor's name"
                  />
                </div>

                {/* ===== CHANGED: Schedule → two dropdowns ===== */}
                <div className="field">
                  <label className="label">Schedule</label>
                  <div className="row row--2" style={{gap: 8}}>
                    <select
                      className="input"
                      value={sDays}
                      onChange={(e) => setSDays(e.target.value)}
                    >
                      <option value="">Days…</option>
                      {DAY_OPTIONS.map(d => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>

                    <select
                      className="input"
                      value={sTime}
                      onChange={(e) => setSTime(e.target.value)}
                    >
                      <option value="">Time…</option>
                      {TIME_OPTIONS.map(t => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>

                  {/* read-only preview of what will be sent */}
                  <input
                    className="input"
                    value={sSchedule}
                    readOnly
                    style={{marginTop:8, background:"#f8fafc"}}
                    placeholder="Pick days & time"
                  />
                </div>
              </div>

              <div className="row row--right">
                <button type="submit" className="btn btn--primary">
                  Add / Update Section
                </button>
              </div>
            </form>

            <div className="divider" />

            <form
              className="form"
              onSubmit={(e) => {
                e.preventDefault();
                if (!sCourseId.trim() || !sSectionId.trim()) {
                  setMsg({
                    type: "err",
                    text: "Provide both Course ID and Section ID to delete.",
                  });
                  return;
                }
                flash(() => doDropSection(sCourseId, sSectionId), "Section deleted.");
              }}
            >
              <div className="row row--2">
                <div className="field">
                  <label className="label">Delete (Course ID)</label>
                  <input
                    className="input"
                    value={sCourseId}
                    onChange={(e) => setSCourseId(e.target.value)}
                    placeholder="Course ID"
                  />
                </div>
                <div className="field">
                  <label className="label">Delete (Section ID)</label>
                  <input
                    className="input"
                    type="number"
                    min="1"
                    value={sSectionId}
                    onChange={(e) => setSSectionId(e.target.value)}
                    placeholder="Section ID"
                  />
                </div>
              </div>

              <div className="row row--right">
                <button type="submit" className="btn btn--danger">
                Delete Section
                </button>
              </div>
            </form>
          </section>

          {/* ===== Student Problem Reports ===== */}
          <section className="card" style={{ gridColumn: "1 / -1", marginTop: "8px" }}>
            <div className="reports-header">
              <div>
                <h2 className="card__title" style={{ margin: 0 }}>Student Problem Reports</h2>
                <div className="reports-subtitle">Review and resolve issues submitted by students.</div>
              </div>
              <button
                type="button"
                className="btn btn--primary"
                onClick={fetchReports}
                disabled={loadingReports}
                style={{ padding: "6px 14px", fontSize: "13px" }}
              >
                {loadingReports ? "Refreshing..." : "Refresh Reports"}
              </button>
            </div>

            {loadingReports && reports.length === 0 ? (
              <p style={{ color: "var(--muted)", fontStyle: "italic" }}>Loading submitted problem reports...</p>
            ) : reports.length === 0 ? (
              <div style={{ padding: "24px", textAlign: "center", background: "#f8fafc", borderRadius: "8px", border: "1px dashed var(--border)", color: "var(--muted)" }}>
                No open student problem reports.
              </div>
            ) : (
              <div className="reports-table-wrap">
                <table className="reports-table">
                  <thead>
                    <tr>
                      <th>Report</th>
                      <th>Student</th>
                      <th>Submitted</th>
                      <th>Problem</th>
                      <th className="reports-table__actions">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                {reports.map((r) => {
                  const isDecrypted = decryptedReports[r.report_id] !== undefined;
                  const isDecrypting = decryptingId === r.report_id;
                  const isDeleting = deletingId === r.report_id;
                  const formattedDate = r.created_at ? new Date(r.created_at).toLocaleString() : "-";

                  return (
                    <tr
                      key={r.report_id}
                    >
                      <td>#{r.report_id}</td>
                      <td>
                        <strong>{r.student_name}</strong>
                        <span className="reports-table__secondary">ID: {r.student_id}</span>
                      </td>
                      <td>{formattedDate}</td>
                      <td className="reports-table__problem">
                        {isDecrypted ? (
                          <div className="reports-table__message">{decryptedReports[r.report_id]}</div>
                        ) : (
                          <button
                            type="button"
                            className="btn btn--ghost btn--sm"
                            onClick={() => handleDecryptReport(r.report_id)}
                            disabled={isDecrypting}
                          >
                            {isDecrypting ? "Opening..." : "View report"}
                          </button>
                        )}
                      </td>
                      <td className="reports-table__actions">
                        <button
                          type="button"
                          className="btn btn--danger btn--sm"
                          onClick={() => handleMarkAsDone(r.report_id)}
                          disabled={isDeleting}
                        >
                          {isDeleting ? "Saving..." : "Mark as Done"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
