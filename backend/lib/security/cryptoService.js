import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const ENCRYPTION_KEY_VERSION = process.env.ENCRYPTION_KEY_VERSION || 'v1';
const LOOKUP_KEY_VERSION = process.env.EMAIL_LOOKUP_KEY_VERSION || 'v1';

function parseHexKey(hexValue, envName) {
  if (!hexValue) {
    throw new Error(`${envName} is required`);
  }

  if (!/^[0-9a-fA-F]+$/.test(hexValue)) {
    throw new Error(`${envName} must be a valid hex string`);
  }

  const keyBuffer = Buffer.from(hexValue, 'hex');
  if (keyBuffer.length !== 32) {
    throw new Error(`${envName} must decode to exactly 32 bytes`);
  }

  return keyBuffer;
}

function getEncryptionKeyByVersion(version) {
  const normalizedVersion = String(version || '').trim();

  if (!normalizedVersion) {
    throw new Error('Missing encryption key version');
  }

  if (normalizedVersion === ENCRYPTION_KEY_VERSION) {
    return parseHexKey(process.env.ENCRYPTION_KEY, 'ENCRYPTION_KEY');
  }

  const rotatedEnvName = `ENCRYPTION_KEY_${normalizedVersion.toUpperCase()}`;
  return parseHexKey(process.env[rotatedEnvName], rotatedEnvName);
}

function getLookupKeyByVersion(version) {
  const normalizedVersion = String(version || '').trim();

  if (!normalizedVersion) {
    throw new Error('Missing email lookup key version');
  }

  if (normalizedVersion === LOOKUP_KEY_VERSION) {
    return parseHexKey(process.env.EMAIL_LOOKUP_KEY, 'EMAIL_LOOKUP_KEY');
  }

  const rotatedEnvName = `EMAIL_LOOKUP_KEY_${normalizedVersion.toUpperCase()}`;
  return parseHexKey(process.env[rotatedEnvName], rotatedEnvName);
}

export function normalizeEmail(email) {
  if (typeof email !== 'string') return '';
  return email.trim().toLowerCase();
}

export function encryptValue(plainText) {
  const text = String(plainText ?? '');
  const iv = crypto.randomBytes(IV_LENGTH);
  const key = getEncryptionKeyByVersion(ENCRYPTION_KEY_VERSION);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [
    ENCRYPTION_KEY_VERSION,
    iv.toString('hex'),
    authTag.toString('hex'),
    encrypted.toString('hex'),
  ].join(':');
}

export function decryptValue(serializedCiphertext) {
  if (!serializedCiphertext || typeof serializedCiphertext !== 'string') {
    throw new Error('Invalid encrypted value payload');
  }

  const parts = serializedCiphertext.split(':');
  if (parts.length !== 4) {
    throw new Error('Invalid encrypted value format');
  }

  const [version, ivHex, authTagHex, cipherHex] = parts;
  const key = getEncryptionKeyByVersion(version);

  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const ciphertext = Buffer.from(cipherHex, 'hex');

  if (iv.length !== IV_LENGTH) {
    throw new Error('Invalid IV length in encrypted payload');
  }

  if (authTag.length !== AUTH_TAG_LENGTH) {
    throw new Error('Invalid auth tag length in encrypted payload');
  }

  try {
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, {
      authTagLength: AUTH_TAG_LENGTH,
    });
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);

    return decrypted.toString('utf8');
  } catch {
    throw new Error('Encrypted payload failed authentication');
  }
}

export function getEmailLookup(email) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    throw new Error('Email is required for lookup generation');
  }

  const key = getLookupKeyByVersion(LOOKUP_KEY_VERSION);
  const digest = crypto
    .createHmac('sha256', key)
    .update(normalizedEmail, 'utf8')
    .digest('hex');

  return `${LOOKUP_KEY_VERSION}:${digest}`;
}

export function validateSecurityConfiguration() {
  parseHexKey(process.env.ENCRYPTION_KEY, 'ENCRYPTION_KEY');
  parseHexKey(process.env.EMAIL_LOOKUP_KEY, 'EMAIL_LOOKUP_KEY');
}
