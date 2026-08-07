# MailPilot AI — System Design

> **Status:** Current
> Focused on the OAuth-only, provider-based Express.js + PostgreSQL design.

---

## High-Level Architecture

```mermaid
flowchart TB
    U[User] --> R[React UI]
    R --> B[Express.js API]
    B --> P[(PostgreSQL / Neon)]
    B --> G[Gmail API]
    G --> E[Recipient]
    B --> S[SMTP - optional fallback]
```

- **React UI** renders the compose flow and the "Sign in with Google" button.
- **Express API** handles OAuth sign-in, token storage, and email sending.
- **PostgreSQL** stores users, connected accounts (encrypted tokens), and email
  history.
- **Gmail API** sends email through the user's own mailbox.
- **SMTP** is an optional fallback provider when SMTP_HOST is configured.

## Authentication Flow (Google OAuth)

```mermaid
sequenceDiagram
    participant U as User
    participant F as Frontend (React)
    participant B as Backend (Express)
    participant G as Google

    U->>F: Click "Sign in with Google"
    F->>B: GET /api/auth/google/url
    B-->>F: { url, state }
    F->>G: Redirect browser to Google consent screen
    U->>G: Grant permission
    G-->>F: Redirect back with ?code=...
    F->>B: POST /api/auth/google/callback { code, state }
    B->>G: Exchange code for access/refresh tokens
    B->>B: Find-or-create user + upsert connected_account
    B->>B: Encrypt & store Google tokens (AES-256-GCM)
    B-->>F: { user, connectedAccount, accessToken: MailPilot JWT }
    F-->>U: Logged in
```

> The frontend receives **only the MailPilot JWT**. Google's access/refresh
> tokens never leave the server.

## Email Sending Flow

### Shared Email (`POST /api/emails/send`)

```mermaid
sequenceDiagram
    participant F as Frontend
    participant B as Backend
    participant G as Gmail API
    participant E as Recipients

    F->>B: POST /emails/send (subject, to[], cc[], bcc[], body, files?)
    B->>B: Validate + normalize recipients
    B->>B: Resolve provider (Gmail API if connected)
    B->>G: users.messages.send (one email, all recipients in To)
    G-->>B: messageId
    B->>B: Persist email_history (arrays, attachment metadata)
    B->>B: Delete temporary attachment files
    B-->>F: { emailId, messageId, provider }
```

### Individual Emails (`POST /api/emails/send-individual`)

```mermaid
sequenceDiagram
    participant F as Frontend
    participant B as Backend
    participant G as Gmail API
    participant R1 as Recipient 1
    participant R2 as Recipient 2

    F->>B: POST /emails/send-individual (subject, to[2], ...)
    loop each recipient
        B->>G: Send email with only this recipient in To
        G-->>B: messageId
        B->>B: Persist email_history (mode=individual)
    end
    B->>B: Delete temporary attachment files
    B-->>F: { emails[], total, sent, failed }
```

## Data Flow: Token Refresh

```mermaid
sequenceDiagram
    participant B as Backend
    participant DB as PostgreSQL
    participant G as Google

    B->>DB: Read connected_account (encrypted tokens)
    B->>B: Decrypt + check expiry
    alt token expired or near expiry
        B->>G: Refresh access token (refresh_token)
        G-->>B: New access token
        B->>DB: Store updated (encrypted) tokens
    end
    B->>G: Send via Gmail API with valid access token
```

## User Flow

```mermaid
flowchart LR
    A[Sign in with Google] --> B[Compose]
    B --> C[Add Recipients]
    C --> D[Subject + Body]
    D --> E[Add Attachments]
    E --> F{Send mode}
    F --> G[Shared - one email]
    F --> H[Individual - one per recipient]
    G --> I[View History]
    H --> I
```

---

_Next: [03 — Technical Design](03-technical-design.md)_
