import {
  findUserByEmail,
  getUserById,
  getUserRole,
  saveTotpSecret,
  enableTotp,
} from '../models/userModel.js';
import { createStudent } from '../models/studentModel.js';
import { createAdvisor } from '../models/advisorModel.js';
import { createRegistrar } from '../models/registrarModel.js';
import { decryptValue } from '../lib/security/cryptoService.js';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import speakeasy from 'speakeasy';
import QRCode from 'qrcode';

const JWT_SECRET = process.env.JWT_SECRET;
const APP_NAME   = 'BracuCentral';

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET is required');
}

// ─── helpers ────────────────────────────────────────────────────────────────

/** Short-lived token used between step-1 (password) and step-2 (TOTP). */
function issuePreAuthToken(userId) {
  return jwt.sign(
    { userId, stage: 'pre-auth' },
    JWT_SECRET,
    { expiresIn: '5m' }
  );
}

/** Full session token issued after both factors are verified. */
function issueSessionToken(user, userRole) {
  return jwt.sign(
    { userId: user.user_id, email: user.email, name: user.name, role: userRole.role },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

/** Verify and decode a pre-auth token; throws on failure. */
function decodePreAuthToken(token) {
  const payload = jwt.verify(token, JWT_SECRET);
  if (payload.stage !== 'pre-auth') {
    throw new Error('Invalid token stage');
  }
  return payload;
}

// ─── signup ─────────────────────────────────────────────────────────────────

export async function signup(req, res) {
  try {
    const { email, name, password, role, id } = req.body;

    if (!email || !name || !password || !role || !id) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    const existingUser = await findUserByEmail(email);
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists' });
    }

    if (role === 'student') {
      const credit = req.body.credit || 0;
      await createStudent(id, email, name, password, credit);
    } else if (role === 'advisor') {
      await createAdvisor(id, email, name, password);
    } else if (role === 'registrar') {
      await createRegistrar(id, email, name, password);
    } else {
      return res.status(400).json({ message: 'Invalid role' });
    }

    res.status(201).json({ message: 'User created successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
}

// ─── step 1: verify password → return pre-auth token ────────────────────────

export async function login(req, res) {
  try {
    const { email, password, role } = req.body;

    if (!email || !password || !role) {
      return res.status(400).json({ message: 'Email, password, and role are required' });
    }

    const user = await findUserByEmail(email);
    if (!user) return res.status(400).json({ message: 'Invalid credentials' });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ message: 'Invalid credentials' });

    const userRole = await getUserRole(user.user_id);
    if (!userRole || userRole.role !== role) {
      return res.status(400).json({ message: `User is not a ${role}` });
    }

    // Issue a short-lived pre-auth token; the client must now complete TOTP.
    const preAuthToken = issuePreAuthToken(user.user_id);

    return res.status(200).json({
      preAuthToken,
      totp_enabled: user.totp_enabled,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
}

// ─── step 2a: generate TOTP secret + QR code (enrollment) ───────────────────

export async function setupTotp(req, res) {
  try {
    const { preAuthToken } = req.body;
    if (!preAuthToken) {
      return res.status(400).json({ message: 'preAuthToken is required' });
    }

    let payload;
    try {
      payload = decodePreAuthToken(preAuthToken);
    } catch {
      return res.status(401).json({ message: 'Invalid or expired session. Please log in again.' });
    }

    const user = await getUserById(payload.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Generate a new TOTP secret and save it (overwriting any previous pending secret).
    const secret = speakeasy.generateSecret({
      name: `${APP_NAME} (${user.email})`,
      length: 20,
    });

    await saveTotpSecret(user.user_id, secret.base32);

    // Build the otpauth:// URL and render it as a base64 QR code PNG.
    const otpauthUrl = secret.otpauth_url;
    const qrCode = await QRCode.toDataURL(otpauthUrl);

    return res.status(200).json({ qrCode, otpauthUrl });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
}

// ─── step 2b: verify TOTP code → issue full session token ───────────────────

export async function verifyTotp(req, res) {
  try {
    const { preAuthToken, code } = req.body;

    if (!preAuthToken || !code) {
      return res.status(400).json({ message: 'preAuthToken and code are required' });
    }

    let payload;
    try {
      payload = decodePreAuthToken(preAuthToken);
    } catch {
      return res.status(401).json({ message: 'Invalid or expired session. Please log in again.' });
    }

    const user = await getUserById(payload.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (!user.totp_secret) {
      return res.status(400).json({ message: 'TOTP not set up for this account.' });
    }

    // Decrypt the stored secret before verifying.
    const plaintextSecret = decryptValue(user.totp_secret);

    const valid = speakeasy.totp.verify({
      secret: plaintextSecret,
      encoding: 'base32',
      token: String(code).replace(/\s/g, ''),
      window: 1, // allow ±30-second clock skew
    });

    if (!valid) {
      return res.status(401).json({ message: 'Invalid or expired code. Try again.' });
    }

    // On first successful verification, mark TOTP as fully enrolled.
    if (!user.totp_enabled) {
      await enableTotp(user.user_id);
    }

    // Fetch role to build the full session token.
    const userRole = await getUserRole(user.user_id);
    if (!userRole) return res.status(400).json({ message: 'User has no assigned role' });

    const token = issueSessionToken(user, userRole);

    return res.status(200).json({
      token,
      user: { email: user.email, name: user.name, role: userRole.role },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
}