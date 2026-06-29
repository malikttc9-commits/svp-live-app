import fs from 'fs/promises';
import path from 'path';
import bcrypt from 'bcryptjs';
import { config } from './config.js';

let writeQueue = Promise.resolve();

const defaultPermissions = {
  canManageUsers: true,
  canManageQuestions: true,
  canManageSettings: true,
  canViewReports: true,
  canManageAdminAccess: true,
};

function nowIso() {
  return new Date().toISOString();
}

async function ensureDbFile() {
  const dir = path.dirname(config.dataFile);
  await fs.mkdir(dir, { recursive: true });

  try {
    await fs.access(config.dataFile);
  } catch {
    const passwordHash = await bcrypt.hash('admin123', 10);
    const initial = {
      admins: [
        {
          id: 'main-admin',
          name: 'Main Admin',
          email: 'admin@admin.com',
          passwordHash,
          role: 'main',
          active: true,
          permissions: defaultPermissions,
          createdAt: nowIso(),
        },
      ],
      users: [],
      questions: [],
      settings: {
        questionsPerAttempt: 30,
        maxAttempts: 15,
        validityDays: 10,
        passingScore: 80,
      },
      trades: ['Construction Visa', 'Driver Visa', 'House Driver Visa', 'Worker Visa', 'Business Visa'],
      counters: {
        userCount: 0,
      },
    };

    await fs.writeFile(config.dataFile, JSON.stringify(initial, null, 2), 'utf8');
  }
}

async function ensureDefaultAdminRecord(db) {
  db.admins = Array.isArray(db.admins) ? db.admins : [];
  const hasMain = db.admins.some(a => (a.email || '').toLowerCase() === 'admin@admin.com');
  if (hasMain) return db;

  const passwordHash = await bcrypt.hash('admin123', 10);
  db.admins.unshift({
    id: 'main-admin',
    name: 'Main Admin',
    email: 'admin@admin.com',
    passwordHash,
    role: 'main',
    active: true,
    permissions: defaultPermissions,
    createdAt: nowIso(),
  });

  return db;
}

export async function readDb() {
  await ensureDbFile();
  const raw = await fs.readFile(config.dataFile, 'utf8');
  const db = JSON.parse(raw);
  const normalized = await ensureDefaultAdminRecord(db);
  if (normalized !== db || !raw.includes('admin@admin.com')) {
    await fs.writeFile(config.dataFile, JSON.stringify(normalized, null, 2), 'utf8');
  }
  return normalized;
}

export async function writeDb(nextDb) {
  writeQueue = writeQueue.then(async () => {
    await ensureDbFile();
    await fs.writeFile(config.dataFile, JSON.stringify(nextDb, null, 2), 'utf8');
  });

  return writeQueue;
}

export async function updateDb(mutator) {
  const db = await readDb();
  const nextDb = (await mutator(structuredClone(db))) || db;
  await writeDb(nextDb);
  return nextDb;
}

export function createUserId(count) {
  return `SVP${String(count).padStart(3, '0')}`;
}

export function getDefaultPermissions() {
  return { ...defaultPermissions };
}
