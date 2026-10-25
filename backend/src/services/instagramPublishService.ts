import { config } from '../config';
import { isPublicHttpsUrl } from './imageHostingService';

export interface InstagramPublishResult {
  status: 'published' | 'awaiting_credentials' | 'failed' | 'publication_unknown';
  mediaId?: string;
  permalink?: string;
  containerId?: string;
  errorMessage?: string;
  publishedAt?: string;
  isMockOrDryRun?: boolean;
}

export interface InstagramReconciliationResult {
  reconciled: boolean;
  status: 'published' | 'publication_unknown';
  mediaId?: string;
  permalink?: string;
  errorMessage?: string;
  checkedAt: string;
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
  permissions?: string[];
  hasPublishPermission?: boolean;
  error?: string;
}

/**
 * Performs a read-only request to confirm Instagram currently accepts the access token
 * and checks content publishing permissions where supported by Meta.
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
    const response = await fetcher(verificationUrl.toString(), {
      method: 'GET',
      signal: AbortSignal.timeout(10000),
    });
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

    // Query permissions endpoint where supported (e.g. Meta Graph API / Facebook Login)
    let permissions: string[] | undefined;
    let hasPublishPermission = true;

    try {
      const permsUrl = new URL(`${baseUrl}/me/permissions`);
      permsUrl.searchParams.set('access_token', token);
      const permsRes = await fetcher(permsUrl.toString(), {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });

      if (permsRes.ok) {
        const permsData: any = await permsRes.json().catch(() => ({}));
        if (Array.isArray(permsData?.data)) {
          const allEntries = permsData.data;
          const grantedPermissions = allEntries
            .filter((p: any) => p.status === 'granted')
            .map((p: any) => String(p.permission));
          permissions = grantedPermissions;

          const hasPublish = grantedPermissions.some(
            (p: string) =>
              p.includes('content_publish') ||
              p.includes('publish_actions') ||
              p.includes('pages_manage_posts')
          );

          if (!hasPublish && allEntries.length > 0) {
            hasPublishPermission = false;
            return {
              valid: false,
              accountId: String(accountId),
              ...(typeof data?.username === 'string' ? { username: data.username } : {}),
              permissions: grantedPermissions,
              hasPublishPermission: false,
              error: `Token authenticated as @${data?.username || accountId}, but lacks content-publishing permission (granted: ${grantedPermissions.length > 0 ? grantedPermissions.join(', ') : 'none'}). Required: instagram_content_publish.`,
            };
          }
        }
      }
    } catch {
      // Non-fatal: Some token scopes do not expose /me/permissions.
      // Fallback gracefully to successful /me identity verification.
    }

    return {
      valid: true,
      accountId: String(accountId),
      ...(typeof data?.username === 'string' ? { username: data.username } : {}),
      ...(permissions ? { permissions } : {}),
      hasPublishPermission,
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
  baseUrl: string,
  fetcher: typeof fetch = fetch
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
    const res = await fetcher(meUrl);
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
  options: { isDryRun?: boolean } = {},
  fetcher: typeof fetch = fetch
): Promise<InstagramPublishResult> {
  // Guard 0: Absolute Public HTTPS Image URL Guard
  // Never attempt publishing (even simulated or dry-run) with a relative path or non-HTTPS URL
  if (!isPublicHttpsUrl(imageUrl)) {
    return {
      status: 'failed',
      errorMessage: `Publishing requires a valid public HTTPS image URL, received: "${imageUrl}".`,
    };
  }

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
  const accountId = await resolveInstagramAccountId(rawAccountId || 'me', accessToken, BASE_URL, fetcher);

  try {
    // ----------------------------------------------------
    // STEP 1: Create Media Container
    // POST /{ig-user-id}/media or /me/media
    // ----------------------------------------------------
    const containerUrl = new URL(`${BASE_URL}/${accountId}/media`);
    containerUrl.searchParams.set('image_url', imageUrl);
    containerUrl.searchParams.set('caption', caption);
    containerUrl.searchParams.set('access_token', accessToken);

    const containerResponse = await fetcher(containerUrl.toString(), {
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
      const statusRes = await fetcher(statusUrl);
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

    let publishResponse: Response;
    try {
      publishResponse = await fetcher(publishUrl.toString(), {
        method: 'POST',
        signal: AbortSignal.timeout(30000),
      });
    } catch (networkErr: unknown) {
      // Ambiguous timeout or network error after media_publish was dispatched to Meta
      console.error('[Instagram API] Ambiguous network timeout/error during media_publish:', networkErr);
      return {
        status: 'publication_unknown',
        containerId,
        errorMessage: `Ambiguous network error or timeout during media_publish: ${(networkErr as Error)?.message || networkErr}. The post may have been published on Instagram. Reconcile account media before retrying.`,
      };
    }

    // Check for 5xx Gateway / Ambiguous server responses from Meta
    if (publishResponse.status >= 500) {
      const errText = await publishResponse.text().catch(() => '');
      console.error(`[Instagram API] Ambiguous HTTP ${publishResponse.status} during media_publish: ${errText}`);
      return {
        status: 'publication_unknown',
        containerId,
        errorMessage: `Ambiguous HTTP ${publishResponse.status} response from Meta during media_publish. The post may have been published on Instagram. Reconcile account media before retrying.`,
      };
    }

    const publishData: any = await publishResponse.json().catch(() => ({}));

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
      const detailsRes = await fetcher(detailsUrl);
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
      permalink: permalink || `https://www.instagram.com/p/${mediaId}/`,
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

/**
 * Safely reconciles an ambiguous publication_unknown post with the Instagram account.
 * Queries recent account media to check if a post matching the caption was published.
 */
export async function reconcileInstagramPublication(
  expectedCaptionSnippet: string,
  fetcher: typeof fetch = fetch,
  minTimestampMs: number = Date.now() - 24 * 60 * 60 * 1000
): Promise<InstagramReconciliationResult> {
  const rawAccountId = config.instagramAccountId?.trim();
  const accessToken = config.instagramAccessToken?.trim();

  if (!accessToken) {
    return {
      reconciled: false,
      status: 'publication_unknown',
      errorMessage: 'Cannot reconcile: Instagram access token is not configured.',
      checkedAt: new Date().toISOString(),
    };
  }

  const BASE_URL = getInstagramApiBaseUrl(accessToken);

  try {
    const accountId = await resolveInstagramAccountId(rawAccountId || 'me', accessToken, BASE_URL, fetcher);
    const mediaListUrl = new URL(`${BASE_URL}/${accountId}/media`);
    mediaListUrl.searchParams.set('fields', 'id,caption,media_type,permalink,timestamp');
    mediaListUrl.searchParams.set('limit', '10');
    mediaListUrl.searchParams.set('access_token', accessToken);

    const response = await fetcher(mediaListUrl.toString(), {
      method: 'GET',
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      return {
        reconciled: false,
        status: 'publication_unknown',
        errorMessage: `Failed to query Instagram recent media (HTTP ${response.status}): ${errText}`,
        checkedAt: new Date().toISOString(),
      };
    }

    const data: any = await response.json().catch(() => ({}));
    const mediaItems: Array<{ id: string; caption?: string; permalink?: string; timestamp?: string }> = Array.isArray(data?.data) ? data.data : [];

    // Clean and normalize target snippet for comparison
    const targetSnippet = expectedCaptionSnippet.trim().toLowerCase().slice(0, 40);

    const matchingMedia = mediaItems.find((item) => {
      if (!item.caption) return false;

      // 1. Timestamp window check: must not precede minTimestampMs
      if (item.timestamp && minTimestampMs > 0) {
        const itemTimeMs = new Date(item.timestamp).getTime();
        if (!isNaN(itemTimeMs) && itemTimeMs < minTimestampMs) {
          return false;
        }
      }

      // 2. Strict unidirectional containment: item caption must contain target snippet
      const itemCaption = item.caption.toLowerCase();
      return itemCaption.includes(targetSnippet);
    });

    if (matchingMedia) {
      return {
        reconciled: true,
        status: 'published',
        mediaId: matchingMedia.id,
        permalink: matchingMedia.permalink || `https://www.instagram.com/p/${matchingMedia.id}/`,
        checkedAt: new Date().toISOString(),
      };
    }

    return {
      reconciled: false,
      status: 'publication_unknown',
      errorMessage: 'No matching post found in recent Instagram media. Status remains ambiguous. Manual confirmation on @califnco.water required before retrying.',
      checkedAt: new Date().toISOString(),
    };
  } catch (err: unknown) {
    return {
      reconciled: false,
      status: 'publication_unknown',
      errorMessage: `Reconciliation network failure: ${(err as Error)?.message || err}. Fails closed.`,
      checkedAt: new Date().toISOString(),
    };
  }
}
