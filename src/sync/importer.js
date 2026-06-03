import path from 'path';
import { LeetCodeClient } from '../leetcode/client.js';
import { parseSubmissionDetail, parseProblemDetail, deduplicateSubmissions, groupByTopic, sortByProblemId } from '../leetcode/parser.js';
import { generateProblemReadme, generateMainReadme } from '../github/readme-generator.js';
import { Explainer } from '../ai/explainer.js';
import { GitRepo } from '../github/repo.js';
import { Logger } from '../utils/logger.js';
import { writeFile, readFile, fileExists, ensureDir, problemFolderName, topicFolderName, langExtension } from '../utils/file-helpers.js';
import { loadConfig, saveConfig } from '../utils/config.js';

/**
 * Import ALL past accepted submissions from LeetCode.
 * This is the one-time bulk import command.
 *
 * Strategy:
 * 1. Fetch ALL solved problem slugs via problemset API (no cap)
 * 2. For each problem, fetch the latest accepted submission (code + metrics)
 * 3. Fetch problem description and tags
 * 4. Optionally generate AI explanations
 * 5. Write files and commit
 */
async function importAll(options = {}) {
  const config = await loadConfig();
  const { dryRun = false, skipAI = false, limit = 0 } = options;

  Logger.header('GrindLog — Full Import');

  // Step 1: Initialize client
  Logger.info('Connecting to LeetCode...');
  const client = new LeetCodeClient({
    username: config.leetcode.username,
    session: config.leetcode.session,
    csrfToken: config.leetcode.csrfToken,
    rateLimitMs: 700,
  });

  // Test connection
  const profile = await client.fetchProfile();
  if (!profile) {
    Logger.error('Failed to connect to LeetCode. Check your cookies.');
    return;
  }
  Logger.success(`Connected as: ${profile.username}`);

  const acStats = profile.submitStatsGlobal?.acSubmissionNum || [];
  const totalSolved = acStats.find(s => s.difficulty === 'All')?.count || 0;
  Logger.stats('Total solved on LeetCode', totalSolved, 'green');
  Logger.blank();

  // Step 2: Fetch ALL solved problem slugs (paginated, no 20-item cap)
  Logger.sync('Fetching all solved problems...');
  const solvedProblems = await client.fetchSolvedProblems(100);
  Logger.info(`Found ${solvedProblems.length} solved problems via API`);

  if (solvedProblems.length === 0) {
    Logger.warn('No solved problems found. Nothing to import.');
    return;
  }

  // Apply limit if specified
  let problemList = solvedProblems;
  if (limit > 0) {
    problemList = solvedProblems.slice(0, limit);
    Logger.info(`Limiting import to ${limit} problems`);
  }

  Logger.info(`${problemList.length} problems to import`);
  Logger.blank();

  if (dryRun) {
    Logger.info('DRY RUN — no files will be written');
    for (const p of problemList.slice(0, 15)) {
      Logger.step(0, 0, `Would import: ${p.questionFrontendId}. ${p.title} (${p.difficulty})`);
    }
    if (problemList.length > 15) {
      Logger.info(`... and ${problemList.length - 15} more`);
    }
    return;
  }

  // Step 3: Setup output directory
  const outputDir = config.github.outputDir;
  ensureDir(outputDir);

  // Setup AI explainer
  let explainer = null;
  if (!skipAI && config.ai.geminiApiKey) {
    const cacheDir = path.join(outputDir, '.cache', 'explanations');
    ensureDir(cacheDir);
    explainer = new Explainer({
      provider: config.ai.provider,
      geminiApiKey: config.ai.geminiApiKey,
      openaiApiKey: config.ai.openaiApiKey,
      groqApiKey: config.ai.groqApiKey,
      cacheDir,
    });
    if (explainer.isReady()) {
      Logger.info('AI explanation generation enabled');
    } else {
      Logger.warn('AI not configured, skipping explanations');
      explainer = null;
    }
  }

  // Step 4: For each solved problem, fetch submission + details and create files
  const allSubmissions = [];
  const errors = [];
  const startTime = Date.now();

  for (let i = 0; i < problemList.length; i++) {
    const prob = problemList[i];
    const displayTitle = prob.title?.slice(0, 40) || prob.titleSlug;
    Logger.progress(i + 1, problemList.length, displayTitle);

    // Skip premium-only problems (can't fetch code)
    if (prob.isPaidOnly) {
      continue;
    }

    try {
      // Fetch the latest accepted submission for this problem
      const submissions = await client.fetchProblemSubmissions(prob.titleSlug);

      if (!submissions || submissions.length === 0) {
        errors.push(`${prob.title}: No accepted submissions found`);
        continue;
      }

      // Get the first (most recent) accepted submission
      const latestSub = submissions[0];

      // Fetch full submission details (includes code)
      const detail = await client.fetchSubmissionDetail(latestSub.id);
      if (!detail || !detail.code) {
        errors.push(`${prob.title}: No code in submission`);
        continue;
      }

      const parsed = parseSubmissionDetail(detail);
      if (!parsed) {
        errors.push(`${prob.title}: Failed to parse`);
        continue;
      }

      // Use tags from the problem list (already available, saves an API call)
      if ((!parsed.tags || parsed.tags.length === 0) && prob.topicTags) {
        parsed.tags = prob.topicTags.map(t => t.name);
      }

      // Fetch problem description
      let problemDetail = null;
      try {
        const rawProblem = await client.fetchProblemDetail(parsed.titleSlug);
        problemDetail = parseProblemDetail(rawProblem);
        if ((!parsed.tags || parsed.tags.length === 0) && problemDetail?.tags) {
          parsed.tags = problemDetail.tags;
        }
      } catch {
        // Problem detail is optional, continue without it
      }

      // Generate AI explanation
      let explanation = null;
      if (explainer) {
        explanation = await explainer.generateExplanation({
          title: parsed.problemTitle,
          titleSlug: parsed.titleSlug,
          difficulty: parsed.difficulty,
          description: problemDetail?.content || '',
          code: parsed.code,
          language: parsed.language,
          tags: parsed.tags,
        });
      }

      // Determine ALL topic folders (not just primary)
      const topics = parsed.tags && parsed.tags.length > 0 ? parsed.tags : ['Uncategorized'];
      const primaryTopic = topics[0];
      const problemDir = problemFolderName(parsed.problemId, parsed.problemTitle);
      const ext = langExtension(parsed.language);

      // Generate the full README once
      const readmeContent = generateProblemReadme(parsed, problemDetail, explanation);

      // Write to ALL topic folders
      for (let t = 0; t < topics.length; t++) {
        const topic = topics[t];
        const topicDir = topicFolderName(topic);
        const fullDir = path.join(outputDir, topicDir, problemDir);
        ensureDir(fullDir);

        // Write solution file in every topic folder
        await writeFile(path.join(fullDir, `solution${ext}`), parsed.code);

        if (t === 0) {
          // Primary folder: full README
          await writeFile(path.join(fullDir, 'README.md'), readmeContent);
        } else {
          // Secondary folders: full README + cross-reference header
          const primaryPath = `../../${topicFolderName(primaryTopic)}/${problemDir}`;
          const crossRef = `> 📌 **Cross-listed:** Primary location is [${primaryTopic}/${problemDir}](${primaryPath}). ` +
            `This problem also appears under: ${topics.map(tt => `**${tt}**`).join(', ')}\n\n`;
          await writeFile(path.join(fullDir, 'README.md'), crossRef + readmeContent);
        }
      }

      allSubmissions.push(parsed);
    } catch (err) {
      errors.push(`${prob.title || prob.titleSlug}: ${err.message}`);
    }
  }

  Logger.blank();

  // Step 5: Generate main README
  Logger.sync('Generating main README...');
  const mainReadme = generateMainReadme(allSubmissions, config);
  await writeFile(path.join(outputDir, 'README.md'), mainReadme);
  Logger.success('Main README generated');

  // Write .gitignore for output repo
  const outputGitignore = `.cache/\n`;
  await writeFile(path.join(outputDir, '.gitignore'), outputGitignore);

  // Step 6: Git operations
  Logger.sync('Setting up git repository...');
  const repo = new GitRepo(outputDir);
  await repo.init();

  if (config.sync.autoCommit) {
    const committed = await repo.commitBatch(allSubmissions);
    if (committed) {
      Logger.success(`Committed ${allSubmissions.length} solutions`);
    }
  }

  // Update last sync timestamp
  config.sync.lastSyncTimestamp = Math.floor(Date.now() / 1000);
  await saveConfig(config);

  // Summary
  const elapsed = Math.round((Date.now() - startTime) / 1000);
  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;

  Logger.blank();
  Logger.header('Import Complete');
  Logger.stats('Problems imported', allSubmissions.length, 'green');
  Logger.stats('Errors', errors.length, errors.length > 0 ? 'red' : 'green');
  Logger.stats('Time taken', `${minutes}m ${seconds}s`, 'cyan');
  Logger.stats('Output directory', outputDir, 'cyan');

  if (errors.length > 0) {
    Logger.blank();
    Logger.warn('Problems that failed:');
    errors.slice(0, 15).forEach(e => Logger.step(0, 0, e));
    if (errors.length > 15) {
      Logger.info(`... and ${errors.length - 15} more errors`);
    }
  }

  Logger.blank();
  Logger.info('Next steps:');
  Logger.step(1, 3, 'Review the output directory');
  Logger.step(2, 3, 'Add remote: cd output && git remote add origin <your-repo-url>');
  Logger.step(3, 3, 'Push: git push -u origin main');
}

export { importAll };
