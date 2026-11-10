-- Keep deleted user accounts for 30 days so admins can restore them.
CREATE TABLE deleted_user_accounts (
  user_id BIGINT UNSIGNED NOT NULL,
  deleted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_by BIGINT UNSIGNED NULL,
  PRIMARY KEY (user_id),
  KEY ix_deleted_user_accounts_deleted_at (deleted_at),
  KEY ix_deleted_user_accounts_deleted_by (deleted_by),
  CONSTRAINT fk_deleted_user_accounts_user
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_deleted_user_accounts_deleted_by
    FOREIGN KEY (deleted_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB;
