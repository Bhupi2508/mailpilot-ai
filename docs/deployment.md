# Deployment

## Option A: single container (recommended)

```bash
docker build -t mailpilot-ai .
docker run -d --name mailpilot -p 3400:3400 \
  -v mailpilot-data:/data \
  --env-file backend-node/.env \
  mailpilot-ai
```

The image builds the UI, runs the API as a non-root user with `NODE_ENV=production`, stores SQLite and temporary attachments in `/data`, and exposes `GET /health`.

Minimum production settings:

```ini
APP_URL=https://mail.example.com      # the public HTTPS URL
TRUST_PROXY=1                         # behind one reverse proxy / load balancer
EMAIL_PROVIDER=smtp                   # or gmail
# COOKIE_SECURE defaults to true in production: serve over HTTPS.
# ALLOW_REGISTRATION defaults to false in production. Create users with:
#   docker exec -it mailpilot npm run create-user -- you@example.com "Your Name"
```

Put a TLS-terminating proxy (Caddy, Nginx, or your platform's load balancer) in front of port 3400.

## Option B: without Docker

```bash
npm run setup
npm run build                 # web-ui/dist
NODE_ENV=production npm start # API serves the UI from web-ui/dist
```

Run it under a process manager (systemd, pm2) and keep `backend-node/data/` on persistent storage.

## Split frontend and API (optional)

Host `web-ui/dist` on a static host and the API elsewhere:

- Build the UI with `VITE_API_BASE_URL=https://api.example.com/api`.
- On the API, set `CORS_ORIGINS=https://app.example.com` and `APP_URL=https://app.example.com`.
- If the two are on **different sites** (not just subdomains of one site), browsers only send the session cookie with `COOKIE_SAMESITE=none` (which requires `COOKIE_SECURE=true`). Serving both under one site is simpler and safer.

## Database

- **SQLite** (default): a file at `DATA_DIR/mailpilot.db`. Back up the file, e.g. with `sqlite3 mailpilot.db ".backup backup.db"`.
- **PostgreSQL**: set `DATABASE_URL=postgres://user:pass@host:5432/db?sslmode=require`. Tables are created on startup (or run `npm run migrate --prefix backend-node`). Managed services like Neon, Supabase and RDS work.

## Email providers

### Generic SMTP

Set `EMAIL_PROVIDER=smtp` plus `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM_EMAIL` and `SMTP_FROM_NAME`. Then verify without sending:

```bash
npm run check:provider
```

| Provider          | Host                  | Port / `SMTP_SECURE` | Notes                                                                 |
| ----------------- | --------------------- | -------------------- | --------------------------------------------------------------------- |
| Gmail / Workspace | `smtp.gmail.com`      | 587 / false          | Requires an [App Password](https://myaccount.google.com/apppasswords) (2-Step Verification on). Personal Gmail allows about 500 recipients a day. |
| Microsoft 365     | `smtp.office365.com`  | 587 / false          | Works only if your tenant allows SMTP AUTH for the mailbox. Microsoft is retiring basic-auth SMTP, so check with your admin. |
| Other / ESP       | provider's host       | 587 or 465 / true    | Mailgun, SendGrid, Amazon SES, Postmark and others all offer SMTP credentials. |

Use `SEND_CONCURRENCY`, `SEND_DELAY_MS` and `MAX_RECIPIENTS_PER_DAY` to stay inside your provider's limits.

**Credentials:** never use your normal mailbox password. Gmail needs an App Password (Google Account → Security → 2-Step Verification → App passwords). Microsoft 365 usually needs SMTP AUTH enabled per mailbox by an admin, and may not allow password SMTP at all; in that case use a transactional email service (Amazon SES, Mailgun, SendGrid, Postmark) that provides SMTP credentials. Credentials are read only from the server environment.

**From addresses.** MailPilot only sends as addresses listed in `SMTP_FROM_EMAIL`, `SMTP_USER` (when it is an address) and `SMTP_ALLOWED_FROM` (addresses or `@domain`), and rejects anything else before sending. Your mail provider has the final say:

- **Gmail SMTP** silently rewrites the From to the authenticated account unless the address is configured under *Settings → Accounts → Send mail as*. Add only configured aliases to `SMTP_ALLOWED_FROM`.
- **Microsoft 365** rejects other addresses unless the mailbox has *Send As* permission.
- **Email services** accept any address on a domain you have verified (SPF/DKIM). Use `SMTP_ALLOWED_FROM=@yourdomain.com`.

### Registration verification

New password accounts are created unverified and can't sign in until they enter the 6-digit code emailed through the configured provider (so `EMAIL_PROVIDER=smtp` must work for sign-ups to receive codes). Codes expire after `OTP_TTL_SECONDS` (default 120), allow `OTP_MAX_ATTEMPTS` wrong guesses, and can be resent after `OTP_RESEND_COOLDOWN_SECONDS` up to `OTP_MAX_SENDS_PER_HOUR` times. Unverified accounts older than 7 days are deleted. In Gmail API mode users sign in with Google, so no code is needed.

### Gmail API (Google OAuth)

Each user signs in with Google and sends from their own Gmail account.

1. In the [Google Cloud console](https://console.cloud.google.com/), create a project and enable the **Gmail API**.
2. Configure the **OAuth consent screen** and add the scope `https://www.googleapis.com/auth/gmail.send`. Until the app is verified, add your users as **test users**.
3. Create an **OAuth client ID** (type *Web application*). Add the authorized redirect URI `https://<your-domain>/api/auth/google/callback` (locally: `http://localhost:3400/api/auth/google/callback` or `http://localhost:5173/api/auth/google/callback`).
4. Configure the backend:

```ini
EMAIL_PROVIDER=gmail
GOOGLE_CLIENT_ID=...apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=https://<your-domain>/api/auth/google/callback
TOKEN_ENCRYPTION_KEY=<output of: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))">
```

In this mode password sign-in is disabled and the login page shows **Sign in with Google**. Keep `TOKEN_ENCRYPTION_KEY` stable: changing it makes stored Google tokens unreadable, and users have to sign in again.

## Operations

- **Health:** `GET /health` (and `/api/health`) returns 200 when the database responds.
- **Logs:** go to stdout. Addresses are masked and bodies or credentials are never logged.
- **Restarts:** queued deliveries resume. Deliveries that were mid-send are reported as `unknown` and are not resent.
- **Scaling:** run a single instance, or several sharing `DATA_DIR` (attachments) and one PostgreSQL database.
