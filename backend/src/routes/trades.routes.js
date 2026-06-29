import { Router } from 'express';
import { readDb, updateDb } from '../dataStore.js';
import { requireAdmin, requirePermission } from '../middleware/auth.js';

const router = Router();

router.get('/', requireAdmin, async (_req, res) => {
  const db = await readDb();
  const fromQuestions = (db.questions || []).map(q => q.trade).filter(Boolean);
  const fromUsers = (db.users || []).map(u => u.trade).filter(Boolean);
  const trades = [...new Set([...(db.trades || []), ...fromQuestions, ...fromUsers].map(String).map(t => t.trim()).filter(Boolean))];
  res.json(trades);
});

router.put('/', requirePermission('canManageQuestions'), async (req, res) => {
  const trades = Array.isArray(req.body?.trades) ? req.body.trades : [];
  const normalized = [...new Set(trades.map(String).map(t => t.trim()).filter(Boolean))];

  const nextDb = await updateDb(async db => {
    db.trades = normalized;
    return db;
  });

  res.json(nextDb.trades);
});

export default router;
