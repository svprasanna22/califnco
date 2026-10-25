import dotenv from 'dotenv';
dotenv.config();

export interface BackendConfig {
  port: number;
  nodeEnv: string;
  razorpayKeyId: string;
  razorpayKeySecret: string;
  firebaseProjectId: string;
  firebaseClientEmail?: string;
  firebasePrivateKey?: string;
  corsOrigin: string;
  isTestMode: boolean;
  // AI & Social Media Automation Settings
  geminiApiKey: string;
  groqApiKey: string;
  hfToken: string;
  cloudinaryCloudName: string;
  cloudinaryUploadPreset: string;
  cloudinaryApiKey: string;
  cloudinaryApiSecret: string;
  imgbbApiKey: string;
  instagramAccountId: string;
  instagramAccessToken: string;
  instagramApiBaseUrl: string;
  instagramDryRun: boolean;
  enableInProcessCron: boolean;
  automationCronSecret: string;
  automationTimezone: string;
  automationScheduleCron: string;
  encryptionMasterKey: string;
}

const razorpayKeyId = process.env.RAZORPAY_KEY_ID || '';
const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET || '';

// If key ID starts with rzp_test_, it's test mode
const isTestMode = !razorpayKeyId.startsWith('rzp_live_');

export const config: BackendConfig = {
  port: parseInt(process.env.PORT || '8080', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  razorpayKeyId,
  razorpayKeySecret,
  firebaseProjectId: process.env.FIREBASE_PROJECT_ID || 'califnco-app-f2b7c',
  firebaseClientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  firebasePrivateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  corsOrigin: process.env.CORS_ORIGIN || '*',
  isTestMode,
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  groqApiKey: process.env.GROQ_API_KEY || '',
  hfToken: process.env.HF_TOKEN || '',
  cloudinaryCloudName: process.env.CLOUDINARY_CLOUD_NAME || 'oxeow2gv',
  cloudinaryUploadPreset: process.env.CLOUDINARY_UPLOAD_PRESET || '',
  cloudinaryApiKey: process.env.CLOUDINARY_API_KEY || '',
  cloudinaryApiSecret: process.env.CLOUDINARY_API_SECRET || '',
  imgbbApiKey: process.env.IMGBB_API_KEY || '',
  instagramAccountId: process.env.INSTAGRAM_ACCOUNT_ID || '',
  instagramAccessToken: process.env.INSTAGRAM_ACCESS_TOKEN || '',
  instagramApiBaseUrl: process.env.INSTAGRAM_API_BASE_URL || '',
  instagramDryRun: process.env.INSTAGRAM_DRY_RUN !== 'false', // Defaults to true for zero accidental posting
  enableInProcessCron: process.env.ENABLE_IN_PROCESS_CRON === 'true',
  automationCronSecret: process.env.AUTOMATION_CRON_SECRET || '', // Explicitly requires environment configuration
  automationTimezone: process.env.AUTOMATION_TIMEZONE || 'Asia/Kolkata',
  automationScheduleCron: process.env.AUTOMATION_SCHEDULE_CRON || '0 10 * * *',
  encryptionMasterKey: process.env.ENCRYPTION_MASTER_KEY || '',
};

/**
 * Validates that AUTOMATION_CRON_SECRET is configured and cryptographically strong
 */
export function isCronSecretStrong(secret: string): { valid: boolean; reason?: string } {
  if (!secret || secret.trim().length === 0) {
    return { valid: false, reason: 'AUTOMATION_CRON_SECRET is not configured in the environment.' };
  }
  if (secret.length < 16) {
    return { valid: false, reason: 'AUTOMATION_CRON_SECRET must be at least 16 characters long for secure cloud execution.' };
  }
  const weakDefaults = ['califnco_auto_secret_2026', 'secret1234567890', '1234567890123456', 'password12345678'];
  if (weakDefaults.includes(secret.toLowerCase())) {
    return { valid: false, reason: 'AUTOMATION_CRON_SECRET must not use predictable default or placeholder values.' };
  }
  return { valid: true };
}

/**
 * Validates that ENCRYPTION_MASTER_KEY is configured and of sufficient length for AES-256
 */
export function isEncryptionKeyValid(key: string): { valid: boolean; reason?: string } {
  if (!key || key.trim().length === 0) {
    return { valid: false, reason: 'ENCRYPTION_MASTER_KEY is not configured in the environment.' };
  }
  if (key.length < 32) {
    return { valid: false, reason: 'ENCRYPTION_MASTER_KEY must be at least 32 characters long for AES-256-GCM encryption.' };
  }
  return { valid: true };
}

/**
 * Updates the in-memory access token upon successful background refresh
 * Note: Tokens are kept strictly in server-side memory and never written to Firestore or logs.
 */
export function updateInstagramAccessToken(newToken: string): void {
  config.instagramAccessToken = newToken.trim();
}

export function assertRazorpayConfigured(): void {
  if (!config.razorpayKeyId || !config.razorpayKeySecret) {
    throw new Error(
      'Razorpay credentials missing. Please set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in the environment.'
    );
  }
}
