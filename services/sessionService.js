const crypto = require('node:crypto');

module.exports = function createSessionService({ pool, sessionLifetimeMs, isProduction }) {
  const rememberMeLifetimeMs = 30 * 24 * 60 * 60 * 1000;

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
    if (maxAgeMs !== undefined) options.push(`Max-Age=${Math.floor(maxAgeMs / 1000)}`);
    return options.join('; ');
  }

  function hashToken(token) {
    return crypto.createHash('sha256').update(token).digest();
  }

  async function createSession(userId, res, rememberMe = false) {
    const lifetimeMs = rememberMe ? rememberMeLifetimeMs : sessionLifetimeMs;
    const token = crypto.randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + lifetimeMs);

    await pool.execute(
      'INSERT INTO auth_sessions (user_id, token_hash, expires_at) VALUES (?, ?, ?)',
      [userId, hashToken(token), expiresAt]
    );

    res.setHeader(
      'Set-Cookie',
      `session=${encodeURIComponent(token)}; ${cookieOptions(rememberMe ? lifetimeMs : undefined)}`
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
          AND NOT EXISTS (SELECT 1 FROM deleted_user_accounts d WHERE d.user_id = u.id)
        LIMIT 1`,
      [hashToken(token)]
    );

    return users[0] || null;
  }

  async function deleteSession(token) {
    await pool.execute('DELETE FROM auth_sessions WHERE token_hash = ?', [hashToken(token)]);
  }

  function clearSessionCookie() {
    return `session=; ${cookieOptions(0)}`;
  }

  return { getCookie, createSession, findSessionUser, deleteSession, clearSessionCookie };
};
