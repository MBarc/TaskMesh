import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const ENC_PREFIX = 'enc:';

function getKey(): Buffer | null {
  const k = process.env.TASKMESH_ENCRYPTION_KEY;
  if (!k || k.length !== 64) return null;
  return Buffer.from(k, 'hex');
}

export function encrypt(plaintext: string): string {
  const key = getKey();
  if (!key) {
    console.warn('[crypto] TASKMESH_ENCRYPTION_KEY not set — credential stored as plaintext');
    return plaintext;
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${ENC_PREFIX}${iv.toString('hex')}:${encrypted.toString('hex')}:${tag.toString('hex')}`;
}

export function decrypt(value: string): string {
  if (!value.startsWith(ENC_PREFIX)) return value; // legacy plaintext — pass through
  const key = getKey();
  if (!key) throw new Error('TASKMESH_ENCRYPTION_KEY not set — cannot decrypt stored credential');
  const parts = value.slice(ENC_PREFIX.length).split(':');
  if (parts.length !== 3) throw new Error('Malformed encrypted credential');
  const [ivHex, encHex, tagHex] = parts;
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return Buffer.concat([
    decipher.update(Buffer.from(encHex, 'hex')),
    decipher.final(),
  ]).toString('utf8');
}
