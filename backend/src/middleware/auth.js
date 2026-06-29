import jwt from 'jsonwebtoken';
import { config } from '../config.js';

function readBearerToken(req) {
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) return null;
  return auth.slice(7).trim();
}

export function requireAuth(req, res, next) {
  const token = readBearerToken(req);
  if (!token) return res.status(401).json({ message: 'Missing auth token' });

  try {
    req.auth = jwt.verify(token, config.jwtSecret);
    return next();
  } catch {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
}

export function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.auth?.type !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }
    return next();
  });
}

export function requireCandidate(req, res, next) {
  requireAuth(req, res, () => {
    if (req.auth?.type !== 'candidate') {
      return res.status(403).json({ message: 'Candidate access required' });
    }
    return next();
  });
}

export function requirePermission(permissionKey) {
  return (req, res, next) => {
    requireAdmin(req, res, () => {
      const role = req.auth?.role || '';
      if (role === 'main' || role === 'super') return next();

      const perms = req.auth?.permissions || {};
      if (!perms[permissionKey]) {
        return res.status(403).json({ message: `Permission denied: ${permissionKey}` });
      }

      return next();
    });
  };
}
