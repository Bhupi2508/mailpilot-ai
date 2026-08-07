# MailPilot AI — Technical Design

> **Status:** Current
> Practical details for the Express.js + PostgreSQL OAuth-only implementation.

---

## Tech Stack

### Frontend

| Technology   | Purpose                 |
| ------------ | ----------------------- |
| React        | UI library (JavaScript) |
| Vite         | Build tool              |
| Fetch/Axios  | HTTP client             |
| React Router | Navigation              |

### Backend

| Technology       | Purpose                     |
| ---------------- | --------------------------- |
| Node.js          | Runtime                     |
| Express.js       | Web framework               |
| PostgreSQL       | Database (Neon-compatible)  |
| Google OAuth 2.0 | Sign in with Google + Gmail |
| Gmail API        | Send email as the user      |
| JWT              | MailPilot access token      |
| Nodemailer       | Optional SMTP fallback      |

---

## Folder Structure

```text
mailpilot-ai/
├── backend/
│   └── src/
│       ├── config/        # env config, DB pool, SMTP (optional), Swagger
│       ├── controllers/   # request handlers (oauth, email)
│       ├── db/            # schema.sql + migrate script
│       ├── middleware/    # auth, validation, upload, error handling
│       ├── models/        # userModel, connectedAccountModel, emailHistoryModel
│       ├── routes/        # authRoutes, emailRoutes
│       ├── services/
│       │   ├── oauth/     # googleProvider + registry + oauthService
│       │   ├── providers/ # Email provider pattern (Gmail API, SMTP)
│       │   └── tokenService.js  # MailPilot JWT
│       ├── validators/    # request validation rules
│       ├── utils/         # ApiError, ApiResponse, crypto, logger, ...
│       ├── app.js
│       └── server.js
│   ├── API.md             # full API reference
│   └── README.md          # backend docs
├── web-ui/
│   └── src/pages/auth/    # Login (Sign in with Google)
├── docs/
└── README.md
```

---

## Authentication (OAuth-Only)

MailPilot is **OAuth-only**. There are no passwords, no register/login API, no
forgot/reset password flows.

### Provider-Based OAuth

```
src/services/oauth/
  ├── googleProvider.js          # Google OAuth2 adapter (current)
  ├── oauthProviderRegistry.js   # registry mapping name -> adapter
  └── oauthService.js            # auth URL, callback, token refresh
```

The routes are provider-parameterized:

- `GET  /api/auth/:provider/url`
- `POST /api/auth/:provider/callback`
- `GET  /api/auth/providers` (JWT protected)

Adding a new provider (Outlook, Zoho, Yahoo, Microsoft 365) requires only:

1. A new adapter class implementing
   `getAuthUrl(state)`, `exchangeCode(code)`, `refreshAccessToken(refreshToken)`,
   `getUserProfile(accessToken)`.
2. One line in the registry.

No schema, route, controller, or service changes are required.

### Sign-in Flow

1. `GET /api/auth/google/url` → `{ url, state }`.
2. Browser redirects to the Google consent screen.
3. Google redirects back with an authorization `code`.
4. `POST /api/auth/google/callback` with `code`:
   - Exchanges the code for access/refresh tokens.
   - Finds-or-creates the user (by email).
   - Upserts the `connected_accounts` row.
   - Stores **encrypted** tokens (AES-256-GCM).
   - Returns **only** the MailPilot JWT access token.

### Token Security

| Data                 | Storage / Handling                                  |
| -------------------- | --------------------------------------------------- |
| Google access token  | Encrypted (AES-256-GCM) in `connected_accounts`     |
| Google refresh token | Encrypted (AES-256-GCM) in `connected_accounts`     |
| MailPilot JWT        | Short-lived (default 15m), signed with `JWT_SECRET` |
| Expiry / scopes      | `connected_accounts.token_expiry`, `.scopes`        |

Expired access tokens are **automatically refreshed** via
`oauthService.getAccessToken()` (60s safety margin).

---

## Email Sending — Provider Pattern

```
emailService.send()
    └─> emailProviderFactory.resolveForUser(user, opts)
            ├─> gmailApiProvider  (Gmail API as the user)
            └─> smtpProvider      (Nodemailer fallback, optional)
```

- The **Gmail API provider** uses the user's encrypted OAuth tokens to call
  `users.messages.send` — no SMTP credentials or App Passwords required.
- The **SMTP provider** is an optional fallback, only active when `SMTP_HOST`
  is configured.
- **Auto resolution**: if the user has a connected active Google account, the
  Gmail API provider is chosen; otherwise SMTP.

### Attachments (Temporary Only)

1. Uploaded via Multer to a temp directory.
2. Sent with the email.
3. **Deleted immediately** after the send attempt (success or failure).
4. Only `attachment_count` and `attachment_names` are stored in
   `email_history`.

This minimizes storage cost and improves privacy.

---

## Database

Schema: `backend/src/db/schema.sql`, applied via `npm run migrate`.

Tables:

- `users` — `id`, `google_id`, `name`, `email`, `profile_picture`, timestamps
- `connected_accounts` — `user_id`, `provider`, `provider_email`,
  encrypted `access_token` / `refresh_token`, `token_expiry`, `scopes`,
  `is_active`
- `email_history` — `user_id`, `provider`, `provider_message_id`, `subject`,
  `body`, `body_type`, `to_recipients[]`, `cc_recipients[]`, `bcc_recipients[]`,
  `sending_mode`, `attachment_count`, `attachment_names[]`, `status`,
  `error_message`, `sent_at`

Recipients and attachment names use PostgreSQL **arrays**. Indexes exist on the
hot query paths (`user_id, created_at`, `provider`, etc.).

---

## API Endpoints

Base path: `/api`

| Method | Path                      | Purpose                          |
| ------ | ------------------------- | -------------------------------- |
| GET    | `/auth/google/url`        | Google OAuth authorization URL   |
| POST   | `/auth/google/callback`   | Complete Google sign-in          |
| GET    | `/auth/providers`         | List connected accounts (JWT)    |
| POST   | `/emails/send`            | Send shared email                |
| POST   | `/emails/send-individual` | Send private email per recipient |
| GET    | `/emails/history`         | Email history                    |

Interactive docs: `http://localhost:3400/api/docs`

---

## Validation Rules

- **Recipients** (`to`, `cc`, `bcc`) — must be valid email addresses; `to` is
  required.
- **Subject** — required, max 200 characters.
- **Body** — required (the `body` field; `body_type` is `html` or `text`).
- **Attachments** — max 5 files, size limit, extension + MIME allow-list.
- **Provider** — optional (`auto`, `smtp`, `gmail_api`).

---

## Security

- **Helmet** — secure HTTP headers.
- **CORS** — restricted origins.
- **JWT auth** — `verifyAccessToken` on all protected routes.
- **Rate limiting** — general API limiter + stricter auth limiter.
- **express-validator** — request body/query validation.
- **Multer** — file validation (extension, MIME, size, count).
- **AES-256-GCM** — OAuth token encryption at rest.
- **Centralized error handling** — consistent JSON error responses.
- **Winston logging** — console (dev) + file (prod).
- **Input sanitization** — trim + HTML strip.

---

_Next: [04 — Roadmap](04-roadmap.md)_
