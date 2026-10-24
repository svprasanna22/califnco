import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from 'firebase/firestore';
import { db } from './firebase';
import type { Dealer } from '../types/dealer';

const DEALERS_COLLECTION = 'dealers';

export interface DealerProfileResult {
  dealer: Dealer | null;
  status: 'verified_active' | 'pending_approval' | 'suspended' | 'unlinked' | 'not_found' | 'permission_denied';
  message: string;
}

/**
 * Retrieves the dealer profile associated with the authenticated user's Firebase UID.
 *
 * Security & Verification Rules:
 * 1. Checks for a verified, explicit relationship between Firebase Auth UID and dealer record:
 *    - Direct document key: `dealers/{userUid}`
 *    - Explicit UID field: `where('userId', '==', userUid)` or `where('uid', '==', userUid)`
 * 2. Never uses email alone as proof of dealer approval. If a record matches the email but
 *    lacks a verified UID link, it reports 'unlinked' and denies ordering privileges.
 * 3. Enforces account status:
 *    - Only 'active' grants dealer ordering privileges.
 *    - 'pending' or 'suspended' accounts are strictly restricted.
 * 4. Never performs client-side elevation or writes.
 */
export async function getVerifiedDealerProfile(
  userUid: string,
  userEmail?: string | null
): Promise<DealerProfileResult> {
  if (!userUid) {
    return {
      dealer: null,
      status: 'not_found',
      message: 'No authenticated user session provided.',
    };
  }

  try {
    // 1. Check if dealer document is keyed by user UID
    try {
      const directDocRef = doc(db, DEALERS_COLLECTION, userUid);
      const directSnap = await getDoc(directDocRef);
      if (directSnap.exists()) {
        const dealerData = {
          id: directSnap.id,
          ...(directSnap.data() as Omit<Dealer, 'id'>),
        };
        return evaluateDealerStatus(dealerData);
      }
    } catch (err: any) {
      if (err?.code === 'permission-denied') {
        return {
          dealer: null,
          status: 'permission_denied',
          message: 'Firestore security rules currently restrict mobile client access to dealer records. Awaiting dealer self-read security rule: allow read: if request.auth.uid == resource.data.userId;',
        };
      }
    }

    // 2. Query dealers collection by verified userId field
    try {
      const dealersRef = collection(db, DEALERS_COLLECTION);
      const qUserId = query(dealersRef, where('userId', '==', userUid));
      const snapUserId = await getDocs(qUserId);

      if (!snapUserId.empty) {
        const docSnap = snapUserId.docs[0];
        const dealerData = {
          id: docSnap.id,
          ...(docSnap.data() as Omit<Dealer, 'id'>),
        };
        return evaluateDealerStatus(dealerData);
      }

      // Also check alternate field 'uid' if present in existing records
      const qUid = query(dealersRef, where('uid', '==', userUid));
      const snapUid = await getDocs(qUid);

      if (!snapUid.empty) {
        const docSnap = snapUid.docs[0];
        const dealerData = {
          id: docSnap.id,
          ...(docSnap.data() as Omit<Dealer, 'id'>),
        };
        return evaluateDealerStatus(dealerData);
      }
    } catch (err: any) {
      if (err?.code === 'permission-denied') {
        return {
          dealer: null,
          status: 'permission_denied',
          message: 'Firestore security rules currently restrict mobile client access to dealer records. Awaiting dealer self-read security rule.',
        };
      }
      throw err;
    }

    // 3. Fallback verification: Check if an unlinked dealer document exists with this email
    // IMPORTANT: Email match ALONE is never accepted as proof of approval (Requirement 5).
    if (userEmail) {
      try {
        const dealersRef = collection(db, DEALERS_COLLECTION);
        const qEmail = query(dealersRef, where('email', '==', userEmail.trim().toLowerCase()));
        const snapEmail = await getDocs(qEmail);

        if (!snapEmail.empty) {
          const docSnap = snapEmail.docs[0];
          const rawData = docSnap.data() as Omit<Dealer, 'id'>;

          // If the record explicitly has a different userId, reject as mismatch
          if (rawData.userId && rawData.userId !== userUid) {
            return {
              dealer: null,
              status: 'unlinked',
              message: 'This email is registered to a dealer profile, but linked to a different Firebase UID. Please contact your Califnco administrator.',
            };
          }

          // If unlinked (userId missing), inform user that admin linking is required
          return {
            dealer: {
              id: docSnap.id,
              ...rawData,
            },
            status: 'unlinked',
            message: `Dealer profile found (${rawData.businessName}), but your Firebase UID (${userUid}) has not been linked by an administrator. Email alone cannot grant dealer access.`,
          };
        }
      } catch (err: any) {
        if (err?.code === 'permission-denied') {
          return {
            dealer: null,
            status: 'permission_denied',
            message: 'Firestore security rules currently restrict mobile client access to dealer records.',
          };
        }
      }
    }

    return {
      dealer: null,
      status: 'not_found',
      message: `No dealer record found for UID ${userUid}. Please contact Califnco administration to register your dealership.`,
    };
  } catch (error: any) {
    console.error('Error fetching dealer profile:', error);
    return {
      dealer: null,
      status: 'not_found',
      message: error?.message || 'Failed to verify dealer profile from Cloud Firestore.',
    };
  }
}

function evaluateDealerStatus(dealer: Dealer): DealerProfileResult {
  if (dealer.status === 'active') {
    return {
      dealer,
      status: 'verified_active',
      message: 'Verified Active Dealer.',
    };
  }

  if (dealer.status === 'pending') {
    return {
      dealer,
      status: 'pending_approval',
      message: 'Your dealer application is currently pending administrator verification. Ordering privileges are disabled.',
    };
  }

  if (dealer.status === 'suspended') {
    return {
      dealer,
      status: 'suspended',
      message: 'Your dealer account is currently suspended. Please contact Califnco corporate administration.',
    };
  }

  return {
    dealer,
    status: 'unlinked',
    message: `Account status is "${dealer.status}". Dealer privileges are not available.`,
  };
}
