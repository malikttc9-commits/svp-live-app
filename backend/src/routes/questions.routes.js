import { Router } from 'express';
import { readDb, updateDb } from '../dataStore.js';
import { requireAdmin, requirePermission } from '../middleware/auth.js';

const router = Router();

router.get('/public', async (req, res) => {
  const { trade = '' } = req.query;
  const db = await readDb();
  const list = (db.questions || []).filter(q => !trade || (q.trade || '') === String(trade));
  res.json(list);
});

router.get('/', requireAdmin, async (req, res) => {
  const { trade = '', search = '' } = req.query;
  const db = await readDb();
  const s = String(search).trim().toLowerCase();

  const list = (db.questions || []).filter(q => {
    if (trade && (q.trade || '') !== trade) return false;
    if (!s) return true;
    const hay = [q.text, ...(q.options || []), q.id, q.trade].filter(Boolean).join(' ').toLowerCase();
    return hay.includes(s);
  });

  res.json(list);
});

router.post('/', requirePermission('canManageQuestions'), async (req, res) => {
  const payload = req.body || {};
  if (!payload.trade || !payload.text || !Array.isArray(payload.options) || payload.options.length < 2) {
    return res.status(400).json({ message: 'trade, text, options are required' });
  }

  const nextDb = await updateDb(async db => {
    db.questions = db.questions || [];
    const id = payload.id || `Q-${Date.now()}`;
    db.questions.push({
      id,
      trade: payload.trade,
      text: payload.text,
      options: payload.options,
      correctIndex: Number.isInteger(payload.correctIndex) ? payload.correctIndex : 0,
      image: payload.image || null,
      optionImages: Array.isArray(payload.optionImages) ? payload.optionImages : [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    return db;
  });

  res.status(201).json(nextDb.questions[nextDb.questions.length - 1]);
});

router.put('/bulk', requirePermission('canManageQuestions'), async (req, res) => {
  const questions = Array.isArray(req.body?.questions) ? req.body.questions : null;
  if (!questions) return res.status(400).json({ message: 'questions array is required' });

  const allowEmpty = req.body?.allowEmpty === true;
  const forceReplaceAll = req.body?.forceReplaceAll === true;
  const currentDb = await readDb();
  const currentQuestions = Array.isArray(currentDb.questions) ? currentDb.questions : [];

  if (!allowEmpty && currentQuestions.length > 0 && questions.length === 0) {
    return res.status(409).json({
      message: 'Refusing to replace an existing question bank with an empty list without allowEmpty=true',
    });
  }

  const currentTrades = new Set(currentQuestions.map(q => String(q?.trade || '').trim()).filter(Boolean));
  const incomingTrades = new Set(questions.map(q => String(q?.trade || '').trim()).filter(Boolean));
  const missingTrades = Array.from(currentTrades).filter(trade => !incomingTrades.has(trade));

  if (!forceReplaceAll && missingTrades.length > 0) {
    return res.status(409).json({
      message: 'Refusing bulk overwrite because it would remove questions from existing trades. Use forceReplaceAll=true only for intentional delete actions.',
      missingTrades,
    });
  }

  const nextDb = await updateDb(async db => {
    db.questions = questions;
    return db;
  });

  res.json({ count: nextDb.questions.length });
});

router.put('/:id', requirePermission('canManageQuestions'), async (req, res) => {
  const payload = req.body || {};
  let found = false;

  const nextDb = await updateDb(async db => {
    db.questions = (db.questions || []).map(q => {
      if (q.id !== req.params.id) return q;
      found = true;
      return { ...q, ...payload, id: q.id, updatedAt: new Date().toISOString() };
    });
    return db;
  });

  if (!found) return res.status(404).json({ message: 'Question not found' });
  const q = nextDb.questions.find(x => x.id === req.params.id);
  res.json(q);
});

router.delete('/:id', requirePermission('canManageQuestions'), async (req, res) => {
  let removed = false;
  await updateDb(async db => {
    const before = (db.questions || []).length;
    db.questions = (db.questions || []).filter(q => q.id !== req.params.id);
    removed = db.questions.length < before;
    return db;
  });

  if (!removed) return res.status(404).json({ message: 'Question not found' });
  res.status(204).send();
});

export default router;
