/**
 * GraphQL query definitions for LeetCode's internal API.
 * These interact with https://leetcode.com/graphql/
 */

/**
 * Fetch user profile stats — solved counts by difficulty.
 */
export const USER_PROFILE_QUERY = `
query userProblemsSolved($username: String!) {
  matchedUser(username: $username) {
    username
    profile {
      realName
      ranking
      reputation
    }
    submitStatsGlobal {
      acSubmissionNum {
        difficulty
        count
      }
    }
  }
}`;

/**
 * Fetch the list of all problems solved by a user (public data).
 * Returns problem slug, difficulty, and acceptance rate.
 */
export const USER_SOLVED_PROBLEMS_QUERY = `
query userSolvedProblems($username: String!) {
  matchedUser(username: $username) {
    submitStatsGlobal {
      acSubmissionNum {
        difficulty
        count
      }
    }
  }
  allQuestionsCount {
    difficulty
    count
  }
}`;

/**
 * Fetch recent accepted submissions for authenticated user.
 * Requires LEETCODE_SESSION cookie.
 */
export const RECENT_SUBMISSIONS_QUERY = `
query recentAcSubmissions($username: String!, $limit: Int!) {
  recentAcSubmissionList(username: $username, limit: $limit) {
    id
    title
    titleSlug
    timestamp
    statusDisplay
    lang
  }
}`;

/**
 * Fetch submission list with pagination.
 * Requires authentication for your own submissions.
 */
export const SUBMISSION_LIST_QUERY = `
query submissionList($offset: Int!, $limit: Int!, $slug: String!) {
  questionSubmissionList(
    offset: $offset
    limit: $limit
    questionSlug: $slug
    status: 10
  ) {
    lastKey
    hasNext
    submissions {
      id
      title
      titleSlug
      status
      statusDisplay
      lang
      langName
      runtime
      timestamp
      url
      memory
    }
  }
}`;

/**
 * Fetch detailed submission data including code.
 * Requires authentication.
 */
export const SUBMISSION_DETAIL_QUERY = `
query submissionDetails($submissionId: Int!) {
  submissionDetails(submissionId: $submissionId) {
    runtime
    runtimeDisplay
    runtimePercentile
    runtimeDistribution
    memory
    memoryDisplay
    memoryPercentile
    code
    timestamp
    statusCode
    lang {
      name
      verboseName
    }
    question {
      questionId
      titleSlug
      title
      questionFrontendId
      difficulty
      categoryTitle
    }
    notes
    topicTags {
      name
      slug
    }
    runtimeError
    compileError
    lastTestcase
  }
}`;

/**
 * Fetch problem details — description, tags, difficulty, etc.
 */
export const QUESTION_DETAIL_QUERY = `
query questionData($titleSlug: String!) {
  question(titleSlug: $titleSlug) {
    questionId
    questionFrontendId
    title
    titleSlug
    content
    difficulty
    likes
    dislikes
    categoryTitle
    topicTags {
      name
      slug
    }
    stats
    hints
    similarQuestions
    sampleTestCase
    isPaidOnly
  }
}`;

/**
 * Fetch all problems list (for mapping IDs to slugs).
 */
export const ALL_PROBLEMS_QUERY = `
query problemsetQuestionList($categorySlug: String, $limit: Int, $skip: Int, $filters: QuestionListFilterInput) {
  problemsetQuestionList: questionList(
    categorySlug: $categorySlug
    limit: $limit
    skip: $skip
    filters: $filters
  ) {
    total: totalNum
    questions: data {
      questionId
      questionFrontendId
      title
      titleSlug
      difficulty
      topicTags {
        name
        slug
      }
      isPaidOnly
      status
    }
  }
}`;

/**
 * Fetch user's solved questions list.
 */
export const USER_PROGRESS_QUERY = `
query userProfileQuestions($username: String!, $status: String!) {
  matchedUser(username: $username) {
    submitStatsGlobal {
      acSubmissionNum {
        difficulty
        count
      }
    }
  }
  userProfileQuestions(username: $username, status: $status) {
    questions {
      questionId
      questionFrontendId
      title
      titleSlug
      difficulty
      topicTags {
        name
      }
      lastSubmittedAt
      status
    }
  }
}`;
