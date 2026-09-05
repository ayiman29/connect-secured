import React, {  useCallback, useEffect, useMemo, useRef, useState } from "react";
import AvailableSections from "./AvailableSections";
import SelectedSections from "./SelectedSections";
import "./Panel.css";
import "./AdvisorView.css";
import "./Nav.css";
import ChatWidget from "./ChatWidget";
import CommentSection from "./CommentSection";
import bracuLogo from "./assets/bracu.png";
import notifButton from "./assets/bell_icon.png";


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
        <span className="toast-text">{children}</span>
        <button className="toast-x" onClick={onClose} aria-label="Dismiss">×</button>
      </div>
    </div>
  );
}

/* ---------------- helpers (StudentView parity) ---------------- */
function getStoredUser() {
  try {
    const raw = localStorage.getItem("user");
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
const pad2 = (n) => String(n).padStart(2, "0");
function formatExamSchedule(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}
const rowKey = (r) =>
  `${r.raw?.course?.course_id ?? r.course_id ?? r.courseId ?? r.id ?? "?"}:${
    r.raw?.section?.section_id ?? r.section_id ?? r.sectionId ?? ""
  }`;

/* cache per studentId */
function cacheKeys(studentId) {
  const sid = String(studentId || "unknown");
  return { all: `allCoursesCache:${sid}`, mine: `myCoursesCache:${sid}` };
}
function loadCache(studentId) {
  try {
    const { all, mine } = cacheKeys(studentId);
    const allRows = JSON.parse(localStorage.getItem(all) || "null");
    const myRows  = JSON.parse(localStorage.getItem(mine) || "null");
    return {
      allRows: Array.isArray(allRows) ? allRows : null,
      myRows:  Array.isArray(myRows)  ? myRows  : null,
    };
  } catch { return { allRows: null, myRows: null }; }
}
function saveCache(studentId, allRows, myRows) {
  const { all, mine } = cacheKeys(studentId);
  try {
    if (allRows) localStorage.setItem(all, JSON.stringify(allRows));
    if (myRows)  localStorage.setItem(mine, JSON.stringify(myRows));
  } catch {}
}

/* accept several seat field names */
function getSeatFromAny(obj = {}) {
  const v = obj.seat_availability;
  if (v === null || v === undefined) return 40;
  const n = Number(typeof v === "string" ? v.trim() : v);
  return Number.isFinite(n) ? n : 40;
}

/* ui row */
function mapAnyToRows(apiData) {
  const out = [];
  for (const item of apiData || []) {
    if (Array.isArray(item.sections) && item.sections.length) {
      const c = item;
      for (const s of c.sections) {
        const seat = getSeatFromAny(s);
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
            course: {
              course_id: Number(c.course_id),
              title: c.title ?? c.course_name ?? c.name,
              course_name: c.course_name ?? c.name ?? c.title,
              course_credit: Number(c.course_credit ?? 0),
              exam_schedule: c.exam_schedule ?? null,
            },
            section: {
              section_id: Number(s.section_id),
              faculty: s.faculty,
              schedule: s.schedule,
              seat_availability: seat,
            },
          },
        });
      }
      continue;
    }

    const cId = item.course_id;
    const sId = item.section_id;
    if (cId == null || sId == null) continue;

    const title =item.title ?? "";
    const name = item.name;
    const credit = Number(item.course_credit ?? 0);
    const faculty = item.faculty ?? "To Be Announced";
    const schedule = item.schedule ?? "-";
    const seat = getSeatFromAny(item);
    const exam = item.exam_schedule  ?? null;

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
        course: {
          course_id: Number(cId),
          title: title || name,
          course_name: name || title,
          course_credit: credit,
          exam_schedule: exam || null,
        },
        section: {
          section_id: Number(sId),
          faculty,
          schedule,
          seat_availability: seat,
        },
      },
    });
  }
  return out;
}

/* pick ids */
function pickIds(row) {
  const courseId = row?.raw?.course?.course_id;
  const sectionId = row?.raw?.section?.section_id;
  return { courseId, sectionId };
}

/* test*/
async function fetchFirstOk(urls, options) {
  for (const u of urls) {
    try {
      const res = await fetch(u, options);
      if (res.ok) return await res.json().catch(() => ({}));
    } catch {}
  }
  throw new Error("No endpoint responded OK");
}



export default function AdvisorView() {
  const [studentId, setStudentId] = useState("");
  const idInputRef = useRef(null);

  const [available, setAvailable] = useState([]);
  const [selected, setSelected] = useState([]);

  const [loading, setLoading] = useState(false);
  const [mutating, setMutating] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [advisorId, setAdvisorId] = useState(null);

  const [toastOpen, setToastOpen] = useState(false);
  const [toastMsg, setToastMsg] = useState("");
  const showToast = useCallback((m) => { setToastMsg(m); setToastOpen(true); }, []);

  /* advisor id, via advisor email */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const user = getStoredUser();
        const email = user?.email;
        if (!email) throw new Error("Advisor email missing.");
        const res = await fetch(`/advisors/id-by-email/${encodeURIComponent(email)}`);
        if (!res.ok) throw new Error(await res.text().catch(() => res.statusText));
        const json = await res.json();
        const id = json?.advisor_id ?? json?.advisorId;
        if (!id) throw new Error("advisor_id not found for email");
        if (!cancelled) setAdvisorId(Number(id));
      } catch (e) {
        if (!cancelled) showToast(e.message || "Failed to resolve advisor id.");
      }
    })();
    return () => { cancelled = true; };
  }, [showToast]);

  /* load lists */
  const loadLists = useCallback(async (sid) => {
    setLoading(true);
    try {
      const ra = await fetch(`/advisors/courses/${sid}`);
      if (!ra.ok) throw new Error(await ra.text().catch(() => ra.statusText));
      const avail = await ra.json();
      const allRows = mapAnyToRows(Array.isArray(avail) ? avail : (avail?.data ?? []));

      const rs = await fetch(`/advisors/student-courses/${sid}`);
      if (!rs.ok) throw new Error(await rs.text().catch(() => rs.statusText));
      const sel = await rs.json();
      const rawSelected = mapAnyToRows(Array.isArray(sel) ? sel : (sel?.data ?? []));

      const uniqueCourseIds = [...new Set(rawSelected.map(r => Number(pickIds(r).courseId)).filter(Boolean))];

      const details = await Promise.all(
        uniqueCourseIds.map(cid =>
          fetchFirstOk([`/advisors/course/${cid}`, `/advisors/course-detail/${cid}`, `/course/${cid}`])
            .then(d => [cid, d])
            .catch(() => [cid, null])
        )
      );
      const byCourseDetail = new Map(details);

      const enriched = rawSelected.map((r) => {
        const { courseId: cId, sectionId: sId } = pickIds(r);
        const d = byCourseDetail.get(Number(cId));
        if (!d) return r;

        const courseTitle = d.title;
        const courseName  = d.course_name;
        const credit      = Number(d.course_credit ?? 0);
        const exam        = d.exam_schedule ?? null;

        const sections = Array.isArray(d.sections) ? d.sections : [];
        const sec = sections.find(x => Number(x.section_id) === Number(sId)) || {};
        const faculty  = sec.faculty ?? "To Be Announced";
        const schedule = sec.schedule ?? "-";
        const seat     = getSeatFromAny(sec);

        return {
          ...r,
          credit,
          courseName,
          facultyName: faculty,
          courseSchedule: schedule,
          examSchedule: formatExamSchedule(exam),
          raw: {
            course: {
              course_id: Number(cId),
              title: courseTitle,
              course_name: courseName,
              course_credit: credit,
              exam_schedule: exam,
            },
            section: {
              section_id: Number(sId),
              faculty,
              schedule,
              seat_availability: seat,
            },
          },
          courseCode: `${courseTitle}–[${pad2(sId)}](${seat})-${faculty || "TBA"}`,
        };
      });

      setAvailable(allRows);
      setSelected(enriched);
      saveCache(sid, allRows, enriched);
    } catch (e) {
      setAvailable([]);
      setSelected([]);
      showToast(e.message || "Failed to load student courses.");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

// cache
  const searchStudent = useCallback((id) => {
    const clean = String(id || "").trim();
    if (!clean) return showToast("Enter a Student ID");

    const { allRows, myRows } = loadCache(clean);
    if (allRows) setAvailable(allRows);
    if (myRows)  setSelected(myRows);

    loadLists(clean);
  }, [loadLists, showToast]);

  const onIdKeyDown = (e) => {
    if (e.key === "Enter") searchStudent(studentId);
  };

  /* add */
  const handleAdd = useCallback(async (row) => {
    const sid = String(studentId || "").trim();
    if (!sid) return showToast("Enter a Student ID first.");
    if (!advisorId) return showToast("Advisor ID not resolved yet.");
    const { courseId, sectionId } = pickIds(row);
    if (!courseId || !sectionId) return showToast("Invalid row (no course/section id).");

    setMutating(true);
    try {
      const existing = selected.find(r => Number(pickIds(r).courseId) === Number(courseId));
      if (existing) {
        const { sectionId: oldSec } = pickIds(existing);
        const dropRes = await fetch(`/advisors/drop-course`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            studentId: Number(sid),
            courseId: Number(courseId),
            sectionId: Number(oldSec),
            advisorId: Number(advisorId),
          }),
        });
        if (!dropRes.ok) throw new Error(await dropRes.text().catch(() => dropRes.statusText));
      }

      const addRes = await fetch(`/advisors/add-course`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: Number(sid),
          courseId: Number(courseId),
          sectionId: Number(sectionId),
          advisorId: Number(advisorId),
        }),
      });
      if (!addRes.ok) throw new Error(await addRes.text().catch(() => addRes.statusText));

      await loadLists(sid);
    } catch (e) {
      showToast(e.message || "Failed to add course.");
    } finally {
      setMutating(false);
    }
  }, [studentId, advisorId, selected, showToast, loadLists]);

  /* drop */
  const handleDrop = useCallback(async (row) => {
    const sid = String(studentId || "").trim();
    if (!sid) return showToast("Enter a Student ID first.");
    if (!advisorId) return showToast("Advisor ID not resolved yet.");
    const { courseId, sectionId } = pickIds(row);
    if (!courseId || !sectionId) return showToast("Invalid row (no course/section id).");

    setMutating(true);
    try {
      const res = await fetch(`/advisors/drop-course`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: Number(sid),
          courseId: Number(courseId),
          sectionId: Number(sectionId),
          advisorId: Number(advisorId),
        }),
      });
      if (!res.ok) throw new Error(await res.text().catch(() => res.statusText));

      await loadLists(sid);
    } catch (e) {
      showToast(e.message || "Failed to drop course.");
    } finally {
      setMutating(false);
    }
  }, [studentId, advisorId, showToast, loadLists]);

  /* Confirm / Reject Advising */
  const handleRejectAdvising = useCallback(async () => {
    const sid = String(studentId || "").trim();
    if (!sid) return showToast("Enter a Student ID first.");
    setSubmitting(true);
    try {
      const res = await fetch(`/advisors/approve/${encodeURIComponent(sid)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "denied" }),
      });
      if (!res.ok) throw new Error(await res.text().catch(() => res.statusText));
      setWaiting(prev => prev.filter(x => String(x) !== sid));
      showToast("Advising rejected.");
      await loadLists(sid);
    } catch (e) {
      showToast(e.message || "Failed to reject advising.");
    } finally {
      setSubmitting(false);
    }
  }, [studentId, loadLists, showToast]);

  const handleConfirmAdvising = useCallback(async () => {
    const sid = String(studentId || "").trim();
    if (!sid) return showToast("Enter a Student ID first.");
    setSubmitting(true);
    try {
      const res = await fetch(`/advisors/approve/${encodeURIComponent(sid)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "approved" }),
      });
      if (!res.ok) throw new Error(await res.text().catch(() => res.statusText));
      setWaiting(prev => prev.filter(x => String(x) !== sid));
      showToast("Advising confirmed.");
      await loadLists(sid);
    } catch (e) {
      showToast(e.message || "Failed to confirm advising.");
    } finally {
      setSubmitting(false);
    }
  }, [studentId, loadLists, showToast]);

// notif
  const [waiting, setWaiting] = useState([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [notifLoading, setNotifLoading] = useState(false);
  const [notifLoaded, setNotifLoaded] = useState(false);
  const notifRef = useRef(null);

  const fetchWaiting = useCallback(async () => {
    if (notifLoading) return;
    setNotifLoading(true);
    try {
      const res = await fetch("/advisors/waiting-students");
      if (!res.ok) throw new Error(await res.text().catch(() => res.statusText));
      const data = await res.json();

      let ids = [];
      if (Array.isArray(data)) {
        ids = data.map(x => x?.student_id ?? x?.studentId ?? x?.id).filter(Boolean);
      } else if (Array.isArray(data?.data)) {
        ids = data.data.map(x => x?.student_id ?? x?.studentId ?? x?.id).filter(Boolean);
      }
      ids = Array.from(new Set(ids.map(String)));

      setWaiting(ids);
      setNotifLoaded(true);
    } catch (e) {
      showToast(e.message || "Failed to load waiting students.");
    } finally {
      setNotifLoading(false);
    }
  }, [notifLoading, showToast]);

  const toggleNotif = () => {
    setMenuOpen(v => {
      const next = !v;
      if (next && !notifLoaded) fetchWaiting();
      return next;
    });
  };

  useEffect(() => {
    const onDocPointer = (e) => { if (!notifRef.current?.contains(e.target)) setMenuOpen(false); };
    document.addEventListener("pointerdown", onDocPointer);
    return () => document.removeEventListener("pointerdown", onDocPointer);
  }, []);

  const openStudentFromNotif = (sid) => {
    const id = String(sid).trim();
    setStudentId(id);
    setWaiting(prev => prev.filter(x => String(x) !== id));
    setMenuOpen(false);
    requestAnimationFrame(() => {
      idInputRef.current?.focus({ preventScroll: true });
      idInputRef.current?.select?.();
      searchStudent(id);
    });
  };

  const unread = useMemo(() => waiting.length, [waiting]);

  return (
    <div>
      <nav className="navbar">
        <div className="navbar-inner">
          <div className="navbar-logo">
            <img src={bracuLogo} alt="BRAC University" />
          </div>
        </div>
      </nav>

      <nav className="sub-navbar">
        <div className="sub-box">
          <p>Advising for Fall 2025</p>

          <div className="notification" ref={notifRef}>
            <img
              src={notifButton}
              alt="Notifications"
              onClick={toggleNotif}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
            />
            {unread > 0 && (
              <span className="notif-badge" aria-label={`${unread} unread`}>
                {unread}
              </span>
            )}
            {menuOpen && (
              <div className="notif-menu" role="menu">
                <div className="notif-menu__header">
                  <span>Waiting students</span>
                  <button
                    className="notif-menu__mark-all"
                    onClick={fetchWaiting}
                    disabled={notifLoading}
                    title="Refresh waiting students"
                  >
                    {notifLoading ? "Loading…" : "Refresh"}
                  </button>
                </div>
                {unread === 0 ? (
                  <div className="notif-empty">{notifLoading ? "Loading…" : "No waiting students"}</div>
                ) : (
                  <ul className="notif-list">
                    {waiting.map((sid) => (
                      <li
                        key={sid}
                        className="notif-item"
                        role="menuitem"
                        onClick={() => openStudentFromNotif(sid)}
                        title={`Open student ${sid}`}
                      >
                        <div className="notif-dot" />
                        <div className="notif-body">
                          <div className="notif-title">Student {sid}</div>
                          <div className="notif-text">Waiting for advising</div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* search icon */}
      <div className="id-hero">
        <div className="id-hero__wrap id-hero__wrap--icon">
          <input
            ref={idInputRef}
            id="studentId"
            type="text"
            placeholder="Enter Student ID..."
            className="id-hero__input"
            value={studentId}
            onChange={(e) => setStudentId(e.target.value)}
            onKeyDown={onIdKeyDown}
            aria-label="Student ID"
          />
          <button
            type="button"
            className="id-hero__icon-btn"
            onClick={() => searchStudent(studentId)}
            aria-label="Search student"
            title="Search"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" fill="none" />
              <line x1="16.65" y1="16.65" x2="21" y2="21" stroke="currentColor" strokeWidth="2" />
            </svg>
          </button>
        </div>
      </div>

      <div className="panel-wrapper">
        <div className="advising-panel">
          <h2 className="advising-title">Advising Panel</h2>

          <div className="advising-sections">
            <div className="sections-container">
              <div className="section">
                <AvailableSections
                  rows={available}
                  loading={loading}
                  mutating={mutating}
                  onAdd={handleAdd}
                />
              </div>
              <div className="section">
                <SelectedSections
                  rows={selected}
                  loading={loading}
                  mutating={mutating}
                  onDrop={handleDrop}
                />

                <div className="advising-actions">
                  <button
                    className="btn btn-reject"
                    onClick={handleRejectAdvising}
                    disabled={submitting || !studentId}
                    aria-label="Reject advising"
                    type="button"
                  >
                    Reject Advising
                  </button>
                  <button
                    className="btn btn-confirm"
                    onClick={handleConfirmAdvising}
                    disabled={submitting || !studentId}
                    aria-label="Confirm advising"
                    type="button"
                  >
                    Confirm Advising
                  </button>
                </div>

              </div>
            </div>
          </div>

        </div>
      </div>

      {/* unified cute toast */}
      <CuteToast open={toastOpen} onClose={() => setToastOpen(false)}>
        {toastMsg}
      </CuteToast>
      <ChatWidget role="advisor" studentId={studentId} />
      <CommentSection />
    </div>
  );
}
