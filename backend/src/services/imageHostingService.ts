import { config } from '../config';

export interface HostedImageResult {
  publicUrl: string;
  provider: 'cloudinary' | 'imgbb' | 'direct-public-url';
  verified: boolean;
}

/**
 * Uploads an image buffer to Cloudinary
 */
async function uploadToCloudinary(imageBuffer: Buffer): Promise<string | null> {
  const cloudName = config.cloudinaryCloudName || 'oxeow2gv';
  if (!cloudName) return null;

  const url = `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`;
  const formData = new FormData();
  formData.append('file', `data:image/jpeg;base64,${imageBuffer.toString('base64')}`);
  formData.append('folder', 'califnco_instagram');

  // Option A: Unsigned Upload Preset (zero secret leakage)
  if (config.cloudinaryUploadPreset) {
    formData.append('upload_preset', config.cloudinaryUploadPreset);
  } else if (config.cloudinaryApiKey && config.cloudinaryApiSecret) {
    // Option B: Signed Upload
    const timestamp = Math.round(new Date().getTime() / 1000);
    const crypto = await import('crypto');
    const signatureString = `folder=califnco_instagram&timestamp=${timestamp}${config.cloudinaryApiSecret}`;
    const signature = crypto.createHash('sha1').update(signatureString).digest('hex');

    formData.append('api_key', config.cloudinaryApiKey);
    formData.append('timestamp', String(timestamp));
    formData.append('signature', signature);
  } else {
    // Neither unsigned preset nor signed keys provided
    return null;
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const err = await response.text();
      console.warn(`[Cloudinary] Upload failed (${response.status}): ${err}`);
      return null;
    }

    const data: any = await response.json();
    return data.secure_url || data.url || null;
  } catch (err) {
    console.warn('[Cloudinary] Upload request error:', err);
    return null;
  }
}

/**
 * Uploads an image buffer to ImgBB
 */
async function uploadToImgBB(imageBuffer: Buffer): Promise<string | null> {
  if (!config.imgbbApiKey) return null;

  const formData = new FormData();
  formData.append('image', imageBuffer.toString('base64'));

  const url = `https://api.imgbb.com/1/upload?key=${config.imgbbApiKey}`;
  const response = await fetch(url, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    console.warn(`[ImgBB] Upload failed with status ${response.status}`);
    return null;
  }

  const data: any = await response.json();
  return data?.data?.url || data?.data?.display_url || null;
}

/**
 * Verifies that a hosted image URL is publicly fetchable via HTTPS without authentication
 */
export async function verifyPublicImageUrl(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, {
      method: 'HEAD',
      headers: {
        'User-Agent': 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
      },
    });

    if (response.ok) {
      const contentType = response.headers.get('content-type') || '';
      return contentType.startsWith('image/') || response.status === 200;
    }

    // Try GET with range 0-0 if HEAD fails
    const getRes = await fetch(url, {
      method: 'GET',
      headers: { Range: 'bytes=0-10' },
    });
    return getRes.ok || getRes.status === 206;
  } catch (err) {
    console.warn(`[Image Verify] Failed to verify ${url}:`, err);
    return false;
  }
}

/**
 * Public facade: Hosts the promotional image on a verified public HTTPS URL
 */
export async function hostPromotionalImage(
  imageBuffer: Buffer,
  directPublicUrl?: string
): Promise<HostedImageResult> {
  // 1. Try Cloudinary
  try {
    const cUrl = await uploadToCloudinary(imageBuffer);
    if (cUrl && (await verifyPublicImageUrl(cUrl))) {
      return {
        publicUrl: cUrl,
        provider: 'cloudinary',
        verified: true,
      };
    }
  } catch (err) {
    console.warn('[Hosting Service] Cloudinary error:', err);
  }

  // 2. Try ImgBB
  try {
    const iUrl = await uploadToImgBB(imageBuffer);
    if (iUrl && (await verifyPublicImageUrl(iUrl))) {
      return {
        publicUrl: iUrl,
        provider: 'imgbb',
        verified: true,
      };
    }
  } catch (err) {
    console.warn('[Hosting Service] ImgBB error:', err);
  }

  // 3. If direct public URL was provided (e.g. Pollinations public CDN), verify and return
  if (directPublicUrl && (await verifyPublicImageUrl(directPublicUrl))) {
    return {
      publicUrl: directPublicUrl,
      provider: 'direct-public-url',
      verified: true,
    };
  }

  throw new Error('Failed to obtain a verified, publicly accessible HTTPS image URL for Instagram.');
}
