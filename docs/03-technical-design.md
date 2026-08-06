# MailPilot AI — Technical Design

> **Status:** Initial development phase (Phase 1)
> Practical details for the current scope.

---

## Tech Stack

### Frontend

| Technology   | Purpose                 |
| ------------ | ----------------------- |
| React        | UI library (JavaScript) |
| Vite         | Build tool              |
| Axios        | HTTP client             |
| React Router | Navigation              |

### Backend

| Technology | Purpose       |
| ---------- | ------------- |
| Python     | Language      |
| FastAPI    | Web framework |

### Future (not in Phase 1)

| Technology   | Purpose        |
| ------------ | -------------- |
| PostgreSQL   | Database       |
| Google OAuth | Authentication |

---

## Folder Structure

```text
mailpilot-ai/
├── frontend/
│   ├── src/
│   │   ├── components/   # UI components
│   │   ├── pages/        # Route pages (Compose, Status)
│   │   ├── api/          # Axios API calls
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
├── backend/
│   ├── app/
│   │   ├── main.py       # FastAPI app
│   │   ├── routes.py     # API endpoints
│   │   ├── email_service.py  # Email sending logic
│   │   └── validators.py # Validation rules
│   └── requirements.txt
└── docs/
```

> [!NOTE]
> This is a simple Phase 1 structure. It will grow as features are added.

---

## API Endpoints

| Method | Path                 | Purpose                            |
| ------ | -------------------- | ---------------------------------- |
| POST   | `/send`              | Send email to all recipients       |
| GET    | `/status/{email_id}` | Get sending status for a recipient |

### Example Request — `POST /send`

```json
{
  "subject": "Hello from MailPilot",
  "body": "Hi there, just reaching out!",
  "recipients": ["a@example.com", "b@example.com"],
  "attachments": ["file1.pdf", "file2.csv"]
}
```

### Example Response — `202 Accepted`

```json
{
  "email_id": "abc123",
  "status": "sending",
  "recipient_count": 2
}
```

---

## Validation Rules

- **Recipients** — must be valid email addresses.
- **Subject** — required, max 200 characters.
- **Body** — required.
- **Attachments** — max 5 files.

---

## Attachment Rules

| Rule          | Value                     |
| ------------- | ------------------------- |
| Maximum count | 5 per email               |
| Allowed types | PDF, DOC, DOCX, CSV       |
| Size limit    | Check file size on upload |

---

## Email Parsing Logic

The frontend sends recipients as a list. If the user types them as a block of text, split on:

- Comma (`,`)
- Newline
- Pipe (`|`)

```js
// Example
const emails = text
  .split(/[,\n|]/)
  .map((s) => s.trim())
  .filter(Boolean);
```

- Removes empty values.
- Trims whitespace.
- Deduplicates repeated emails.

---

## Basic Error Handling

**Frontend**

- Show inline errors for invalid emails.
- Disable Send until the form is valid.
- Show a message if sending fails.

**Backend**

- Validate incoming data; return `400` with a clear message on invalid input.
- Wrap each recipient send in its own try/except so one failure doesn't stop the others.
- Return `202` when sending starts, then report per-recipient status.

```python
for recipient in recipients:
    try:
        send_email(recipient, subject, body, attachments)
        mark_sent(recipient, "success")
    except Exception as e:
        mark_sent(recipient, "failed", str(e))
```

---

_Next: [04 — Roadmap](04-roadmap.md)_
