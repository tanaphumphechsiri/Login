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

## Code layout

- `server.js` configures Express and mounts the API routers.
- `routes/auth.js` maps `/api/register`, `/api/login`, `/api/me`, and `/api/logout` to auth controller functions.
- `routes/admin.js` maps user list, role promotion, update, and delete endpoints under `/api/admin`, with admin access middleware.
- `controllers/` contains the request handling and database operations.
- `middleware/requireAdmin.js` checks the session and confirms the account has the `admin` role.
- `services/sessionService.js` creates, reads, and removes login sessions.
- `services/deletedUserRetentionService.js` permanently removes deleted user accounts after 30 days.
- `views/admin.html` is served only to an authenticated admin; its browser behavior and styles are in `public/admin.js` and `public/admin.css`.

New users receive the `user` role by default. To add role support to an existing database, run `migrations/001_add_user_role.sql` once. Assign an administrator by updating the intended account's `role` to `admin` in MySQL.

To track which administrator granted another account its role, run `migrations/002_track_admin_grantor.sql` once on an existing database after role support is present. Existing admin accounts are treated as original admins and cannot be demoted through the admin API.

To enable account recovery on an existing database, run `migrations/003_soft_delete_users.sql` once. Admin deletion then keeps ordinary user accounts recoverable for 30 days. Admins can edit the display name and optionally set a new password while restoring them. Expired accounts are permanently removed at startup and hourly while the app is running.

Passwords use Argon2id. The browser receives a random session token in an HttpOnly cookie; MySQL stores only its SHA-256 hash. Run behind HTTPS in production so the cookie's `Secure` flag is enabled (`NODE_ENV=production`).

On login, selecting “จดจำฉันไว้” creates a persistent session for 30 days. Without it, the browser gets a session cookie that expires when the browser session ends; its database session expires after 7 days.
