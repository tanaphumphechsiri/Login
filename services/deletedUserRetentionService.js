module.exports = function createDeletedUserRetentionService({ pool }) {
  async function purgeExpiredDeletedUsers() {
    const [result] = await pool.execute(
      `DELETE u FROM users u
         JOIN deleted_user_accounts d ON d.user_id = u.id
        WHERE d.deleted_at <= NOW() - INTERVAL 30 DAY AND u.role = 'user'`
    );
    return result.affectedRows;
  }

  return { purgeExpiredDeletedUsers };
};
