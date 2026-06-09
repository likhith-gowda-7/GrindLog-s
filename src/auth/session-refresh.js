/**
 * @module session-refresh
 * @description Interactive Session Refresh — visible browser-based authentication.
 *
 * This module launches a VISIBLE browser window for the user to authenticate
 * with LeetCode. GrindLog never sees, captures, or stores passwords.
 *
 * How it works:
 * 1. Opens a real browser window (Edge/Chrome — NOT headless)
 * 2. Navigates to leetcode.com
 * 3. If user is already logged in → extracts session cookies instantly
 * 4. If not → user manually logs in (GrindLog waits patiently)
 * 5. Once authenticated, extracts ONLY the 2 required cookies
 * 6. Encrypts and stores them locally
 * 7. Closes the browser
 *
 * Security guarantees:
 * - Browser is ALWAYS visible — user sees everything
 * - NO password capture, NO keystroke logging
 * - NO CAPTCHA solving, NO MFA bypass
 * - User controls the entire login process
 * - Only extracts LEETCODE_SESSION + csrftoken after auth is complete
 */

import puppeteer from 'puppeteer-core';
import { detectBrowser } from './browser-detector.js';
import { SessionManager } from './session-manager.js';
import { Logger } from '../utils/logger.js';

const LEETCODE_URL = 'https://leetcode.com';
const AUTH_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes max wait for login
const POLL_INTERVAL_MS = 2000; // Check for auth every 2 seconds

/**
 * Launch the Interactive Session Refresh flow.
 *
 * Opens a visible browser, waits for authentication, extracts session cookies.
 *
 * @returns {Promise<{ success: boolean, error: string|null }>}
 */
async function interactiveSessionRefresh() {
  // Step 1: Detect browser
  const browser = detectBrowser();
  if (!browser) {
    return {
      success: false,
      error: 'No compatible browser found. Please install Microsoft Edge, Google Chrome, or Brave.',
    };
  }

  Logger.info(`Browser detected: ${browser.name}`);
  Logger.info('Opening browser for LeetCode authentication...');
  Logger.info('Please log in if prompted. GrindLog will wait.');
  Logger.blank();
  Logger.info('🔒 GrindLog never sees your password.');
  Logger.info('   You are logging in directly on leetcode.com.');
  Logger.info('   Only session cookies are extracted after you authenticate.');
  Logger.blank();

  let browserInstance = null;

  try {
    // Step 2: Launch VISIBLE browser (NOT headless)
    browserInstance = await puppeteer.launch({
      executablePath: browser.path,
      headless: false,
      defaultViewport: null,
      args: [
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-blink-features=AutomationControlled',
        '--start-maximized',
      ],
      ignoreDefaultArgs: ['--enable-automation'],
    });

    const page = (await browserInstance.pages())[0] || await browserInstance.newPage();

    // Remove automation indicators for a clean experience
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
    });

    // Step 3: Navigate to LeetCode
    Logger.sync('Navigating to leetcode.com...');
    await page.goto(LEETCODE_URL, { waitUntil: 'networkidle2', timeout: 30000 });

    // Step 4: Check if already authenticated
    let session = await extractSessionCookies(page);

    if (session) {
      Logger.success('Already logged in! Session extracted automatically.');
      SessionManager.saveSession(session);
      await browserInstance.close();
      return { success: true, error: null };
    }

    // Step 5: Navigate to login page
    Logger.info('Not logged in. Redirecting to login page...');
    await page.goto(`${LEETCODE_URL}/accounts/login/`, {
      waitUntil: 'networkidle2',
      timeout: 30000,
    });

    Logger.blank();
    Logger.info('🌐 Browser opened — waiting for you to log in...');
    Logger.info('   (Timeout: 5 minutes)');

    // Step 6: Poll for authentication (user logs in manually)
    const startTime = Date.now();

    while (Date.now() - startTime < AUTH_TIMEOUT_MS) {
      await sleep(POLL_INTERVAL_MS);

      // Check if browser was closed by user
      if (!browserInstance.connected) {
        return { success: false, error: 'Browser was closed before authentication completed.' };
      }

      // Check for successful authentication
      session = await extractSessionCookies(page);
      if (session) {
        Logger.blank();
        Logger.success('Authentication detected!');
        SessionManager.saveSession(session);
        await browserInstance.close();
        return { success: true, error: null };
      }

      // Show progress dot
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      if (elapsed % 10 === 0 && elapsed > 0) {
        Logger.info(`  Still waiting... (${elapsed}s elapsed)`);
      }
    }

    // Timeout
    await browserInstance.close();
    return { success: false, error: 'Authentication timed out after 5 minutes.' };

  } catch (err) {
    console.error('Interactive session refresh error details:', err);
    if (browserInstance && browserInstance.connected) {
      await browserInstance.close().catch(() => {});
    }
    return { success: false, error: `Session refresh failed: ${err.message}` };
  }
}

/**
 * Extract LEETCODE_SESSION and csrftoken cookies from the current page.
 * Returns null if the required cookies are not present (user not logged in).
 *
 * @param {import('puppeteer-core').Page} page
 * @returns {Promise<{ session: string, csrfToken: string } | null>}
 */
async function extractSessionCookies(page) {
  try {
    const cookies = await page.cookies('https://leetcode.com');

    const sessionCookie = cookies.find(c => c.name === 'LEETCODE_SESSION');
    const csrfCookie = cookies.find(c => c.name === 'csrftoken');

    if (sessionCookie?.value && csrfCookie?.value) {
      // Verify it's a real session (not a default/empty one)
      if (sessionCookie.value.length > 50) {
        return {
          session: sessionCookie.value,
          csrfToken: csrfCookie.value,
        };
      }
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Sleep utility.
 * @param {number} ms
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export { interactiveSessionRefresh };
