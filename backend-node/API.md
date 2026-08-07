# MailPilot AI — API Reference

Base URL: `http://localhost:3400/api`

Interactive Swagger docs: `http://localhost:3400/api/docs`

All protected endpoints require a **Bearer token** (the MailPilot JWT returned
after OAuth sign-in):

```
Authorization: Bearer <mailpilot-jwt>
```

---

## Table of Contents

1. [OAuth Endpoints](#oauth-endpoints)
   - [GET /auth/:provider/url](#get-authproviderurl)
   - [POST /auth/:provider/callback](#post-authprovidercallback)
   - [GET /auth/:provider/callback](#get-authprovidercallback)
   - [GET /auth/providers](#get-authproviders)
2. [Email Endpoints](#email-endpoints)
   - [POST /emails/send](#post-emailssend)
   - [POST /emails/send-individual](#post-emailssend-individual)
   - [GET /emails/history](#get-emails-history)
3. [Standard Response Format](#standard-response-format)
4. [Status Codes](#status-codes)
5. [Validation Errors](#validation-errors)
6. [cURL Examples](#curl-examples)
7. [Postman Examples](#postman-examples)

---

## OAuth Endpoints

### GET /auth/:provider/url

Generates the provider authorization URL (Google consent screen).

**Path Parameters**

| Param      | Type   | Required | Description                     |
| ---------- | ------ | -------- | ------------------------------- |
| `provider` | string | yes      | Provider name. `google` for now |

**Response 200 OK**

```json
{
  "success": true,
  "data": {
    "url": "https://accounts.google.com/o/oauth2/v2/auth?access_type=offline&prompt=consent&scope=openid%20email%20profile%20https://www.googleapis.com/auth/gmail.send&state=...&redirect_uri=...",
    "state": "a-random-csrf-state"
  },
  "message": "google authorization URL generated."
}
```

**cURL**

```bash
curl -X GET http://localhost:3400/api/auth/google/url
```

**Error Responses**

| Status | Meaning                    |
| ------ | -------------------------- |
| 400    | Unsupported provider name. |
| 429    | Too many requests.         |

---

### POST /auth/:provider/callback

Exchanges the provider's authorization `code` for a MailPilot JWT. Finds or
creates the user, links the connected account, and stores encrypted provider
tokens server-side.

**Path Parameters**

| Param      | Type   | Required | Description                     |
| ---------- | ------ | -------- | ------------------------------- |
| `provider` | string | yes      | Provider name. `google` for now |

**Request Body (JSON)**

```json
{
  "code": "4/0AX4Xf...authorization_code...",
  "state": "a-random-csrf-state"
}
```

| Field   | Type   | Required | Description                                    |
| ------- | ------ | -------- | ---------------------------------------------- |
| `code`  | string | yes      | Authorization code from the provider redirect. |
| `state` | string | no       | CSRF state token echoed back from provider.    |

**Response 200 OK**

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "9f8c...",
      "google_id": "1033...",
      "name": "Jane Doe",
      "email": "jane@gmail.com",
      "profile_picture": "https://lh3.googleusercontent.com/..."
    },
    "connectedAccount": {
      "id": "a1b2...",
      "provider": "google",
      "email": "jane@gmail.com"
    },
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "expiresIn": 900000
  },
  "message": "Sign-in successful."
}
```

> **Note:** The response contains ONLY the MailPilot JWT. Google's access and
> refresh tokens are stored encrypted server-side and never sent to the client.

**cURL**

```bash
curl -X POST http://localhost:3400/api/auth/google/callback \
  -H "Content-Type: application/json" \
  -d '{"code": "4/0AX4Xf...", "state": "a-random-csrf-state"}'
```

**Error Responses**

| Status | Meaning                                                    |
| ------ | ---------------------------------------------------------- |
| 400    | Missing `code`, invalid/expired code, or invalid provider. |
| 409    | Provider account already linked to another MailPilot user. |
| 429    | Too many requests.                                         |

---

### GET /auth/:provider/callback

Handles the **browser-redirect** OAuth callback. Providers like Google redirect
the user's browser to this URL via `GET` after consent. The server exchanges the
`code`, issues a MailPilot JWT, and **redirects the browser** to the configured
frontend URL with the JWT and user info as query parameters.

**Path Parameters**

| Param      | Type   | Required | Description                     |
| ---------- | ------ | -------- | ------------------------------- |
| `provider` | string | yes      | Provider name. `google` for now |

**Query Parameters**

| Param   | Type   | Required | Description                                    |
| ------- | ------ | -------- | ---------------------------------------------- |
| `code`  | string | yes      | Authorization code from the provider redirect. |
| `state` | string | no       | CSRF state token echoed back from provider.    |

**Redirect (302) to**

```
http://localhost:5173?token=<mailpilot-jwt>&state=<state>&expiresIn=<ms>&user=<json>&account=<json>
```

Where `user` and `account` are URL-encoded JSON objects (e.g.
`{"id":"...","name":"...","email":"...","profile_picture":"..."}`).

> **Note:** This is the endpoint acts as the `redirect_uri` configured in the
> Google Cloud Console. It is meant to be called by the browser, not by API
> clients. For a JSON API response, use `POST /auth/:provider/callback`.

---

### GET /auth/providers

Lists the authenticated user's connected provider accounts.

**Auth:** Bearer token required.

**Response 200 OK**

```json
{
  "success": true,
  "data": {
    "accounts": [
      {
        "id": "a1b2...",
        "user_id": "9f8c...",
        "provider": "google",
        "provider_email": "jane@gmail.com",
        "token_expiry": "2025-01-01T12:00:00.000Z",
        "scopes": [
          "openid",
          "email",
          "profile",
          "https://www.googleapis.com/auth/gmail.send"
        ],
        "is_active": true,
        "created_at": "2024-01-01T12:00:00.000Z",
        "updated_at": "2024-01-01T12:00:00.000Z"
      }
    ]
  },
  "message": "Connected provider accounts retrieved successfully."
}
```

**cURL**

```bash
curl -X GET http://localhost:3400/api/auth/providers \
  -H "Authorization: Bearer <mailpilot-jwt>"
```

**Error Responses**

| Status | Meaning                          |
| ------ | -------------------------------- |
| 401    | Missing or invalid access token. |

---

## Email Endpoints

All email endpoints require a Bearer token and support both:

- `application/json` — when no files are attached
- `multipart/form-data` — when files are attached

### POST /emails/send

Sends **one email to all recipients** (shared "To" field). All recipients can
see every recipient.

**Request Body (JSON)**

```json
{
  "subject": "Quarterly Update",
  "to": ["alice@example.com", "bob@example.com"],
  "cc": ["carol@example.com"],
  "bcc": ["dave@example.com"],
  "body": "<h1>Hello</h1><p>Here is the update.</p>",
  "body_type": "html",
  "provider": "auto",
  "account_id": "a1b2-..."
}
```

**Request Fields**

| Field        | Type            | Required | Description                                         |
| ------------ | --------------- | -------- | --------------------------------------------------- |
| `subject`    | string          | yes      | Max 200 characters.                                 |
| `to`         | array \| string | yes      | Recipients (array or comma/newline/pipe-separated). |
| `cc`         | array \| string | no       | CC recipients.                                      |
| `bcc`        | array \| string | no       | BCC recipients.                                     |
| `body`       | string          | yes      | Email body (HTML or plain text).                    |
| `body_type`  | string          | no       | `html` (default) or `text`.                         |
| `provider`   | string          | no       | `auto` (default), `smtp`, or `gmail_api`.           |
| `account_id` | uuid            | no       | Specific connected account to send from.            |

**Response 200 OK**

```json
{
  "success": true,
  "data": {
    "emailId": "5f6d...",
    "messageId": "18abc1234def567",
    "provider": "gmail_api",
    "recipient": null
  },
  "message": "Email sent successfully."
}
```

**cURL (JSON)**

```bash
curl -X POST http://localhost:3400/api/emails/send \
  -H "Authorization: Bearer <mailpilot-jwt>" \
  -H "Content-Type: application/json" \
  -d '{
    "subject": "Quarterly Update",
    "to": ["alice@example.com", "bob@example.com"],
    "body": "<h1>Hello</h1>",
    "body_type": "html"
  }'
```

**cURL (multipart/form-data with attachments)**

```bash
curl -X POST http://localhost:3400/api/emails/send \
  -H "Authorization: Bearer <mailpilot-jwt>" \
  -F "subject=Quarterly Update" \
  -F "to=alice@example.com,bob@example.com" \
  -F "body=<h1>Hello</h1>" \
  -F "body_type=html" \
  -F "attachments=@/path/to/report.pdf" \
  -F "attachments=@/path/to/data.csv"
```

**Error Responses**

| Status | Meaning                                              |
| ------ | ---------------------------------------------------- |
| 400    | Validation failed (see [below](#validation-errors)). |
| 401    | Missing or invalid access token.                     |
| 413    | File too large or too many files.                    |
| 415    | Unsupported Content-Type.                            |
| 502    | Email provider send failure.                         |
| 503    | SMTP not configured (when provider=smtp).            |

---

### POST /emails/send-individual

Sends **one private email per recipient**. Each recipient only sees their own
email address in the "To" field. CC and BCC are optional and shared across all
sends.

**Request Body (JSON)** — same shape as `/emails/send`.

**Response 200 OK**

```json
{
  "success": true,
  "data": {
    "emails": [
      {
        "emailId": "5f6d...",
        "messageId": "18abc1234def567",
        "provider": "gmail_api",
        "recipient": "alice@example.com"
      },
      {
        "emailId": "6f7e...",
        "messageId": "19def2345ghi678",
        "provider": "gmail_api",
        "recipient": "bob@example.com"
      }
    ],
    "total": 2,
    "sent": 2,
    "failed": 0
  },
  "message": "Emails sent successfully."
}
```

If a recipient fails, that entry is:

```json
{
  "status": "failed",
  "recipient": "bob@example.com",
  "error": "Gmail API send failed: ..."
}
```

**cURL (JSON)**

```bash
curl -X POST http://localhost:3400/api/emails/send-individual \
  -H "Authorization: Bearer <mailpilot-jwt>" \
  -H "Content-Type: application/json" \
  -d '{
    "subject": "Personal note",
    "to": ["alice@example.com", "bob@example.com"],
    "body": "Hi! This is just for you.",
    "body_type": "text"
  }'
```

**cURL (multipart)**

```bash
curl -X POST http://localhost:3400/api/emails/send-individual \
  -H "Authorization: Bearer <mailpilot-jwt>" \
  -F "subject=Personal note" \
  -F "to=alice@example.com,bob@example.com" \
  -F "body=Hi! This is just for you." \
  -F "body_type=text" \
  -F "attachments=@/path/to/file.pdf"
```

**Error Responses** — same as `/emails/send`.

---

### GET /emails/history

Returns the authenticated user's email history (paginated).

**Query Parameters**

| Param   | Type | Required | Description                         |
| ------- | ---- | -------- | ----------------------------------- |
| `page`  | int  | no       | Page number (default 1).            |
| `limit` | int  | no       | Items per page, 1–100 (default 20). |

**Response 200 OK**

```json
{
  "success": true,
  "data": {
    "emails": [
      {
        "id": "5f6d...",
        "user_id": "9f8c...",
        "provider": "gmail_api",
        "provider_message_id": "18abc1234def567",
        "subject": "Quarterly Update",
        "body": "<h1>Hello</h1><p>Here is the update.</p>",
        "body_type": "html",
        "to_recipients": ["alice@example.com", "bob@example.com"],
        "cc_recipients": ["carol@example.com"],
        "bcc_recipients": ["dave@example.com"],
        "sending_mode": "shared",
        "attachment_count": 2,
        "attachment_names": ["report.pdf", "data.csv"],
        "status": "sent",
        "error_message": null,
        "sent_at": "2024-01-01T12:00:00.000Z",
        "created_at": "2024-01-01T12:00:00.000Z",
        "updated_at": "2024-01-01T12:00:00.000Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 1,
      "totalPages": 1
    }
  },
  "message": "Email history retrieved successfully."
}
```

**cURL**

```bash
curl -X GET "http://localhost:3400/api/emails/history?page=1&limit=20" \
  -H "Authorization: Bearer <mailpilot-jwt>"
```

**Error Responses**

| Status | Meaning                          |
| ------ | -------------------------------- |
| 400    | Invalid `page` or `limit`.       |
| 401    | Missing or invalid access token. |

---

## Standard Response Format

**Success**

```json
{
  "success": true,
  "message": "...",
  "data": {}
}
```

**Error**

```json
{
  "success": false,
  "message": "...",
  "details": []
}
```

---

## Status Codes

| Status | Meaning                                          |
| ------ | ------------------------------------------------ |
| 200    | Success.                                         |
| 400    | Validation error or bad request.                 |
| 401    | Missing/invalid/expired Bearer token.            |
| 409    | Conflict (e.g. provider account already linked). |
| 413    | Payload too large / file too large.              |
| 415    | Unsupported Content-Type.                        |
| 429    | Rate limited.                                    |
| 500    | Internal server error.                           |
| 502    | Upstream provider (Gmail/SMTP) send failure.     |
| 503    | SMTP not configured.                             |

---

## Validation Errors

Validation errors return HTTP `400` with a `details` array:

```json
{
  "success": false,
  "message": "Validation failed.",
  "details": [
    {
      "field": "to",
      "message": "Invalid to email: \"not-an-email\". Please provide valid email addresses.",
      "value": "not-an-email"
    },
    { "field": "subject", "message": "Subject is required.", "value": "" },
    {
      "field": "body",
      "message": "A html body is required. Provide the 'body' field.",
      "value": ""
    }
  ]
}
```

Common validation rules:

| Field        | Rule                            |
| ------------ | ------------------------------- |
| `to`         | Required. Valid emails. Max 50. |
| `cc`         | Optional. Valid emails. Max 10. |
| `bcc`        | Optional. Valid emails. Max 10. |
| `subject`    | Required. Max 200 chars.        |
| `body`       | Required. String.               |
| `body_type`  | `html` or `text`.               |
| `provider`   | `auto`, `smtp`, or `gmail_api`. |
| `account_id` | Valid UUID.                     |
| `page`       | Positive integer.               |
| `limit`      | Integer 1–100.                  |

---

## cURL Examples

### 1. Start Google sign-in

```bash
curl -X GET http://localhost:3400/api/auth/google/url
```

### 2. Complete Google sign-in

```bash
curl -X POST http://localhost:3400/api/auth/google/callback \
  -H "Content-Type: application/json" \
  -d '{"code": "4/0AX4Xf...", "state": "state-value"}'
```

### 3. Send a shared email (JSON)

```bash
curl -X POST http://localhost:3400/api/emails/send \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{"subject":"Hello","to":["a@example.com","b@example.com"],"body":"<p>Hi</p>"}'
```

### 4. Send individual emails (multipart with attachments)

```bash
curl -X POST http://localhost:3400/api/emails/send-individual \
  -H "Authorization: Bearer <jwt>" \
  -F "subject=Hello" \
  -F "to=a@example.com,b@example.com" \
  -F "body=Hi" \
  -F "body_type=text" \
  -F "attachments=@/path/file.pdf"
```

### 5. Get email history

```bash
curl -X GET "http://localhost:3400/api/emails/history?page=1&limit=10" \
  -H "Authorization: Bearer <jwt>"
```

---

## Postman Examples

### Collection Setup

1. Create a new collection named **MailPilot AI**.
2. Add an environment variable `baseUrl` = `http://localhost:3400/api`.
3. Add an environment variable `jwt` = `<mailpilot-jwt>`.
4. Add a **Bearer** auth token to the collection using `{{jwt}}`.

### Request 1: Get Google Auth URL

- Method: `GET`
- URL: `{{baseUrl}}/auth/google/url`

### Request 2: Google Callback

- Method: `POST`
- URL: `{{baseUrl}}/auth/google/callback`
- Body (raw JSON):
  ```json
  {
    "code": "{{google_code}}",
    "state": "state-value"
  }
  ```
- After success, copy the `data.accessToken` into the `jwt` environment variable.

### Request 3: Send Shared Email

- Method: `POST`
- URL: `{{baseUrl}}/emails/send`
- Body (raw JSON):
  ```json
  {
    "subject": "Hello",
    "to": ["a@example.com", "b@example.com"],
    "body": "<h1>Hello</h1>",
    "body_type": "html"
  }
  ```

### Request 4: Send Individual Emails

- Method: `POST`
- URL: `{{baseUrl}}/emails/send-individual`
- Body (form-data):
  | Key | Type | Value |
  | ------------- | ------- | -------------------------- |
  | `subject` | text | Hello |
  | `to` | text | a@example.com,b@example.com |
  | `body` | text | Hi there |
  | `body_type` | text | text |
  | `attachments` | file | select a file to attach |

### Request 5: Email History

- Method: `GET`
- URL: `{{baseUrl}}/emails/history?page=1&limit=10`

---

## Example: Adding a New Provider

Adding Outlook, Zoho, or Yahoo later requires only:

1. A new OAuth adapter class in `src/services/oauth/` implementing
   `getAuthUrl(state)`, `exchangeCode(code)`, `refreshAccessToken(refreshToken)`,
   `getUserProfile(accessToken)`.
2. Register it in `src/services/oauth/oauthProviderRegistry.js`.
3. (Optional) A new email provider in `src/services/providers/` if the provider
   exposes its own API.

No schema, route, controller, or service changes are required — the provider
name is stored as a string on `connected_accounts.provider`.
