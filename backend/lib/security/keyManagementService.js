import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  ensureServerKeys,
  encryptWithRsa,
  decryptWithRsaKey,
  rotateServerKeys,
} from './crypto101RsaService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const METADATA_PATH = path.resolve(__dirname, '../../config/server_key_metadata.json');
const CURRENT_VERSION = 'v1';
const ACTIVE_KEYS_PATH = path.resolve(__dirname, '../../config/server_rsa_keys.json');

function readMetadata() {
  try {
    return JSON.parse(fs.readFileSync(METADATA_PATH, 'utf8'));
  } catch {
    return { activeVersion: CURRENT_VERSION, retiredVersions: [] };
  }
}

function writeMetadata(metadata) {
  const directory = path.dirname(METADATA_PATH);
  if (!fs.existsSync(directory)) fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(METADATA_PATH, JSON.stringify(metadata, null, 2), 'utf8');
}

export async function initializeKeyManagement() {
  await ensureServerKeys();
  if (!fs.existsSync(METADATA_PATH)) {
    writeMetadata({ activeVersion: CURRENT_VERSION, retiredVersions: [] });
  }
  return readMetadata();
}

export function getActiveKeyVersion() {
  return readMetadata().activeVersion || CURRENT_VERSION;
}

export async function encryptWithManagedKey(plaintext) {
  await initializeKeyManagement();
  return `${getActiveKeyVersion()}:${await encryptWithRsa(plaintext)}`;
}

export async function decryptWithManagedKey(payload) {
  if (!payload) return '';
  const separator = payload.indexOf(':');
  const firstPart = separator > 0 ? payload.slice(0, separator) : '';
  const isLegacyRawRsa = /^\d+$/.test(firstPart);
  const version = separator > 0 && !isLegacyRawRsa ? firstPart : CURRENT_VERSION;
  const ciphertext = separator > 0 && !isLegacyRawRsa ? payload.slice(separator + 1) : payload;
  const metadata = readMetadata();
  const supported = [metadata.activeVersion, ...(metadata.retiredVersions || [])];
  if (!supported.includes(version)) throw new Error(`Unsupported server key version: ${version}`);
  const keyPath = version === metadata.activeVersion
    ? ACTIVE_KEYS_PATH
    : path.resolve(__dirname, `../../config/server_rsa_keys_${version}.json`);
  const keys = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
  return decryptWithRsaKey(ciphertext, keys.privateKey);
}

export async function rotateManagedKey() {
  const metadata = readMetadata();
  const currentVersion = metadata.activeVersion || CURRENT_VERSION;
  const nextVersion = `v${Number(currentVersion.replace(/^v/, '')) + 1}`;
  const rotation = await rotateServerKeys();
  fs.renameSync(rotation.backupPath, path.resolve(__dirname, `../../config/server_rsa_keys_${currentVersion}.json`));
  const nextMetadata = {
    activeVersion: nextVersion,
    retiredVersions: [currentVersion, ...(metadata.retiredVersions || [])],
  };
  writeMetadata(nextMetadata);
  return nextMetadata;
}
