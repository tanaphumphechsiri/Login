-- Run once on an existing login_app database created before roles were added.
ALTER TABLE users
  ADD COLUMN role ENUM('user', 'admin') NOT NULL DEFAULT 'user';
