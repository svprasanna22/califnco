import crypto from 'crypto';
import { db } from '../firebase';
import { config, updateInstagramAccessToken, isEncryptionKeyValid } from '../config';
import { sanitizeForFirestore } from './orderCalculation';
import { verifyInstagramAccessToken } from './instagramPublishService';

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
    ...(metadata.expiresAt !== undefined ? { expiresAt: metadata.expiresAt } : {}),
    ...(metadata.expiresInDays !== undefined ? { expiresInDays: metadata.expiresInDays } : {}),
  };

  await db.collection('system_secure_vault').doc('instagram_token').set(sanitizeForFirestore(vaultRecord));
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
 * If UPDATE_VAULT_FROM_ENV is true, verifies and synchronizes the environment token into the vault.
 * If the vault is empty, verifies the environment token before seeding the encrypted vault.
 */
export async function initializeTokenVaultOnStartup(fetcher: typeof fetch = fetch): Promise<void> {
  if (!config.encryptionMasterKey) {
    console.log('[Token Vault] ENCRYPTION_MASTER_KEY is not set. Operating with in-memory environment token.');
    return;
  }

  try {
    const vaultResult = await loadDecryptedTokenFromVault();
    if (vaultResult && vaultResult.token) {
      // Check if explicit synchronization from environment is requested
      const shouldUpdateFromEnv = process.env.UPDATE_VAULT_FROM_ENV === 'true';
      let writeSucceeded = false;
      if (shouldUpdateFromEnv && config.instagramAccessToken && config.instagramAccessToken !== vaultResult.token) {
        console.log('[Token Vault] UPDATE_VAULT_FROM_ENV=true detected. Verifying replacement token with read-only Instagram API before saving...');
        try {
          const verification = await verifyInstagramAccessToken(config.instagramAccessToken, fetcher);
          if (!verification.valid) {
            console.error(`[Token Vault] Replacement token from environment failed verification (${verification.error}). Write aborted; existing vault token is retained in Firestore.`);
            updateInstagramAccessToken(vaultResult.token);
            return;
          }

          // Cryptographic cipher self-test in memory before touching Firestore
          const testEnc = encryptSecret(config.instagramAccessToken, config.encryptionMasterKey);
          const testDec = decryptSecret(testEnc, config.encryptionMasterKey);
          if (testDec !== config.instagramAccessToken) {
            throw new Error('Cryptographic cipher self-test failed before writing to vault.');
          }

          const expiresInDays = 60;
          const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString();
          await saveEncryptedTokenToVault(config.instagramAccessToken, { expiresInDays, expiresAt });
          writeSucceeded = true;

          // Read back and verify decryption match without logging tokens
          const readback = await loadDecryptedTokenFromVault();
          if (!readback || readback.token !== config.instagramAccessToken) {
            throw new Error('Vault write verification failed: readback did not match replacement token.');
          }

          // Update non-sensitive metadata in automation_state (isolated so metadata failure doesn't invalidate a verified token)
          try {
            await db.collection('automation_state').doc('instagram_automation').set(
              sanitizeForFirestore({
                tokenLastRefreshedAt: new Date().toISOString(),
                tokenExpiresAt: expiresAt,
                tokenExpiresInDays: expiresInDays,
              }),
              { merge: true }
            );
          } catch (metaErr: unknown) {
            const metaErrMsg = (metaErr as Error)?.message || String(metaErr);
            console.warn(`[Token Vault] Vault token written and verified, but automation_state metadata update failed (${metaErrMsg}).`);
          }

          updateInstagramAccessToken(config.instagramAccessToken);
          console.log('[Token Vault] Successfully verified, re-encrypted, and updated token in vault from environment.');
          return;
        } catch (updateErr: unknown) {
          const updateErrMsg = (updateErr as Error)?.message || String(updateErr);
          if (writeSucceeded) {
            console.error(`[Token Vault] CRITICAL PARTIAL FAILURE: Vault write succeeded, but subsequent readback or verification failed (${updateErrMsg}).`);
            console.error('[Token Vault] Persisted state: Collection "system_secure_vault", document "instagram_token" was overwritten in Firestore, but roundtrip decryption could NOT be verified.');
            console.error('[Token Vault] The previous vault token was OVERWRITTEN and is NOT retained in Firestore.');
            console.error('[Token Vault] Safe recovery strategy: Invalidate in-memory token to fail closed. Re-run vault update or verify Firestore document and ENCRYPTION_MASTER_KEY.');
            updateInstagramAccessToken('');
            return;
          } else {
            console.error(`[Token Vault] Environment token update failed before write (${updateErrMsg}). Write was aborted; existing vault token is retained in Firestore.`);
            updateInstagramAccessToken(vaultResult.token);
            return;
          }
        }
      }

      updateInstagramAccessToken(vaultResult.token);
      console.log(`[Token Vault] Restored active token from AES-256-GCM encrypted vault (expires in ~${vaultResult.expiresInDays || 60} days).`);
      return;
    }

    // If vault is empty, verify and seed it with the configured environment token
    if (config.instagramAccessToken) {
      const verification = await verifyInstagramAccessToken(config.instagramAccessToken, fetcher);
      if (!verification.valid) {
        console.warn(`[Token Vault] Initial environment token failed verification (${verification.error}). Vault not initialized.`);
        updateInstagramAccessToken('');
        return;
      }

      let initWriteSucceeded = false;
      try {
        const initialExpiresAt = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString();
        await saveEncryptedTokenToVault(config.instagramAccessToken, {
          expiresInDays: 60,
          expiresAt: initialExpiresAt,
        });
        initWriteSucceeded = true;

        const readback = await loadDecryptedTokenFromVault();
        if (!readback || readback.token !== config.instagramAccessToken) {
          throw new Error('Vault initialization verification failed: readback did not match seeded token.');
        }

        console.log('[Token Vault] Initialized and secured verified Instagram token in AES-256-GCM vault.');
      } catch (initErr: unknown) {
        const initErrMsg = (initErr as Error)?.message || String(initErr);
        if (initWriteSucceeded) {
          console.error(`[Token Vault] CRITICAL PARTIAL FAILURE: Initial vault write succeeded, but readback verification failed (${initErrMsg}). Persisted state: unverified ciphertext in Firestore.`);
          console.error('[Token Vault] Safe recovery strategy: Invalidate in-memory token to fail closed.');
        } else {
          console.error(`[Token Vault] Failed to write initial vault token (${initErrMsg}). Vault document was not created.`);
        }
        updateInstagramAccessToken('');
      }
    }
  } catch (err: unknown) {
    const errorMsg = (err as Error)?.message || 'Decryption failure';
    console.error(`[Token Vault] CRITICAL: Could not initialize token vault (${errorMsg}). Live publishing will fail closed.`);
    // Fail closed: invalidate in-memory token to guarantee no live publishing occurs with corrupted or tampered vault
    updateInstagramAccessToken('');
  }
}
