import express from 'express';
import cors from 'cors';
import { config } from './config';
import { paymentRouter } from './routes/paymentRoutes';

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
    timestamp: new Date().toISOString(),
  });
});

// Payment and Order Routes
app.use('/api/payments', paymentRouter);

// Global Error Handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled server error:', err);
  res.status(500).json({
    error: err?.message || 'Internal server error.',
  });
});

if (process.env.NODE_ENV !== 'test') {
  app.listen(config.port, () => {
    console.log(`[Califnco Backend] Server running on port ${config.port}`);
    console.log(`[Califnco Backend] Razorpay Mode: ${config.isTestMode ? 'TEST' : 'LIVE'}`);
    console.log(`[Califnco Backend] Firebase Project: ${config.firebaseProjectId}`);
  });
}
