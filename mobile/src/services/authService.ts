import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  onAuthStateChanged,
  type User,
} from 'firebase/auth';
import { auth } from './firebase';

export async function loginWithEmail(email: string, password: string): Promise<User> {
  try {
    const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
    return cred.user;
  } catch (error: unknown) {
    throw new Error(getFriendlyAuthErrorMessage(error));
  }
}

export async function registerWithEmail(email: string, password: string): Promise<User> {
  try {
    const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
    return cred.user;
  } catch (error: unknown) {
    throw new Error(getFriendlyAuthErrorMessage(error));
  }
}

export async function logoutUser(): Promise<void> {
  try {
    await signOut(auth);
  } catch (error: unknown) {
    throw new Error(getFriendlyAuthErrorMessage(error));
  }
}

export async function resetPassword(email: string): Promise<void> {
  try {
    await sendPasswordResetEmail(auth, email.trim());
  } catch (error: unknown) {
    throw new Error(getFriendlyAuthErrorMessage(error));
  }
}

export function subscribeToAuthState(callback: (user: User | null) => void): () => void {
  return onAuthStateChanged(auth, callback);
}

export function getFriendlyAuthErrorMessage(error: unknown): string {
  const err = error as { code?: string; message?: string };
  switch (err?.code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Invalid email or password. Please verify your credentials.';
    case 'auth/email-already-in-use':
      return 'An account with this email already exists. Please sign in instead.';
    case 'auth/weak-password':
      return 'Password should be at least 6 characters.';
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/network-request-failed':
      return 'Network connection issue. Please check your internet connection.';
    case 'auth/too-many-requests':
      return 'Access temporarily blocked due to multiple failed attempts. Please try again later.';
    default:
      return err?.message || 'Authentication failed. Please try again.';
  }
}
