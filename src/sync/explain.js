import path from 'path';
import fs from 'fs/promises';
import { existsSync, mkdirSync, readdirSync, statSync } from 'fs';
import { Explainer } from '../ai/explainer.js';
import { Logger } from '../utils/logger.js';
import { loadConfig } from '../utils/config.js';
import { readFile, writeFile, ensureDir, topicFolderName, problemFolderName } from '../utils/file-helpers.js';

/**
 * Add AI explanations to ALL existing solutions that don't have them yet.
 * This walks the output directory — no LeetCode API calls needed.
 *
 * Strategy:
 * 1. Walk all topic/problem folders in output/
 * 2. For each problem, check if README already has "## 🧠 Solution Explanation"
 * 3. If not, read the solution code + README metadata
 * 4. Generate AI explanation
 * 5. Insert explanation into the README
 * 6. Update all cross-listed copies too
 */
async function addExplanations(options = {}) {
  const config = await loadConfig();
  const { limit = 0, dryRun = false } = options;
  const outputDir = config.github.outputDir;

  Logger.header('GrindLog — Add AI Explanations');

  // Setup AI explainer
  const cacheDir = path.join(outputDir, '.cache', 'explanations');
  ensureDir(cacheDir);

  const explainer = new Explainer({
    provider: config.ai.provider,
    geminiApiKey: config.ai.geminiApiKey,
    openaiApiKey: config.ai.openaiApiKey,
    groqApiKey: config.ai.groqApiKey,
    cacheDir,
  });

  if (!explainer.isReady()) {
    Logger.error('AI is not configured. Run `grindlog setup` and provide an API key.');
    return;
  }
  Logger.success(`AI provider: ${config.ai.provider}`);

  // Collect all problem folders (deduplicated by problem ID — only process primary)
  const problems = [];
  const seen = new Set();
  const topicDirs = readdirSync(outputDir).filter(d => {
    const p = path.join(outputDir, d);
    return statSync(p).isDirectory() && !d.startsWith('.') && d !== '.cache';
  });

  for (const topicDir of topicDirs) {
    const topicPath = path.join(outputDir, topicDir);
    const problemDirs = readdirSync(topicPath).filter(d => {
      return statSync(path.join(topicPath, d)).isDirectory() && /^\d{4}-/.test(d);
    });

    for (const problemDir of problemDirs) {
      // Extract problem ID to deduplicate
      const match = problemDir.match(/^(\d+)-/);
      if (!match) continue;
      const problemId = match[1];

      if (seen.has(problemId)) continue;
      seen.add(problemId);

      const fullPath = path.join(topicPath, problemDir);
      const readmePath = path.join(fullPath, 'README.md');
      
      if (!existsSync(readmePath)) continue;

      // Check if explanation already exists
      const readmeContent = await readFile(readmePath);
      if (readmeContent && readmeContent.includes('## 🧠 Solution Explanation')) {
        continue; // Already has explanation
      }

      // Find solution file
      const files = readdirSync(fullPath);
      const solutionFile = files.find(f => f.startsWith('solution'));
      if (!solutionFile) continue;

      const code = await readFile(path.join(fullPath, solutionFile));
      if (!code) continue;

      // Extract metadata from README
      const diffMatch = readmeContent.match(/Difficulty-(\w+)/);
      const difficulty = diffMatch ? diffMatch[1] : 'Unknown';

      const tagMatches = [...readmeContent.matchAll(/badge\/([^-]+)-purple/g)];
      const tags = tagMatches.map(m => decodeURIComponent(m[1]).replace(/--/g, '-'));

      const titleMatch = readmeContent.match(/^# (\d+)\. (.+)/m);
      const problemTitle = titleMatch ? titleMatch[2].trim() : problemDir.replace(/^\d+-/, '').replace(/-/g, ' ');
      const titleSlug = problemDir.replace(/^\d+-/, '').toLowerCase().replace(/ /g, '-');

      // Determine language from file extension
      const ext = path.extname(solutionFile);
      const langMap = { '.py': 'Python', '.java': 'Java', '.cpp': 'C++', '.js': 'JavaScript', '.ts': 'TypeScript', '.sql': 'SQL', '.c': 'C' };
      const language = langMap[ext] || ext.replace('.', '');

      // Get problem description from README
      const descMatch = readmeContent.match(/## 📝 Problem Description\n\n([\s\S]*?)(?=\n## )/);
      const description = descMatch ? descMatch[1].slice(0, 800) : '';

      problems.push({
        problemId,
        problemDir,
        topicDir,
        fullPath,
        readmePath,
        readmeContent,
        code,
        title: problemTitle,
        titleSlug,
        difficulty,
        tags,
        language,
        description,
      });
    }
  }

  Logger.info(`Found ${problems.length} problems without AI explanations`);

  if (problems.length === 0) {
    Logger.success('All problems already have AI explanations!');
    return;
  }

  const toProcess = limit > 0 ? problems.slice(0, limit) : problems;
  Logger.info(`Processing ${toProcess.length} problems...`);
  Logger.blank();

  if (dryRun) {
    Logger.info('DRY RUN — no files will be modified');
    for (const p of toProcess.slice(0, 10)) {
      Logger.step(0, 0, `Would explain: ${p.problemId}. ${p.title}`);
    }
    if (toProcess.length > 10) Logger.info(`... and ${toProcess.length - 10} more`);
    return;
  }

  // Process each problem
  const successes = [];
  const failures = [];
  const startTime = Date.now();

  for (let i = 0; i < toProcess.length; i++) {
    const prob = toProcess[i];
    Logger.progress(i + 1, toProcess.length, prob.title?.slice(0, 40));

    try {
      const explanation = await explainer.generateExplanation({
        title: prob.title,
        titleSlug: prob.titleSlug,
        difficulty: prob.difficulty,
        description: prob.description,
        code: prob.code,
        language: prob.language,
        tags: prob.tags,
      });

      if (!explanation) {
        failures.push(`${prob.title}: No explanation generated`);
        continue;
      }

      // Insert explanation into README (before ## 📊 Metrics)
      const explSection = `## 🧠 Solution Explanation\n\n${explanation}`;
      let updatedReadme;

      if (prob.readmeContent.includes('## 📊 Metrics')) {
        updatedReadme = prob.readmeContent.replace('## 📊 Metrics', `${explSection}\n\n## 📊 Metrics`);
      } else {
        // Append to end
        updatedReadme = prob.readmeContent + '\n\n' + explSection;
      }

      // Write updated README to primary location
      await writeFile(prob.readmePath, updatedReadme);

      // Also update all cross-listed copies of this problem
      for (const topicDir of topicDirs) {
        const crossPath = path.join(outputDir, topicDir, prob.problemDir);
        if (crossPath === prob.fullPath) continue; // Skip primary
        const crossReadme = path.join(crossPath, 'README.md');
        if (!existsSync(crossReadme)) continue;

        const crossContent = await readFile(crossReadme);
        if (crossContent && !crossContent.includes('## 🧠 Solution Explanation')) {
          let updatedCross;
          if (crossContent.includes('## 📊 Metrics')) {
            updatedCross = crossContent.replace('## 📊 Metrics', `${explSection}\n\n## 📊 Metrics`);
          } else {
            updatedCross = crossContent + '\n\n' + explSection;
          }
          await writeFile(crossReadme, updatedCross);
        }
      }

      successes.push(prob.title);
    } catch (err) {
      failures.push(`${prob.title}: ${err.message}`);
    }
  }

  // Summary
  const elapsed = Math.round((Date.now() - startTime) / 1000);
  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;

  Logger.blank();
  Logger.header('AI Explanations Complete');
  Logger.stats('Explanations added', successes.length, 'green');
  Logger.stats('Failed', failures.length, failures.length > 0 ? 'red' : 'green');
  Logger.stats('Time taken', `${minutes}m ${seconds}s`, 'cyan');

  if (failures.length > 0) {
    Logger.blank();
    Logger.warn('Failures:');
    failures.slice(0, 10).forEach(f => Logger.step(0, 0, f));
    if (failures.length > 10) Logger.info(`... and ${failures.length - 10} more`);
  }
}

export { addExplanations };
