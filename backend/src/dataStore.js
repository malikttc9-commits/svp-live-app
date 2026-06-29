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

const MAIN_ADMIN_EMAIL = 'mohsinmalik128@gmail.com';
const MAIN_ADMIN_NAME = 'Super Admin';
const MAIN_ADMIN_ROLE = 'super';
const MAIN_ADMIN_HASH = '$2a$10$QD.T51jyGb2A6r0s0uZZc.TxuQNqmpv6peyZZ6LiHPRt35wJGm9.u';

function nowIso() {
  return new Date().toISOString();
}

async function ensureDbFile() {
  const dir = path.dirname(config.dataFile);
  await fs.mkdir(dir, { recursive: true });

  try {
    await fs.access(config.dataFile);
  } catch {
    const initial = {
      admins: [
        {
          id: 'main-admin',
          name: MAIN_ADMIN_NAME,
          email: MAIN_ADMIN_EMAIL,
          passwordHash: MAIN_ADMIN_HASH,
          role: MAIN_ADMIN_ROLE,
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
  let changed = false;

  let mainAdmin = db.admins.find(a => a?.id === 'main-admin' || a?.role === 'main' || a?.role === 'super');
  if (!mainAdmin) {
    mainAdmin = {
      id: 'main-admin',
      name: MAIN_ADMIN_NAME,
      email: MAIN_ADMIN_EMAIL,
      passwordHash: MAIN_ADMIN_HASH,
      role: MAIN_ADMIN_ROLE,
      active: true,
      permissions: defaultPermissions,
      createdAt: nowIso(),
    };
    db.admins.unshift(mainAdmin);
    changed = true;
  }

  if ((mainAdmin.email || '').toLowerCase() !== MAIN_ADMIN_EMAIL) {
    mainAdmin.email = MAIN_ADMIN_EMAIL;
    changed = true;
  }
  if (!mainAdmin.name) {
    mainAdmin.name = MAIN_ADMIN_NAME;
    changed = true;
  }
  if ((mainAdmin.role || '').toLowerCase() !== MAIN_ADMIN_ROLE) {
    mainAdmin.role = MAIN_ADMIN_ROLE;
    changed = true;
  }
  if (mainAdmin.active === false) {
    mainAdmin.active = true;
    changed = true;
  }
  if (!mainAdmin.permissions) {
    mainAdmin.permissions = defaultPermissions;
    changed = true;
  }
  if (mainAdmin.passwordHash !== MAIN_ADMIN_HASH) {
    mainAdmin.passwordHash = MAIN_ADMIN_HASH;
    changed = true;
  }

  const oldLength = db.admins.length;
  db.admins = db.admins.filter(a => a === mainAdmin || (a?.email || '').toLowerCase() !== 'admin@admin.com');
  if (db.admins.length !== oldLength) changed = true;

  if (db.admins[0] !== mainAdmin) {
    db.admins = [mainAdmin, ...db.admins.filter(a => a !== mainAdmin)];
    changed = true;
  }

  return { db, changed };
}

export async function readDb() {
  await ensureDbFile();
  const db = JSON.parse(await fs.readFile(config.dataFile, 'utf8'));
  const { db: normalized, changed } = await ensureDefaultAdminRecord(db);
  if (changed) {
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
