import { computeStats, groupByTopic, sortByProblemId } from '../leetcode/parser.js';
import { langDisplay } from '../utils/file-helpers.js';

/**
 * Generate the main README.md for the repository.
 * @param {object[]} submissions - All normalized submissions
 * @param {object} config - User config
 * @returns {string} Markdown content
 */
function generateMainReadme(submissions, config) {
  const stats = computeStats(submissions);
  const sorted = sortByProblemId(submissions);
  const topicGroups = groupByTopic(submissions);
  const lcUsername = config.leetcode?.username || 'User';
  const ghUsername = config.github?.githubUsername || lcUsername;
  const repoName = config.github?.repoName || 'GrindLog-s';

  const sections = [
    generateHeader(lcUsername, ghUsername, repoName, stats),
    generateBadges(stats, lcUsername),
    generateStatsSection(stats),
    generateTopicCoverage(topicGroups),
    generateRecentActivity(sorted),
    generateProblemIndex(sorted),
    generateFooter(ghUsername, repoName),
  ];

  return sections.join('\n\n---\n\n');
}

/**
 * Header section with title and description.
 */
function generateHeader(lcUsername, ghUsername, repoName, stats) {
  return `<div align="center">

# 🧠 GrindLog — LeetCode Solutions

### [${lcUsername}](https://leetcode.com/u/${lcUsername}/)'s DSA Journey

*${stats.total} problems solved across ${stats.topicCount} topics in ${stats.languageCount} language(s)*

*Auto-synced from LeetCode using [GrindLog](https://github.com/${ghUsername}/${repoName})*

![LeetCode Stats](https://leetcard.jacoblin.cool/${lcUsername}?theme=dark&font=Nunito&ext=heatmap)

</div>`;
}

/**
 * Shields.io badges.
 */
function generateBadges(stats, username) {
  const badges = [
    `![Total Solved](https://img.shields.io/badge/Total_Solved-${stats.total}-brightgreen?style=for-the-badge&logo=leetcode&logoColor=white)`,
    `![Easy](https://img.shields.io/badge/Easy-${stats.easy}-00b8a3?style=for-the-badge)`,
    `![Medium](https://img.shields.io/badge/Medium-${stats.medium}-ffc01e?style=for-the-badge)`,
    `![Hard](https://img.shields.io/badge/Hard-${stats.hard}-ff375f?style=for-the-badge)`,
  ];

  // Add language badges
  for (const lang of stats.languages.slice(0, 3)) {
    const color = getLanguageColor(lang);
    badges.push(
      `![${lang}](https://img.shields.io/badge/${encodeURIComponent(lang)}-${color}?style=for-the-badge&logo=${getLanguageLogo(lang)}&logoColor=white)`
    );
  }

  return `<div align="center">\n\n${badges.join(' ')}\n\n</div>`;
}

/**
 * Stats section with counts and progress bars.
 */
function generateStatsSection(stats) {
  const easyPct = stats.total > 0 ? Math.round((stats.easy / stats.total) * 100) : 0;
  const medPct = stats.total > 0 ? Math.round((stats.medium / stats.total) * 100) : 0;
  const hardPct = stats.total > 0 ? Math.round((stats.hard / stats.total) * 100) : 0;

  return `## 📊 Statistics

| Difficulty | Solved | Percentage |
|:----------:|:------:|:----------:|
| 🟢 Easy | ${stats.easy} | ${makeProgressBar(easyPct)} ${easyPct}% |
| 🟡 Medium | ${stats.medium} | ${makeProgressBar(medPct)} ${medPct}% |
| 🔴 Hard | ${stats.hard} | ${makeProgressBar(hardPct)} ${hardPct}% |
| **Total** | **${stats.total}** | |`;
}

/**
 * Topic coverage grid.
 */
function generateTopicCoverage(topicGroups) {
  const topics = Array.from(topicGroups.entries())
    .map(([topic, subs]) => ({ topic, count: subs.length }))
    .sort((a, b) => b.count - a.count);

  if (topics.length === 0) return '';

  let md = '## 🗂️ Topic Coverage\n\n';
  md += '| Topic | Problems | Status |\n';
  md += '|:------|:--------:|:------:|\n';

  for (const { topic, count } of topics) {
    const status = count >= 10 ? '✅ Strong' : count >= 5 ? '🔄 Building' : '🌱 Starting';
    md += `| ${topic} | ${count} | ${status} |\n`;
  }

  return md;
}

/**
 * Recent activity — last 15 problems solved.
 */
function generateRecentActivity(sorted) {
  // Sort by timestamp (most recent first)
  const recent = [...sorted]
    .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
    .slice(0, 15);

  if (recent.length === 0) return '';

  let md = '## 🕐 Recent Activity\n\n';
  md += '| # | Problem | Difficulty | Language | Date |\n';
  md += '|:-:|:--------|:----------:|:--------:|:----:|\n';

  for (const sub of recent) {
    const diffEmoji = getDifficultyEmoji(sub.difficulty);
    const link = `[${sub.problemTitle}](https://leetcode.com/problems/${sub.titleSlug}/)`;
    md += `| ${sub.problemId} | ${link} | ${diffEmoji} ${sub.difficulty} | ${langDisplay(sub.language)} | ${sub.date} |\n`;
  }

  return md;
}

/**
 * Full problem index — sortable table of all problems.
 */
function generateProblemIndex(sorted) {
  if (sorted.length === 0) return '';

  let md = '<details>\n<summary>\n\n## 📋 Complete Problem Index (click to expand)\n\n</summary>\n\n';
  md += '| # | Problem | Difficulty | Topics | Language | Runtime | Memory |\n';
  md += '|:-:|:--------|:----------:|:-------|:--------:|:-------:|:------:|\n';

  for (const sub of sorted) {
    const diffEmoji = getDifficultyEmoji(sub.difficulty);
    const link = `[${sub.problemTitle}](https://leetcode.com/problems/${sub.titleSlug}/)`;
    const tags = (sub.tags || []).slice(0, 3).join(', ');
    const lang = langDisplay(sub.language);
    md += `| ${sub.problemId} | ${link} | ${diffEmoji} ${sub.difficulty} | ${tags} | ${lang} | ${sub.runtime || '-'} | ${sub.memory || '-'} |\n`;
  }

  md += '\n</details>';
  return md;
}

/**
 * Footer with generation info.
 */
function generateFooter(ghUsername, repoName) {
  const date = new Date().toISOString().split('T')[0];
  return `<div align="center">

---

*🔄 Auto-generated by [GrindLog](https://github.com/${ghUsername}/${repoName}) on ${date}*

*⭐ Star this repo if you find it helpful!*

</div>`;
}

/**
 * Generate a per-problem README.
 * @param {object} submission - Normalized submission data
 * @param {object} [problemDetail] - Problem detail (description, hints)
 * @param {string} [explanation] - AI-generated explanation
 * @returns {string} Markdown content
 */
function generateProblemReadme(submission, problemDetail = null, explanation = null) {
  const {
    problemId,
    problemTitle,
    titleSlug,
    difficulty,
    tags,
    runtime,
    runtimePercentile,
    memory,
    memoryPercentile,
    language,
    date,
  } = submission;

  const sections = [];

  // Title
  sections.push(`# ${problemId}. ${problemTitle}\n`);

  // Badges
  const diffColor = difficulty === 'Easy' ? '00b8a3' : difficulty === 'Medium' ? 'ffc01e' : 'ff375f';
  const badges = [
    `![Difficulty](https://img.shields.io/badge/Difficulty-${difficulty}-${diffColor})`,
    `![Language](https://img.shields.io/badge/Language-${encodeURIComponent(langDisplay(language))}-blue)`,
  ];
  for (const tag of (tags || []).slice(0, 4)) {
    badges.push(`![${tag}](https://img.shields.io/badge/${encodeURIComponent(tag).replace(/-/g, '--')}-purple)`);
  }
  sections.push(badges.join(' '));

  // LeetCode link
  sections.push(
    `\n🔗 [View on LeetCode](https://leetcode.com/problems/${titleSlug}/)\n`
  );

  // Problem description
  if (problemDetail?.content) {
    sections.push(`## 📝 Problem Description\n\n${problemDetail.content}`);
  }

  // AI Explanation
  if (explanation) {
    sections.push(`## 🧠 Solution Explanation\n\n${explanation}`);
  }

  // Metrics
  const metricsRows = [];
  if (runtime && runtime !== 'N/A') {
    const rp = runtimePercentile ? ` (Beats ${runtimePercentile}%)` : '';
    metricsRows.push(`| ⏱️ Runtime | ${runtime}${rp} |`);
  }
  if (memory && memory !== 'N/A') {
    const mp = memoryPercentile ? ` (Beats ${memoryPercentile}%)` : '';
    metricsRows.push(`| 💾 Memory | ${memory}${mp} |`);
  }
  metricsRows.push(`| 📅 Solved | ${date} |`);
  metricsRows.push(`| 💻 Language | ${langDisplay(language)} |`);

  sections.push(
    `## 📊 Metrics\n\n| Metric | Value |\n|:-------|:------|\n${metricsRows.join('\n')}`
  );

  return sections.join('\n\n');
}

// ─────────────────────────────────────────────────
// Helper functions
// ─────────────────────────────────────────────────

function makeProgressBar(pct) {
  const filled = Math.round(pct / 10);
  const empty = 10 - filled;
  return '🟩'.repeat(filled) + '⬜'.repeat(empty);
}

function getDifficultyEmoji(diff) {
  if (diff === 'Easy') return '🟢';
  if (diff === 'Medium') return '🟡';
  if (diff === 'Hard') return '🔴';
  return '⚪';
}

function getLanguageColor(lang) {
  const colors = {
    Python: '3776AB',
    Java: 'ED8B00',
    'C++': '00599C',
    JavaScript: 'F7DF1E',
    TypeScript: '3178C6',
    Go: '00ADD8',
    Rust: 'DEA584',
    Ruby: 'CC342D',
    Swift: 'FA7343',
    Kotlin: '7F52FF',
    'C#': '239120',
  };
  return colors[lang] || '555555';
}

function getLanguageLogo(lang) {
  const logos = {
    Python: 'python',
    Java: 'openjdk',
    'C++': 'cplusplus',
    JavaScript: 'javascript',
    TypeScript: 'typescript',
    Go: 'go',
    Rust: 'rust',
    Ruby: 'ruby',
    Swift: 'swift',
    Kotlin: 'kotlin',
    'C#': 'csharp',
  };
  return logos[lang] || 'code';
}

export { generateMainReadme, generateProblemReadme };
