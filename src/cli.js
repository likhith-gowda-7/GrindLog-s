#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { createInterface } from 'readline';
import { Logger, ICONS } from './utils/logger.js';
import { loadConfig, saveConfig, validateConfig, isAIConfigured, getConfigPath } from './utils/config.js';
import { LeetCodeClient } from './leetcode/client.js';
import { importAll } from './sync/importer.js';
import { syncNew } from './sync/syncer.js';
import { addExplanations } from './sync/explain.js';

const program = new Command();

program
  .name('grindlog')
  .description(
    chalk.bold.cyan('🧠 GrindLog') +
      chalk.dim(' — Automatically sync your LeetCode solutions to GitHub')
  )
  .version('1.0.0');

// ─────────────────────────────────────────────────
// SETUP Command
// ─────────────────────────────────────────────────
program
  .command('setup')
  .description('Interactive setup — configure LeetCode credentials and preferences')
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

    console.log(chalk.dim('  Configure your LeetCode connection.\n'));
    console.log(
      chalk.yellow(
        '  To get your cookies, log into leetcode.com, open DevTools (F12),\n' +
          '  go to Application → Cookies → leetcode.com\n'
      )
    );

    // LeetCode config
    config.leetcode.username = await ask(
      'LeetCode username',
      config.leetcode.username
    );
    config.leetcode.session = await ask(
      'LEETCODE_SESSION cookie',
      config.leetcode.session ? '****' + config.leetcode.session.slice(-8) : ''
    );
    // If user typed the masked version, keep original
    if (config.leetcode.session.startsWith('****')) {
      const existing = (await loadConfig()).leetcode.session;
      config.leetcode.session = existing;
    }
    config.leetcode.csrfToken = await ask(
      'csrftoken cookie',
      config.leetcode.csrfToken ? '****' + config.leetcode.csrfToken.slice(-8) : ''
    );
    if (config.leetcode.csrfToken.startsWith('****')) {
      const existing = (await loadConfig()).leetcode.csrfToken;
      config.leetcode.csrfToken = existing;
    }

    Logger.blank();

    // Test connection
    const spinner = ora('Testing LeetCode connection...').start();
    try {
      const client = new LeetCodeClient({
        username: config.leetcode.username,
        session: config.leetcode.session,
        csrfToken: config.leetcode.csrfToken,
      });
      const profile = await client.fetchProfile();
      if (profile) {
        spinner.succeed(chalk.green(`Connected! Welcome, ${profile.username}`));
        const stats = profile.submitStatsGlobal?.acSubmissionNum || [];
        const total = stats.find(s => s.difficulty === 'All')?.count || 0;
        Logger.stats('Total solved', total, 'green');
      } else {
        spinner.fail(chalk.red('Could not verify connection'));
      }
    } catch (err) {
      spinner.fail(chalk.red(`Connection failed: ${err.message}`));
    }

    Logger.blank();

    // AI config
    console.log(chalk.dim('  Configure AI explanation generation (optional).\n'));
    const aiProvider = await ask('AI provider (gemini/openai/none)', config.ai.provider);
    config.ai.provider = aiProvider === 'none' ? '' : aiProvider;

    if (config.ai.provider === 'gemini') {
      console.log(
        chalk.yellow('  Get a free API key at: https://aistudio.google.com/app/apikey\n')
      );
      config.ai.geminiApiKey = await ask(
        'Gemini API key',
        config.ai.geminiApiKey ? '****' + config.ai.geminiApiKey.slice(-6) : ''
      );
      if (config.ai.geminiApiKey.startsWith('****')) {
        const existing = (await loadConfig()).ai.geminiApiKey;
        config.ai.geminiApiKey = existing;
      }
    } else if (config.ai.provider === 'openai') {
      config.ai.openaiApiKey = await ask(
        'OpenAI API key',
        config.ai.openaiApiKey ? '****' + config.ai.openaiApiKey.slice(-6) : ''
      );
      if (config.ai.openaiApiKey.startsWith('****')) {
        const existing = (await loadConfig()).ai.openaiApiKey;
        config.ai.openaiApiKey = existing;
      }
    }

    Logger.blank();

    // Preferences
    console.log(chalk.dim('  Set your preferences.\n'));
    config.preferences.primaryLanguage = await ask(
      'Primary language (python/java/cpp/javascript)',
      config.preferences.primaryLanguage
    );
    config.preferences.organizeBy = await ask(
      'Organize by (topic/difficulty/flat)',
      config.preferences.organizeBy
    );

    // Save
    await saveConfig(config);
    Logger.blank();
    Logger.success(`Configuration saved to ${getConfigPath()}`);
    Logger.blank();
    Logger.info('Next steps:');
    Logger.step(1, 2, 'Run `node src/cli.js import` to import all past submissions');
    Logger.step(2, 2, 'Run `node src/cli.js sync` to sync new submissions');

    rl.close();
  });

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

    const spinner = ora('Fetching stats from LeetCode...').start();

    try {
      const client = new LeetCodeClient({
        username: config.leetcode.username,
        session: config.leetcode.session,
        csrfToken: config.leetcode.csrfToken,
      });

      const profile = await client.fetchProfile();
      spinner.stop();

      if (!profile) {
        Logger.error('Failed to fetch profile. Cookies may have expired.');
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

      // Show sync status
      if (config.sync.lastSyncTimestamp) {
        const lastSync = new Date(config.sync.lastSyncTimestamp * 1000).toLocaleString();
        Logger.stats('Last sync', lastSync, 'dim');
      } else {
        Logger.info('No sync yet. Run `grindlog import` to get started.');
      }

      // Show AI status
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

    try {
      await importAll({
        dryRun: opts.dryRun || false,
        skipAI: opts.skipAi || false,
        limit: opts.limit || 0,
      });
    } catch (err) {
      Logger.error(`Import failed: ${err.message}`);
      if (err.message.includes('403') || err.message.includes('expired')) {
        Logger.info('Your session cookies may have expired. Run `grindlog setup` to refresh.');
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
  .action(async (opts) => {
    const config = await loadConfig();
    const missing = validateConfig(config);

    if (missing.length > 0) {
      // In CI/GitHub Actions, try env vars
      if (process.env.LEETCODE_SESSION) {
        config.leetcode.session = process.env.LEETCODE_SESSION;
        config.leetcode.csrfToken = process.env.LEETCODE_CSRF_TOKEN || '';
        config.leetcode.username = process.env.LEETCODE_USERNAME || config.leetcode.username;
        if (process.env.GEMINI_API_KEY) {
          config.ai.geminiApiKey = process.env.GEMINI_API_KEY;
          config.ai.provider = 'gemini';
        }
        await saveConfig(config);
      } else {
        Logger.error(`Missing config: ${missing.join(', ')}`);
        Logger.info('Run `grindlog setup` first.');
        process.exit(1);
      }
    }

    try {
      await syncNew({ push: opts.push || false });
    } catch (err) {
      Logger.error(`Sync failed: ${err.message}`);
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
// REFRESH-COOKIES Command
// ─────────────────────────────────────────────────
program
  .command('refresh-cookies')
  .description('Update LeetCode session cookies when they expire')
  .action(async () => {
    Logger.header('Refresh LeetCode Cookies');

    const config = await loadConfig();
    const rl = createInterface({ input: process.stdin, output: process.stdout });

    const ask = (question) =>
      new Promise(resolve => {
        rl.question(`  ${question}: `, answer => resolve(answer.trim()));
      });

    console.log(
      chalk.yellow(
        '  Go to leetcode.com → DevTools (F12) → Application → Cookies\n' +
          '  Copy the values for LEETCODE_SESSION and csrftoken\n'
      )
    );

    config.leetcode.session = await ask('New LEETCODE_SESSION cookie');
    config.leetcode.csrfToken = await ask('New csrftoken cookie');

    // Test
    const spinner = ora('Testing new cookies...').start();
    try {
      const client = new LeetCodeClient({
        username: config.leetcode.username,
        session: config.leetcode.session,
        csrfToken: config.leetcode.csrfToken,
      });
      const ok = await client.testConnection();
      if (ok) {
        spinner.succeed(chalk.green('Cookies are valid!'));
        await saveConfig(config);
        Logger.success('Configuration updated.');
      } else {
        spinner.fail(chalk.red('Cookies appear invalid. Not saved.'));
      }
    } catch (err) {
      spinner.fail(chalk.red(`Test failed: ${err.message}`));
    }

    rl.close();
  });

// ─────────────────────────────────────────────────
// BANNER
// ─────────────────────────────────────────────────
program.addHelpText(
  'beforeAll',
  `
${chalk.bold.cyan('  🧠 GrindLog v1.0.0')}
${chalk.dim('  Automate your LeetCode → GitHub workflow')}
`
);

program.parse();
