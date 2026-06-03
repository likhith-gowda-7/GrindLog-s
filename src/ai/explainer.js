import { GoogleGenerativeAI } from '@google/generative-ai';
import { getSystemPrompt, getSolutionPrompt } from './prompts.js';
import { Logger } from '../utils/logger.js';
import { readFile, writeFile, fileExists } from '../utils/file-helpers.js';
import path from 'path';

const GEMINI_RATE_LIMIT_MS = 4200; // ~14 RPM to stay under 15 RPM free tier
const GROQ_RATE_LIMIT_MS = 4500;   // ~13 RPM to safely stay under free tier limits
const OPENAI_RATE_LIMIT_MS = 1000;

class Explainer {
  /**
   * @param {object} options
   * @param {string} options.provider - 'gemini', 'openai', or 'groq'
   * @param {string} [options.geminiApiKey] - Gemini API key
   * @param {string} [options.openaiApiKey] - OpenAI API key
   * @param {string} [options.groqApiKey] - Groq API key
   * @param {string} options.cacheDir - Directory for cached explanations
   */
  constructor({ provider = 'groq', geminiApiKey = '', openaiApiKey = '', groqApiKey = '', cacheDir = '' }) {
    this.provider = provider;
    this.geminiApiKey = geminiApiKey;
    this.openaiApiKey = openaiApiKey;
    this.groqApiKey = groqApiKey;
    this.cacheDir = cacheDir;
    this._lastRequestTime = 0;

    if (provider === 'gemini' && geminiApiKey) {
      this._genAI = new GoogleGenerativeAI(geminiApiKey);
      this._model = this._genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
    }
  }

  /**
   * Check if the explainer is configured and ready.
   */
  isReady() {
    if (this.provider === 'gemini') return !!this._model;
    if (this.provider === 'openai') return !!this.openaiApiKey;
    if (this.provider === 'groq') return !!this.groqApiKey;
    return false;
  }

  /**
   * Generate an explanation for a solution.
   * Uses cache if available.
   *
   * @param {object} options
   * @param {string} options.title - Problem title
   * @param {string} options.titleSlug - Problem slug (for caching)
   * @param {string} options.difficulty - Problem difficulty
   * @param {string} options.description - Problem description
   * @param {string} options.code - Solution code
   * @param {string} options.language - Programming language
   * @param {string[]} options.tags - Problem tags
   * @returns {string|null} Markdown explanation or null on failure
   */
  async generateExplanation({ title, titleSlug, difficulty, description, code, language, tags }) {
    // Check cache first
    const cached = await this._getCached(titleSlug);
    if (cached) return cached;

    if (!this.isReady()) {
      return null;
    }

    try {
      const prompt = getSolutionPrompt({ title, difficulty, description, code, language, tags });
      let explanation;

      if (this.provider === 'gemini') {
        explanation = await this._callGemini(prompt);
      } else if (this.provider === 'openai') {
        explanation = await this._callOpenAI(prompt);
      } else if (this.provider === 'groq') {
        explanation = await this._callGroq(prompt);
      }

      if (explanation) {
        // Cache the result
        await this._setCached(titleSlug, explanation);
      }

      return explanation;
    } catch (err) {
      Logger.warn(`AI explanation failed for "${title}": ${err.message}`);
      return null;
    }
  }

  /**
   * Call Google Gemini API.
   */
  async _callGemini(userPrompt) {
    await this._rateLimit(GEMINI_RATE_LIMIT_MS);

    const systemPrompt = getSystemPrompt();
    const result = await this._model.generateContent({
      contents: [
        {
          role: 'user',
          parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }],
        },
      ],
      generationConfig: {
        maxOutputTokens: 1024,
        temperature: 0.3,
      },
    });

    const response = result.response;
    return response.text();
  }

  /**
   * Call OpenAI API.
   */
  async _callOpenAI(userPrompt) {
    await this._rateLimit(OPENAI_RATE_LIMIT_MS);

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.openaiApiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: getSystemPrompt() },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 1024,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || null;
  }

  /**
   * Call Groq API (OpenAI-compatible, free tier, no billing).
   * Uses Llama 3.1 8B for token-efficient code explanations on free tier.
   */
  async _callGroq(userPrompt, retryCount = 0) {
    await this._rateLimit(GROQ_RATE_LIMIT_MS);

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.groqApiKey}`,
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [
          { role: 'system', content: getSystemPrompt() },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 800,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      if (response.status === 429 && retryCount < 2) {
        // Rate limited — wait and retry (max 2 retries)
        const waitSecs = retryCount === 0 ? 60 : 120;
        Logger.warn(`Groq rate limited, waiting ${waitSecs}s... (retry ${retryCount + 1}/2)`);
        await new Promise(r => setTimeout(r, waitSecs * 1000));
        return this._callGroq(userPrompt, retryCount + 1);
      }
      throw new Error(`Groq API error: ${response.status} ${errBody.slice(0, 200)}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || null;
  }

  /**
   * Get cached explanation.
   */
  async _getCached(titleSlug) {
    if (!this.cacheDir) return null;
    const cachePath = path.join(this.cacheDir, `${titleSlug}.md`);
    if (fileExists(cachePath)) {
      return await readFile(cachePath);
    }
    return null;
  }

  /**
   * Cache an explanation.
   */
  async _setCached(titleSlug, explanation) {
    if (!this.cacheDir) return;
    const cachePath = path.join(this.cacheDir, `${titleSlug}.md`);
    await writeFile(cachePath, explanation);
  }

  /**
   * Rate limit helper.
   */
  async _rateLimit(minMs) {
    const now = Date.now();
    const elapsed = now - this._lastRequestTime;
    if (elapsed < minMs) {
      await new Promise(resolve => setTimeout(resolve, minMs - elapsed));
    }
    this._lastRequestTime = Date.now();
  }
}

export { Explainer };
