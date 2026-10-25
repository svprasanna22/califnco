import { config } from '../config';
import type { ProductForMarketing } from './aiCaptionService';

export interface GeneratedImageResult {
  imageBuffer: Buffer;
  mimeType: string;
  provider: 'huggingface-flux' | 'pollinations-flux';
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
 * Generates an image using Hugging Face Inference API
 */
async function generateWithHuggingFace(prompt: string): Promise<Buffer | null> {
  if (!config.hfToken) return null;

  const model = 'black-forest-labs/FLUX.1-schnell';
  const url = `https://api-inference.huggingface.co/models/${model}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.hfToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      inputs: prompt,
      parameters: { width: 1080, height: 1080 },
    }),
  });

  if (!response.ok) {
    console.warn(`[HuggingFace API] Generation failed with status ${response.status}`);
    return null;
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  if (buffer.length < 1000) return null;
  return buffer;
}

/**
 * Generates an image using Pollinations.ai (Zero-Cost High Quality Fallback)
 */
async function generateWithPollinations(prompt: string): Promise<{ buffer: Buffer; url: string } | null> {
  const encodedPrompt = encodeURIComponent(prompt);
  // Seed randomizes slightly to ensure a fresh creative visual
  const seed = Math.floor(Math.random() * 100000);
  const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1080&height=1080&nologo=true&model=flux&seed=${seed}`;

  try {
    const response = await fetch(imageUrl, {
      method: 'GET',
      headers: {
        Accept: 'image/jpeg,image/png,image/*',
      },
    });

    if (!response.ok) {
      console.warn(`[Pollinations AI] Request failed with status ${response.status}`);
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    if (buffer.length < 1000) return null;

    return { buffer, url: imageUrl };
  } catch (err) {
    console.warn('[Pollinations AI] Fetch error:', err);
    return null;
  }
}

/**
 * Public facade: Generates a promotional Instagram image with automatic provider failover
 */
export async function generatePromotionalImage(
  product: ProductForMarketing
): Promise<GeneratedImageResult> {
  const prompt = buildPromotionalImagePrompt(product);

  // 1. Try Hugging Face if token configured
  try {
    const hfBuffer = await generateWithHuggingFace(prompt);
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

  // 2. Pollinations.ai (Zero-cost, instant, reliable 1080x1080 FLUX output)
  const polResult = await generateWithPollinations(prompt);
  if (polResult) {
    return {
      imageBuffer: polResult.buffer,
      mimeType: 'image/jpeg',
      provider: 'pollinations-flux',
      prompt,
      directPublicUrl: polResult.url,
    };
  }

  throw new Error('Failed to generate promotional image from all available providers.');
}
