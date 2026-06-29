import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import path from 'path';
import { config } from './config.js';
import { readDb } from './dataStore.js';
import healthRoutes from './routes/health.routes.js';
import authRoutes from './routes/auth.routes.js';
import usersRoutes from './routes/users.routes.js';
import questionsRoutes from './routes/questions.routes.js';
import settingsRoutes from './routes/settings.routes.js';
import tradesRoutes from './routes/trades.routes.js';
import reportsRoutes from './routes/reports.routes.js';
import adminsRoutes from './routes/admins.routes.js';

const app = express();

const corsOrigins = config.corsOrigin === '*'
  ? '*'
  : config.corsOrigin.split(',').map(v => v.trim()).filter(Boolean);

app.use(cors({ origin: corsOrigins }));
app.use(express.json({ limit: '2mb' }));
app.use(morgan('dev'));

app.use(express.static(config.frontendDir, { extensions: ['html'] }));

app.get('/', (_req, res) => {
  res.sendFile(path.resolve(config.frontendDir, 'user.html'));
});

app.get('/user', (_req, res) => {
  res.sendFile(path.resolve(config.frontendDir, 'user.html'));
});

app.get('/main', (_req, res) => {
  res.sendFile(path.resolve(config.frontendDir, 'main.html'));
});

app.use('/api/health', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/questions', questionsRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/trades', tradesRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/admins', adminsRoutes);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ message: 'Internal server error' });
});

(async () => {
  await readDb();
  app.listen(config.port, () => {
    console.log(`SVP backend listening on http://localhost:${config.port}`);
  });
})();
