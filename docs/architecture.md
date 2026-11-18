# Architecture

## Components

```
web-ui/  React SPA ──/api (cookie session + X-MailPilot-Client header)──▶ backend-node/  Express 5 API
                                                                        ├─ services/batchService    validate, idempotency, history
                                                                        ├─ services/deliveryQueue   DB-backed queue, retries
                                                                        ├─ services/providers/*     demo | smtp | gmail adapters
                                                                        └─ db/  SQLite (default) or PostgreSQL
```

In development, Vite proxies `/api` to the API, so the browser sees a single origin. In production the API can serve the built UI itself (`SERVE_WEB_UI=true`, the default when `web-ui/dist` exists), so one service is enough.

## Data model

| Table                | Purpose                                                                                     |
| -------------------- | ------------------------------------------------------------------------------------------- |
| `users`              | Accounts. `password_hash` (bcrypt) for password users, `google_id` for Google users.          |
| `sessions`           | SHA-256 of the session token, plus its expiry. The token itself only exists in the cookie.    |
| `connected_accounts` | Google OAuth tokens, encrypted with AES-256-GCM (`TOKEN_ENCRYPTION_KEY`). Gmail mode only.    |
| `batches`            | One compose action: subject, body template, CC/BCC, attachment metadata, idempotency key.    |
| `deliveries`         | One row per To recipient: status, attempts, error, provider message id.                      |

The schema is portable. Ids are UUID text, timestamps are ISO-8601 text, and lists are JSON text, so the same SQL runs on SQLite and PostgreSQL. Migrations live in `backend-node/src/db/migrations.js` and run automatically on startup.

## Sending pipeline

1. `POST /api/emails/send` validates recipients, content and attachments. Attachments are checked against an allowlist, and each file's leading bytes must match its extension.
2. The **idempotency** check runs: the `(user, Idempotency-Key)` pair is unique. Repeating a request with the same body returns the original batch; a different body gets 409. The UI derives the key from the form content, so double clicks and retries after a network error are safe.
3. A `batches` row and N `deliveries` rows (`queued`) are inserted in one transaction. The response is `202 Accepted`.
4. The **delivery queue** claims queued rows with a conditional `UPDATE … WHERE status='queued'`, so a row is never sent twice. It runs up to `SEND_CONCURRENCY` sends at a time, at least `SEND_DELAY_MS` apart.
5. For each delivery, the message is personalized with a single `To` address (plus the batch's CC/BCC) and handed to the provider.
6. Provider errors are classified:

| Kind        | Example                                     | Result                                                      |
| ----------- | ------------------------------------------- | ----------------------------------------------------------- |
| `transient` | SMTP 4xx, HTTP 429/503, connect failure     | re-queued with exponential backoff, up to `SEND_MAX_ATTEMPTS` |
| `permanent` | SMTP 550 unknown mailbox                    | `failed` for that recipient only                            |
| `fatal`     | bad credentials, sending quota exhausted    | `failed`; the rest of the batch is marked `skipped` ("not sent") |
| `unknown`   | connection dropped after data was sent      | `unknown`, never retried automatically (could duplicate)    |

7. When nothing is pending, the batch becomes `completed`, `partial` or `failed`. Attachment files are deleted. If some deliveries failed, they are kept for `ATTACHMENT_RETENTION_HOURS` so "Retry failed" can resend them.
8. **Restart safety:** on startup, rows still `sending` become `unknown`, and `queued` rows continue.

## Security model

- Sessions are random 256-bit tokens in an `HttpOnly`, `SameSite=Lax` cookie (`Secure` in production). They are stored hashed.
- **CSRF:** state-changing requests must carry the custom `X-MailPilot-Client` header, which cross-site pages can't send without passing CORS (limited to `CORS_ORIGINS`).
- **Google OAuth:** the `state` parameter is stored in a short-lived HttpOnly cookie and compared in constant time. Tokens never reach the browser.
- **Passwords:** bcrypt (cost 12). Login timing is equalized for unknown accounts.
- **Rate limits:** per IP for the API and for sign-in, per user for sending, plus a daily recipient quota per user.
- **Header injection:** subjects and names containing line breaks are rejected, and values inserted into HTML are escaped.
- **Previews:** HTML previews render in a sandboxed iframe with no scripts and no same-origin access.
- **Logging:** logs mask addresses (`j***@example.com`) and never include bodies, passwords, tokens or cookies.
- **Secrets:** provider credentials exist only in server environment variables.
