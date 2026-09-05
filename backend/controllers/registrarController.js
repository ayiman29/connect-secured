import * as registrarModel from '../models/registrarModel.js';

export async function addCourse(req, res) {
  const { courseId, title, name, examSchedule, courseCredit, registrarId } = req.body;

  if (!courseId || !title || !name || !examSchedule || !courseCredit == null || !registrarId) {
    return res.status(400).json({ 
      error: "Missing required fields: courseId, title, name, examSchedule, courseCredit, registrarId" 
    });
  }

  try {
    await registrarModel.addCourse(courseId, title, name, examSchedule, courseCredit, registrarId);
    res.status(201).json({ message: "Course updated successfully." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function deleteCourse(req, res) {
  const { courseId } = req.params;

  if (!courseId) {
    return res.status(400).json({ error: "Missing courseId in request parameters" });
  }

  try {
    await registrarModel.deleteCourse(courseId);
    res.status(200).json({ message: "Course deleted successfully." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function addSection(req, res) {
  const { courseId, sectionId, schedule, seatAvailability, faculty } = req.body;

  if (!courseId || !sectionId || !schedule || seatAvailability == null || !faculty) {
    return res.status(400).json({ 
      error: "Missing required fields: courseId, sectionId, schedule, seatAvailability, faculty" 
    });
  }

  try {
    await registrarModel.addSection(courseId, sectionId, schedule, seatAvailability, faculty);
    res.status(201).json({ message: "Section updated successfully." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function deleteSection(req, res) {
  const { courseId, sectionId } = req.params;

  if (!courseId || !sectionId) {
    return res.status(400).json({ error: "Missing courseId or sectionId in request parameters" });
  }

  try {
    await registrarModel.deleteSection(courseId, sectionId);
    res.status(200).json({ message: "Section deleted successfully." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}