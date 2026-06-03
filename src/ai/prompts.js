/**
 * Prompt templates for AI explanation generation.
 * Designed for Google Gemini and OpenAI GPT models.
 */

/**
 * Generate the system prompt for explanation generation.
 */
export function getSystemPrompt() {
  return `You are a senior software engineer and competitive programming expert. Your role is to generate clear, concise, and educational explanations for LeetCode solutions.

Your explanations should be:
- Beginner-friendly but technically precise
- Focused on the "why" behind the approach, not just the "what"
- Include time and space complexity with clear justification
- Highlight the key insight or "aha moment" that makes the solution click

Format your response in Markdown with the following sections:
1. **Intuition** - Why this approach works (2-3 sentences)
2. **Approach** - Step-by-step algorithm description (numbered list)
3. **Time Complexity** - Big-O with brief justification
4. **Space Complexity** - Big-O with brief justification
5. **Key Insight** - The most important takeaway (1-2 sentences)

Do NOT include the problem statement or code in your response — only the explanation.
Keep the total response under 300 words.`;
}

/**
 * Generate the user prompt for a specific solution.
 * @param {object} options
 * @param {string} options.title - Problem title
 * @param {string} options.difficulty - Problem difficulty
 * @param {string} options.description - Problem description (Markdown)
 * @param {string} options.code - Solution code
 * @param {string} options.language - Programming language
 * @param {string[]} options.tags - Problem tags/topics
 */
export function getSolutionPrompt({ title, difficulty, description, code, language, tags }) {
  const tagStr = tags && tags.length > 0 ? tags.join(', ') : 'N/A';
  const descSnippet = description ? description.slice(0, 800) : 'No description available.';

  return `Explain the following LeetCode solution:

**Problem:** ${title}
**Difficulty:** ${difficulty}
**Topics:** ${tagStr}

**Problem Description (excerpt):**
${descSnippet}

**Solution (${language}):**
\`\`\`${language.toLowerCase()}
${code}
\`\`\`

Generate the explanation following the specified format (Intuition, Approach, Time Complexity, Space Complexity, Key Insight).`;
}

/**
 * Generate a batch summary prompt for README stats.
 */
export function getBatchSummaryPrompt(problemTitles) {
  return `Given these LeetCode problems I've solved: ${problemTitles.join(', ')}

Summarize my strengths and areas of focus in 2-3 sentences. Be encouraging but realistic.`;
}
