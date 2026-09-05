import React, { useRef, useEffect } from "react";
import "./tablestyle.css";
import removeLogo from "./assets/remove.png";
import viewLogo from "./assets/view.png";

/* modal */
function CourseModal({ course, onClose }) {
  const closeBtnRef = useRef(null);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    closeBtnRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  if (!course) return null;

  return (
    <div className="modal__backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="selectedCourseDetailsTitle">
        <div className="modal__header">
          <h3 id="selectedCourseDetailsTitle" className="modal__title">Course Details</h3>
          <button
            ref={closeBtnRef}
            type="button"
            className="modal__close"
            aria-label="Close"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        <div className="modal__course-title">
          <span>Course:</span>
          <p>{course.courseName}</p>
        </div>

        <div className="modal__body">
          <dl className="details-grid">
            <dt>Course Code:</dt>
            <dd>{course.courseCode}</dd>
            <dt>Course Name:</dt>
            <dd>{course.courseName}</dd>
            <dt>Faculty Name:</dt>
            <dd>{course.facultyName || "-"}</dd>
            <dt>Credit:</dt>
            <dd>{course.credit}</dd>
            <dt>Course Schedule:</dt>
            <dd>{course.courseSchedule || "-"}</dd>
            <dt>Exam Schedule:</dt>
            <dd>{course.examSchedule || "-"}</dd>
          </dl>
        </div>
      </div>
    </div>
  );
}

export default function SelectedSections({ rows = [], loading, mutating, onDrop }) {
  const [open, setOpen] = React.useState(false);
  const [activeCourse, setActiveCourse] = React.useState(null);

  const openModal = (row) => { setActiveCourse(row); setOpen(true); };
  const closeModal = () => { setOpen(false); setActiveCourse(null); };

  return (
    <div className="table-container">
      <div className="table-header">
        <h2>Selected Sections</h2>
      </div>

      {(loading || mutating) && <div className="table-status">Loading…</div>}

      {!loading && !mutating && (
        <div className="table-scroll">
          <table className="styled-table">
            <thead>
              <tr>
                <th>COURSE NAME</th>
                <th>ACTION</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{row.courseCode}</td>
                  <td className="action-icons">
                    <img
                      src={viewLogo}
                      alt="view details"
                      className="icon btn-icon"
                      onClick={() => openModal(row)}
                      onKeyDown={(e) => e.key === "Enter" && openModal(row)}
                      tabIndex={0}
                      role="button"
                      aria-label={`View details for ${row.courseCode}`}
                    />
                    <img
                      src={removeLogo}
                      alt="remove"
                      className="icon"
                      onClick={() => onDrop?.(row)}
                      onKeyDown={(e) => e.key === "Enter" && onDrop?.(row)}
                      tabIndex={0}
                      role="button"
                      aria-label={`Remove ${row.courseCode}`}
                    />
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={2} style={{ textAlign: "center", opacity: 0.7 }}>
                    No selected sections
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {open && <CourseModal course={activeCourse} onClose={closeModal} />}
    </div>
  );
}
