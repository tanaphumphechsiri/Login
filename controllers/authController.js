const asyncHandler = require('../utils/asyncHandler');

function normalizeEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function isValidEmail(email) {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function formatUser(user) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.display_name ?? user.displayName ?? null,
    role: user.role || 'user'
  };
}

module.exports = function createAuthController({ pool, argon2, sessionService }) {
  return {
    register: asyncHandler(async (req, res) => {
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

        await sessionService.createSession(result.insertId, res);
        return res.status(201).json({
          user: formatUser({ id: result.insertId, email, displayName, role: 'user' })
        });
      } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
          return res.status(409).json({ error: 'อีเมลนี้มีบัญชีอยู่แล้ว' });
        }
        throw error;
      }
    }),

    login: asyncHandler(async (req, res) => {
      const email = normalizeEmail(req.body?.email);
      const password = req.body?.password;

      if (!isValidEmail(email) || typeof password !== 'string' || password.length > 128) {
        return res.status(400).json({ error: 'กรุณากรอกอีเมลและรหัสผ่านให้ครบ' });
      }

      const [users] = await pool.execute(
        `SELECT id, email, password_hash, display_name, role, is_active
           FROM users
          WHERE email = ?
            AND NOT EXISTS (SELECT 1 FROM deleted_user_accounts d WHERE d.user_id = users.id)
          LIMIT 1`,
        [email]
      );
      const user = users[0];

      if (!user || !user.is_active || !(await argon2.verify(user.password_hash, password))) {
        return res.status(401).json({ error: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' });
      }

      await sessionService.createSession(user.id, res, req.body?.rememberMe === true);
      return res.json({ user: formatUser(user) });
    }),

    me: asyncHandler(async (req, res) => {
      const token = sessionService.getCookie(req, 'session');
      if (!token) return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบ' });

      const user = await sessionService.findSessionUser(token);
      if (!user) {
        return res.status(401).json({ error: 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง' });
      }

      return res.json({ user: formatUser(user) });
    }),

    logout: asyncHandler(async (req, res) => {
      const token = sessionService.getCookie(req, 'session');
      if (token) await sessionService.deleteSession(token);

      res.setHeader('Set-Cookie', sessionService.clearSessionCookie());
      return res.json({ ok: true });
    })
  };
};
