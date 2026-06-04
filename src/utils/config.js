import fs from 'fs/promises';
import { existsSync, mkdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { SessionManager } from '../auth/session-manager.js';

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
 *
 * NOTE: Sensitive data (session, API keys) are stored in encrypted
 * storage via SessionManager, NOT in config.json.
 */
async function loadConfig() {
  const configPath = getConfigPath();
  const defaults = {
    leetcode: {
      username: 'D_M_Likhith',
    },
    github: {
      repoName: 'Leetcode_Solutions-GrindLog-s',
      repoUrl: 'https://github.com/likhith-gowda-7/Leetcode_Solutions-GrindLog-s',
      githubUsername: 'likhith-gowda-7',
      outputDir: getDefaultOutputDir(),
    },
    ai: {
      provider: 'groq',
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

      // Check for and handle legacy config migration
      if (loaded.leetcode?.session || loaded.ai?.groqApiKey || loaded.ai?.geminiApiKey) {
        const migrated = SessionManager.migrateFromLegacyConfig(loaded);
        if (migrated) {
          // Strip sensitive fields and save cleaned config
          const cleaned = stripSensitiveFields(loaded);
          await fs.writeFile(configPath, JSON.stringify(cleaned, null, 2), 'utf-8');
        }
        // Return merged config with sensitive fields stripped
        return deepMerge(defaults, stripSensitiveFields(loaded));
      }

      return deepMerge(defaults, loaded);
    }
  } catch {
    // If config is corrupted, return defaults
  }

  return defaults;
}

/**
 * Save configuration to config.json.
 * ONLY saves non-sensitive data. Sessions and keys go to encrypted storage.
 */
async function saveConfig(config) {
  const configPath = getConfigPath();
  const cleaned = stripSensitiveFields(config);
  await fs.writeFile(configPath, JSON.stringify(cleaned, null, 2), 'utf-8');
}

/**
 * Strip sensitive fields from a config object.
 * These belong in encrypted storage, not in config.json.
 */
function stripSensitiveFields(config) {
  const stripped = JSON.parse(JSON.stringify(config));

  // Remove session data
  if (stripped.leetcode) {
    delete stripped.leetcode.session;
    delete stripped.leetcode.csrfToken;
  }

  // Remove API keys
  if (stripped.ai) {
    delete stripped.ai.groqApiKey;
    delete stripped.ai.geminiApiKey;
    delete stripped.ai.openaiApiKey;
  }

  return stripped;
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
 * NOTE: Session validation is handled separately by SessionManager.
 * Returns an array of missing field descriptions.
 */
function validateConfig(config) {
  const missing = [];
  if (!config.leetcode.username) missing.push('LeetCode username');
  return missing;
}

/**
 * Check if AI is configured (keys in encrypted storage).
 */
function isAIConfigured(config) {
  const keys = SessionManager.loadApiKeys();
  if (config.ai.provider === 'groq' && keys.groqApiKey) return true;
  if (config.ai.provider === 'gemini' && keys.geminiApiKey) return true;
  if (config.ai.provider === 'openai' && keys.openaiApiKey) return true;
  return false;
}

/**
 * Get session credentials for API usage.
 * Loads from encrypted storage + adds to a config-like object.
 * @param {object} config - The loaded config
 * @returns {object} Config-like object with session and keys merged in
 */
function getFullCredentials(config) {
  const session = SessionManager.loadSession();
  const keys = SessionManager.loadApiKeys();

  return {
    ...config,
    leetcode: {
      ...config.leetcode,
      session: session?.session || '',
      csrfToken: session?.csrfToken || '',
    },
    ai: {
      ...config.ai,
      groqApiKey: keys.groqApiKey || '',
      geminiApiKey: keys.geminiApiKey || '',
      openaiApiKey: keys.openaiApiKey || '',
    },
  };
}

export {
  loadConfig,
  saveConfig,
  validateConfig,
  isAIConfigured,
  getConfigPath,
  getDefaultOutputDir,
  getFullCredentials,
  PROJECT_ROOT,
};
