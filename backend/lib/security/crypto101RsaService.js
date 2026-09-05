import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BRIDGE_SCRIPT_PATH = path.resolve(__dirname, '../../scripts/crypto101_bridge.py');
const KEYS_FILE_PATH = path.resolve(__dirname, '../../config/registrar_rsa_keys.json');

let cachedKeys = null;

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
      reject(new Error(`Failed to start crypto101 Python bridge: ${err.message}`));
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

export async function ensureRegistrarKeys() {
  if (cachedKeys) return cachedKeys;

  if (fs.existsSync(KEYS_FILE_PATH)) {
    try {
      const raw = fs.readFileSync(KEYS_FILE_PATH, 'utf8');
      cachedKeys = JSON.parse(raw);
      if (cachedKeys?.publicKey?.e && cachedKeys?.privateKey?.d) {
        return cachedKeys;
      }
    } catch (e) {
      console.warn('Failed reading existing keys file, generating new keys:', e.message);
    }
  }

  // Generate new key pair using crypto101 rsa.generate_keypair()
  console.log('Generating Registrar RSA key pair using crypto101...');
  const keys = await runPythonBridge(['generate-keys', '512']);

  const configDir = path.dirname(KEYS_FILE_PATH);
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  fs.writeFileSync(KEYS_FILE_PATH, JSON.stringify(keys, null, 2), 'utf8');
  cachedKeys = keys;
  console.log('✅ Registrar RSA keys initialized and saved via crypto101.');
  return cachedKeys;
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

