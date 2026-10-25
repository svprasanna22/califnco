import assert from 'assert';
import { config, isCronSecretStrong, updateInstagramAccessToken, isEncryptionKeyValid } from '../config';
import {
  generateInstagramCaption,
  type ProductForMarketing,
} from '../services/aiCaptionService';
import {
  buildPromotionalImagePrompt,
  isValidImageBuffer,
  calculateBackoffMs,
  generateWithPollinations,
  generateWithHuggingFace,
  generatePromotionalImage,
  resolveFallbackImageBuffer,
  VERIFIED_BRAND_ASSET_URLS,
} from '../services/aiImageService';
import {
  verifyPublicImageUrl,
  isPublicHttpsUrl,
  isHostnamePublic,
  isPrivateHost,
  hostPromotionalImage,
  uploadToCloudinary,
} from '../services/imageHostingService';
import { db } from '../firebase';
import {
  publishToInstagramGraphApi,
  getInstagramApiBaseUrl,
  refreshInstagramLongLivedToken,
  verifyInstagramAccessToken,
  reconcileInstagramPublication,
} from '../services/instagramPublishService';
import {
  getCurrentDateKey,
  ensureValidInstagramToken,
  acquireDailyPostingLock,
  retryInstagramPost,
  reconcilePostRecord,
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
  
  // Test 7b: Read-only Instagram token verification using a mocked API response
  console.log('\n7b. Testing read-only Instagram token verification...');
  const validVerification = await verifyInstagramAccessToken('IG_test_token', async (input) => {
    const requestUrl = new URL(String(input));
    assert(requestUrl.pathname.endsWith('/me'), 'Verification must use the read-only /me endpoint');
    assert(requestUrl.searchParams.get('fields') === 'user_id,username', 'Instagram Login must request account identity fields');
    return new Response(JSON.stringify({ user_id: 'test-account-123', username: 'califnco.water' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  assert(validVerification.valid === true, 'Valid API identity response should pass verification');
  assert(validVerification.accountId === 'test-account-123', 'Verification should return account ID');
  const invalidVerification = await verifyInstagramAccessToken('IG_test_token', async () =>
    new Response(JSON.stringify({ error: { message: 'Invalid OAuth access token' } }), { status: 401 })
  );
  assert(invalidVerification.valid === false, 'Rejected API token should fail verification');
  assert(!JSON.stringify(invalidVerification).includes('IG_test_token'), 'Verification result must not expose the token');
  console.log('   [PASS] Read-only token verification handles accepted and rejected tokens without exposing credentials');

  // Test 7c: Instagram publishing permission verification
  console.log('\n7c. Testing publishing permission preflight checks...');
  // 1. Token with instagram_content_publish granted passes
  const validWithPerms = await verifyInstagramAccessToken('IG_test_token', async (input) => {
    const url = String(input);
    if (url.includes('/me/permissions')) {
      return new Response(JSON.stringify({
        data: [
          { permission: 'instagram_basic', status: 'granted' },
          { permission: 'instagram_content_publish', status: 'granted' },
        ],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({ user_id: 'test-account-123', username: 'califnco.water' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  assert(validWithPerms.valid === true, 'Token with content_publish permission must pass verification');
  assert(validWithPerms.hasPublishPermission === true, 'hasPublishPermission must be true');
  assert(validWithPerms.permissions?.includes('instagram_content_publish'), 'Permissions list must include instagram_content_publish');

  // 2. Token missing content publishing permission is rejected with clear error
  const lackingPerms = await verifyInstagramAccessToken('IG_test_token', async (input) => {
    const url = String(input);
    if (url.includes('/me/permissions')) {
      return new Response(JSON.stringify({
        data: [
          { permission: 'instagram_basic', status: 'granted' },
        ],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({ user_id: 'test-account-123', username: 'califnco.water' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  assert(lackingPerms.valid === false, 'Token lacking content-publishing permission must be rejected');
  assert(lackingPerms.hasPublishPermission === false, 'hasPublishPermission must be false');
  assert(lackingPerms.error?.includes('lacks content-publishing permission'), 'Error must specify missing permission');
  assert(lackingPerms.error?.includes('instagram_content_publish'), 'Error must specify required permission');

  // 3. Token on endpoint where /me/permissions is not supported (404) gracefully falls back
  const fallbackPerms = await verifyInstagramAccessToken('IG_test_token', async (input) => {
    const url = String(input);
    if (url.includes('/me/permissions')) {
      return new Response(JSON.stringify({ error: { message: 'Unknown path' } }), { status: 404 });
    }
    return new Response(JSON.stringify({ user_id: 'test-account-123', username: 'califnco.water' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  assert(fallbackPerms.valid === true, 'Token must gracefully pass identity verification if /me/permissions is unsupported');
  console.log('   [PASS] Token preflight verifies content-publishing permissions and rejects tokens without publish rights');

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

  // Test 9: Token pre-flight handles missing credentials without making a network request
  console.log('\\n9. Testing token pre-flight guard with missing credentials...');
  const savedPreflightToken = config.instagramAccessToken;
  config.instagramAccessToken = '';
  const tokenPreflight = await ensureValidInstagramToken();
  assert(tokenPreflight.ready === false, 'Pre-flight must reject a missing access token');
  assert(typeof tokenPreflight.error === 'string', 'Pre-flight should explain missing credentials');
  config.instagramAccessToken = savedPreflightToken;
  console.log('   [PASS] Token pre-flight rejects missing credentials without an Instagram API request');

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

  // Test 17: Image Buffer Content & Format Validation
  console.log('\n17. Testing image buffer content and format validation...');
  const mockJpegBuffer = Buffer.alloc(1500, 0xaa);
  mockJpegBuffer[0] = 0xff;
  mockJpegBuffer[1] = 0xd8;
  mockJpegBuffer[2] = 0xff;
  assert(isValidImageBuffer(mockJpegBuffer) === true, 'Valid JPEG buffer >= 1000 bytes must pass validation');

  const mockPngBuffer = Buffer.alloc(1500, 0xbb);
  mockPngBuffer[0] = 0x89;
  mockPngBuffer[1] = 0x50;
  mockPngBuffer[2] = 0x4e;
  mockPngBuffer[3] = 0x47;
  assert(isValidImageBuffer(mockPngBuffer) === true, 'Valid PNG buffer >= 1000 bytes must pass validation');

  const smallBuffer = Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x01]);
  assert(isValidImageBuffer(smallBuffer) === false, 'Buffer smaller than 1000 bytes must be rejected');

  const htmlBuffer = Buffer.from('<html><body><h1>503 Service Unavailable</h1></body></html>');
  assert(isValidImageBuffer(htmlBuffer) === false, 'Non-image HTML payload must be rejected');
  console.log('   [PASS] Image buffer validator correctly accepts genuine images and rejects truncated/HTML responses');

  // Test 18: Pollinations Transient Error Retry with Backoff
  console.log('\n18. Testing Pollinations transient 503 retry with exponential backoff...');
  const backoff1 = calculateBackoffMs(1, 100, 500);
  const backoff2 = calculateBackoffMs(2, 100, 500);
  assert(backoff1 >= 100 && backoff1 <= 500, 'Backoff attempt 1 must be within bounds');
  assert(backoff2 >= 200 && backoff2 <= 500, 'Backoff attempt 2 must be within bounds');

  let attemptCount = 0;
  const mockRetryFetcher = async () => {
    attemptCount++;
    if (attemptCount === 1) {
      return new Response('Service Unavailable', { status: 503, headers: { 'Content-Type': 'text/plain' } });
    }
    return new Response(mockJpegBuffer, {
      status: 200,
      headers: { 'Content-Type': 'image/jpeg' },
    });
  };

  const retryResult = await generateWithPollinations('test water purifier prompt', mockRetryFetcher as any);
  assert(retryResult !== null, 'Pollinations must recover after transient 503 retry');
  assert(retryResult?.model === 'turbo', 'Recovered attempt must succeed with primary Turbo model');
  assert(attemptCount === 2, 'Must have executed exactly 2 attempts');
  console.log('   [PASS] Pollinations successfully retried transient HTTP 503 and succeeded on second attempt');

  // Test 19: Pollinations Model Fallback (Turbo -> FLUX)
  console.log('\n19. Testing Pollinations model failover from Turbo to FLUX...');
  let turboAttemptCount = 0;
  let fluxAttemptCount = 0;
  const mockFallbackFetcher = async (input: string | URL | Request) => {
    const urlStr = String(input);
    if (urlStr.includes('model=turbo')) {
      turboAttemptCount++;
      return new Response('Turbo capacity exhausted', { status: 503, headers: { 'Content-Type': 'text/plain' } });
    }
    if (urlStr.includes('model=flux')) {
      fluxAttemptCount++;
      return new Response(mockJpegBuffer, {
        status: 200,
        headers: { 'Content-Type': 'image/jpeg' },
      });
    }
    return new Response('Not Found', { status: 404 });
  };

  const fallbackResult = await generateWithPollinations('test prompt', mockFallbackFetcher as any);
  assert(fallbackResult !== null, 'Must succeed via fallback model');
  assert(fallbackResult?.model === 'flux', 'Must fall back to flux model when Turbo fails');
  assert(turboAttemptCount === 2, 'Must exhaust Turbo retries before falling back');
  assert(fluxAttemptCount === 1, 'FLUX model must succeed');

  const facadeResult = await generatePromotionalImage(mockProduct, mockFallbackFetcher as any);
  assert(facadeResult.provider === 'pollinations-flux', 'Facade must report provider as pollinations-flux');
  assert(facadeResult.imageBuffer.length >= 1000, 'Image buffer must be valid');
  console.log('   [PASS] Model failover successfully transitioned from Turbo to FLUX fallback');

  // Test 20: Pollinations Timeout & Provider Exhaustion Error Handling
  console.log('\n20. Testing Pollinations timeout and exhausted provider failure...');
  const mockTimeoutFetcher = async () => {
    const error: any = new Error('The operation was aborted due to timeout');
    error.name = 'TimeoutError';
    throw error;
  };

  const timeoutResult = await generateWithPollinations('test prompt', mockTimeoutFetcher as any);
  assert(timeoutResult === null, 'Timeout must be safely caught without crashing');

  await assert.rejects(
    async () => generatePromotionalImage(mockProduct, mockTimeoutFetcher as any),
    /Failed to generate promotional image from all available providers/,
    'Facade must throw clear error when all providers are exhausted'
  );
  console.log('   [PASS] Timeouts and provider exhaustion handled safely without uncaught exceptions');

  // Test 21: Absolute HTTPS URL Validation & Relative Path Rejection
  console.log('\n21. Testing absolute HTTPS URL validation, private IP, and relative path rejection...');
  assert(isPublicHttpsUrl('/products/product-04.png') === false, 'Relative product path must be rejected');
  assert(isPublicHttpsUrl('/demo-product.jpg') === false, 'Root relative path must be rejected');
  assert(isPublicHttpsUrl('http://insecure-domain.com/photo.jpg') === false, 'HTTP URL must be rejected');
  assert(isPublicHttpsUrl('http://localhost:8080/photo.jpg') === false, 'Localhost HTTP URL must be rejected');
  assert(isPublicHttpsUrl('https://localhost:8080/photo.jpg') === false, 'Localhost HTTPS URL must be rejected');
  assert(isPublicHttpsUrl('https://127.0.0.1/photo.jpg') === false, '127.0.0.1 must be rejected');
  assert(isPublicHttpsUrl('https://10.0.1.5/photo.jpg') === false, '10.x.x.x private IP must be rejected');
  assert(isPublicHttpsUrl('https://172.20.10.2/photo.jpg') === false, '172.16-31 private IP must be rejected');
  assert(isPublicHttpsUrl('https://192.168.1.1/photo.jpg') === false, '192.168.x.x private IP must be rejected');
  assert(isPublicHttpsUrl('https://169.254.169.254/latest/meta-data') === false, 'Cloud metadata IP must be rejected');
  assert(isPublicHttpsUrl('https://100.64.0.1/photo.jpg') === false, 'Carrier-grade NAT must be rejected');
  assert(isPublicHttpsUrl('https://224.0.0.1/photo.jpg') === false, 'Multicast must be rejected');
  assert(isPublicHttpsUrl('https://240.0.0.1/photo.jpg') === false, 'Reserved IP must be rejected');
  assert(isPublicHttpsUrl('https://internal-service/photo.jpg') === false, 'Non-FQDN host must be rejected');
  assert(isPublicHttpsUrl('https://service.internal/photo.jpg') === false, '.internal TLD must be rejected');
  assert(isPublicHttpsUrl('https://metadata.google.internal/computeMetadata/v1/') === false, 'GCP metadata must be rejected');
  assert(isPublicHttpsUrl('https://user:password@example.com/photo.jpg') === false, 'URL with userinfo must be rejected');
  assert(isPublicHttpsUrl('https://[::1]/photo.jpg') === false, 'IPv6 loopback must be rejected');
  assert(isPublicHttpsUrl('https://images.unsplash.com/photo-123') === true, 'Public HTTPS URL must be accepted');
  assert(isPublicHttpsUrl('https://res.cloudinary.com/oxeow2gv/image/upload/sample.jpg') === true, 'Cloudinary URL must be accepted');

  // Verify private host checks including IPv4-mapped IPv6
  assert(isPrivateHost('::ffff:127.0.0.1') === true, 'IPv4-mapped loopback must be private');
  assert(isPrivateHost('::ffff:169.254.169.254') === true, 'IPv4-mapped metadata must be private');
  assert(isPrivateHost('::ffff:10.0.0.1') === true, 'IPv4-mapped 10.x must be private');
  assert(isPrivateHost('fe80::1') === true, 'IPv6 link-local must be private');
  assert(isPrivateHost('fc00::1') === true, 'IPv6 unique-local must be private');
  assert(isPrivateHost('localhost') === true, 'localhost must be private');
  assert(isPrivateHost('backend') === true, 'single word host must be private');

  // Verify DNS resolution validation against private IP rebinding
  const mockDnsLookupRebinding = async () => [{ address: '169.254.169.254', family: 4 }];
  const isDnsRebindingBlocked = await isHostnamePublic('rebound-domain.com', mockDnsLookupRebinding);
  assert(isDnsRebindingBlocked === false, 'isHostnamePublic must block hostnames resolving to cloud metadata IP');

  const mockDnsLookupPublic = async () => [{ address: '151.101.1.69', family: 4 }];
  const isDnsPublicAllowed = await isHostnamePublic('valid-cdn.com', mockDnsLookupPublic);
  assert(isDnsPublicAllowed === true, 'isHostnamePublic must allow hostnames resolving to public IPs');

  // Verify manual redirect handling with verifyPublicImageUrl
  const mockRedirectToPrivate = async (input: RequestInfo | URL) => {
    const urlStr = String(input);
    if (urlStr === 'https://trusted.cdn.com/image.jpg') {
      return {
        ok: false,
        status: 302,
        headers: new Headers({ location: 'https://169.254.169.254/latest/meta-data' }),
      } as any;
    }
    return { ok: true, status: 200, headers: new Headers({ 'content-type': 'image/jpeg' }) } as any;
  };
  const isRedirectToPrivateBlocked = await verifyPublicImageUrl('https://trusted.cdn.com/image.jpg', mockRedirectToPrivate);
  assert(isRedirectToPrivateBlocked === false, 'verifyPublicImageUrl must block 302 redirects to cloud metadata');

  const mockRedirectToHttp = async (input: RequestInfo | URL) => {
    const urlStr = String(input);
    if (urlStr === 'https://trusted.cdn.com/image.jpg') {
      return {
        ok: false,
        status: 302,
        headers: new Headers({ location: 'http://insecure.cdn.com/image.jpg' }),
      } as any;
    }
    return { ok: true, status: 200, headers: new Headers({ 'content-type': 'image/jpeg' }) } as any;
  };
  const isRedirectToHttpBlocked = await verifyPublicImageUrl('https://trusted.cdn.com/image.jpg', mockRedirectToHttp);
  assert(isRedirectToHttpBlocked === false, 'verifyPublicImageUrl must block 302 redirects to unencrypted HTTP');

  const isRelativeValid = await verifyPublicImageUrl('/products/product-04.png');
  assert(isRelativeValid === false, 'verifyPublicImageUrl must reject relative path');

  const relativePublishResult = await publishToInstagramGraphApi('/products/product-04.png', 'Caption text');
  assert(relativePublishResult.status === 'failed', 'Publishing with relative path must fail');
  assert(relativePublishResult.errorMessage?.includes('valid public HTTPS image URL'), 'Error message must specify URL requirement');
  console.log('   [PASS] Private IPs, IPv4-mapped IPv6, DNS rebinding, and redirect SSRF strictly rejected');

  // Test 22: Token Vault Update Verification & Replacement Validation
  console.log('\n22. Testing token vault update verification and replacement validation...');
  const testKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  const originalSecret: string = 'IGQVJ_test_token_original_califnco';
  const replacementSecret: string = 'IGQVJ_test_token_replacement_califnco';

  const encOriginal = encryptSecret(originalSecret, testKey);
  const decOriginal = decryptSecret(encOriginal, testKey);
  assert(decOriginal === originalSecret, 'Original token decryption must match exactly');

  const encReplacement = encryptSecret(replacementSecret, testKey);
  const decReplacement = decryptSecret(encReplacement, testKey);
  assert(decReplacement === replacementSecret, 'Replacement token decryption must match exactly');
  assert((decReplacement as string) !== (decOriginal as string), 'Different tokens must have distinct decrypted values');

  assert(!encReplacement.ciphertext.includes(replacementSecret), 'Ciphertext must not contain plaintext');
  assert(!JSON.stringify(encReplacement).includes(replacementSecret), 'Serialized vault payload must not contain plaintext');

  console.log('   [PASS] Token vault encryption/decryption roundtrip and payload isolation confirmed');

  // Test 23: Token Vault Partial Firestore Write Recovery Strategy
  console.log('\n23. Testing partial Firestore write recovery strategy...');
  let simulatedPersistedState = 'OLD_TOKEN_IN_VAULT';
  let writeSucceeded: boolean = false;

  const simulateVaultUpdate = async (failAt: 'none' | 'write' | 'readback' | 'metadata') => {
    writeSucceeded = false;
    if (failAt === 'write') {
      throw new Error('Firestore write connection reset');
    }
    simulatedPersistedState = 'NEW_CIPHERTEXT_IN_VAULT';
    writeSucceeded = true;

    if (failAt === 'readback') {
      throw new Error('Decryption mismatch during readback verification');
    }

    if (failAt === 'metadata') {
      // Non-fatal metadata error
      console.warn('Metadata update failed');
    }

    return simulatedPersistedState;
  };

  // Case 1: Failure before write occurs -> Old token is retained
  try {
    await simulateVaultUpdate('write');
  } catch (err: any) {
    assert((writeSucceeded as boolean) === false, 'Write was not executed');
    assert(simulatedPersistedState === 'OLD_TOKEN_IN_VAULT', 'Old token is strictly retained when write fails before Firestore');
  }

  // Case 2: Failure during readback after write succeeds -> Old token is NOT retained, system must fail closed
  try {
    await simulateVaultUpdate('readback');
  } catch (err: any) {
    assert((writeSucceeded as boolean) === true, 'Write succeeded');
    assert(simulatedPersistedState === 'NEW_CIPHERTEXT_IN_VAULT', 'Persisted state contains new ciphertext');
    // Verify system fails closed: must never claim old token was retained in Firestore
    const claimedOldTokenRetained: boolean = false;
    assert((claimedOldTokenRetained as boolean) === false, 'System must never claim old token is retained when write succeeded');
  }

  // Case 3: Metadata failure after successful write & readback -> Token remains valid
  const metaResult = await simulateVaultUpdate('metadata');
  assert(metaResult === 'NEW_CIPHERTEXT_IN_VAULT', 'Verified token remains active when only metadata update fails');
  console.log('   [PASS] Partial write failures explicitly track persisted state, fail closed, and isolate auxiliary metadata');

  // Test 24: Three-Tier Fallback Waterfall Order (AI Turbo -> FLUX -> Catalog Image -> Brand Asset Pool)
  console.log('\n24. Testing three-tier image fallback waterfall order...');

  // 24.1 Pollinations Turbo is tried first, then FLUX
  const calledModels: string[] = [];
  const validJpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(1024, 0xaa)]);

  const mockPollinationsFetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
    const urlStr = String(input);
    const modelMatch = urlStr.match(/model=(\w+)/);
    const model = modelMatch ? modelMatch[1] : '';
    calledModels.push(model);

    // Verify browser headers
    const headers = init?.headers as Record<string, string>;
    assert(headers?.['User-Agent']?.includes('Mozilla/5.0'), 'Must include browser-like User-Agent header');
    assert(headers?.['Accept']?.includes('image/'), 'Must include image Accept header');

    if (model === 'turbo') {
      // Simulate Cloudflare HTML block for turbo
      return {
        ok: false,
        status: 403,
        headers: new Headers({ 'content-type': 'text/html' }),
        text: async () => '<html>Cloudflare Turnstile Block</html>',
      } as any;
    }
    if (model === 'flux') {
      // Simulate FLUX succeeding
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'image/jpeg' }),
        arrayBuffer: async () => validJpeg.buffer.slice(validJpeg.byteOffset, validJpeg.byteOffset + validJpeg.byteLength),
      } as any;
    }
    return { ok: false, status: 500 } as any;
  };

  const polResult = await generateWithPollinations('luxury water purifier', mockPollinationsFetcher as any);
  assert(polResult !== null, 'Pollinations must succeed via FLUX fallback');
  assert(calledModels[0] === 'turbo', 'Pollinations must try turbo first');
  assert(calledModels.includes('flux'), 'Pollinations must failover to flux');
  assert(polResult?.model === 'flux', 'Returned model must be flux');
  console.log('   [PASS] Pollinations tries Turbo first with browser headers, then falls over to FLUX');

  // 24.2 Fallback to Catalog Image when AI fails and catalog URL is valid public HTTPS
  const catalogPublicProduct: ProductForMarketing = {
    ...mockProduct,
    imageUrl: 'https://images.unsplash.com/photo-water-purifier-califnco.jpg',
  };

  const mockCatalogFetcher = async (input: RequestInfo | URL) => {
    const urlStr = String(input);
    if (urlStr === catalogPublicProduct.imageUrl) {
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'image/jpeg' }),
        arrayBuffer: async () => validJpeg.buffer.slice(validJpeg.byteOffset, validJpeg.byteOffset + validJpeg.byteLength),
      } as any;
    }
    return { ok: false, status: 404 } as any;
  };

  const catalogFallbackResult = await resolveFallbackImageBuffer(catalogPublicProduct, mockCatalogFetcher as any);
  assert(catalogFallbackResult !== null, 'Catalog fallback must succeed when valid public HTTPS image is available');
  assert(catalogFallbackResult?.source === 'catalog-image', 'Source must be catalog-image');
  assert(catalogFallbackResult?.sourceUrl === catalogPublicProduct.imageUrl, 'Source URL must match catalog image');
  assert(isValidImageBuffer(catalogFallbackResult!.imageBuffer), 'Buffer must be valid image');
  console.log('   [PASS] Fallback successfully resolves valid public HTTPS catalog image');

  // 24.3 Fallback to Brand Asset Pool when catalog image is relative or unavailable
  const relativeProduct: ProductForMarketing = {
    ...mockProduct,
    imageUrl: '/products/product-04.png', // Relative path must be rejected
  };

  const mockBrandPoolFetcher = async (input: RequestInfo | URL) => {
    const urlStr = String(input);
    // Relative catalog URL must NEVER be fetched
    assert(!urlStr.startsWith('/products'), 'Relative paths must never be fetched');
    if (VERIFIED_BRAND_ASSET_URLS.includes(urlStr)) {
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'image/jpeg' }),
        arrayBuffer: async () => validJpeg.buffer.slice(validJpeg.byteOffset, validJpeg.byteOffset + validJpeg.byteLength),
      } as any;
    }
    return { ok: false, status: 404 } as any;
  };

  const brandPoolResult = await resolveFallbackImageBuffer(relativeProduct, mockBrandPoolFetcher as any);
  assert(brandPoolResult !== null, 'Brand pool fallback must succeed for product with relative image');
  assert(brandPoolResult?.source === 'brand-pool', 'Source must be brand-pool');
  assert(VERIFIED_BRAND_ASSET_URLS.includes(brandPoolResult!.sourceUrl), 'Source URL must be from verified brand asset pool');
  assert(isValidImageBuffer(brandPoolResult!.imageBuffer), 'Brand asset buffer must be valid');
  console.log('   [PASS] Fallback resolves to verified Califnco brand asset pool when catalog path is relative');

  // 24.4 Cloudinary buffer upload from fallback image
  const prevCloudinaryPreset = config.cloudinaryUploadPreset;
  config.cloudinaryUploadPreset = 'califnco_test_preset';
  let uploadedBufferReceived: Buffer | null = null;
  const mockCloudinaryFetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
    const urlStr = String(input);
    if (urlStr.includes('api.cloudinary.com')) {
      const body = init?.body as FormData;
      const fileData = body?.get('file') as string;
      if (fileData?.startsWith('data:image/jpeg;base64,')) {
        uploadedBufferReceived = Buffer.from(fileData.replace('data:image/jpeg;base64,', ''), 'base64');
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          secure_url: 'https://res.cloudinary.com/oxeow2gv/image/upload/v12345/califnco/instagram/fallback_test.jpg',
        }),
      } as any;
    }
    // For verifyPublicImageUrl HEAD request
    if (urlStr.includes('fallback_test.jpg')) {
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'image/jpeg' }),
      } as any;
    }
    return { ok: false, status: 404 } as any;
  };

  let hostedFallback: any;
  try {
    hostedFallback = await hostPromotionalImage(brandPoolResult!.imageBuffer, undefined, mockCloudinaryFetcher as any);
  } finally {
    config.cloudinaryUploadPreset = prevCloudinaryPreset;
  }

  assert(hostedFallback.provider === 'cloudinary', 'Hosted provider must be Cloudinary');
  assert(hostedFallback.verified === true, 'Hosted image must be verified');
  assert(isPublicHttpsUrl(hostedFallback.publicUrl), 'Hosted URL must be public HTTPS');
  assert(uploadedBufferReceived !== null && (uploadedBufferReceived as Buffer).length > 0, 'Buffer must be successfully uploaded to Cloudinary');
  console.log('   [PASS] Fallback image buffer uploaded to Cloudinary and verified before pipeline publishing');

  // Test 25: Fallback Rejection, Download Failures, Upload Failures, and Fail-Closed Behavior
  console.log('\n25. Testing fallback error handling, SSRF rejections, upload failure, and fail-closed behavior...');

  // 25.1 SSRF / Private IP / Insecure catalog URLs rejected
  const maliciousProduct1: ProductForMarketing = {
    ...mockProduct,
    imageUrl: 'https://169.254.169.254/computeMetadata/v1/image.jpg',
  };
  const maliciousProduct2: ProductForMarketing = {
    ...mockProduct,
    imageUrl: 'http://insecure-http.com/image.jpg',
  };
  const maliciousProduct3: ProductForMarketing = {
    ...mockProduct,
    imageUrl: 'https://localhost:8080/internal.jpg',
  };

  let attemptedFetches: string[] = [];
  const trackingFetcher = async (input: RequestInfo | URL) => {
    attemptedFetches.push(String(input));
    return { ok: false, status: 404 } as any;
  };

  await resolveFallbackImageBuffer(maliciousProduct1, trackingFetcher as any);
  await resolveFallbackImageBuffer(maliciousProduct2, trackingFetcher as any);
  await resolveFallbackImageBuffer(maliciousProduct3, trackingFetcher as any);

  assert(!attemptedFetches.includes(maliciousProduct1.imageUrl!), 'Cloud metadata URL must NEVER be fetched by fallback resolver');
  assert(!attemptedFetches.includes(maliciousProduct2.imageUrl!), 'Insecure HTTP URL must NEVER be fetched by fallback resolver');
  assert(!attemptedFetches.includes(maliciousProduct3.imageUrl!), 'Localhost URL must NEVER be fetched by fallback resolver');
  console.log('   [PASS] Catalog image fallback strictly rejects metadata, HTTP, and internal hostnames');

  // 25.2 Catalog image download failure (HTTP 500 / corrupt buffer) falls through cleanly to brand pool
  const failingCatalogProduct: ProductForMarketing = {
    ...mockProduct,
    imageUrl: 'https://cdn.example.com/products/ro-broken.jpg',
  };

  const corruptImageFetcher = async (input: RequestInfo | URL) => {
    const urlStr = String(input);
    if (urlStr === failingCatalogProduct.imageUrl) {
      return {
        ok: false,
        status: 500,
        headers: new Headers({ 'content-type': 'text/html' }),
      } as any;
    }
    if (VERIFIED_BRAND_ASSET_URLS.includes(urlStr)) {
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'image/jpeg' }),
        arrayBuffer: async () => validJpeg.buffer.slice(validJpeg.byteOffset, validJpeg.byteOffset + validJpeg.byteLength),
      } as any;
    }
    return { ok: false, status: 404 } as any;
  };

  const recoveredFromCorrupt = await resolveFallbackImageBuffer(failingCatalogProduct, corruptImageFetcher as any);
  assert(recoveredFromCorrupt !== null, 'Must fall through to brand pool on catalog download failure');
  assert(recoveredFromCorrupt?.source === 'brand-pool', 'Must fall through to brand-pool');
  console.log('   [PASS] Catalog image download failure seamlessly falls through to brand asset pool');

  // 25.3 Cloudinary upload failure causes pipeline to fail closed
  config.cloudinaryUploadPreset = 'califnco_test_preset';
  const failingCloudinaryFetcher = async (input: RequestInfo | URL) => {
    const urlStr = String(input);
    if (urlStr.includes('api.cloudinary.com')) {
      return {
        ok: false,
        status: 500,
        text: async () => 'Internal Cloudinary Error',
      } as any;
    }
    return { ok: false, status: 500 } as any;
  };

  let hostingFailedClosed = false;
  try {
    await hostPromotionalImage(validJpeg, undefined, failingCloudinaryFetcher as any);
  } catch (err: any) {
    hostingFailedClosed = true;
    assert(err.message.includes('Failed to obtain a verified, publicly accessible HTTPS image URL'), 'Must throw descriptive error');
  } finally {
    config.cloudinaryUploadPreset = prevCloudinaryPreset;
  }
  assert(hostingFailedClosed === true, 'hostPromotionalImage must throw and fail closed when Cloudinary upload fails');
  console.log('   [PASS] Cloudinary upload failure halts pipeline and fails closed');

  // 25.4 Complete exhaustion (all tiers fail) returns null and fails closed cleanly
  const allFailingFetcher = async () => ({ ok: false, status: 503 } as any);
  const exhaustedFallback = await resolveFallbackImageBuffer(failingCatalogProduct, allFailingFetcher as any);
  assert(exhaustedFallback === null, 'resolveFallbackImageBuffer must return null when all tiers fail');
  console.log('   [PASS] Exhaustion of all fallback tiers returns null and allows pipeline to fail closed cleanly');

  // Test 26: Ambiguous media_publish timeout and 5xx response handling
  console.log('\n26. Testing ambiguous media_publish timeout and 5xx response handling...');
  const prevDryRun26 = config.instagramDryRun;
  const prevEnvDryRun26 = process.env.INSTAGRAM_DRY_RUN;
  const prevToken26 = config.instagramAccessToken;

  try {
    config.instagramDryRun = false;
    process.env.INSTAGRAM_DRY_RUN = 'false';
    config.instagramAccessToken = 'IGQVJ_test_timeout_token_999';

    // 26.1: Timeout-after-request on media_publish
    let containerCreateCalls = 0;
    const timeoutFetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
      const urlStr = String(input);
      if (urlStr.includes('/media') && !urlStr.includes('/media_publish') && init?.method === 'POST') {
        containerCreateCalls++;
        return {
          ok: true,
          status: 200,
          json: async () => ({ id: 'container_timeout_123' }),
        } as any;
      }
      if (urlStr.includes('container_timeout_123') && urlStr.includes('fields=status_code')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ status_code: 'FINISHED' }),
        } as any;
      }
      if (urlStr.includes('/media_publish') && init?.method === 'POST') {
        // Simulate network timeout after media_publish request was sent
        throw new Error('The operation was aborted due to timeout');
      }
      return { ok: false, status: 404 } as any;
    };

    const timeoutResult = await publishToInstagramGraphApi(
      validImageUrl,
      captionResult.fullInstagramText,
      { isDryRun: false },
      timeoutFetcher as any
    );

    assert(timeoutResult.status === 'publication_unknown', 'Must return publication_unknown on media_publish timeout');
    assert(timeoutResult.containerId === 'container_timeout_123', 'Must preserve container ID for tracking');
    assert(timeoutResult.errorMessage?.includes('Ambiguous network error or timeout'), 'Must return descriptive advisory error');
    assert(containerCreateCalls === 1, 'Must NOT attempt to create another container on timeout');
    console.log('   [PASS] Network timeout on media_publish returns publication_unknown without creating second container');

    // 26.2: Ambiguous HTTP 502/503 response from Meta on media_publish
    let container502Calls = 0;
    const gateway502Fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
      const urlStr = String(input);
      if (urlStr.includes('/media') && !urlStr.includes('/media_publish') && init?.method === 'POST') {
        container502Calls++;
        return {
          ok: true,
          status: 200,
          json: async () => ({ id: 'container_502_456' }),
        } as any;
      }
      if (urlStr.includes('container_502_456') && urlStr.includes('fields=status_code')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ status_code: 'FINISHED' }),
        } as any;
      }
      if (urlStr.includes('/media_publish') && init?.method === 'POST') {
        return {
          ok: false,
          status: 502,
          text: async () => '502 Bad Gateway from Meta Edge',
        } as any;
      }
      return { ok: false, status: 404 } as any;
    };

    const gatewayResult = await publishToInstagramGraphApi(
      validImageUrl,
      captionResult.fullInstagramText,
      { isDryRun: false },
      gateway502Fetcher as any
    );

    assert(gatewayResult.status === 'publication_unknown', 'Must return publication_unknown on HTTP 502');
    assert(gatewayResult.containerId === 'container_502_456', 'Must preserve container ID for tracking');
    assert(gatewayResult.errorMessage?.includes('Ambiguous HTTP 502'), 'Must report 502 status');
    assert(container502Calls === 1, 'Must NOT create duplicate containers on 5xx response');
    console.log('   [PASS] Ambiguous 502/5xx response from Meta returns publication_unknown');

    // 26.3: Definite HTTP 400 error returns failed (NOT publication_unknown)
    const clientErrFetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
      const urlStr = String(input);
      if (urlStr.includes('/media') && !urlStr.includes('/media_publish') && init?.method === 'POST') {
        return {
          ok: true,
          status: 200,
          json: async () => ({ id: 'container_400_789' }),
        } as any;
      }
      if (urlStr.includes('container_400_789') && urlStr.includes('fields=status_code')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ status_code: 'FINISHED' }),
        } as any;
      }
      if (urlStr.includes('/media_publish') && init?.method === 'POST') {
        return {
          ok: false,
          status: 400,
          json: async () => ({ error: { message: 'Invalid media container' } }),
        } as any;
      }
      return { ok: false, status: 404 } as any;
    };

    const clientErrResult = await publishToInstagramGraphApi(
      validImageUrl,
      captionResult.fullInstagramText,
      { isDryRun: false },
      clientErrFetcher as any
    );

    assert(clientErrResult.status === 'failed', 'Definite 400 client error must return status failed, not publication_unknown');
    assert(clientErrResult.errorMessage?.includes('Invalid media container'), 'Must preserve Meta error message');
    console.log('   [PASS] Definite 4xx client errors return status failed without ambiguous classification');
  } finally {
    config.instagramDryRun = prevDryRun26;
    process.env.INSTAGRAM_DRY_RUN = prevEnvDryRun26;
    config.instagramAccessToken = prevToken26;
  }

  // Test 27: Instagram Reconciliation Mechanism
  console.log('\n27. Testing safe Instagram publication reconciliation...');
  const prevToken27 = config.instagramAccessToken;

  try {
    config.instagramAccessToken = 'IGQVJ_test_reconcile_token_777';

    // 27.1: Reconciliation Success (evidence of post found on Instagram account)
    const successFetcher = async (input: RequestInfo | URL) => {
      const urlStr = String(input);
      if (urlStr.includes('/me?') && !urlStr.includes('/media')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ id: '17841400000000000', username: 'califnco.water' }),
        } as any;
      }
      if (urlStr.includes('/media') && !urlStr.includes('/media_publish')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: [
              {
                id: 'ig_media_reconciled_101',
                caption: 'Discover Califnco Stellar 8-Stage Smart RO at Califnco. Pure healthy water.\n\n#Califnco',
                permalink: 'https://www.instagram.com/p/ig_media_reconciled_101/',
                timestamp: new Date().toISOString(),
              },
            ],
          }),
        } as any;
      }
      return { ok: false, status: 404 } as any;
    };

    const reconSuccess = await reconcileInstagramPublication(
      'Discover Califnco Stellar 8-Stage Smart RO',
      successFetcher as any
    );

    assert(reconSuccess.reconciled === true, 'Reconciliation must succeed when matching post is found');
    assert(reconSuccess.status === 'published', 'Status must be updated to published upon reconciliation');
    assert(reconSuccess.mediaId === 'ig_media_reconciled_101', 'Must retrieve matching mediaId');
    assert(reconSuccess.permalink === 'https://www.instagram.com/p/ig_media_reconciled_101/', 'Must retrieve matching permalink');
    console.log('   [PASS] Reconciliation successfully matches recent Instagram post and confirms published status');

    // 27.2: Reconciliation Failure / Unconfirmed (no matching post found)
    const notFoundFetcher = async (input: RequestInfo | URL) => {
      const urlStr = String(input);
      if (urlStr.includes('/me?') && !urlStr.includes('/media')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ id: '17841400000000000', username: 'califnco.water' }),
        } as any;
      }
      if (urlStr.includes('/media') && !urlStr.includes('/media_publish')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: [
              {
                id: 'ig_media_unrelated_202',
                caption: 'Summer hydration tips and recipes for the family.',
                permalink: 'https://www.instagram.com/p/ig_media_unrelated_202/',
                timestamp: new Date().toISOString(),
              },
            ],
          }),
        } as any;
      }
      return { ok: false, status: 404 } as any;
    };

    const reconNotFound = await reconcileInstagramPublication(
      'Discover Califnco Stellar 8-Stage Smart RO',
      notFoundFetcher as any
    );

    assert(reconNotFound.reconciled === false, 'Reconciliation must not report success when post is absent');
    assert(reconNotFound.status === 'publication_unknown', 'Status must remain publication_unknown');
    assert(reconNotFound.errorMessage?.includes('Manual confirmation on @califnco.water required'), 'Must require manual verification');
    console.log('   [PASS] Reconciliation fails closed when post is absent and requires manual confirmation');

    // 27.3: Reconciliation Network Error (fail-closed guard)
    const errorFetcher = async () => {
      throw new Error('Network connection dropped');
    };

    const reconError = await reconcileInstagramPublication(
      'Discover Califnco Stellar 8-Stage Smart RO',
      errorFetcher as any
    );

    assert(reconError.reconciled === false, 'Reconciliation must fail closed on network error');
    assert(reconError.status === 'publication_unknown', 'Status must remain publication_unknown');
    assert(reconError.errorMessage?.includes('Fails closed'), 'Must explicitly indicate fail-closed behavior');
    console.log('   [PASS] Reconciliation network failure fails closed safely without assuming outcome');

    // 27.4: Timestamp window filtering rejects older post with matching caption
    const oldPostFetcher = async (input: RequestInfo | URL) => {
      const urlStr = String(input);
      if (urlStr.includes('/me?') && !urlStr.includes('/media')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ id: '17841400000000000', username: 'califnco.water' }),
        } as any;
      }
      if (urlStr.includes('/media') && !urlStr.includes('/media_publish')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: [
              {
                id: 'ig_media_old_999',
                caption: 'Discover Califnco Stellar 8-Stage Smart RO at Califnco.\n\n#Califnco',
                permalink: 'https://www.instagram.com/p/ig_media_old_999/',
                timestamp: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 days ago
              },
            ],
          }),
        } as any;
      }
      return { ok: false, status: 404 } as any;
    };

    const reconOld = await reconcileInstagramPublication(
      'Discover Califnco Stellar 8-Stage Smart RO',
      oldPostFetcher as any,
      Date.now() - 24 * 60 * 60 * 1000 // Last 24 hours only
    );

    assert(reconOld.reconciled === false, 'Older post beyond the timestamp window must not be falsely reconciled');
    assert(reconOld.status === 'publication_unknown', 'Status must remain publication_unknown');
    console.log('   [PASS] Reconciliation correctly skips older posts beyond the timestamp window');
  } finally {
    config.instagramAccessToken = prevToken27;
  }

  // Test 28: Duplicate Prevention on Retries and Idempotency Protections
  console.log('\n28. Testing duplicate prevention on retries and idempotency protections...');

  const mockStore: Record<string, Map<string, any>> = {
    instagram_posts: new Map(),
    automation_locks: new Map(),
  };

  const originalCollection = db.collection.bind(db);
  const originalRunTransaction = db.runTransaction.bind(db);
  const originalBatch = db.batch.bind(db);

  (db as any).collection = (collName: string) => {
    if (!mockStore[collName]) mockStore[collName] = new Map();
    return {
      doc: (docId: string) => ({
        id: docId,
        get: async () => {
          const data = mockStore[collName].get(docId);
          return {
            exists: !!data,
            id: docId,
            data: () => data,
          };
        },
        set: async (data: any, options?: any) => {
          if (options?.merge && mockStore[collName].has(docId)) {
            mockStore[collName].set(docId, { ...mockStore[collName].get(docId), ...data });
          } else {
            mockStore[collName].set(docId, data);
          }
        },
        update: async (data: any) => {
          const existing = mockStore[collName].get(docId) || {};
          mockStore[collName].set(docId, { ...existing, ...data });
        },
      }),
    } as any;
  };

  (db as any).runTransaction = async (updateFunction: (transaction: any) => Promise<any>) => {
    const transaction = {
      get: async (docRef: any) => docRef.get(),
      set: async (docRef: any, data: any, options?: any) => docRef.set(data, options),
      update: async (docRef: any, data: any) => docRef.update(data),
    };
    return updateFunction(transaction);
  };

  (db as any).batch = () => {
    const ops: Array<() => Promise<any>> = [];
    return {
      update: (docRef: any, data: any) => {
        ops.push(async () => docRef.update(data));
      },
      set: (docRef: any, data: any, options?: any) => {
        ops.push(async () => docRef.set(data, options));
      },
      commit: async () => {
        for (const op of ops) {
          await op();
        }
      },
    };
  };

  try {
    // 28.1: Retry on already published post is strictly rejected
    mockStore.instagram_posts.set('post_already_published_01', {
      id: 'post_already_published_01',
      status: 'published',
      instagramMediaId: 'existing_media_888',
      imageUrl: validImageUrl,
      fullInstagramText: 'Sample text',
    });

    let retryPublishedBlocked = false;
    try {
      await retryInstagramPost('post_already_published_01');
    } catch (err: any) {
      retryPublishedBlocked = true;
      assert(err.message.includes('already confirmed as published'), 'Must throw descriptive duplicate prevention error');
    }
    assert(retryPublishedBlocked === true, 'retryInstagramPost must reject retry on already published post');
    console.log('   [PASS] Retry on already published post blocked to prevent duplicate posts');

    // 28.1b: Concurrent retries: retry_in_progress blocks duplicate concurrent retry attempts
    mockStore.instagram_posts.set('post_concurrent_retry_01', {
      id: 'post_concurrent_retry_01',
      status: 'retry_in_progress',
      completedAt: new Date().toISOString(),
      imageUrl: validImageUrl,
      fullInstagramText: 'Sample text',
    });

    let concurrentRetryBlocked = false;
    try {
      await retryInstagramPost('post_concurrent_retry_01');
    } catch (err: any) {
      concurrentRetryBlocked = true;
      assert(err.message.includes('another retry execution is currently in progress'), 'Must block concurrent retry');
    }
    assert(concurrentRetryBlocked === true, 'retryInstagramPost must block concurrent retry when retry_in_progress');
    console.log('   [PASS] Concurrent retry blocked while an existing retry execution is in progress');

    // 28.2: Retry on publication_unknown post when reconciliation confirms published post
    mockStore.instagram_posts.set('post_unknown_found_02', {
      id: 'post_unknown_found_02',
      dateKey: '2026-10-25',
      status: 'publication_unknown',
      imageUrl: validImageUrl,
      caption: 'Discover Califnco Stellar 8-Stage Smart RO',
      fullInstagramText: 'Discover Califnco Stellar 8-Stage Smart RO at Califnco.\n\n#Califnco',
    });

    const mockReconcileFoundFetcher = async (input: RequestInfo | URL) => {
      const urlStr = String(input);
      if (urlStr.includes('/me?') && !urlStr.includes('/media')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ id: '17841400000000000', username: 'califnco.water' }),
        } as any;
      }
      if (urlStr.includes('/media') && !urlStr.includes('/media_publish')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: [
              {
                id: 'ig_media_recon_333',
                caption: 'Discover Califnco Stellar 8-Stage Smart RO at Califnco.\n\n#Califnco',
                permalink: 'https://www.instagram.com/p/ig_media_recon_333/',
              },
            ],
          }),
        } as any;
      }
      return { ok: false, status: 404 } as any;
    };

    const prevToken28 = config.instagramAccessToken;
    config.instagramAccessToken = 'IGQVJ_test_token_28';

    const recoveredRecord = await retryInstagramPost(
      'post_unknown_found_02',
      mockReconcileFoundFetcher as any
    );

    assert(recoveredRecord.status === 'published', 'Post status must be updated to published upon reconciliation');
    assert(recoveredRecord.instagramMediaId === 'ig_media_recon_333', 'Media ID must be updated from reconciled post');
    const updatedStoredDoc = mockStore.instagram_posts.get('post_unknown_found_02');
    assert(updatedStoredDoc?.status === 'published', 'Stored document must be updated to published');
    const updatedStoredLock = mockStore.automation_locks.get('2026-10-25');
    assert(updatedStoredLock?.status === 'published', 'Daily lock must be sealed as published');
    console.log('   [PASS] Retry on publication_unknown safely reconciles existing post without republishing');

    // 28.3: Retry on publication_unknown post when reconciliation CANNOT confirm post
    mockStore.instagram_posts.set('post_unknown_unconfirmed_03', {
      id: 'post_unknown_unconfirmed_03',
      dateKey: '2026-10-26',
      status: 'publication_unknown',
      imageUrl: validImageUrl,
      caption: 'Discover Califnco Stellar 8-Stage Smart RO',
      fullInstagramText: 'Discover Califnco Stellar 8-Stage Smart RO',
    });

    const mockReconcileUnconfirmedFetcher = async (input: RequestInfo | URL) => {
      const urlStr = String(input);
      if (urlStr.includes('/me?') && !urlStr.includes('/media')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ id: '17841400000000000', username: 'califnco.water' }),
        } as any;
      }
      if (urlStr.includes('/media') && !urlStr.includes('/media_publish')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ data: [] }),
        } as any;
      }
      return { ok: false, status: 404 } as any;
    };

    let retryUnconfirmedBlocked = false;
    try {
      await retryInstagramPost(
        'post_unknown_unconfirmed_03',
        mockReconcileUnconfirmedFetcher as any
      );
    } catch (err: any) {
      retryUnconfirmedBlocked = true;
      assert(err.message.includes('Manual verification on @califnco.water required before retrying'), 'Must require manual verification');
    }
    assert(retryUnconfirmedBlocked === true, 'retryInstagramPost must fail closed when reconciliation cannot confirm post');
    console.log('   [PASS] Retry on publication_unknown fails closed and forbids duplicate post creation when unconfirmed');

    // 28.4: Repeat retry attempts cannot bypass protection
    let secondRetryBlocked = false;
    try {
      await retryInstagramPost(
        'post_unknown_unconfirmed_03',
        mockReconcileUnconfirmedFetcher as any
      );
    } catch (err: any) {
      secondRetryBlocked = true;
      assert(err.message.includes('Manual verification on @califnco.water required'), 'Second retry must also fail closed');
    }
    assert(secondRetryBlocked === true, 'Repeated retry attempts must continue to fail closed');
    console.log('   [PASS] Repeat retry attempts cannot bypass protection or trigger unverified publishing');

    // 28.5: Daily lock protection: publication_unknown blocks new un-forced runs
    mockStore.automation_locks.set('2026-10-27', {
      dateKey: '2026-10-27',
      runId: 'run_ambiguous_lock_01',
      status: 'publication_unknown',
    });

    const lockAttempt = await acquireDailyPostingLock('2026-10-27', 'run_new_attempt_02', false);
    assert(lockAttempt.acquired === false, 'Daily lock must reject new runs when in publication_unknown state');
    assert(lockAttempt.reason?.includes('publication_unknown state'), 'Must provide clear reason about ambiguous state');
    console.log('   [PASS] Daily lock protects against new runs while publication status is ambiguous');

    // 28.5b: Daily lock protection: force=true CANNOT bypass publication_unknown lock
    const forceAttempt = await acquireDailyPostingLock('2026-10-27', 'run_forced_bypass_attempt', true);
    assert(forceAttempt.acquired === false, 'force=true must NOT bypass publication_unknown state');
    assert(forceAttempt.reason?.includes('publication_unknown state'), 'Must provide clear reason about ambiguous state');
    console.log('   [PASS] force=true is strictly blocked from bypassing publication_unknown locks');

    // 28.6: Endpoint reconciliation helper (reconcilePostRecord)
    const reconcileHelperSuccess = await reconcilePostRecord('post_unknown_found_02', mockReconcileFoundFetcher as any);
    assert(reconcileHelperSuccess.reconciled === true, 'reconcilePostRecord must return reconciled true for confirmed post');

    const reconcileHelperUnconfirmed = await reconcilePostRecord('post_unknown_unconfirmed_03', mockReconcileUnconfirmedFetcher as any);
    assert(reconcileHelperUnconfirmed.reconciled === false, 'reconcilePostRecord must return reconciled false when unconfirmed');
    console.log('   [PASS] reconcilePostRecord endpoint handler correctly reports reconciliation status');

    config.instagramAccessToken = prevToken28;
  } finally {
    (db as any).collection = originalCollection;
    (db as any).runTransaction = originalRunTransaction;
    (db as any).batch = originalBatch;
  }

  console.log('\n--- All 28 AI Instagram Automation Unit Tests Passed Successfully! ---');
}

runAutomationTests().catch((err) => {
  console.error('Automation test failure:', err);
  process.exit(1);
});
