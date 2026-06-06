# 🔒 Security Model

GrindLog is designed with security as a first-class concern. This document explains exactly how GrindLog handles your data, authentication, and credentials.

## Core Security Principles

1. **No passwords are ever stored** — GrindLog never asks for, captures, or stores your LeetCode password
2. **Visible browser authentication** — All authentication happens in a browser window you can see and control
3. **Local-only sessions** — Session data never leaves your machine
4. **Encrypted at rest** — All sensitive data is encrypted using AES-256-GCM
5. **No telemetry** — GrindLog collects no usage data, analytics, or metrics
6. **No external data transmission** — Your credentials are never sent to any server except LeetCode's own API

## How Authentication Works

### Interactive Session Refresh

When your session expires, GrindLog uses **Interactive Session Refresh** — a transparent, user-controlled flow:

```
1. GrindLog opens a VISIBLE browser window (Microsoft Edge, Chrome, or Brave)
2. Navigates to leetcode.com
3. If you're already logged in → session is extracted automatically
4. If not → you log in manually on the real LeetCode website
5. GrindLog waits until you complete authentication
6. Only 2 cookies are extracted: LEETCODE_SESSION and csrftoken
7. These are encrypted and stored locally
8. The browser closes
```

**What GrindLog NEVER does:**
- ❌ Capture your password or keystrokes
- ❌ Run a hidden/headless browser
- ❌ Solve CAPTCHAs or bypass MFA
- ❌ Intercept network traffic
- ❌ Store login credentials

**What GrindLog DOES:**
- ✅ Opens a visible browser you control
- ✅ Waits for you to authenticate
- ✅ Extracts only the 2 required session cookies
- ✅ Encrypts them locally

## Encrypted Storage

### How Session Data is Stored

```
~/.grindlog/
├── session.enc    ← Encrypted session cookies (AES-256-GCM)
├── keys.enc       ← Encrypted API keys (AES-256-GCM)
└── .salt          ← Random salt for key derivation (unique per installation)
```

### Encryption Details

| Property | Value |
|----------|-------|
| Algorithm | AES-256-GCM |
| Key Derivation | PBKDF2-SHA512 (100,000 iterations) |
| Key Material | Machine hostname + OS username + local salt |
| IV | Random 16 bytes per encryption |
| Auth Tag | 16 bytes (tamper detection) |

### What This Means

- **Machine-locked:** Encrypted files can only be decrypted on the same machine by the same user
- **Tamper-resistant:** AES-GCM provides authenticated encryption — any modification is detected
- **No master password:** The key is derived from your machine identity, so there's nothing to remember
- **Forward secrecy:** Each encryption uses a fresh random IV

## Data Flow

```
User Login (in visible browser)
    ↓
Session Cookies Extracted (LEETCODE_SESSION + csrftoken)
    ↓
AES-256-GCM Encryption
    ↓
Stored in ~/.grindlog/session.enc
    ↓
Decrypted in-memory only when needed (API calls)
    ↓
Memory cleared after use
```

## What's NOT in config.json

The `config.json` file contains **only non-sensitive settings:**

```json
{
  "leetcode": { "username": "your-username" },
  "github": { "repoName": "...", "githubUsername": "..." },
  "ai": { "provider": "groq" },
  "preferences": { "primaryLanguage": "python" }
}
```

**The following are NEVER stored in config.json:**
- ❌ LEETCODE_SESSION cookie
- ❌ csrftoken cookie
- ❌ API keys (Groq, Gemini, OpenAI)
- ❌ Passwords

## GitHub Actions Safety

GrindLog's CI/CD pipeline does **NOT** perform authenticated session automation.

**What CI does:**
- ✅ Code quality checks
- ✅ Dependency security audit
- ✅ Crypto module verification
- ✅ Config secrets leak detection

**What CI does NOT do:**
- ❌ Store live session cookies in GitHub Secrets
- ❌ Automated cloud authentication
- ❌ Remote session refresh

Session synchronization is always **LOCAL to your machine**.

## Auto-Sync Safety

GrindLog uses **Windows Task Scheduler** (not GitHub Actions) for automated syncing every 6 hours.

**Why local instead of cloud?**
- GitHub Actions would require storing live session cookies in GitHub Secrets
- Those cookies expire every ~14 days, requiring manual updates
- Secrets stored in the cloud increase the attack surface
- Local Task Scheduler uses your encrypted session — nothing leaves your machine

**How auto-sync handles expired sessions:**
- Auto-sync **cannot** open a browser (it runs in the background)
- If the session has expired, it **skips gracefully** and logs a warning
- You then run `grindlog auth` manually to refresh (opens a visible browser)
- Auto-sync resumes on the next 6-hour cycle

## Trust Boundaries

```
┌─────────────────────────────────────────┐
│           YOUR MACHINE (Trusted)        │
│                                         │
│  ┌─────────────┐   ┌────────────────┐   │
│  │  GrindLog   │   │  ~/.grindlog/  │   │
│  │  CLI        │──▶│  (encrypted)   │   │
│  └──────┬──────┘   └────────────────┘   │
│         │                               │
│         ▼                               │
│  ┌──────────────┐                       │
│  │ Your Browser │ ← You control this    │
│  └──────┬───────┘                       │
└─────────┼───────────────────────────────┘
          │
          ▼ (HTTPS only)
   ┌──────────────┐
   │ leetcode.com │ ← Official API only
   └──────────────┘
```

## Vulnerability Reporting

If you discover a security vulnerability, please report it responsibly:

1. **DO NOT** open a public issue
2. Email: [gowdalikhith180@gmail.com](mailto:gowdalikhith180@gmail.com)
3. Include: description, steps to reproduce, potential impact
4. We will respond within 48 hours

## Ethical Usage

GrindLog is intended for:
- ✅ Syncing your own LeetCode solutions
- ✅ Automating your personal workflow
- ✅ Building your coding portfolio

GrindLog is NOT intended for:
- ❌ Accessing other people's accounts
- ❌ Automated code submission
- ❌ Scraping LeetCode at scale
- ❌ Any activity that violates LeetCode's Terms of Service
