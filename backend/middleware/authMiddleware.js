import jwt from 'jsonwebtoken';
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET is required');
}


export function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ message: 'No token provided' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ message: 'Invalid token' });
    req.user = user; 
    next();
  });
}


export function authorizeRole(role) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ message: 'Not authenticated' });
    if (req.user.role !== role) {
      return res.status(403).json({ message: `Requires ${role} role` });
    }
    next();
  };
}
