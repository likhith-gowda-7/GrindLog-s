import fetch from 'node-fetch';
import { Logger } from '../utils/logger.js';
import {
  USER_PROFILE_QUERY,
  RECENT_SUBMISSIONS_QUERY,
  SUBMISSION_LIST_QUERY,
  SUBMISSION_DETAIL_QUERY,
  QUESTION_DETAIL_QUERY,
  ALL_PROBLEMS_QUERY,
  USER_PROGRESS_QUERY,
} from './queries.js';

const LEETCODE_GRAPHQL_URL = 'https://leetcode.com/graphql/';
const DEFAULT_RATE_LIMIT_MS = 600; // ~1.7 requests/second (safe)

class LeetCodeClient {
  /**
   * @param {object} options
   * @param {string} options.username - LeetCode username
   * @param {string} options.session - LEETCODE_SESSION cookie value
   * @param {string} options.csrfToken - csrftoken cookie value
   * @param {number} [options.rateLimitMs] - Delay between requests in ms
   */
  constructor({ username, session, csrfToken, rateLimitMs = DEFAULT_RATE_LIMIT_MS }) {
    this.username = username;
    this.session = session;
    this.csrfToken = csrfToken;
    this.rateLimitMs = rateLimitMs;
    this._lastRequestTime = 0;
  }

  /**
   * Build the headers for authenticated requests.
   */
  _getHeaders() {
    return {
      'Content-Type': 'application/json',
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      Referer: 'https://leetcode.com/',
      Origin: 'https://leetcode.com',
      'x-csrftoken': this.csrfToken,
      Cookie: `LEETCODE_SESSION=${this.session}; csrftoken=${this.csrfToken};`,
    };
  }

  /**
   * Rate-limited GraphQL request.
   */
  async _query(query, variables = {}) {
    // Enforce rate limit
    const now = Date.now();
    const elapsed = now - this._lastRequestTime;
    if (elapsed < this.rateLimitMs) {
      await this._sleep(this.rateLimitMs - elapsed);
    }
    this._lastRequestTime = Date.now();

    const response = await fetch(LEETCODE_GRAPHQL_URL, {
      method: 'POST',
      headers: this._getHeaders(),
      body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      if (response.status === 403) {
        throw new Error(
          'LeetCode returned 403 Forbidden. Your session cookies may have expired.\n' +
            'Run `grindlog setup` to refresh your cookies.'
        );
      }
      if (response.status === 429) {
        throw new Error(
          'LeetCode rate limit hit (429). Please wait a few minutes and try again.'
        );
      }
      throw new Error(`LeetCode API error ${response.status}: ${text.slice(0, 200)}`);
    }

    const json = await response.json();

    if (json.errors) {
      throw new Error(`GraphQL errors: ${JSON.stringify(json.errors)}`);
    }

    return json.data;
  }

  /**
   * Retry wrapper with exponential backoff.
   */
  async _queryWithRetry(query, variables = {}, maxRetries = 3) {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await this._query(query, variables);
      } catch (err) {
        if (attempt === maxRetries) throw err;
        if (err.message.includes('403') || err.message.includes('Forbidden')) throw err; // Don't retry auth errors
        const delay = Math.pow(2, attempt) * 1000;
        Logger.warn(`Request failed, retrying in ${delay / 1000}s... (${err.message})`);
        await this._sleep(delay);
      }
    }
  }

  // ─────────────────────────────────────────────────
  // Public API Methods
  // ─────────────────────────────────────────────────

  /**
   * Fetch user profile stats (public, no auth needed).
   */
  async fetchProfile() {
    const data = await this._queryWithRetry(USER_PROFILE_QUERY, {
      username: this.username,
    });
    return data.matchedUser;
  }

  /**
   * Fetch recent accepted submissions.
   * @param {number} limit - Number of submissions to fetch
   */
  async fetchRecentSubmissions(limit = 20) {
    const data = await this._queryWithRetry(RECENT_SUBMISSIONS_QUERY, {
      username: this.username,
      limit,
    });
    return data.recentAcSubmissionList || [];
  }

  /**
   * Fetch all accepted submissions for a specific problem.
   * @param {string} titleSlug - Problem slug (e.g., "two-sum")
   */
  async fetchProblemSubmissions(titleSlug) {
    const allSubmissions = [];
    let offset = 0;
    const limit = 20;
    let hasNext = true;

    while (hasNext) {
      const data = await this._queryWithRetry(SUBMISSION_LIST_QUERY, {
        offset,
        limit,
        slug: titleSlug,
      });

      const list = data.questionSubmissionList;
      if (!list || !list.submissions || list.submissions.length === 0) break;

      allSubmissions.push(...list.submissions);
      hasNext = list.hasNext;
      offset += limit;
    }

    return allSubmissions;
  }

  /**
   * Fetch detailed submission data (includes code).
   * @param {number|string} submissionId
   */
  async fetchSubmissionDetail(submissionId) {
    const data = await this._queryWithRetry(SUBMISSION_DETAIL_QUERY, {
      submissionId: parseInt(submissionId, 10),
    });
    return data.submissionDetails;
  }

  /**
   * Fetch problem details by slug.
   * @param {string} titleSlug
   */
  async fetchProblemDetail(titleSlug) {
    const data = await this._queryWithRetry(QUESTION_DETAIL_QUERY, {
      titleSlug,
    });
    return data.question;
  }

  /**
   * Fetch all problems (paginated).
   * Useful for mapping problem numbers to slugs.
   * @param {number} [limit] - Problems per page (max 100)
   */
  async fetchAllProblems(limit = 100) {
    const allProblems = [];
    let skip = 0;
    let total = Infinity;

    while (skip < total) {
      const data = await this._queryWithRetry(ALL_PROBLEMS_QUERY, {
        categorySlug: '',
        limit,
        skip,
        filters: {},
      });

      const list = data.problemsetQuestionList;
      total = list.total;
      allProblems.push(...list.questions);
      skip += limit;

      if (list.questions.length === 0) break;
    }

    return allProblems;
  }

  /**
   * Fetch all problems the user has solved (AC status).
   * Uses the problemset API with status filter.
   * This is the reliable way to get ALL solved problems (not capped at 20).
   * @param {number} [limit] - Problems per page
   */
  async fetchSolvedProblems(limit = 100) {
    const allSolved = [];
    let skip = 0;
    let total = Infinity;

    while (skip < total) {
      const data = await this._queryWithRetry(ALL_PROBLEMS_QUERY, {
        categorySlug: '',
        limit,
        skip,
        filters: { status: 'AC' },
      });

      const list = data.problemsetQuestionList;
      total = list.total;
      allSolved.push(...list.questions);
      skip += limit;

      if (list.questions.length === 0) break;
    }

    return allSolved;
  }

  /**
   * Fetch user's solved questions list (requires auth for some data).
   */
  async fetchUserProgress() {
    try {
      const data = await this._queryWithRetry(USER_PROGRESS_QUERY, {
        username: this.username,
        status: 'AC',
      });
      return {
        stats: data.matchedUser?.submitStatsGlobal?.acSubmissionNum || [],
        questions: data.userProfileQuestions?.questions || [],
      };
    } catch {
      // Fallback: some LeetCode API versions don't support this query
      // Use recent submissions instead
      return null;
    }
  }

  /**
   * Test connection by fetching profile.
   * Returns true if connection works.
   */
  async testConnection() {
    try {
      const profile = await this.fetchProfile();
      return !!profile;
    } catch {
      return false;
    }
  }

  /**
   * Sleep utility.
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export { LeetCodeClient };
