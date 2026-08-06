# MailPilot AI — Project Overview

> **Status:** Initial development phase (Phase 1)
> **Tech:** React (JavaScript) + Vite + Python + FastAPI

---

## Vision

An app that lets you **send a personalized email to many people** — without anyone seeing the other recipients.

## Problem

Today, sending the same email to many people means:

- **To** — everyone sees each other's email.
- **CC** — everyone sees each other's email.
- **BCC** — hides emails, but still looks like a bulk send and is not ideal for professional outreach (e.g., recruiter emails).

## Solution

MailPilot AI lets you **write one email once** and sends an **individual email to every recipient** automatically.

- Each recipient gets a separate email.
- No recipient ever sees the others.
- Looks personal, not bulk.

## Target Users

- Job seekers
- Recruiters
- Sales teams
- Freelancers
- Consultants
- Small businesses

## Core Features (Phase 1)

- Compose a single email
- Add multiple recipients (comma, newline, or pipe separated)
- Subject line
- Email body
- Up to 5 attachments (PDF, DOC/DOCX, CSV)
- Send button
- Backend sends one email per recipient
- Success / failure status per email

## Future Features

- Templates
- Google OAuth login
- Search & drafts
- Scheduling
- AI email generation
- Analytics & delivery tracking
- Outlook, AWS SES, SendGrid support
- Teams & organizations

## Possible Business Model

- **Free Plan** — limited emails per month
- **Pro Plan** — more emails + extra features
- **Team Plan** — for small teams
- **Enterprise Plan** — large organizations
- **AI Credits** — pay for AI features
- **Monthly Subscription** — recurring billing

## Why Use This App?

- Saves time — write once, send individually to many.
- Looks personal — each recipient gets their own email.
- Protects privacy — recipients never see each other.
- Better than BCC for professional outreach.

---

_Next: [02 — System Design](02-system-design.md)_
