/**
 * @module browser-detector
 * @description Auto-detect installed browsers for use with puppeteer-core.
 *
 * Searches for Edge, Chrome, and Brave on Windows, macOS, and Linux.
 * Returns the first available browser executable path.
 *
 * This avoids bundling a 300MB Chromium download with the project.
 * Instead, we reuse the browser the user already has installed.
 */

import fs from 'fs';
import { execSync } from 'child_process';
import os from 'os';

/**
 * Known browser paths by platform.
 */
const BROWSER_PATHS = {
  win32: [
    // Microsoft Edge (most common on Windows)
    `${process.env.PROGRAMFILES || 'C:\\Program Files'}\\Microsoft\\Edge\\Application\\msedge.exe`,
    `${process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)'}\\Microsoft\\Edge\\Application\\msedge.exe`,
    `${process.env.LOCALAPPDATA || ''}\\Microsoft\\Edge\\Application\\msedge.exe`,
    // Google Chrome
    `${process.env.PROGRAMFILES || 'C:\\Program Files'}\\Google\\Chrome\\Application\\chrome.exe`,
    `${process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)'}\\Google\\Chrome\\Application\\chrome.exe`,
    `${process.env.LOCALAPPDATA || ''}\\Google\\Chrome\\Application\\chrome.exe`,
    // Brave
    `${process.env.PROGRAMFILES || 'C:\\Program Files'}\\BraveSoftware\\Brave-Browser\\Application\\brave.exe`,
    `${process.env.LOCALAPPDATA || ''}\\BraveSoftware\\Brave-Browser\\Application\\brave.exe`,
  ],
  darwin: [
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  ],
  linux: [], // Handled via `which` command
};

/**
 * Detect installed browser on Linux using `which`.
 * @returns {string|null} Browser executable path
 */
function detectLinuxBrowser() {
  const candidates = [
    'microsoft-edge',
    'microsoft-edge-stable',
    'google-chrome',
    'google-chrome-stable',
    'chromium',
    'chromium-browser',
    'brave-browser',
  ];

  for (const cmd of candidates) {
    try {
      const result = execSync(`which ${cmd}`, { encoding: 'utf8' }).trim();
      if (result && fs.existsSync(result)) {
        return result;
      }
    } catch {
      // Not found, try next
    }
  }

  return null;
}

/**
 * Detect the first available Chromium-based browser on this system.
 * @returns {{ path: string, name: string } | null} Browser info or null
 */
function detectBrowser() {
  const platform = os.platform();

  // Linux: use `which` to find browsers
  if (platform === 'linux') {
    const linuxPath = detectLinuxBrowser();
    if (linuxPath) {
      const name = linuxPath.includes('edge') ? 'Microsoft Edge'
        : linuxPath.includes('chrome') ? 'Google Chrome'
        : linuxPath.includes('brave') ? 'Brave'
        : 'Chromium';
      return { path: linuxPath, name };
    }
    return null;
  }

  // Windows & macOS: check known paths
  const paths = BROWSER_PATHS[platform] || [];

  for (const browserPath of paths) {
    if (browserPath && fs.existsSync(browserPath)) {
      const name = browserPath.toLowerCase().includes('edge') ? 'Microsoft Edge'
        : browserPath.toLowerCase().includes('chrome') ? 'Google Chrome'
        : browserPath.toLowerCase().includes('brave') ? 'Brave'
        : 'Browser';
      return { path: browserPath, name };
    }
  }

  return null;
}

/**
 * Get a human-readable summary of detected browser.
 * @returns {string} Browser name and path, or error message
 */
function getBrowserSummary() {
  const browser = detectBrowser();
  if (browser) {
    return `${browser.name} (${browser.path})`;
  }
  return 'No compatible browser found. Install Edge, Chrome, or Brave.';
}

export { detectBrowser, getBrowserSummary };
