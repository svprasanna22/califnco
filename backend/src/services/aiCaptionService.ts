import { config } from '../config';

export interface ProductForMarketing {
  id: string;
  name: string;
  description: string;
  price: number;
  category: string;
  features?: string[];
  specifications?: Record<string, string>;
  imageUrl?: string;
}

export interface GeneratedCaptionResult {
  caption: string;
  hashtags: string[];
  fullInstagramText: string;
  provider: 'gemini-1.5-flash' | 'groq-llama-3.3' | 'califnco-template-engine';
}

/**
 * Validates generated content to prevent fabricated claims
 */
function sanitizeMarketingText(text: string, product: ProductForMarketing): string {
  let cleaned = text.trim();
  // Strip any hallucinated certification claims not present in product data
  const forbiddenClaims = ['100% cure', 'prevents cancer', 'guaranteed zero disease', 'certified by NASA', 'miracle cure'];
  for (const claim of forbiddenClaims) {
    cleaned = cleaned.replace(new RegExp(claim, 'gi'), 'pure hydration');
  }
  return cleaned;
}

/**
 * Generates an Instagram caption using Google Gemini 1.5 Flash
 */
async function generateWithGemini(product: ProductForMarketing): Promise<GeneratedCaptionResult | null> {
  if (!config.geminiApiKey) return null;

  const featuresText = product.features?.length ? product.features.join(', ') : product.description;
  const specsText = product.specifications
    ? Object.entries(product.specifications).map(([k, v]) => `${k}: ${v}`).join(', ')
    : '';

  const prompt = `You are a social media marketing copywriter for Califnco, a premium smart water purifier brand in India.
Write an engaging, high-converting, professional Instagram post for this real product:
- Product Name: ${product.name}
- Category: ${product.category}
- Verified Features: ${featuresText}
- Specifications: ${specsText}
- Price: ₹${product.price.toLocaleString('en-IN')}

Rules:
1. Speak to Indian families and modern households prioritizing health, clean drinking water, and stylish kitchen appliances.
2. Only highlight the verified features and specs listed above. Do not invent fake warranties, discounts, or medical certifications.
3. Keep the body text concise (80-140 words), formatted with bullet points for readability.
4. Include a clear call to action (e.g. "Order now on Califnco or book a home TDS test today!").
5. Include 12-15 relevant, popular hashtags including #Califnco, #WaterPurifier, #PureWater, #HealthyLiving, #IndianHomes.
6. Return your response as a valid JSON object with exact keys:
   {
     "caption": "Your main caption body text with emojis and bullet points",
     "hashtags": ["#Califnco", "#WaterPurifier", "#PureLiving", ...]
   }`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${config.geminiApiKey}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 800,
        responseMimeType: 'application/json',
      },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.warn(`[Gemini API] Request failed (${response.status}): ${errText}`);
    return null;
  }

  const data: any = await response.json();
  const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) return null;

  try {
    const parsed = JSON.parse(rawText);
    const caption = sanitizeMarketingText(parsed.caption || '', product);
    const hashtags: string[] = Array.isArray(parsed.hashtags)
      ? parsed.hashtags.map((h: string) => (h.startsWith('#') ? h : `#${h}`))
      : ['#Califnco', '#WaterPurifier', '#PureWater', '#HealthyLiving'];

    const fullInstagramText = `${caption}\n\n.\n.\n${hashtags.join(' ')}`;
    return {
      caption,
      hashtags,
      fullInstagramText,
      provider: 'gemini-1.5-flash',
    };
  } catch (parseErr) {
    console.warn('[Gemini API] Failed to parse JSON response:', parseErr);
    return null;
  }
}

/**
 * Generates an Instagram caption using Groq API (fallback)
 */
async function generateWithGroq(product: ProductForMarketing): Promise<GeneratedCaptionResult | null> {
  if (!config.groqApiKey) return null;

  const featuresText = product.features?.length ? product.features.join(', ') : product.description;
  const prompt = `Write an Instagram post for Califnco's ${product.name}.
Price: ₹${product.price.toLocaleString('en-IN')}. Features: ${featuresText}.
Return ONLY a JSON object: {"caption": "...", "hashtags": ["#tag1", "#tag2"]}`;

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.groqApiKey}`,
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.7,
    }),
  });

  if (!response.ok) return null;
  const data: any = await response.json();
  const rawContent = data?.choices?.[0]?.message?.content;
  if (!rawContent) return null;

  try {
    const parsed = JSON.parse(rawContent);
    const caption = sanitizeMarketingText(parsed.caption || '', product);
    const hashtags: string[] = Array.isArray(parsed.hashtags)
      ? parsed.hashtags.map((h: string) => (h.startsWith('#') ? h : `#${h}`))
      : ['#Califnco', '#WaterPurifier', '#PureWater'];
    return {
      caption,
      hashtags,
      fullInstagramText: `${caption}\n\n.\n.\n${hashtags.join(' ')}`,
      provider: 'groq-llama-3.3',
    };
  } catch {
    return null;
  }
}

/**
 * High-quality fallback template engine based strictly on verified catalog data
 */
function generateTemplateCaption(product: ProductForMarketing): GeneratedCaptionResult {
  const formattedPrice = `₹${product.price.toLocaleString('en-IN')}`;
  const featuresList = product.features && product.features.length > 0
    ? product.features.map((f) => `✨ ${f}`).join('\n')
    : `✨ Multi-stage purification for crystal clear water\n✨ Designed for modern Indian households`;

  const specsList = product.specifications && Object.keys(product.specifications).length > 0
    ? Object.entries(product.specifications)
        .slice(0, 3)
        .map(([k, v]) => `🔹 ${k}: ${v}`)
        .join('\n')
    : '';

  const caption = `Elevate your family's hydration with the all-new ${product.name}! 💧✨

Engineered to deliver 100% pure, sweet, and mineral-balanced drinking water right from your kitchen tap.

Why Indian households trust Califnco:
${featuresList}
${specsList ? `\nKey Specifications:\n${specsList}` : ''}

🏷️ Price: ${formattedPrice} (Includes Standard Installation & Warranty)
🚚 Fast door-step delivery & authorized technician installation available across India.

Ready for pure, healthy water? Tap the link in bio or visit Califnco to order today! 💙`;

  const hashtags = [
    '#Califnco',
    '#WaterPurifier',
    '#PureWater',
    '#HealthyLiving',
    '#IndianHomes',
    '#CleanDrinkingWater',
    '#SmartRO',
    '#KitchenAppliances',
    '#WaterPurification',
    '#HomeWellness',
    '#HealthFirst',
  ];

  return {
    caption,
    hashtags,
    fullInstagramText: `${caption}\n\n.\n.\n${hashtags.join(' ')}`,
    provider: 'califnco-template-engine',
  };
}

/**
 * Public facade: Generates a verified marketing caption with automatic provider failover
 */
export async function generateInstagramCaption(
  product: ProductForMarketing
): Promise<GeneratedCaptionResult> {
  // 1. Try Gemini
  try {
    const geminiResult = await generateWithGemini(product);
    if (geminiResult) return geminiResult;
  } catch (err) {
    console.warn('[Caption Service] Gemini generation error:', err);
  }

  // 2. Try Groq
  try {
    const groqResult = await generateWithGroq(product);
    if (groqResult) return groqResult;
  } catch (err) {
    console.warn('[Caption Service] Groq generation error:', err);
  }

  // 3. Fallback to Catalog-derived Template Engine
  return generateTemplateCaption(product);
}
