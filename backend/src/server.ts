import express from 'express';
import cors from 'cors';
import cron from 'node-cron';
import { config } from './config';
import { paymentRouter } from './routes/paymentRoutes';
import { automationRouter } from './routes/automationRoutes';
import { executeDailyInstagramPosting } from './services/instagramAutomation';
import { initializeTokenVaultOnStartup } from './services/tokenVaultService';

export const app = express();

app.use(
  cors({
    origin: config.corsOrigin === '*' ? true : config.corsOrigin,
    credentials: true,
  })
);

app.use(express.json());

// Health Check Endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'califnco-render-backend',
    environment: config.nodeEnv,
    isTestMode: config.isTestMode,
    razorpayConfigured: !!(config.razorpayKeyId && config.razorpayKeySecret),
    instagramAutomationConfigured: !!(config.instagramAccountId && config.instagramAccessToken),
    timestamp: new Date().toISOString(),
  });
});

// Payment and Order Routes
app.use('/api/payments', paymentRouter);

// AI & Social Media Automation Routes
app.use('/api/automation', automationRouter);

// Global Error Handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled server error:', err);
  res.status(500).json({
    error: err?.message || 'Internal server error.',
  });
});

if (process.env.NODE_ENV !== 'test') {
  app.listen(config.port, async () => {
    console.log(`[Califnco Backend] Server running on port ${config.port}`);
    console.log(`[Califnco Backend] Razorpay Mode: ${config.isTestMode ? 'TEST' : 'LIVE'}`);
    console.log(`[Califnco Backend] Firebase Project: ${config.firebaseProjectId}`);

    // Restore or initialize encrypted token vault on boot
    await initializeTokenVaultOnStartup();
  });

  // Autonomous daily schedule:
  // GitHub Actions is the PRIMARY cloud scheduler (wakes Render from sleep reliably).
  // In-process node-cron is disabled by default to prevent dual scheduling and duplicate execution.
  if (config.enableInProcessCron) {
    try {
      cron.schedule(
        config.automationScheduleCron,
        async () => {
          console.log(`[Cron Scheduler] Running scheduled daily Instagram post at ${new Date().toISOString()}`);
          try {
            await executeDailyInstagramPosting({ force: false, isManualTrigger: false });
          } catch (cronErr) {
            console.error('[Cron Scheduler] Daily Instagram run encountered an error:', cronErr);
          }
        },
        {
          timezone: config.automationTimezone,
        }
      );
      console.log(`[Califnco Backend] In-process daily Instagram cron enabled: "${config.automationScheduleCron}" (${config.automationTimezone})`);
    } catch (cronSetupError) {
      console.warn('[Califnco Backend] Could not initialize in-process cron:', cronSetupError);
    }
  } else {
    console.log('[Califnco Backend] In-process node-cron scheduler is DISABLED by default (GitHub Actions cloud cron is primary). Set ENABLE_IN_PROCESS_CRON=true to enable.');
  }
}
