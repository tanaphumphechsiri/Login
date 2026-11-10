const asyncHandler = require('../utils/asyncHandler');

module.exports = function createAdminController({ pool, argon2, retentionService }) {
  return {
    listUsers: asyncHandler(async (req, res) => {
      if (retentionService) await retentionService.purgeExpiredDeletedUsers();
      const [users] = await pool.execute(
        `SELECT CAST(u.id AS CHAR) AS id,
                u.email,
                u.display_name AS displayName,
                u.role,
                CAST(role_grant.granted_by AS CHAR) AS adminGrantedBy,
                grantor.display_name AS grantorDisplayName,
                grantor.email AS grantorEmail
           FROM users AS u
           LEFT JOIN admin_role_grants AS role_grant ON role_grant.user_id = u.id
           LEFT JOIN users AS grantor ON grantor.id = role_grant.granted_by
          WHERE NOT EXISTS (SELECT 1 FROM deleted_user_accounts d WHERE d.user_id = u.id)
          ORDER BY CASE WHEN u.role = 'admin' THEN 0 ELSE 1 END,
                   u.created_at DESC,
                   u.id DESC`
      );

      return res.json({ users });
    }),

    listDeletedUsers: asyncHandler(async (req, res) => {
      if (retentionService) await retentionService.purgeExpiredDeletedUsers();
      const [users] = await pool.execute(
        `SELECT CAST(u.id AS CHAR) AS id, u.email, u.display_name AS displayName,
                d.deleted_at AS deletedAt, deleter.display_name AS deletedByName,
                deleter.email AS deletedByEmail
           FROM deleted_user_accounts d JOIN users u ON u.id = d.user_id
           LEFT JOIN users deleter ON deleter.id = d.deleted_by
          WHERE d.deleted_at > NOW() - INTERVAL 30 DAY AND u.role = 'user'
          ORDER BY d.deleted_at DESC`
      );
      return res.json({ users });
    }),

    restoreUser: asyncHandler(async (req, res) => {
      const userId = req.params.id;
      const body = req.body || {};
      const hasName = Object.hasOwn(body, 'displayName');
      const hasPassword = typeof body.password === 'string' && body.password.length > 0;
      if (!/^[1-9]\d{0,19}$/.test(userId)) return res.status(400).json({ error: 'Invalid account id.' });
      if (hasName && (typeof body.displayName !== 'string' || body.displayName.trim().length > 100)) return res.status(400).json({ error: 'Name must be 100 characters or fewer.' });
      if (hasPassword && (body.password.length < 8 || body.password.length > 128)) return res.status(400).json({ error: 'Password must be 8 to 128 characters.' });
      const passwordHash = hasPassword ? await argon2.hash(body.password, { type: argon2.argon2id }) : null;
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        const [rows] = await connection.execute(
          `SELECT u.id, u.role, d.deleted_at, (d.deleted_at <= NOW() - INTERVAL 30 DAY) AS expired FROM users u
             JOIN deleted_user_accounts d ON d.user_id = u.id WHERE u.id = ? FOR UPDATE`, [userId]
        );
        if (!rows[0] || rows[0].role !== 'user') {
          await connection.rollback();
          return res.status(404).json({ error: 'Deleted user account not found.' });
        }
        if (rows[0].expired) {
          await connection.execute('DELETE FROM users WHERE id = ?', [userId]);
          await connection.commit();
          return res.status(410).json({ error: 'The 30-day recovery period has expired.' });
        }
        const updates = ['is_active = TRUE'];
        const values = [];
        if (hasName) { updates.push('display_name = ?'); values.push(body.displayName.trim() || null); }
        if (hasPassword) { updates.push('password_hash = ?'); values.push(passwordHash); }
        await connection.execute(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, [...values, userId]);
        await connection.execute('DELETE FROM deleted_user_accounts WHERE user_id = ?', [userId]);
        await connection.commit();
        return res.json({ ok: true });
      } catch (error) { await connection.rollback(); throw error; }
      finally { connection.release(); }
    }),

    setUserRole: asyncHandler(async (req, res) => {
      const userId = req.params.id;
      const nextRole = req.body?.role;
      if (!/^[1-9]\d{0,19}$/.test(userId)) {
        return res.status(400).json({ error: 'รหัสบัญชีไม่ถูกต้อง' });
      }
      if (!['admin', 'user'].includes(nextRole)) {
        return res.status(400).json({ error: 'ระบุ role เป็น admin หรือ user เท่านั้น' });
      }

      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        const [users] = await connection.execute(
          `SELECT u.id, u.role FROM users u WHERE u.id = ?
             AND NOT EXISTS (SELECT 1 FROM deleted_user_accounts d WHERE d.user_id = u.id) FOR UPDATE`,
          [userId]
        );
        const targetUser = users[0];

        if (!targetUser) {
          await connection.rollback();
          return res.status(404).json({ error: 'ไม่พบบัญชีนี้' });
        }

        if (nextRole === 'admin') {
          if (targetUser.role !== 'user') {
            await connection.rollback();
            return res.status(409).json({ error: 'บัญชีนี้เป็น admin อยู่แล้ว' });
          }

          const [result] = await connection.execute(
            `UPDATE users
                SET role = 'admin'
              WHERE id = ? AND role = 'user'`,
            [userId]
          );
          if (result.affectedRows !== 1) {
            await connection.rollback();
            return res.status(409).json({ error: 'บัญชีเปลี่ยนแปลงระหว่างทำรายการ กรุณาลองใหม่' });
          }
          await connection.execute(
            'INSERT INTO admin_role_grants (user_id, granted_by) VALUES (?, ?)',
            [userId, req.authUser.id]
          );
        } else {
          if (targetUser.role !== 'admin') {
            await connection.rollback();
            return res.status(409).json({ error: 'บัญชีนี้เป็น user อยู่แล้ว' });
          }
          const [grants] = await connection.execute(
            'SELECT granted_by FROM admin_role_grants WHERE user_id = ? FOR UPDATE',
            [userId]
          );
          if (!grants[0] || String(grants[0].granted_by) !== String(req.authUser.id)) {
            await connection.rollback();
            return res.status(403).json({ error: 'ลด role ได้เฉพาะ admin ที่คุณเป็นผู้ให้สิทธิ์เท่านั้น' });
          }

          const [adminsGrantedByTarget] = await connection.execute(
            `SELECT role_grant.user_id
               FROM admin_role_grants AS role_grant
               JOIN users AS u ON u.id = role_grant.user_id
              WHERE u.role = 'admin' AND role_grant.granted_by = ?
              FOR UPDATE`,
            [userId]
          );
          if (adminsGrantedByTarget.length > 0) {
            await connection.rollback();
            return res.status(409).json({ error: 'กรุณาลด role ของ admin ที่บัญชีนี้ให้สิทธิ์ก่อน' });
          }

          const [result] = await connection.execute(
            `UPDATE users
                SET role = 'user'
              WHERE id = ? AND role = 'admin'`,
            [userId]
          );
          if (result.affectedRows !== 1) {
            await connection.rollback();
            return res.status(409).json({ error: 'บัญชีเปลี่ยนแปลงระหว่างทำรายการ กรุณาลองใหม่' });
          }
          await connection.execute('DELETE FROM admin_role_grants WHERE user_id = ?', [userId]);
        }

        await connection.execute('DELETE FROM auth_sessions WHERE user_id = ?', [userId]);
        await connection.commit();
        return res.json({ ok: true, role: nextRole });
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    }),

    updateUser: asyncHandler(async (req, res) => {
      const userId = req.params.id;
      const body = req.body || {};
      const hasDisplayName = Object.hasOwn(body, 'displayName');
      const hasPassword = Object.hasOwn(body, 'password');

      if (!/^[1-9]\d{0,19}$/.test(userId)) {
        return res.status(400).json({ error: 'รหัสบัญชีไม่ถูกต้อง' });
      }
      if (!hasDisplayName && !hasPassword) {
        return res.status(400).json({ error: 'กรุณาระบุชื่อหรือรหัสผ่านที่ต้องการแก้ไข' });
      }

      let displayName;
      if (hasDisplayName) {
        if (typeof body.displayName !== 'string') {
          return res.status(400).json({ error: 'ชื่อที่แสดงไม่ถูกต้อง' });
        }
        displayName = body.displayName.trim();
        if (displayName.length > 100) {
          return res.status(400).json({ error: 'ชื่อต้องไม่เกิน 100 ตัวอักษร' });
        }
      }

      let passwordHash;
      if (hasPassword) {
        if (typeof body.password !== 'string' || body.password.length < 8 || body.password.length > 128) {
          return res.status(400).json({ error: 'รหัสผ่านใหม่ต้องมีความยาว 8–128 ตัวอักษร' });
        }
        passwordHash = await argon2.hash(body.password, { type: argon2.argon2id });
      }

      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        const [users] = await connection.execute(
          `SELECT u.id, u.role FROM users u WHERE u.id = ?
             AND NOT EXISTS (SELECT 1 FROM deleted_user_accounts d WHERE d.user_id = u.id) FOR UPDATE`,
          [userId]
        );
        const targetUser = users[0];

        if (!targetUser) {
          await connection.rollback();
          return res.status(404).json({ error: 'ไม่พบบัญชีนี้' });
        }
        if (targetUser.role !== 'user') {
          await connection.rollback();
          return res.status(403).json({ error: 'แก้ไขได้เฉพาะบัญชี user เท่านั้น' });
        }

        const updates = [];
        const values = [];
        if (hasDisplayName) {
          updates.push('display_name = ?');
          values.push(displayName || null);
        }
        if (hasPassword) {
          updates.push('password_hash = ?');
          values.push(passwordHash);
        }

        await connection.execute(
          `UPDATE users SET ${updates.join(', ')} WHERE id = ? AND role = 'user'`,
          [...values, userId]
        );

        if (hasPassword) {
          await connection.execute('DELETE FROM auth_sessions WHERE user_id = ?', [userId]);
        }

        await connection.commit();
        return res.json({ ok: true, passwordChanged: hasPassword });
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    }),

    deleteUser: asyncHandler(async (req, res) => {
      const userId = req.params.id;
      if (!/^[1-9]\d{0,19}$/.test(userId)) {
        return res.status(400).json({ error: 'รหัสบัญชีไม่ถูกต้อง' });
      }

      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        const [users] = await connection.execute(
          `SELECT u.id, u.role FROM users u WHERE u.id = ?
             AND NOT EXISTS (SELECT 1 FROM deleted_user_accounts d WHERE d.user_id = u.id) FOR UPDATE`,
          [userId]
        );
        const targetUser = users[0];

        if (!targetUser) {
          await connection.rollback();
          return res.status(404).json({ error: 'ไม่พบบัญชีนี้' });
        }
        if (targetUser.role !== 'user') {
          await connection.rollback();
          return res.status(403).json({ error: 'ลบได้เฉพาะบัญชี user เท่านั้น' });
        }

        await connection.execute('DELETE FROM auth_sessions WHERE user_id = ?', [userId]);
        await connection.execute('INSERT INTO deleted_user_accounts (user_id, deleted_by) VALUES (?, ?)', [userId, req.authUser.id]);

        await connection.commit();
        return res.json({ ok: true, recoverableDays: 30 });
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    })
  };
};
