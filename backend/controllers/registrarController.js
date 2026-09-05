import * as registrarModel from '../models/registrarModel.js';
import * as reportModel from '../models/reportModel.js';
import { decryptProblemReport } from '../lib/security/crypto101RsaService.js';

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

export async function getAllReports(req, res) {
  try {
    const reports = await reportModel.getAllReports();
    res.status(200).json(reports);
  } catch (err) {
    console.error('Error fetching reports for registrar:', err);
    res.status(500).json({ error: err.message || 'Failed to fetch reports' });
  }
}

export async function decryptReport(req, res) {
  const reportId = parseInt(req.params.reportId);
  if (isNaN(reportId)) {
    return res.status(400).json({ error: 'Invalid reportId' });
  }

  try {
    const report = await reportModel.getReportById(reportId);
    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }

    // Decrypt RSA ciphertext with Registrar private key via crypto101
    const decrypted = await decryptProblemReport(report.encrypted_problem);
    res.status(200).json({
      report_id: reportId,
      decryptedProblem: decrypted,
    });
  } catch (err) {
    console.error('Error decrypting report:', err);
    res.status(500).json({ error: err.message || 'Failed to decrypt report' });
  }
}

export async function deleteReport(req, res) {
  const reportId = parseInt(req.params.reportId);
  if (isNaN(reportId)) {
    return res.status(400).json({ error: 'Invalid reportId' });
  }

  try {
    const success = await reportModel.deleteReport(reportId);
    if (!success) {
      return res.status(404).json({ error: 'Report not found or already deleted' });
    }
    res.status(200).json({ message: 'Problem marked as done and deleted successfully.' });
  } catch (err) {
    console.error('Error deleting report:', err);
    res.status(500).json({ error: err.message || 'Failed to delete report' });
  }
}