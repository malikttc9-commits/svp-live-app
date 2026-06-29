import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { readDb, updateDb, createUserId } from '../dataStore.js';
import { requireAdmin, requireAuth, requirePermission } from '../middleware/auth.js';

const router = Router();

function computeUserStatus(u) {
  const now = new Date();
  const validTill = u.validTill ? new Date(u.validTill) : null;
  const isExpired = validTill ? validTill < now : false;
  const scores = Array.isArray(u.scores) ? u.scores : [];
  const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
  return { isExpired, isActive: !isExpired, isGoodAverage: avg !== null && avg >= 80 };
}

router.get('/', requireAdmin, async (req, res) => {
  const { search = '', trade = '', agent = '', status = 'all' } = req.query;
  const db = await readDb();
  const s = String(search).trim().toLowerCase();

  const users = (db.users || []).filter(u => {
    const hay = [u.name, u.id, u.trade, u.city, u.mobile, u.agentReference].filter(Boolean).join(' ').toLowerCase();
    const st = computeUserStatus(u);

    if (trade && (u.trade || '') !== trade) return false;
    if (agent && (u.agentReference || '') !== agent) return false;
    if (status === 'passed' && !u.passed) return false;
    if (status === 'expired' && !st.isExpired) return false;
    if (status === 'active' && !st.isActive) return false;
    if (status === 'goodAverage' && !st.isGoodAverage) return false;
    if (s && !hay.includes(s)) return false;
    return true;
  });

  res.json(users);
});

router.get('/:id', requireAdmin, async (req, res) => {
  const db = await readDb();
  const user = (db.users || []).find(u => u.id === req.params.id);
  if (!user) return res.status(404).json({ message: 'User not found' });
  res.json(user);
});

router.get('/:id/profile', requireAuth, async (req, res) => {
  const auth = req.auth || {};
  const isAdmin = auth.type === 'admin';
  const isCandidateSelf = auth.type === 'candidate' && auth.sub === req.params.id;
  if (!isAdmin && !isCandidateSelf) {
    return res.status(403).json({ message: 'Not allowed to view this profile' });
  }

  const db = await readDb();
  const user = (db.users || []).find(u => u.id === req.params.id);
  if (!user) return res.status(404).json({ message: 'User not found' });
  res.json(user);
});

router.post('/', requirePermission('canManageUsers'), async (req, res) => {
  const payload = req.body || {};
  if (!payload.name || !payload.trade) return res.status(400).json({ message: 'name and trade are required' });

  const nextDb = await updateDb(async db => {
    db.counters = db.counters || { userCount: 0 };
    db.users = db.users || [];

    db.counters.userCount += 1;
    const id = payload.id || createUserId(db.counters.userCount);
    const password = payload.password || Math.random().toString(36).slice(-8);
    const passwordHash = await bcrypt.hash(password, 10);

    const newUser = {
      id,
      name: payload.name,
      trade: payload.trade,
      visaCategory: payload.visaCategory || payload.trade,
      mobile: payload.mobile || '',
      city: payload.city || '',
      agentReference: payload.agentReference || '',
      active: payload.active !== false,
      passed: false,
      totalAttempts: payload.totalAttempts || 0,
      maxAttempts: payload.maxAttempts || db.settings?.maxAttempts || 15,
      scores: [],
      attemptsHistory: [],
      usedQuestionIds: [],
      currentCycle: 1,
      validTill: payload.validTill || new Date(Date.now() + (db.settings?.validityDays || 10) * 86400000).toISOString(),
      password,
      passwordHash,
      createdAt: new Date().toISOString(),
    };

    db.users.push(newUser);
    return db;
  });

  const created = nextDb.users[nextDb.users.length - 1];
  res.status(201).json(created);
});

router.put('/bulk', requirePermission('canManageUsers'), async (req, res) => {
  const users = Array.isArray(req.body?.users) ? req.body.users : null;
  if (!users) return res.status(400).json({ message: 'users array is required' });

  const allowEmpty = req.body?.allowEmpty === true;
  const forceReplaceAll = req.body?.forceReplaceAll === true;
  const currentDb = await readDb();
  const currentUsers = Array.isArray(currentDb.users) ? currentDb.users : [];

  if (!allowEmpty && currentUsers.length > 0 && users.length === 0) {
    return res.status(409).json({
      message: 'Refusing to replace existing candidates with an empty list without allowEmpty=true',
    });
  }

  const currentIds = new Set(currentUsers.map(u => String(u?.id || '').trim()).filter(Boolean));
  const incomingIds = new Set(users.map(u => String(u?.id || '').trim()).filter(Boolean));
  const missingIds = Array.from(currentIds).filter(id => !incomingIds.has(id));

  if (!forceReplaceAll && missingIds.length > 0) {
    return res.status(409).json({
      message: 'Refusing bulk overwrite because it would remove existing candidates. Use forceReplaceAll=true only for intentional destructive actions.',
      missingCount: missingIds.length,
    });
  }

  const nextDb = await updateDb(async db => {
    db.users = users;
    db.counters = db.counters || { userCount: 0 };
    db.counters.userCount = Math.max(db.counters.userCount || 0, users.length);
    return db;
  });

  res.json({ count: nextDb.users.length });
});

router.put('/:id/progress', requireAuth, async (req, res) => {
  const auth = req.auth || {};
  const isAdmin = auth.type === 'admin';
  const isCandidateSelf = auth.type === 'candidate' && auth.sub === req.params.id;
  if (!isAdmin && !isCandidateSelf) {
    return res.status(403).json({ message: 'Not allowed to update this user progress' });
  }

  const allowed = new Set([
    'scores',
    'totalAttempts',
    'passed',
    'attemptsHistory',
    'usedQuestionIds',
    'currentCycle',
    'lastAttemptAt',
    'wrongAnswerPool',
  ]);

  const patch = {};
  Object.keys(req.body || {}).forEach(k => {
    if (allowed.has(k)) patch[k] = req.body[k];
  });

  let found = false;
  const nextDb = await updateDb(async db => {
    db.users = (db.users || []).map(u => {
      if (u.id !== req.params.id) return u;
      found = true;
      return { ...u, ...patch, updatedAt: new Date().toISOString() };
    });
    return db;
  });

  if (!found) return res.status(404).json({ message: 'User not found' });
  const user = nextDb.users.find(u => u.id === req.params.id);
  res.json(user);
});

router.put('/:id', requirePermission('canManageUsers'), async (req, res) => {
  const payload = req.body || {};
  let found = false;

  const nextDb = await updateDb(async db => {
    db.users = (db.users || []).map(u => {
      if (u.id !== req.params.id) return u;
      found = true;
      return { ...u, ...payload, id: u.id };
    });
    return db;
  });

  if (!found) return res.status(404).json({ message: 'User not found' });
  const user = nextDb.users.find(u => u.id === req.params.id);
  res.json(user);
});

router.delete('/:id', requireAdmin, async (req, res) => {
  const role = req.auth?.role || '';
  if (!(role === 'main' || role === 'super')) {
    return res.status(403).json({ message: 'Only main/super admin can delete users' });
  }

  let removed = false;
  await updateDb(async db => {
    const before = (db.users || []).length;
    db.users = (db.users || []).filter(u => u.id !== req.params.id);
    removed = db.users.length < before;
    return db;
  });

  if (!removed) return res.status(404).json({ message: 'User not found' });
  res.status(204).send();
});

export default router;
