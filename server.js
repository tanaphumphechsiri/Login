require('dotenv').config();

const crypto = require('node:crypto');
const path = require('node:path');
const express = require('express');
const argon2 = require('argon2');
const mysql = require('mysql2/promise');

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
app.use(express.static(path.join(__dirname, 'public')));

function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function normalizeEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function isValidEmail(email) {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function getCookie(req, name) {
  const cookies = req.headers.cookie || '';

  for (const cookie of cookies.split(';')) {
    const separator = cookie.indexOf('=');
    if (separator < 0 || cookie.slice(0, separator).trim() !== name) continue;

    try {
      return decodeURIComponent(cookie.slice(separator + 1).trim());
    } catch {
      return '';
    }
  }

  return '';
}

function cookieOptions(maxAgeMs) {
  const options = ['Path=/', 'HttpOnly', 'SameSite=Lax'];
  if (isProduction) options.push('Secure');
  if (maxAgeMs === undefined) options.push('Max-Age=0');
  else options.push(`Max-Age=${Math.floor(maxAgeMs / 1000)}`);
  return options.join('; ');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest();
}

function formatUser(user) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.display_name ?? user.displayName ?? null,
    role: user.role || 'user'
  };
}

async function createSession(userId, res) {
  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + sessionLifetimeMs);

  await pool.execute(
    'INSERT INTO auth_sessions (user_id, token_hash, expires_at) VALUES (?, ?, ?)',
    [userId, hashToken(token), expiresAt]
  );

  res.setHeader(
    'Set-Cookie',
    `session=${encodeURIComponent(token)}; ${cookieOptions(sessionLifetimeMs)}`
  );
}

async function findSessionUser(token) {
  const [users] = await pool.execute(
    `SELECT u.id, u.email, u.display_name, u.role
       FROM auth_sessions AS s
       JOIN users AS u ON u.id = s.user_id
      WHERE s.token_hash = ?
        AND s.expires_at > NOW()
        AND u.is_active = TRUE
      LIMIT 1`,
    [hashToken(token)]
  );

  return users[0] || null;
}

app.post('/api/register', asyncHandler(async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const password = req.body?.password;
  const displayName = typeof req.body?.displayName === 'string'
    ? req.body.displayName.trim()
    : '';

  if (!isValidEmail(email)) {
    return res.status(400).json({ error: 'กรุณากรอกอีเมลให้ถูกต้อง' });
  }

  if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
    return res.status(400).json({ error: 'รหัสผ่านต้องมีความยาว 8–128 ตัวอักษร' });
  }

  if (displayName.length > 100) {
    return res.status(400).json({ error: 'ชื่อต้องไม่เกิน 100 ตัวอักษร' });
  }

  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });

  try {
    const [result] = await pool.execute(
      'INSERT INTO users (email, password_hash, display_name) VALUES (?, ?, ?)',
      [email, passwordHash, displayName || null]
    );

    await createSession(result.insertId, res);
    return res.status(201).json({
      user: formatUser({ id: result.insertId, email, displayName, role: 'user' })
    });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'อีเมลนี้มีบัญชีอยู่แล้ว' });
    }
    throw error;
  }
}));

app.post('/api/login', asyncHandler(async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const password = req.body?.password;

  if (!isValidEmail(email) || typeof password !== 'string' || password.length > 128) {
    return res.status(400).json({ error: 'กรุณากรอกอีเมลและรหัสผ่านให้ครบ' });
  }

  const [users] = await pool.execute(
    `SELECT id, email, password_hash, display_name, role, is_active
       FROM users
      WHERE email = ?
      LIMIT 1`,
    [email]
  );
  const user = users[0];

  if (!user || !user.is_active || !(await argon2.verify(user.password_hash, password))) {
    return res.status(401).json({ error: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' });
  }

  await createSession(user.id, res);
  return res.json({ user: formatUser(user) });
}));

app.get('/api/me', asyncHandler(async (req, res) => {
  const token = getCookie(req, 'session');
  if (!token) return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบ' });

  const user = await findSessionUser(token);
  if (!user) {
    return res.status(401).json({ error: 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง' });
  }

  return res.json({ user: formatUser(user) });
}));

app.post('/api/logout', asyncHandler(async (req, res) => {
  const token = getCookie(req, 'session');
  if (token) {
    await pool.execute('DELETE FROM auth_sessions WHERE token_hash = ?', [hashToken(token)]);
  }

  res.setHeader('Set-Cookie', `session=; ${cookieOptions()}`);
  return res.json({ ok: true });
}));

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
  app.listen(port, '127.0.0.1', () => {
    console.log(`Login app is running at http://localhost:${port}`);
  });
}

start().catch((error) => {
  console.error('Could not connect to MySQL. Check the database and .env settings.', error.message);
  process.exit(1);
});
