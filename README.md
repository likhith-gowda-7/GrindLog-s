<div align="center">

# 🧠 GrindLog

### Automate your LeetCode → GitHub workflow

*Sync your LeetCode solutions to a beautifully structured GitHub repository — automatically.*

![Node.js](https://img.shields.io/badge/Node.js-20+-339933?style=for-the-badge&logo=node.js&logoColor=white)
![LeetCode](https://img.shields.io/badge/LeetCode-735_Solved-FFA116?style=for-the-badge&logo=leetcode&logoColor=white)
![Groq](https://img.shields.io/badge/Groq-AI-FF6B35?style=for-the-badge&logo=groq&logoColor=white)
![GitHub Actions](https://img.shields.io/badge/GitHub_Actions-2088FF?style=for-the-badge&logo=github-actions&logoColor=white)

**Profile:** [D_M_Likhith](https://leetcode.com/u/D_M_Likhith/) · **Solutions:** [Leetcode_Solutions-GrindLog-s](https://github.com/likhith-gowda-7/Leetcode_Solutions-GrindLog-s)

</div>

---

## ✨ Features

- 🔄 **Auto-sync** — Fetches new LeetCode submissions and pushes to GitHub
- 📁 **Smart organization** — Problems organized by topic (Arrays, DP, Trees, etc.)
- 🧠 **AI explanations** — Auto-generates intuition, approach, and complexity analysis via Groq (free, no billing)
- 📊 **Beautiful READMEs** — Badges, stats, progress bars, LeetCode heatmap card, and problem index
- 📥 **Bulk import** — Import your entire LeetCode history (735+ problems) in one command
- ⏰ **GitHub Actions** — Runs every 6 hours automatically
- 🏷️ **Full metrics** — Runtime, memory, percentiles, difficulty, tags

## 🚀 Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Run setup

```bash
node src/cli.js setup
```

This will ask for:
- Your **LeetCode username** (pre-filled: `D_M_Likhith`)
- Your **LEETCODE_SESSION** cookie (from browser DevTools)
- Your **csrftoken** cookie
- Optional: **Gemini API key** for AI explanations

### 3. Import your history

```bash
# Test with a small batch first
node src/cli.js import --limit 10

# Then import everything
node src/cli.js import
```

### 4. Check your stats

```bash
node src/cli.js stats
```

---

## 📋 Commands

| Command | Description |
|---------|-------------|
| `node src/cli.js setup` | Interactive configuration wizard |
| `node src/cli.js stats` | Show your LeetCode progress |
| `node src/cli.js import` | Bulk import ALL past submissions |
| `node src/cli.js import --dry-run` | Preview import without writing files |
| `node src/cli.js import --skip-ai` | Import without AI explanations |
| `node src/cli.js import --limit 10` | Import only 10 problems (for testing) |
| `node src/cli.js sync` | Sync new submissions since last sync |
| `node src/cli.js sync --push` | Sync and push to GitHub |
| `node src/cli.js explain` | Add AI explanations to all solutions |
| `node src/cli.js explain --limit 10` | Explain only 10 problems (for testing) |
| `node src/cli.js refresh-cookies` | Update expired LeetCode cookies |

---

## 🍪 Getting Your LeetCode Cookies

1. Go to [leetcode.com](https://leetcode.com) and log in
2. Open **DevTools** (F12 or Ctrl+Shift+I)
3. Go to **Application** → **Cookies** → `leetcode.com`
4. Copy the values for:
   - `LEETCODE_SESSION`
   - `csrftoken`

> ⚠️ Cookies expire every ~2 weeks. Run `node src/cli.js refresh-cookies` when they expire.

---

## 🤖 AI Explanations (Optional)

GrindLog can auto-generate explanations using **Groq** (100% free, no credit card, no billing risk).

1. Get a free API key at [console.groq.com](https://console.groq.com)
2. Enter it during `setup`

Supported providers: **Groq** (recommended), Gemini, OpenAI

Each explanation includes:
- **Intuition** — Why the approach works
- **Approach** — Step-by-step algorithm
- **Time & Space Complexity** with justification
- **Key Insight** — The "aha" moment

---

## 📁 Output Structure

```
output/
├── README.md                           # Auto-generated with stats + heatmap + badges
├── Arrays/
│   ├── 0001-Two-Sum/
│   │   ├── README.md                   # Problem description + AI explanation
│   │   └── solution.py                 # Your accepted code
│   └── 0053-Maximum-Subarray/
│       ├── README.md
│       └── solution.py
├── Dynamic-Programming/
│   └── 0121-Best-Time-to-Buy-and-Sell-Stock/
│       ├── README.md
│       └── solution.py
├── Trees/
│   └── ...
└── .gitignore
```

---

## ⚙️ GitHub Actions (Auto-Sync)

The included workflow runs every 6 hours to sync new submissions.

### Setup:

1. Push this project to GitHub
2. Go to **Settings** → **Secrets and variables** → **Actions**
3. Add these secrets:

| Secret | Value |
|--------|-------|
| `LEETCODE_SESSION` | Your LEETCODE_SESSION cookie |
| `LEETCODE_CSRF_TOKEN` | Your csrftoken cookie |
| `LEETCODE_USERNAME` | `D_M_Likhith` |
| `GEMINI_API_KEY` | Your Gemini API key (optional) |

The workflow will automatically sync and commit new solutions!

---

## 🛠️ Tech Stack

| Technology | Purpose |
|------------|---------|
| Node.js | Runtime |
| LeetCode GraphQL API | Fetch submissions & problem data |
| Groq (Llama 3.1) | AI-powered solution explanations (free) |
| simple-git | Git operations |
| Commander.js | CLI framework |
| GitHub Actions | Scheduled automation |

---

## 📄 License

MIT
