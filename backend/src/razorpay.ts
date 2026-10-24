import Razorpay from 'razorpay';
import crypto from 'crypto';
import { config, assertRazorpayConfigured } from './config';

let razorpayClient: Razorpay | null = null;

export function getRazorpayClient(): Razorpay {
  if (!razorpayClient) {
    assertRazorpayConfigured();
    razorpayClient = new Razorpay({
      key_id: config.razorpayKeyId,
      key_secret: config.razorpayKeySecret,
    });
  }
  return razorpayClient;
}

/**
 * Cryptographically verifies Razorpay payment signature using HMAC SHA256
 * Signature algorithm: HMAC-SHA256(order_id + "|" + payment_id, secret)
 */
export function verifyRazorpaySignature(
  orderId: string,
  paymentId: string,
  signature: string,
  secret: string = config.razorpayKeySecret
): boolean {
  if (!orderId || !paymentId || !signature || !secret) {
    return false;
  }

  try {
    const generatedSignature = crypto
      .createHmac('sha256', secret)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');

    // Constant-time comparison to prevent timing attacks
    const bufferGenerated = Buffer.from(generatedSignature, 'utf8');
    const bufferReceived = Buffer.from(signature, 'utf8');

    if (bufferGenerated.length !== bufferReceived.length) {
      return false;
    }

    return crypto.timingSafeEqual(bufferGenerated, bufferReceived);
  } catch (error) {
    console.error('Error during signature verification:', error);
    return false;
  }
}
