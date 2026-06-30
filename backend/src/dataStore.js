import fs from 'fs/promises';
import path from 'path';
import { createRequire } from 'module';
import initSqlJs from 'sql.js';
import bcrypt from 'bcryptjs';
import { config } from './config.js';

const require = createRequire(import.meta.url);
const sqlWasmDir = path.dirname(require.resolve('sql.js/dist/sql-wasm.js'));

let writeQueue = Promise.resolve();
let sqlModulePromise = null;
let databasePromise = null;

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

function defaultDbState() {
  return {
    admins: [
      {
        id: 'main-admin',
        name: MAIN_ADMIN_NAME,
        email: MAIN_ADMIN_EMAIL,
        passwordHash: MAIN_ADMIN_HASH,
        role: MAIN_ADMIN_ROLE,
        active: true,
        permissions: { ...defaultPermissions },
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
}

function normalizeDbShape(rawDb = {}) {
  const fallback = defaultDbState();
  return {
    admins: Array.isArray(rawDb.admins) ? rawDb.admins : fallback.admins,
    users: Array.isArray(rawDb.users) ? rawDb.users : fallback.users,
    questions: Array.isArray(rawDb.questions) ? rawDb.questions : fallback.questions,
    settings: rawDb.settings && typeof rawDb.settings === 'object' ? rawDb.settings : fallback.settings,
    trades: Array.isArray(rawDb.trades) ? rawDb.trades : fallback.trades,
    counters: rawDb.counters && typeof rawDb.counters === 'object' ? rawDb.counters : fallback.counters,
  };
}

async function getSqlModule() {
  if (!sqlModulePromise) {
    sqlModulePromise = initSqlJs({
      locateFile: file => path.join(sqlWasmDir, file),
    });
  }
  return sqlModulePromise;
}

async function ensureDbDir() {
  await fs.mkdir(path.dirname(config.dataFile), { recursive: true });
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readLegacySeed() {
  if (!(await fileExists(config.legacyDataFile))) {
    return defaultDbState();
  }

  try {
    const legacy = JSON.parse(await fs.readFile(config.legacyDataFile, 'utf8'));
    return normalizeDbShape(legacy);
  } catch {
    return defaultDbState();
  }
}

function ensureSchema(db) {
  db.run(`
    CREATE TABLE IF NOT EXISTS app_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      payload TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
  `);
}

function readStatePayload(db) {
  const result = db.exec('SELECT payload FROM app_state WHERE id = 1 LIMIT 1;');
  if (!result.length || !result[0].values.length) return null;
  return result[0].values[0][0];
}

function ensureDefaultAdminRecord(db) {
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
      permissions: { ...defaultPermissions },
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
    mainAdmin.permissions = { ...defaultPermissions };
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

async function loadDatabase() {
  if (databasePromise) return databasePromise;

  databasePromise = (async () => {
    await ensureDbDir();
    const SQL = await getSqlModule();
    let db;

    if (await fileExists(config.dataFile)) {
      const bytes = await fs.readFile(config.dataFile);
      db = new SQL.Database(new Uint8Array(bytes));
    } else {
      db = new SQL.Database();
    }

    ensureSchema(db);

    const existingPayload = readStatePayload(db);
    if (!existingPayload) {
      const seed = await readLegacySeed();
      const normalized = ensureDefaultAdminRecord(normalizeDbShape(seed)).db;
      const payload = JSON.stringify(normalized, null, 2);
      db.run(
        'INSERT INTO app_state (id, payload, updatedAt) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, updatedAt = excluded.updatedAt;',
        [payload, nowIso()]
      );
      await fs.writeFile(config.dataFile, Buffer.from(db.export()));
    }

    return db;
  })();

  return databasePromise;
}

async function persistDatabase(db) {
  await fs.writeFile(config.dataFile, Buffer.from(db.export()));
}

export async function readDb() {
  const db = await loadDatabase();
  const payload = readStatePayload(db);
  const parsed = payload ? JSON.parse(payload) : defaultDbState();
  const normalized = ensureDefaultAdminRecord(normalizeDbShape(parsed));

  if (normalized.changed) {
    await writeDb(normalized.db);
    return normalized.db;
  }

  return normalized.db;
}

export async function writeDb(nextDb) {
  writeQueue = writeQueue.then(async () => {
    const db = await loadDatabase();
    const normalized = ensureDefaultAdminRecord(normalizeDbShape(nextDb || defaultDbState())).db;
    const payload = JSON.stringify(normalized, null, 2);
    db.run(
      'INSERT INTO app_state (id, payload, updatedAt) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, updatedAt = excluded.updatedAt;',
      [payload, nowIso()]
    );
    await persistDatabase(db);
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
