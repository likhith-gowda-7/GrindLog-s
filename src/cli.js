#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { createInterface } from 'readline';
import os from 'os';
import path from 'path';
import { Logger, ICONS } from './utils/logger.js';
import { loadConfig, saveConfig, validateConfig, isAIConfigured, getConfigPath, getFullCredentials, PROJECT_ROOT } from './utils/config.js';
import { LeetCodeClient } from './leetcode/client.js';
import { importAll } from './sync/importer.js';
import { syncNew } from './sync/syncer.js';
import { addExplanations } from './sync/explain.js';
import { SessionManager } from './auth/session-manager.js';
import { interactiveSessionRefresh } from './auth/session-refresh.js';
import { detectBrowser, getBrowserSummary } from './auth/browser-detector.js';
import { getStorageDir } from './auth/crypto.js';
import { existsSync } from 'fs';
import { listDirs, countFiles } from './utils/file-helpers.js';

const program = new Command();

program
  .name('grindlog')
  .description(
    chalk.bold.cyan('🧠 GrindLog') +
      chalk.dim(' — Securely sync your LeetCode solutions to GitHub')
  )
  .version('2.0.0');

// ─────────────────────────────────────────────────
// Helper: Ensure valid session, auto-trigger auth if expired
// ─────────────────────────────────────────────────
async function ensureSession(config) {
  const creds = getFullCredentials(config);

  // Check if we have session at all
  if (!creds.leetcode.session) {
    Logger.warn('No session found. Starting Interactive Session Refresh...');
    Logger.blank();
    const result = await interactiveSessionRefresh();
    if (!result.success) {
      Logger.error(result.error || 'Session refresh failed.');
      Logger.info('You can also run `grindlog auth` manually.');
      process.exit(1);
    }
    return getFullCredentials(config);
  }

  // Quick validation (test API)
  const validation = await SessionManager.validateSession(config.leetcode.username);
  if (!validation.valid) {
    Logger.warn(`Session expired: ${validation.error}`);
    Logger.info('Starting Interactive Session Refresh...');
    Logger.blank();
    const result = await interactiveSessionRefresh();
    if (!result.success) {
      Logger.error(result.error || 'Session refresh failed.');
      process.exit(1);
    }
    return getFullCredentials(config);
  }

  return creds;
}

// ─────────────────────────────────────────────────
// AUTH Command — Interactive Session Refresh
// ─────────────────────────────────────────────────
program
  .command('auth')
  .description('Interactive Session Refresh — authenticate via visible browser')
  .option('--force', 'Force re-authentication even if session is valid')
  .option('--clear', 'Clear stored session and API keys')
  .action(async (opts) => {
    Logger.header('GrindLog — Interactive Session Refresh');

    if (opts.clear) {
      SessionManager.clearSession();
      Logger.success('All stored sessions cleared.');
      return;
    }

    // Check if session is already valid
    if (!opts.force) {
      const config = await loadConfig();
      const info = SessionManager.getSessionInfo();
      if (info.exists && !info.isLikelyExpired) {
        const validation = await SessionManager.validateSession(config.leetcode.username);
        if (validation.valid) {
          Logger.success('Session is already valid!');
          Logger.blank();
          displaySessionInfo(info);
          Logger.blank();
          Logger.info('Use --force to re-authenticate anyway.');
          return;
        }
      }
    }

    Logger.blank();
    const result = await interactiveSessionRefresh();

    if (result.success) {
      Logger.blank();
      const info = SessionManager.getSessionInfo();
      displaySessionInfo(info);
    } else {
      Logger.error(result.error || 'Session refresh failed.');
      process.exit(1);
    }
  });

/**
 * Display session info in a clean format.
 */
function displaySessionInfo(info) {
  if (info.exists) {
    Logger.stats('Domain', info.domain, 'cyan');
    Logger.stats('Saved', info.savedAt, 'dim');
    Logger.stats('Estimated expiry', info.estimatedExpiry, info.daysRemaining > 3 ? 'green' : 'yellow');
    Logger.stats('Days remaining', `~${info.daysRemaining} days`, info.daysRemaining > 3 ? 'green' : 'yellow');
    Logger.stats('Storage', info.storagePath, 'dim');
    Logger.stats('Encryption', 'AES-256-GCM', 'green');
  } else {
    Logger.info('No session stored. Run `grindlog auth` to authenticate.');
  }
}

// ─────────────────────────────────────────────────
// DOCTOR Command — System Diagnostics
// ─────────────────────────────────────────────────
program
  .command('doctor')
  .description('Run diagnostics to verify GrindLog health and configuration')
  .action(async () => {
    Logger.header('GrindLog — System Diagnostics');

    const checks = [];

    // 1. Node.js version
    const nodeVersion = process.version;
    const nodeMajor = parseInt(nodeVersion.slice(1));
    checks.push({
      label: 'Node.js',
      value: nodeVersion,
      ok: nodeMajor >= 18,
      error: nodeMajor < 18 ? 'Node.js 18+ required' : null,
    });

    // 2. Config file
    const configPath = getConfigPath();
    checks.push({
      label: 'Config file',
      value: existsSync(configPath) ? 'Found' : 'Missing',
      ok: existsSync(configPath),
      error: !existsSync(configPath) ? 'Run `grindlog setup`' : null,
    });

    // 3. Username
    const config = await loadConfig();
    checks.push({
      label: 'Username',
      value: config.leetcode.username || 'Not set',
      ok: !!config.leetcode.username,
    });

    // 4. Session status
    const sessionInfo = SessionManager.getSessionInfo();
    if (sessionInfo.exists) {
      const validation = await SessionManager.validateSession(config.leetcode.username);
      checks.push({
        label: 'Session',
        value: validation.valid
          ? `Valid (~${sessionInfo.daysRemaining} days remaining)`
          : `Invalid — ${validation.error}`,
        ok: validation.valid,
        error: !validation.valid ? 'Run `grindlog auth`' : null,
      });
    } else {
      checks.push({
        label: 'Session',
        value: 'Not configured',
        ok: false,
        error: 'Run `grindlog auth`',
      });
    }

    // 5. Session storage
    checks.push({
      label: 'Storage',
      value: sessionInfo.exists ? 'Encrypted (AES-256-GCM)' : 'Empty',
      ok: true,
    });

    // 6. LeetCode API
    if (sessionInfo.exists) {
      const validation = await SessionManager.validateSession(config.leetcode.username);
      if (validation.valid) {
        const stats = validation.profile?.submitStatsGlobal?.acSubmissionNum || [];
        const total = stats.find(s => s.difficulty === 'All')?.count || 0;
        checks.push({
          label: 'LeetCode API',
          value: `Connected (${total} problems solved)`,
          ok: true,
        });
      } else {
        checks.push({
          label: 'LeetCode API',
          value: 'Not connected',
          ok: false,
          error: validation.error,
        });
      }
    }

    // 7. AI provider
    const aiConfigured = isAIConfigured(config);
    checks.push({
      label: 'AI provider',
      value: aiConfigured ? `${config.ai.provider} (configured)` : config.ai.provider || 'None',
      ok: aiConfigured,
      error: !aiConfigured ? 'Run `grindlog setup` to add an API key' : null,
    });

    // 8. Output directory
    const outputDir = config.github?.outputDir || './output';
    const absOutput = path.isAbsolute(outputDir) ? outputDir : path.join(PROJECT_ROOT, outputDir);
    if (existsSync(absOutput)) {
      const fileCount = await countFiles(absOutput);
      checks.push({
        label: 'Output directory',
        value: `${outputDir} (${fileCount} files)`,
        ok: true,
      });
    } else {
      checks.push({
        label: 'Output directory',
        value: 'Not created yet',
        ok: true,
      });
    }

    // 9. Git repository
    try {
      const gitDir = path.join(absOutput, '.git');
      const hasGit = existsSync(gitDir);
      checks.push({
        label: 'Git repository',
        value: hasGit ? 'Initialized' : 'Not initialized',
        ok: hasGit,
        error: !hasGit ? 'Run `grindlog import` to initialize' : null,
      });
    } catch {
      checks.push({ label: 'Git repository', value: 'Error', ok: false });
    }

    // 10. Browser detection
    const browser = detectBrowser();
    checks.push({
      label: 'Browser',
      value: browser ? `${browser.name} detected` : 'Not found',
      ok: !!browser,
      error: !browser ? 'Install Edge, Chrome, or Brave' : null,
    });

    // Display results
    let allPassed = true;
    for (const check of checks) {
      const icon = check.ok ? chalk.green('✓') : chalk.red('✗');
      const value = check.ok ? chalk.white(check.value) : chalk.yellow(check.value);
      console.log(`  ${icon} ${chalk.dim(check.label + ':')} ${value}`);
      if (check.error) {
        console.log(`    ${chalk.dim('→')} ${chalk.yellow(check.error)}`);
      }
      if (!check.ok) allPassed = false;
    }

    Logger.blank();
    if (allPassed) {
      Logger.success('All checks passed! GrindLog is healthy. 🎉');
    } else {
      Logger.warn('Some checks failed. See suggestions above.');
    }
  });

// ─────────────────────────────────────────────────
// SETUP Command
// ─────────────────────────────────────────────────
program
  .command('setup')
  .description('Interactive setup — configure username, AI provider, and preferences')
  .action(async () => {
    Logger.header('GrindLog Setup');

    const config = await loadConfig();
    const rl = createInterface({ input: process.stdin, output: process.stdout });

    const ask = (question, defaultVal = '') =>
      new Promise(resolve => {
        const prompt = defaultVal
          ? `  ${question} ${chalk.dim(`(${defaultVal})`)}: `
          : `  ${question}: `;
        rl.question(prompt, answer => {
          resolve(answer.trim() || defaultVal);
        });
      });

    console.log(chalk.dim('  Configure your GrindLog connection.\n'));

    // ── LeetCode username ──
    config.leetcode.username = await ask('LeetCode username', config.leetcode.username);

    Logger.blank();

    // ── Session authentication ──
    console.log(chalk.dim('  Session authentication uses Interactive Session Refresh.'));
    console.log(chalk.dim('  A browser window will open for you to log in securely.\n'));

    const sessionInfo = SessionManager.getSessionInfo();
    if (sessionInfo.exists && !sessionInfo.isLikelyExpired) {
      console.log(chalk.green(`  ✓ Session already stored (expires in ~${sessionInfo.daysRemaining} days)`));
      const refreshNow = await ask('Refresh session now? (y/n)', 'n');
      if (refreshNow.toLowerCase() === 'y') {
        rl.close();
        Logger.blank();
        await interactiveSessionRefresh();
        // Re-open rl for remaining questions
        const rl2 = createInterface({ input: process.stdin, output: process.stdout });
        const ask2 = (q, d = '') => new Promise(r => { rl2.question(`  ${q} ${d ? chalk.dim(`(${d})`) : ''}: `, a => r(a.trim() || d)); });
        await continueSetup(config, ask2);
        rl2.close();
        return;
      }
    } else {
      console.log(chalk.yellow('  No valid session found. Starting authentication...\n'));
      rl.close();
      await interactiveSessionRefresh();
      const rl2 = createInterface({ input: process.stdin, output: process.stdout });
      const ask2 = (q, d = '') => new Promise(r => { rl2.question(`  ${q} ${d ? chalk.dim(`(${d})`) : ''}: `, a => r(a.trim() || d)); });
      await continueSetup(config, ask2);
      rl2.close();
      return;
    }

    Logger.blank();
    await continueSetup(config, ask);
    rl.close();
  });

/**
 * Continue setup after session auth — AI and preferences.
 */
async function continueSetup(config, ask) {
  Logger.blank();

  // ── AI Configuration ──
  console.log(chalk.dim('  Configure AI explanation generation (optional).\n'));
  const aiProvider = await ask('AI provider (groq/gemini/openai/none)', config.ai.provider || 'groq');
  config.ai.provider = aiProvider === 'none' ? '' : aiProvider;

  if (config.ai.provider) {
    const providerLabel = config.ai.provider === 'groq' ? 'Groq' : config.ai.provider === 'gemini' ? 'Gemini' : 'OpenAI';
    const urlHint = config.ai.provider === 'groq' ? 'https://console.groq.com' : config.ai.provider === 'gemini' ? 'https://aistudio.google.com/app/apikey' : 'https://platform.openai.com';
    console.log(chalk.yellow(`  Get a free API key at: ${urlHint}\n`));

    const existingKeys = SessionManager.loadApiKeys();
    const keyField = `${config.ai.provider}ApiKey`;
    const existingKey = existingKeys[keyField];

    const apiKey = await ask(
      `${providerLabel} API key`,
      existingKey ? '****' + existingKey.slice(-6) : ''
    );

    if (!apiKey.startsWith('****')) {
      // New key entered — save to encrypted storage
      SessionManager.saveApiKeys({ [keyField]: apiKey });
      Logger.success(`${providerLabel} API key stored securely.`);
    }
  }

  Logger.blank();

  // ── Preferences ──
  console.log(chalk.dim('  Set your preferences.\n'));
  config.preferences.primaryLanguage = await ask(
    'Primary language (python/java/cpp/javascript)',
    config.preferences.primaryLanguage
  );
  config.preferences.organizeBy = await ask(
    'Organize by (topic/difficulty/flat)',
    config.preferences.organizeBy
  );

  // ── GitHub ──
  Logger.blank();
  console.log(chalk.dim('  GitHub repository configuration.\n'));
  config.github.repoName = await ask('Repository name', config.github.repoName);
  config.github.githubUsername = await ask('GitHub username', config.github.githubUsername);
  config.github.repoUrl = `https://github.com/${config.github.githubUsername}/${config.github.repoName}`;

  // Save (non-sensitive only)
  await saveConfig(config);
  Logger.blank();
  Logger.success(`Configuration saved to ${getConfigPath()}`);
  Logger.info('Sensitive data stored in encrypted storage.');
  Logger.blank();
  Logger.info('Next steps:');
  Logger.step(1, 3, 'Run `grindlog doctor` to verify your setup');
  Logger.step(2, 3, 'Run `grindlog import` to import all past submissions');
  Logger.step(3, 3, 'Run `grindlog sync` to sync new submissions');
}

// ─────────────────────────────────────────────────
// STATS Command
// ─────────────────────────────────────────────────
program
  .command('stats')
  .description('Show your current LeetCode progress stats')
  .action(async () => {
    const config = await loadConfig();
    const missing = validateConfig(config);

    if (missing.length > 0) {
      Logger.error(`Missing config: ${missing.join(', ')}`);
      Logger.info('Run `grindlog setup` first.');
      process.exit(1);
    }

    const creds = await ensureSession(config);

    const spinner = ora('Fetching stats from LeetCode...').start();

    try {
      const client = new LeetCodeClient({
        username: creds.leetcode.username,
        session: creds.leetcode.session,
        csrfToken: creds.leetcode.csrfToken,
      });

      const profile = await client.fetchProfile();
      spinner.stop();

      if (!profile) {
        Logger.error('Failed to fetch profile.');
        process.exit(1);
      }

      Logger.header(`Stats for ${profile.username}`);

      const stats = profile.submitStatsGlobal?.acSubmissionNum || [];
      const all = stats.find(s => s.difficulty === 'All');
      const easy = stats.find(s => s.difficulty === 'Easy');
      const medium = stats.find(s => s.difficulty === 'Medium');
      const hard = stats.find(s => s.difficulty === 'Hard');

      Logger.stats('Total Solved', all?.count || 0, 'green');
      Logger.stats('Easy', easy?.count || 0, 'green');
      Logger.stats('Medium', medium?.count || 0, 'yellow');
      Logger.stats('Hard', hard?.count || 0, 'red');

      if (profile.profile?.ranking) {
        Logger.stats('Ranking', `#${profile.profile.ranking}`, 'cyan');
      }

      Logger.blank();

      // Session info
      const sessionInfo = SessionManager.getSessionInfo();
      if (sessionInfo.exists) {
        Logger.stats('Session', `Valid (~${sessionInfo.daysRemaining} days)`, sessionInfo.daysRemaining > 3 ? 'green' : 'yellow');
      }

      // Sync status
      if (config.sync.lastSyncTimestamp) {
        const lastSync = new Date(config.sync.lastSyncTimestamp * 1000).toLocaleString();
        Logger.stats('Last sync', lastSync, 'dim');
      } else {
        Logger.info('No sync yet. Run `grindlog import` to get started.');
      }

      // AI status
      Logger.stats('AI provider', config.ai.provider || 'none', isAIConfigured(config) ? 'green' : 'dim');
    } catch (err) {
      spinner.fail(chalk.red(`Failed: ${err.message}`));
      process.exit(1);
    }
  });

// ─────────────────────────────────────────────────
// IMPORT Command
// ─────────────────────────────────────────────────
program
  .command('import')
  .description('One-time bulk import of ALL past accepted submissions')
  .option('--dry-run', 'Preview what would be imported without writing files')
  .option('--skip-ai', 'Skip AI explanation generation')
  .option('--limit <n>', 'Limit number of problems to import', parseInt)
  .action(async (opts) => {
    const config = await loadConfig();
    const missing = validateConfig(config);

    if (missing.length > 0) {
      Logger.error(`Missing config: ${missing.join(', ')}`);
      Logger.info('Run `grindlog setup` first.');
      process.exit(1);
    }

    // Ensure valid session (auto-trigger auth if expired)
    await ensureSession(config);

    try {
      await importAll({
        dryRun: opts.dryRun || false,
        skipAI: opts.skipAi || false,
        limit: opts.limit || 0,
      });
    } catch (err) {
      Logger.error(`Import failed: ${err.message}`);
      if (err.message.includes('403') || err.message.includes('expired')) {
        Logger.info('Session may have expired. Run `grindlog auth` to refresh.');
      }
      process.exit(1);
    }
  });

// ─────────────────────────────────────────────────
// SYNC Command
// ─────────────────────────────────────────────────
program
  .command('sync')
  .description('Fetch new submissions since last sync and update repository')
  .option('--push', 'Also push to remote after committing')
  .option('--dry-run', 'Preview what would be synced without writing files')
  .action(async (opts) => {
    const config = await loadConfig();
    const missing = validateConfig(config);

    if (missing.length > 0) {
      Logger.error(`Missing config: ${missing.join(', ')}`);
      Logger.info('Run `grindlog setup` first.');
      process.exit(1);
    }

    // Ensure valid session (auto-trigger auth if expired)
    await ensureSession(config);

    try {
      await syncNew({ push: opts.push || false });
    } catch (err) {
      Logger.error(`Sync failed: ${err.message}`);
      if (err.message.includes('403') || err.message.includes('expired')) {
        Logger.info('Session may have expired. Run `grindlog auth` to refresh.');
      }
      process.exit(1);
    }
  });

// ─────────────────────────────────────────────────
// EXPLAIN Command
// ─────────────────────────────────────────────────
program
  .command('explain')
  .description('Add AI explanations to existing solutions (no LeetCode re-fetch needed)')
  .option('--dry-run', 'Preview what would be explained without modifying files')
  .option('--limit <n>', 'Limit number of explanations to generate', parseInt)
  .action(async (opts) => {
    const config = await loadConfig();

    if (!isAIConfigured(config)) {
      Logger.error('AI is not configured. Run `grindlog setup` and add an API key.');
      process.exit(1);
    }

    try {
      await addExplanations({
        dryRun: opts.dryRun || false,
        limit: opts.limit || 0,
      });
    } catch (err) {
      Logger.error(`Explain failed: ${err.message}`);
      process.exit(1);
    }
  });

// ─────────────────────────────────────────────────
// BANNER
// ─────────────────────────────────────────────────
program.addHelpText(
  'beforeAll',
  `
${chalk.bold.cyan('  🧠 GrindLog v2.0.0')}
${chalk.dim('  Securely sync your LeetCode solutions to GitHub')}
`
);

program.parse();
