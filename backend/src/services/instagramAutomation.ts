import { db, FieldValue } from '../firebase';
import { config, updateInstagramAccessToken, isEncryptionKeyValid } from '../config';
import {
  generateInstagramCaption,
  type ProductForMarketing,
  type GeneratedCaptionResult,
} from './aiCaptionService';
import { generatePromotionalImage, type GeneratedImageResult } from './aiImageService';
import { hostPromotionalImage, type HostedImageResult } from './imageHostingService';
import {
  publishToInstagramGraphApi,
  refreshInstagramLongLivedToken,
  type InstagramPublishResult,
} from './instagramPublishService';
import { saveEncryptedTokenToVault } from './tokenVaultService';
import { sanitizeForFirestore } from './orderCalculation';

export interface AutomationRunOptions {
  force?: boolean;
  isManualTrigger?: boolean;
  targetProductId?: string;
}

/**
 * Automatically inspects the Instagram access token age before publishing.
 * Refreshes tokens older than 25 days or approaching expiration.
 * Guarantees that renewed tokens are stored in the AES-256-GCM encrypted vault and in-memory.
 */
export async function ensureValidInstagramToken(): Promise<{ ready: boolean; error?: string }> {
  if (!config.instagramAccessToken) {
    return { ready: false, error: 'Instagram access token is not configured in the environment.' };
  }

  // If encryption vault is configured, validate master key length and cryptographic suitability
  if (config.encryptionMasterKey) {
    const keyCheck = isEncryptionKeyValid(config.encryptionMasterKey);
    if (!keyCheck.valid) {
      return { ready: false, error: `Invalid ENCRYPTION_MASTER_KEY: ${keyCheck.reason}` };
    }
  }

  try {
    const stateDoc = await db.collection('automation_state').doc('instagram_automation').get();
    const stateData = stateDoc.exists ? stateDoc.data() : null;

    const tokenLastRefreshedAt = stateData?.tokenLastRefreshedAt
      ? new Date(stateData.tokenLastRefreshedAt).getTime()
      : 0;
    const tokenExpiresAt = stateData?.tokenExpiresAt
      ? new Date(stateData.tokenExpiresAt).getTime()
      : 0;
    const now = Date.now();

    const isExpired = tokenExpiresAt > 0 && now >= tokenExpiresAt;
    const ageInDays = tokenLastRefreshedAt > 0 ? (now - tokenLastRefreshedAt) / (1000 * 60 * 60 * 24) : 999;
    const shouldRefresh = isExpired || ageInDays >= 25;

    if (shouldRefresh) {
      console.log(`[Token Guard] Token age is ~${Math.round(ageInDays)} days (shouldRefresh: true). Attempting automatic long-lived token refresh...`);
      const refreshResult = await refreshInstagramLongLivedToken(config.instagramAccessToken);

      if (refreshResult.success && refreshResult.refreshedToken) {
        // 1. Update in server-side memory
        updateInstagramAccessToken(refreshResult.refreshedToken);

        const expiresInDays = refreshResult.expiresInDays || 60;
        const newExpiresAt = new Date(now + expiresInDays * 24 * 60 * 60 * 1000).toISOString();

        // 2. Persist to AES-256-GCM encrypted vault (survives container restarts)
        if (config.encryptionMasterKey) {
          try {
            await saveEncryptedTokenToVault(refreshResult.refreshedToken, {
              expiresInDays,
              expiresAt: newExpiresAt,
            });
            console.log('[Token Vault] Renewed token securely written to AES-256-GCM encrypted vault.');
          } catch (vaultErr) {
            const vaultErrMsg = (vaultErr as Error)?.message || 'Failed to write to encrypted vault';
            console.error('[Token Vault] Failed to update encrypted vault:', vaultErrMsg);
            return {
              ready: false,
              error: `Token refreshed but failed to securely persist to encrypted vault: ${vaultErrMsg}. Halting live posting.`,
            };
          }
        }

        // 3. Persist ONLY non-sensitive metadata in Firestore (never the secret token string)
        await db.collection('automation_state').doc('instagram_automation').set(
          {
            tokenLastRefreshedAt: new Date(now).toISOString(),
            tokenExpiresAt: newExpiresAt,
            tokenExpiresInDays: expiresInDays,
          },
          { merge: true }
        );

        console.log(`[Token Guard] Instagram token successfully refreshed. Extended for ~${expiresInDays} days.`);
        return { ready: true };
      } else {
        console.warn(`[Token Guard] Automatic token refresh failed: ${refreshResult.errorMessage}`);
        // If the token is already expired and cannot be refreshed, abort to prevent using an expired token
        if (isExpired) {
          return {
            ready: false,
            error: `Instagram access token expired on ${new Date(tokenExpiresAt).toISOString()} and automatic refresh failed: ${refreshResult.errorMessage}. Please update INSTAGRAM_ACCESS_TOKEN in your environment.`,
          };
        }
      }
    }

    return { ready: true };
  } catch (err: unknown) {
    console.warn('[Token Guard] Error during token age verification:', err);
    return { ready: true };
  }
}

export interface AutomationExecutionRecord {
  id: string;
  runId: string;
  dateKey: string;
  productId: string;
  productName: string;
  productCategory: string;
  productPrice: number;
  productOriginalImage?: string;
  imageUrl: string;
  caption: string;
  hashtags: string[];
  fullInstagramText: string;
  status: 'published' | 'awaiting_credentials' | 'failed';
  providers: {
    llm: string;
    image: string;
    hosting: string;
    publishing: string;
  };
  instagramMediaId?: string;
  instagramPermalink?: string;
  instagramContainerId?: string;
  errorDetails?: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  retryCount: number;
  idempotencyKey: string;
  isManualTrigger: boolean;
}

/**
 * Returns current dateKey (YYYY-MM-DD) in the configured timezone (default: Asia/Kolkata)
 */
export function getCurrentDateKey(timezone: string = config.automationTimezone): string {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return formatter.format(new Date()); // Formats as YYYY-MM-DD
  } catch {
    return new Date().toISOString().split('T')[0];
  }
}

/**
 * Fetches eligible products from the Firestore 'products' catalog
 */
async function getEligibleProducts(): Promise<ProductForMarketing[]> {
  const productsRef = db.collection('products');
  const snapshot = await productsRef.get();

  if (snapshot.empty) {
    throw new Error('No products found in Firestore catalog.');
  }

  const products: ProductForMarketing[] = [];
  snapshot.forEach((doc) => {
    const data = doc.data();
    // Exclude deleted or inactive products
    if (data.status === 'deleted' || data.isActive === false) return;
    if (!data.name || typeof data.price !== 'number') return;

    products.push({
      id: doc.id,
      name: data.name,
      description: data.description || '',
      price: data.price,
      category: data.category || 'water-purifiers',
      features: Array.isArray(data.features) ? data.features : [],
      specifications: typeof data.specifications === 'object' ? data.specifications : {},
      imageUrl: data.imageUrl || '',
    });
  });

  if (products.length === 0) {
    throw new Error('No eligible products found in Firestore catalog.');
  }

  return products;
}

/**
 * Deterministically selects the next product using round-robin pointer stored in Firestore
 */
async function selectNextProduct(
  products: ProductForMarketing[],
  targetProductId?: string
): Promise<{ product: ProductForMarketing; index: number }> {
  if (targetProductId) {
    const found = products.find((p) => p.id === targetProductId);
    if (found) return { product: found, index: products.indexOf(found) };
  }

  const stateDocRef = db.collection('automation_state').doc('instagram_automation');
  const stateSnap = await stateDocRef.get();
  let lastIndex = -1;

  if (stateSnap.exists) {
    const data = stateSnap.data();
    if (typeof data?.lastProductIndex === 'number') {
      lastIndex = data.lastProductIndex;
    } else if (data?.lastProductId) {
      lastIndex = products.findIndex((p) => p.id === data.lastProductId);
    }
  }

  const nextIndex = (lastIndex + 1) % products.length;
  return { product: products[nextIndex], index: nextIndex };
}

/**
 * Atomically acquires the daily posting lock using a Firestore transaction.
 * Guarantees that concurrent executions (e.g. GitHub Actions and Render cron) cannot both execute.
 */
export async function acquireDailyPostingLock(
  dateKey: string,
  runId: string,
  force?: boolean
): Promise<{ acquired: boolean; reason?: string; existingDocId?: string }> {
  if (force) {
    return { acquired: true };
  }

  const lockRef = db.collection('automation_locks').doc(dateKey);

  return db.runTransaction(async (transaction) => {
    const lockSnap = await transaction.get(lockRef);

    if (lockSnap.exists) {
      const data = lockSnap.data();

      // 1. If already published for this dateKey, permanently seal it
      if (data?.status === 'published') {
        return {
          acquired: false,
          reason: `Post already published for date ${dateKey}.`,
          existingDocId: data.runId,
        };
      }

      // 2. If in-progress, check lock lease duration (15 minutes)
      if (data?.status === 'in_progress') {
        const lockedAtMs = new Date(data.lockedAt || 0).getTime();
        const isStale = Date.now() - lockedAtMs > 15 * 60 * 1000;

        if (!isStale) {
          return {
            acquired: false,
            reason: `Workflow execution currently in progress by another worker (locked at ${data.lockedAt}).`,
            existingDocId: data.runId,
          };
        }
      }
    }

    // 3. Atomically acquire lock
    transaction.set(
      lockRef,
      {
        dateKey,
        runId,
        status: 'in_progress',
        lockedAt: new Date().toISOString(),
        workerPid: process.pid,
      },
      { merge: true }
    );

    return { acquired: true };
  });
}

/**
 * Executes the complete automated Instagram product publishing workflow
 */
export async function executeDailyInstagramPosting(
  options: AutomationRunOptions = {}
): Promise<AutomationExecutionRecord> {
  const startedAt = new Date();
  const startTime = startedAt.getTime();
  const dateKey = options.isManualTrigger
    ? `test_${getCurrentDateKey()}_${Date.now()}`
    : getCurrentDateKey();
  const runId = `run_${dateKey}_${Date.now()}`;

  console.log(`[Automation] Starting daily Instagram run: ${runId} for date: ${dateKey}`);

  // ----------------------------------------------------
  // STEP 1: Atomic Idempotency Lock (Prevent duplicate posts under concurrency)
  // ----------------------------------------------------
  const lockResult = await acquireDailyPostingLock(dateKey, runId, options.force);
  if (!lockResult.acquired) {
    console.log(`[Automation] Aborting run ${runId}: ${lockResult.reason}`);
    if (lockResult.existingDocId) {
      const existingDoc = await db.collection('instagram_posts').doc(lockResult.existingDocId).get();
      if (existingDoc.exists) {
        return existingDoc.data() as AutomationExecutionRecord;
      }
    }
    throw new Error(`Daily automation run skipped: ${lockResult.reason}`);
  }

  // ----------------------------------------------------
  // STEP 2: Select Real Product from Firestore Catalog
  // ----------------------------------------------------
  const eligibleProducts = await getEligibleProducts();
  const { product: selectedProduct, index: productIndex } = await selectNextProduct(
    eligibleProducts,
    options.targetProductId
  );

  console.log(`[Automation] Selected product: "${selectedProduct.name}" (ID: ${selectedProduct.id})`);

  let captionResult: GeneratedCaptionResult | undefined;
  let imageResult: GeneratedImageResult | undefined;
  let hostedResult: HostedImageResult | undefined;
  let publishResult: InstagramPublishResult | undefined;
  let runStatus: 'published' | 'awaiting_credentials' | 'failed' = 'failed';
  let errorDetails: string | undefined;

  try {
    // ----------------------------------------------------
    // STEP 3: Generate Marketing Caption & Hashtags
    // ----------------------------------------------------
    captionResult = await generateInstagramCaption(selectedProduct);
    console.log(`[Automation] Caption generated via provider: ${captionResult.provider}`);

    // ----------------------------------------------------
    // STEP 4: Generate Promotional Product Image
    // ----------------------------------------------------
    imageResult = await generatePromotionalImage(selectedProduct);
    console.log(`[Automation] Promotional image generated via provider: ${imageResult.provider}`);

    // ----------------------------------------------------
    // STEP 5: Host Image on Verified Public HTTPS Endpoint
    // ----------------------------------------------------
    hostedResult = await hostPromotionalImage(imageResult.imageBuffer, imageResult.directPublicUrl);
    console.log(`[Automation] Image hosted on verified public URL via: ${hostedResult.provider}`);

    // ----------------------------------------------------
    // STEP 6: Token Age Verification & Safe Auto-Refresh
    // ----------------------------------------------------
    const tokenCheck = await ensureValidInstagramToken();
    if (!tokenCheck.ready && !config.instagramDryRun) {
      throw new Error(`Token validation failure: ${tokenCheck.error}`);
    }

    // ----------------------------------------------------
    // STEP 6b: Publish to Meta Instagram Graph API
    // ----------------------------------------------------
    const isDryRun = config.instagramDryRun || process.env.INSTAGRAM_DRY_RUN === 'true';
    publishResult = await publishToInstagramGraphApi(
      hostedResult.publicUrl,
      captionResult.fullInstagramText,
      { isDryRun }
    );
    runStatus = publishResult.status;
    errorDetails = publishResult.errorMessage;
    console.log(`[Automation] Instagram publishing result: ${publishResult.status}`);
  } catch (executionErr: unknown) {
    const err = executionErr as Error;
    runStatus = 'failed';
    errorDetails = err?.message || 'Workflow failure occurred during pipeline execution.';
    console.error('[Automation] Pipeline error:', errorDetails);

    // Provide safe fallback values for logging
    captionResult = captionResult! || {
      caption: `Discover ${selectedProduct.name} at Califnco. Pure healthy water for your family.`,
      hashtags: ['#Califnco', '#WaterPurifier'],
      fullInstagramText: `Discover ${selectedProduct.name} at Califnco.\n\n#Califnco #WaterPurifier`,
      provider: 'califnco-template-engine',
    };
    hostedResult = hostedResult! || {
      publicUrl: selectedProduct.imageUrl || '',
      provider: 'direct-public-url',
      verified: false,
    };
    publishResult = {
      status: 'failed',
      errorMessage: errorDetails,
    };
  }

  const completedAt = new Date();
  const durationMs = completedAt.getTime() - startTime;
  const idempotencyKey = `post_${dateKey}_${selectedProduct.id}`;

  // ----------------------------------------------------
  // STEP 7: Persist Execution Record in Cloud Firestore
  // ----------------------------------------------------
  const record: AutomationExecutionRecord = {
    id: runId,
    runId,
    dateKey,
    productId: selectedProduct.id,
    productName: selectedProduct.name,
    productCategory: selectedProduct.category,
    productPrice: selectedProduct.price,
    imageUrl: hostedResult.publicUrl,
    caption: captionResult.caption,
    hashtags: captionResult.hashtags,
    fullInstagramText: captionResult.fullInstagramText,
    status: runStatus,
    providers: {
      llm: captionResult.provider,
      image: imageResult?.provider || 'none',
      hosting: hostedResult.provider,
      publishing: 'instagram-graph-api-v21.0',
    },
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    durationMs,
    retryCount: 0,
    idempotencyKey,
    isManualTrigger: !!options.isManualTrigger,
    ...(selectedProduct.imageUrl ? { productOriginalImage: selectedProduct.imageUrl } : {}),
    ...(publishResult?.mediaId ? { instagramMediaId: publishResult.mediaId } : {}),
    ...(publishResult?.permalink ? { instagramPermalink: publishResult.permalink } : {}),
    ...(publishResult?.containerId ? { instagramContainerId: publishResult.containerId } : {}),
    ...(errorDetails ? { errorDetails } : {}),
  };

  await db.collection('instagram_posts').doc(runId).set(sanitizeForFirestore(record));

  // Update daily lock with terminal status
  await db.collection('automation_locks').doc(dateKey).set(
    sanitizeForFirestore({
      dateKey,
      runId,
      status: runStatus,
      completedAt: completedAt.toISOString(),
      productId: selectedProduct.id,
      productName: selectedProduct.name,
      mediaId: publishResult?.mediaId || null,
      permalink: publishResult?.permalink || null,
      errorDetails: errorDetails || null,
    }),
    { merge: true }
  );

  // Update state pointer
  await db
    .collection('automation_state')
    .doc('instagram_automation')
    .set(
      sanitizeForFirestore({
        lastRunId: runId,
        lastRunDateKey: dateKey,
        lastRunStatus: runStatus,
        lastProductId: selectedProduct.id,
        lastProductName: selectedProduct.name,
        lastProductIndex: productIndex,
        lastUpdated: FieldValue.serverTimestamp(),
        lastRunDurationMs: durationMs,
      }),
      { merge: true }
    );

  console.log(`[Automation] Execution completed in ${durationMs}ms with status: ${runStatus}`);
  return record;
}

/**
 * Retries a failed or awaiting_credentials post execution record
 */
export async function retryInstagramPost(postId: string): Promise<AutomationExecutionRecord> {
  const docRef = db.collection('instagram_posts').doc(postId);
  const snap = await docRef.get();

  if (!snap.exists) {
    throw new Error(`Execution record with ID "${postId}" not found.`);
  }

  const existingRecord = snap.data() as AutomationExecutionRecord;

  // Re-attempt publishing to Instagram with dry-run protection
  const isDryRun = Boolean(config.instagramDryRun || process.env.INSTAGRAM_DRY_RUN === 'true');
  const publishResult = await publishToInstagramGraphApi(
    existingRecord.imageUrl,
    existingRecord.fullInstagramText,
    { isDryRun }
  );

  const mediaId = publishResult.mediaId || existingRecord.instagramMediaId;
  const permalink = publishResult.permalink || existingRecord.instagramPermalink;
  const containerId = publishResult.containerId || existingRecord.instagramContainerId;
  const errorMsg = publishResult.errorMessage || undefined;

  const updatedRecord: Partial<AutomationExecutionRecord> = {
    status: publishResult.status,
    retryCount: (existingRecord.retryCount || 0) + 1,
    completedAt: new Date().toISOString(),
    ...(mediaId ? { instagramMediaId: mediaId } : {}),
    ...(permalink ? { instagramPermalink: permalink } : {}),
    ...(containerId ? { instagramContainerId: containerId } : {}),
    ...(errorMsg ? { errorDetails: errorMsg } : {}),
  };

  await docRef.update(sanitizeForFirestore(updatedRecord));
  return { ...existingRecord, ...updatedRecord } as AutomationExecutionRecord;
}
