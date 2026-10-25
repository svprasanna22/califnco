import crypto from 'crypto';
import { db } from '../firebase';
import { config, updateInstagramAccessToken, isEncryptionKeyValid } from '../config';

export interface EncryptedVaultPayload {
  ciphertext: string;
  iv: string;
  authTag: string;
  algorithm: 'aes-256-gcm';
  version: number;
  updatedAt: string;
  expiresAt?: string;
  expiresInDays?: number;
}

export interface DecryptedVaultResult {
  token: string;
  expiresAt?: string;
  expiresInDays?: number;
  updatedAt: string;
}

/**
 * Derives a consistent 32-byte (256-bit) AES key buffer from the master key string
 */
export function deriveKeyBuffer(rawKey: string): Buffer {
  const keyCheck = isEncryptionKeyValid(rawKey);
  if (!keyCheck.valid) {
    throw new Error(`Master Key Error: ${keyCheck.reason}`);
  }
  return crypto.createHash('sha256').update(rawKey, 'utf8').digest();
}

/**
 * Encrypts a plaintext secret string using AES-256-GCM with a random 12-byte IV
 */
export function encryptSecret(
  plaintext: string,
  masterKey: string
): { ciphertext: string; iv: string; authTag: string; algorithm: 'aes-256-gcm'; version: number } {
  const keyBuffer = deriveKeyBuffer(masterKey);
  const iv = crypto.randomBytes(12); // NIST recommended 12 bytes for GCM
  const cipher = crypto.createCipheriv('aes-256-gcm', keyBuffer, iv);

  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    ciphertext: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    algorithm: 'aes-256-gcm',
    version: 1,
  };
}

/**
 * Decrypts an AES-256-GCM payload and verifies the authentication tag
 * Fails closed if tampered with or if the key is invalid
 */
export function decryptSecret(
  payload: { ciphertext: string; iv: string; authTag: string },
  masterKey: string
): string {
  const keyBuffer = deriveKeyBuffer(masterKey);
  const ivBuffer = Buffer.from(payload.iv, 'base64');
  const authTagBuffer = Buffer.from(payload.authTag, 'base64');
  const ciphertextBuffer = Buffer.from(payload.ciphertext, 'base64');

  const decipher = crypto.createDecipheriv('aes-256-gcm', keyBuffer, ivBuffer);
  decipher.setAuthTag(authTagBuffer);

  const decrypted = Buffer.concat([decipher.update(ciphertextBuffer), decipher.final()]);
  return decrypted.toString('utf8');
}

/**
 * Saves a renewed Instagram access token into the restricted Firestore encrypted vault
 * Guarantees that only ciphertext, IV, authTag, and metadata are persisted.
 */
export async function saveEncryptedTokenToVault(
  token: string,
  metadata: { expiresInDays?: number; expiresAt?: string } = {}
): Promise<void> {
  if (!config.encryptionMasterKey) {
    throw new Error('Cannot persist token to vault: ENCRYPTION_MASTER_KEY is not configured in the environment.');
  }

  const encrypted = encryptSecret(token, config.encryptionMasterKey);
  const vaultRecord: EncryptedVaultPayload = {
    ...encrypted,
    updatedAt: new Date().toISOString(),
    expiresAt: metadata.expiresAt,
    expiresInDays: metadata.expiresInDays,
  };

  await db.collection('system_secure_vault').doc('instagram_token').set(vaultRecord);
}

/**
 * Loads and decrypts the active Instagram token from the Firestore encrypted vault
 * Returns null if the vault has not been initialized.
 */
export async function loadDecryptedTokenFromVault(): Promise<DecryptedVaultResult | null> {
  if (!config.encryptionMasterKey) {
    return null;
  }

  const docSnap = await db.collection('system_secure_vault').doc('instagram_token').get();
  if (!docSnap.exists) {
    return null;
  }

  const data = docSnap.data() as EncryptedVaultPayload;
  if (!data?.ciphertext || !data?.iv || !data?.authTag) {
    throw new Error('Encrypted token vault document is malformed or missing cryptographic components.');
  }

  const decryptedToken = decryptSecret(data, config.encryptionMasterKey);
  return {
    token: decryptedToken,
    expiresAt: data.expiresAt,
    expiresInDays: data.expiresInDays,
    updatedAt: data.updatedAt,
  };
}

/**
 * On server startup: loads and restores the latest decrypted token from the vault.
 * If the vault is empty but an environment token is present, seeds the encrypted vault.
 */
export async function initializeTokenVaultOnStartup(): Promise<void> {
  if (!config.encryptionMasterKey) {
    console.log('[Token Vault] ENCRYPTION_MASTER_KEY is not set. Operating with in-memory environment token.');
    return;
  }

  try {
    const vaultResult = await loadDecryptedTokenFromVault();
    if (vaultResult && vaultResult.token) {
      updateInstagramAccessToken(vaultResult.token);
      console.log(`[Token Vault] Restored active token from AES-256-GCM encrypted vault (expires in ~${vaultResult.expiresInDays || 60} days).`);
      return;
    }

    // If vault is empty, seed it with the configured environment token
    if (config.instagramAccessToken) {
      const initialExpiresAt = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString();
      await saveEncryptedTokenToVault(config.instagramAccessToken, {
        expiresInDays: 60,
        expiresAt: initialExpiresAt,
      });
      console.log('[Token Vault] Initialized and secured Instagram token in AES-256-GCM vault.');
    }
  } catch (err: unknown) {
    const errorMsg = (err as Error)?.message || 'Decryption failure';
    console.error(`[Token Vault] CRITICAL: Could not initialize token vault (${errorMsg}). Live publishing will fail closed.`);
    // Fail closed: invalidate in-memory token to guarantee no live publishing occurs with corrupted or tampered vault
    updateInstagramAccessToken('');
  }
}
