import { auth, isConfigured } from './config';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  User,
  UserCredential,
  Unsubscribe,
} from 'firebase/auth';

/**
 * Sign in with email and password
 */
export async function loginWithEmail(email: string, pass: string): Promise<UserCredential> {
  if (!isConfigured || !auth) throw new Error('Firebase not configured');
  return signInWithEmailAndPassword(auth, email, pass);
}

/**
 * Register / Create new user with email and password
 */
export async function registerWithEmail(email: string, pass: string): Promise<UserCredential> {
  if (!isConfigured || !auth) throw new Error('Firebase not configured');
  return createUserWithEmailAndPassword(auth, email, pass);
}

/**
 * Sign out the current user
 */
export async function logout(): Promise<void> {
  if (!isConfigured || !auth) return;
  return signOut(auth);
}

/**
 * Listen for auth state changes
 */
export function onAuthChange(callback: (user: User | null) => void): Unsubscribe {
  if (!isConfigured || !auth) return () => {};
  return onAuthStateChanged(auth, callback);
}

export { auth };
