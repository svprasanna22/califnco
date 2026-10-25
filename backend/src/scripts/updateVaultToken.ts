/**
 * Califnco Instagram Token Vault - Safe Local CLI Utility
 *
 * This utility allows securely updating the Instagram Access Token in the encrypted Firestore vault:
 * - Hidden input (no terminal echo, no shell history, no logs)
 * - Validates the token with read-only Instagram API (/me) before saving
 * - Encrypts with AES-256-GCM using existing ENCRYPTION_MASTER_KEY
 * - Saves to system_secure_vault/instagram_token in Cloud Firestore
 * - Decrypts back from Firestore and verifies roundtrip equality
 * - Never prints or exposes secret values
 */
import readline from 'readline';
import { db } from '../firebase';
import { config, isEncryptionKeyValid } from '../config';
import { saveEncryptedTokenToVault, loadDecryptedTokenFromVault, encryptSecret, decryptSecret } from '../services/tokenVaultService';
import { verifyInstagramAccessToken } from '../services/instagramPublishService';
import { sanitizeForFirestore } from '../services/orderCalculation';

function promptHidden(promptText: string): Promise<string> {
  return new Promise((resolve) => {
    process.stdout.write(promptText);

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    });

    const stdin = process.stdin;
    const isRaw = stdin.isRaw;
    if (stdin.setRawMode) {
      stdin.setRawMode(true);
    }

    let input = '';
    const onData = (chunk: Buffer) => {
      const char = chunk.toString('utf8');
      if (char === '\n' || char === '\r' || char === '\u0004') {
        if (stdin.setRawMode) stdin.setRawMode(isRaw);
        stdin.removeListener('data', onData);
        process.stdout.write('\n');
        rl.close();
        resolve(input.trim());
      } else if (char === '\u0003') {
        // Ctrl+C
        if (stdin.setRawMode) stdin.setRawMode(isRaw);
        process.stdout.write('\nAborted.\n');
        process.exit(1);
      } else if (char === '\b' || char === '\x7f') {
        // Backspace
        if (input.length > 0) {
          input = input.slice(0, -1);
        }
      } else {
        input += char;
      }
    };

    stdin.on('data', onData);
  });
}

async function run() {
  console.log('===============================================================');
  console.log(' Califnco — Encrypted Instagram Token Vault CLI Update Utility');
  console.log('===============================================================\n');

  // Step 1: Check Master Encryption Key
  let masterKey = config.encryptionMasterKey;
  if (!masterKey) {
    console.log('ENCRYPTION_MASTER_KEY is not configured in environment.');
    masterKey = await promptHidden('Enter ENCRYPTION_MASTER_KEY (input hidden): ');
    config.encryptionMasterKey = masterKey;
  }

  const keyCheck = isEncryptionKeyValid(config.encryptionMasterKey);
  if (!keyCheck.valid) {
    console.error(`[ERROR] Invalid Master Key: ${keyCheck.reason}`);
    process.exit(1);
  }

  // Step 2: Check Firebase Admin Credentials & Project
  console.log(`Target Firebase Project ID: ${config.firebaseProjectId}`);
  try {
    // Probe Firestore read connectivity to check credentials
    await db.collection('system_secure_vault').limit(1).get();
  } catch (err: unknown) {
    const errorMsg = (err as Error)?.message || String(err);
    console.error('\n[ERROR] Could not connect to Cloud Firestore:');
    console.error(`  ${errorMsg}\n`);
    console.error('Explanation: The local machine lacks authorized Google Cloud / Firebase Admin credentials.');
    console.error('To run this utility locally, please ensure one of the following is configured:');
    console.error('  1. Set GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json');
    console.error('  2. Set FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY in backend/.env');
    console.error('\nAlternatively, you can safely update the vault via the Render service by setting:');
    console.error('  INSTAGRAM_ACCESS_TOKEN=<new-token>');
    console.error('  UPDATE_VAULT_FROM_ENV=true');
    console.error('in Render Dashboard -> califnco-backend -> Environment, then deploy/restart.');
    process.exit(1);
  }

  // Step 3: Prompt for New Instagram Token
  const token = await promptHidden('Enter new Instagram Access Token (input hidden): ');
  if (!token) {
    console.error('[ERROR] No token entered. Aborting.');
    process.exit(1);
  }

  // Step 4: Validate token via read-only /me request
  console.log('\nValidating token with read-only Instagram API (/me)...');
  const verification = await verifyInstagramAccessToken(token);
  if (!verification.valid) {
    console.error(`[ERROR] Token verification failed: ${verification.error}`);
    console.error('The vault was NOT modified.');
    process.exit(1);
  }

  const permissionsInfo = verification.permissions && verification.permissions.length > 0
    ? ` (Permissions: ${verification.permissions.join(', ')})`
    : '';
  console.log(`[PASS] Token verified successfully! Linked Account: ${verification.username || verification.accountId}${permissionsInfo}`);

  // Step 5: In-memory cipher self-test before touching Firestore
  console.log('Performing in-memory cryptographic cipher self-test...');
  const testEnc = encryptSecret(token, config.encryptionMasterKey);
  const testDec = decryptSecret(testEnc, config.encryptionMasterKey);
  if (testDec !== token) {
    console.error('[ERROR] Cryptographic cipher self-test failed! Master key derivation error. Firestore was NOT modified.');
    process.exit(1);
  }

  // Step 6: Encrypt and save to Firestore vault
  console.log('Encrypting with AES-256-GCM and writing to collection "system_secure_vault"...');
  const expiresInDays = 60;
  const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString();
  let vaultWriteSucceeded = false;

  try {
    await saveEncryptedTokenToVault(token, { expiresInDays, expiresAt });
    vaultWriteSucceeded = true;
  } catch (writeErr: unknown) {
    console.error('[ERROR] Failed to write encrypted token to Firestore:', (writeErr as Error)?.message || writeErr);
    console.error('The existing vault document was NOT overwritten.');
    process.exit(1);
  }

  // Step 7: Decrypt back from Firestore to verify roundtrip equality
  console.log('Verifying encrypted record from Firestore vault...');
  try {
    const readback = await loadDecryptedTokenFromVault();
    if (!readback || readback.token !== token) {
      throw new Error(readback ? 'Decrypted token does not match replacement token' : 'Failed to read back document from vault');
    }
  } catch (readbackErr: unknown) {
    const readbackErrMsg = (readbackErr as Error)?.message || String(readbackErr);
    console.error(`\n[CRITICAL PARTIAL FAILURE] Vault document in Firestore was written, but subsequent readback or decryption check failed: ${readbackErrMsg}`);
    console.error('Persisted state: The document system_secure_vault/instagram_token in Firestore was OVERWRITTEN with new ciphertext, but roundtrip decryption could NOT be confirmed.');
    console.error('Warning: The previous vault token was OVERWRITTEN and is NOT retained in Firestore.');
    console.error('Recovery strategy: Do NOT attempt live publishing. Verify that ENCRYPTION_MASTER_KEY is identical and valid, then re-run this utility or inspect the Firestore document directly.');
    process.exit(1);
  }

  // Step 8: Update automation state metadata
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
    console.warn('[WARNING] Token vault was updated and verified, but automation_state metadata update failed:', (metaErr as Error)?.message || metaErr);
  }

  console.log('\n[SUCCESS] Instagram access token securely updated in the AES-256-GCM encrypted vault!');
  console.log(`  - Expiry: ~${expiresInDays} days (${expiresAt})`);
  console.log('  - Firestore collection: system_secure_vault');
  console.log('  - Document: instagram_token');
  console.log('  - Decryption roundtrip verification: Confirmed (100% matched)');
  console.log('\nNote: Tokens were kept strictly in memory and never logged or exposed.');
  process.exit(0);
}

run().catch((err) => {
  console.error('[ERROR] Unexpected failure:', (err as Error)?.message || err);
  process.exit(1);
});
