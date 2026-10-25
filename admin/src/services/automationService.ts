import {
  collection,
  doc,
  getDoc,
  query,
  orderBy,
  limit,
  onSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from './firebase';

export interface InstagramPostRecord {
  id: string;
  runId: string;
  dateKey: string;
  productId: string;
  productName: string;
  productCategory: string;
  productPrice: number;
  productOriginalImage?: string;
  imageUrl: string;
  caption: string;
  hashtags: string[];
  fullInstagramText: string;
  status: 'published' | 'awaiting_credentials' | 'failed';
  providers: {
    llm: string;
    image: string;
    hosting: string;
    publishing: string;
  };
  instagramMediaId?: string;
  instagramPermalink?: string;
  instagramContainerId?: string;
  errorDetails?: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  retryCount: number;
  idempotencyKey: string;
  isManualTrigger?: boolean;
}

export interface AutomationSystemStatus {
  automationEnabled: boolean;
  schedule: {
    cron: string;
    humanSchedule: string;
    timezone: string;
  };
  currentDateKey: string;
  todayPublished: boolean;
  todayStatus: string;
  todayPostSummary: any;
  credentialsHealth: {
    geminiConfigured: boolean;
    groqConfigured: boolean;
    huggingFaceConfigured: boolean;
    cloudinaryConfigured: boolean;
    imgbbConfigured: boolean;
    instagramConfigured: boolean;
    instagramAccountId: string | null;
  };
  lastExecution: any;
}

const BACKEND_BASE_URL = import.meta.env.VITE_BACKEND_URL || 'https://califnco-backend.onrender.com';

/**
 * Subscribes in real-time to the 'instagram_posts' collection in Firestore
 */
export function subscribeToInstagramPosts(
  onData: (posts: InstagramPostRecord[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const postsRef = collection(db, 'instagram_posts');
  const q = query(postsRef, orderBy('startedAt', 'desc'), limit(30));

  return onSnapshot(
    q,
    (snapshot) => {
      const posts: InstagramPostRecord[] = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...(docSnap.data() as Omit<InstagramPostRecord, 'id'>),
      }));
      onData(posts);
    },
    (error) => {
      console.warn('Ordered instagram_posts subscription failed, trying fallback:', error);
      // Fallback query if startedAt index is building
      return onSnapshot(
        postsRef,
        (fallbackSnap) => {
          const fallbackPosts: InstagramPostRecord[] = fallbackSnap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<InstagramPostRecord, 'id'>),
          }));
          fallbackPosts.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
          onData(fallbackPosts);
        },
        (innerErr) => onError?.(innerErr as Error)
      );
    }
  );
}

/**
 * Subscribes to the 'automation_state/instagram_automation' doc
 */
export function subscribeToAutomationState(
  onData: (state: any) => void
): Unsubscribe {
  const stateDocRef = doc(db, 'automation_state', 'instagram_automation');
  return onSnapshot(stateDocRef, (snap) => {
    if (snap.exists()) {
      onData(snap.data());
    } else {
      onData(null);
    }
  });
}

/**
 * Fetches server-side automation health and credential status
 */
export async function fetchAutomationStatus(): Promise<AutomationSystemStatus> {
  try {
    const res = await fetch(`${BACKEND_BASE_URL}/api/automation/status`);
    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    console.warn('[Automation Service] Backend status unreachable, using Firestore fallback state:', err);
  }

  // Fallback status derived from Firestore directly
  const stateDoc = await getDoc(doc(db, 'automation_state', 'instagram_automation'));
  const stateData = stateDoc.exists() ? stateDoc.data() : null;

  return {
    automationEnabled: true,
    schedule: {
      cron: '0 10 * * *',
      humanSchedule: 'Once daily at 10:00 AM IST',
      timezone: 'Asia/Kolkata',
    },
    currentDateKey: new Date().toISOString().split('T')[0],
    todayPublished: stateData?.lastRunStatus === 'published',
    todayStatus: stateData?.lastRunStatus || 'scheduled_pending',
    todayPostSummary: null,
    credentialsHealth: {
      geminiConfigured: true,
      groqConfigured: false,
      huggingFaceConfigured: false,
      cloudinaryConfigured: false,
      imgbbConfigured: false,
      instagramConfigured: false,
      instagramAccountId: null,
    },
    lastExecution: stateData,
  };
}

/**
 * Triggers a manual test run of the AI Instagram publishing workflow
 */
export async function triggerManualAutomationRun(
  targetProductId?: string
): Promise<{ success: boolean; message: string; record?: InstagramPostRecord }> {
  try {
    const res = await fetch(`${BACKEND_BASE_URL}/api/automation/test-run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetProductId,
        force: true,
      }),
    });

    const data = await res.json().catch(() => null);

    if (res.ok && data?.record) {
      return {
        success: true,
        message: 'Automation test run completed successfully via backend pipeline.',
        record: data.record,
      };
    }

    const errorMsg = data?.error || `Backend returned HTTP status ${res.status}`;
    return {
      success: false,
      message: `Backend test run failed: ${errorMsg}`,
    };
  } catch (backendErr) {
    console.error('[Automation Service] Backend test run request failed:', backendErr);
    return {
      success: false,
      message: 'Backend automation service is unreachable. Please ensure the Render backend service is running.',
    };
  }
}

/**
 * Retries a failed or awaiting_credentials post execution record
 */
export async function retryPostExecution(
  postId: string
): Promise<{ success: boolean; message: string }> {
  try {
    const res = await fetch(`${BACKEND_BASE_URL}/api/automation/retry/${postId}`, {
      method: 'POST',
    });

    const data = await res.json().catch(() => null);

    if (res.ok) {
      return { success: true, message: 'Retry initiated successfully via backend pipeline.' };
    }

    const errorMsg = data?.error || `Backend returned HTTP status ${res.status}`;
    return {
      success: false,
      message: `Backend retry failed: ${errorMsg}`,
    };
  } catch (err) {
    console.error('[Automation Service] Backend retry request failed:', err);
    return {
      success: false,
      message: 'Backend retry service is unreachable. Please ensure the Render backend service is running.',
    };
  }
}
