import simpleGit from 'simple-git';
import path from 'path';
import { Logger } from '../utils/logger.js';
import { ensureDir, fileExists } from '../utils/file-helpers.js';

class GitRepo {
  /**
   * @param {string} repoPath - Path to the git repository (output dir)
   */
  constructor(repoPath) {
    this.repoPath = repoPath;
    ensureDir(repoPath);
    this.git = simpleGit(repoPath);
  }

  /**
   * Initialize git repo if not already initialized.
   */
  async init() {
    const isRepo = await this.git.checkIsRepo().catch(() => false);
    if (!isRepo) {
      await this.git.init();
      Logger.info('Initialized new git repository');
    }
  }

  /**
   * Stage all changes and commit.
   * @param {string} message - Commit message
   * @returns {boolean} True if a commit was made
   */
  async commit(message) {
    try {
      await this.git.add('.');
      const status = await this.git.status();

      if (status.isClean()) {
        return false; // Nothing to commit
      }

      await this.git.commit(message);
      return true;
    } catch (err) {
      Logger.error(`Git commit failed: ${err.message}`);
      return false;
    }
  }

  /**
   * Push to remote.
   * @param {string} [remote] - Remote name
   * @param {string} [branch] - Branch name
   */
  async push(remote = 'origin', branch = 'main') {
    try {
      await this.git.push(remote, branch);
      Logger.success(`Pushed to ${remote}/${branch}`);
    } catch (err) {
      Logger.error(`Git push failed: ${err.message}`);
      Logger.info('Make sure you have a remote configured: git remote add origin <your-repo-url>');
      throw err;
    }
  }

  /**
   * Commit a single problem addition.
   * @param {object} submission - Problem data
   */
  async commitProblem(submission) {
    const emoji = submission.difficulty === 'Easy' ? '🟢' : submission.difficulty === 'Medium' ? '🟡' : '🔴';
    const msg = `${emoji} Add: ${submission.problemId}. ${submission.problemTitle} (${submission.difficulty})`;
    return this.commit(msg);
  }

  /**
   * Commit a batch of problems.
   * @param {object[]} submissions - Array of problem data
   */
  async commitBatch(submissions) {
    if (submissions.length === 0) return false;
    if (submissions.length === 1) return this.commitProblem(submissions[0]);

    // Keep commit message short to avoid ENAMETOOLONG on Windows
    const msg = `✅ Add ${submissions.length} LeetCode solutions`;
    return this.commit(msg);
  }

  /**
   * Commit README update.
   */
  async commitReadmeUpdate() {
    return this.commit('📊 Update README stats and problem index');
  }

  /**
   * Check if remote is configured.
   */
  async hasRemote() {
    try {
      const remotes = await this.git.getRemotes(true);
      return remotes.length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Get current status summary.
   */
  async getStatus() {
    try {
      const status = await this.git.status();
      return {
        isClean: status.isClean(),
        created: status.created.length,
        modified: status.modified.length,
        deleted: status.deleted.length,
        total: status.files.length,
      };
    } catch {
      return { isClean: true, created: 0, modified: 0, deleted: 0, total: 0 };
    }
  }

  /**
   * Get commit count.
   */
  async getCommitCount() {
    try {
      const log = await this.git.log();
      return log.total;
    } catch {
      return 0;
    }
  }
}

export { GitRepo };
