# Contributing to GrindLog

Thank you for your interest in contributing! GrindLog is a developer automation tool that prioritizes security and transparency. This guide will help you contribute safely.

## 🚀 Getting Started

### Prerequisites

- **Node.js 18+** (LTS recommended)
- **Microsoft Edge, Chrome, or Brave** (for Interactive Session Refresh)
- A **LeetCode account** with solved problems

### Setup

```bash
# Clone the repository
git clone https://github.com/likhith-gowda-7/GrindLog-s.git
cd GrindLog-s

# Install dependencies
npm install

# Run setup
node src/cli.js setup

# Verify everything works
node src/cli.js doctor
```

## 📁 Project Structure

```
GrindLog-s/
├── src/
│   ├── auth/                  # Authentication & encryption
│   │   ├── crypto.js          # AES-256-GCM encryption
│   │   ├── browser-detector.js # Cross-platform browser detection
│   │   ├── session-manager.js  # Session lifecycle management
│   │   └── session-refresh.js  # Interactive browser auth flow
│   ├── ai/                    # AI explanation generation
│   │   ├── explainer.js       # Multi-provider AI client
│   │   └── prompts.js         # AI prompt templates
│   ├── github/                # GitHub integration
│   │   ├── readme-generator.js # README and stats generation
│   │   └── repo.js            # Git operations
│   ├── leetcode/              # LeetCode API client
│   │   ├── client.js          # GraphQL API wrapper
│   │   ├── parser.js          # Response parsing
│   │   └── queries.js         # GraphQL query definitions
│   ├── sync/                  # Synchronization logic
│   │   ├── importer.js        # Full history import
│   │   ├── syncer.js          # Incremental sync
│   │   ├── explain.js         # AI explanation batch
│   │   └── auto-sync.js       # Scheduled auto-sync script
│   ├── utils/                 # Utilities
│   │   ├── config.js          # Configuration management
│   │   ├── file-helpers.js    # File system utilities
│   │   └── logger.js          # Console output formatting
│   └── cli.js                 # CLI entry point
├── SECURITY.md                # Security model documentation
├── CONTRIBUTING.md            # This file
├── PROJECT_DOCUMENTATION.md   # Architecture documentation
└── README.md                  # Project overview
```

## 🔒 Security Guidelines for Contributors

### CRITICAL: What you MUST follow

1. **Never store credentials in plaintext** — Use `SessionManager` for all sensitive data
2. **Never use headless browsers** — The browser must always be visible to the user
3. **Never capture passwords** — Authentication must be user-controlled
4. **Never add telemetry** — No usage tracking, analytics, or data collection
5. **Never transmit data externally** — All data stays local (except LeetCode API calls)
6. **Always strip sensitive fields** before writing to `config.json`

### Code Review Checklist

When reviewing PRs, verify:
- [ ] No hardcoded secrets or API keys
- [ ] Sensitive data uses `SessionManager` (encrypted storage)
- [ ] No headless browser usage
- [ ] No new external network calls (except documented APIs)
- [ ] No `console.log` with sensitive data
- [ ] Error messages don't expose credentials

## 🎨 Code Style

- **ES Modules** — Use `import/export` (not `require`)
- **JSDoc comments** — Document all public functions
- **Descriptive names** — `fetchSubmissionDetail` not `fetchSD`
- **Error handling** — Always catch and handle errors gracefully
- **Logging** — Use `Logger` class, not raw `console.log`

## 🛠️ Making Changes

### For Bug Fixes

1. Create a branch: `fix/description`
2. Write the fix with clear commit messages
3. Verify: `node src/cli.js doctor`
4. Submit a PR with a description of the bug and fix

### For New Features

1. Open an issue first to discuss the feature
2. Create a branch: `feature/description`
3. Implement with documentation
4. Verify: `node src/cli.js doctor`
5. Submit a PR

### For Documentation

Documentation improvements are always welcome! No issue required — just submit a PR.

## 📋 Commit Messages

Use descriptive, conventional commits:

```
🔒 Improve session encryption key derivation
🔧 Fix browser detection on Linux
📚 Update SECURITY.md with encryption details
✨ Add --dry-run flag to sync command
🐛 Fix race condition in cookie extraction
```

## ❓ Questions?

Open an issue with the `question` label. We're happy to help!
