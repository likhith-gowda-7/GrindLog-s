/**
 * @module crypto
 * @description Local encryption utilities for secure session storage.
 *
 * Uses AES-256-GCM with a machine-unique key derived from OS identity.
 * No external dependencies — uses Node.js built-in `crypto` module.
 *
 * Security model:
 * - Encryption key is derived from machine-specific data + a local salt
 * - Salt is generated once and stored in ~/.grindlog/.salt
 * - Data is encrypted at rest, decrypted only in memory when needed
 * - No passwords are ever stored or required
 */

import crypto from 'crypto';
import os from 'os';
import fs from 'fs';
import path from 'path';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const SALT_LENGTH = 32;
const TAG_LENGTH = 16;

/**
 * Get the GrindLog secure storage directory.
 * @returns {string} Path to ~/.grindlog/
 */
function getStorageDir() {
  const dir = path.join(os.homedir(), '.grindlog');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
  return dir;
}

/**
 * Get or generate the local salt file.
 * The salt is unique per machine installation and never leaves the device.
 * @returns {Buffer} Salt bytes
 */
function getOrCreateSalt() {
  const saltPath = path.join(getStorageDir(), '.salt');

  if (fs.existsSync(saltPath)) {
    return fs.readFileSync(saltPath);
  }

  // Generate a new random salt
  const salt = crypto.randomBytes(SALT_LENGTH);
  fs.writeFileSync(saltPath, salt, { mode: 0o600 });
  return salt;
}

/**
 * Derive an encryption key from machine-specific identity + salt.
 * This ensures encrypted data is only decryptable on this machine by this user.
 * @returns {Buffer} 32-byte encryption key
 */
function deriveKey() {
  const salt = getOrCreateSalt();
  const identity = `${os.hostname()}:${os.userInfo().username}:grindlog-v2`;
  return crypto.pbkdf2Sync(identity, salt, 100000, KEY_LENGTH, 'sha512');
}

/**
 * Encrypt data using AES-256-GCM.
 * @param {string} plaintext - Data to encrypt
 * @returns {string} Base64-encoded encrypted payload (iv + tag + ciphertext)
 */
function encrypt(plaintext) {
  const key = deriveKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'base64');
  encrypted += cipher.final('base64');

  const tag = cipher.getAuthTag();

  // Pack: iv (16) + tag (16) + ciphertext
  const payload = Buffer.concat([
    iv,
    tag,
    Buffer.from(encrypted, 'base64'),
  ]);

  return payload.toString('base64');
}

/**
 * Decrypt data encrypted with AES-256-GCM.
 * @param {string} encryptedPayload - Base64-encoded encrypted payload
 * @returns {string|null} Decrypted plaintext, or null if decryption fails
 */
function decrypt(encryptedPayload) {
  try {
    const key = deriveKey();
    const payload = Buffer.from(encryptedPayload, 'base64');

    // Unpack: iv (16) + tag (16) + ciphertext
    const iv = payload.subarray(0, IV_LENGTH);
    const tag = payload.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
    const ciphertext = payload.subarray(IV_LENGTH + TAG_LENGTH);

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);

    let decrypted = decipher.update(ciphertext);
    decrypted = Buffer.concat([decrypted, decipher.final()]);

    return decrypted.toString('utf8');
  } catch {
    return null;
  }
}

/**
 * Securely write encrypted data to a file.
 * @param {string} filename - Filename within ~/.grindlog/
 * @param {object} data - Object to encrypt and store
 */
function writeEncrypted(filename, data) {
  const filePath = path.join(getStorageDir(), filename);
  const encrypted = encrypt(JSON.stringify(data));
  fs.writeFileSync(filePath, encrypted, { mode: 0o600 });
}

/**
 * Read and decrypt data from a file.
 * @param {string} filename - Filename within ~/.grindlog/
 * @returns {object|null} Decrypted object, or null if file missing/corrupt
 */
function readEncrypted(filename) {
  const filePath = path.join(getStorageDir(), filename);

  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    const encrypted = fs.readFileSync(filePath, 'utf8');
    const decrypted = decrypt(encrypted);
    return decrypted ? JSON.parse(decrypted) : null;
  } catch {
    return null;
  }
}

/**
 * Delete an encrypted file.
 * @param {string} filename - Filename within ~/.grindlog/
 */
function deleteEncrypted(filename) {
  const filePath = path.join(getStorageDir(), filename);
  if (fs.existsSync(filePath)) {
    // Overwrite with random data before deleting (secure wipe)
    const size = fs.statSync(filePath).size;
    fs.writeFileSync(filePath, crypto.randomBytes(size));
    fs.unlinkSync(filePath);
  }
}

export {
  encrypt,
  decrypt,
  writeEncrypted,
  readEncrypted,
  deleteEncrypted,
  getStorageDir,
};
