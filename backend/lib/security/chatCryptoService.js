import { spawn } from 'child_process';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BRIDGE_SCRIPT_PATH = path.resolve(__dirname, '../../scripts/crypto101_bridge.py');

function runPythonBridge(args, stdinPayload = null) {
  return new Promise((resolve, reject) => {
    const pythonCmd = process.env.PYTHON_PATH || 'python';
    const child = spawn(pythonCmd, [BRIDGE_SCRIPT_PATH, ...args], {
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';

    if (stdinPayload !== null) {
      child.stdin.write(typeof stdinPayload === 'string' ? stdinPayload : JSON.stringify(stdinPayload));
      child.stdin.end();
    }

    child.stdout.on('data', (data) => {
      stdout += data.toString('utf8');
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString('utf8');
    });

    child.on('error', (err) => {
      reject(new Error(`Failed to run crypto101 bridge: ${err.message}`));
    });

    child.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(`crypto101 bridge exited with code ${code}: ${stderr || stdout}`));
      }
      try {
        const parsed = JSON.parse(stdout.trim());
        resolve(parsed);
      } catch (err) {
        reject(new Error(`crypto101 bridge invalid JSON output: ${stdout}`));
      }
    });
  });
}

/**
 * Generate an ECC key pair using crypto101/ecc.py
 */
export async function generateEccKeypair() {
  return await runPythonBridge(['ecc-generate-keys']);
}

/**
 * Generate a shared AES-256 session key and encrypt it for both Student and Advisor
 * using ECC ElGamal from crypto101/ecc.py
 */
export async function createSessionKeys(studentPublicKey, advisorPublicKey) {
  const res = await runPythonBridge(['ecc-create-session-keys'], {
    studentPublicKey,
    advisorPublicKey,
  });
  return {
    studentEncryptedKey: res.studentEncryptedKey,
    advisorEncryptedKey: res.advisorEncryptedKey,
    aesKeyHex: res.aesKeyHex,
  };
}

/**
 * Decrypt the session key using the user's private key via crypto101/ecc.py
 */
export async function decryptSessionKey(privateKey, encryptedKey) {
  const res = await runPythonBridge(['ecc-decrypt-session-key'], {
    privateKey,
    encryptedKey,
  });
  return res.aesKeyHex;
}

/**
 * Encrypt a chat message using AES-256-GCM (standard Node.js crypto library)
 */
export function encryptMessage(plaintext, aesKeyHex) {
  const text = String(plaintext ?? '');
  const key = Buffer.from(aesKeyHex, 'hex');
  const iv = crypto.randomBytes(12);

  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    ciphertext: encrypted.toString('hex'),
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex'),
  };
}

/**
 * Decrypt a chat message using AES-256-GCM (standard Node.js crypto library)
 */
export function decryptMessage(ciphertextHex, ivHex, authTagHex, aesKeyHex) {
  const key = Buffer.from(aesKeyHex, 'hex');
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const ciphertext = Buffer.from(ciphertextHex, 'hex');

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString('utf8');
}

function getChatMacKey(aesKeyHex) {
  return crypto
    .createHmac('sha256', Buffer.from(aesKeyHex, 'hex'))
    .update('connected-secured-chat-mac-v1', 'utf8')
    .digest();
}

function getChatMacInput(sessionId, senderRole, senderId, ciphertext, iv, authTag) {
  return JSON.stringify([String(sessionId), senderRole, String(senderId), ciphertext, iv, authTag]);
}

export function createChatMac(sessionId, senderRole, senderId, ciphertext, iv, authTag, aesKeyHex) {
  return crypto
    .createHmac('sha256', getChatMacKey(aesKeyHex))
    .update(getChatMacInput(sessionId, senderRole, senderId, ciphertext, iv, authTag), 'utf8')
    .digest('hex');
}

export function verifyChatMac(mac, sessionId, senderRole, senderId, ciphertext, iv, authTag, aesKeyHex) {
  if (!mac) return false;
  const expected = createChatMac(sessionId, senderRole, senderId, ciphertext, iv, authTag, aesKeyHex);
  const actualBuffer = Buffer.from(mac, 'hex');
  const expectedBuffer = Buffer.from(expected, 'hex');
  return actualBuffer.length === expectedBuffer.length
    && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}
