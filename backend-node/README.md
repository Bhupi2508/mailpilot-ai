# MailPilot AI — Backend

Express.js (JavaScript) + PostgreSQL backend for MailPilot AI.

**MailPilot AI is an email sending platform — NOT an email provider.** Users
connect their own mailbox (Google first, Outlook later) and send emails through
their own account.

This backend is:

- **Lightweight** — minimal tables, minimal dependencies
- **OAuth-only** — no passwords, no register/login/forgot-password
- **Provider-based** — adding Outlook/Zoho/Yahoo requires a new adapter only
- **Secure** — Helmet, CORS, rate limiting, JWT, encrypted token storage
- **Cost-optimized** — free-tier friendly (Neon PostgreSQL + Railway)

---

## Tech Stack

| Layer      | Technology                   |
| ---------- | ---------------------------- |
| Runtime    | Node.js                      |
| Framework  | Express.js                   |
| Language   | JavaScript (CommonJS)        |
| Database   | PostgreSQL (Neon-compatible) |
| Auth       | Google OAuth 2.0 + JWT       |
| Email      | Gmail API (SMTP optional)    |
| Uploads    | Multer (temporary only)      |
| Validation | express-validator            |
| Docs       | Swagger / OpenAPI            |

## Features

- **Sign in with Google** (OAuth 2.0 Authorization Code flow)
- **Connect a Gmail account** and send through the **Gmail API** — no SMTP
  credentials or App Passwords ever required
- **Provider-based OAuth architecture** — Outlook, Microsoft 365, Zoho, Yahoo
  can be added with minimal code changes
- **Automatic token refresh** — expired access tokens are refreshed using the
  stored refresh token (encrypted at rest with AES-256-GCM)
- **Frontend receives ONLY the MailPilot JWT** — Google tokens never leave the
  server
- **Two send modes**:
  - `POST /emails/send` — one email to all recipients (shared To)
  - `POST /emails/send-individual` — one private email per recipient
- **Attachments are temporary** — uploaded files are deleted immediately after
  sending; only count + names are stored
- **SMTP fallback** (optional) when no Gmail account is connected

## Getting Started

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# then edit .env (PostgreSQL, Google OAuth, JWT secret, encryption key)

# 3. Create the database schema
npm run migrate

# 4. Start the dev server
npm run dev
```

The API will be available at `http://localhost:3400/api`.
Interactive API docs (Swagger) are at `http://localhost:3400/api/docs`.

## Available Scripts

| Command           | Description                       |
| ----------------- | --------------------------------- |
| `npm start`       | Run the server in production mode |
| `npm run dev`     | Run the server with auto-reload   |
| `npm run migrate` | Apply the PostgreSQL schema       |

## API Endpoints

Base path: `/api`

### OAuth

| Method | Path                    | Description                                   |
| ------ | ----------------------- | --------------------------------------------- |
| GET    | `/auth/google/url`      | Returns the Google consent URL to start login |
| POST   | `/auth/google/callback` | Exchange the OAuth `code` for MailPilot JWT   |
| GET    | `/auth/providers`       | List the user's connected accounts (JWT)      |

> The provider routes are parameterized: `GET /auth/:provider/url` and
> `POST /auth/:provider/callback` (only `google` is registered for now).

### Emails (JWT protected)

| Method | Path                      | Description                            |
| ------ | ------------------------- | -------------------------------------- |
| POST   | `/emails/send`            | Send a shared email (with attachments) |
| POST   | `/emails/send-individual` | Send a private email per recipient     |
| GET    | `/emails/history`         | Get the user's email history           |

## Google Sign-In Flow

1. **Frontend** calls `GET /api/auth/google/url` and receives:
   ```json
   {
     "success": true,
     "data": {
       "url": "https://accounts.google.com/o/oauth2/v2/auth?...",
       "state": "<random-csrf-state>"
     },
     "message": "Google authorization URL generated."
   }
   ```
2. **Frontend** redirects the browser to `data.url` (store `state` for CSRF).
3. **User** consents in Google's consent screen.
4. **Google** redirects back to `GOOGLE_REDIRECT_URI` with a `code` (and `state`).
5. **Frontend** sends:
   ```json
   POST /api/auth/google/callback
   {
     "code": "<authorization-code-from-google>",
     "state": "<original-state>"
   }
   ```
6. **Backend** exchanges the code, finds-or-creates the user, links the Gmail
   account, stores encrypted tokens, and returns **only**:
   ```json
   {
     "success": true,
     "data": {
       "user": {
         "id": "...",
         "name": "...",
         "email": "...",
         "profile_picture": "..."
       },
       "connectedAccount": {
         "id": "...",
         "provider": "google",
         "email": "..."
       },
       "accessToken": "<mailpilot-jwt>",
       "expiresIn": 900000
     },
     "message": "Sign-in successful."
   }
   ```

> **Important:** `GOOGLE_REDIRECT_URI` must be registered as an authorized
> redirect URI in the Google Cloud console.

## Architecture

### OAuth Provider Pattern

```
OAuth flows
    ├── googleProvider          (Google OAuth2 — current)
    └── outlook / zoho / yahoo  (future — new adapter + registry entry)

Email sending
emailService.send()
    └─> emailProviderFactory.resolveForUser(user, opts)
            ├─> gmailApiProvider   (sends via Gmail API using the user's OAuth token)
            └─> smtpProvider       (optional fallback via Nodemailer)
```

### Database

Schema is defined in `src/db/schema.sql` and applied via `npm run migrate`.

| Table                | Purpose                                                     |
| -------------------- | ----------------------------------------------------------- |
| `users`              | OAuth-created users (id, google_id, name, email, avatar)    |
| `connected_accounts` | User's connected mailboxes + **encrypted** OAuth tokens     |
| `email_history`      | Sent emails; recipients as arrays; attachment metadata only |

### Attachments

- Uploads go to a temporary directory via Multer.
- After the send attempt (success or failure), files are **deleted**.
- Only `attachment_count` and `attachment_names` are stored in `email_history`.

## Environment Variables

See [.env.example](./.env.example). Key ones:

| Variable               | Description                                         |
| ---------------------- | --------------------------------------------------- |
| `DATABASE_URL`         | Neon/Railway PostgreSQL connection string           |
| `GOOGLE_CLIENT_ID`     | Google OAuth client ID                              |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret                          |
| `GOOGLE_REDIRECT_URI`  | Authorized redirect URI                             |
| `GOOGLE_OAUTH_SCOPES`  | Must include `gmail.send`                           |
| `JWT_SECRET`           | Signs the MailPilot JWT                             |
| `TOKEN_ENCRYPTION_KEY` | 32-byte base64 key for AES-256-GCM token encryption |
| `SMTP_HOST` (optional) | Leave empty to disable SMTP fallback                |

## Security

- **Helmet** sets secure HTTP headers.
- **CORS** restricts allowed origins.
- **JWT auth** on all protected routes.
- **Rate limiting** on all routes + stricter limits on auth routes.
- **express-validator** validates request bodies/queries.
- **Multer** validates file extension + MIME type + size + count.
- **Centralized error handling** with consistent JSON responses.
- **Winston logging** (console + file in production).
- **Encrypted OAuth tokens** at rest (AES-256-GCM).
- **Input sanitization** (trim + HTML strip).

## Documentation

- Full API reference: [API.md](./API.md)
- Project docs: [docs/](../docs)

## Conventional Commits

```text
feat: add Google OAuth sign-in
feat: add Gmail API email provider
refactor: OAuth-only architecture
fix: correct email validation
chore: update dependencies
```
