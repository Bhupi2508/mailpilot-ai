<div align="center">

# 🚀 MailPilot AI

**Send one email to many people — as individual emails.**

`React` (JavaScript) • `Vite` • `Python` • `FastAPI`

</div>

---

## Project Overview

MailPilot AI lets you compose **one email** and automatically send an **individual email to every recipient** — so no one ever sees the other recipients.

## Problem Statement

Sending the same email to many people traditionally means:

- **To / CC** — everyone sees each other's email addresses.
- **BCC** — hides addresses, but still looks like a bulk email and is poor for professional outreach (e.g., recruiter emails).

## Solution

Write the email **once**. MailPilot AI sends a **separate email to each recipient** automatically.

- Each recipient gets their own email.
- Recipients never see each other.
- Looks personal — not bulk.

## Features

- Compose a single email
- Multiple recipients (comma, newline, or pipe separated)
- Subject line & email body
- Up to 5 attachments (PDF, DOC/DOCX, CSV)
- One email sent per recipient
- Success / failure status

## Tech Stack

| Layer    | Technology                                   |
| -------- | -------------------------------------------- |
| Frontend | React, JavaScript, Vite, Axios, React Router |
| Backend  | Python, FastAPI                              |
| Future   | PostgreSQL, Google OAuth                     |

## Folder Structure

```text
mailpilot-ai/
├── frontend/   # React + Vite SPA
├── backend/    # FastAPI app
├── docs/       # Documentation
└── README.md
```

## Getting Started

```bash
# Frontend
cd frontend
npm install
npm run dev

# Backend
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload
```

> [!NOTE]
> Detailed setup and architecture are in the [documentation](docs/README.md).

## Future Scope

- Templates
- Google OAuth
- Scheduling
- AI email generation
- Delivery analytics
- Outlook, AWS SES, SendGrid
- Teams & organizations

---

_See [docs](docs/README.md) for the full documentation._
