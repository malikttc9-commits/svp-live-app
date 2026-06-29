import { Router } from 'express';
import { readDb } from '../dataStore.js';
import { requirePermission } from '../middleware/auth.js';

const router = Router();

function getReportStatus(u) {
  const now = new Date();
  const scores = Array.isArray(u.scores) ? u.scores : [];
  const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
  const validTill = u.validTill ? new Date(u.validTill) : null;
  const isExpired = validTill ? validTill < now : false;

  return {
    avgScore: avg,
    isExpired,
    isActive: !isExpired,
    isGoodAverage: avg !== null && avg >= 80,
  };
}

router.get('/', requirePermission('canViewReports'), async (req, res) => {
  const { search = '', trade = '', agent = '', status = 'all' } = req.query;
  const s = String(search).trim().toLowerCase();

  const db = await readDb();
  const users = (db.users || []).filter(u => {
    const rep = getReportStatus(u);
    const hay = [u.name, u.id, u.trade, u.city, u.mobile, u.agentReference].filter(Boolean).join(' ').toLowerCase();

    if (trade && (u.trade || '') !== trade) return false;
    if (agent && (u.agentReference || '') !== agent) return false;
    if (status === 'passed' && !u.passed) return false;
    if (status === 'expired' && !rep.isExpired) return false;
    if (status === 'active' && !rep.isActive) return false;
    if (status === 'goodAverage' && !rep.isGoodAverage) return false;
    if (s && !hay.includes(s)) return false;
    return true;
  }).map(u => {
    const rep = getReportStatus(u);
    return {
      ...u,
      avgScore: rep.avgScore,
      reportFlags: {
        expired: rep.isExpired,
        active: rep.isActive,
        goodAverage: rep.isGoodAverage,
      },
    };
  });

  res.json(users);
});

export default router;
