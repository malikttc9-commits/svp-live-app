import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const backendRoot = path.resolve(__dirname, '..');
const nodeEnv = process.env.NODE_ENV || 'development';
const resolvedFrontendDir = nodeEnv === 'production'
  ? './web'
  : (process.env.FRONTEND_DIR || '../');

export const config = {
  nodeEnv,
  port: Number(process.env.PORT || 4000),
  jwtSecret: process.env.JWT_SECRET || 'change-this-secret',
  corsOrigin: process.env.CORS_ORIGIN || '*',
  dataFile: path.resolve(backendRoot, process.env.DATA_FILE || './data/db.json'),
  frontendDir: path.resolve(backendRoot, resolvedFrontendDir),
};

export const isProd = config.nodeEnv === 'production';
export const isDev = !isProd;
