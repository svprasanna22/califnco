import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  type User,
  type Unsubscribe,
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from './firebase';

export interface AdminRoleStatus {
  isAdmin: boolean;
  source: 'custom_claim' | 'firestore_admin_doc' | 'none';
  message?: string;
}

/**
 * Checks if the authenticated user has verified administrator authorization.
 *
 * Security Model:
 * 1. Checks Firebase Auth Custom Claims (set exclusively by backend/admin SDK, e.g., claims.admin === true).
 * 2. Fallback: Checks server-protected Firestore collection `admins/{uid}` where document exists with role === 'admin'
 *    and active !== false.
 *
 * Under no circumstances can client users self-assign admin status.
 */
export async function verifyAdminAuthorization(user: User): Promise<AdminRoleStatus> {
  try {
    // 1. Check custom user claims via ID token
    const tokenResult = await user.getIdTokenResult(true);
    if (tokenResult.claims.admin === true || tokenResult.claims.role === 'admin') {
      return {
        isAdmin: true,
        source: 'custom_claim',
        message: 'Authorized via Firebase Auth custom claim.',
      };
    }

    // 2. Check server-controlled Firestore admins collection
    const adminDocRef = doc(db, 'admins', user.uid);
    const adminSnapshot = await getDoc(adminDocRef);

    if (adminSnapshot.exists()) {
      const data = adminSnapshot.data();
      if (data?.role === 'admin' && data?.active === true) {
        return {
          isAdmin: true,
          source: 'firestore_admin_doc',
          message: 'Authorized via Firestore admins collection record.',
        };
      }
    }

    return {
      isAdmin: false,
      source: 'none',
      message: 'This account does not have administrator privileges assigned.',
    };
  } catch (err: unknown) {
    console.error('Error verifying admin authorization:', err);
    return {
      isAdmin: false,
      source: 'none',
      message: 'Failed to verify administrative authorization.',
    };
  }
}

/**
 * Signs in using Firebase Email & Password authentication
 */
export async function loginWithEmail(email: string, password: string): Promise<User> {
  const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
  return credential.user;
}

/**
 * Signs out current user
 */
export async function logoutUser(): Promise<void> {
  await signOut(auth);
}

/**
 * Subscribes to Firebase auth state changes
 */
export function subscribeToAuthState(callback: (user: User | null) => void): Unsubscribe {
  return onAuthStateChanged(auth, callback);
}

/**
 * Maps Firebase Auth error codes to friendly, actionable messages
 */
export function getFriendlyAuthErrorMessage(errorCode: string): string {
  switch (errorCode) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Invalid email or password. Please check your credentials and try again.';
    case 'auth/invalid-email':
      return 'Please enter a valid email address (e.g., admin@califnco.com).';
    case 'auth/user-disabled':
      return 'This administrator account has been disabled. Please contact system support.';
    case 'auth/too-many-requests':
      return 'Too many failed login attempts. Access is temporarily blocked. Please wait a few minutes.';
    case 'auth/network-request-failed':
      return 'Network connection failed. Please check your internet connectivity.';
    case 'auth/operation-not-allowed':
      return 'Email/Password sign-in is not enabled in Firebase Authentication.';
    default:
      return 'An unexpected error occurred during authentication. Please try again.';
  }
}

/**
 * Sends a password reset email via Firebase Authentication
 */
export async function sendResetPasswordEmail(email: string): Promise<void> {
  await sendPasswordResetEmail(auth, email.trim());
}

/**
 * Maps password reset error codes to actionable messages
 */
export function getFriendlyResetErrorMessage(errorCode: string): string {
  switch (errorCode) {
    case 'auth/user-not-found':
      return 'No administrator account found with this email address. Please verify with your system administrator.';
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/missing-email':
      return 'Please enter your administrator email address.';
    case 'auth/too-many-requests':
      return 'Too many password reset requests. Please wait a few moments before trying again.';
    case 'auth/network-request-failed':
      return 'Network connection failed. Please check your internet connectivity.';
    default:
      return 'Failed to send password reset email. Please try again.';
  }
}

