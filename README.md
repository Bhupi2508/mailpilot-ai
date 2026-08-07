<div align="center">

# 🚀 MailPilot AI

**An email sending platform — connect your own mailbox, send emails through it.**

`React` (JavaScript) • `Vite` • `Express.js` • `PostgreSQL` • `Google OAuth`

</div>

---

## What is MailPilot AI?

**MailPilot AI is NOT an email provider.**

It is an **email sending platform** that lets users:

1. **Connect their own email account** (Google first, Outlook later).
2. **Send emails through their own mailbox** — using the Gmail API, so **no
   SMTP credentials or App Passwords are ever required**.
3. Write one email and send it to many recipients — either as a **shared email**
   (everyone sees everyone) or as **individual private emails** (each recipient
   sees only their own address).

## Key Features

- **Sign in with Google** (OAuth 2.0) — the only auth flow. No passwords.
- **Provider-based architecture** — adding Outlook, Microsoft 365, Zoho, Yahoo
  later requires only a new adapter.
- **Send via the user's own Gmail account** using the Gmail API — Google tokens
  are encrypted at rest and auto-refreshed.
- **Frontend receives only the MailPilot JWT** — provider tokens never leave the
  server.
- **Two send modes**:
  - **Shared**: one email to all recipients (To/CC/BCC).
  - **Individual**: one private email per recipient.
- **Attachments are temporary** — uploaded files are deleted immediately after
  sending; only metadata (count + names) is stored.
- **Lightweight & cost-optimized** — minimal tables, minimal dependencies,
  free-tier friendly (Neon PostgreSQL + Railway).

## Tech Stack

| Layer    | Technology                        |
| -------- | --------------------------------- |
| Frontend | React, JavaScript, Vite           |
| Backend  | Express.js, JavaScript (CommonJS) |
| Database | PostgreSQL (Neon-compatible)      |
| Auth     | Google OAuth 2.0 + JWT            |
| Email    | Gmail API (SMTP optional)         |
| Docs     | Swagger / OpenAPI                 |

## Folder Structure

```text
mailpilot-ai/
├── backend/     # Express.js + PostgreSQL API (OAuth-only)
│   ├── src/
│   │   ├── config/      # env, DB pool, SMTP (optional), Swagger
│   │   ├── controllers/ # request handlers
│   │   ├── db/          # schema.sql + migration script
│   │   ├── middleware/  # auth, validation, upload, error handling
│   │   ├── models/      # data access layer
│   │   ├── routes/      # route definitions
│   │   ├── services/    # business logic
│   │   │   ├── oauth/   # provider adapters + registry (Google)
│   │   │   └── providers/ # email sending adapters (Gmail API, SMTP)
│   │   ├── validators/  # request validation rules
│   │   ├── utils/       # ApiError, ApiResponse, crypto, logger
│   │   ├── app.js
│   │   └── server.js
│   ├── API.md           # full API reference
│   └── README.md        # backend docs
├── web-ui/      # React + Vite SPA
├── docs/        # project documentation
└── README.md
```

## Getting Started

### Backend

```bash
cd backend
npm install
cp .env.example .env   # configure DB, Google OAuth, JWT, encryption key
npm run migrate
npm run dev
```

API docs (Swagger): `http://localhost:3400/api/docs`

### Frontend

```bash
cd web-ui
npm install
npm run dev
```

## Google Sign-In Flow

1. `GET /api/auth/google/url` → returns a Google consent URL + CSRF `state`.
2. Redirect the browser to that URL.
3. After consent, Google redirects back with a `code`.
4. `POST /api/auth/google/callback` with the `code` → returns the **MailPilot
   JWT** and links the user's Gmail account.
5. Emails can then be sent through the **Gmail API** using the user's own
   account — no SMTP credentials or App Passwords needed.

## Documentation

| Document                               | Purpose                               |
| -------------------------------------- | ------------------------------------- |
| [backend/README.md](backend/README.md) | Backend setup, architecture, env vars |
| [backend/API.md](backend/API.md)       | Every endpoint, examples, Postman     |
| [docs/](docs/)                         | Project overview & design docs        |

## Roadmap

- **OAuth providers**: Outlook, Microsoft 365, Zoho, Yahoo (adapter-based)
- **AI features**: email generation, reply suggestions, subject generation
- **Email templates & scheduling**
- **Delivery analytics**

---

_See [docs](docs/README.md) for the full documentation._
