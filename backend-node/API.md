# MailPilot API

Base path: `/api`. JSON in and out, except `POST /emails/send`, which also accepts `multipart/form-data`.

**Authentication** uses the `mp_session` HttpOnly cookie set by the sign-in endpoints. Send requests with credentials (`fetch(..., { credentials: "include" })`).

**CSRF:** every `POST` must include the header `X-MailPilot-Client: <any value>`.

**Errors** have the shape `{ "error": { "code": "validation_failed", "message": "…", "details": [{ "field": "to", "message": "…", "value": "…" }] } }`.

## Public

| Method | Path          | Description                                                                 |
| ------ | ------------- | --------------------------------------------------------------------------- |
| GET    | `/health`     | `{ status, database, emailProvider }`; 503 if the database is unreachable    |
| GET    | `/config`     | Provider, simulated flag, enabled sign-in methods, limits, allowed attachment types |
| GET    | `/auth/me`    | `{ user, connectedAccount }`; `user` is `null` when signed out               |

## Auth

| Method | Path                    | Body                          | Notes                                          |
| ------ | ----------------------- | ----------------------------- | ---------------------------------------------- |
| POST   | `/auth/register`        | `{ email, password, name? }`  | 202 `{ verification }`. Creates an **unverified** account and emails a 6-digit code (no session yet). Re-registering an unverified email restarts verification. 409 `email_taken` if verified |
| POST   | `/auth/verify-otp`      | `{ email, code }`             | 200 and a session on success. 400 `otp_invalid` / `otp_expired`, 429 `otp_locked` (too many wrong attempts) |
| POST   | `/auth/resend-otp`      | `{ email }`                   | 202 `{ verification }` with a fresh code (old one stops working). 429 `otp_cooldown` / `otp_resend_limit` with `details[0].retryAfterSeconds` |
| POST   | `/auth/login`           | `{ email, password }`         | 401 `invalid_credentials`; 403 `email_not_verified` (correct password, unverified email) |
| POST   | `/auth/demo`            | –                             | Demo mode only                                 |
| POST   | `/auth/logout`          | –                             | 204                                            |
| GET    | `/auth/google/start`    | –                             | Redirects to Google (Gmail mode)               |
| GET    | `/auth/google/callback` | –                             | OAuth redirect target; sets the session and redirects to `APP_URL/dashboard` |

`verification` is `{ email, expiresInSeconds, resendInSeconds, sent, demoCode? }`. `demoCode` appears only in demo mode, where nothing is emailed. Expiry, attempts and resend limits are enforced by the server; clients only display the countdown.

## Emails (signed in)

### `GET /emails/senders`

`{ default, mode, addresses, domains, defaultAuthorized }`: the From addresses this server authorizes for you (`mode: "any"` in demo mode).

### `POST /emails/preview`

Body: the same fields as send, plus `index` (which recipient to render). Nothing is stored or sent.
Response: `{ index, total, recipients, cc, bcc, warnings, simulated, message: { from, to, cc, bcc, subject, html, text, attachments } }`

### `POST /emails/send`

Headers: `Idempotency-Key: <8–100 chars [A-Za-z0-9_.:-]>` (**required**)

| Field         | Type                                   | Notes                                                     |
| ------------- | -------------------------------------- | --------------------------------------------------------- |
| `from`        | string                                 | Optional. `a@x.com` or `Name <a@x.com>`. Defaults to your verified email. Must be authorized by the provider, otherwise `422 sender_not_authorized` (`details[0].field = "from"`) |
| `to`          | string or string[]                     | Required. `a@x.com`, `Name <a@x.com>`; strings may be comma, semicolon or newline separated |
| `cc`, `bcc`   | string or string[]                     | Optional; copied onto every individual message           |
| `subject`     | string                                 | Required, no line breaks; supports placeholders          |
| `body`        | string                                 | Required                                                  |
| `body_type`   | `html` (default) or `text`             |                                                           |
| `attachments` | files (multipart only)                 | See `/config` for limits and types                        |

Placeholders: `{{name}}`, `{{first_name}}`, `{{last_name}}`, `{{email}}`, with an optional fallback: `{{first_name|there}}`.

Responses:

- `202` `{ batch, replayed: false, warnings }`: queued.
- `200` `{ batch, replayed: true }` with header `Idempotent-Replayed: true`: same key and same content were already submitted.
- `409 idempotency_conflict`: same key, different content.
- `422`: validation errors with `details`.
- `429`: rate limit or `quota_exceeded`.

```bash
curl -X POST http://localhost:3400/api/emails/send \
  -b cookies.txt -H 'X-MailPilot-Client: curl' -H "Idempotency-Key: $(uuidgen)" \
  -F 'to=Jane Doe <jane@example.com>' -F 'to=bob@example.com' \
  -F 'subject=Hi {{first_name|there}}' -F 'body=Hello {{first_name|there}}!' -F 'body_type=text' \
  -F 'attachments=@report.pdf'
```

### `GET /emails/batches?page=&limit=&search=&status=`

`status` is one of `sending`, `completed`, `partial` or `failed`. Returns `{ batches: [batch], pagination }`.

### `GET /emails/batches/:id`

Returns `{ batch }` with `deliveries: [{ id, email, name, status, attempts, errorCode, error, acceptedAt }]` and `body`.

Delivery statuses: `queued`, `sending`, `accepted`, `failed`, `skipped` (not attempted after a provider-wide error) and `unknown` (connection lost mid-send).

### `POST /emails/batches/:id/retry`

Re-queues `failed` and `skipped` deliveries. `unknown` deliveries are never re-sent automatically. Returns `202 { requeued }`, or `409` if the batch is still sending, nothing failed, or the attachments have expired.

### `GET /emails/stats`

`{ batches, emails, accepted, failed, unknown, inProgress, last24h, dailyLimit }`
