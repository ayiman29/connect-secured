import React, { useEffect, useMemo, useState, useCallback } from "react";
import AvailableSections from "./AvailableSections";
import SelectedSections from "./SelectedSections";
import "./Panel.css";
import NavBar from "./Nav.jsx";

function CuteToast({ open, onClose, children }) {
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(onClose, 3000);
    return () => clearTimeout(t);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="toast-wrap">
      <div className="toast">
        <span className="toast-dot" aria-hidden>⚠️</span>
        <span className="toast-text">{children}</span>
        <button className="toast-x" onClick={onClose} aria-label="Dismiss">×</button>
      </div>
    </div>
  );
}

function getStoredUser() {
  try { const raw = localStorage.getItem("user"); return raw ? JSON.parse(raw) : null; }
  catch { return null; }
}
function parseNameFromEmail(email = "") {
  const local = (email.split("@")[0] || "").replace(/[_.\-]+/g, " ").replace(/\d+/g, " ").trim();
  if (!local) return email || "Student";
  return local.split(/\s+/).slice(0,3).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
}
function getInitials(name = "") {
  const p = name.trim().split(/\s+/).filter(Boolean);
  if (!p.length) return "ST";
  return (p[0][0] + (p[1]?.[0] || p[0][1] || "")).toUpperCase();
}
const pad2 = (n) => String(n).padStart(2, "0");
function formatExamSchedule(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  return d.toLocaleString(undefined, { weekday:"short", month:"short", day:"numeric", hour:"2-digit", minute:"2-digit" });
}
const rowKey = (r) =>
  `${r.raw?.course?.course_id ?? r.course_id ?? r.courseId ?? r.id ?? "?"}:${
    r.raw?.section?.section_id ?? r.section_id ?? r.sectionId ?? "" }`;

// cache  
function cacheKeys(studentId) {
  const sid = String(studentId || "unknown");
  return { all: `allCoursesCache:${sid}`, mine: `myCoursesCache:${sid}` };
}
function loadCache(studentId) {
  try {
    const { all, mine } = cacheKeys(studentId);
    const allRows = JSON.parse(localStorage.getItem(all) || "null");
    const myRows  = JSON.parse(localStorage.getItem(mine) || "null");
    return { allRows: Array.isArray(allRows) ? allRows : null, myRows: Array.isArray(myRows) ? myRows : null };
  } catch { return { allRows: null, myRows: null }; }
}
function saveCache(studentId, allRows, myRows) {
  const { all, mine } = cacheKeys(studentId);
  try { if (allRows) localStorage.setItem(all, JSON.stringify(allRows)); if (myRows) localStorage.setItem(mine, JSON.stringify(myRows)); } catch {}
}

// data map
function mapAnyToRows(apiData) {
  const out = [];
  for (const item of apiData || []) {
    if (Array.isArray(item.sections) && item.sections.length) {
      const c = item;
      for (const s of c.sections) {
        const seat = s.seat_availability != null ? Number(s.seat_availability) : 40;
        out.push({
          id: `${c.course_id}-${s.section_id}`,
          courseCode: `${c.title ?? c.course_name ?? c.name}–[${pad2(s.section_id)}](${seat})-${s.faculty || "TBA"}`,
          courseName: c.course_name ?? c.name ?? c.title ?? "",
          facultyName: s.faculty || "TBA",
          credit: Number(c.course_credit ?? 0),
          courseSchedule: s.schedule ?? "-",
          examSchedule: formatExamSchedule(c.exam_schedule),
          prerequisite: "-",
          raw: {
            course: { course_id: Number(c.course_id), title: c.title, course_name: c.course_name, course_credit: Number(c.course_credit ?? 0), exam_schedule: c.exam_schedule },
            section: { section_id: Number(s.section_id), faculty: s.faculty, schedule: s.schedule, seat_availability: seat },
          },
        });
      }
      continue;
    }
    const cId = item.course_id;
    const sId = item.section_id;
    if (cId == null || sId == null) continue;
    const title = item.title;
    const name = item.name;
    const credit = Number(item.course_credit ?? 0);
    const faculty = item.faculty ?? "To Be Announced";
    const schedule = item.schedule;
    const seat = Number(item.seat_availability ?? 40);
    const exam = item.exam_schedule;

    out.push({
      id: `${cId}-${sId}`,
      courseCode: `${title || name}–[${pad2(sId)}](${seat})-${faculty || "TBA"}`,
      courseName: name || title,
      facultyName: faculty || "TBA",
      credit,
      courseSchedule: schedule,
      examSchedule: formatExamSchedule(exam),
      prerequisite: "-",
      raw: {
        course: { course_id: Number(cId), title: title || name, course_name: name || title, course_credit: credit, exam_schedule: exam || null },
        section: { section_id: Number(sId), faculty, schedule, seat_availability: seat },
      },
    });
  }
  return out;
}
function enrichMyFromAll(myRows, allRows) {
  const map = new Map(allRows.map(r => [rowKey(r), r]));
  return myRows.map(r => {
    const src = map.get(rowKey(r));
    if (!src) return r;
    const c = src.raw.course, s = src.raw.section;
    return {
      ...r,
      credit: Number(c.course_credit ?? r.credit ?? 0),
      courseName: c.course_name ?? c.title ?? r.courseName,
      facultyName: s.faculty ?? r.facultyName,
      courseSchedule: s.schedule ?? r.courseSchedule,
      examSchedule: formatExamSchedule(c.exam_schedule ?? null),
      raw: { course: { ...c }, section: { ...s } },
      courseCode: `${c.title}–[${pad2(s.section_id)}](${s.seat_availability})-${s.faculty || "TBA"}`,
    };
  });
}
function pickIds(row) {
  const courseId = row?.raw?.course?.course_id ?? row?.course_id ?? row?.courseId;
  const sectionId = row?.raw?.section?.section_id ?? row?.section_id ?? row?.sectionId;
  return { courseId, sectionId };
}
const DEFAULT_ADVISOR_ID = 10000501;
function pickAdvisorId(user, info) {
  if (user?.role === "advisor") return user?.id ?? user?._id ?? user?.advisor_id ?? user?.advisorId;
  return user?.advisor_id ?? user?.advisorId ?? info?.advisor_id ?? info?.advisorId ?? DEFAULT_ADVISOR_ID;
}
function isCreditLimitError(msg = "") { return /credit\s*limit\s*exceeded/i.test(msg); }



// routine

const DAYS = ["SUNDAY","MONDAY","TUESDAY","WEDNESDAY","THURSDAY","FRIDAY","SATURDAY"];
const SLOTS = [
  ["08:00","09:30"], ["09:30","11:00"], ["11:00","12:30"],
  ["12:30","14:00"], ["14:00","15:30"], ["15:30","17:00"], ["17:00","18:30"],
];
const to12h = (hhmm) => {
  const [h,m] = hhmm.split(":").map(Number);
  const am = h < 12; const h12 = ((h + 11) % 12) + 1;
  return `${String(h12).padStart(2,"0")}:${String(m).padStart(2,"0")} ${am?"AM":"PM"}`;
};
const slotLabel = ([a,b]) => `${to12h(a)}–${to12h(b)}`;
function parseScheduleStr(s="") {
  const up = s.toUpperCase().trim();
  const m = up.match(/^\s*([A-Z]+)\s*[–-]\s*([A-Z]+)\s+(\d{1,2}:\d{2})\s*[–-]\s*(\d{1,2}:\d{2})/);
  if (!m) return null;
  return { days:[m[1], m[2]], start:m[3].padStart(5,"0"), end:m[4].padStart(5,"0") };
}
function Routine({ rows }) {
  const grid = Array.from({length:SLOTS.length},()=>Object.create(null));
  for (const r of rows || []) {
    const sch = parseScheduleStr(r.courseSchedule || r.raw?.section?.schedule || "");
    if (!sch) continue;
    const secId = r.raw?.section?.section_id ?? r.section_id ?? r.sectionId;
    const courseTitle = r.raw?.course?.title || r.courseName || "COURSE";
    const code = `${courseTitle}–[${pad2(secId)}]`.toUpperCase();
    const faculty = r.facultyName || r.raw?.section?.faculty || "TBA";
    const text = `${code}\n[${faculty}]`;
    const idx = SLOTS.findIndex(([a,b]) => a===sch.start && b===sch.end);
    if (idx === -1) continue;
    for (const d of sch.days) grid[idx][d] = (grid[idx][d] ? grid[idx][d] + "\n" : "") + text;
  }


  return (
    <div className="routine routine--compact">
      <div className="routine__head"><h3>Weekly Routine</h3></div>
      <div className="routine__tableWrap">
        <table className="routine__table">
          <thead>
            <tr>
              <th className="routine__th routine__time">TIME</th>
              {DAYS.map(d => <th key={d} className="routine__th">{d}</th>)}
            </tr>
          </thead>
          <tbody>
            {SLOTS.map((slot,i)=>(
              <tr key={i}>
                <td className="routine__timeCell">{slotLabel(slot)}</td>
                {DAYS.map(day=>{
                  const val = grid[i][day] || "";
                  return (
                    <td key={day} className="routine__cell">
                      {val.split("\n").map((line,ix)=> <div key={ix}>{line}</div>)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}


// actual student view
export default function StudentView() {
  const user = useMemo(() => getStoredUser(), []);
  const userEmail = user?.email || "";
  const role = user?.role || "student";
  const routeBase = role === "advisor" ? "/advisors" : "/students";

  const displayName = useMemo(() => user?.name?.trim() || parseNameFromEmail(userEmail), [user, userEmail]);
  const initials = useMemo(() => getInitials(displayName), [displayName]);

  const [studentId, setStudentId] = useState(null);
  const [info, setInfo] = useState(null);
  const [status, setStatus] = useState(null); // waiting | approved | denied | null

  const [allCourses, setAllCourses] = useState([]);
  const [myCourses, setMyCourses] = useState([]);

  const [loadingId, setLoadingId] = useState(true);
  const [loadingInfo, setLoadingInfo] = useState(true);
  const [loadingLists, setLoadingLists] = useState(true);
  const [mutating, setMutating] = useState(false);
  const [sending, setSending] = useState(false);

  const [initialCompletedCredit, setInitialCompletedCredit] = useState(null); // ← persisted, shown as Completed Credit

  const [problemText, setProblemText] = useState("");
  const [submittingReport, setSubmittingReport] = useState(false);
  const [showReportForm, setShowReportForm] = useState(false);

  const [toastOpen, setToastOpen] = useState(false);
  const [toastMsg, setToastMsg] = useState("");
  const showToast = useCallback((msg) => { setToastMsg(msg); setToastOpen(true); }, []);

  const handleReportProblem = async (e) => {
    e?.preventDefault?.();
    if (!problemText.trim()) {
      showToast("Please describe your problem before submitting.");
      return;
    }
    if (!studentId) {
      showToast("Missing studentId.");
      return;
    }
    setSubmittingReport(true);
    try {
      const res = await fetch("/students/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId: Number(studentId), problemText: problemText.trim() }),
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => res.statusText);
        throw new Error(errText || "Failed to submit report.");
      }
      setProblemText("");
      setShowReportForm(false);
      showToast("Problem reported to registrar successfully.");
    } catch (err) {
      showToast(err.message || "Failed to submit report.");
    } finally {
      setSubmittingReport(false);
    }
  };

  /* resolve student id */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!userEmail) throw new Error("No email in session.");
        const res = await fetch(`/students/id-by-email/${encodeURIComponent(userEmail)}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text().catch(() => res.statusText)) || res.statusText}`);
        const json = await res.json();
        const row = Array.isArray(json) ? (json[0] || {}) : (json || {});
        const id = row.student_id ?? row.studentId;
        if (!id) throw new Error("student_id not found for this email");
        if (!cancelled) setStudentId(id);
      } catch (e) {
        if (!cancelled) showToast(e.message || "Failed to resolve student ID.");
      } finally { if (!cancelled) setLoadingId(false); }
    })();
    return () => { cancelled = true; };
  }, [userEmail, showToast]);

  //  store initial credit 
  useEffect(() => {
    if (!studentId) return;
    const key = `initialCompletedCredit:${studentId}`;
    const v = localStorage.getItem(key);
    if (v != null && v !== "") {
      const num = Number(v);
      setInitialCompletedCredit(isNaN(num) ? 0 : num);
    } else {
      setInitialCompletedCredit(null); // will be set after info fetch
    }
  }, [studentId]);

  //  cache 
  useEffect(() => {
    if (!studentId) return;
    const { allRows, myRows } = loadCache(studentId);
    if (allRows) setAllCourses(allRows);
    if (myRows)  setMyCourses(myRows);
  }, [studentId]);

  //  info (includes status)  
  useEffect(() => {
    if (!studentId) { setLoadingInfo(false); return; }
    let cancelled = false;
    (async () => {
      try {
        setLoadingInfo(true);
        const res = await fetch(`/students/info/${studentId}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text().catch(() => res.statusText)) || res.statusText}`);
        const json = await res.json();
        const row = Array.isArray(json) ? (json[0] || {}) : (json || {});
        if (cancelled) return;

        setInfo(row);
        if (row?.status) setStatus(String(row.status).toLowerCase());

        // initial completed credit 
        const key = `initialCompletedCredit:${studentId}`;
        const existing = localStorage.getItem(key);
        const currentCredit = Number(row?.credit ?? 0);
        if (existing == null) {
          localStorage.setItem(key, String(isNaN(currentCredit) ? 0 : currentCredit));
          setInitialCompletedCredit(isNaN(currentCredit) ? 0 : currentCredit);
        } else if (initialCompletedCredit == null) {
          // ensure state hydrated if LS already had it
          const num = Number(existing);
          setInitialCompletedCredit(isNaN(num) ? 0 : num);
        }
      } catch (e) {
        if (!cancelled) showToast(e.message || "Failed to load student info.");
      } finally { if (!cancelled) setLoadingInfo(false); }
    })();
    return () => { cancelled = true; };
  }, [studentId, showToast, initialCompletedCredit]);

  /* lists */
  const loadLists = useCallback(async (sid) => {
    setLoadingLists(true);
    try {
      const resAll = await fetch(`${routeBase}/courses`);
      if (!resAll.ok) throw new Error(`HTTP ${resAll.status}: ${(await resAll.text().catch(() => res.statusText)) ?? res.statusText}`);
      const all = await resAll.json();
      const allRows = mapAnyToRows(Array.isArray(all) ? all : (all?.data ?? []));

      const resMine = await fetch(`/students/my-courses/${sid}`);
      if (!resMine.ok) throw new Error(`HTTP ${resMine.status}: ${(await resMine.text().catch(() => res.statusText)) ?? res.statusText}`);
      const mine = await resMine.json();
      const mineRowsRaw = mapAnyToRows(Array.isArray(mine) ? mine : (mine?.data ?? []));
      const mineRows = enrichMyFromAll(mineRowsRaw, allRows);

      setAllCourses(allRows);
      setMyCourses(mineRows);
      saveCache(sid, allRows, mineRows);
    } catch (e) {
      showToast(e.message || "Failed to load courses.");
    } finally { setLoadingLists(false); }
  }, [routeBase, showToast]);

  useEffect(() => { if (studentId) loadLists(studentId); }, [studentId, loadLists]);

  //  poll while waiting 
  useEffect(() => {
    if (!studentId) return;
    if ((status || "").toLowerCase() !== "waiting") return;
    let cancelled = false, timer = null;
    const checkStatus = async () => {
      try {
        const res = await fetch(`/students/info/${studentId}`);
        if (!res.ok) throw new Error("status refresh failed");
        const json = await res.json();
        const row = Array.isArray(json) ? (json[0] || {}) : (json || {});
        const st = row?.status ? String(row.status).toLowerCase() : null;
        if (!cancelled && st && st !== "waiting") {
          setStatus(st);
          if (st === "approved") showToast("Congrats! You’ve been approved.");
          if (st === "denied")  { showToast("Request denied. You can adjust and resend."); await loadLists(studentId); }
          return;
        }
      } catch {}
      if (!cancelled) timer = setTimeout(checkStatus, 5000);
    };
    checkStatus();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [studentId, status, loadLists, showToast]);

  /* derived */
  const availableCourses = useMemo(() => {
    const keys = new Set(myCourses.map(rowKey));
    return allCourses.filter((r) => !keys.has(rowKey(r)));
  }, [allCourses, myCourses]);
  const minLimit = Number(info?.min_credit_limit ?? 3);
  const maxLimit = Number(info?.max_credit_limit ?? 15);
  const loading = loadingId || loadingInfo || loadingLists;
  const isWaiting = String(status || "").toLowerCase() === "waiting";
  const isApproved = String(status || "").toLowerCase() === "approved";

  /* mutations */
  const handleAdd = useCallback(async (row) => {
    if (!studentId) { showToast("Cannot add: missing studentId."); return; }
    const { courseId, sectionId } = pickIds(row);
    if (!courseId || !sectionId) { showToast("Cannot add: courseId or sectionId missing."); return; }
    const advisorId = pickAdvisorId(user, info);

    const prevMy = myCourses, prevAll = allCourses;
    const existsSameCourse = prevMy.find((r) => Number(pickIds(r).courseId) === Number(courseId));
    let nextMy = prevMy;
    if (existsSameCourse) nextMy = nextMy.filter((r) => rowKey(r) !== rowKey(existsSameCourse));
    nextMy = [...nextMy, row];
    setMyCourses(nextMy); saveCache(studentId, prevAll, nextMy);
    setMutating(true);

    try {
      if (existsSameCourse) {
        const { sectionId: oldSec } = pickIds(existsSameCourse);
        const dropRes = await fetch(`/students/drop-course`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ studentId: Number(studentId), courseId: Number(courseId), sectionId: Number(oldSec) }),
        });
        if (!dropRes.ok) throw new Error((await dropRes.text().catch(() => dropRes.statusText)) || "Switch failed (drop old).");
      }

      const res = await fetch(`/students/add-course`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId: Number(studentId), courseId: Number(courseId), sectionId: Number(sectionId), advisorId: Number(advisorId) }),
      });
      if (!res.ok) {
        let msg = res.statusText; try { msg = (await res.text()) || msg; } catch {}
        if (isCreditLimitError(msg)) showToast("Credit limit exceeded"); else showToast(msg || "Failed to add course.");
        setMyCourses(prevMy); saveCache(studentId, prevAll, prevMy); return;
      }
      await loadLists(studentId);
    } catch (e) {
      setMyCourses(prevMy); saveCache(studentId, prevAll, prevMy); showToast(e.message || "Failed to add course.");
    } finally { setMutating(false); }
  }, [studentId, user, info, myCourses, allCourses, showToast, loadLists]);

  const handleDrop = useCallback(async (row) => {
    if (!studentId) { showToast("Missing studentId."); return; }
    const { courseId, sectionId } = pickIds(row);
    if (!courseId || !sectionId) { showToast("Missing course/section id."); return; }

    const prevMy = myCourses, prevAll = allCourses, key = rowKey(row);
    const nextMy = prevMy.filter((r) => rowKey(r) !== key);
    setMyCourses(nextMy); saveCache(studentId, prevAll, nextMy);
    setMutating(true);

    try {
      const res = await fetch(`/students/drop-course`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId: Number(studentId), courseId: Number(courseId), sectionId: Number(sectionId) }),
      });
      if (!res.ok) {
        const msg = await res.text().catch(() => res.statusText);
        setMyCourses(prevMy); saveCache(studentId, prevAll, prevMy);
        throw new Error(msg || "Failed to drop course.");
      }
      await loadLists(studentId);
    } catch (e) { showToast(e.message || "Failed to drop course."); }
    finally { setMutating(false); }
  }, [studentId, allCourses, myCourses, showToast, loadLists]);

  const handleSendRequest = useCallback(async () => {
    if (!studentId) { showToast("Missing studentId."); return; }
    if (myCourses.length === 0) { showToast("Select at least one section first."); return; }
    setSending(true);
    try {
      const res = await fetch(`/students/confirm-advising/${encodeURIComponent(studentId)}`, { method: "PUT", headers: { "Content-Type": "application/json" } });
      if (!res.ok) {
        const msg = await res.text().catch(() => res.statusText);
        throw new Error(msg || "Failed to send request.");
      }
      setStatus("waiting"); showToast("Request sent. Awaiting advisor approval.");
    } catch (e) { showToast(e.message || "Failed to send request."); }
    finally { setSending(false); }
  }, [studentId, myCourses.length, showToast]);

  /* derived UI numbers */
  const creditTaken = useMemo(() => myCourses.reduce((sum, r) => {
    const c = Number(r?.raw?.course?.course_credit ?? r?.credit ?? 0);
    return sum + (isNaN(c) ? 0 : c);
  }, 0), [myCourses]);
  const completedCredits = initialCompletedCredit ; 

  return (
    <div>
      <NavBar />

      <div className="panel-wrapper">
        <div className="advising-header-box">
          <div className="profile-info">
            <div className="profile-image" aria-label="Profile initials">{loading ? "…" : initials}</div>

            <div className="profile-details">
              <h2 className="student-name">{loading ? "Loading…" : displayName}</h2>

              <div className="credit-boxes">
                <div className="credit-box">
                  <div className="credit-value">{loading ? "–" : `${minLimit}–${maxLimit}`}</div>
                  <div className="credit-label">Credit Limit</div>
                </div>
                <div className="credit-box">
                  <div className="credit-value">{loading ? "–" : creditTaken}</div>
                  <div className="credit-label">Credit Taken</div>
                </div>
                <div className="credit-box">
                  <div className="credit-value">{loading ? "–" : completedCredits}</div>
                  <div className="credit-label">Completed Credit</div>
                </div>
              </div>
            </div>
          </div>

          <div className="advising-panel">
            {/* Hide the title when already approved */}
            {!isApproved && <h2 className="advising-title">Advising Panel</h2>}

            {isApproved ? (
              <div>
                <div role="status" aria-live="polite" className="approve-banner">
                  🎉 <strong>Congrats! You’ve been approved.</strong>
                  <div className="approve-banner__sub">Here’s your routine for this term.</div>
                </div>
                <Routine rows={myCourses} />
              </div>
            ) : isWaiting ? (
              <div role="status" aria-live="polite" className="waiting-banner">
                <h3>Awaiting advisor approval</h3>
                <p>Your course selection has been sent. We’ll update this screen when your advisor approves or denies it.</p>
              </div>
            ) : (
              <div className="advising-sections">
                <div className="sections-container">
                  <div className="section">
                    <AvailableSections rows={availableCourses} loading={loading} mutating={mutating} onAdd={handleAdd} />
                  </div>
                  <div className="section">
                    <SelectedSections rows={myCourses} loading={loading} mutating={mutating} onDrop={handleDrop} />
                    <div className="advising-actions" style={{ marginTop: 12, display: "flex", gap: 12 }}>
                      <button
                        className="btn btn-confirm"
                        onClick={handleSendRequest}
                        disabled={sending || loading || myCourses.length === 0}
                        type="button"
                        aria-label="Send advising request to advisor"
                        title={myCourses.length === 0 ? "Select at least one section first" : "Send to advisor"}
                      >
                        {sending ? "Sending…" : "Send Request"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

        </div>

        <div className="advising-header-box" style={{ marginTop: "1rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
            <div>
              <h3 style={{ margin: 0, fontSize: "18px", fontWeight: 600, color: "#111827" }}>
                Report a Problem to Registrar
              </h3>
              <p style={{ margin: "4px 0 0", fontSize: "14px", color: "#6b7280" }}>
                Facing an issue with registration, courses, or scheduling? Submit a problem report directly to the Registrar.
              </p>
            </div>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setShowReportForm((v) => !v)}
              style={{ padding: "8px 16px", fontSize: "14px", whiteSpace: "nowrap" }}
            >
              {showReportForm ? "Close Form" : "Report a Problem"}
            </button>
          </div>

          {showReportForm && (
            <form onSubmit={handleReportProblem} style={{ marginTop: "1rem", borderTop: "1px solid #e5e7eb", paddingTop: "1rem" }}>
              <label style={{ display: "block", fontSize: "14px", fontWeight: 500, color: "#374151", marginBottom: "6px" }}>
                Describe your problem:
              </label>
              <textarea
                style={{
                  width: "100%",
                  minHeight: "100px",
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: "1px solid #d1d5db",
                  fontSize: "14px",
                  resize: "vertical",
                  boxSizing: "border-box",
                  fontFamily: "inherit",
                }}
                placeholder="Enter details of the issue you are facing..."
                value={problemText}
                onChange={(e) => setProblemText(e.target.value)}
                disabled={submittingReport}
              />
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "10px", gap: "8px" }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setShowReportForm(false);
                    setProblemText("");
                  }}
                  disabled={submittingReport}
                  style={{ padding: "8px 16px" }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-confirm"
                  disabled={submittingReport || !problemText.trim()}
                  style={{ padding: "8px 20px" }}
                >
                  {submittingReport ? "Submitting..." : "Submit Report"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      <CuteToast open={toastOpen} onClose={() => setToastOpen(false)}>{toastMsg}</CuteToast>
    </div>
  );
}
