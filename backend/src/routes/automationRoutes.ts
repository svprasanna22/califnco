import { Router, Request, Response } from 'express';
import { db } from '../firebase';
import { config, isCronSecretStrong } from '../config';
import {
  executeDailyInstagramPosting,
  retryInstagramPost,
  getCurrentDateKey,
} from '../services/instagramAutomation';
import { refreshInstagramLongLivedToken } from '../services/instagramPublishService';
import { sanitizeForFirestore } from '../services/orderCalculation';

export const automationRouter = Router();

/**
 * Middleware: Verifies admin authorization or automation cron secret key.
 * Requires a strong server-side secret and disables cron execution if missing or weak.
 */
function requireAutomationAuth(req: Request, res: Response, next: () => void) {
  // 1. Enforce that server has a strong AUTOMATION_CRON_SECRET configured
  const secretCheck = isCronSecretStrong(config.automationCronSecret);
  if (!secretCheck.valid) {
    return res.status(500).json({
      error: `Server Configuration Error: ${secretCheck.reason}`,
      code: 'AUTOMATION_CRON_SECRET_INVALID',
    });
  }

  const cronKey = req.headers['x-automation-key'] || req.query.key;

  // 2. Validate client-supplied secret key
  if (cronKey && cronKey === config.automationCronSecret) {
    return next();
  }

  return res.status(401).json({
    error: 'Unauthorized: Missing or invalid x-automation-key secret.',
  });
}

/**
 * GET /api/automation/status
 * Returns system automation health, schedule, and credential status (without exposing secrets)
 */
automationRouter.get('/status', async (req: Request, res: Response) => {
  try {
    const stateDoc = await db.collection('automation_state').doc('instagram_automation').get();
    const stateData = stateDoc.exists ? stateDoc.data() : null;

    // Check credentials configuration status safely (boolean only, zero secret leakage)
    const credentialsHealth = {
      geminiConfigured: !!config.geminiApiKey,
      groqConfigured: !!config.groqApiKey,
      huggingFaceConfigured: !!config.hfToken,
      cloudinaryConfigured: !!(config.cloudinaryCloudName && (config.cloudinaryUploadPreset || (config.cloudinaryApiKey && config.cloudinaryApiSecret))),
      cloudinaryCloudName: config.cloudinaryCloudName || 'oxeow2gv',
      cloudinaryMode: config.cloudinaryUploadPreset ? 'unsigned_preset' : (config.cloudinaryApiKey ? 'signed' : 'unconfigured'),
      imgbbConfigured: !!config.imgbbApiKey,
      instagramConfigured: !!config.instagramAccessToken,
      instagramAccountId: config.instagramAccountId ? `${config.instagramAccountId.slice(0, 4)}...` : 'me (auto)',
      schedulerMode: config.enableInProcessCron ? 'node-cron (in-process)' : 'github-actions (cloud primary)',
      tokenVaultConfigured: !!config.encryptionMasterKey,
      dryRunActive: config.instagramDryRun,
      tokenExpiresInDays: stateData?.tokenExpiresInDays || null,
      tokenExpiresAt: stateData?.tokenExpiresAt || null,
    };

    // Calculate today's execution status
    const todayKey = getCurrentDateKey();
    const todayDoc = await db
      .collection('instagram_posts')
      .where('dateKey', '==', todayKey)
      .orderBy('startedAt', 'desc')
      .limit(1)
      .get();

    const todayPost = !todayDoc.empty ? todayDoc.docs[0].data() : null;

    res.status(200).json({
      status: 'ok',
      automationEnabled: true,
      schedule: {
        cron: config.automationScheduleCron,
        humanSchedule: 'Once daily at 10:00 AM IST',
        timezone: config.automationTimezone,
      },
      currentDateKey: todayKey,
      todayPublished: todayPost?.status === 'published',
      todayStatus: todayPost?.status || 'scheduled_pending',
      todayPostSummary: todayPost
        ? {
          id: todayPost.id,
          productName: todayPost.productName,
          status: todayPost.status,
          permalink: todayPost.instagramPermalink || null,
          imageUrl: todayPost.imageUrl,
          timestamp: todayPost.completedAt,
        }
        : null,
      credentialsHealth,
      lastExecution: stateData || null,
    });
  } catch (error: unknown) {
    const err = error as Error;
    res.status(500).json({ error: err?.message || 'Failed to fetch automation status.' });
  }
});

/**
 * GET /api/automation/logs
 * Returns latest execution history records from Firestore
 */
automationRouter.get('/logs', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(50, parseInt((req.query.limit as string) || '20', 10));
    const snapshot = await db
      .collection('instagram_posts')
      .orderBy('startedAt', 'desc')
      .limit(limit)
      .get();

    const logs = snapshot.docs.map((doc) => doc.data());
    res.status(200).json({ status: 'ok', count: logs.length, logs });
  } catch (error: unknown) {
    const err = error as Error;
    res.status(500).json({ error: err?.message || 'Failed to fetch automation logs.' });
  }
});

/**
 * POST /api/automation/trigger-daily-post
 * Endpoint for Scheduled Cron Job (GitHub Actions / Cloud Scheduler / n8n)
 */
automationRouter.post('/trigger-daily-post', requireAutomationAuth, async (req: Request, res: Response) => {
  try {
    console.log('[Automation Route] Received scheduled trigger for daily Instagram post');
    const result = await executeDailyInstagramPosting({
      force: false,
      isManualTrigger: false,
    });
    res.status(200).json({ status: 'success', record: result });
  } catch (error: unknown) {
    const err = error as Error;
    console.error('[Automation Route] Scheduled trigger failed:', err);
    res.status(500).json({ error: err?.message || 'Failed to execute scheduled daily post.' });
  }
});

/**
 * POST /api/automation/test-run
 * Manual test run trigger for administrators
 */
automationRouter.post('/test-run', requireAutomationAuth, async (req: Request, res: Response) => {
  try {
    const { targetProductId, force } = req.body || {};
    console.log(`[Automation Route] Admin manual test run triggered${targetProductId ? ` for product ${targetProductId}` : ''}`);

    const result = await executeDailyInstagramPosting({
      force: force !== false, // Default to true for manual test
      isManualTrigger: true,
      targetProductId,
    });

    res.status(200).json({ status: 'success', record: result });
  } catch (error: unknown) {
    const err = error as Error;
    res.status(500).json({ error: err?.message || 'Failed to execute manual test run.' });
  }
});

/**
 * POST /api/automation/retry/:postId
 * Retries a failed or awaiting_credentials post execution record
 */
automationRouter.post('/retry/:postId', requireAutomationAuth, async (req: Request, res: Response) => {
  try {
    const { postId } = req.params;
    if (!postId) {
      return res.status(400).json({ error: 'Missing postId parameter.' });
    }

    const result = await retryInstagramPost(postId);
    res.status(200).json({ status: 'success', record: result });
  } catch (error: unknown) {
    const err = error as Error;
    res.status(500).json({ error: err?.message || 'Failed to retry post.' });
  }
});

/**
 * POST /api/automation/refresh-token
 * Safely refreshes a long-lived Instagram User Access Token (where supported)
 */
automationRouter.post('/refresh-token', requireAutomationAuth, async (req: Request, res: Response) => {
  try {
    const result = await refreshInstagramLongLivedToken();
    if (!result.success) {
      return res.status(400).json({
        status: 'failed',
        error: result.errorMessage || 'Token refresh failed.',
      });
    }

    // Persist refresh metadata in Firestore (without exposing the token)
    await db.collection('automation_state').doc('instagram_automation').set(
      sanitizeForFirestore({
        tokenLastRefreshedAt: new Date().toISOString(),
        ...(result.expiresInDays !== undefined ? { tokenExpiresInDays: result.expiresInDays } : {}),
      }),
      { merge: true }
    );

    res.status(200).json({
      status: 'success',
      message: `Instagram access token successfully renewed. Valid for ~${result.expiresInDays} days.`,
      expiresInDays: result.expiresInDays,
      refreshedAt: new Date().toISOString(),
    });
  } catch (error: unknown) {
    const err = error as Error;
    res.status(500).json({ error: err?.message || 'Unexpected error refreshing Instagram token.' });
  }
});
