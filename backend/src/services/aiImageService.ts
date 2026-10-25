import { config } from '../config';
import type { ProductForMarketing } from './aiCaptionService';

export interface GeneratedImageResult {
  imageBuffer: Buffer;
  mimeType: string;
  provider: 'huggingface-flux' | 'pollinations-flux' | 'pollinations-turbo';
  prompt: string;
  directPublicUrl?: string;
}

/**
 * Builds a prompt for generating a promotional Instagram visual for a water purifier
 */
export function buildPromotionalImagePrompt(product: ProductForMarketing): string {
  const isPurifier = product.category.includes('purifier') || product.name.toLowerCase().includes('ro') || product.name.toLowerCase().includes('purifier');

  if (isPurifier) {
    return `commercial product photograph of ${product.name}, a sleek modern water purifier appliance with digital display on a luxury kitchen marble countertop, warm soft morning sunlight, a clear glass of fresh water with water droplets next to it, minimalist high-end interior, photorealistic 8k, architectural digest style, pristine clean lighting, no text, no watermark`;
  }

  return `commercial product photograph of ${product.name}, genuine water purification filter cartridge, clean pristine studio lighting on modern slate surface, water splash effect, crystal clear reflections, 8k resolution, product advertising photography, no text, no watermark`;
}

/**
 * Validates that an image buffer contains genuine image binary data (JPEG, PNG, or WebP)
 * and meets the minimum size threshold.
 */
export function isValidImageBuffer(buffer: Buffer): boolean {
  if (!buffer || buffer.length < 1000) return false;

  // JPEG: FF D8 FF
  const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  // PNG: 89 50 4E 47
  const isPng = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
  // WebP: RIFF....WEBP
  const isWebp =
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP';

  return isJpeg || isPng || isWebp;
}

/**
 * Calculates exponential backoff with jitter
 */
export function calculateBackoffMs(attempt: number, baseMs: number = 1000, maxMs: number = 5000): number {
  const exp = Math.min(baseMs * Math.pow(2, attempt - 1), maxMs);
  const jitter = Math.floor(Math.random() * (exp * 0.2));
  return Math.min(exp + jitter, maxMs);
}

/**
 * Generates an image using Hugging Face Inference API with bounded retry and timeout
 */
export async function generateWithHuggingFace(
  prompt: string,
  fetcher: typeof fetch = fetch
): Promise<Buffer | null> {
  if (!config.hfToken) return null;

  const model = 'black-forest-labs/FLUX.1-schnell';
  const url = `https://api-inference.huggingface.co/models/${model}`;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetcher(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.hfToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          inputs: prompt,
          parameters: { width: 1080, height: 1080 },
        }),
        signal: AbortSignal.timeout(25000),
      });

      if (!response.ok) {
        console.warn(`[HuggingFace API] Generation failed with status ${response.status} (attempt ${attempt}/3)`);
        if ((response.status === 429 || response.status >= 500) && attempt < 3) {
          const delay = calculateBackoffMs(attempt);
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }
        return null;
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      if (!isValidImageBuffer(buffer)) {
        console.warn('[HuggingFace API] Response payload is not a valid image.');
        return null;
      }
      return buffer;
    } catch (err: unknown) {
      console.warn(`[HuggingFace API] Error during attempt ${attempt}/3:`, (err as Error)?.message || err);
      if (attempt < 3) {
        const delay = calculateBackoffMs(attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  return null;
}

/**
 * Generates an image using Pollinations.ai with FLUX primary, turbo fallback,
 * bounded exponential backoff with jitter, and response validation.
 */
export async function generateWithPollinations(
  prompt: string,
  fetcher: typeof fetch = fetch
): Promise<{ buffer: Buffer; url: string; model: 'flux' | 'turbo' } | null> {
  const encodedPrompt = encodeURIComponent(prompt);
  const models: Array<'flux' | 'turbo'> = ['flux', 'turbo'];

  for (const model of models) {
    const maxAttempts = 2;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const seed = Math.floor(Math.random() * 100000);
      const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1080&height=1080&nologo=true&model=${model}&seed=${seed}`;

      try {
        const response = await fetcher(imageUrl, {
          method: 'GET',
          headers: {
            Accept: 'image/jpeg,image/png,image/*',
          },
          signal: AbortSignal.timeout(25000),
        });

        if (!response.ok) {
          console.warn(`[Pollinations AI] Request for model=${model} failed with status ${response.status} (attempt ${attempt}/${maxAttempts})`);
          if ((response.status === 429 || response.status >= 500) && attempt < maxAttempts) {
            const delay = calculateBackoffMs(attempt);
            await new Promise((resolve) => setTimeout(resolve, delay));
            continue;
          }
          // Exhausted or permanent error for this model; break to fallback model
          break;
        }

        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('application/json') || contentType.includes('text/html')) {
          console.warn(`[Pollinations AI] Non-image content type returned: ${contentType}`);
          break;
        }

        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        if (!isValidImageBuffer(buffer)) {
          console.warn(`[Pollinations AI] Response buffer from model=${model} was invalid or corrupted.`);
          break;
        }

        return { buffer, url: imageUrl, model };
      } catch (err: unknown) {
        console.warn(`[Pollinations AI] Fetch error for model=${model} (attempt ${attempt}/${maxAttempts}):`, (err as Error)?.message || err);
        if (attempt < maxAttempts) {
          const delay = calculateBackoffMs(attempt);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }
  }

  return null;
}

/**
 * Public facade: Generates a promotional Instagram image with automatic provider failover
 */
export async function generatePromotionalImage(
  product: ProductForMarketing,
  fetcher: typeof fetch = fetch
): Promise<GeneratedImageResult> {
  const prompt = buildPromotionalImagePrompt(product);

  // 1. Try Hugging Face if token configured
  try {
    const hfBuffer = await generateWithHuggingFace(prompt, fetcher);
    if (hfBuffer) {
      return {
        imageBuffer: hfBuffer,
        mimeType: 'image/jpeg',
        provider: 'huggingface-flux',
        prompt,
      };
    }
  } catch (err) {
    console.warn('[Image Service] Hugging Face generation error:', err);
  }

  // 2. Pollinations.ai (Zero-cost with automatic FLUX -> Turbo model failover)
  const polResult = await generateWithPollinations(prompt, fetcher);
  if (polResult) {
    return {
      imageBuffer: polResult.buffer,
      mimeType: 'image/jpeg',
      provider: polResult.model === 'flux' ? 'pollinations-flux' : 'pollinations-turbo',
      prompt,
      directPublicUrl: polResult.url,
    };
  }

  throw new Error('Failed to generate promotional image from all available providers.');
}
