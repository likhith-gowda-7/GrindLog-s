import path from 'path';
import { LeetCodeClient } from '../leetcode/client.js';
import { parseSubmissionDetail, parseProblemDetail, deduplicateSubmissions } from '../leetcode/parser.js';
import { generateProblemReadme, generateMainReadme } from '../github/readme-generator.js';
import { Explainer } from '../ai/explainer.js';
import { GitRepo } from '../github/repo.js';
import { Logger } from '../utils/logger.js';
import {
  writeFile,
  readFile,
  fileExists,
  ensureDir,
  problemFolderName,
  topicFolderName,
  langExtension,
  listDirs,
  listFiles,
} from '../utils/file-helpers.js';
import { loadConfig, saveConfig } from '../utils/config.js';

/**
 * Incremental sync — fetches only NEW submissions since last sync.
 * This is what runs every 6 hours via GitHub Actions or manually.
 */
async function syncNew(options = {}) {
  const config = await loadConfig();
  const { push = false } = options;

  Logger.header('GrindLog — Sync');

  // Initialize client
  const client = new LeetCodeClient({
    username: config.leetcode.username,
    session: config.leetcode.session,
    csrfToken: config.leetcode.csrfToken,
  });

  // Test connection
  const profile = await client.fetchProfile();
  if (!profile) {
    Logger.error('Failed to connect to LeetCode. Your cookies may have expired.');
    Logger.info('Run `grindlog setup` to refresh cookies.');
    process.exit(1);
  }
  Logger.success(`Connected as: ${profile.username}`);

  // Fetch recent submissions
  const recentSubs = await client.fetchRecentSubmissions(50);
  Logger.info(`Fetched ${recentSubs.length} recent accepted submissions`);

  // Filter to only new ones since last sync
  const lastSync = config.sync.lastSyncTimestamp || 0;
  const newSubs = recentSubs.filter(s => parseInt(s.timestamp, 10) > lastSync);

  if (newSubs.length === 0) {
    Logger.success('Already up to date! No new submissions since last sync.');
    return;
  }

  Logger.sync(`Found ${newSubs.length} new submission(s) to sync`);

  // Deduplicate (keep latest per problem)
  const uniqueProblems = new Map();
  for (const sub of newSubs) {
    if (!uniqueProblems.has(sub.titleSlug) ||
      parseInt(sub.timestamp, 10) > parseInt(uniqueProblems.get(sub.titleSlug).timestamp, 10)) {
      uniqueProblems.set(sub.titleSlug, sub);
    }
  }

  const problemList = Array.from(uniqueProblems.values());
  const outputDir = config.github.outputDir;
  ensureDir(outputDir);

  // Setup AI explainer
  let explainer = null;
  if (config.ai.geminiApiKey || config.ai.openaiApiKey) {
    const cacheDir = path.join(outputDir, '.cache', 'explanations');
    ensureDir(cacheDir);
    explainer = new Explainer({
      provider: config.ai.provider,
      geminiApiKey: config.ai.geminiApiKey,
      openaiApiKey: config.ai.openaiApiKey,
      groqApiKey: config.ai.groqApiKey,
      cacheDir,
    });
    if (!explainer.isReady()) explainer = null;
  }

  // Process each new submission
  const synced = [];
  const errors = [];

  for (let i = 0; i < problemList.length; i++) {
    const sub = problemList[i];
    Logger.progress(i + 1, problemList.length, sub.title?.slice(0, 40) || sub.titleSlug);

    try {
      // Fetch full submission detail
      const detail = await client.fetchSubmissionDetail(sub.id);
      if (!detail || !detail.code) {
        errors.push(`${sub.title}: No code found`);
        continue;
      }

      const parsed = parseSubmissionDetail(detail);
      if (!parsed) continue;

      // Fetch problem description
      let problemDetail = null;
      try {
        const rawProblem = await client.fetchProblemDetail(parsed.titleSlug);
        problemDetail = parseProblemDetail(rawProblem);
        if ((!parsed.tags || parsed.tags.length === 0) && problemDetail?.tags) {
          parsed.tags = problemDetail.tags;
        }
      } catch {
        // Optional
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

      // Write to ALL topic folders (not just primary)
      const topics = parsed.tags && parsed.tags.length > 0 ? parsed.tags : ['Uncategorized'];
      const primaryTopic = topics[0];
      const problemDir = problemFolderName(parsed.problemId, parsed.problemTitle);
      const ext = langExtension(parsed.language);

      // Generate the full README once
      const readmeContent = generateProblemReadme(parsed, problemDetail, explanation);

      for (let t = 0; t < topics.length; t++) {
        const topic = topics[t];
        const topicDir = topicFolderName(topic);
        const fullDir = path.join(outputDir, topicDir, problemDir);
        ensureDir(fullDir);

        // Write solution file in every topic folder
        await writeFile(path.join(fullDir, `solution${ext}`), parsed.code);

        if (t === 0) {
          await writeFile(path.join(fullDir, 'README.md'), readmeContent);
        } else {
          const primaryPath = `../../${topicFolderName(primaryTopic)}/${problemDir}`;
          const crossRef = `> 📌 **Cross-listed:** Primary location is [${primaryTopic}/${problemDir}](${primaryPath}). ` +
            `This problem also appears under: ${topics.map(tt => `**${tt}**`).join(', ')}\n\n`;
          await writeFile(path.join(fullDir, 'README.md'), crossRef + readmeContent);
        }
      }

      synced.push(parsed);
    } catch (err) {
      errors.push(`${sub.title || sub.titleSlug}: ${err.message}`);
    }
  }

  Logger.blank();

  if (synced.length > 0) {
    // Rebuild main README with ALL submissions
    Logger.sync('Rebuilding main README...');
    const allSubmissions = await collectAllSubmissions(outputDir);
    const mainReadme = generateMainReadme(allSubmissions, config);
    await writeFile(path.join(outputDir, 'README.md'), mainReadme);
    Logger.success('Main README updated');

    // Git commit
    const repo = new GitRepo(outputDir);
    await repo.init();

    if (synced.length === 1) {
      await repo.commitProblem(synced[0]);
    } else {
      await repo.commitBatch(synced);
    }

    // Push if requested
    if (push) {
      const hasRemote = await repo.hasRemote();
      if (hasRemote) {
        await repo.push();
      } else {
        Logger.warn('No git remote configured. Skipping push.');
        Logger.info('Add a remote: cd output && git remote add origin <url>');
      }
    }
  }

  // Update last sync timestamp
  config.sync.lastSyncTimestamp = Math.floor(Date.now() / 1000);
  await saveConfig(config);

  // Summary
  Logger.blank();
  Logger.header('Sync Complete');
  Logger.stats('New problems synced', synced.length, 'green');
  Logger.stats('Errors', errors.length, errors.length > 0 ? 'red' : 'green');

  if (errors.length > 0) {
    errors.forEach(e => Logger.warn(`  ${e}`));
  }
}

/**
 * Collect all existing submissions from the output directory.
 * Reads problem READMEs to extract metadata.
 * This is used to rebuild the main README after incremental syncs.
 */
async function collectAllSubmissions(outputDir) {
  const submissions = [];
  const seen = new Set(); // Deduplicate cross-listed problems
  const topicDirs = await listDirs(outputDir);

  for (const topicDir of topicDirs) {
    if (topicDir.startsWith('.')) continue; // Skip hidden dirs

    const topicPath = path.join(outputDir, topicDir);
    const problemDirs = await listDirs(topicPath);

    for (const problemDir of problemDirs) {
      const problemPath = path.join(topicPath, problemDir);

      // Try to read solution files
      const files = await listFiles(problemPath);
      const solutionFile = files.find(f => f.startsWith('solution'));

      if (!solutionFile) continue;

      // Extract problem number and title from folder name (e.g., "0001-Two-Sum")
      const match = problemDir.match(/^(\d+)-(.+)$/);
      if (!match) continue;

      const problemId = String(parseInt(match[1], 10)); // Remove leading zeros

      // Skip if already seen (cross-listed in another topic)
      if (seen.has(problemId)) continue;
      seen.add(problemId);

      const problemTitle = match[2].replace(/-/g, ' ');
      const titleSlug = match[2].toLowerCase();

      // Determine language from extension
      const ext = path.extname(solutionFile);
      const lang = extToLang(ext);

      // Try to read README for more details
      const readmeContent = await readFile(path.join(problemPath, 'README.md'));
      let difficulty = 'Unknown';
      let tags = [topicDir.replace(/-/g, ' ')];

      if (readmeContent) {
        // Extract difficulty from badge
        const diffMatch = readmeContent.match(/Difficulty-(\w+)/);
        if (diffMatch) difficulty = diffMatch[1];

        // Extract tags from badges
        const tagMatches = [...readmeContent.matchAll(/badge\/([^-]+)-purple/g)];
        if (tagMatches.length > 0) {
          tags = tagMatches.map(m => decodeURIComponent(m[1]).replace(/--/g, '-'));
        }
      }

      submissions.push({
        problemId,
        problemTitle,
        titleSlug,
        difficulty,
        tags,
        language: lang,
        languageDisplay: lang,
        runtime: 'N/A',
        memory: 'N/A',
        date: '',
        timestamp: 0,
        runtimePercentile: null,
        memoryPercentile: null,
      });
    }
  }

  return submissions;
}

function extToLang(ext) {
  const map = {
    '.py': 'Python',
    '.java': 'Java',
    '.cpp': 'C++',
    '.c': 'C',
    '.js': 'JavaScript',
    '.ts': 'TypeScript',
    '.go': 'Go',
    '.rs': 'Rust',
    '.rb': 'Ruby',
    '.swift': 'Swift',
    '.kt': 'Kotlin',
    '.cs': 'C#',
    '.sql': 'SQL',
  };
  return map[ext] || ext.replace('.', '');
}

export { syncNew, collectAllSubmissions };
