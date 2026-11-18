# MailPilot backend

Express 5 API that turns one composed email into one individual message per recipient and delivers them through a configurable provider (demo, SMTP or Gmail API).

```bash
npm install
npm run dev              # http://localhost:3400 (demo mode without a .env)
npm test                 # in-memory SQLite + mock/local SMTP; never sends real email
npm run check:provider   # validate .env and test the provider connection without sending
```

```
src/
  server.js            entry: validate config, migrate, start queue + HTTP
  app.js               Express app (security headers, CORS, CSRF guard, routes, static UI)
  container.js         wires services together
  config/              env parsing + validation
  db/                  SQLite / PostgreSQL adapters and migrations
  middleware/          sessions, CSRF, rate limits, uploads, errors
  routes/              /api/auth, /api/emails
  services/
    recipients.js      parsing, validation, de-duplication
    messageBuilder.js  per-recipient message + personalization
    attachments.js     allowlist, content sniffing, temp storage
    batchService.js    batches, idempotency, history, retry
    deliveryQueue.js   DB-backed queue, concurrency, retries
    authService.js     bcrypt accounts, sessions
    googleOAuth.js     Google sign-in + token refresh (gmail mode)
    providers/         demo, smtp, gmail adapters + error classification
scripts/               migrate, check-provider, create-user
test/                  node:test suites
```

Configuration: [.env.example](.env.example). API: [API.md](API.md). Design: [../docs/architecture.md](../docs/architecture.md).
