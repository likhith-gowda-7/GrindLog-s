import { langExtension, langDisplay } from '../utils/file-helpers.js';

/**
 * Parse and normalize submission data from LeetCode API responses.
 */

/**
 * Normalize a submission detail response into a clean object.
 * @param {object} detail - Raw submissionDetails response
 * @returns {object} Normalized submission
 */
function parseSubmissionDetail(detail) {
  if (!detail) return null;

  const question = detail.question || {};
  const langInfo = detail.lang || {};

  return {
    // Problem info
    problemId: question.questionFrontendId || question.questionId || '',
    problemTitle: question.title || '',
    titleSlug: question.titleSlug || '',
    difficulty: question.difficulty || 'Unknown',
    category: question.categoryTitle || '',

    // Submission info
    code: detail.code || '',
    language: langInfo.name || langInfo.verboseName || 'unknown',
    languageDisplay: langDisplay(langInfo.name || ''),
    extension: langExtension(langInfo.name || ''),
    timestamp: parseInt(detail.timestamp, 10) || 0,
    date: detail.timestamp
      ? new Date(parseInt(detail.timestamp, 10) * 1000).toISOString().split('T')[0]
      : '',

    // Metrics
    runtime: detail.runtimeDisplay || detail.runtime || 'N/A',
    runtimePercentile: detail.runtimePercentile
      ? Math.round(parseFloat(detail.runtimePercentile) * 100) / 100
      : null,
    memory: detail.memoryDisplay || detail.memory || 'N/A',
    memoryPercentile: detail.memoryPercentile
      ? Math.round(parseFloat(detail.memoryPercentile) * 100) / 100
      : null,

    // Tags
    tags: (detail.topicTags || question.topicTags || []).map(t => t.name),

    // Status
    statusCode: detail.statusCode,
    isAccepted: detail.statusCode === 10,
  };
}

/**
 * Parse a problem detail response.
 * @param {object} question - Raw question data
 * @returns {object} Normalized problem
 */
function parseProblemDetail(question) {
  if (!question) return null;

  // Parse stats if it's a JSON string
  let stats = {};
  if (question.stats) {
    try {
      stats = typeof question.stats === 'string' ? JSON.parse(question.stats) : question.stats;
    } catch {
      stats = {};
    }
  }

  // Parse similar questions if it's a JSON string
  let similar = [];
  if (question.similarQuestions) {
    try {
      similar =
        typeof question.similarQuestions === 'string'
          ? JSON.parse(question.similarQuestions)
          : question.similarQuestions;
    } catch {
      similar = [];
    }
  }

  return {
    problemId: question.questionFrontendId || question.questionId || '',
    title: question.title || '',
    titleSlug: question.titleSlug || '',
    difficulty: question.difficulty || 'Unknown',
    category: question.categoryTitle || '',
    content: cleanHtmlContent(question.content || ''),
    contentRaw: question.content || '',
    tags: (question.topicTags || []).map(t => t.name),
    likes: question.likes || 0,
    dislikes: question.dislikes || 0,
    acceptanceRate: stats.acRate || 'N/A',
    totalAccepted: stats.totalAcceptedRaw || 0,
    totalSubmissions: stats.totalSubmissionRaw || 0,
    hints: question.hints || [],
    similarQuestions: similar,
    isPaidOnly: question.isPaidOnly || false,
    sampleTestCase: question.sampleTestCase || '',
  };
}

/**
 * Parse a recent submission entry.
 */
function parseRecentSubmission(sub) {
  return {
    id: sub.id,
    title: sub.title || '',
    titleSlug: sub.titleSlug || '',
    timestamp: parseInt(sub.timestamp, 10) || 0,
    date: sub.timestamp
      ? new Date(parseInt(sub.timestamp, 10) * 1000).toISOString().split('T')[0]
      : '',
    language: sub.lang || 'unknown',
    status: sub.statusDisplay || '',
  };
}

/**
 * Deduplicate submissions: keep the best accepted submission per problem per language.
 * "Best" = latest accepted submission.
 * @param {object[]} submissions - Array of normalized submissions
 * @returns {object[]} Deduplicated submissions
 */
function deduplicateSubmissions(submissions) {
  const map = new Map();

  for (const sub of submissions) {
    const key = `${sub.titleSlug}__${sub.language}`;
    const existing = map.get(key);

    if (!existing || sub.timestamp > existing.timestamp) {
      map.set(key, sub);
    }
  }

  return Array.from(map.values());
}

/**
 * Group submissions by topic.
 * Each submission may belong to multiple topics.
 * Returns a map: topic -> [submissions]
 */
function groupByTopic(submissions) {
  const groups = new Map();

  for (const sub of submissions) {
    const topics = sub.tags && sub.tags.length > 0 ? sub.tags : ['Uncategorized'];
    // Use only the first (primary) tag for folder organization
    const primary = topics[0];
    if (!groups.has(primary)) {
      groups.set(primary, []);
    }
    groups.get(primary).push(sub);
  }

  return groups;
}

/**
 * Group submissions by difficulty.
 */
function groupByDifficulty(submissions) {
  const groups = { Easy: [], Medium: [], Hard: [] };
  for (const sub of submissions) {
    const d = sub.difficulty || 'Unknown';
    if (!groups[d]) groups[d] = [];
    groups[d].push(sub);
  }
  return groups;
}

/**
 * Sort submissions by problem ID (numeric).
 */
function sortByProblemId(submissions) {
  return [...submissions].sort((a, b) => {
    const numA = parseInt(a.problemId, 10) || 0;
    const numB = parseInt(b.problemId, 10) || 0;
    return numA - numB;
  });
}

/**
 * Clean HTML content from problem descriptions.
 * Converts common HTML to Markdown.
 */
function cleanHtmlContent(html) {
  if (!html) return '';

  return html
    // Remove <p> tags, keep content
    .replace(/<p>/gi, '')
    .replace(/<\/p>/gi, '\n\n')
    // Bold
    .replace(/<strong>/gi, '**')
    .replace(/<\/strong>/gi, '**')
    .replace(/<b>/gi, '**')
    .replace(/<\/b>/gi, '**')
    // Italic
    .replace(/<em>/gi, '*')
    .replace(/<\/em>/gi, '*')
    .replace(/<i>/gi, '*')
    .replace(/<\/i>/gi, '*')
    // Code
    .replace(/<code>/gi, '`')
    .replace(/<\/code>/gi, '`')
    .replace(/<pre>/gi, '```\n')
    .replace(/<\/pre>/gi, '\n```\n')
    // Lists
    .replace(/<ul>/gi, '')
    .replace(/<\/ul>/gi, '')
    .replace(/<ol>/gi, '')
    .replace(/<\/ol>/gi, '')
    .replace(/<li>/gi, '- ')
    .replace(/<\/li>/gi, '\n')
    // Line breaks
    .replace(/<br\s*\/?>/gi, '\n')
    // Superscript (common in complexity descriptions)
    .replace(/<sup>/gi, '^')
    .replace(/<\/sup>/gi, '')
    // Subscript
    .replace(/<sub>/gi, '_')
    .replace(/<\/sub>/gi, '')
    // Images
    .replace(/<img[^>]*src="([^"]*)"[^>]*>/gi, '![]($1)')
    // Links
    .replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)')
    // Remove remaining HTML tags
    .replace(/<[^>]+>/g, '')
    // Decode HTML entities
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&le;/g, '≤')
    .replace(/&ge;/g, '≥')
    // Clean up multiple newlines
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Compute stats summary from a list of submissions.
 */
function computeStats(submissions) {
  const total = submissions.length;
  const byDiff = groupByDifficulty(submissions);
  const easy = byDiff.Easy?.length || 0;
  const medium = byDiff.Medium?.length || 0;
  const hard = byDiff.Hard?.length || 0;

  // Unique topics
  const topicSet = new Set();
  submissions.forEach(s => (s.tags || []).forEach(t => topicSet.add(t)));

  // Unique languages
  const langSet = new Set();
  submissions.forEach(s => langSet.add(s.languageDisplay || s.language));

  return {
    total,
    easy,
    medium,
    hard,
    topics: Array.from(topicSet).sort(),
    topicCount: topicSet.size,
    languages: Array.from(langSet).sort(),
    languageCount: langSet.size,
  };
}

export {
  parseSubmissionDetail,
  parseProblemDetail,
  parseRecentSubmission,
  deduplicateSubmissions,
  groupByTopic,
  groupByDifficulty,
  sortByProblemId,
  cleanHtmlContent,
  computeStats,
};
