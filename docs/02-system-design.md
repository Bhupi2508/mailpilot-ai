# MailPilot AI — System Design

> **Status:** Initial development phase (Phase 1)
> Focused on the simple, end-to-end flow for sending individual emails.

---

## Simple Architecture

```mermaid
flowchart TB
    U[User] --> R[React UI]
    R --> F[FastAPI Backend]
    F --> G[Gmail API]
    G --> E[Recipient]
```

## Request Flow

```mermaid
sequenceDiagram
    participant U as User
    participant R as React UI
    participant F as FastAPI
    U->>R: Compose email + recipients
    R->>F: POST /send (subject, body, recipients, files)
    F->>F: Validate & parse recipients
    F-->>R: 202 Accepted (sending started)
    R-->>U: Show "Sending..."
```

- The user fills the compose form and clicks **Send**.
- The React UI sends one request to the backend with all the email data.
- The backend validates and parses the recipients, then responds quickly.

## Email Sending Flow

```mermaid
sequenceDiagram
    participant F as FastAPI
    participant G as Gmail API
    participant E as Recipient
    loop each recipient
        F->>G: Send individual email
        G-->>F: Success / Failure
        F->>F: Save status
    end
```

- The backend loops through each recipient.
- It sends a **separate email** to each one via the Gmail API.
- It records the result (success or failure) for each recipient.

## User Flow

```mermaid
flowchart LR
    A[Login] --> B[Compose]
    B --> C[Add Recipients]
    C --> D[Subject + Body]
    D --> E[Add Attachments]
    E --> F[Send]
    F --> G[View Status]
```

| Step                | What happens                                            |
| ------------------- | ------------------------------------------------------- |
| **Login**           | Basic placeholder login (full OAuth in a future phase). |
| **Compose**         | User writes the email in a form.                        |
| **Add Recipients**  | Enter emails separated by comma, newline, or pipe.      |
| **Subject + Body**  | Add the subject line and email body.                    |
| **Add Attachments** | Attach up to 5 files (PDF, DOC/DOCX, CSV).              |
| **Send**            | Click send to deliver one email per recipient.          |
| **View Status**     | See success/failure for each recipient.                 |

---

_Next: [03 — Technical Design](03-technical-design.md)_
