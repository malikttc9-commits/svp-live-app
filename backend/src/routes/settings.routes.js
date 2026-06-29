import { Router } from 'express';
import { readDb, updateDb } from '../dataStore.js';
import { requireAdmin, requirePermission } from '../middleware/auth.js';

const router = Router();

router.get('/', requireAdmin, async (_req, res) => {
  const db = await readDb();
  res.json(db.settings || {});
});

router.get('/public', async (_req, res) => {
  const db = await readDb();
  res.json(db.settings || {});
});

router.put('/', requirePermission('canManageSettings'), async (req, res) => {
  const payload = req.body || {};
  const nextDb = await updateDb(async db => {
    db.settings = {
      ...db.settings,
      ...payload,
      questionsPerAttempt: Number(payload.questionsPerAttempt ?? db.settings?.questionsPerAttempt ?? 30),
      maxAttempts: Number(payload.maxAttempts ?? db.settings?.maxAttempts ?? 15),
      validityDays: Number(payload.validityDays ?? db.settings?.validityDays ?? 10),
      passingScore: Number(payload.passingScore ?? db.settings?.passingScore ?? 80),
    };
    return db;
  });

  res.json(nextDb.settings);
});

export default router;
