// src/lib/api.js
const API_URL = import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:5050';

async function request(path, options = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText);
    throw new Error(`HTTP ${res.status}: ${errText}`);
  }
  return res.headers.get('content-type')?.includes('application/json')
    ? res.json()
    : res.text();
}

export const api = {
  getCourses: () => request('/students/courses'),
  getCourseDetail: (courseId) => request(`/students/courses/${courseId}`),

  addCourse: (body) =>
    request('/students/add-course', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
};
export const registrar = {

  listCourses: () => request('/students/courses'),

  addOrUpdateCourse: ({ courseId, title, name, courseCredit, examSchedule, registrarEmail }) =>
    request('/registrars/course', {
      method: 'POST',
      body: JSON.stringify({
        courseId,
        title,
        name,
        courseCredit,
        examSchedule,
        registrarEmail, 
      }),
    }),

  dropCourse: (courseId) =>
    request(`/registrars/course/${encodeURIComponent(courseId)}`, {
      method: 'DELETE',
    }),

  addOrUpdateSection: ({ courseId, sectionId, schedule, faculty, seatAvailability }) =>
    request('/registrars/section', {
      method: 'POST',
      body: JSON.stringify({
        courseId,
        sectionId,        
        schedule,
        faculty,
        seatAvailability,
      }),
    }),

  dropSection: ({ courseId, sectionId }) =>
    request(`/registrars/section/${encodeURIComponent(courseId)}/${encodeURIComponent(sectionId)}`, {
      method: 'DELETE',
    }),
};

let AUTH_TOKEN = null;
export function setAuthToken(token) { AUTH_TOKEN = token; }

async function authed(path, init={}) {
  const headers = {
    ...(init.headers || {}),
    ...(AUTH_TOKEN ? { Authorization: `Bearer ${AUTH_TOKEN}` } : {}),
  };
  return request(path, { ...init, headers });
}

export const advisor = {
  getWaitingStudents: () => authed('/advisors/waiting-students'),

  approveAdvising: (studentId, status /* 'approved' | 'denied' */) =>
    authed(`/advisors/approve/${encodeURIComponent(studentId)}`, {
      method: 'PUT',
      body: JSON.stringify({ status }),
    }),

  addCourse: ({ studentId, courseId, sectionId }) =>
    authed('/advisors/add-course', {
      method: 'POST',
      body: JSON.stringify({ studentId, courseId, sectionId }),
    }),

  dropCourse: ({ studentId, courseId, sectionId }) =>
    authed('/advisors/drop-course', {
      method: 'POST',
      body: JSON.stringify({ studentId, courseId, sectionId }),
    }),
};
