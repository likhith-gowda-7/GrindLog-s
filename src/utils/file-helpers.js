import fs from 'fs/promises';
import { existsSync, mkdirSync } from 'fs';
import path from 'path';

/**
 * Ensure a directory exists, creating it and all parents if necessary.
 */
function ensureDir(dirPath) {
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Write content to a file, creating parent directories if needed.
 */
async function writeFile(filePath, content) {
  ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, content, 'utf-8');
}

/**
 * Read a file's content. Returns null if file doesn't exist.
 */
async function readFile(filePath) {
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch {
    return null;
  }
}

/**
 * Check if a file exists.
 */
function fileExists(filePath) {
  return existsSync(filePath);
}

/**
 * List all directories in a given path.
 */
async function listDirs(dirPath) {
  if (!existsSync(dirPath)) return [];
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  return entries.filter(e => e.isDirectory()).map(e => e.name);
}

/**
 * List all files in a given path (non-recursive).
 */
async function listFiles(dirPath) {
  if (!existsSync(dirPath)) return [];
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  return entries.filter(e => e.isFile()).map(e => e.name);
}

/**
 * Recursively count files in a directory.
 */
async function countFiles(dirPath) {
  if (!existsSync(dirPath)) return 0;
  let count = 0;
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isFile()) {
      count++;
    } else if (entry.isDirectory()) {
      count += await countFiles(path.join(dirPath, entry.name));
    }
  }
  return count;
}

/**
 * Sanitize a string for use as a filename/directory name.
 * Replaces special characters, trims, and normalizes spaces.
 */
function sanitizeFilename(name) {
  return name
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .trim();
}

/**
 * Convert a problem title to a folder name.
 * e.g., "Two Sum" with number 1 => "0001-Two-Sum"
 */
function problemFolderName(number, title) {
  const paddedNum = String(number).padStart(4, '0');
  const sanitized = sanitizeFilename(title);
  return `${paddedNum}-${sanitized}`;
}

/**
 * Sanitize a topic/tag name for use as a directory.
 * e.g., "Dynamic Programming" => "Dynamic-Programming"
 */
function topicFolderName(topic) {
  return sanitizeFilename(topic);
}

/**
 * Get the file extension for a given language.
 */
function langExtension(lang) {
  const map = {
    python: '.py',
    python3: '.py',
    java: '.java',
    cpp: '.cpp',
    'c++': '.cpp',
    c: '.c',
    javascript: '.js',
    typescript: '.ts',
    go: '.go',
    rust: '.rs',
    ruby: '.rb',
    swift: '.swift',
    kotlin: '.kt',
    scala: '.scala',
    csharp: '.cs',
    php: '.php',
    dart: '.dart',
    sql: '.sql',
    mysql: '.sql',
    bash: '.sh',
    r: '.r',
    racket: '.rkt',
    erlang: '.erl',
    elixir: '.ex',
  };
  return map[lang.toLowerCase()] || `.${lang.toLowerCase()}`;
}

/**
 * Get a display-friendly language name.
 */
function langDisplay(lang) {
  const map = {
    python: 'Python',
    python3: 'Python',
    java: 'Java',
    cpp: 'C++',
    'c++': 'C++',
    c: 'C',
    javascript: 'JavaScript',
    typescript: 'TypeScript',
    go: 'Go',
    rust: 'Rust',
    ruby: 'Ruby',
    swift: 'Swift',
    kotlin: 'Kotlin',
    scala: 'Scala',
    csharp: 'C#',
    php: 'PHP',
    mysql: 'MySQL',
    sql: 'SQL',
  };
  return map[lang.toLowerCase()] || lang;
}

export {
  ensureDir,
  writeFile,
  readFile,
  fileExists,
  listDirs,
  listFiles,
  countFiles,
  sanitizeFilename,
  problemFolderName,
  topicFolderName,
  langExtension,
  langDisplay,
};
