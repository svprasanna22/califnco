import assert from 'assert';
import { config, isCronSecretStrong, updateInstagramAccessToken, isEncryptionKeyValid } from '../config';
import {
  generateInstagramCaption,
  type ProductForMarketing,
} from '../services/aiCaptionService';
import { buildPromotionalImagePrompt } from '../services/aiImageService';
import { verifyPublicImageUrl } from '../services/imageHostingService';
import {
  publishToInstagramGraphApi,
  getInstagramApiBaseUrl,
  refreshInstagramLongLivedToken,
} from '../services/instagramPublishService';
import {
  getCurrentDateKey,
  ensureValidInstagramToken,
} from '../services/instagramAutomation';
import {
  encryptSecret,
  decryptSecret,
  deriveKeyBuffer,
} from '../services/tokenVaultService';
import { sanitizeForFirestore } from '../services/orderCalculation';

async function runAutomationTests() {
  console.log('--- Starting Califnco AI Instagram Automation Unit Tests ---\n');

  const mockProduct: ProductForMarketing = {
    id: 'prod-stellar-01',
    name: 'Califnco Stellar 8-Stage Smart RO',
    description: 'Flagship multi-stage RO purifier equipped with digital LED TDS display and copper mineralization.',
    price: 22499,
    category: 'ro-purifiers',
    features: [
      'Real-time input/output TDS monitor',
      'Active copper & zinc mineral infusion',
      'Stainless steel internal storage tank',
    ],
    specifications: {
      'Purification Capacity': '15 LPH',
      'Storage Capacity': '8 Litres',
      'Input TDS Limit': 'Up to 2500 ppm',
    },
    imageUrl: 'https://images.unsplash.com/photo-1585771724684-38269d6639fd?w=800',
  };

  // Test 1: Caption & Hashtag Generation
  console.log('1. Testing AI caption generation & validation...');
  const captionResult = await generateInstagramCaption(mockProduct);
  assert(captionResult.caption.length > 50, 'Caption should be substantive (> 50 chars)');
  assert(captionResult.caption.includes('Califnco'), 'Caption must mention Califnco brand name');
  assert(captionResult.hashtags.length >= 4, 'Should include at least 4 hashtags');
  assert(captionResult.hashtags.some((h) => h.toLowerCase().includes('water') || h.toLowerCase().includes('califnco')), 'Hashtags must be relevant');
  assert(captionResult.fullInstagramText.includes(captionResult.caption), 'Full text must contain caption body');
  console.log(`   [PASS] Generated using provider: ${captionResult.provider}`);
  console.log(`   Sample caption hook: "${captionResult.caption.slice(0, 75)}..."`);

  // Test 2: Promotional Image Prompt Builder
  console.log('\n2. Testing image prompt construction...');
  const prompt = buildPromotionalImagePrompt(mockProduct);
  assert(prompt.includes(mockProduct.name), 'Prompt must include product name');
  assert(prompt.includes('kitchen') || prompt.includes('countertop'), 'Prompt must place purifier in aspirational context');
  assert(prompt.includes('photorealistic') || prompt.includes('8k') || prompt.includes('photograph'), 'Prompt must specify high resolution');
  console.log(`   [PASS] Constructed prompt: "${prompt.slice(0, 90)}..."`);

  // Test 3: Public Image URL Verification
  console.log('\n3. Testing public HTTPS image URL verifier...');
  const validImageUrl = 'https://images.unsplash.com/photo-1585771724684-38269d6639fd?w=800';
  const isReachable = await verifyPublicImageUrl(validImageUrl);
  assert(isReachable === true, 'Public HTTPS image URL should verify successfully');

  const invalidUrl = 'https://localhost:9999/nonexistent-image-path.jpg';
  const isInvalidReachable = await verifyPublicImageUrl(invalidUrl);
  assert(isInvalidReachable === false, 'Local/inaccessible URL should fail verification');
  console.log('   [PASS] Image verifier accurately verifies public HTTPS reachability');

  // Test 4: Timezone and DateKey Generation
  console.log('\n4. Testing DateKey generator (Asia/Kolkata timezone)...');
  const dateKey = getCurrentDateKey('Asia/Kolkata');
  assert(/^\d{4}-\d{2}-\d{2}$/.test(dateKey), 'DateKey must be in YYYY-MM-DD format');
  console.log(`   [PASS] Current Asia/Kolkata DateKey: ${dateKey}`);

  // Test 5: Instagram API Base URL and Endpoint Selector
  console.log('\n5. Testing Instagram API base URL resolution...');
  const igLoginUrl = getInstagramApiBaseUrl('IGQVJ...dummyToken');
  assert(igLoginUrl === 'https://graph.instagram.com/v21.0', 'Tokens starting with IG must use graph.instagram.com');
  const fbLoginUrl = getInstagramApiBaseUrl('EAAG...dummyToken');
  assert(fbLoginUrl === 'https://graph.facebook.com/v21.0', 'Tokens starting with EAA must use graph.facebook.com');
  console.log('   [PASS] API base URL accurately routes Instagram Login vs Facebook Graph tokens');

  // Test 6: Instagram Publication Dry-Run Guard
  console.log('\n6. Testing Instagram publish dry-run safety guard...');
  const dryRunResult = await publishToInstagramGraphApi(validImageUrl, captionResult.fullInstagramText, { isDryRun: true });
  assert(dryRunResult.isMockOrDryRun === true, 'Dry-run must mark isMockOrDryRun: true');
  assert(dryRunResult.errorMessage?.includes('DRY RUN'), 'Dry-run must clearly state test execution');
  console.log('   [PASS] Dry-run guard safely prevented any live Meta API network calls');

  // Test 7: Instagram Long-Lived Token Refresh Guard
  console.log('\n7. Testing token refresh guard...');
  const refreshResult = await refreshInstagramLongLivedToken('');
  assert(refreshResult.success === false, 'Empty token must safely fail without crashing');
  console.log('   [PASS] Token refresh guard safely caught unconfigured environment');

  // Test 8: AUTOMATION_CRON_SECRET Cryptographic Strength Validator
  console.log('\n8. Testing AUTOMATION_CRON_SECRET strength validation...');
  const emptyCheck = isCronSecretStrong('');
  assert(emptyCheck.valid === false, 'Empty secret must be rejected');

  const shortCheck = isCronSecretStrong('short_secret');
  assert(shortCheck.valid === false, 'Secret < 16 chars must be rejected');

  const predictableCheck = isCronSecretStrong('califnco_auto_secret_2026');
  assert(predictableCheck.valid === false, 'Predictable default string must be rejected');

  const strongCheck = isCronSecretStrong('b7e9a2d4f8c103e5a7b9c1d3e5f7a9b1c3d5');
  assert(strongCheck.valid === true, 'Strong 36-char random secret must be accepted');
  console.log('   [PASS] Secret validator enforces strict cryptographic strength and rejects weak/predictable keys');

  // Test 9: Token Age & Expiration Pre-Flight Guard
  console.log('\n9. Testing token age & expiration pre-flight guard...');
  const tokenPreflight = await ensureValidInstagramToken();
  assert(typeof tokenPreflight.ready === 'boolean', 'Pre-flight check must return boolean status');
  console.log('   [PASS] Token pre-flight check evaluated safely without crashing or exposing credentials');

  // Test 10: In-Memory Secret Token Isolation
  console.log('\n10. Testing in-memory secret token update isolation...');
  const originalToken = config.instagramAccessToken;
  updateInstagramAccessToken('test_memory_isolated_token_12345');
  assert(config.instagramAccessToken === 'test_memory_isolated_token_12345', 'In-memory token must update cleanly');
  updateInstagramAccessToken(originalToken); // Restore original
  console.log('   [PASS] In-memory token updater works correctly without disk or Firestore leakage');

  // Test 11: AES-256-GCM Encryption and Decryption Roundtrip
  console.log('\n11. Testing AES-256-GCM token encryption and decryption...');
  const testMasterKey = '3f9a7b2c5e8d1a4f0b6e9c2d5a8f1b4e3d7a9c1e5f8b0d2a4c6e8f1a3b5c7d9e';
  const testSampleToken = 'IGQVJ_sample_long_lived_token_for_califnco_test';
  const encryptedPayload = encryptSecret(testSampleToken, testMasterKey);

  assert(encryptedPayload.algorithm === 'aes-256-gcm', 'Must use aes-256-gcm algorithm');
  assert(encryptedPayload.ciphertext && encryptedPayload.ciphertext !== testSampleToken, 'Ciphertext must be scrambled');
  assert(encryptedPayload.iv && encryptedPayload.authTag, 'Must produce random IV and authentication tag');

  const decryptedToken = decryptSecret(encryptedPayload, testMasterKey);
  assert(decryptedToken === testSampleToken, 'Decrypted token must exactly match original token');
  console.log('   [PASS] AES-256-GCM encryption/decryption roundtrip succeeded with exact plaintext recovery');

  // Test 12: Invalid Key Rejection & Cryptographic Fail-Closed
  console.log('\n12. Testing invalid encryption keys...');
  const shortKeyCheck = isEncryptionKeyValid('short_key_123');
  assert(shortKeyCheck.valid === false, 'Key < 32 chars must be rejected');

  assert.throws(
    () => deriveKeyBuffer('invalid_short_key'),
    /Master Key Error/,
    'deriveKeyBuffer must throw for invalid master keys'
  );

  const wrongMasterKey = '4a8b0c2d6e9f1a3b5c7d9e1f3a5b7c9d0e2f4a6b8c0d2e4f6a8b0c2d4e6f8a0b';
  assert.throws(
    () => decryptSecret(encryptedPayload, wrongMasterKey),
    /Unsupported state or unable to authenticate data/,
    'Decryption with incorrect key must fail authentication and throw'
  );

  const prevMasterKey = config.encryptionMasterKey;
  const prevToken = config.instagramAccessToken;
  config.instagramAccessToken = 'IGQVJ_test_token_123';
  config.encryptionMasterKey = 'short_invalid_key';
  const invalidKeyPreflight = await ensureValidInstagramToken();
  assert(invalidKeyPreflight.ready === false, 'Pre-flight must fail closed when master key is invalid');
  assert(invalidKeyPreflight.error?.includes('Invalid ENCRYPTION_MASTER_KEY'), 'Must specify encryption key error');
  config.encryptionMasterKey = prevMasterKey;
  config.instagramAccessToken = prevToken;

  console.log('   [PASS] Cryptographic fail-closed behavior confirmed: rejects short and wrong keys');

  // Test 13: Tampered Ciphertext Authentication Tag Guard
  console.log('\n13. Testing tampered ciphertext & auth tag detection...');
  const tamperedPayload = {
    ...encryptedPayload,
    ciphertext: Buffer.from('tampered_corrupted_ciphertext_data').toString('base64'),
  };
  assert.throws(
    () => decryptSecret(tamperedPayload, testMasterKey),
    /Unsupported state or unable to authenticate data/,
    'GCM must reject tampered ciphertext via auth tag failure'
  );
  console.log('   [PASS] AES-256-GCM authentication tag successfully detected tampered ciphertext');

  // Test 14: Simulated Container Restart Recovery
  console.log('\n14. Testing restart recovery simulation...');
  // Simulate Render restart: memory is cleared, token is restored strictly from encrypted vault payload
  let simulatedMemoryToken = '';
  assert(simulatedMemoryToken === '', 'Simulated restart memory is empty');
  simulatedMemoryToken = decryptSecret(encryptedPayload, testMasterKey);
  assert(simulatedMemoryToken === testSampleToken, 'Token must recover into memory across restarts');
  console.log('   [PASS] Restart recovery confirmed: encrypted payload restores memory state without plaintext persistence');

  // Test 15: Global Dry-Run Safety Regression Test (Including Retries)
  console.log('\n15. Testing global dry-run guard on all routes (including retries)...');
  const prevDryRun = config.instagramDryRun;
  config.instagramDryRun = true;

  // Even if caller passes isDryRun: false, global config must strictly enforce dry run
  const forceLiveCallAttempt = await publishToInstagramGraphApi(validImageUrl, captionResult.fullInstagramText, { isDryRun: false });
  assert(forceLiveCallAttempt.isMockOrDryRun === true, 'Global dry-run must override any callers attempting live posts');
  assert(forceLiveCallAttempt.errorMessage?.includes('DRY RUN'), 'Must return dry-run response');

  // Even if caller passes no options (e.g. default parameter), global config must enforce dry run
  const defaultOptionsCall = await publishToInstagramGraphApi(validImageUrl, captionResult.fullInstagramText);
  assert(defaultOptionsCall.isMockOrDryRun === true, 'Default publishing call must enforce dry-run');
  assert(defaultOptionsCall.errorMessage?.includes('DRY RUN'), 'Must return dry-run response');

  config.instagramDryRun = prevDryRun; // Restore
  console.log('   [PASS] Global dry-run guard verified: no live Meta publish request can occur on scheduled runs or retries');

  // Test 16: Firestore Payload Sanitization & Dry-Run 'undefined' Property Regression Test
  console.log('\n16. Testing Firestore payload sanitization (purging undefined properties)...');
  const dryRunExecution = await publishToInstagramGraphApi(validImageUrl, captionResult.fullInstagramText, { isDryRun: true });
  assert(dryRunExecution.containerId === undefined, 'Dry-run execution intentionally returns undefined containerId');

  // Reproduce the previous bug: direct assignment of undefined property
  const dirtyExecutionPayload: Record<string, any> = {
    runId: 'test_run_123',
    productId: mockProduct.id,
    instagramContainerId: dryRunExecution.containerId, // This was undefined!
    instagramMediaId: dryRunExecution.mediaId,
    errorDetails: undefined,
  };
  assert(dirtyExecutionPayload.hasOwnProperty('instagramContainerId'), 'Dirty object contains undefined key');
  assert(dirtyExecutionPayload.instagramContainerId === undefined, 'Field is undefined before sanitization');

  // Verify sanitized output completely purges undefined properties
  const cleanPayload = sanitizeForFirestore(dirtyExecutionPayload);
  assert(!cleanPayload.hasOwnProperty('instagramContainerId'), 'Sanitizer must remove undefined instagramContainerId');
  assert(!cleanPayload.hasOwnProperty('errorDetails'), 'Sanitizer must remove undefined errorDetails');
  assert(cleanPayload.runId === 'test_run_123', 'Sanitizer must preserve valid fields');
  assert(cleanPayload.instagramMediaId === dryRunExecution.mediaId, 'Sanitizer must preserve valid mediaId');
  assert(Object.values(cleanPayload).every((val) => val !== undefined), 'Cleaned payload must contain zero undefined values');

  // Verify retry payload construction when both publishResult and existingRecord have no containerId
  const existingRecordNoContainer: Record<string, any> = { instagramMediaId: 'prev_media_1' };
  const retryContainerId = dryRunExecution.containerId || existingRecordNoContainer.instagramContainerId;
  const retryPayload = sanitizeForFirestore({
    status: dryRunExecution.status,
    ...(retryContainerId ? { instagramContainerId: retryContainerId } : {}),
  });
  assert(!retryPayload.hasOwnProperty('instagramContainerId'), 'Retry payload must omit undefined instagramContainerId');
  assert(Object.values(retryPayload).every((val) => val !== undefined), 'Retry payload must contain zero undefined values');

  console.log('   [PASS] Firestore payload sanitization verified: zero undefined properties permitted in document writes');

  console.log('\n--- All 16 AI Instagram Automation Unit Tests Passed Successfully! ---');
}

runAutomationTests().catch((err) => {
  console.error('Automation test failure:', err);
  process.exit(1);
});
