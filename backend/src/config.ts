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
}

const razorpayKeyId = process.env.RAZORPAY_KEY_ID || '';
const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET || '';

// If key ID starts with rzp_test_, it's test mode
const isTestMode = razorpayKeyId.startsWith('rzp_test_') || process.env.NODE_ENV !== 'production';

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
};

export function assertRazorpayConfigured(): void {
  if (!config.razorpayKeyId || !config.razorpayKeySecret) {
    throw new Error(
      'Razorpay credentials missing. Please set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in the environment.'
    );
  }
}
