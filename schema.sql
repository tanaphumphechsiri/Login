-- MySQL 8+ or MariaDB schema for a basic email/password login system.
-- Passwords and bearer tokens must be hashed by the application before storage.

CREATE DATABASE IF NOT EXISTS login_app
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE login_app;

CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  email VARCHAR(254) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  display_name VARCHAR(100) NULL,
  role ENUM('user', 'admin') NOT NULL DEFAULT 'user',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB;

-- Track which administrator granted another account the admin role.
-- Existing administrators without a grant record are original admins.
CREATE TABLE IF NOT EXISTS admin_role_grants (
  user_id BIGINT UNSIGNED NOT NULL,
  granted_by BIGINT UNSIGNED NOT NULL,
  granted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id),
  KEY ix_admin_role_grants_granted_by (granted_by),
  CONSTRAINT fk_admin_role_grants_user
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_admin_role_grants_grantor
    FOREIGN KEY (granted_by) REFERENCES users (id) ON DELETE RESTRICT
) ENGINE=InnoDB;

-- Keep deleted user accounts for 30 days so admins can restore them.
CREATE TABLE IF NOT EXISTS deleted_user_accounts (
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

-- Store only a cryptographic hash of each random session token.
CREATE TABLE IF NOT EXISTS auth_sessions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  token_hash BINARY(32) NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_auth_sessions_token_hash (token_hash),
  KEY ix_auth_sessions_user_id (user_id),
  KEY ix_auth_sessions_expires_at (expires_at),
  CONSTRAINT fk_auth_sessions_user
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB;

