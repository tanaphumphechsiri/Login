require('dotenv').config();

const path = require('node:path');
const express = require('express');
const argon2 = require('argon2');
const mysql = require('mysql2/promise');
const asyncHandler = require('./utils/asyncHandler');
const createSessionService = require('./services/sessionService');
const createAuthRoutes = require('./routes/auth');
const createAdminRoutes = require('./routes/admin');
const createDeletedUserRetentionService = require('./services/deletedUserRetentionService');

const app = express();
const port = Number(process.env.PORT || 3000);
const sessionLifetimeMs = 7 * 24 * 60 * 60 * 1000;
const isProduction = process.env.NODE_ENV === 'production';

const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'login_app',
  waitForConnections: true,
  connectionLimit: 10,
  charset: 'utf8mb4'
});

app.disable('x-powered-by');
app.use(express.json({ limit: '10kb' }));
const sessionService = createSessionService({ pool, sessionLifetimeMs, isProduction });
const retentionService = createDeletedUserRetentionService({ pool });
app.use('/api', createAuthRoutes({ pool, argon2, sessionService }));
app.use('/api/admin', createAdminRoutes({ pool, argon2, sessionService, retentionService }));
app.get('/admin', asyncHandler(async (req, res) => {
  const token = sessionService.getCookie(req, 'session');
  const user = token ? await sessionService.findSessionUser(token) : null;
  if (!user || user.role !== 'admin') return res.redirect('/');

  return res.sendFile(path.join(__dirname, 'views', 'admin.html'));
}));
app.use(express.static(path.join(__dirname, 'public')));

app.use((error, req, res, next) => {
  if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
    return res.status(400).json({ error: 'รูปแบบข้อมูลไม่ถูกต้อง' });
  }

  console.error(error);
  if (res.headersSent) return next(error);
  return res.status(500).json({ error: 'เกิดข้อผิดพลาดในระบบ กรุณาลองใหม่' });
});

async function start() {
  await pool.query('SELECT 1');
  await retentionService.purgeExpiredDeletedUsers();
  const retentionTimer = setInterval(() => {
    retentionService.purgeExpiredDeletedUsers().catch((error) => console.error('Deleted-account cleanup failed:', error.message));
  }, 60 * 60 * 1000);
  retentionTimer.unref();
  app.listen(port, '127.0.0.1', () => {
    console.log(`Login app is running at http://localhost:${port}`);
  });
}

start().catch((error) => {
  console.error('Could not connect to MySQL. Check the database and .env settings.', error.message);
  process.exit(1);
});
