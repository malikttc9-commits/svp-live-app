import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { readDb, writeDb, updateDb, getDefaultPermissions } from '../dataStore.js';
import { requireAdmin } from '../middleware/auth.js';

const router = Router();

function isMainOrSuper(auth) {
  const role = auth?.role || '';
  return role === 'main' || role === 'super';
}

function normalizeImportedDb(rawDb) {
  if (!rawDb || typeof rawDb !== 'object' || Array.isArray(rawDb)) {
    throw new Error('Invalid database payload');
  }

  const nextDb = structuredClone(rawDb);
  nextDb.admins = Array.isArray(nextDb.admins) ? nextDb.admins : [];
  nextDb.users = Array.isArray(nextDb.users) ? nextDb.users : [];
  nextDb.questions = Array.isArray(nextDb.questions) ? nextDb.questions : [];
  nextDb.trades = Array.isArray(nextDb.trades) ? nextDb.trades : [];
  nextDb.settings = (nextDb.settings && typeof nextDb.settings === 'object' && !Array.isArray(nextDb.settings))
    ? nextDb.settings
    : {
      questionsPerAttempt: 30,
      maxAttempts: 15,
      validityDays: 10,
      passingScore: 80,
    };

  const userCount = Number(nextDb?.counters?.userCount);
  nextDb.counters = {
    ...(nextDb.counters && typeof nextDb.counters === 'object' ? nextDb.counters : {}),
    userCount: Number.isFinite(userCount) && userCount >= 0 ? Math.floor(userCount) : nextDb.users.length,
  };

  return nextDb;
}

router.get('/db/export', requireAdmin, async (req, res) => {
  if (!isMainOrSuper(req.auth)) return res.status(403).json({ message: 'Only main/super admin can export database' });

  const db = await readDb();
  res.json({
    exportedAt: new Date().toISOString(),
    data: db,
  });
});

router.post('/db/import', requireAdmin, async (req, res) => {
  if (!isMainOrSuper(req.auth)) return res.status(403).json({ message: 'Only main/super admin can import database' });

  try {
    const source = req.body?.data ?? req.body;
    const normalized = normalizeImportedDb(source);
    await writeDb(normalized);
    const hydrated = await readDb();
    return res.json({
      message: 'Database imported successfully',
      summary: {
        admins: (hydrated.admins || []).length,
        users: (hydrated.users || []).length,
        questions: (hydrated.questions || []).length,
        trades: (hydrated.trades || []).length,
      },
      importedAt: new Date().toISOString(),
    });
  } catch (error) {
    return res.status(400).json({ message: error?.message || 'Invalid import payload' });
  }
});

router.get('/', requireAdmin, async (req, res) => {
  if (!isMainOrSuper(req.auth)) return res.status(403).json({ message: 'Only main/super admin can view admins' });
  const db = await readDb();
  const admins = (db.admins || []).map(a => ({
    id: a.id,
    name: a.name,
    email: a.email,
    role: a.role,
    active: a.active !== false,
    permissions: a.permissions || getDefaultPermissions(),
    createdAt: a.createdAt,
  }));
  res.json(admins);
});

router.post('/', requireAdmin, async (req, res) => {
  if (!isMainOrSuper(req.auth)) return res.status(403).json({ message: 'Only main/super admin can create admins' });

  const { name, email, password, role = 'staff', permissions } = req.body || {};
  if (!name || !email || !password) return res.status(400).json({ message: 'name, email, password are required' });

  let duplicate = false;
  const nextDb = await updateDb(async db => {
    db.admins = db.admins || [];

    if (db.admins.some(a => (a.email || '').toLowerCase() === String(email).toLowerCase())) {
      duplicate = true;
      return db;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    db.admins.push({
      id: `staff-${Date.now()}`,
      name,
      email,
      passwordHash,
      role,
      active: true,
      permissions: { ...getDefaultPermissions(), ...(permissions || {}) },
      createdAt: new Date().toISOString(),
    });

    return db;
  });

  if (duplicate) return res.status(409).json({ message: 'Email already exists' });
  res.status(201).json(nextDb.admins[nextDb.admins.length - 1]);
});

router.put('/bulk', requireAdmin, async (req, res) => {
  if (!isMainOrSuper(req.auth)) return res.status(403).json({ message: 'Only main/super admin can bulk update admins' });

  const admins = Array.isArray(req.body?.admins) ? req.body.admins : null;
  if (!admins) return res.status(400).json({ message: 'admins array is required' });

  const nextDb = await updateDb(async db => {
    db.admins = admins;
    return db;
  });

  res.json({ count: nextDb.admins.length });
});

router.put('/:id', requireAdmin, async (req, res) => {
  if (!isMainOrSuper(req.auth)) return res.status(403).json({ message: 'Only main/super admin can update admins' });

  const { name, email, password, role, permissions, active } = req.body || {};
  let found = false;

  const nextDb = await updateDb(async db => {
    db.admins = (db.admins || []).map(a => {
      if (a.id !== req.params.id) return a;
      found = true;
      return {
        ...a,
        name: name ?? a.name,
        email: email ?? a.email,
        role: role ?? a.role,
        active: active ?? a.active,
        permissions: permissions ? { ...getDefaultPermissions(), ...permissions } : a.permissions,
      };
    });

    if (password && found) {
      const i = db.admins.findIndex(a => a.id === req.params.id);
      if (i >= 0) {
        db.admins[i].passwordHash = bcrypt.hashSync(password, 10);
      }
    }

    return db;
  });

  if (!found) return res.status(404).json({ message: 'Admin not found' });
  const updated = nextDb.admins.find(a => a.id === req.params.id);
  res.json(updated);
});

router.delete('/:id', requireAdmin, async (req, res) => {
  if (!isMainOrSuper(req.auth)) return res.status(403).json({ message: 'Only main/super admin can delete admins' });
  if (req.params.id === 'main-admin') return res.status(400).json({ message: 'Main admin cannot be deleted' });

  let removed = false;
  await updateDb(async db => {
    const before = (db.admins || []).length;
    db.admins = (db.admins || []).filter(a => a.id !== req.params.id);
    removed = db.admins.length < before;
    return db;
  });

  if (!removed) return res.status(404).json({ message: 'Admin not found' });
  res.status(204).send();
});

export default router;
