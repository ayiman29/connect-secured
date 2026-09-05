import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BRIDGE_SCRIPT_PATH = path.resolve(__dirname, '../../scripts/crypto101_bridge.py');

// Key file for the registrar problem-report RSA pair (pre-existing).
const REGISTRAR_KEYS_FILE_PATH = path.resolve(__dirname, '../../config/registrar_rsa_keys.json');

// Dedicated key file for general server-side PII / TOTP encryption.
const SERVER_KEYS_FILE_PATH = path.resolve(__dirname, '../../config/server_rsa_keys.json');

let cachedRegistrarKeys = null;
let cachedServerKeys = null;

// ─── shared bridge helper ────────────────────────────────────────────────────

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

    child.stdout.on('data', (data) => { stdout += data.toString('utf8'); });
    child.stderr.on('data', (data) => { stderr += data.toString('utf8'); });
    child.on('error', (err) => {
      reject(new Error(`Failed to start crypto101 Python bridge: ${err.message}`));
    });
    child.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(`crypto101 bridge exited with code ${code}: ${stderr || stdout}`));
      }
      try {
        resolve(JSON.parse(stdout.trim()));
      } catch (err) {
        reject(new Error(`crypto101 bridge invalid JSON output: ${stdout}`));
      }
    });
  });
}

// ─── key-pair bootstrap helpers ──────────────────────────────────────────────

async function loadOrGenerateKeys(filePath, label) {
  if (fs.existsSync(filePath)) {
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      const keys = JSON.parse(raw);
      if (keys?.publicKey?.e && keys?.privateKey?.d) return keys;
    } catch (e) {
      console.warn(`Failed reading ${label} keys file, regenerating:`, e.message);
    }
  }

  console.log(`Generating ${label} RSA key pair using crypto101…`);
  const keys = await runPythonBridge(['generate-keys', '512']);

  const configDir = path.dirname(filePath);
  if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true });

  fs.writeFileSync(filePath, JSON.stringify(keys, null, 2), 'utf8');
  console.log(`✅ ${label} RSA keys initialized and saved via crypto101.`);
  return keys;
}

// ─── Registrar keys (problem-report encryption) ──────────────────────────────

export async function ensureRegistrarKeys() {
  if (!cachedRegistrarKeys) {
    cachedRegistrarKeys = await loadOrGenerateKeys(REGISTRAR_KEYS_FILE_PATH, 'Registrar');
  }
  return cachedRegistrarKeys;
}

export async function getRegistrarPublicKey() {
  const keys = await ensureRegistrarKeys();
  return keys.publicKey;
}

export async function encryptProblemReport(text) {
  const keys = await ensureRegistrarKeys();
  const res = await runPythonBridge(['encrypt'], {
    text: String(text || ''),
    publicKey: keys.publicKey,
  });
  return res.ciphertext;
}

export async function decryptProblemReport(ciphertext) {
  const keys = await ensureRegistrarKeys();
  const res = await runPythonBridge(['decrypt'], {
    ciphertext: String(ciphertext || ''),
    privateKey: keys.privateKey,
  });
  return res.plaintext;
}

// ─── Server keys (PII fields + TOTP secrets) ─────────────────────────────────

/**
 * Ensure the server RSA key pair exists (loaded from disk or freshly generated).
 * Called once at app startup so the key pair is always ready.
 */
export async function ensureServerKeys() {
  if (!cachedServerKeys) {
    cachedServerKeys = await loadOrGenerateKeys(SERVER_KEYS_FILE_PATH, 'Server PII');
  }
  return cachedServerKeys;
}

/**
 * Encrypt arbitrary plaintext using the server's RSA public key (crypto101).
 * Plaintext is chunked in 40-character blocks as required by the bridge.
 */
export async function encryptWithRsa(plaintext) {
  const keys = await ensureServerKeys();
  const res = await runPythonBridge(['encrypt'], {
    text: String(plaintext ?? ''),
    publicKey: keys.publicKey,
  });
  return res.ciphertext;
}

/**
 * Decrypt a ciphertext string that was produced by encryptWithRsa().
 * Uses the server's RSA private key (crypto101).
 */
export async function decryptWithRsa(ciphertext) {
  if (!ciphertext) return '';
  const keys = await ensureServerKeys();
  const res = await runPythonBridge(['decrypt'], {
    ciphertext: String(ciphertext),
    privateKey: keys.privateKey,
  });
  return res.plaintext;
}

export async function decryptWithRsaKey(ciphertext, privateKey) {
  const res = await runPythonBridge(['decrypt'], {
    ciphertext: String(ciphertext || ''),
    privateKey,
  });
  return res.plaintext;
}

export async function rotateServerKeys() {
  const currentKeys = await ensureServerKeys();
  const backupPath = `${SERVER_KEYS_FILE_PATH}.backup-${Date.now()}`;
  fs.copyFileSync(SERVER_KEYS_FILE_PATH, backupPath);
  const nextKeys = await runPythonBridge(['generate-keys', '512']);
  fs.writeFileSync(SERVER_KEYS_FILE_PATH, JSON.stringify(nextKeys, null, 2), 'utf8');
  cachedServerKeys = nextKeys;
  return { previousKeys: currentKeys, nextKeys, backupPath };
}
