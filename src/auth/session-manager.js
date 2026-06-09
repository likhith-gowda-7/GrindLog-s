/**
 * @module session-manager
 * @description Secure session lifecycle manager for LeetCode authentication.
 *
 * Handles the full session lifecycle:
 * - Store sessions in encrypted local storage (~/.grindlog/session.enc)
 * - Validate sessions against the LeetCode API
 * - Provide session metadata (expiry estimates, storage status)
 * - Migrate legacy plaintext sessions from config.json
 *
 * Security guarantees:
 * - Sessions are NEVER stored in plaintext
 * - Encryption uses AES-256-GCM with machine-unique keys
 * - Decryption happens only in memory, only when needed
 * - No passwords are ever stored or requested
 */

import { writeEncrypted, readEncrypted, deleteEncrypted, getStorageDir } from './crypto.js';
import { Logger } from '../utils/logger.js';
import fs from 'fs';
import path from 'path';

const SESSION_FILE = 'session.enc';
const KEYS_FILE = 'keys.enc';
const SESSION_LIFETIME_DAYS = 14; // LeetCode sessions typically last ~14 days

class SessionManager {
  /**
   * Save a LeetCode session to encrypted storage.
   * @param {object} sessionData
   * @param {string} sessionData.session - LEETCODE_SESSION cookie value
   * @param {string} sessionData.csrfToken - csrftoken cookie value
   * @param {number} [sessionData.savedAt] - Timestamp when saved (auto-set)
   */
  static saveSession({ session, csrfToken, savedAt = null }) {
    const data = {
      session,
      csrfToken,
      savedAt: savedAt || Date.now(),
      domain: 'leetcode.com',
    };
    writeEncrypted(SESSION_FILE, data);
    Logger.success('Session encrypted and stored securely.');
    Logger.info(`  Storage: ${path.join(getStorageDir(), SESSION_FILE)}`);
  }

  /**
   * Load the stored session from encrypted storage.
   * @returns {{ session: string, csrfToken: string, savedAt: number, domain: string } | null}
   */
  static loadSession() {
    return readEncrypted(SESSION_FILE);
  }

  /**
   * Check if a stored session exists.
   * @returns {boolean}
   */
  static hasSession() {
    return !!readEncrypted(SESSION_FILE);
  }

  /**
   * Clear the stored session (secure wipe).
   */
  static clearSession() {
    deleteEncrypted(SESSION_FILE);
    Logger.info('Session cleared from secure storage.');
  }

  /**
   * Get session metadata without exposing the actual session values.
   * @returns {object} Session info for display purposes
   */
  static getSessionInfo() {
    const data = readEncrypted(SESSION_FILE);
    if (!data) {
      return {
        exists: false,
        domain: null,
        savedAt: null,
        estimatedExpiry: null,
        daysRemaining: null,
        storagePath: path.join(getStorageDir(), SESSION_FILE),
        encrypted: true,
      };
    }

    const savedAt = new Date(data.savedAt);
    const expiryDate = new Date(data.savedAt + SESSION_LIFETIME_DAYS * 24 * 60 * 60 * 1000);
    const now = new Date();
    const daysRemaining = Math.max(0, Math.ceil((expiryDate - now) / (24 * 60 * 60 * 1000)));

    return {
      exists: true,
      domain: data.domain || 'leetcode.com',
      savedAt: savedAt.toLocaleDateString(),
      estimatedExpiry: expiryDate.toLocaleDateString(),
      daysRemaining,
      isLikelyExpired: daysRemaining <= 0,
      storagePath: path.join(getStorageDir(), SESSION_FILE),
      encrypted: true,
    };
  }

  /**
   * Validate the stored session by testing it against the LeetCode API.
   * @param {string} username - LeetCode username
   * @returns {Promise<{ valid: boolean, profile: object|null, error: string|null }>}
   */
  static async validateSession(username) {
    const data = this.loadSession();
    if (!data) {
      return { valid: false, profile: null, error: 'No session found' };
    }

    try {
      const response = await fetch('https://leetcode.com/graphql/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          Referer: 'https://leetcode.com/',
          Origin: 'https://leetcode.com',
          'x-csrftoken': data.csrfToken,
          Cookie: `LEETCODE_SESSION=${data.session}; csrftoken=${data.csrfToken};`,
        },
        body: JSON.stringify({
          query: `query {
            user {
              username
            }
            matchedUser(username: "${username}") {
              username
              profile {
                ranking
              }
              submitStatsGlobal {
                acSubmissionNum {
                  difficulty
                  count
                }
              }
            }
          }`,
        }),
      });

      if (!response.ok) {
        if (response.status === 403) {
          return { valid: false, profile: null, error: 'Session expired (403 Forbidden)' };
        }
        return { valid: false, profile: null, error: `API error: ${response.status}` };
      }

      const json = await response.json();
      const currentUser = json.data?.user?.username;
      const matchedUser = json.data?.matchedUser;

      if (!currentUser) {
        return { valid: false, profile: null, error: 'Session expired or invalid (user is not logged in)' };
      }

      if (currentUser.toLowerCase() !== username.toLowerCase()) {
        return { valid: false, profile: null, error: `Session username (${currentUser}) does not match configured username (${username})` };
      }

      if (!matchedUser) {
        return { valid: false, profile: null, error: 'User profile not found' };
      }

      return { valid: true, profile: matchedUser, error: null };
    } catch (err) {
      return { valid: false, profile: null, error: err.message };
    }
  }

  // ─────────────────────────────────────────────
  // API Key Management
  // ─────────────────────────────────────────────

  /**
   * Save API keys to encrypted storage.
   * @param {object} keys
   * @param {string} [keys.groqApiKey]
   * @param {string} [keys.geminiApiKey]
   * @param {string} [keys.openaiApiKey]
   */
  static saveApiKeys(keys) {
    const existing = readEncrypted(KEYS_FILE) || {};
    const merged = { ...existing, ...keys };
    writeEncrypted(KEYS_FILE, merged);
  }

  /**
   * Load API keys from encrypted storage.
   * @returns {object} Keys object with groqApiKey, geminiApiKey, openaiApiKey
   */
  static loadApiKeys() {
    return readEncrypted(KEYS_FILE) || {};
  }

  // ─────────────────────────────────────────────
  // Migration: Legacy config.json → encrypted
  // ─────────────────────────────────────────────

  /**
   * Migrate sensitive data from a legacy config.json to encrypted storage.
   * This handles upgrading from GrindLog v1 to v2.
   * @param {object} legacyConfig - The old config.json contents
   * @returns {boolean} True if migration occurred
   */
  static migrateFromLegacyConfig(legacyConfig) {
    let migrated = false;

    // Migrate session cookies
    if (legacyConfig.leetcode?.session && legacyConfig.leetcode.session.length > 10) {
      if (!this.hasSession()) {
        this.saveSession({
          session: legacyConfig.leetcode.session,
          csrfToken: legacyConfig.leetcode.csrfToken || '',
        });
        Logger.info('Migrated LeetCode session to encrypted storage.');
        migrated = true;
      }
    }

    // Migrate API keys
    const keys = {};
    if (legacyConfig.ai?.groqApiKey) keys.groqApiKey = legacyConfig.ai.groqApiKey;
    if (legacyConfig.ai?.geminiApiKey) keys.geminiApiKey = legacyConfig.ai.geminiApiKey;
    if (legacyConfig.ai?.openaiApiKey) keys.openaiApiKey = legacyConfig.ai.openaiApiKey;

    if (Object.keys(keys).length > 0) {
      this.saveApiKeys(keys);
      Logger.info('Migrated API keys to encrypted storage.');
      migrated = true;
    }

    return migrated;
  }
}

export { SessionManager };
