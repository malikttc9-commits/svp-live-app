import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { readDb } from '../dataStore.js';

const router = Router();

function signToken(payload) {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: '7d' });
}

async function verifyFlexiblePassword(plain, passwordHash, legacyPassword) {
  if (passwordHash) return bcrypt.compare(plain, passwordHash);
  return plain === (legacyPassword || '');
}

router.post('/admin/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ message: 'Email and password are required' });

  const db = await readDb();
  const admin = (db.admins || []).find(a => (a.email || '').toLowerCase() === String(email).toLowerCase() && a.active !== false);
  if (!admin) return res.status(401).json({ message: 'Invalid credentials' });

  const ok = await verifyFlexiblePassword(password, admin.passwordHash, admin.password);
  if (!ok) return res.status(401).json({ message: 'Invalid credentials' });

  const token = signToken({
    sub: admin.id,
    type: 'admin',
    role: admin.role || 'staff',
    permissions: admin.permissions || {},
    name: admin.name,
    email: admin.email,
  });

  res.json({ token, admin: { id: admin.id, name: admin.name, email: admin.email, role: admin.role, permissions: admin.permissions || {} } });
});

router.post('/candidate/login', async (req, res) => {
  const { id, password } = req.body || {};
  if (!id || !password) return res.status(400).json({ message: 'Candidate ID and password are required' });

  const db = await readDb();
  const user = (db.users || []).find(u => (u.id || '').toUpperCase() === String(id).toUpperCase() && u.active !== false);
  if (!user) return res.status(401).json({ message: 'Invalid credentials' });

  const ok = await verifyFlexiblePassword(password, user.passwordHash, user.password);
  if (!ok) return res.status(401).json({ message: 'Invalid credentials' });

  const token = signToken({
    sub: user.id,
    type: 'candidate',
    trade: user.trade,
    name: user.name,
  });

  res.json({ token, user: { id: user.id, name: user.name, trade: user.trade } });
});

export default router;
