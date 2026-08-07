# MailPilot AI — Project Overview

> **Status:** Current
> **Tech:** React (JavaScript) + Vite + Express.js + PostgreSQL + Google OAuth

---

## Vision

MailPilot AI is **an email sending platform — NOT an email provider**.

Users **connect their own email account** (Google first, Outlook later) and
send emails **through their own mailbox** using the Gmail API — so no SMTP
credentials or App Passwords are ever required.

## Problem

Sending the same email to many people traditionally means:

- **To / CC** — everyone sees each other's email addresses.
- **BCC** — hides addresses, but still looks like a bulk email and is poor for
  professional outreach (e.g. recruiter emails).

## Solution

MailPilot AI lets you **write one email once** and send it to many recipients
in two modes:

- **Shared** — one email to all recipients (To/CC/BCC visible to all).
- **Individual** — a separate private email to every recipient; no recipient
  ever sees the others.

## Target Users

- Job seekers
- Recruiters
- Sales teams
- Freelancers
- Consultants
- Small businesses

## Core Features (Current)

- **Sign in with Google** (OAuth 2.0) — the only auth flow. No passwords.
- **Connect a Gmail account** and send through the **Gmail API** using the
  user's own mailbox.
- **Provider-based architecture** — adding Outlook, Microsoft 365, Zoho, Yahoo
  later requires only a new adapter.
- **Automatic token refresh** — expired access tokens are refreshed using the
  stored refresh token (encrypted at rest).
- **Frontend receives only the MailPilot JWT** — provider tokens never leave
  the server.
- **Two send modes**: shared email and individual private emails.
- **Attachments are temporary** — uploaded files are deleted immediately after
  sending; only metadata (count + names) is stored.
- **Email history** with recipient arrays and status.

## Future Features

- Outlook, Microsoft 365, Zoho, Yahoo providers
- AI email generation
- AI reply suggestions
- AI subject generation
- Email templates
- Scheduling
- Analytics & delivery tracking
- Search & drafts

## Why Use This App?

- **No password to manage** — sign in with your Google account.
- **Your own mailbox** — emails are sent from the user's own account.
- **Looks personal** — each recipient gets their own email.
- **Protects privacy** — recipients never see each other.
- **Better than BCC** for professional outreach.
- **Low infrastructure cost** — free-tier friendly (Neon PostgreSQL + Railway).

---

_Next: [02 — System Design](02-system-design.md)_
