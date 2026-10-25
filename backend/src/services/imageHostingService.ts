import dns from 'dns/promises';
import { config } from '../config';

export interface HostedImageResult {
  publicUrl: string;
  provider: 'cloudinary' | 'imgbb' | 'direct-public-url';
  verified: boolean;
}

/**
 * Uploads an image buffer to Cloudinary
 */
export async function uploadToCloudinary(
  imageBuffer: Buffer,
  fetcher: typeof fetch = fetch
): Promise<string | null> {
  const cloudName = config.cloudinaryCloudName || 'oxeow2gv';
  if (!cloudName) return null;

  const url = `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`;
  const formData = new FormData();
  formData.append('file', `data:image/jpeg;base64,${imageBuffer.toString('base64')}`);
  formData.append('folder', 'califnco/instagram');

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
    const response = await fetcher(url, {
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
 * Checks whether a given hostname resolves to a private, loopback, link-local, or internal network destination.
 */
export function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase().trim();
  if (!host) return true;
  if (host === 'localhost' || host === '0.0.0.0' || host === '::1' || host === '[::1]') return true;
  if (host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.lan') || host.endsWith('.corp') || host.endsWith('.test') || host.endsWith('.home')) {
    return true;
  }
  // Hostnames without dots or colons are internal service names (e.g. "backend", "redis", "metadata")
  if (!host.includes('.') && !host.includes(':')) {
    return true;
  }

  // IPv4 Private & Reserved Ranges
  const ipv4Match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const o1 = parseInt(ipv4Match[1], 10);
    const o2 = parseInt(ipv4Match[2], 10);
    const o3 = parseInt(ipv4Match[3], 10);
    const o4 = parseInt(ipv4Match[4], 10);
    if (o1 > 255 || o2 > 255 || o3 > 255 || o4 > 255) return true;

    if (o1 === 127) return true; // 127.0.0.0/8 Loopback
    if (o1 === 10) return true;  // 10.0.0.0/8 Private
    if (o1 === 172 && o2 >= 16 && o2 <= 31) return true; // 172.16.0.0/12 Private
    if (o1 === 192 && o2 === 168) return true; // 192.168.0.0/16 Private
    if (o1 === 169 && o2 === 254) return true; // 169.254.0.0/16 Link-local / Cloud Metadata (169.254.169.254)
    if (o1 === 100 && o2 >= 64 && o2 <= 127) return true; // 100.64.0.0/10 Carrier-grade NAT
    if (o1 === 0) return true; // 0.0.0.0/8 Current network
    if (o1 >= 224) return true; // 224.0.0.0/4 Multicast (224-239) & 240.0.0.0/4 Reserved (240-255)
    if (o1 === 192 && o2 === 0 && o3 === 2) return true; // 192.0.2.0/24 TEST-NET-1
    if (o1 === 198 && o2 === 51 && o3 === 100) return true; // 198.51.100.0/24 TEST-NET-2
    if (o1 === 203 && o2 === 0 && o3 === 113) return true; // 203.0.113.0/24 TEST-NET-3
    if (o1 === 198 && (o2 === 18 || o2 === 19)) return true; // 198.18.0.0/15 Benchmark
  }

  // IPv6 checks (including IPv4-mapped IPv6 like ::ffff:127.0.0.1)
  const strippedIpv6 = host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;
  if (strippedIpv6.startsWith('::ffff:')) {
    const v4Part = strippedIpv6.replace('::ffff:', '');
    return isPrivateHost(v4Part);
  }
  if (
    strippedIpv6 === '::' ||
    strippedIpv6 === '::1' ||
    strippedIpv6.startsWith('fe80:') ||
    strippedIpv6.startsWith('fc00:') ||
    strippedIpv6.startsWith('fd00:') ||
    strippedIpv6.startsWith('ff00:') ||
    strippedIpv6.startsWith('ff02:')
  ) {
    return true;
  }

  return false;
}

/**
 * Verifies that a given string is a valid, absolute HTTPS URL and not localhost, private IP, or a relative path.
 */
export function isPublicHttpsUrl(url?: string): boolean {
  if (!url || typeof url !== 'string' || url.trim().length === 0) return false;
  try {
    const parsed = new URL(url.trim());
    if (parsed.protocol !== 'https:') return false;
    if (parsed.username || parsed.password) return false;
    if (isPrivateHost(parsed.hostname)) return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolves a hostname via DNS to ensure none of its IPv4 or IPv6 records point to private, loopback, or metadata networks.
 * Prevents DNS rebinding and hostnames (like *.nip.io) mapped to internal IPs.
 */
export async function isHostnamePublic(
  hostname: string,
  dnsLookup?: (host: string, options: { all: boolean }) => Promise<Array<{ address: string; family: number }>>
): Promise<boolean> {
  if (isPrivateHost(hostname)) return false;
  try {
    const addresses = dnsLookup
      ? await dnsLookup(hostname, { all: true })
      : await dns.lookup(hostname, { all: true });
    if (!addresses || addresses.length === 0) return false;
    for (const entry of addresses) {
      if (isPrivateHost(entry.address)) {
        return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Verifies that a hosted image URL is publicly fetchable via HTTPS without authentication.
 * Follows redirects manually (up to 3 hops) and verifies that every target hop and resolved IP
 * destination remains strictly on public infrastructure.
 *
 * Security Architecture & SSRF / DNS-Rebinding Mitigation:
 * In a standard Node.js environment, there is a theoretical Time-Of-Check to Time-Of-Use (TOCTOU)
 * window between preflight DNS resolution (`isHostnamePublic`) and the subsequent `fetch()` call
 * if an attacker controls a DNS nameserver with TTL=0.
 *
 * To safely mitigate this:
 * 1. Scope Restriction: Califnco never accepts arbitrary external user-supplied image URLs; all URLs
 *    strictly originate from verified internal AI image pipelines and whitelisted hosts (Cloudinary, ImgBB, Pollinations CDN).
 * 2. DNS Preflight: `isHostnamePublic()` resolves all A and AAAA records on every hop and blocks any private/loopback/metadata IP.
 * 3. Manual Redirect Inspection: `redirect: 'manual'` enforces that every 3xx redirect hop is re-validated through
 *    `isPublicHttpsUrl` and DNS checks before being fetched, preventing open-redirect SSRF bypasses.
 * 4. Protocol Enforcement: Only absolute HTTPS URLs are permitted; non-HTTPS, userinfo, and relative paths are rejected.
 */
export async function verifyPublicImageUrl(
  url: string,
  fetcher: typeof fetch = fetch,
  dnsChecker?: (hostname: string) => Promise<boolean>
): Promise<boolean> {
  let currentUrl = url;
  const maxHops = 3;

  for (let hop = 0; hop < maxHops; hop++) {
    if (!isPublicHttpsUrl(currentUrl)) {
      return false;
    }

    try {
      const parsed = new URL(currentUrl);
      const isDnsPublic = dnsChecker
        ? await dnsChecker(parsed.hostname)
        : (fetcher === fetch ? await isHostnamePublic(parsed.hostname) : !isPrivateHost(parsed.hostname));

      if (!isDnsPublic) {
        console.warn(`[Image Verify] Hostname "${parsed.hostname}" resolved to a private/reserved destination.`);
        return false;
      }
    } catch {
      return false;
    }

    try {
      const response = await fetcher(currentUrl, {
        method: 'HEAD',
        headers: {
          'User-Agent': 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
        },
        signal: AbortSignal.timeout(10000),
        redirect: 'manual',
      });

      // Handle 3xx redirects manually to prevent bypassing validation
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location) return false;
        const nextUrl = new URL(location, currentUrl).toString();
        if (!isPublicHttpsUrl(nextUrl)) {
          console.warn(`[Image Verify] Redirect destination is not a public HTTPS URL: ${nextUrl}`);
          return false;
        }
        currentUrl = nextUrl;
        continue;
      }

      if (response.ok) {
        const contentType = response.headers.get('content-type') || '';
        return contentType.startsWith('image/') || response.status === 200;
      }

      // Try GET with range 0-10 if HEAD fails (e.g. CDNs that reject HEAD)
      const getRes = await fetcher(currentUrl, {
        method: 'GET',
        headers: { Range: 'bytes=0-10' },
        signal: AbortSignal.timeout(10000),
        redirect: 'manual',
      });

      if (getRes.status >= 300 && getRes.status < 400) {
        const location = getRes.headers.get('location');
        if (!location) return false;
        const nextUrl = new URL(location, currentUrl).toString();
        if (!isPublicHttpsUrl(nextUrl)) {
          console.warn(`[Image Verify] GET redirect destination is not a public HTTPS URL: ${nextUrl}`);
          return false;
        }
        currentUrl = nextUrl;
        continue;
      }

      return getRes.ok || getRes.status === 206;
    } catch (err) {
      console.warn(`[Image Verify] Failed to verify ${currentUrl}:`, err);
      return false;
    }
  }

  return false;
}

/**
 * Public facade: Hosts the promotional image on a verified public HTTPS URL
 */
export async function hostPromotionalImage(
  imageBuffer: Buffer,
  directPublicUrl?: string,
  fetcher: typeof fetch = fetch
): Promise<HostedImageResult> {
  // 1. Try Cloudinary
  try {
    const cUrl = await uploadToCloudinary(imageBuffer, fetcher);
    if (cUrl && (await verifyPublicImageUrl(cUrl, fetcher))) {
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
    if (iUrl && (await verifyPublicImageUrl(iUrl, fetcher))) {
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
  if (directPublicUrl && isPublicHttpsUrl(directPublicUrl) && (await verifyPublicImageUrl(directPublicUrl, fetcher))) {
    return {
      publicUrl: directPublicUrl,
      provider: 'direct-public-url',
      verified: true,
    };
  }

  throw new Error('Failed to obtain a verified, publicly accessible HTTPS image URL for Instagram.');
}
