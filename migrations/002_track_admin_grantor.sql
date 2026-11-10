-- Record which admin granted another account the admin role.
-- Existing admin accounts without a grant record are treated as original admins.
CREATE TABLE admin_role_grants (
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
