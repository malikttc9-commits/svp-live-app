import bcrypt from 'bcryptjs';
import { updateDb, getDefaultPermissions } from '../src/dataStore.js';

const email = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
const password = String(process.env.ADMIN_PASSWORD || '');
const name = String(process.env.ADMIN_NAME || 'Super Admin').trim();
const role = String(process.env.ADMIN_ROLE || 'super').trim().toLowerCase();

if (!email || !password) {
  console.error('ADMIN_EMAIL and ADMIN_PASSWORD are required.');
  process.exit(1);
}

const passwordHash = bcrypt.hashSync(password, 10);

await updateDb(async db => {
  db.admins = [
    {
      id: 'main-admin',
      name,
      email,
      passwordHash,
      role,
      active: true,
      permissions: getDefaultPermissions(),
      createdAt: db.admins?.find(a => a?.id === 'main-admin')?.createdAt || new Date().toISOString(),
    },
  ];
  return db;
});

console.log(`Primary admin reset successfully for ${email}. Existing users, questions, trades, and settings were preserved.`);