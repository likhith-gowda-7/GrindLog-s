import fs from 'fs/promises';
import { existsSync, mkdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

/**
 * Get the absolute path to the config file.
 */
function getConfigPath() {
  return path.join(PROJECT_ROOT, 'config.json');
}

/**
 * Get the default output directory path.
 */
function getDefaultOutputDir() {
  return path.join(PROJECT_ROOT, 'output');
}

/**
 * Load configuration from config.json.
 * Returns defaults if file doesn't exist.
 */
async function loadConfig() {
  const configPath = getConfigPath();
  const defaults = {
    leetcode: {
      username: 'D_M_Likhith',
      session: '',
      csrfToken: '',
    },
    github: {
      repoName: 'GrindLog-s',
      repoUrl: 'https://github.com/likhith-gowda-7/GrindLog-s',
      githubUsername: 'likhith-gowda-7',
      outputDir: getDefaultOutputDir(),
    },
    ai: {
      provider: 'groq',
      geminiApiKey: '',
      openaiApiKey: '',
      groqApiKey: '',
    },
    sync: {
      lastSyncTimestamp: null,
      autoCommit: true,
      batchSize: 10,
    },
    preferences: {
      primaryLanguage: 'python',
      organizeBy: 'topic',
      includeDescription: true,
      includeExplanation: true,
    },
  };

  try {
    if (existsSync(configPath)) {
      const raw = await fs.readFile(configPath, 'utf-8');
      const loaded = JSON.parse(raw);
      // Deep merge with defaults
      return deepMerge(defaults, loaded);
    }
  } catch {
    // If config is corrupted, return defaults
  }

  return defaults;
}

/**
 * Save configuration to config.json.
 */
async function saveConfig(config) {
  const configPath = getConfigPath();
  await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
}

/**
 * Deep merge two objects. `source` values overwrite `target` values.
 */
function deepMerge(target, source) {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (
      source[key] &&
      typeof source[key] === 'object' &&
      !Array.isArray(source[key]) &&
      target[key] &&
      typeof target[key] === 'object'
    ) {
      result[key] = deepMerge(target[key], source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

/**
 * Validate that essential config fields are present.
 * Returns an array of missing field descriptions.
 */
function validateConfig(config) {
  const missing = [];
  if (!config.leetcode.username) missing.push('LeetCode username');
  if (!config.leetcode.session) missing.push('LeetCode session cookie');
  if (!config.leetcode.csrfToken) missing.push('LeetCode CSRF token');
  return missing;
}

/**
 * Check if AI is configured.
 */
function isAIConfigured(config) {
  if (config.ai.provider === 'gemini' && config.ai.geminiApiKey) return true;
  if (config.ai.provider === 'openai' && config.ai.openaiApiKey) return true;
  if (config.ai.provider === 'groq' && config.ai.groqApiKey) return true;
  return false;
}

export {
  loadConfig,
  saveConfig,
  validateConfig,
  isAIConfigured,
  getConfigPath,
  getDefaultOutputDir,
  PROJECT_ROOT,
};
