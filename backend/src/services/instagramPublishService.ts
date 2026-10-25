import { config } from '../config';

export interface InstagramPublishResult {
  status: 'published' | 'awaiting_credentials' | 'failed';
  mediaId?: string;
  permalink?: string;
  containerId?: string;
  errorMessage?: string;
  publishedAt?: string;
  isMockOrDryRun?: boolean;
}

export interface TokenRefreshResult {
  success: boolean;
  refreshedToken?: string;
  expiresInDays?: number;
  errorMessage?: string;
}

/**
 * Determines whether to use Instagram Login API (graph.instagram.com)
 * or Facebook Graph API (graph.facebook.com)
 */
export function getInstagramApiBaseUrl(token: string): string {
  if (config.instagramApiBaseUrl) {
    return config.instagramApiBaseUrl.replace(/\/+$/, '');
  }

  // Tokens starting with 'IG' (e.g., IGQ..., IGA...) originate from Instagram Login
  if (token.startsWith('IG') || token.startsWith('ig')) {
    return 'https://graph.instagram.com/v21.0';
  }

  // Tokens starting with 'EAA' originate from Meta/Facebook Login
  if (token.startsWith('EAA') || token.startsWith('eaa')) {
    return 'https://graph.facebook.com/v21.0';
  }

  // Default to Instagram Login API for @califnco.water compatibility
  return 'https://graph.instagram.com/v21.0';
}

export interface InstagramTokenVerificationResult {
  valid: boolean;
  accountId?: string;
  username?: string;
  error?: string;
}

/**
 * Performs a read-only request to confirm Instagram currently accepts the access token.
 * The token is never included in logs or returned in the result.
 * An optional fetch implementation is provided for deterministic unit tests.
 */
export async function verifyInstagramAccessToken(
  accessToken: string,
  fetcher: typeof fetch = fetch
): Promise<InstagramTokenVerificationResult> {
  const token = accessToken.trim();
  if (!token) {
    return { valid: false, error: 'Instagram access token is not configured.' };
  }

  const baseUrl = getInstagramApiBaseUrl(token);
  const isInstagramLogin = baseUrl.includes('graph.instagram.com');
  const verificationUrl = new URL(`${baseUrl}/me`);
  verificationUrl.searchParams.set('fields', isInstagramLogin ? 'user_id,username' : 'id,name');
  verificationUrl.searchParams.set('access_token', token);

  try {
    const response = await fetcher(verificationUrl.toString(), { method: 'GET' });
    const data: any = await response.json().catch(() => ({}));
    const accountId = data?.user_id ?? data?.id;

    if (!response.ok || !accountId) {
      const apiMessage = typeof data?.error?.message === 'string' ? data.error.message : '';
      return {
        valid: false,
        error: apiMessage
          ? `Instagram rejected the access token: ${apiMessage}`
          : `Instagram token verification failed (HTTP ${response.status}).`,
      };
    }

    return {
      valid: true,
      accountId: String(accountId),
      ...(typeof data?.username === 'string' ? { username: data.username } : {}),
    };
  } catch {
    return { valid: false, error: 'Could not reach Instagram to verify the access token.' };
  }
}

/**
 * Safely resolves the numeric Instagram Account ID if given 'me' or a username like '@califnco.water'
 */
async function resolveInstagramAccountId(
  rawAccountId: string,
  accessToken: string,
  baseUrl: string
): Promise<string> {
  let cleaned = rawAccountId.trim();
  if (cleaned.startsWith('@')) {
    cleaned = cleaned.substring(1);
  }

  // If already a numeric Meta ID, return it
  if (/^\d+$/.test(cleaned)) {
    return cleaned;
  }

  // Attempt to resolve /me from the API
  try {
    const meUrl = `${baseUrl}/me?fields=id,username&access_token=${accessToken}`;
    const res = await fetch(meUrl);
    if (res.ok) {
      const data: any = await res.json();
      if (data?.id) {
        return data.id;
      }
    }
  } catch (err) {
    console.warn('[Instagram API] Could not auto-resolve /me account ID:', err);
  }

  // If on graph.instagram.com, 'me' can be used directly as the path parameter
  if (baseUrl.includes('graph.instagram.com')) {
    return 'me';
  }

  return cleaned;
}

/**
 * Refreshes an Instagram Long-Lived User Access Token before its 60-day expiry
 * (Supported on graph.instagram.com for Instagram Login tokens)
 */
export async function refreshInstagramLongLivedToken(
  currentToken?: string
): Promise<TokenRefreshResult> {
  const token = (currentToken || config.instagramAccessToken)?.trim();
  if (!token) {
    return { success: false, errorMessage: 'No access token available to refresh.' };
  }

  try {
    const refreshUrl = new URL('https://graph.instagram.com/refresh_access_token');
    refreshUrl.searchParams.set('grant_type', 'ig_refresh_token');
    refreshUrl.searchParams.set('access_token', token);

    const res = await fetch(refreshUrl.toString(), { method: 'GET' });
    const data: any = await res.json();

    if (!res.ok || !data?.access_token) {
      const msg = data?.error?.message || `Token refresh failed with HTTP ${res.status}`;
      return { success: false, errorMessage: msg };
    }

    const expiresInDays = Math.round((data.expires_in || 5184000) / 86400);
    return {
      success: true,
      refreshedToken: data.access_token,
      expiresInDays,
    };
  } catch (err: unknown) {
    return {
      success: false,
      errorMessage: (err as Error)?.message || 'Network failure while refreshing Instagram token.',
    };
  }
}

/**
 * Publishes an image and caption to Instagram using Instagram Graph API v21.0
 */
export async function publishToInstagramGraphApi(
  imageUrl: string,
  caption: string,
  options: { isDryRun?: boolean } = {}
): Promise<InstagramPublishResult> {
  const rawAccountId = config.instagramAccountId?.trim();
  const accessToken = config.instagramAccessToken?.trim();

  // Guard 1: Universal Dry-Run Safety Guard
  // Guarantees zero real Instagram posts across scheduled runs, manual tests, retries, and direct API calls
  const isDryRunActive = Boolean(
    options.isDryRun || config.instagramDryRun || process.env.INSTAGRAM_DRY_RUN === 'true'
  );
  if (isDryRunActive) {
    return {
      status: 'awaiting_credentials',
      isMockOrDryRun: true,
      mediaId: `mock_media_${Date.now()}`,
      permalink: 'https://www.instagram.com/califnco.water/p/mock/',
      errorMessage: 'DRY RUN: Post generation succeeded without calling live Instagram publication endpoint.',
      publishedAt: new Date().toISOString(),
    };
  }

  // Guard 2: Check if credentials configured
  if (!accessToken) {
    return {
      status: 'awaiting_credentials',
      isMockOrDryRun: true,
      errorMessage:
        'Instagram Graph API credentials are not yet configured in the environment. Generated AI visual and caption saved to Firestore.',
    };
  }

  const BASE_URL = getInstagramApiBaseUrl(accessToken);
  const accountId = await resolveInstagramAccountId(rawAccountId || 'me', accessToken, BASE_URL);

  try {
    // ----------------------------------------------------
    // STEP 1: Create Media Container
    // POST /{ig-user-id}/media or /me/media
    // ----------------------------------------------------
    const containerUrl = new URL(`${BASE_URL}/${accountId}/media`);
    containerUrl.searchParams.set('image_url', imageUrl);
    containerUrl.searchParams.set('caption', caption);
    containerUrl.searchParams.set('access_token', accessToken);

    const containerResponse = await fetch(containerUrl.toString(), {
      method: 'POST',
    });

    const containerData: any = await containerResponse.json();

    if (!containerResponse.ok || !containerData?.id) {
      const errorMsg = containerData?.error?.message || 'Failed to create Instagram media container.';
      const errorCode = containerData?.error?.code;
      const errorSubcode = containerData?.error?.error_subcode;
      console.error(`[Instagram API] Container creation failed (code ${errorCode}, subcode ${errorSubcode}): ${errorMsg}`);
      return {
        status: 'failed',
        errorMessage: `Instagram API Error (${errorCode || 'unknown'}): ${errorMsg}`,
      };
    }

    const containerId = containerData.id;

    // ----------------------------------------------------
    // STEP 1b: Poll Container Status (wait until FINISHED)
    // ----------------------------------------------------
    let isReady = false;
    let attempts = 0;
    while (!isReady && attempts < 5) {
      attempts++;
      const statusUrl = `${BASE_URL}/${containerId}?fields=status_code&access_token=${accessToken}`;
      const statusRes = await fetch(statusUrl);
      if (statusRes.ok) {
        const statusJson: any = await statusRes.json();
        if (statusJson?.status_code === 'FINISHED') {
          isReady = true;
          break;
        } else if (statusJson?.status_code === 'ERROR') {
          return {
            status: 'failed',
            containerId,
            errorMessage: 'Instagram media container processing failed on Meta servers.',
          };
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    // ----------------------------------------------------
    // STEP 2: Publish the Media Container
    // POST /{ig-user-id}/media_publish or /me/media_publish
    // ----------------------------------------------------
    const publishUrl = new URL(`${BASE_URL}/${accountId}/media_publish`);
    publishUrl.searchParams.set('creation_id', containerId);
    publishUrl.searchParams.set('access_token', accessToken);

    const publishResponse = await fetch(publishUrl.toString(), {
      method: 'POST',
    });

    const publishData: any = await publishResponse.json();

    if (!publishResponse.ok || !publishData?.id) {
      const errorMsg = publishData?.error?.message || 'Failed to publish Instagram media container.';
      console.error(`[Instagram API] Media publish failed: ${errorMsg}`);
      return {
        status: 'failed',
        containerId,
        errorMessage: `Instagram Media Publish Error: ${errorMsg}`,
      };
    }

    const mediaId = publishData.id;

    // ----------------------------------------------------
    // STEP 3: Retrieve Permalink
    // GET /{media-id}?fields=id,permalink,timestamp
    // ----------------------------------------------------
    let permalink: string | undefined;
    try {
      const detailsUrl = `${BASE_URL}/${mediaId}?fields=id,permalink,timestamp&access_token=${accessToken}`;
      const detailsRes = await fetch(detailsUrl);
      if (detailsRes.ok) {
        const detailsJson: any = await detailsRes.json();
        permalink = detailsJson?.permalink;
      }
    } catch (detailsErr) {
      console.warn('[Instagram API] Could not fetch permalink for media:', detailsErr);
    }

    return {
      status: 'published',
      mediaId,
      permalink,
      containerId,
      publishedAt: new Date().toISOString(),
    };
  } catch (error: unknown) {
    const err = error as Error;
    console.error('[Instagram API] Unexpected error during Instagram publishing:', err?.message || err);
    return {
      status: 'failed',
      errorMessage: err?.message || 'Unexpected failure connecting to Meta Instagram Graph API.',
    };
  }
}
