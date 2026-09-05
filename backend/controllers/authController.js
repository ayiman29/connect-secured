import { findUserByEmail, getUserRole } from '../models/userModel.js';
import { createStudent } from '../models/studentModel.js';
import { createAdvisor } from '../models/advisorModel.js';
import { createRegistrar } from '../models/registrarModel.js';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET is required');
}


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

    const token = jwt.sign(
      { userId: user.user_id, email: user.email, name: user.name, role: userRole.role },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    res.status(200).json({ token, user: { email: user.email, name: user.name, role: userRole.role } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
}