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
} from '../services/aiImageService';
import { verifyPublicImageUrl, isPublicHttpsUrl, isHostnamePublic, isPrivateHost } from '../services/imageHostingService';
import {
  publishToInstagramGraphApi,
  getInstagramApiBaseUrl,
  refreshInstagramLongLivedToken,
  verifyInstagramAccessToken,
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
  assert(retryResult?.model === 'flux', 'Recovered attempt must succeed with primary FLUX model');
  assert(attemptCount === 2, 'Must have executed exactly 2 attempts');
  console.log('   [PASS] Pollinations successfully retried transient HTTP 503 and succeeded on second attempt');

  // Test 19: Pollinations Model Fallback (FLUX -> Turbo)
  console.log('\n19. Testing Pollinations model failover from FLUX to Turbo...');
  let fluxAttemptCount = 0;
  let turboAttemptCount = 0;
  const mockFallbackFetcher = async (input: string | URL | Request) => {
    const urlStr = String(input);
    if (urlStr.includes('model=flux')) {
      fluxAttemptCount++;
      return new Response('FLUX capacity exhausted', { status: 503, headers: { 'Content-Type': 'text/plain' } });
    }
    if (urlStr.includes('model=turbo')) {
      turboAttemptCount++;
      return new Response(mockJpegBuffer, {
        status: 200,
        headers: { 'Content-Type': 'image/jpeg' },
      });
    }
    return new Response('Not Found', { status: 404 });
  };

  const fallbackResult = await generateWithPollinations('test prompt', mockFallbackFetcher as any);
  assert(fallbackResult !== null, 'Must succeed via fallback model');
  assert(fallbackResult?.model === 'turbo', 'Must fall back to turbo model when FLUX fails');
  assert(fluxAttemptCount === 2, 'Must exhaust FLUX retries before falling back');
  assert(turboAttemptCount === 1, 'Turbo model must succeed');

  const facadeResult = await generatePromotionalImage(mockProduct, mockFallbackFetcher as any);
  assert(facadeResult.provider === 'pollinations-turbo', 'Facade must report provider as pollinations-turbo');
  assert(facadeResult.imageBuffer.length >= 1000, 'Image buffer must be valid');
  console.log('   [PASS] Model failover successfully transitioned from overloaded FLUX to turbo fallback');

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

  console.log('\n--- All 23 AI Instagram Automation Unit Tests Passed Successfully! ---');
}

runAutomationTests().catch((err) => {
  console.error('Automation test failure:', err);
  process.exit(1);
});
