# Login App

Small Node.js + MySQL email/password login starter. It includes account creation, login, logout, and a server-side session check.

## Requirements

- Node.js 20 or newer
- MySQL 8 or newer, or MariaDB 10.5 or newer

## Run locally

1. Create the tables by running `schema.sql` in MySQL. It creates the `login_app` database.
2. Copy `.env.example` to `.env` and set the MySQL credentials.
3. Run `npm install`.
4. Run `npm start`, then open <http://localhost:3000>.

New users receive the `user` role by default. To add role support to an existing database, run `migrations/001_add_user_role.sql` once. Assign an administrator by updating the intended account's `role` to `admin` in MySQL.

Passwords use Argon2id. The browser receives a random session token in an HttpOnly cookie; MySQL stores only its SHA-256 hash. Run behind HTTPS in production so the cookie's `Secure` flag is enabled (`NODE_ENV=production`).
