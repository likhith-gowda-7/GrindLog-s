#!/usr/bin/env node

/**
 * @module auto-sync
 * @description Automated sync script for Windows Task Scheduler.
 *
 * This script:
 * 1. Runs grindlog sync to fetch new submissions
 * 2. Commits and pushes changes to the solutions repo
 * 3. Logs results to a file for troubleshooting
 *
 * Usage with Task Scheduler:
 *   Program: node
 *   Arguments: "C:\Users\gowda\OneDrive\Desktop\GrindLog's\src\auto-sync.js"
 *   Start in: C:\Users\gowda\OneDrive\Desktop\GrindLog's
 */

import { loadConfig, getFullCredentials } from './utils/config.js';
import { LeetCodeClient } from './leetcode/client.js';
import { syncNew } from './sync/syncer.js';
import { GitRepo } from './github/repo.js';
import { SessionManager } from './auth/session-manager.js';
import { Logger } from './utils/logger.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');
const LOG_FILE = path.join(PROJECT_ROOT, 'sync.log');

// Log to file for Task Scheduler debugging
function log(msg) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

async function main() {
  log('=== GrindLog Auto-Sync Started ===');

  try {
    // Check session validity first
    const config = await loadConfig();
    const sessionInfo = SessionManager.getSessionInfo();

    if (!sessionInfo.exists) {
      log('ERROR: No session found. Run `grindlog auth` manually first.');
      process.exit(1);
    }

    if (sessionInfo.isLikelyExpired) {
      log('WARNING: Session likely expired. Run `grindlog auth` to refresh.');
      log('Skipping auto-sync (cannot open browser in background).');
      process.exit(1);
    }

    log(`Session valid (~${sessionInfo.daysRemaining} days remaining)`);

    // Run sync
    await syncNew({ push: false });

    // Push to remote
    const outputDir = config.github?.outputDir || './output';
    const absOutput = path.isAbsolute(outputDir) ? outputDir : path.join(PROJECT_ROOT, outputDir);
    const repo = new GitRepo(absOutput);

    const status = await repo.getStatus();
    if (!status.isClean) {
      await repo.commit('🔄 Auto-sync LeetCode submissions');
      await repo.push('origin', 'main');
      log(`SUCCESS: Synced and pushed (${status.created} new, ${status.modified} modified)`);
    } else {
      log('No new submissions to push.');
    }

  } catch (err) {
    log(`ERROR: ${err.message}`);
    process.exit(1);
  }

  log('=== Auto-Sync Complete ===\n');
}

main();
